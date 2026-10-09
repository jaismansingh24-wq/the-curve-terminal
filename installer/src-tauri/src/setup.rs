// What setup actually does, step by step, reporting real progress as it
// goes. It installs for the current user only (no administrator prompt):
//
//   <folder>\The Curve Terminal.exe     the app
//   <folder>\README.txt                 what it is, where it keeps things
//   <folder>\uninstall.exe              this program, to remove it later
//   Start menu and desktop shortcuts    as chosen
//   HKCU\...\Uninstall\TheCurveTerminal so Windows lists it in Installed apps
//   HKCU\...\Run, TheCurveTerminal      only if "open when Windows starts"
//
// Removing undoes exactly that list, file by file. It never deletes a whole
// folder it did not create, and deletes the reader's settings only when
// they tick the box that says so.

use std::fs;
use std::io::{self, Write};
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};
use winreg::enums::HKEY_CURRENT_USER;
use winreg::RegKey;

use crate::payload;

const APP_NAME: &str = "The Curve Terminal";
const APP_ID: &str = "in.thecurve.terminal";
const EXE_NAME: &str = "The Curve Terminal.exe";
const UNINSTALLER: &str = "uninstall.exe";
const README: &str = "README.txt";
const README_TEXT: &str = include_str!("../../../assets/README.txt");
const PUBLISHER: &str = "The Curve by s7ven";
const UNINSTALL_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Uninstall\TheCurveTerminal";
const RUN_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
const RUN_NAME: &str = "TheCurveTerminal";

/// The clean-up after setup closes runs in a hidden console. (Detaching it
/// from any console instead made Windows open a visible one for the short
/// wait inside it, which is the window people saw flash up.)
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

pub struct State {
    uninstall: bool,
    scratch: PathBuf,
    installed: Mutex<Option<PathBuf>>,
    removed: Mutex<Option<PathBuf>>,
}

impl State {
    pub fn new(uninstall: bool, scratch: PathBuf) -> Self {
        Self { uninstall, scratch, installed: Mutex::new(None), removed: Mutex::new(None) }
    }
}

pub fn is_uninstaller() -> bool {
    std::env::args().any(|a| a == "--uninstall")
        || std::env::current_exe()
            .ok()
            .and_then(|p| p.file_name().map(|n| n.to_string_lossy().eq_ignore_ascii_case(UNINSTALLER)))
            .unwrap_or(false)
}

fn hkcu() -> RegKey {
    RegKey::predef(HKEY_CURRENT_USER)
}

/// Where Windows says the app is installed, if it is.
fn existing_install() -> Option<PathBuf> {
    let dir: String = hkcu().open_subkey(UNINSTALL_KEY).ok()?.get_value("InstallLocation").ok()?;
    let dir = PathBuf::from(dir);
    if dir.join(EXE_NAME).exists() || dir.join(UNINSTALLER).exists() { Some(dir) } else { None }
}

fn startup_on() -> bool {
    hkcu().open_subkey(RUN_KEY).and_then(|k| k.get_value::<String, _>(RUN_NAME)).is_ok()
}

fn default_dir(app: &AppHandle) -> PathBuf {
    app.path()
        .local_data_dir()
        .map(|d| d.join("Programs").join(APP_NAME))
        .unwrap_or_else(|_| PathBuf::from(r"C:\").join(APP_NAME))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SetupInfo {
    mode: &'static str,
    version: String,
    default_dir: String,
    existing_dir: Option<String>,
    has_app: bool,
    app_size: u64,
    startup_on: bool,
}

#[tauri::command]
pub fn setup_info(app: AppHandle, state: tauri::State<'_, State>) -> SetupInfo {
    let existing = existing_install();
    let mode = if state.uninstall {
        "uninstall"
    } else if existing.is_some() {
        "update"
    } else {
        "install"
    };
    SetupInfo {
        mode,
        version: app.package_info().version.to_string(),
        default_dir: default_dir(&app).display().to_string(),
        existing_dir: existing.map(|d| d.display().to_string()),
        has_app: payload::HAS_APP,
        app_size: payload::APP.len() as u64,
        startup_on: startup_on(),
    }
}

/// The folder picker. Whatever folder is picked, the app goes in its own
/// "The Curve Terminal" folder inside it, never loose among other files.
#[tauri::command]
pub async fn pick_folder(app: AppHandle, current: String) -> Option<String> {
    use tauri_plugin_dialog::DialogExt;
    let start = Path::new(&current)
        .ancestors()
        .find(|p| p.is_dir())
        .map(Path::to_path_buf)
        .unwrap_or_else(|| default_dir(&app));
    let picked = app
        .dialog()
        .file()
        .set_title("Choose where to install The Curve Terminal")
        .set_directory(start)
        .blocking_pick_folder()?;
    let p = picked.into_path().ok()?;
    let named = p.file_name().map(|n| n.to_string_lossy().eq_ignore_ascii_case(APP_NAME)).unwrap_or(false);
    Some(if named { p } else { p.join(APP_NAME) }.display().to_string())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Options {
    dir: String,
    desktop: bool,
    start_menu: bool,
    startup: bool,
}

#[derive(Serialize, Clone)]
struct Progress {
    step: &'static str,
    fraction: f64,
    done: u64,
    total: u64,
}

fn report(app: &AppHandle, step: &'static str, fraction: f64, done: u64, total: u64) {
    let _ = app.emit("setup-progress", Progress { step, fraction, done, total });
}

/// Turn an IO error into a sentence that says what to do next.
fn plain(dir: &Path, e: io::Error) -> String {
    match e.kind() {
        io::ErrorKind::PermissionDenied => format!(
            "Windows would not let setup write to {}. That folder needs administrator rights. \
             Choose a folder in your own user space, or run setup as administrator.",
            dir.display()
        ),
        _ => format!("Setup could not write to {}: {}.", dir.display(), e),
    }
}

/// An open app holds its own file. Say so before touching anything.
fn in_use(exe: &Path) -> bool {
    exe.exists() && fs::OpenOptions::new().write(true).open(exe).is_err()
}

fn start_menu_link(app: &AppHandle) -> Option<PathBuf> {
    app.path()
        .data_dir()
        .ok()
        .map(|d| d.join(r"Microsoft\Windows\Start Menu\Programs").join(format!("{APP_NAME}.lnk")))
}

fn desktop_link(app: &AppHandle) -> Option<PathBuf> {
    app.path().desktop_dir().ok().map(|d| d.join(format!("{APP_NAME}.lnk")))
}

fn make_link(target: &Path, dir: &Path, at: &Path) -> Result<(), String> {
    let mut link = mslnk::ShellLink::new(target).map_err(|e| e.to_string())?;
    link.set_working_dir(Some(dir.display().to_string()));
    link.set_icon_location(Some(target.display().to_string()));
    link.create_lnk(at).map_err(|e| e.to_string())
}

fn set_startup(exe: &Path, on: bool) -> Result<(), String> {
    let (key, _) = hkcu().create_subkey(RUN_KEY).map_err(|e| e.to_string())?;
    if on {
        key.set_value(RUN_NAME, &format!("\"{}\" --autostart", exe.display())).map_err(|e| e.to_string())
    } else {
        match key.delete_value(RUN_NAME) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(e.to_string()),
        }
    }
}

fn register(app: &AppHandle, dir: &Path, exe: &Path, uninstaller: &Path, size: u64) -> Result<(), String> {
    let (k, _) = hkcu().create_subkey(UNINSTALL_KEY).map_err(|e| e.to_string())?;
    let version = app.package_info().version.to_string();
    let put = |name: &str, value: &str| k.set_value(name, &value).map_err(|e| e.to_string());
    put("DisplayName", APP_NAME)?;
    put("DisplayVersion", &version)?;
    put("Publisher", PUBLISHER)?;
    put("DisplayIcon", &format!("{},0", exe.display()))?;
    put("InstallLocation", &dir.display().to_string())?;
    put("UninstallString", &format!("\"{}\"", uninstaller.display()))?;
    put("URLInfoAbout", "https://thecurve.in")?;
    k.set_value("NoModify", &1u32).map_err(|e| e.to_string())?;
    k.set_value("NoRepair", &1u32).map_err(|e| e.to_string())?;
    k.set_value("EstimatedSize", &((size / 1024) as u32 + 64)).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn install(app: AppHandle, opts: Options) -> Result<String, String> {
    let a = app.clone();
    tauri::async_runtime::spawn_blocking(move || run_install(&a, opts))
        .await
        .map_err(|e| e.to_string())?
}

fn run_install(app: &AppHandle, o: Options) -> Result<String, String> {
    if !payload::HAS_APP {
        return Err("This copy of setup has no app inside it. It is a development build; \
                    the full setup is made with npm run release."
            .into());
    }
    let dir = PathBuf::from(o.dir.trim());
    if !dir.is_absolute() {
        return Err("Choose a full folder path, starting with a drive letter.".into());
    }

    // The work itself takes well under a second, too quick to see. It is
    // paced to about five seconds so each step can be read. The bar still
    // only ever shows work that has really been done: the copying is slowed,
    // not the bar.
    let t0 = Instant::now();
    let hold = |ms: u64| {
        let at = t0 + Duration::from_millis(ms);
        let now = Instant::now();
        if at > now {
            std::thread::sleep(at - now);
        }
    };

    report(app, "Preparing the folder", 0.02, 0, 0);
    fs::create_dir_all(&dir).map_err(|e| plain(&dir, e))?;
    let exe = dir.join(EXE_NAME);
    if in_use(&exe) {
        return Err("The Curve Terminal is open. Close it, then press Try again.".into());
    }
    hold(350);

    // the app itself, written in chunks so the bar shows real bytes
    let total = payload::APP.len() as u64;
    let partial = dir.join(format!("{EXE_NAME}.partial"));
    {
        let mut f = fs::File::create(&partial).map_err(|e| plain(&dir, e))?;
        let mut done = 0u64;
        for chunk in payload::APP.chunks(96 * 1024) {
            f.write_all(chunk).map_err(|e| plain(&dir, e))?;
            done += chunk.len() as u64;
            let share = done as f64 / total as f64;
            report(app, "Copying the app", 0.04 + 0.76 * share, done, total);
            hold(350 + (share * 3000.0) as u64);
        }
        f.sync_all().map_err(|e| plain(&dir, e))?;
    }
    if exe.exists() {
        fs::remove_file(&exe).map_err(|e| plain(&dir, e))?;
    }
    fs::rename(&partial, &exe).map_err(|e| plain(&dir, e))?;

    report(app, "Writing the readme", 0.83, total, total);
    fs::write(dir.join(README), README_TEXT.replace("\r\n", "\n").replace('\n', "\r\n")).map_err(|e| plain(&dir, e))?;
    hold(3700);

    report(app, "Adding the uninstaller", 0.87, total, total);
    let uninstaller = dir.join(UNINSTALLER);
    let me = std::env::current_exe().map_err(|e| e.to_string())?;
    if !me.eq(&uninstaller) {
        fs::copy(&me, &uninstaller).map_err(|e| plain(&dir, e))?;
    }
    hold(4050);

    report(app, "Adding shortcuts", 0.91, total, total);
    for (want, at) in [(o.start_menu, start_menu_link(app)), (o.desktop, desktop_link(app))] {
        let Some(at) = at else { continue };
        if want {
            if let Some(parent) = at.parent() {
                let _ = fs::create_dir_all(parent);
            }
            make_link(&exe, &dir, &at)?;
        } else if at.exists() {
            let _ = fs::remove_file(&at);
        }
    }

    hold(4450);

    report(app, "Registering with Windows", 0.95, total, total);
    register(app, &dir, &exe, &uninstaller, total)?;
    set_startup(&exe, o.startup)?;
    hold(4950);

    report(app, "Installed", 1.0, total, total);
    if let Ok(mut g) = app.state::<State>().installed.lock() {
        *g = Some(dir.clone());
    }
    Ok(dir.display().to_string())
}

#[tauri::command]
pub async fn uninstall(app: AppHandle, remove_data: bool) -> Result<(), String> {
    let a = app.clone();
    tauri::async_runtime::spawn_blocking(move || run_uninstall(&a, remove_data))
        .await
        .map_err(|e| e.to_string())?
}

fn run_uninstall(app: &AppHandle, remove_data: bool) -> Result<(), String> {
    let here = std::env::current_exe().ok().and_then(|p| p.parent().map(Path::to_path_buf));
    let dir = existing_install()
        .or(here)
        .ok_or_else(|| "Setup could not find where The Curve Terminal is installed.".to_string())?;
    let exe = dir.join(EXE_NAME);
    if in_use(&exe) {
        return Err("The Curve Terminal is open. Close it, then press Try again.".into());
    }

    report(app, "Removing the startup entry", 0.15, 0, 0);
    set_startup(&exe, false)?;

    report(app, "Removing shortcuts", 0.35, 0, 0);
    for at in [start_menu_link(app), desktop_link(app)].into_iter().flatten() {
        if at.exists() {
            let _ = fs::remove_file(&at);
        }
    }

    report(app, "Removing the app", 0.6, 0, 0);
    for name in [EXE_NAME, README] {
        let p = dir.join(name);
        if p.exists() {
            fs::remove_file(&p).map_err(|e| plain(&dir, e))?;
        }
    }

    if remove_data {
        report(app, "Deleting your settings", 0.8, 0, 0);
        let mut places = Vec::new();
        if let Ok(d) = app.path().local_data_dir() {
            places.push(d.join(APP_ID));
        }
        if let Ok(d) = app.path().data_dir() {
            places.push(d.join(APP_ID));
        }
        for p in places {
            if p.exists() {
                fs::remove_dir_all(&p).map_err(|e| format!("Could not delete {}: {}.", p.display(), e))?;
            }
        }
    }

    report(app, "Unregistering from Windows", 0.95, 0, 0);
    match hkcu().delete_subkey_all(UNINSTALL_KEY) {
        Ok(()) => {}
        Err(e) if e.kind() == io::ErrorKind::NotFound => {}
        Err(e) => return Err(e.to_string()),
    }

    report(app, "Removed", 1.0, 0, 0);
    if let Ok(mut g) = app.state::<State>().removed.lock() {
        *g = Some(dir);
    }
    Ok(())
}

/// The last button: open the readme and the app if asked, then close.
#[tauri::command]
pub fn finish(app: AppHandle, state: tauri::State<'_, State>, launch: bool, readme: bool) -> Result<(), String> {
    let dir = state.installed.lock().ok().and_then(|g| g.clone());
    if let Some(dir) = dir {
        if readme {
            use tauri_plugin_opener::OpenerExt;
            let _ = app.opener().open_path(dir.join(README).display().to_string(), None::<&str>);
        }
        if launch {
            std::process::Command::new(dir.join(EXE_NAME))
                .current_dir(&dir)
                .spawn()
                .map_err(|e| format!("The app did not start: {e}."))?;
        }
    }
    app.exit(0);
    Ok(())
}

#[tauri::command]
pub fn quit(app: AppHandle) {
    app.exit(0);
}

/// After setup closes: remove its own temporary browser data and, after an
/// uninstall, the uninstaller and the now-empty folder. A short wait lets
/// this process end first. Only paths setup made are touched; the folder is
/// removed with a plain rmdir, which refuses if anything else is still in it.
pub fn cleanup_on_exit(app: &AppHandle) {
    let state = app.state::<State>();
    let mut script = String::from("ping 127.0.0.1 -n 4 > nul");
    script.push_str(&format!(" & rmdir /s /q \"{}\"", state.scratch.display()));
    if let Some(dir) = state.removed.lock().ok().and_then(|g| g.clone()) {
        script.push_str(&format!(" & del /f /q \"{}\"", dir.join(UNINSTALLER).display()));
        script.push_str(&format!(" & rmdir \"{}\"", dir.display()));
    }
    let _ = std::process::Command::new("cmd")
        .args(["/D", "/S", "/C"])
        .raw_arg(format!("\"{script}\""))
        .current_dir(std::env::temp_dir())
        .creation_flags(CREATE_NO_WINDOW)
        .spawn();
}

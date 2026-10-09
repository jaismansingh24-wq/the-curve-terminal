// The journal file. One JSON file in the app's own data folder, written
// whole on every save: first to a temporary file, then moved into place, with
// the previous version kept beside it. A save that is not valid JSON is
// refused, so a fault elsewhere can never blank the journal.
//
//   %LOCALAPPDATA%\in.thecurve.terminal\journal.json       the entries
//   %LOCALAPPDATA%\in.thecurve.terminal\journal.bak.json   the version before the last save

use std::fs;
use std::io::Write;
use std::path::PathBuf;

use tauri::{AppHandle, Manager};

/// Started with --test (scripts/snap.mjs): a separate file, so testing the
/// app never touches the reader's real journal.
pub struct Files {
    pub testing: bool,
}

fn names(app: &AppHandle) -> (&'static str, &'static str, &'static str) {
    if app.state::<Files>().testing {
        ("journal.test.json", "journal.test.bak.json", "journal.test.json.tmp")
    } else {
        ("journal.json", "journal.bak.json", "journal.json.tmp")
    }
}

fn folder(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

#[tauri::command]
pub async fn journal_read(app: AppHandle) -> Result<String, String> {
    let (file, _, _) = names(&app);
    let path = folder(&app)?.join(file);
    if !path.exists() {
        return Ok("[]".into());
    }
    fs::read_to_string(&path).map_err(|e| format!("The journal file could not be read: {e}."))
}

#[tauri::command]
pub async fn journal_write(app: AppHandle, json: String) -> Result<(), String> {
    serde_json::from_str::<serde_json::Value>(&json)
        .map_err(|_| "That save was not valid, so the journal was left as it was.".to_string())?;
    let dir = folder(&app)?;
    let (file, backup, tmp) = names(&app);
    let (path, temp) = (dir.join(file), dir.join(tmp));
    {
        let mut f = fs::File::create(&temp).map_err(|e| format!("The journal could not be saved: {e}."))?;
        f.write_all(json.as_bytes()).map_err(|e| format!("The journal could not be saved: {e}."))?;
        f.sync_all().map_err(|e| format!("The journal could not be saved: {e}."))?;
    }
    if path.exists() {
        let _ = fs::copy(&path, dir.join(backup));
    }
    fs::rename(&temp, &path).map_err(|e| format!("The journal could not be saved: {e}."))
}

/// Show the journal file in File Explorer, for backups.
#[tauri::command]
pub fn journal_reveal(app: AppHandle) -> Result<(), String> {
    let dir = folder(&app)?;
    let file = dir.join(names(&app).0);
    let target = if file.exists() { file } else { dir };
    tauri_plugin_opener::reveal_item_in_dir(target).map_err(|e| e.to_string())
}

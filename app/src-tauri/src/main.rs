// The Curve Terminal: the native side. It owns the window, the Discord
// status, the startup entry in the Windows registry and the fixed list of
// outside links. Everything the reader sees is drawn by the interface in ui/.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod journal;
mod links;
mod presence;
mod startup;

use std::time::Duration;
use tauri::Manager;

#[derive(serde::Serialize)]
struct AppInfo {
    version: String,
    data_dir: String,
}

/// The app's version, and its own data folder (made here if it is missing).
/// This is one of the real start-up steps the loading bar shows.
#[tauri::command]
fn app_info(app: tauri::AppHandle) -> Result<AppInfo, String> {
    let dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(AppInfo {
        version: app.package_info().version.to_string(),
        data_dir: dir.display().to_string(),
    })
}

fn main() {
    tauri::Builder::default()
        // a second launch brings the open window forward instead
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let handle = app.handle().clone();
            let testing = std::env::args().any(|a| a == "--test");
            app.manage(journal::Files { testing });
            app.manage(presence::Presence::spawn(handle.clone(), testing));

            // The window starts hidden so it never flashes white; the
            // interface shows it on its first frame. If that never comes,
            // show it anyway rather than leave the reader with nothing.
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_millis(3000));
                if let Some(w) = handle.get_webview_window("main") {
                    if !w.is_visible().unwrap_or(true) {
                        let _ = w.show();
                    }
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_info,
            journal::journal_read,
            journal::journal_write,
            journal::journal_reveal,
            links::open_link,
            presence::presence_set,
            startup::startup_get,
            startup::startup_set,
        ])
        .build(tauri::generate_context!())
        .expect("The Curve Terminal could not start")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                // clear the Discord status on the way out
                app.state::<presence::Presence>().shutdown();
            }
        });
}

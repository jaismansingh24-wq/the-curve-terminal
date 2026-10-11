// The Curve Terminal: the native side. It owns the window, the Discord
// status, the startup entry in the Windows registry, the fixed list of
// outside links, and the fetching of The Backdrop's public data.
// Everything the reader sees is drawn by the interface in ui/.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod backdrop;
mod folio;
mod journal;
mod links;
mod presence;
mod startup;

use std::time::Duration;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

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
    // --test (scripts/snap.mjs): a copy for checking the app, which runs
    // beside the reader's own if it is open. It keeps Discord off, uses its
    // own journal file, and keeps its window data apart, so it never
    // touches the reader's copy.
    let testing = std::env::args().any(|a| a == "--test");

    let mut builder = tauri::Builder::default();
    if !testing {
        // a second launch brings the open window forward instead
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.show();
                let _ = w.set_focus();
            }
        }));
    }
    builder
        .plugin(tauri_plugin_opener::init())
        .setup(move |app| {
            let handle = app.handle().clone();
            app.manage(journal::Files { testing });
            app.manage(backdrop::Cache { testing });
            app.manage(folio::Folio { testing });
            app.manage(presence::Presence::spawn(handle.clone(), testing));

            let mut window = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("The Curve Terminal")
                .inner_size(1280.0, 820.0)
                .min_inner_size(760.0, 540.0)
                .center()
                .resizable(true)
                .decorations(false)
                .shadow(true)
                .visible(false)
                .background_color(tauri::window::Color(10, 12, 16, 255))
                .disable_drag_drop_handler()
                .zoom_hotkeys_enabled(false);
            if testing {
                let dir = app.path().app_local_data_dir()?.join("test-window");
                window = window.data_directory(dir);
            }
            window.build()?;

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
            links::open_source,
            backdrop::backdrop_get,
            backdrop::backdrop_clear,
            folio::folio_read,
            folio::folio_write,
            folio::folio_image_save,
            folio::folio_image_read,
            folio::folio_images_prune,
            folio::folio_reveal,
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

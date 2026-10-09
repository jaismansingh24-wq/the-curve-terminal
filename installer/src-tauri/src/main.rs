// The Curve Terminal Setup. One program, two jobs: run as setup.exe it
// installs the app; copied into the install folder as uninstall.exe (or
// started with --uninstall) it removes it again. Its window is drawn by the
// interface in installer/ui, in the same materials as the app.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod payload {
    include!(concat!(env!("OUT_DIR"), "/payload.rs"));
}
mod setup;
mod webview2;

use tauri::{WebviewUrl, WebviewWindowBuilder};

fn main() {
    // Setup's window needs Microsoft Edge WebView2, part of Windows 11 and
    // of any up-to-date Windows 10. If it is missing, say so plainly.
    if !webview2::present() {
        webview2::explain_missing();
        return;
    }

    let uninstall = setup::is_uninstaller();
    // setup's own browser data goes in a temporary folder, removed on exit
    let scratch = std::env::temp_dir().join(format!("thecurve-setup-{}", std::process::id()));

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(setup::State::new(uninstall, scratch.clone()))
        .setup(move |app| {
            let title = if uninstall { "Remove The Curve Terminal" } else { "The Curve Terminal Setup" };
            WebviewWindowBuilder::new(app, "setup", WebviewUrl::App("index.html".into()))
                .title(title)
                .inner_size(880.0, 560.0)
                .resizable(false)
                .maximizable(false)
                .decorations(false)
                .shadow(true)
                .center()
                .visible(false)
                .background_color(tauri::window::Color(10, 12, 16, 255))
                .data_directory(scratch.clone())
                .build()?;

            // shown by the interface on its first frame; shown anyway if not
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(3000));
                if let Some(w) = tauri::Manager::get_webview_window(&handle, "setup") {
                    if !w.is_visible().unwrap_or(true) {
                        let _ = w.show();
                    }
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            setup::setup_info,
            setup::pick_folder,
            setup::install,
            setup::uninstall,
            setup::finish,
            setup::quit,
        ])
        .build(tauri::generate_context!())
        .expect("Setup could not start")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                setup::cleanup_on_exit(app);
            }
        });
}

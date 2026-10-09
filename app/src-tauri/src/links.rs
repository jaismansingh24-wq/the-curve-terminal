// Outside links, from a fixed list. The interface asks for a link by name,
// never by address, so nothing it shows can be made to open anywhere else.

use tauri_plugin_opener::OpenerExt;

fn address(which: &str) -> Option<&'static str> {
    match which {
        "site" => Some("https://thecurve.in"),
        "discord" => Some("https://discord.gg/RKpuDyf2b"),
        _ => None,
    }
}

#[tauri::command]
pub fn open_link(app: tauri::AppHandle, which: String) -> Result<(), String> {
    let url = address(&which).ok_or_else(|| format!("No link called {which}"))?;
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| e.to_string())
}

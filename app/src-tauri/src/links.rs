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

/// The hosts whose pages The Backdrop may open: the publishers of its data.
/// An address from a fetched feed (a Fed press release, say) opens only if
/// it is https and on one of these, so a feed cannot send the reader
/// anywhere else.
const SOURCE_HOSTS: [&str; 10] = [
    "federalreserve.gov",
    "home.treasury.gov",
    "fiscaldata.treasury.gov",
    "treasurydirect.gov",
    "newyorkfed.org",
    "cftc.gov",
    "ecb.europa.eu",
    "eia.gov",
    "bls.gov",
    "bea.gov",
];

fn source_allowed(url: &str) -> bool {
    let Some(rest) = url.strip_prefix("https://") else { return false };
    let host = rest.split(['/', '?', '#']).next().unwrap_or("").to_ascii_lowercase();
    if host.is_empty() || host.contains(['@', ':', ' ', '\\']) || url.chars().any(|c| c.is_whitespace() || c.is_control()) {
        return false;
    }
    SOURCE_HOSTS.iter().any(|h| host == *h || host.ends_with(&format!(".{h}")))
}

#[tauri::command]
pub fn open_source(app: tauri::AppHandle, url: String) -> Result<(), String> {
    if !source_allowed(&url) {
        return Err("That address is not one of The Backdrop's sources.".into());
    }
    app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())
}

// The Folio: research pages, in one JSON file beside the journal, written
// the same careful way (to a temporary file, then moved into place, with the
// version before kept as a backup). Screenshots on pages are kept as image
// files in their own folder, named by an id the page refers to.
//
//   %LOCALAPPDATA%\in.thecurve.terminal\folio.json        the pages
//   %LOCALAPPDATA%\in.thecurve.terminal\folio.bak.json    the version before the last save
//   %LOCALAPPDATA%\in.thecurve.terminal\folio-images\     screenshots, as .webp files

use std::fs;
use std::io::Write;
use std::path::PathBuf;

use base64::Engine;
use tauri::{AppHandle, Manager};

/// Started with --test: a separate file and image folder.
pub struct Folio {
    pub testing: bool,
}

const MAX_IMAGE: usize = 12 * 1024 * 1024;

fn dir(app: &AppHandle) -> Result<PathBuf, String> {
    let d = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    Ok(d)
}

fn names(app: &AppHandle) -> (&'static str, &'static str, &'static str, &'static str) {
    if app.state::<Folio>().testing {
        ("folio.test.json", "folio.test.bak.json", "folio.test.json.tmp", "folio-images.test")
    } else {
        ("folio.json", "folio.bak.json", "folio.json.tmp", "folio-images")
    }
}

fn images(app: &AppHandle) -> Result<PathBuf, String> {
    let d = dir(app)?.join(names(app).3);
    fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    Ok(d)
}

/// An image id is made by the interface (a UUID); only that shape is accepted,
/// so an id can never reach outside the image folder.
fn checked(id: &str) -> Result<&str, String> {
    let ok = id.len() == 36 && id.chars().all(|c| c.is_ascii_hexdigit() || c == '-');
    if ok { Ok(id) } else { Err("That is not an image id.".into()) }
}

#[tauri::command]
pub async fn folio_read(app: AppHandle) -> Result<String, String> {
    let path = dir(&app)?.join(names(&app).0);
    if !path.exists() {
        return Ok("".into());
    }
    fs::read_to_string(&path).map_err(|e| format!("The Folio file could not be read: {e}."))
}

#[tauri::command]
pub async fn folio_write(app: AppHandle, json: String) -> Result<(), String> {
    serde_json::from_str::<serde_json::Value>(&json)
        .map_err(|_| "That save was not valid, so the Folio was left as it was.".to_string())?;
    let d = dir(&app)?;
    let (file, backup, tmp, _) = names(&app);
    let (path, temp) = (d.join(file), d.join(tmp));
    {
        let mut f = fs::File::create(&temp).map_err(|e| format!("The Folio could not be saved: {e}."))?;
        f.write_all(json.as_bytes()).map_err(|e| format!("The Folio could not be saved: {e}."))?;
        f.sync_all().map_err(|e| format!("The Folio could not be saved: {e}."))?;
    }
    if path.exists() {
        let _ = fs::copy(&path, d.join(backup));
    }
    fs::rename(&temp, &path).map_err(|e| format!("The Folio could not be saved: {e}."))
}

/// Keep one screenshot, sent as base64 webp.
#[tauri::command]
pub async fn folio_image_save(app: AppHandle, id: String, data: String) -> Result<(), String> {
    let id = checked(&id)?.to_string();
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data.as_bytes())
        .map_err(|_| "That image could not be read.".to_string())?;
    if bytes.len() > MAX_IMAGE {
        return Err("That image is too large to keep (12 MB at most after it is compressed).".into());
    }
    if bytes.len() < 12 || &bytes[0..4] != b"RIFF" || &bytes[8..12] != b"WEBP" {
        return Err("Only images prepared by the app are kept.".into());
    }
    fs::write(images(&app)?.join(format!("{id}.webp")), bytes).map_err(|e| format!("The image could not be saved: {e}."))
}

/// One screenshot, as base64, for the page to show.
#[tauri::command]
pub async fn folio_image_read(app: AppHandle, id: String) -> Result<String, String> {
    let path = images(&app)?.join(format!("{}.webp", checked(&id)?));
    let bytes = fs::read(&path).map_err(|_| "This image is missing from the Folio's image folder.".to_string())?;
    Ok(base64::engine::general_purpose::STANDARD.encode(bytes))
}

/// Remove images no page refers to any more; returns how many went.
#[tauri::command]
pub fn folio_images_prune(app: AppHandle, keep: Vec<String>) -> Result<u32, String> {
    let d = images(&app)?;
    let mut n = 0;
    for entry in fs::read_dir(&d).map_err(|e| e.to_string())?.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        let Some(id) = name.strip_suffix(".webp") else { continue };
        if !keep.iter().any(|k| k == id) && fs::remove_file(entry.path()).is_ok() {
            n += 1;
        }
    }
    Ok(n)
}

/// Show the Folio file in File Explorer, for backups.
#[tauri::command]
pub fn folio_reveal(app: AppHandle) -> Result<(), String> {
    let d = dir(&app)?;
    let file = d.join(names(&app).0);
    let target = if file.exists() { file } else { d };
    tauri_plugin_opener::reveal_item_in_dir(target).map_err(|e| e.to_string())
}

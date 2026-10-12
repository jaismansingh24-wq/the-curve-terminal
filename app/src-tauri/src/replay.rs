// Replay: price history the reader loads from their own files, kept as a
// compact binary copy in the app's folder so a replay opens at once, and the
// log of practice trades placed while replaying.
//
//   %LOCALAPPDATA%\in.thecurve.terminal\replay\<id>.bin     bars of one file
//   %LOCALAPPDATA%\in.thecurve.terminal\replay\index.json   what each file is
//   %LOCALAPPDATA%\in.thecurve.terminal\replay\log.json     practice trades
//
// The bars come from the reader's own export (their platform's data, under
// their own licence). They are kept on this computer only: never sent, and
// never part of the app.

use std::fs;
use std::io::Write;
use std::path::PathBuf;

use tauri::ipc::{InvokeBody, Request, Response};
use tauri::{AppHandle, Manager};

/// Started with --test: its own folder.
pub struct Replay {
    pub testing: bool,
}

const MAX_BIN: usize = 512 * 1024 * 1024;

fn folder(app: &AppHandle) -> Result<PathBuf, String> {
    let name = if app.state::<Replay>().testing { "replay.test" } else { "replay" };
    let d = app.path().app_local_data_dir().map_err(|e| e.to_string())?.join(name);
    fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    Ok(d)
}

/// A file id is a UUID made by the interface; nothing else reaches the disk.
fn checked(id: &str) -> Result<&str, String> {
    let ok = id.len() == 36 && id.chars().all(|c| c.is_ascii_hexdigit() || c == '-');
    if ok { Ok(id) } else { Err("That is not a replay file id.".into()) }
}

fn json_name(name: &str) -> Result<&'static str, String> {
    match name {
        "index" => Ok("index.json"),
        "log" => Ok("log.json"),
        _ => Err("No replay file by that name.".into()),
    }
}

fn write_atomic(path: &PathBuf, bytes: &[u8]) -> Result<(), String> {
    let tmp = path.with_extension("tmp");
    {
        let mut f = fs::File::create(&tmp).map_err(|e| format!("Replay could not save: {e}."))?;
        f.write_all(bytes).map_err(|e| format!("Replay could not save: {e}."))?;
        f.sync_all().map_err(|e| format!("Replay could not save: {e}."))?;
    }
    fs::rename(&tmp, path).map_err(|e| format!("Replay could not save: {e}."))
}

/// Keep one file's bars: the body is the binary the interface prepared, the
/// id comes in the x-replay-id header.
#[tauri::command]
pub fn replay_save_bin(app: AppHandle, request: Request<'_>) -> Result<(), String> {
    let id = request
        .headers()
        .get("x-replay-id")
        .and_then(|v| v.to_str().ok())
        .ok_or("The replay file has no id.")?;
    let id = checked(id)?.to_string();
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("The replay file arrived in the wrong form.".into());
    };
    if bytes.len() < 24 || &bytes[0..4] != b"CTRP" || bytes.len() > MAX_BIN {
        return Err("Only bars prepared by the app are kept.".into());
    }
    write_atomic(&folder(&app)?.join(format!("{id}.bin")), bytes)
}

/// One file's bars, as raw bytes.
#[tauri::command]
pub fn replay_load_bin(app: AppHandle, id: String) -> Result<Response, String> {
    let path = folder(&app)?.join(format!("{}.bin", checked(&id)?));
    let bytes = fs::read(&path).map_err(|_| "This replay file is missing from the app's folder. Load it again from your export.".to_string())?;
    Ok(Response::new(bytes))
}

#[tauri::command]
pub fn replay_delete(app: AppHandle, id: String) -> Result<(), String> {
    let path = folder(&app)?.join(format!("{}.bin", checked(&id)?));
    if path.exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn replay_read_json(app: AppHandle, name: String) -> Result<String, String> {
    let path = folder(&app)?.join(json_name(&name)?);
    if !path.exists() {
        return Ok(String::new());
    }
    fs::read_to_string(&path).map_err(|e| format!("Replay could not read its {name} file: {e}."))
}

#[tauri::command]
pub fn replay_write_json(app: AppHandle, name: String, json: String) -> Result<(), String> {
    serde_json::from_str::<serde_json::Value>(&json).map_err(|_| "That save was not valid, so nothing was changed.".to_string())?;
    write_atomic(&folder(&app)?.join(json_name(&name)?), json.as_bytes())
}

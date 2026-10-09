// "Open when Windows starts": one value under the current user's Run key.
// The same name setup uses, so the switch in settings and the tick box in
// setup always agree. Described in plain words on the Privacy panel.

use winreg::enums::HKEY_CURRENT_USER;
use winreg::RegKey;

const RUN: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
const NAME: &str = "TheCurveTerminal";

#[tauri::command]
pub fn startup_get() -> bool {
    RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey(RUN)
        .and_then(|k| k.get_value::<String, _>(NAME))
        .is_ok()
}

#[tauri::command]
pub fn startup_set(enabled: bool) -> Result<(), String> {
    let (key, _) = RegKey::predef(HKEY_CURRENT_USER)
        .create_subkey(RUN)
        .map_err(|e| e.to_string())?;
    if enabled {
        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        key.set_value(NAME, &format!("\"{}\" --autostart", exe.display()))
            .map_err(|e| e.to_string())
    } else {
        match key.delete_value(NAME) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(e.to_string()),
        }
    }
}

// Is Microsoft Edge WebView2 installed? Its runtime registers itself under
// EdgeUpdate, for the machine or for the current user.

use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
use winreg::RegKey;

const CLIENT: &str = "{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}";

pub fn present() -> bool {
    let places = [
        (HKEY_LOCAL_MACHINE, format!(r"SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{CLIENT}")),
        (HKEY_LOCAL_MACHINE, format!(r"SOFTWARE\Microsoft\EdgeUpdate\Clients\{CLIENT}")),
        (HKEY_CURRENT_USER, format!(r"Software\Microsoft\EdgeUpdate\Clients\{CLIENT}")),
    ];
    places.iter().any(|(hive, path)| {
        RegKey::predef(*hive)
            .open_subkey(path)
            .and_then(|k| k.get_value::<String, _>("pv"))
            .map(|v| !v.is_empty() && v != "0.0.0.0")
            .unwrap_or(false)
    })
}

/// A plain Windows message box: there is no web view to draw anything else.
pub fn explain_missing() {
    use windows_sys::Win32::UI::WindowsAndMessaging::{MessageBoxW, MB_ICONINFORMATION, MB_OK};
    let wide = |s: &str| s.encode_utf16().chain(std::iter::once(0)).collect::<Vec<u16>>();
    let text = wide(
        "The Curve Terminal needs Microsoft Edge WebView2, which is missing on this computer.\n\n\
         Install the WebView2 Runtime from Microsoft's website (search for \"WebView2 Runtime\"), \
         then run setup again.",
    );
    let title = wide("The Curve Terminal Setup");
    unsafe {
        MessageBoxW(std::ptr::null_mut(), text.as_ptr(), title.as_ptr(), MB_OK | MB_ICONINFORMATION);
    }
}

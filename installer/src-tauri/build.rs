// Setup carries the app inside itself. scripts/release.mjs stages the built
// app at payload/the-curve-terminal.exe before building setup; this embeds
// it. Without it (during development) setup still opens, and says plainly
// that this build has no app inside it.

use std::path::{Path, PathBuf};

fn main() {
    let manifest = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap());
    let app = manifest.join("payload").join("the-curve-terminal.exe");
    println!("cargo:rerun-if-changed=payload");
    println!("cargo:rerun-if-changed={}", app.display());

    let out = PathBuf::from(std::env::var("OUT_DIR").unwrap()).join("payload.rs");
    let code = if Path::new(&app).exists() {
        format!(
            "pub static APP: &[u8] = include_bytes!({:?});\npub const HAS_APP: bool = true;\n",
            app.display().to_string()
        )
    } else {
        "pub static APP: &[u8] = &[];\npub const HAS_APP: bool = false;\n".to_string()
    };
    std::fs::write(out, code).unwrap();

    tauri_build::build()
}

//! Tokenizer desktop shell.
//!
//! The whole product lives in the statically exported Next.js bundle in `out/`:
//! the compression pipeline is pure TypeScript that runs in the webview and never
//! reaches out to an AI provider (there is no API key anywhere in the app).
//! Rust only hosts the window and the OS integration.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running Tokenizer");
}

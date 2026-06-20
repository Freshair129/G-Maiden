// G-Maiden Rust core entry point.
// Minimal Tauri app builder scaffolded by G0.1.
// (Modules like audio/glog are added by their owning tasks — not the scaffold.)

#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// G-Maiden Rust core entry point.
// Minimal Tauri app builder scaffolded by G0.1.
// (Modules like audio/glog are added by their owning tasks — not the scaffold.)

#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use tauri::Manager;

mod gsi;

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            // G1.1: start the GSI ingestion server (127.0.0.1:3000) in the background.
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(gsi::serve(handle));

            // G0.2 / G-Sensory: make the main window a full-screen, click-through overlay.
            if let Some(win) = app.get_webview_window("main") {
                if let Ok(Some(monitor)) = win.current_monitor() {
                    let _ = win.set_size(*monitor.size());
                    let _ = win.set_position(tauri::PhysicalPosition::new(0, 0));
                }
                // clicks pass through to the game underneath
                let _ = win.set_ignore_cursor_events(true);
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

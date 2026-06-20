// G-Maiden Rust core entry point.

#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use tauri::{Emitter, Manager};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

mod gsi;

/// Toggle whether the overlay captures the mouse. When the settings panel is open the
/// overlay must be clickable; otherwise clicks pass through to the game (click-through).
#[tauri::command]
fn set_overlay_interactive(window: tauri::WebviewWindow, interactive: bool) {
    let _ = window.set_ignore_cursor_events(!interactive);
}

fn main() {
    // Alt+S — open/close the settings panel (works even while Dota 2 is focused).
    let toggle = Shortcut::new(Some(Modifiers::ALT), Code::KeyS);
    let toggle_for_handler = toggle.clone();

    tauri::Builder::default()
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, shortcut, event| {
                    if shortcut == &toggle_for_handler && event.state() == ShortcutState::Pressed {
                        let _ = app.emit("toggle-settings", ());
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![set_overlay_interactive])
        .setup(move |app| {
            // G1.1: GSI ingestion server (127.0.0.1:3000) in the background.
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(gsi::serve(handle));

            // global hotkey for settings
            app.global_shortcut().register(toggle)?;

            // G0.2 / G-Sensory: full-screen, click-through overlay window.
            if let Some(win) = app.get_webview_window("main") {
                if let Ok(Some(monitor)) = win.current_monitor() {
                    let _ = win.set_size(*monitor.size());
                    let _ = win.set_position(tauri::PhysicalPosition::new(0, 0));
                }
                let _ = win.set_ignore_cursor_events(true);
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

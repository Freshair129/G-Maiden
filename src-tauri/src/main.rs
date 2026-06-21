// G-Maiden Rust core entry point.

#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use tauri::Manager;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

mod gsi;

/// Show/hide the OSD overlay window (called by the control GUI toggle).
#[tauri::command]
fn set_overlay_visible(app: tauri::AppHandle, visible: bool) {
    if let Some(ov) = app.get_webview_window("overlay") {
        let _ = if visible { ov.show() } else { ov.hide() };
    }
}

fn main() {
    // Alt+S — show/hide the overlay while in-game (works even when Dota 2 is focused).
    let toggle = Shortcut::new(Some(Modifiers::ALT), Code::KeyS);
    let toggle_for_handler = toggle.clone();

    tauri::Builder::default()
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, shortcut, event| {
                    if shortcut == &toggle_for_handler && event.state() == ShortcutState::Pressed {
                        if let Some(ov) = app.get_webview_window("overlay") {
                            let visible = ov.is_visible().unwrap_or(true);
                            let _ = if visible { ov.hide() } else { ov.show() };
                        }
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![set_overlay_visible])
        .setup(move |app| {
            // G1.1: GSI ingestion server (127.0.0.1:3000); emits `game-tick` to all windows.
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(gsi::serve(handle));

            app.global_shortcut().register(toggle)?;

            // OSD overlay: full-screen, click-through, over the game.
            if let Some(ov) = app.get_webview_window("overlay") {
                if let Ok(Some(monitor)) = ov.current_monitor() {
                    let _ = ov.set_size(*monitor.size());
                    let _ = ov.set_position(tauri::PhysicalPosition::new(0, 0));
                }
                let _ = ov.set_ignore_cursor_events(true);
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

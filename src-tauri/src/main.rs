// G-Maiden Rust core entry point — thin bin shim. All real logic lives in
// lib.rs (canonical Tauri v2 lib+bin split).

#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

fn main() {
    g_maiden::run();
}

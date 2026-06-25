//! Shared runtime state between the GSI server, the capture loop, and the UI.
//!
//! These are process-global because the producers/consumers live on different
//! threads (GSI on the tokio runtime, capture on its own WGC thread, commands on
//! the main thread) and the values are tiny. Plain atomics + a couple of mutexes
//! keep it lock-light; no extra crate needed (`Mutex::new` is const since 1.63).

use std::sync::atomic::{AtomicBool, AtomicU64, AtomicU8, Ordering};
use std::sync::Mutex;

use crate::signal::Sensitivity;

/// True while a real match is in progress (set by the GSI server). The capture
/// loop uses this to gate the expensive CV pipeline — no point detecting heroes
/// at the main menu, and it keeps idle CPU near zero.
static IN_GAME: AtomicBool = AtomicBool::new(false);

/// Whether G-Signal gank warnings are enabled (mirrors the UI toggle). Defaults
/// on so a fresh install warns out of the box.
static SIGNAL_ENABLED: AtomicBool = AtomicBool::new(true);

/// User-tunable gank-warning sensitivity (Low / Med / High). Encoded as `u8` so
/// the capture loop reads it without locking; Med default matches `Sensitivity`.
static SIGNAL_SENSITIVITY: AtomicU8 = AtomicU8::new(1); // 0=Low, 1=Med, 2=High

/// Epoch-ms of the last GSI POST received. 0 = none yet. The watchdog uses this
/// to tell "Dota open & sending" (heartbeat ~30s) from "gone quiet".
static LAST_POST_MS: AtomicU64 = AtomicU64::new(0);

/// Maiden's voice for Rust-side (G-Signal) speech, mirrored from the UI picker.
static VOICE_NAME: Mutex<Option<String>> = Mutex::new(None);
static VOICE_RATE: Mutex<Option<i32>> = Mutex::new(None);

pub fn mark_post(ms: u64) {
    LAST_POST_MS.store(ms, Ordering::Relaxed);
}
pub fn last_post_ms() -> u64 {
    LAST_POST_MS.load(Ordering::Relaxed)
}

pub fn set_in_game(v: bool) {
    IN_GAME.store(v, Ordering::Relaxed);
}
pub fn in_game() -> bool {
    IN_GAME.load(Ordering::Relaxed)
}

pub fn set_signal_enabled(v: bool) {
    SIGNAL_ENABLED.store(v, Ordering::Relaxed);
}
pub fn signal_enabled() -> bool {
    SIGNAL_ENABLED.load(Ordering::Relaxed)
}

pub fn set_signal_sensitivity(s: Sensitivity) {
    let code: u8 = match s {
        Sensitivity::Low => 0,
        Sensitivity::Med => 1,
        Sensitivity::High => 2,
    };
    SIGNAL_SENSITIVITY.store(code, Ordering::Relaxed);
}
pub fn signal_sensitivity() -> Sensitivity {
    match SIGNAL_SENSITIVITY.load(Ordering::Relaxed) {
        0 => Sensitivity::Low,
        2 => Sensitivity::High,
        _ => Sensitivity::Med,
    }
}

/// Mirror the user's chosen voice/rate so G-Signal speaks in Maiden's selected
/// voice instead of the SAPI default.
pub fn set_voice(name: Option<String>, rate: Option<i32>) {
    if let Ok(mut g) = VOICE_NAME.lock() {
        *g = name.filter(|s| !s.is_empty());
    }
    if let Ok(mut g) = VOICE_RATE.lock() {
        *g = rate;
    }
}

/// Current (voice name, rate) for the Rust speech path.
pub fn voice() -> (Option<String>, Option<i32>) {
    let name = VOICE_NAME.lock().ok().and_then(|g| g.clone());
    let rate = VOICE_RATE.lock().ok().and_then(|g| *g);
    (name, rate)
}

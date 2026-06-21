//! G-Log — local match logging (privacy-first per CLAUDE.md).
//! Writes one JSONL file per Dota 2 match into `%LOCALAPPDATA%\G-Maiden\logs\`.
//! Never sent off-device. Future use: replay matches to tune the prediction
//! params of G-Sentry / G-Master without playing live.
//!
//! Each line is a `{ts, tick}` record where `ts` is a Unix-epoch millisecond
//! stamp and `tick` is the cleaned `GameTick` the overlay receives. Sampled to
//! ~1 Hz by debouncing on `clock_time` — a 40-min match stays well under 2 MB.

use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::gsi::GameTick;

struct LogState {
    file: Option<File>,
    path: Option<PathBuf>,
    in_game: bool,
    last_clock: i64,
}

static STATE: Mutex<LogState> = Mutex::new(LogState {
    file: None,
    path: None,
    in_game: false,
    last_clock: i64::MIN,
});

/// Directory where match logs are stored. Created on first write.
pub fn log_dir() -> PathBuf {
    let base = std::env::var("LOCALAPPDATA")
        .ok()
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."));
    base.join("G-Maiden").join("logs")
}

/// Path to the currently-recording match log, if a match is in progress.
pub fn current_path() -> Option<PathBuf> {
    STATE.lock().ok().and_then(|g| g.path.clone())
}

fn now_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

fn start_match(state: &mut LogState) {
    let dir = log_dir();
    if let Err(e) = fs::create_dir_all(&dir) {
        eprintln!("[G-Maiden log] mkdir failed: {e}");
        return;
    }
    let ts_sec = now_ms() / 1000;
    let path = dir.join(format!("match-{ts_sec}.jsonl"));
    match OpenOptions::new().create(true).append(true).open(&path) {
        Ok(f) => {
            state.file = Some(f);
            state.path = Some(path);
            state.last_clock = i64::MIN;
        }
        Err(e) => eprintln!("[G-Maiden log] open failed: {e}"),
    }
}

fn end_match(state: &mut LogState) {
    state.file = None;
    state.path = None;
    state.last_clock = i64::MIN;
}

/// Note a new tick from the GSI handler. Detects match-start / match-end
/// transitions, rotates the log file accordingly, and appends one JSONL
/// record per second of in-game time.
pub fn note_tick(tick: &GameTick) {
    let Ok(mut state) = STATE.lock() else { return };

    // State transition: start / end a match log when in_game flips.
    if tick.in_game && !state.in_game {
        start_match(&mut state);
    } else if !tick.in_game && state.in_game {
        end_match(&mut state);
    }
    state.in_game = tick.in_game;

    if !tick.in_game || state.file.is_none() {
        return;
    }

    // Sample at ~1 Hz: skip ticks where clock_time hasn't advanced. Allow
    // any change including resets (going back in time during draft / pause).
    if tick.clock_time == state.last_clock {
        return;
    }
    state.last_clock = tick.clock_time;

    let payload = serde_json::json!({ "ts": now_ms() as u64, "tick": tick });
    let Ok(line) = serde_json::to_string(&payload) else { return };
    if let Some(f) = state.file.as_mut() {
        let _ = f.write_all(line.as_bytes());
        let _ = f.write_all(b"\n");
        // Flush each line so a power-cut mid-match still preserves the prefix.
        let _ = f.flush();
    }
}

/// Open the log directory in Windows Explorer (for transparency — the user
/// can see exactly what we're keeping).
pub fn open_log_dir() {
    let dir = log_dir();
    let _ = fs::create_dir_all(&dir);
    let _ = std::process::Command::new("explorer")
        .arg(dir.as_os_str())
        .spawn();
}

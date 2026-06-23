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

/// Force-close the active match log (used by the GSI watchdog when Dota exits
/// without sending a final out-of-game tick). Resets in-game state so the next
/// match starts a fresh file. No-op if nothing is recording.
pub fn force_end() {
    if let Ok(mut state) = STATE.lock() {
        if state.file.is_some() {
            end_match(&mut state);
        }
        state.in_game = false;
    }
}

/// Append a typed G-Signal event to the current match log, time-aligned with the
/// tick stream. No-op when no match is recording. Used to capture the inputs of
/// each gank decision so we can later (offline) join them against outcomes —
/// the raw material for calibrating G-Motion's probability model (#7). The `ts`
/// field is stamped here; callers pass a record built by the helpers below.
pub fn note_event(mut value: serde_json::Value) {
    let Ok(mut state) = STATE.lock() else { return };
    if state.file.is_none() {
        return;
    }
    if let Some(obj) = value.as_object_mut() {
        obj.insert("ts".into(), serde_json::json!(now_ms() as u64));
    }
    let Ok(line) = serde_json::to_string(&value) else { return };
    if let Some(f) = state.file.as_mut() {
        let _ = f.write_all(line.as_bytes());
        let _ = f.write_all(b"\n");
        let _ = f.flush();
    }
}

/// Record: G-Signal fired a gank warning (the decision + its inputs).
pub fn gank_signal_record(probability: f32, missing: &[String], eta_ms: u64) -> serde_json::Value {
    serde_json::json!({
        "type": "gank_signal",
        "probability": probability,
        "missing_heroes": missing,
        "eta_ms": eta_ms,
    })
}

/// Record: Belief Revision retracted a prior warning.
pub fn gank_revision_record() -> serde_json::Value {
    serde_json::json!({ "type": "gank_revision" })
}

/// Record: G-Sentry flagged an enemy missing (a risk feature).
pub fn enemy_missing_record(hero: &str, missing_for_ms: u64, last_pos: (f32, f32)) -> serde_json::Value {
    serde_json::json!({
        "type": "enemy_missing",
        "hero": hero,
        "missing_for_ms": missing_for_ms,
        "last_pos": [last_pos.0, last_pos.1],
    })
}

/// A single archived match log.
#[derive(serde::Serialize, Clone)]
pub struct MatchLog {
    pub name: String,
    pub size: u64,
    pub modified_ms: u64,
}

/// Enumerate match-*.jsonl files, newest first. Excludes the file currently
/// being written so it can't be deleted from under us.
pub fn list_matches() -> Vec<MatchLog> {
    let dir = log_dir();
    let current = current_path();
    let mut out: Vec<MatchLog> = fs::read_dir(&dir)
        .ok()
        .map(|it| {
            it.filter_map(|e| e.ok())
                .filter_map(|e| {
                    let path = e.path();
                    if Some(&path) == current.as_ref() {
                        return None;
                    }
                    let name = path.file_name()?.to_string_lossy().to_string();
                    if !name.starts_with("match-") || !name.ends_with(".jsonl") {
                        return None;
                    }
                    let meta = e.metadata().ok()?;
                    let modified_ms = meta
                        .modified()
                        .ok()
                        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                        .map(|d| d.as_millis() as u64)
                        .unwrap_or(0);
                    Some(MatchLog {
                        name,
                        size: meta.len(),
                        modified_ms,
                    })
                })
                .collect()
        })
        .unwrap_or_default();
    out.sort_by_key(|b| std::cmp::Reverse(b.modified_ms));
    out
}

/// Delete a single archived match log. Rejects paths outside the log dir
/// and the file currently being recorded — both would be a privacy footgun
/// or a write-during-write corruption.
pub fn delete_match(name: &str) -> Result<(), String> {
    if name.contains('/') || name.contains('\\') || name.contains("..") {
        return Err("ชื่อไฟล์ไม่ถูกต้อง".into());
    }
    if !name.starts_with("match-") || !name.ends_with(".jsonl") {
        return Err("ลบได้เฉพาะไฟล์ match-*.jsonl เท่านั้น".into());
    }
    let dir = log_dir();
    let path = dir.join(name);
    if current_path().as_deref() == Some(&path) {
        return Err("ลบไฟล์ที่กำลังบันทึกอยู่ไม่ได้ — รอจบแมตช์ก่อน".into());
    }
    fs::remove_file(&path).map_err(|e| format!("ลบไม่สำเร็จ: {e}"))
}

/// Wipe every archived match. The currently-recording file is preserved so
/// the active match survives the privacy reset.
pub fn delete_all() -> Result<u32, String> {
    let mut count = 0u32;
    for m in list_matches() {
        if delete_match(&m.name).is_ok() {
            count += 1;
        }
    }
    Ok(count)
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gank_signal_record_shape() {
        let r = gank_signal_record(0.91, &["CM".into(), "SF".into()], 2500);
        assert_eq!(r["type"], "gank_signal");
        assert_eq!(r["eta_ms"], 2500);
        assert_eq!(r["missing_heroes"].as_array().unwrap().len(), 2);
        // probability round-trips as a number
        assert!((r["probability"].as_f64().unwrap() - 0.91).abs() < 1e-6);
    }

    #[test]
    fn enemy_missing_record_shape() {
        let r = enemy_missing_record("CM", 6000, (0.25, 0.5));
        assert_eq!(r["type"], "enemy_missing");
        assert_eq!(r["hero"], "CM");
        let pos = r["last_pos"].as_array().unwrap();
        assert_eq!(pos.len(), 2);
        assert!((pos[0].as_f64().unwrap() - 0.25).abs() < 1e-6);
    }

    #[test]
    fn revision_record_shape() {
        assert_eq!(gank_revision_record()["type"], "gank_revision");
    }
}

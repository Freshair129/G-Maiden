//! WAV playback for pre-recorded persona clips.
//! Maiden's predictable lines (HP-low warning, level-up congrats, kill, death,
//! respawn, mana-low, belief-revision opener) sound natural only when they
//! come from real voice takes — SAPI's formant synth always sounds robotic.
//! This module owns the pre-recorded path; SAPI is the silent fallback when a
//! clip is missing.
//!
//! Clips live under `voice-cache/{event}/*.wav`. We resolve the folder
//! relative to the running exe first (so the installer's voice-cache wins),
//! then fall back to `assets/voice-cache` so `pnpm tauri dev` from the repo
//! still works.
//!
//! Single-slot Child mirrors the TTS pattern — Maiden never plays two clips
//! at once, and Belief Revision can kill an in-flight clip via cancel().

use std::fs;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

static CURRENT: Mutex<Option<Child>> = Mutex::new(None);

/// Where Maiden's clips live. Exe-relative first, then dev-tree fallback.
pub fn voice_cache_dir() -> PathBuf {
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            let near = parent.join("voice-cache");
            if near.is_dir() {
                return near;
            }
        }
    }
    PathBuf::from("assets/voice-cache")
}

fn list_clips(event: &str) -> Vec<PathBuf> {
    let dir = voice_cache_dir().join(event);
    fs::read_dir(&dir)
        .ok()
        .map(|it| {
            it.filter_map(|e| e.ok())
                .map(|e| e.path())
                .filter(|p| {
                    p.is_file()
                        && p.extension()
                            .is_some_and(|x| x.eq_ignore_ascii_case("wav"))
                })
                .collect()
        })
        .unwrap_or_default()
}

/// How many clips Maiden has for this event (used by the UI to show
/// "danger: 0 clips · using SAPI fallback").
pub fn clip_count(event: &str) -> usize {
    list_clips(event).len()
}

/// Stop the current clip (Belief Revision needs this — same contract as tts::cancel).
pub fn cancel() {
    if let Ok(mut g) = CURRENT.lock() {
        if let Some(mut c) = g.take() {
            let _ = c.kill();
            let _ = c.wait();
        }
    }
}

/// Try to play a random clip for `event`. Returns true on success (a clip
/// was found and playback started). false means the caller should fall back
/// to SAPI synthesis.
pub fn play_random(event: &str) -> bool {
    let clips = list_clips(event);
    if clips.is_empty() {
        return false;
    }
    // Cheap entropy — sub-second nanos. Good enough to rotate a pool of 5-10
    // clips so the player doesn't hear the same take twice in a row.
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.subsec_nanos() as usize)
        .unwrap_or(0);
    let path = clips[nanos % clips.len()].clone();

    cancel();
    let escaped = path.to_string_lossy().replace('\'', "''");
    // PlaySync blocks the PowerShell host for the WAV's full duration, so
    // killing the child cleanly interrupts playback for Belief Revision.
    let script = format!("(New-Object System.Media.SoundPlayer '{escaped}').PlaySync()");
    let mut cmd = Command::new("powershell");
    cmd.args([
        "-NoProfile",
        "-NonInteractive",
        "-WindowStyle",
        "Hidden",
        "-Command",
        &script,
    ])
    .stdin(Stdio::null())
    .stdout(Stdio::null())
    .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
    match cmd.spawn() {
        Ok(child) => {
            if let Ok(mut g) = CURRENT.lock() {
                *g = Some(child);
            }
            true
        }
        Err(e) => {
            eprintln!("[G-Maiden audio] play failed for {event}: {e}");
            false
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_event_folder_returns_zero_clips() {
        // No panic, no I/O error propagated — caller can treat as "fall back to SAPI".
        assert_eq!(clip_count("__nonexistent_event_xyz__"), 0);
    }
}

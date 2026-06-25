//! Voice-clip playback via rodio (in-process, no PowerShell).
//!
//! Lookup order per event:
//!   1. user's `voice-cache/{event}/*.{wav,mp3}` (their installed pack, exe-rel
//!      first, then `assets/voice-cache` for dev mode)
//!   2. `voice-pack-default/{event}/*.{wav,mp3}` — the gTTS Thai pack bundled
//!      with the installer so an *intelligible* Maiden ships out of the box
//!      (covers user feedback: Windows SAPI Thai is unusable). Users still win
//!      by dropping their own clips into voice-cache.
//!
//! Both .wav and .mp3 work — rodio's Symphonia decodes both.
//!
//! OutputStream is !Sync, so we own it on a dedicated thread and
//! communicate via a channel. Single-slot: Maiden never plays two
//! clips at once; cancel() stops the current clip for Belief Revision.

use std::fs;
use std::io::BufReader;
use std::path::PathBuf;
use std::sync::{mpsc, Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

use rodio::{Decoder, OutputStream, Sink};

enum Cmd {
    Play(PathBuf),
    Stop,
}

fn sender() -> &'static Mutex<mpsc::Sender<Cmd>> {
    static TX: OnceLock<Mutex<mpsc::Sender<Cmd>>> = OnceLock::new();
    TX.get_or_init(|| {
        let (tx, rx) = mpsc::channel::<Cmd>();
        std::thread::Builder::new()
            .name("g-audio".into())
            .spawn(move || audio_thread(rx))
            .expect("audio thread spawn");
        Mutex::new(tx)
    })
}

fn audio_thread(rx: mpsc::Receiver<Cmd>) {
    let Ok((_stream, handle)) = OutputStream::try_default() else {
        eprintln!("[G-Maiden audio] no audio output device — clips disabled");
        for _ in rx {}
        return;
    };

    let mut sink: Option<Sink> = None;

    for cmd in rx {
        match cmd {
            Cmd::Stop => {
                if let Some(s) = sink.take() {
                    s.stop();
                }
            }
            Cmd::Play(path) => {
                if let Some(s) = sink.take() {
                    s.stop();
                }
                let file = match fs::File::open(&path) {
                    Ok(f) => f,
                    Err(e) => {
                        eprintln!("[G-Maiden audio] open {}: {e}", path.display());
                        continue;
                    }
                };
                let source = match Decoder::new(BufReader::new(file)) {
                    Ok(s) => s,
                    Err(e) => {
                        eprintln!("[G-Maiden audio] decode {}: {e}", path.display());
                        continue;
                    }
                };
                match Sink::try_new(&handle) {
                    Ok(s) => {
                        s.append(source);
                        sink = Some(s);
                    }
                    Err(e) => eprintln!("[G-Maiden audio] sink: {e}"),
                }
            }
        }
    }
}

fn send(cmd: Cmd) {
    if let Ok(tx) = sender().lock() {
        let _ = tx.send(cmd);
    }
}

/// Play a specific WAV file by path (used by Piper TTS to play its output).
/// Cancels any currently-playing clip first so Maiden never overlaps herself.
pub fn play_file(path: PathBuf) {
    send(Cmd::Play(path));
}

/// Where Maiden's user-installed clips live. Exe-relative first, then dev-tree.
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

/// Where the bundled DEFAULT Thai voice pack lives — installed next to the exe
/// by the Tauri bundler (resources entry in tauri.conf.json) and committed at
/// `src-tauri/voice-pack-default/` so devs hit it without an install step.
fn default_pack_dir() -> Option<PathBuf> {
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            let near = parent.join("voice-pack-default");
            if near.is_dir() {
                return Some(near);
            }
        }
    }
    let dev = PathBuf::from("voice-pack-default");
    if dev.is_dir() {
        return Some(dev);
    }
    None
}

fn is_clip(p: &std::path::Path) -> bool {
    p.is_file()
        && p.extension()
            .and_then(|x| x.to_str())
            .map(|x| {
                let l = x.to_ascii_lowercase();
                l == "wav" || l == "mp3"
            })
            .unwrap_or(false)
}

fn list_clips_in(dir: &std::path::Path) -> Vec<PathBuf> {
    fs::read_dir(dir)
        .ok()
        .map(|it| {
            it.filter_map(|e| e.ok())
                .map(|e| e.path())
                .filter(|p| is_clip(p))
                .collect()
        })
        .unwrap_or_default()
}

/// User pack first (so a player's installed/purchased clips override defaults);
/// fall back to the bundled default pack so Maiden is never silent.
fn list_clips(event: &str) -> Vec<PathBuf> {
    let user = list_clips_in(&voice_cache_dir().join(event));
    if !user.is_empty() {
        return user;
    }
    if let Some(def) = default_pack_dir() {
        return list_clips_in(&def.join(event));
    }
    Vec::new()
}

pub fn clip_count(event: &str) -> usize {
    list_clips(event).len()
}

/// Stop the current clip immediately.
pub fn cancel() {
    send(Cmd::Stop);
}

/// Play a random clip for `event`. Returns true if a clip was found and
/// sent for playback, false if no clips exist (caller falls back to TTS).
pub fn play_random(event: &str) -> bool {
    let clips = list_clips(event);
    if clips.is_empty() {
        return false;
    }
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.subsec_nanos() as usize)
        .unwrap_or(0);
    let path = clips[nanos % clips.len()].clone();
    send(Cmd::Play(path));
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_event_folder_returns_zero_clips() {
        assert_eq!(clip_count("__nonexistent_event_xyz__"), 0);
    }
}

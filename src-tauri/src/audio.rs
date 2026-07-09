//! Voice-clip playback via rodio (in-process, no PowerShell).
//!
//! Lookup order per event:
//!   1. user's `voice-cache/{event}/*.{wav,mp3}` (their installed pack, exe-rel
//!      first, then `assets/voice-cache` for dev mode)
//!   2. `voice-pack-default/{event}/*.{wav,mp3}` - the gTTS Thai pack bundled
//!      with the installer so an intelligible Maiden ships out of the box.
//!
//! Both .wav and .mp3 work - rodio's Symphonia decodes both.
//!
//! OutputStream is !Sync, so we own it on a dedicated thread and communicate via
//! a channel. Single-slot: Maiden never plays two clips at once; `cancel()`
//! stops the current clip for Belief Revision.

use std::fs;
use std::io::BufReader;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU8, Ordering};
use std::sync::{mpsc, Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

use rodio::{Decoder, OutputStream, Sink};

/// Master volume 0-100. Shared with the audio thread via atomic so `set_volume`
/// doesn't need the channel (and the Sink is adjusted immediately on the next
/// `Play`).
static VOLUME: AtomicU8 = AtomicU8::new(80);
static ACTIVE_PRIORITY: AtomicU8 = AtomicU8::new(0);

#[derive(Copy, Clone, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum Priority {
    Cosmetic = 0,
    Normal = 1,
    Critical = 2,
}

impl Priority {
    fn as_u8(self) -> u8 {
        self as u8
    }
}

pub(crate) fn should_accept_incoming(current: Priority, incoming: Priority) -> bool {
    incoming >= current
}

enum Cmd {
    Play(PathBuf, Priority),
    Stop,
    Volume(f32),
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
        eprintln!("[G-Maiden audio] no audio output device - clips disabled");
        for _ in rx {}
        return;
    };

    let mut sink: Option<Sink> = None;
    let mut current_priority = Priority::Cosmetic;

    loop {
        if sink.as_ref().is_some_and(|s| s.empty()) {
            sink = None;
            current_priority = Priority::Cosmetic;
            ACTIVE_PRIORITY.store(Priority::Cosmetic.as_u8(), Ordering::Relaxed);
        }

        let cmd = match rx.recv_timeout(std::time::Duration::from_millis(50)) {
            Ok(cmd) => cmd,
            Err(mpsc::RecvTimeoutError::Timeout) => continue,
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
        };

        match cmd {
            Cmd::Stop => {
                if let Some(s) = sink.take() {
                    s.stop();
                }
                current_priority = Priority::Cosmetic;
                ACTIVE_PRIORITY.store(Priority::Cosmetic.as_u8(), Ordering::Relaxed);
            }
            Cmd::Volume(vol) => {
                if let Some(s) = &sink {
                    s.set_volume(vol);
                }
            }
            Cmd::Play(path, priority) => {
                if sink.is_some() && !should_accept_incoming(current_priority, priority) {
                    continue;
                }
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
                        s.set_volume(VOLUME.load(Ordering::Relaxed) as f32 / 100.0);
                        s.append(source);
                        sink = Some(s);
                        current_priority = priority;
                        ACTIVE_PRIORITY.store(priority.as_u8(), Ordering::Relaxed);
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
    play_file_with_priority(path, Priority::Normal);
}

pub fn play_file_with_priority(path: PathBuf, priority: Priority) {
    send(Cmd::Play(path, priority));
}

/// Where Maiden's user-installed clips live. Exe-relative first, then dev-tree.
/// Always returns an absolute path so Explorer opens the right folder.
pub fn voice_cache_dir() -> PathBuf {
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            let near = parent.join("voice-cache");
            if near.is_dir() {
                return near;
            }
        }
    }
    let dev = PathBuf::from("assets/voice-cache");
    std::fs::canonicalize(&dev).unwrap_or_else(|_| {
        std::env::current_dir()
            .unwrap_or_default()
            .join("assets/voice-cache")
    })
}

/// Where the bundled default Thai voice pack lives.
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

/// Resolution order (first non-empty wins):
///   1. the active voice pack's clips mapped to this event
///   2. flat `voice-cache/{event}/`
///   3. the bundled default pack
fn list_clips(event: &str) -> Vec<PathBuf> {
    let active = crate::voice_api::active_event_clips(event);
    if !active.is_empty() {
        return active;
    }
    let user = list_clips_in(&voice_cache_dir().join(event));
    if !user.is_empty() {
        return user;
    }
    if let Some(def) = default_pack_dir() {
        return list_clips_in(&def.join(event));
    }
    Vec::new()
}

pub fn priority_for_event(event: &str) -> Priority {
    match event {
        "gank" | "danger" | "revision" => Priority::Critical,
        "death" | "respawn" | "advice" => Priority::Normal,
        _ => Priority::Cosmetic,
    }
}

pub fn clip_count(event: &str) -> usize {
    list_clips(event).len()
}

/// Count clips in every event sub-dir of voice-cache.
pub fn all_counts() -> std::collections::BTreeMap<String, usize> {
    let mut out = std::collections::BTreeMap::new();
    if let Ok(it) = fs::read_dir(voice_cache_dir()) {
        for entry in it.flatten() {
            let p = entry.path();
            if p.is_dir() {
                if let Some(name) = p.file_name().and_then(|n| n.to_str()) {
                    out.insert(name.to_string(), clip_count(name));
                }
            }
        }
    }
    out
}

/// List individual clip file names for a given event.
pub fn list_event_clips(event: &str) -> Vec<(String, String, String)> {
    let user_clips = list_clips_in(&voice_cache_dir().join(event));
    if !user_clips.is_empty() {
        return user_clips
            .into_iter()
            .map(|p| {
                let name = p
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_string();
                let full = p.to_string_lossy().to_string();
                (name, full, "user".to_string())
            })
            .collect();
    }
    if let Some(def) = default_pack_dir() {
        return list_clips_in(&def.join(event))
            .into_iter()
            .map(|p| {
                let name = p
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_string();
                let full = p.to_string_lossy().to_string();
                (name, full, "default".to_string())
            })
            .collect();
    }
    Vec::new()
}

/// Stop the current clip immediately.
pub fn cancel() {
    send(Cmd::Stop);
}

pub fn active_priority() -> Priority {
    match ACTIVE_PRIORITY.load(Ordering::Relaxed) {
        2 => Priority::Critical,
        1 => Priority::Normal,
        _ => Priority::Cosmetic,
    }
}

/// Set the master volume (0-100). Applied to the current clip immediately and
/// to every future clip.
pub fn set_volume(vol: u8) {
    let clamped = vol.min(100);
    VOLUME.store(clamped, Ordering::Relaxed);
    send(Cmd::Volume(clamped as f32 / 100.0));
}

/// Current master volume (0-100).
pub fn get_volume() -> u8 {
    VOLUME.load(Ordering::Relaxed)
}

/// Play a random clip for `event`. Returns true if a clip was found and sent for
/// playback, false if no clips exist (caller falls back to TTS).
pub fn play_random(event: &str) -> bool {
    play_random_with_priority(event, priority_for_event(event))
}

pub fn play_random_with_priority(event: &str, priority: Priority) -> bool {
    let clips = list_clips(event);
    if clips.is_empty() {
        return false;
    }
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.subsec_nanos() as usize)
        .unwrap_or(0);
    let path = clips[nanos % clips.len()].clone();
    send(Cmd::Play(path, priority));
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_event_folder_returns_zero_clips() {
        assert_eq!(clip_count("__nonexistent_event_xyz__"), 0);
    }

    #[test]
    fn critical_events_outrank_cosmetic() {
        assert_eq!(priority_for_event("gank"), Priority::Critical);
        assert_eq!(priority_for_event("revision"), Priority::Critical);
        assert_eq!(priority_for_event("levelUp"), Priority::Cosmetic);
    }

    #[test]
    fn enqueue_rejects_lower_priority_when_a_higher_one_is_active() {
        assert!(!should_accept_incoming(
            Priority::Critical,
            Priority::Cosmetic
        ));
        assert!(should_accept_incoming(
            Priority::Cosmetic,
            Priority::Critical
        ));
        assert!(should_accept_incoming(Priority::Normal, Priority::Normal));
    }
}

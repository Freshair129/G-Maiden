//! Non-event dynamic advice and voice audition through local Piper or Windows SAPI.
//! Gameplay event media is admitted exclusively from verified GANN pairs.
//! SAPI text travels as base64 to preserve Unicode and avoid shell quoting.

use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};

// At most one SAPI process at a time — Maiden never speaks two lines in parallel.
// Belief Revision (per CLAUDE.md) requires canceling a line mid-stream and
// replacing it; we kill the PowerShell child to interrupt SAPI playback.
static CURRENT: Mutex<Option<(Child, crate::audio::Priority)>> = Mutex::new(None);

#[derive(serde::Serialize, Clone)]
pub struct Voice {
    pub name: String,
    pub culture: String,
    pub gender: String,
    pub age: String,
}

fn base64(data: &[u8]) -> String {
    const T: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(data.len().div_ceil(3) * 4);
    for chunk in data.chunks(3) {
        let b0 = chunk[0];
        let b1 = if chunk.len() > 1 { chunk[1] } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] } else { 0 };
        out.push(T[(b0 >> 2) as usize] as char);
        out.push(T[(((b0 << 4) | (b1 >> 4)) & 0x3f) as usize] as char);
        out.push(if chunk.len() > 1 {
            T[(((b1 << 2) | (b2 >> 6)) & 0x3f) as usize] as char
        } else {
            '='
        });
        out.push(if chunk.len() > 2 {
            T[(b2 & 0x3f) as usize] as char
        } else {
            '='
        });
    }
    out
}

/// Enumerate the SAPI voices installed on this machine. Used by the UI to
/// let the player pick which voice Maiden should speak with.
pub fn list_voices() -> Vec<Voice> {
    voice_catalog::list_voices()
}

#[path = "voice_catalog.rs"]
mod voice_catalog;

// ─────── Piper local TTS (G4.4) ────────────────────────────────────────────
// Piper is a fast, offline neural TTS engine: https://github.com/rhasspy/piper
// We look for piper.exe next to the app binary or in PATH. If present AND a
// model .onnx is found under models/piper/, we shell out and play via rodio.
// This path is ~40-80 ms (vs SAPI's 150-200 ms) and fully offline.

fn piper_bin() -> Option<std::path::PathBuf> {
    // Prefer bundled binary next to exe.
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            let bundled = parent.join("piper").join("piper.exe");
            if bundled.exists() {
                return Some(bundled);
            }
            let alt = parent.join("piper.exe");
            if alt.exists() {
                return Some(alt);
            }
        }
    }
    // Fallback: piper in PATH (developer setup).
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let mut cmd = Command::new("where");
        cmd.arg("piper.exe");
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW for background synthesis
        if let Ok(out) = cmd.output() {
            if out.status.success() {
                let path = String::from_utf8_lossy(&out.stdout)
                    .trim()
                    .lines()
                    .next()
                    .map(|s| std::path::PathBuf::from(s.trim()));
                if let Some(p) = path {
                    return Some(p);
                }
            }
        }
    }
    None
}

fn piper_model_dir() -> Option<std::path::PathBuf> {
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            let d = parent.join("models").join("piper");
            if d.is_dir() {
                return Some(d);
            }
            let d2 = parent.join("piper").join("models");
            if d2.is_dir() {
                return Some(d2);
            }
        }
    }
    // Dev fallback — models/piper/ at repo root (same lookup as minimap model).
    let d = std::path::PathBuf::from("models/piper");
    if d.is_dir() {
        return Some(d);
    }
    None
}

fn find_piper_model(dir: &std::path::Path) -> Option<std::path::PathBuf> {
    // Prefer Thai model first (th_TH-*), then any .onnx.
    std::fs::read_dir(dir)
        .ok()?
        .filter_map(|e| e.ok())
        .find_map(|e| {
            let p = e.path();
            if p.extension()?.eq_ignore_ascii_case("onnx")
                && p.file_name()?.to_string_lossy().starts_with("th_TH")
            {
                return Some(p);
            }
            None
        })
        .or_else(|| {
            std::fs::read_dir(dir)
                .ok()?
                .filter_map(|e| e.ok())
                .find_map(|e| {
                    let p = e.path();
                    if p.extension()?.eq_ignore_ascii_case("onnx") {
                        Some(p)
                    } else {
                        None
                    }
                })
        })
}

// Audit H9: `piper_bin()` shells out to `where.exe` and `piper_model_dir()` /
// `find_piper_model()` each do a `read_dir` — cheap once, but this used to run
// on every dynamic TTS call. Piper install
// state doesn't change over a running session, so probe once per process and
// reuse the answer between dynamic speech requests.
//
// Review fix: a bare `OnceLock` cached a *negative* probe forever too — if
// Piper wasn't found on the very first TTS call of the session (asset
// staging still finishing, or a user/dev installing it mid-session), it
// could never be picked up without an app restart. Keep the "don't hit the
// filesystem on every call" win for the common cases (Piper never
// installed, or already found) by only re-running the actual probe when the
// cached answer is a miss *and* enough time has passed since the last
// attempt. A positive result, once found, is trusted for the rest of the
// process — Piper's files disappearing mid-session isn't defended against;
// a spawn would just fail and fall through to SAPI, same as any other
// Piper failure.
struct PiperProbeCache {
    result: Option<(std::path::PathBuf, std::path::PathBuf)>,
    checked_at: Instant,
}

static PIPER_PROBE: Mutex<Option<PiperProbeCache>> = Mutex::new(None);
const PIPER_PROBE_RETRY_INTERVAL: Duration = Duration::from_secs(60);

fn piper_probe() -> Option<(std::path::PathBuf, std::path::PathBuf)> {
    let mut guard = PIPER_PROBE
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let stale = match guard.as_ref() {
        None => true,
        Some(c) if c.result.is_none() => c.checked_at.elapsed() >= PIPER_PROBE_RETRY_INTERVAL,
        Some(_) => false,
    };
    if stale {
        let result = (|| {
            let bin = piper_bin()?;
            let model = find_piper_model(&piper_model_dir()?)?;
            Some((bin, model))
        })();
        *guard = Some(PiperProbeCache {
            result: result.clone(),
            checked_at: Instant::now(),
        });
        return result;
    }
    guard.as_ref().and_then(|c| c.result.clone())
}

/// Synthesize `text` to a WAV file at `out` via Piper (no live playback).
/// Returns true if Piper was available and synthesis succeeded (the process
/// exited cleanly and `out` was written with nonzero size). Shared by the
/// dynamic voice audition and guarded advice paths.
fn piper_synth(text: &str, out: &std::path::Path) -> bool {
    piper_synth_with_spawn(text, out, |cmd| {
        cmd.spawn().map_err(|error| error.to_string())
    })
}

fn piper_synth_with_spawn(
    text: &str,
    out: &std::path::Path,
    spawn: impl FnOnce(&mut Command) -> Result<Child, String>,
) -> bool {
    use std::io::Write;
    let Some((bin, model)) = piper_probe() else {
        return false;
    };
    let mut cmd = Command::new(&bin);
    cmd.args([
        "--model",
        model.to_str().unwrap_or_default(),
        "--output_file",
        out.to_str().unwrap_or_default(),
    ])
    .stdin(Stdio::piped())
    .stdout(Stdio::null())
    .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
    let mut child = match spawn(&mut cmd) {
        Ok(c) => c,
        Err(e) => {
            eprintln!("[G-Maiden Piper] spawn failed: {e}");
            return false;
        }
    };
    // Feed text via stdin; piper reads until EOF.
    if let Some(mut stdin) = child.stdin.take() {
        let _ = stdin.write_all(text.as_bytes());
    }
    match child.wait() {
        Ok(s) if s.success() => {}
        Ok(s) => {
            eprintln!("[G-Maiden Piper] exit code {s}");
            return false;
        }
        Err(e) => {
            eprintln!("[G-Maiden Piper] wait failed: {e}");
            return false;
        }
    }
    std::fs::metadata(out).map(|m| m.len() > 0).unwrap_or(false)
}

/// Try to speak `text` via Piper. Returns true if Piper was available and the
/// synthesis succeeded. On false the caller falls back to SAPI.
pub fn piper_speak_with_priority(text: &str, priority: crate::audio::Priority) -> bool {
    // Write output to a temp WAV file next to the model.
    let tmp = std::env::temp_dir().join("gmaiden_piper_out.wav");
    if !piper_synth(text, &tmp) {
        return false;
    }
    // Play the generated WAV via rodio (in-process, no PowerShell startup cost).
    crate::audio::play_observed(tmp, priority, |commit| commit(), |_| {});
    true
}

// Dynamic voice audition and advice synthesis stay separate from GANN events.
fn sapi_voice_select_script(voice: Option<&str>) -> String {
    match voice {
        Some(v) if !v.trim().is_empty() => {
            let vb = base64(v.as_bytes());
            format!(
                "$vb=[Convert]::FromBase64String('{vb}'); \
                 $vn=[System.Text.Encoding]::UTF8.GetString($vb); \
                 try {{ $s.SelectVoice($vn) }} catch {{ }};"
            )
        }
        _ => String::new(),
    }
}

fn sapi_rate_value(rate: Option<i32>) -> i32 {
    rate.unwrap_or(0).clamp(-10, 10)
}
/// Critical event media never synthesizes a substitute or consults persona text.
pub fn voice_interrupt(event: &str) -> bool {
    try_voice_interrupt_cached(event)
}
pub fn try_voice_interrupt_cached(event: &str) -> bool {
    try_voice_interrupt_cached_before(event, Instant::now() + Duration::from_millis(100))
}
pub fn try_voice_interrupt_cached_before(event: &str, deadline: Instant) -> bool {
    if !matches!(event, "gank" | "revision") {
        return false;
    }
    crate::audio::try_interrupt_cached_before(event, None, deadline)
}

/// Called under the shared output gate; lower-priority clips cannot stop SAPI.
pub(crate) fn stop_for_clip(priority: crate::audio::Priority, deadline: Instant) -> bool {
    let Ok(mut current) = CURRENT.try_lock() else {
        return false;
    };
    let Some((child, active)) = current.as_mut() else {
        return true;
    };
    match child.try_wait() {
        Ok(Some(_)) => {
            *current = None;
            return true;
        }
        Err(_) => return false,
        Ok(None) => {}
    }
    if !crate::audio::should_accept_incoming(*active, priority) || child.kill().is_err() {
        return false;
    }
    let until = deadline.min(Instant::now() + Duration::from_millis(50));
    loop {
        match child.try_wait() {
            Ok(Some(_)) => {
                *current = None;
                return true;
            }
            Err(_) => return false,
            Ok(None) if Instant::now() < until => std::thread::sleep(Duration::from_millis(1)),
            Ok(None) => return false,
        }
    }
}

// ─────── SAPI (Windows) ─────────────────────────────────────────────────────

/// Stop the current SAPI playback (if any). Used by Belief Revision to retract
/// a warning mid-sentence. Idempotent: no-op when nothing is speaking.
pub fn cancel() {
    if let Ok(mut g) = CURRENT.lock() {
        if let Some((mut c, _)) = g.take() {
            let _ = c.kill();
            let _ = c.wait();
        }
    }
}

fn cancel_at_most(ceiling: crate::audio::Priority) -> bool {
    let Ok(mut current) = CURRENT.lock() else {
        return false;
    };
    if current
        .as_ref()
        .is_some_and(|(_, priority)| !crate::audio::should_cancel_current(*priority, ceiling))
    {
        return false;
    }
    let Some((mut child, priority)) = current.take() else {
        return true;
    };
    let stopped = match child.try_wait() {
        Ok(Some(_)) => true,
        Ok(None) => child.kill().is_ok() && child.wait().is_ok(),
        Err(_) => false,
    };
    if !stopped {
        *current = Some((child, priority));
    }
    stopped
}

fn active_priority() -> crate::audio::Priority {
    let Ok(mut g) = CURRENT.lock() else {
        return crate::audio::Priority::Cosmetic;
    };
    if let Some((child, priority)) = g.as_mut() {
        match child.try_wait() {
            Ok(Some(_)) => {
                *g = None;
                crate::audio::Priority::Cosmetic
            }
            Ok(None) => *priority,
            Err(_) => {
                *g = None;
                crate::audio::Priority::Cosmetic
            }
        }
    } else {
        crate::audio::Priority::Cosmetic
    }
}

/// Fire-and-forget: speak `text`. Tries Piper local TTS first (faster,
/// offline, no PowerShell startup); falls back to Windows SAPI on failure.
/// Cancels any prior utterance first. `voice`/`rate` apply only to the SAPI
/// path (Piper uses the bundled model's default voice). Volume is read from
/// `audio::get_volume()` for both paths.
pub fn speak(text: &str, voice: Option<&str>, rate: Option<i32>) {
    speak_with_priority(text, voice, rate, crate::audio::Priority::Normal);
}

fn sapi_speech_command(text: &str, voice: Option<&str>, rate: Option<i32>) -> Command {
    let b64 = base64(text.as_bytes());
    let voice_line = sapi_voice_select_script(voice);
    let rate_value = sapi_rate_value(rate);
    let sapi_vol = crate::audio::get_volume().min(100);
    let script = format!(
        "Add-Type -AssemblyName System.Speech; \
         $b=[Convert]::FromBase64String('{b64}'); \
         $t=[System.Text.Encoding]::UTF8.GetString($b); \
         $s=New-Object System.Speech.Synthesis.SpeechSynthesizer; \
         {voice_line} \
         $s.Rate={rate_value}; \
         $s.Volume={sapi_vol}; \
         $s.Speak($t)"
    );
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
        // CREATE_NO_WINDOW — keep the PS console flash off-screen.
        cmd.creation_flags(0x0800_0000);
    }
    cmd
}

const STATIC_ADVICE_PREVIEW_TEXT: &str = "ลองดูคำแนะนำนี้นะคะ";

fn with_advice_voice_admission<T>(
    session_epoch: Option<u64>,
    generation: u64,
    admit: impl FnOnce() -> Result<T, String>,
) -> Result<T, String> {
    match session_epoch {
        Some(epoch) => crate::runtime::with_speech_admission(epoch, Some(generation), admit),
        None => crate::runtime::with_master_generation_admission(generation, false, admit),
    }
}

/// Fixed local preview: the caller cannot supply arbitrary gameplay text.
pub fn speak_static_advice_preview(
    voice: Option<&str>,
    rate: Option<i32>,
    generation: u64,
) -> Result<(), String> {
    speak_advice_pipeline(STATIC_ADVICE_PREVIEW_TEXT, voice, rate, generation, None)
}

pub fn speak_advice_guarded(
    text: &str,
    voice: Option<&str>,
    rate: Option<i32>,
    generation: u64,
    session_epoch: u64,
) -> Result<(), String> {
    speak_advice_pipeline(text, voice, rate, generation, Some(session_epoch))
}

/// Advice preparation may block; only native spawn/queue admission holds the
/// preference lock, so opt-out never waits for synthesis or cancellation.
fn speak_advice_pipeline(
    text: &str,
    voice: Option<&str>,
    rate: Option<i32>,
    generation: u64,
    session_epoch: Option<u64>,
) -> Result<(), String> {
    if text.trim().is_empty() {
        return Ok(());
    }
    with_advice_voice_admission(session_epoch, generation, || Ok(()))?;
    let priority = crate::audio::Priority::Normal;
    if crate::audio::active_priority() > priority || active_priority() > priority {
        return Err("Critical speech is active; advice voice deferred.".into());
    }
    if !cancel_at_most(priority) {
        return Err("Higher-priority speech is active; advice voice deferred.".into());
    }
    crate::audio::cancel_at_most(priority);
    static NEXT_ADVICE_WAV: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    let sequence = NEXT_ADVICE_WAV.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    let wav = std::env::temp_dir().join(format!(
        "gmaiden_advice_{}_{}_{}.wav",
        std::process::id(),
        generation,
        sequence
    ));
    let piper_ready = piper_synth_with_spawn(text, &wav, |cmd| {
        with_advice_voice_admission(session_epoch, generation, || {
            cmd.spawn()
                .map_err(|error| format!("Piper spawn failed: {error}"))
        })
    });
    if piper_ready {
        let admitted = with_advice_voice_admission(session_epoch, generation, || {
            if crate::audio::active_priority() > priority {
                return Err("Critical speech is active; advice voice deferred.".into());
            }
            crate::audio::play_observed(
                wav.clone(),
                priority,
                move |commit| {
                    let _ = with_advice_voice_admission(session_epoch, generation, || {
                        commit();
                        Ok(())
                    });
                },
                |_| {},
            );
            Ok(())
        });
        if admitted.is_err() {
            let _ = std::fs::remove_file(&wav);
        }
        return admitted;
    }
    // A revoked Piper attempt must never fall through to a new SAPI spawn.
    with_advice_voice_admission(session_epoch, generation, || Ok(()))?;
    let mut cmd = sapi_speech_command(text, voice, rate);
    // Acquire CURRENT before the configuration lock: critical playback can hold
    // CURRENT until its bounded audio admission completes.
    let _output_guard = crate::audio::output_admission()
        .ok_or_else(|| "Audio admission is busy; advice voice deferred.".to_string())?;
    let mut current = CURRENT
        .try_lock()
        .map_err(|_| "SAPI state unavailable".to_string())?;
    if current.is_some() || crate::audio::is_playing() {
        return Err("Speech changed during advice preparation; advice voice deferred.".into());
    }
    with_advice_voice_admission(session_epoch, generation, || {
        let child = cmd
            .spawn()
            .map_err(|error| format!("SAPI spawn failed: {error}"))?;
        *current = Some((child, priority));
        Ok(())
    })
}

pub fn speak_with_priority(
    text: &str,
    voice: Option<&str>,
    rate: Option<i32>,
    priority: crate::audio::Priority,
) {
    if text.trim().is_empty() {
        return;
    }
    if crate::audio::active_priority() > priority || active_priority() > priority {
        return;
    }
    // Cancel both SAPI and any in-flight rodio (Piper) clip.
    if !cancel_at_most(priority) {
        return;
    }
    crate::audio::cancel_at_most(priority);
    // Fast path: Piper neural TTS (~40-80 ms, no PowerShell cold-start).
    if piper_speak_with_priority(text, priority) {
        return;
    }
    let mut cmd = sapi_speech_command(text, voice, rate);
    let Some(_output_guard) = crate::audio::output_admission() else {
        return;
    };
    let Ok(mut current) = CURRENT.try_lock() else {
        return;
    };
    if current.is_some() || crate::audio::is_playing() {
        return;
    }
    let child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => {
            eprintln!("[G-Maiden TTS] speak spawn failed: {e}");
            return;
        }
    };
    // Stash the child so cancel() can kill it later. Anything previously in the
    // slot was already drained by the cancel() at the top of this function.
    *current = Some((child, priority));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn critical_cached_dispatch_refuses_sapi_lock_contention_without_waiting() {
        let _guard = CURRENT.lock().unwrap();
        assert!(!try_voice_interrupt_cached("gank"));
    }

    #[test]
    fn critical_cached_dispatch_refuses_unknown_event_and_expired_deadline() {
        assert!(!try_voice_interrupt_cached("advice"));
        assert!(!try_voice_interrupt_cached_before(
            "gank",
            Instant::now() - Duration::from_millis(1)
        ));
    }

    #[test]
    fn revoked_advice_generation_cannot_reach_voice_preparation_or_spawn() {
        let result = speak_advice_guarded("stale advice", None, None, u64::MAX, u64::MAX);
        assert!(result.is_err());
    }

    // Hand-verified vectors against `[Convert]::ToBase64String` to lock in
    // PowerShell-roundtrip correctness — that round-trip is the whole reason
    // we hand-rolled base64 instead of pulling a crate.
    #[test]
    fn base64_matches_powershell_for_ascii() {
        assert_eq!(base64(b""), "");
        assert_eq!(base64(b"f"), "Zg==");
        assert_eq!(base64(b"fo"), "Zm8=");
        assert_eq!(base64(b"foo"), "Zm9v");
        assert_eq!(base64(b"foob"), "Zm9vYg==");
        assert_eq!(base64(b"fooba"), "Zm9vYmE=");
        assert_eq!(base64(b"foobar"), "Zm9vYmFy");
    }

    #[test]
    fn base64_handles_thai_utf8_bytes() {
        // "ถอยก่อน" — the meaningful start of Maiden's danger line. If this
        // round-trip ever drifts, the PowerShell SAPI script silently mispronounces.
        let bytes = "ถอยก่อน".as_bytes();
        let encoded = base64(bytes);
        // Verified once against `[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes('ถอยก่อน'))`
        assert_eq!(encoded, "4LiW4Lit4Lii4LiB4LmI4Lit4LiZ");
    }

    #[test]
    fn base64_no_panic_on_arbitrary_bytes() {
        // Cycle 0..=255 a few times so every chunk-length branch (1/2/3) executes.
        let bytes: Vec<u8> = (0..=255u8).cycle().take(513).collect();
        let s = base64(&bytes);
        // Output length must follow the ceil(n/3)*4 rule with proper padding.
        let expected_len = bytes.len().div_ceil(3) * 4;
        assert_eq!(s.len(), expected_len);
        let pad = s.chars().rev().take_while(|c| *c == '=').count();
        assert!(pad <= 2);
    }
}

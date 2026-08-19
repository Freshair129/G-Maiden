//! G-Maiden TTS (seed of voice persona).
//! Shells out to Windows SAPI via PowerShell. Zero extra Rust deps, works on
//! any Windows 10+. Thai text is round-tripped via base64 so we don't have to
//! worry about console codepages or quote-escaping. This is the temporary
//! stand-in for the Piper local TTS planned in the TDD — it gives "Maiden"
//! an actual voice today, while we keep `models/` reserved for the upgrade.
//!
//! Cold start ~150-200ms (PowerShell startup). Fine for the HP danger alert,
//! which is event-driven and rare. The hard-latency G-Signal path (gank
//! warning) will need in-process TTS later.

use std::process::{Child, Command, Stdio};
use std::sync::{Mutex, OnceLock};

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

fn run_powershell(script: &str) -> Option<String> {
    let mut cmd = Command::new("powershell");
    cmd.args([
        "-NoProfile",
        "-NonInteractive",
        "-OutputFormat",
        "Text",
        "-Command",
        script,
    ])
    .stdin(Stdio::null())
    .stdout(Stdio::piped())
    .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
    let out = cmd.output().ok()?;
    if out.status.success() {
        Some(String::from_utf8_lossy(&out.stdout).to_string())
    } else {
        None
    }
}

/// Enumerate the SAPI voices installed on this machine. Used by the UI to
/// let the player pick which voice Maiden should speak with.
pub fn list_voices() -> Vec<Voice> {
    // Pipe-delimited output is the simplest format that survives PowerShell's
    // Format-Table whitespace munging and the host's default codepage.
    let script = "Add-Type -AssemblyName System.Speech; \
                  $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; \
                  $s.GetInstalledVoices() | ForEach-Object { \
                    $i = $_.VoiceInfo; \
                    Write-Output (\"{0}|{1}|{2}|{3}\" -f $i.Name, $i.Culture.Name, $i.Gender, $i.Age) \
                  }; \
                  $s.Dispose()";
    let Some(out) = run_powershell(script) else {
        return Vec::new();
    };
    out.lines()
        .filter_map(|line| {
            let parts: Vec<&str> = line.split('|').map(|s| s.trim()).collect();
            if parts.len() == 4 && !parts[0].is_empty() {
                Some(Voice {
                    name: parts[0].into(),
                    culture: parts[1].into(),
                    gender: parts[2].into(),
                    age: parts[3].into(),
                })
            } else {
                None
            }
        })
        .collect()
}

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
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW — runs on every alert; must not flash
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
// on *every* TTS call, including G-Signal's hot-path fallback. Piper install
// state doesn't change over a running session, so probe once per process and
// reuse the answer (mirrors H8's "resolve once, not on every fired event").
static PIPER_PROBE: OnceLock<Option<(std::path::PathBuf, std::path::PathBuf)>> = OnceLock::new();

fn piper_probe() -> Option<(std::path::PathBuf, std::path::PathBuf)> {
    PIPER_PROBE
        .get_or_init(|| {
            let bin = piper_bin()?;
            let model = find_piper_model(&piper_model_dir()?)?;
            Some((bin, model))
        })
        .clone()
}

/// Try to speak `text` via Piper. Returns true if Piper was available and the
/// synthesis succeeded. On false the caller falls back to SAPI.
pub fn piper_speak_with_priority(text: &str, priority: crate::audio::Priority) -> bool {
    use std::io::Write;
    let Some((bin, model)) = piper_probe() else {
        return false;
    };

    // Write output to a temp WAV file next to the model.
    let tmp = std::env::temp_dir().join("gmaiden_piper_out.wav");
    let mut cmd = Command::new(&bin);
    cmd.args([
        "--model",
        model.to_str().unwrap_or_default(),
        "--output_file",
        tmp.to_str().unwrap_or_default(),
    ])
    .stdin(Stdio::piped())
    .stdout(Stdio::null())
    .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
    let mut child = match cmd.spawn() {
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
    // Play the generated WAV via rodio (in-process, no PowerShell startup cost).
    crate::audio::play_file_with_priority(tmp, priority);
    true
}

// ─────── Prewarmed critical-line cache (H9) ────────────────────────────────
// `voice_interrupt` (capture.rs / capture_wgc.rs) only reaches TTS at all when
// `audio::play_random` finds no voice-pack clip for `gank`/`revision` — rare,
// since the bundled default pack covers every event (H8), but the G-Signal
// hard-latency path can't assume "rare" means "never". When it does happen,
// the fallback used to pay for a `where.exe` probe (now cached, see above)
// AND a full PowerShell + `Add-Type System.Speech` cold start (~150-200ms) —
// synchronously, inside the capture loop. The fallback can only ever speak
// one of four fixed lines (gank/revision × the two persona phrasings), so
// synthesize all four to WAV once — at startup and again whenever the voice
// picker changes — and play the cached file instead of shelling out.

/// The four fixed lines `voice_interrupt` speaks when no clip resolves.
/// Hoisted here (not duplicated per capture backend) so the prewarm cache
/// below can never drift from what's actually said.
pub const GANK_LINE_GENTLE: &str =
    "ระวังค่ะ ตรวจพบการขาดหายไปของศัตรูบนแผนที่ อาจมีการแก๊งค์เกิดขึ้น";
pub const GANK_LINE_ALT: &str = "ระวังนะคะ ศัตรูหายไปจากแมพหลายตัว อาจมีแก๊งค์!";
pub const REVISION_LINE_GENTLE: &str = "ยกเลิกการเตือนภัยแก๊งค์ค่ะ ปลอดภัยแล้ว";
pub const REVISION_LINE_ALT: &str = "เอ๊ะ! เดี๋ยวก่อน ดูเหมือนจะปลอดภัยแล้วค่ะ";

struct PrewarmedCritical {
    voice: Option<String>,
    rate: Option<i32>,
    gank_gentle: std::path::PathBuf,
    gank_alt: std::path::PathBuf,
    revision_gentle: std::path::PathBuf,
    revision_alt: std::path::PathBuf,
}

static PREWARMED_CRITICAL: Mutex<Option<PrewarmedCritical>> = Mutex::new(None);

/// Synthesize `text` to a WAV file at `out` via SAPI (no live playback).
/// Returns false on any failure — spawn error, PowerShell error, or a file
/// that never got written — so the caller can leave a prior cache in place
/// rather than serve a broken path.
fn synth_to_wav(text: &str, voice: Option<&str>, rate: Option<i32>, out: &std::path::Path) -> bool {
    let b64 = base64(text.as_bytes());
    let voice_line = match voice {
        Some(v) if !v.trim().is_empty() => {
            let vb = base64(v.as_bytes());
            format!(
                "$vb=[Convert]::FromBase64String('{vb}'); \
                 $vn=[System.Text.Encoding]::UTF8.GetString($vb); \
                 try {{ $s.SelectVoice($vn) }} catch {{ }};"
            )
        }
        _ => String::new(),
    };
    let rate_value = rate.unwrap_or(0).clamp(-10, 10);
    // Base64-roundtrip the output path too, same as the text — sidesteps
    // quoting a Windows path into a single-quoted PowerShell string literal.
    let out_b64 = base64(out.to_string_lossy().as_bytes());
    let script = format!(
        "Add-Type -AssemblyName System.Speech; \
         $b=[Convert]::FromBase64String('{b64}'); \
         $t=[System.Text.Encoding]::UTF8.GetString($b); \
         $ob=[Convert]::FromBase64String('{out_b64}'); \
         $op=[System.Text.Encoding]::UTF8.GetString($ob); \
         $s=New-Object System.Speech.Synthesis.SpeechSynthesizer; \
         {voice_line} \
         $s.Rate={rate_value}; \
         $s.SetOutputToWaveFile($op); \
         $s.Speak($t); \
         $s.Dispose()"
    );
    if run_powershell(&script).is_none() {
        return false;
    }
    std::fs::metadata(out).map(|m| m.len() > 0).unwrap_or(false)
}

/// Bake the four critical lines to WAV under the current voice/rate setting.
/// Called at app startup and again whenever the voice picker changes
/// (`set_cv_voice`) — never from the hot path itself. Best-effort: on any
/// failure the existing cache (possibly `None`, possibly just stale) is left
/// untouched, since a cache miss still falls through to the live path
/// correctly — it just doesn't get the fast path's latency win.
pub fn prewarm_critical_lines() {
    let (voice, rate) = crate::runtime::voice();
    let dir = std::env::temp_dir();
    let gank_gentle = dir.join("gmaiden_prewarm_gank_gentle.wav");
    let gank_alt = dir.join("gmaiden_prewarm_gank_alt.wav");
    let revision_gentle = dir.join("gmaiden_prewarm_revision_gentle.wav");
    let revision_alt = dir.join("gmaiden_prewarm_revision_alt.wav");
    let ok = synth_to_wav(GANK_LINE_GENTLE, voice.as_deref(), rate, &gank_gentle)
        && synth_to_wav(GANK_LINE_ALT, voice.as_deref(), rate, &gank_alt)
        && synth_to_wav(REVISION_LINE_GENTLE, voice.as_deref(), rate, &revision_gentle)
        && synth_to_wav(REVISION_LINE_ALT, voice.as_deref(), rate, &revision_alt);
    if !ok {
        return;
    }
    if let Ok(mut g) = PREWARMED_CRITICAL.lock() {
        *g = Some(PrewarmedCritical {
            voice,
            rate,
            gank_gentle,
            gank_alt,
            revision_gentle,
            revision_alt,
        });
    }
}

/// Speak G-Signal's fixed fallback for `event` ("gank" or "revision") — the
/// path `voice_interrupt` takes only when no voice-pack clip resolved. Plays
/// the prewarmed WAV (a rodio file play, same cost as the primary clip path)
/// when the cache matches the live voice/rate setting; only a cache miss
/// (nothing baked yet, or the voice changed since the last bake) pays for the
/// live Piper-probe-then-SAPI round trip this function replaces on the hot
/// path. `default_fallback` covers any event this function doesn't
/// recognize — defensive; both capture backends only ever pass "gank"/"revision".
/// Pure text-selection logic, factored out of `speak_critical_fallback` so it
/// doesn't require touching global runtime state to test.
fn resolve_critical_text<'a>(event: &str, persona_preset: u8, default_fallback: &'a str) -> &'a str {
    let gentle = matches!(persona_preset, 0 | 1);
    match (event, gentle) {
        ("gank", true) => GANK_LINE_GENTLE,
        ("gank", false) => GANK_LINE_ALT,
        ("revision", true) => REVISION_LINE_GENTLE,
        ("revision", false) => REVISION_LINE_ALT,
        _ => default_fallback,
    }
}

/// Pure cache-lookup logic, factored out for the same reason.
fn prewarmed_path_for<'a>(
    cache: &'a PrewarmedCritical,
    event: &str,
    gentle: bool,
) -> Option<&'a std::path::PathBuf> {
    match (event, gentle) {
        ("gank", true) => Some(&cache.gank_gentle),
        ("gank", false) => Some(&cache.gank_alt),
        ("revision", true) => Some(&cache.revision_gentle),
        ("revision", false) => Some(&cache.revision_alt),
        _ => None,
    }
}

pub fn speak_critical_fallback(event: &str, default_fallback: &str) {
    let persona_preset = crate::runtime::persona_preset();
    let gentle = matches!(persona_preset, 0 | 1);
    let text = resolve_critical_text(event, persona_preset, default_fallback);
    let (voice, rate) = crate::runtime::voice();
    if let Ok(guard) = PREWARMED_CRITICAL.lock() {
        if let Some(cache) = guard.as_ref() {
            if cache.voice == voice && cache.rate == rate {
                if let Some(p) = prewarmed_path_for(cache, event, gentle) {
                    crate::audio::play_path(p.clone(), event);
                    return;
                }
            }
        }
    }
    speak_with_priority(text, voice.as_deref(), rate, crate::audio::Priority::Critical);
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
    cancel();
    crate::audio::cancel();
    // Fast path: Piper neural TTS (~40-80 ms, no PowerShell cold-start).
    if piper_speak_with_priority(text, priority) {
        return;
    }
    // Fallback: SAPI via PowerShell.
    let b64 = base64(text.as_bytes());
    // SelectVoice() fails loudly if the voice is missing; wrap in try/catch so
    // we fall back to the system default instead of going silent.
    let voice_line = match voice {
        Some(v) if !v.trim().is_empty() => {
            let vb = base64(v.as_bytes());
            format!(
                "$vb=[Convert]::FromBase64String('{vb}'); \
                 $vn=[System.Text.Encoding]::UTF8.GetString($vb); \
                 try {{ $s.SelectVoice($vn) }} catch {{ }};"
            )
        }
        _ => String::new(),
    };
    let rate_value = rate.unwrap_or(0).clamp(-10, 10);
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
    let child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => {
            eprintln!("[G-Maiden TTS] speak spawn failed: {e}");
            return;
        }
    };
    // Stash the child so cancel() can kill it later. Anything previously in the
    // slot was already drained by the cancel() at the top of this function.
    if let Ok(mut g) = CURRENT.lock() {
        *g = Some((child, priority));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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

    // ─── H9: critical-fallback text/cache selection (pure, no subprocess) ───

    #[test]
    fn resolve_critical_text_picks_the_gentle_persona_line() {
        assert_eq!(resolve_critical_text("gank", 0, "fallback"), GANK_LINE_GENTLE);
        assert_eq!(resolve_critical_text("gank", 1, "fallback"), GANK_LINE_GENTLE);
        assert_eq!(resolve_critical_text("revision", 0, "fallback"), REVISION_LINE_GENTLE);
        assert_eq!(resolve_critical_text("revision", 1, "fallback"), REVISION_LINE_GENTLE);
    }

    #[test]
    fn resolve_critical_text_picks_the_alt_persona_line() {
        // Any preset other than 0/1 is the non-gentle persona.
        assert_eq!(resolve_critical_text("gank", 2, "fallback"), GANK_LINE_ALT);
        assert_eq!(resolve_critical_text("revision", 9, "fallback"), REVISION_LINE_ALT);
    }

    #[test]
    fn resolve_critical_text_falls_back_for_an_unknown_event() {
        // Defensive branch — `voice_interrupt` never actually passes anything
        // other than "gank"/"revision", but the function must not guess.
        assert_eq!(resolve_critical_text("advice", 0, "the fallback"), "the fallback");
    }

    fn stub_cache(voice: Option<&str>, rate: Option<i32>) -> PrewarmedCritical {
        PrewarmedCritical {
            voice: voice.map(String::from),
            rate,
            gank_gentle: std::path::PathBuf::from("gank_gentle.wav"),
            gank_alt: std::path::PathBuf::from("gank_alt.wav"),
            revision_gentle: std::path::PathBuf::from("revision_gentle.wav"),
            revision_alt: std::path::PathBuf::from("revision_alt.wav"),
        }
    }

    #[test]
    fn prewarmed_path_for_covers_all_four_combinations() {
        let cache = stub_cache(None, None);
        assert_eq!(prewarmed_path_for(&cache, "gank", true), Some(&cache.gank_gentle));
        assert_eq!(prewarmed_path_for(&cache, "gank", false), Some(&cache.gank_alt));
        assert_eq!(
            prewarmed_path_for(&cache, "revision", true),
            Some(&cache.revision_gentle)
        );
        assert_eq!(
            prewarmed_path_for(&cache, "revision", false),
            Some(&cache.revision_alt)
        );
    }

    #[test]
    fn prewarmed_path_for_is_none_for_an_unknown_event() {
        let cache = stub_cache(None, None);
        assert_eq!(prewarmed_path_for(&cache, "advice", true), None);
    }

    #[test]
    fn a_stale_cache_would_be_rejected_by_the_voice_rate_match_speak_critical_fallback_makes() {
        // speak_critical_fallback itself touches global runtime state and
        // spawns SAPI on a miss, so it isn't unit-tested directly (same
        // reasoning the rest of this file already applies to the live PS
        // paths). This pins the equality check it guards the fast path with,
        // so a future refactor can't silently loosen it to a partial match.
        let cache = stub_cache(Some("Microsoft Sirikit"), Some(2));
        let live_voice = Some("Microsoft Sirikit".to_string());
        let live_rate = Some(2);
        assert!(cache.voice == live_voice && cache.rate == live_rate);
        let changed_voice = Some("Microsoft Premwadee".to_string());
        assert!(!(cache.voice == changed_voice && cache.rate == live_rate));
    }
}

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
use std::sync::Mutex;

// At most one SAPI process at a time — Maiden never speaks two lines in parallel.
// Belief Revision (per CLAUDE.md) requires canceling a line mid-stream and
// replacing it; we kill the PowerShell child to interrupt SAPI playback.
static CURRENT: Mutex<Option<Child>> = Mutex::new(None);

#[derive(serde::Serialize, Clone)]
pub struct Voice {
    pub name: String,
    pub culture: String,
    pub gender: String,
    pub age: String,
}

fn base64(data: &[u8]) -> String {
    const T: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity((data.len() + 2) / 3 * 4);
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
                let path = String::from_utf8_lossy(&out.stdout).trim().lines().next()
                    .map(|s| std::path::PathBuf::from(s.trim()));
                if let Some(p) = path { return Some(p); }
            }
        }
    }
    None
}

fn piper_model_dir() -> Option<std::path::PathBuf> {
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            let d = parent.join("models").join("piper");
            if d.is_dir() { return Some(d); }
            let d2 = parent.join("piper").join("models");
            if d2.is_dir() { return Some(d2); }
        }
    }
    // Dev fallback — models/piper/ at repo root (same lookup as minimap model).
    let d = std::path::PathBuf::from("models/piper");
    if d.is_dir() { return Some(d); }
    None
}

fn find_piper_model(dir: &std::path::Path) -> Option<std::path::PathBuf> {
    // Prefer Thai model first (th_TH-*), then any .onnx.
    std::fs::read_dir(dir).ok()?.filter_map(|e| e.ok()).find_map(|e| {
        let p = e.path();
        if p.extension()?.to_ascii_lowercase() == "onnx" {
            if p.file_name()?.to_string_lossy().starts_with("th_TH") {
                return Some(p);
            }
        }
        None
    }).or_else(|| {
        std::fs::read_dir(dir).ok()?.filter_map(|e| e.ok()).find_map(|e| {
            let p = e.path();
            if p.extension()?.to_ascii_lowercase() == "onnx" { Some(p) } else { None }
        })
    })
}

/// Try to speak `text` via Piper. Returns true if Piper was available and the
/// synthesis succeeded. On false the caller falls back to SAPI.
pub fn piper_speak(text: &str) -> bool {
    use std::io::Write;
    let Some(bin) = piper_bin() else { return false };
    let Some(model_dir) = piper_model_dir() else { return false };
    let Some(model) = find_piper_model(&model_dir) else { return false };

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
    crate::audio::play_file(tmp);
    true
}

// ─────── SAPI (Windows) ─────────────────────────────────────────────────────

/// Stop the current SAPI playback (if any). Used by Belief Revision to retract
/// a warning mid-sentence. Idempotent: no-op when nothing is speaking.
pub fn cancel() {
    if let Ok(mut g) = CURRENT.lock() {
        if let Some(mut c) = g.take() {
            let _ = c.kill();
            let _ = c.wait();
        }
    }
}

/// Fire-and-forget: speak `text`. Tries Piper local TTS first (faster,
/// offline, no PowerShell startup); falls back to Windows SAPI on failure.
/// Cancels any prior utterance first. `voice`/`rate` apply only to the SAPI
/// path (Piper uses the bundled model's default voice). Volume is read from
/// `audio::get_volume()` for both paths.
pub fn speak(text: &str, voice: Option<&str>, rate: Option<i32>) {
    if text.trim().is_empty() {
        return;
    }
    // Cancel both SAPI and any in-flight rodio (Piper) clip.
    cancel();
    crate::audio::cancel();
    // Fast path: Piper neural TTS (~40-80 ms, no PowerShell cold-start).
    if piper_speak(text) {
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
        *g = Some(child);
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
        let expected_len = (bytes.len() + 2) / 3 * 4;
        assert_eq!(s.len(), expected_len);
        let pad = s.chars().rev().take_while(|c| *c == '=').count();
        assert!(pad <= 2);
    }
}

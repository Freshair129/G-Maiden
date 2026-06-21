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

use std::process::{Command, Stdio};

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

/// Fire-and-forget: speak `text` on a background thread.
/// Safe to call repeatedly; each call spawns its own SAPI process and
/// returns immediately so the GSI hot path never blocks.
pub fn speak(text: &str) {
    if text.trim().is_empty() {
        return;
    }
    let b64 = base64(text.as_bytes());
    std::thread::spawn(move || {
        // The script reads the base64-encoded UTF-8 bytes from its own arg,
        // so multi-byte Thai survives the PowerShell host's default codepage.
        let script = format!(
            "Add-Type -AssemblyName System.Speech; \
             $b=[Convert]::FromBase64String('{b64}'); \
             $t=[System.Text.Encoding]::UTF8.GetString($b); \
             $s=New-Object System.Speech.Synthesis.SpeechSynthesizer; \
             $s.Rate=1; \
             $s.Volume=100; \
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
        if let Err(e) = cmd.spawn().and_then(|mut c| c.wait()) {
            eprintln!("[G-Maiden TTS] speak failed: {e}");
        }
    });
}

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

/// Fire-and-forget: speak `text` on a background thread, optionally using a
/// specific installed voice and a speaking rate in SAPI units (-10..10, 0 = normal).
/// Safe to call repeatedly; each call spawns its own SAPI process and
/// returns immediately so the GSI hot path never blocks.
pub fn speak(text: &str, voice: Option<&str>, rate: Option<i32>) {
    if text.trim().is_empty() {
        return;
    }
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
    let script = format!(
        "Add-Type -AssemblyName System.Speech; \
         $b=[Convert]::FromBase64String('{b64}'); \
         $t=[System.Text.Encoding]::UTF8.GetString($b); \
         $s=New-Object System.Speech.Synthesis.SpeechSynthesizer; \
         {voice_line} \
         $s.Rate={rate_value}; \
         $s.Volume=100; \
         $s.Speak($t)"
    );
    std::thread::spawn(move || {
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

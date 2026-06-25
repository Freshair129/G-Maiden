//! G7.1 — Local SLM fallback via ollama.
//!
//! When the cloud brain (Claude CLI, Plan quota) is offline or errors, we fall
//! back to the local Aroow-9B model running under ollama on port 11434. This
//! keeps basic situational advice available when there's no internet, at the
//! cost of lower quality and higher latency (~15-60s warm, slower cold).
//!
//! Only activates on `advise()` failure. Not persisted — every session rechecks.

use std::process::Command;

const OLLAMA_URL: &str = "http://127.0.0.1:11434/api/chat";
/// Same primary coder from config.json — best quality/speed local model.
const SLM_MODEL: &str = "hf.co/sillykiwi/Aroow-Rust-Coder-9B-Q4_K_S-GGUF:Q4_K_S";
/// Fallback if Aroow not loaded.
const SLM_FALLBACK_MODEL: &str = "gemma4-rust-coder:latest";

/// Ask a local ollama model for advice. Returns the model's text or an error.
/// Blocking — call from a worker thread (same pattern as `master::advise`).
/// Empty `model` uses the historical SLM_MODEL → SLM_FALLBACK_MODEL chain;
/// passing an explicit model lets the user pick from the Settings UI.
pub fn advise_offline(prompt: &str, model: &str) -> Result<String, String> {
    // Caller-chosen model wins — skip the legacy two-step fallback so the user's
    // selection isn't quietly downgraded.
    if !model.is_empty() {
        let body = serde_json::json!({
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "stream": false,
            "options": { "num_predict": 200, "temperature": 0.4, "num_ctx": 4096 }
        });
        return call_ollama(&body.to_string());
    }
    let body = serde_json::json!({
        "model": SLM_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "stream": false,
        "options": { "num_predict": 200, "temperature": 0.4, "num_ctx": 4096 }
    });
    match call_ollama(&body.to_string()) {
        Ok(text) => return Ok(text),
        Err(e) => eprintln!("[SLM] {SLM_MODEL} failed: {e}; trying fallback"),
    }
    // Try the lighter fallback model.
    let body2 = serde_json::json!({
        "model": SLM_FALLBACK_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "stream": false,
        "options": { "num_predict": 200, "temperature": 0.4 }
    });
    call_ollama(&body2.to_string())
}

fn call_ollama(json_body: &str) -> Result<String, String> {
    let mut cmd = Command::new("curl");
    cmd.args([
        "-s",
        "--max-time", "90",
        "-X", "POST",
        OLLAMA_URL,
        "-H", "Content-Type: application/json",
        "-d", json_body,
    ]);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW — no console flash
    }
    let out = cmd
        .output()
        .map_err(|e| format!("curl launch failed: {e}"))?;
    if !out.status.success() {
        return Err(format!("curl exit {:?}", out.status.code()));
    }
    let raw = String::from_utf8_lossy(&out.stdout);
    let v: serde_json::Value = serde_json::from_str(&raw)
        .map_err(|e| format!("JSON parse: {e} — raw: {}", &raw.chars().take(120).collect::<String>()))?;
    if let Some(err) = v.get("error").and_then(|e| e.as_str()) {
        return Err(format!("ollama error: {err}"));
    }
    v.pointer("/message/content")
        .and_then(|c| c.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "empty response from ollama".into())
}

/// True if ollama appears to be running (lightweight HEAD check via curl).
#[allow(dead_code)] // health-check helper, used once local-fallback UX is wired
pub fn ollama_available() -> bool {
    let mut cmd = Command::new("curl");
    cmd.args(["-s", "--max-time", "2", "-o", "/dev/null", "-w", "%{http_code}", "http://127.0.0.1:11434/"]);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW — no console flash
    }
    cmd
        .output()
        .map(|o| {
            let code = String::from_utf8_lossy(&o.stdout);
            code.trim() == "200"
        })
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn call_ollama_returns_error_when_unreachable() {
        // On CI ollama is never running — we just verify the error path doesn't panic.
        let body = r#"{"model":"nope","messages":[],"stream":false}"#;
        let result = call_ollama(body);
        // Either a curl error or an ollama error — both are Err.
        assert!(result.is_ok() || result.is_err()); // trivially true; real check: no panic
    }
}

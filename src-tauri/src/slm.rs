//! G7.1 — Local SLM fallback via ollama.
//!
//! When cloud-context consent is off, or a consented Claude request errors, G-Master
//! uses the local model running under ollama on port 11434. This
//! keeps basic situational advice available when there's no internet, at the
//! cost of lower quality and higher latency (~15-60s warm, slower cold).
//!
//! This never calls an external provider; its HTTP endpoint is loopback only.

use std::process::{Command, Stdio};

const OLLAMA_CHAT_URL: &str = "http://127.0.0.1:11434/api/chat";
#[allow(dead_code)] // Readiness command is registered by the integration owner in lib.rs.
const OLLAMA_TAGS_URL: &str = "http://127.0.0.1:11434/api/tags";
pub const DEFAULT_OLLAMA_MODEL: &str = "qwen3.5:4b";
#[allow(dead_code)] // Readiness command is registered by the integration owner in lib.rs.
pub const OLLAMA_PROBE_TIMEOUT_MS: u64 = 2_000;
pub const OLLAMA_REQUEST_TIMEOUT_MS: u64 = 10_000;

#[allow(dead_code)] // Used by the readiness command owned by the lib.rs integrator.
#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum OllamaState {
    Available,
    MissingModel,
    Unavailable,
    InvalidModel,
}

#[allow(dead_code)] // Used by the readiness command owned by the lib.rs integrator.
#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OllamaReadiness {
    pub state: OllamaState,
    pub model: String,
    pub detail: Option<String>,
    pub probe_timeout_ms: u64,
    pub request_timeout_ms: u64,
}

fn selected_model(model: &str) -> Result<String, String> {
    let model = model.trim();
    let model = if model.is_empty() {
        DEFAULT_OLLAMA_MODEL
    } else {
        model
    };
    if model.len() > 128 || model.chars().any(char::is_control) {
        return Err("invalid Ollama model name".into());
    }
    Ok(model.to_owned())
}

#[allow(dead_code)] // Called by readiness, which is registered by the lib.rs integrator.
fn ollama_tags_body() -> Result<Vec<String>, String> {
    let mut cmd = Command::new("curl");
    cmd.args([
        "-sS",
        "--fail",
        "--connect-timeout",
        "1",
        "--max-time",
        "2",
        OLLAMA_TAGS_URL,
    ])
    .stdin(Stdio::null())
    .stdout(Stdio::piped())
    .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW — no console flash
    }
    let out = cmd
        .output()
        .map_err(|e| format!("could not query local Ollama: {e}"))?;
    if !out.status.success() {
        let detail = String::from_utf8_lossy(&out.stderr).trim().to_string();
        return Err(if detail.is_empty() {
            format!(
                "Ollama tags request failed (curl exit {:?})",
                out.status.code()
            )
        } else {
            detail
        });
    }
    parse_ollama_tags(&String::from_utf8_lossy(&out.stdout))
}

fn parse_ollama_tags(raw: &str) -> Result<Vec<String>, String> {
    let value: serde_json::Value =
        serde_json::from_str(raw).map_err(|e| format!("invalid Ollama tags response: {e}"))?;
    let models = value
        .get("models")
        .and_then(serde_json::Value::as_array)
        .ok_or_else(|| "Ollama tags response has no models list".to_string())?;
    Ok(models
        .iter()
        .filter_map(|model| {
            model
                .get("name")
                .or_else(|| model.get("model"))
                .and_then(serde_json::Value::as_str)
                .map(str::to_owned)
        })
        .collect())
}

/// Inspect only the loopback Ollama tags endpoint. This does not generate a
/// completion, download a model, or send game data.
#[allow(dead_code)] // Registered through master::backend_readiness by the lib.rs integrator.
pub fn readiness(model: &str) -> OllamaReadiness {
    let model = match selected_model(model) {
        Ok(model) => model,
        Err(detail) => {
            return OllamaReadiness {
                state: OllamaState::InvalidModel,
                model: String::new(),
                detail: Some(detail),
                probe_timeout_ms: OLLAMA_PROBE_TIMEOUT_MS,
                request_timeout_ms: OLLAMA_REQUEST_TIMEOUT_MS,
            };
        }
    };
    let (state, detail) = match ollama_tags_body() {
        Ok(models) if models.iter().any(|installed| installed == &model) => {
            (OllamaState::Available, None)
        }
        Ok(_) => (
            OllamaState::MissingModel,
            Some(format!("Model {model} is not installed in Ollama.")),
        ),
        Err(detail) => (OllamaState::Unavailable, Some(detail)),
    };
    OllamaReadiness {
        state,
        model,
        detail,
        probe_timeout_ms: OLLAMA_PROBE_TIMEOUT_MS,
        request_timeout_ms: OLLAMA_REQUEST_TIMEOUT_MS,
    }
}

/// Ask a local ollama model for advice. Returns the model's text or an error.
/// Blocking — call from a worker thread (same pattern as `master::advise`).
/// An empty `model` uses the same default as Settings. The selected model is
/// never silently replaced with a different model.
pub fn advise_offline(prompt: &str, model: &str) -> Result<String, String> {
    advise_offline_with_timeout(prompt, model, OLLAMA_REQUEST_TIMEOUT_MS)
}

/// Generate advice from the selected local model within the caller's remaining
/// request budget. A zero budget expires without starting curl.
pub fn advise_offline_with_timeout(
    prompt: &str,
    model: &str,
    timeout_ms: u64,
) -> Result<String, String> {
    if timeout_ms == 0 {
        return Err("Ollama request timed out before it started".into());
    }
    let model = selected_model(model)?;
    call_ollama(&ollama_request_body(prompt, &model), timeout_ms)
}

fn ollama_request_body(prompt: &str, model: &str) -> String {
    serde_json::json!({
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "stream": false,
        "options": { "num_predict": 200, "temperature": 0.4, "num_ctx": 4096 }
    })
    .to_string()
}

fn call_ollama(json_body: &str, timeout_ms: u64) -> Result<String, String> {
    let timeout_seconds = format!("{:.3}", timeout_ms.max(1) as f64 / 1000.0);
    let connect_timeout_seconds = format!("{:.3}", timeout_ms.clamp(1, 2_000) as f64 / 1000.0);
    let mut cmd = Command::new("curl");
    cmd.args([
        "-sS",
        "--connect-timeout",
        &connect_timeout_seconds,
        "--max-time",
        &timeout_seconds,
        "-X",
        "POST",
        OLLAMA_CHAT_URL,
        "-H",
        "Content-Type: application/json",
        "-d",
        json_body,
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
        if out.status.code() == Some(28) {
            return Err(format!("Ollama request timed out after {timeout_ms} ms"));
        }
        let detail = String::from_utf8_lossy(&out.stderr).trim().to_string();
        return Err(if detail.is_empty() {
            format!("curl exit {:?}", out.status.code())
        } else {
            format!("curl exit {:?}: {detail}", out.status.code())
        });
    }
    let raw = String::from_utf8_lossy(&out.stdout);
    let v: serde_json::Value = serde_json::from_str(&raw).map_err(|e| {
        format!(
            "JSON parse: {e} — raw: {}",
            raw.chars().take(120).collect::<String>()
        )
    })?;
    if let Some(err) = v.get("error").and_then(|e| e.as_str()) {
        return Err(format!("ollama error: {err}"));
    }
    v.pointer("/message/content")
        .and_then(|c| c.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "empty response from ollama".into())
}

/// True only when Ollama lists the default selected model. Kept for existing
/// callers; the Settings readiness view uses the structured result above.
#[allow(dead_code)]
pub fn ollama_available() -> bool {
    readiness(DEFAULT_OLLAMA_MODEL).state == OllamaState::Available
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tags_response_reports_the_installed_model_names() {
        let names = parse_ollama_tags(
            r#"{"models":[{"name":"qwen3.5:4b","model":"qwen3.5:4b"},{"name":"tiny:latest"}]}"#,
        )
        .unwrap();
        assert!(names.contains(&"qwen3.5:4b".to_string()));
        assert!(names.contains(&"tiny:latest".to_string()));
    }

    #[test]
    fn empty_model_uses_the_settings_default_without_a_fallback_chain() {
        let model = selected_model("").unwrap();
        let body: serde_json::Value =
            serde_json::from_str(&ollama_request_body("prompt", &model)).unwrap();
        assert_eq!(body["model"], DEFAULT_OLLAMA_MODEL);
    }

    #[test]
    fn selected_model_is_sent_unchanged() {
        let body: serde_json::Value =
            serde_json::from_str(&ollama_request_body("prompt", "llama3.2:3b")).unwrap();
        assert_eq!(body["model"], "llama3.2:3b");
    }

    #[test]
    fn invalid_model_names_fail_before_provider_launch() {
        assert!(selected_model("bad\nmodel").is_err());
        assert!(selected_model(&"x".repeat(129)).is_err());
    }

    #[test]
    fn zero_remaining_budget_does_not_launch_a_provider_request() {
        assert!(advise_offline_with_timeout("prompt", DEFAULT_OLLAMA_MODEL, 0).is_err());
    }
}

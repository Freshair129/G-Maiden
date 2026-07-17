//! Utterance ledger event (CR-011 §B) — a single canonical `utterance` Tauri
//! event fired whenever Maiden actually voices something (G-Signal's gank
//! warning + belief revision, G-Master's advice, the announcer packs), so the
//! Cold Booth UI can render one running transcript instead of stitching it
//! together from unrelated feature events.
//!
//! One shared payload shape, reused by every call site — see `UtterancePayload`.
//! Emission is fire-and-forget (`emit` swallows the Tauri emit error) and must
//! always happen AFTER the real audio/TTS dispatch at each site, never before,
//! so this stays zero-cost on the GSI → G-Signal → voice latency path
//! (CLAUDE.md: G-Signal end-to-end ≤300ms is a hard constraint).

use tauri::{AppHandle, Emitter};

/// Payload for the `utterance` event. `source`/`kind` are `&'static str` — both
/// are always literals chosen by the call site, never user/network data.
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UtterancePayload {
    pub at_ms: u64,
    /// "signal" | "master" | "announcer"
    pub source: &'static str,
    /// "line" | "revision"
    pub kind: &'static str,
    pub text: String,
    /// kind=="revision": the earlier claim being struck through.
    pub retracted: Option<String>,
    /// master: backend used ("claude"/"ollama"); announcer: active pack name.
    pub meta: Option<String>,
}

impl UtterancePayload {
    /// Build a payload stamped with the current wall-clock time.
    pub fn new(
        source: &'static str,
        kind: &'static str,
        text: impl Into<String>,
        retracted: Option<String>,
        meta: Option<String>,
    ) -> Self {
        UtterancePayload {
            at_ms: epoch_ms(),
            source,
            kind,
            text: text.into(),
            retracted,
            meta,
        }
    }
}

fn epoch_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Fire-and-forget emit of the `utterance` event. Callers must invoke this
/// AFTER dispatching the actual audio/TTS/clip so the event never delays the
/// sound itself; errors (e.g. no listener yet) are intentionally ignored.
pub fn emit(app: &AppHandle, payload: UtterancePayload) {
    let _ = app.emit("utterance", payload);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_stamps_a_nonzero_timestamp_and_carries_fields_through() {
        let p = UtterancePayload::new("signal", "line", "warning text", None, None);
        assert!(p.at_ms > 0, "epoch ms should be nonzero");
        assert_eq!(p.source, "signal");
        assert_eq!(p.kind, "line");
        assert_eq!(p.text, "warning text");
        assert!(p.retracted.is_none());
        assert!(p.meta.is_none());
    }

    #[test]
    fn revision_carries_the_retracted_text() {
        let p = UtterancePayload::new(
            "signal",
            "revision",
            "correction line",
            Some("earlier claim".to_string()),
            None,
        );
        assert_eq!(p.retracted.as_deref(), Some("earlier claim"));
    }

    #[test]
    fn master_and_announcer_carry_meta() {
        let master = UtterancePayload::new(
            "master",
            "line",
            "advice text",
            None,
            Some("claude".to_string()),
        );
        assert_eq!(master.meta.as_deref(), Some("claude"));

        let announcer = UtterancePayload::new(
            "announcer",
            "line",
            "double_kill",
            None,
            Some("maiden-custom".to_string()),
        );
        assert_eq!(announcer.source, "announcer");
        assert_eq!(announcer.meta.as_deref(), Some("maiden-custom"));
    }
}

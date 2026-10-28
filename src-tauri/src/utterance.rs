//! Utterance ledger event (CR-011 §B) — a single canonical `utterance` Tauri
//! event recording generated, requested or natively admitted speech (G-Signal's gank
//! warning + belief revision, G-Master's advice, the announcer packs), so the
//! Cold Booth UI can render one running transcript instead of stitching it
//! together from unrelated feature events.
//!
//! One shared payload shape, reused by every call site — see `UtterancePayload`.
//! Emission is fire-and-forget (`emit` swallows the Tauri emit error) and must
//! distinguish generated/requested work from native audio admission. Admission
//! is not proof of acoustic output or completion. Metadata publication stays off
//! the GSI → G-Signal → voice latency path
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
    /// Native admission is distinct from acoustic/audible playback proof.
    pub phase: &'static str,
    pub text: String,
    /// kind=="revision": the earlier claim being struck through.
    pub retracted: Option<String>,
    /// master: backend used ("claude"/"ollama"); announcer: active pack name.
    pub meta: Option<String>,
    #[serde(rename = "match_id")]
    pub match_id: Option<String>,
    #[serde(rename = "session_id")]
    pub session_id: Option<String>,
    #[serde(rename = "session_epoch")]
    pub session_epoch: Option<u64>,
    #[serde(rename = "session_lifecycle")]
    pub session_lifecycle: Option<crate::runtime::MatchLifecycle>,
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
            phase: "requested",
            text: text.into(),
            retracted,
            meta,
            match_id: None,
            session_id: None,
            session_epoch: None,
            session_lifecycle: None,
        }
    }

    pub fn admitted(mut self) -> Self {
        self.phase = "admitted";
        self
    }
    pub fn generated(mut self) -> Self {
        self.phase = "generated";
        self
    }

    pub fn new_for_session(
        source: &'static str,
        kind: &'static str,
        text: impl Into<String>,
        retracted: Option<String>,
        meta: Option<String>,
        session: &crate::runtime::MatchSessionSnapshot,
    ) -> Self {
        let mut payload = Self::new(source, kind, text, retracted, meta);
        payload.match_id = session.match_id.clone();
        payload.session_id = session.session_id.clone();
        payload.session_epoch = Some(session.session_epoch);
        payload.session_lifecycle = session.session_lifecycle;
        payload
    }
}

fn epoch_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

pub fn emit_for_session(app: &AppHandle, payload: UtterancePayload) -> bool {
    let Some(epoch) = payload.session_epoch else {
        return false;
    };
    if !crate::runtime::is_current_active_session_epoch(epoch) {
        return false;
    }
    let _ = app.emit("utterance", payload);
    true
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
        assert!(p.session_epoch.is_none());
        assert_eq!(p.phase, "requested");
        assert_eq!(p.clone().generated().phase, "generated");
        assert_eq!(p.admitted().phase, "admitted");
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

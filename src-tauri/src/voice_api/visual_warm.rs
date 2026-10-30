//! ID-only hints for a bounded, paused decoder pool in the trusted overlay.
use serde::Serialize;
use std::sync::OnceLock;
use tauri::Emitter;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Candidate {
    pub pack_id: String,
    pub banner_id: String,
    pub revision: u64,
    pub event: String,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Candidates {
    pub pack_id: Option<String>,
    pub revision: u64,
    pub visuals: Vec<Candidate>,
}
static APP: OnceLock<tauri::AppHandle> = OnceLock::new();
pub(crate) fn install(app: tauri::AppHandle) { let _ = APP.set(app); }
pub(super) fn publish(batch: Candidates) {
    if let Some(app) = APP.get() {
        let _ = app.emit_to("overlay", "announcer-visual-warm", batch);
    }
}

//! G-Log — local match logging (privacy-first per CLAUDE.md).
//! Writes one JSONL file per Dota 2 match into `%LOCALAPPDATA%\G-Maiden\logs\`.
//! Never sent off-device. Future use: replay matches to tune the prediction
//! params of G-Sentry / G-Master without playing live.
//!
//! Each line is a `{ts, tick}` record where `ts` is a Unix-epoch millisecond
//! stamp and `tick` is the cleaned `GameTick` the overlay receives. Sampled to
//! ~1 Hz by debouncing on `clock_time` — a 40-min match stays well under 2 MB.

use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::gsi::GameTick;

struct LogState {
    file: Option<File>,
    path: Option<PathBuf>,
    in_game: bool,
    last_clock: i64,
}

static STATE: Mutex<LogState> = Mutex::new(LogState {
    file: None,
    path: None,
    in_game: false,
    last_clock: i64::MIN,
});

/// Directory where match logs are stored. Created on first write.
pub fn log_dir() -> PathBuf {
    let base = std::env::var("LOCALAPPDATA")
        .ok()
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."));
    base.join("G-Maiden").join("logs")
}

/// Path to the currently-recording match log, if a match is in progress.
pub fn current_path() -> Option<PathBuf> {
    STATE.lock().ok().and_then(|g| g.path.clone())
}

fn now_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

/// Append one line to the diagnostic error log (`error.log` in the log dir).
/// Used by the panic hook and any subsystem that hits an unexpected condition
/// or a notable lifecycle event (capture start/stop, slow frames). Best-effort
/// and never panics itself — a logging failure must not take the app down.
pub fn error(msg: &str) {
    let dir = log_dir();
    let _ = fs::create_dir_all(&dir);
    let path = dir.join("error.log");
    if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(&path) {
        let _ = writeln!(f, "{} {}", now_ms(), msg);
        let _ = f.flush();
    }
    eprintln!("[G-Maiden] {msg}");
}

/// Install a global panic hook that records the thread, location, message and a
/// backtrace to `error.log` before delegating to the default hook. Without this
/// a panic on a background thread (capture/GSI/governor) leaves no on-disk trace
/// — the app just freezes or dies silently. Call once, first thing in `main`.
pub fn init_panic_hook() {
    let default = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let loc = info
            .location()
            .map(|l| format!("{}:{}", l.file(), l.line()))
            .unwrap_or_else(|| "<unknown>".into());
        let payload = info
            .payload()
            .downcast_ref::<&str>()
            .map(|s| s.to_string())
            .or_else(|| info.payload().downcast_ref::<String>().cloned())
            .unwrap_or_else(|| "<non-string panic payload>".into());
        let thread = std::thread::current()
            .name()
            .unwrap_or("<unnamed>")
            .to_string();
        let bt = std::backtrace::Backtrace::force_capture();
        error(&format!(
            "PANIC thread='{thread}' at {loc}: {payload}\n{bt}"
        ));
        default(info);
    }));
}

fn start_match(state: &mut LogState) {
    let dir = log_dir();
    if let Err(e) = fs::create_dir_all(&dir) {
        eprintln!("[G-Maiden log] mkdir failed: {e}");
        return;
    }
    let ts_sec = now_ms() / 1000;
    // Tag calibration evidence with the same match id so its screenshots/clips
    // land in a per-match folder that lines up with this log file.
    crate::calibration::set_match(&format!("match-{ts_sec}"));
    let path = dir.join(format!("match-{ts_sec}.jsonl"));
    match OpenOptions::new().create(true).append(true).open(&path) {
        Ok(mut f) => {
            // Silent-arm efficacy study (RWANG TASK 2): roll the per-match arm
            // exactly once, right here at match start, and persist the choice
            // into the log so the analyzer/in-app card can join it later.
            let silent_arm = crate::runtime::roll_match_arm();
            // New match → reset the identified-enemy roster used to ground
            // G-Master counter advice (capture loops repopulate it as they detect).
            crate::runtime::clear_known_enemies();
            // NB: the Draft-CV roster is NOT cleared here — it's read during the
            // draft, BEFORE this match-start fires, so clearing it now would wipe
            // what we just read. It's cleared on the draft rising edge instead
            // (`runtime::set_in_draft`).
            // `study` = whether this match was rolled UNDER the efficacy study.
            // The analyzer/in-app card count a match's gank_signal events into
            // the armed/silent buckets ONLY when this is true, so legacy /
            // opted-out matches (whose events all default to armed) can't
            // bias the armed arm with a different population (finding W1).
            let start_record = serde_json::json!({
                "ts": now_ms() as u64,
                "type": "match_start",
                "silent_arm": silent_arm,
                "study": crate::runtime::efficacy_enabled(),
            });
            if let Ok(line) = serde_json::to_string(&start_record) {
                let _ = f.write_all(line.as_bytes());
                let _ = f.write_all(b"\n");
                let _ = f.flush();
            }
            state.file = Some(f);
            state.path = Some(path);
            state.last_clock = i64::MIN;
        }
        Err(e) => eprintln!("[G-Maiden log] open failed: {e}"),
    }
}

fn end_match(state: &mut LogState) {
    state.file = None;
    state.path = None;
    state.last_clock = i64::MIN;
}

/// Note a new tick from the GSI handler. Detects match-start / match-end
/// transitions, rotates the log file accordingly, and appends one JSONL
/// record per second of in-game time.
pub fn note_tick(tick: &GameTick) {
    let Ok(mut state) = STATE.lock() else { return };

    // State transition: start / end a match log when in_game flips.
    if tick.in_game && !state.in_game {
        start_match(&mut state);
    } else if !tick.in_game && state.in_game {
        end_match(&mut state);
    }
    state.in_game = tick.in_game;

    if !tick.in_game || state.file.is_none() {
        return;
    }

    // Sample at ~1 Hz: skip ticks where clock_time hasn't advanced. Allow
    // any change including resets (going back in time during draft / pause).
    if tick.clock_time == state.last_clock {
        return;
    }
    state.last_clock = tick.clock_time;

    let payload = serde_json::json!({ "ts": now_ms() as u64, "tick": tick });
    let Ok(line) = serde_json::to_string(&payload) else {
        return;
    };
    if let Some(f) = state.file.as_mut() {
        let _ = f.write_all(line.as_bytes());
        let _ = f.write_all(b"\n");
        // Flush each line so a power-cut mid-match still preserves the prefix.
        let _ = f.flush();
    }
}

/// Force-close the active match log (used by the GSI watchdog when Dota exits
/// without sending a final out-of-game tick). Resets in-game state so the next
/// match starts a fresh file. No-op if nothing is recording.
pub fn force_end() {
    if let Ok(mut state) = STATE.lock() {
        if state.file.is_some() {
            end_match(&mut state);
        }
        state.in_game = false;
    }
}

/// Append a typed G-Signal event to the current match log, time-aligned with the
/// tick stream. No-op when no match is recording. Used to capture the inputs of
/// each gank decision so we can later (offline) join them against outcomes —
/// the raw material for calibrating G-Motion's probability model (#7). The `ts`
/// field is stamped here; callers pass a record built by the helpers below.
pub fn note_event(mut value: serde_json::Value) {
    let Ok(mut state) = STATE.lock() else { return };
    if state.file.is_none() {
        return;
    }
    if let Some(obj) = value.as_object_mut() {
        obj.insert("ts".into(), serde_json::json!(now_ms() as u64));
    }
    let Ok(line) = serde_json::to_string(&value) else {
        return;
    };
    if let Some(f) = state.file.as_mut() {
        let _ = f.write_all(line.as_bytes());
        let _ = f.write_all(b"\n");
        let _ = f.flush();
    }
}

/// Record: G-Signal fired a gank warning (the decision + its inputs).
/// `armed` = `true` when the user was actually alerted (voice + banner);
/// `false` in the silent arm of the efficacy study, where the alert is
/// suppressed but the decision is still logged (RWANG TASK 2).
pub fn gank_signal_record(
    probability: f32,
    missing: &[String],
    eta_ms: u64,
    armed: bool,
) -> serde_json::Value {
    serde_json::json!({
        "type": "gank_signal",
        "probability": probability,
        "missing_heroes": missing,
        "eta_ms": eta_ms,
        "armed": armed,
    })
}

/// Record: Belief Revision retracted a prior warning.
pub fn gank_revision_record() -> serde_json::Value {
    serde_json::json!({ "type": "gank_revision" })
}

/// Record: G-Sentry flagged an enemy missing (a risk feature).
pub fn enemy_missing_record(
    hero: &str,
    missing_for_ms: u64,
    last_pos: (f32, f32),
) -> serde_json::Value {
    serde_json::json!({
        "type": "enemy_missing",
        "hero": hero,
        "missing_for_ms": missing_for_ms,
        "last_pos": [last_pos.0, last_pos.1],
    })
}

/// Record: a sampled snapshot of G-Motion's gank-risk assessment — the
/// missing offline-refit input (audit finding: G-Signal's thresholds are
/// unmeasured magic numbers because the model's own inputs were never
/// recorded, only its edge-triggered decisions). Written by the DXGI capture
/// loop (`capture.rs`), throttled at the call site via
/// [`should_record_risk_trace`]. The legacy `capture_wgc.rs` backend (frozen)
/// does NOT call this — WGC matches never contribute risk_trace samples.
pub fn risk_trace_record(
    probability: f32,
    missing: &[(String, u64, (f32, f32))],
) -> serde_json::Value {
    let missing: Vec<serde_json::Value> = missing
        .iter()
        .map(|(hero, missing_for_ms, last_pos)| {
            serde_json::json!({
                "hero": hero,
                "missing_for_ms": missing_for_ms,
                "last_pos": [last_pos.0, last_pos.1],
            })
        })
        .collect();
    serde_json::json!({
        "type": "risk_trace",
        "probability": probability,
        "missing": missing,
    })
}

/// Throttle decision for `risk_trace` sampling, extracted as a pure function
/// so it's unit-testable without a real `Instant`/thread. A trace is worth
/// recording only when there's something to see (a missing hero, or non-zero
/// risk) — a quiet tick with nothing missing would just be dead weight in the
/// log — AND only at most once per `min_interval_ms` (≈1 Hz), so an active-
/// missing window (the common case this exists to capture) can't write a line
/// per frame. A `risk_trace` line runs ~100-200 bytes; at 1 Hz during
/// active-missing windows a 40-min match stays well under this module's 2MB
/// promise (see module header).
pub fn should_record_risk_trace(
    elapsed_ms: u64,
    min_interval_ms: u64,
    missing_is_empty: bool,
    probability: f32,
) -> bool {
    if missing_is_empty && probability <= 0.0 {
        return false;
    }
    elapsed_ms >= min_interval_ms
}

/// A single archived match log.
#[derive(serde::Serialize, Clone)]
pub struct MatchLog {
    pub name: String,
    pub size: u64,
    pub modified_ms: u64,
}

/// Enumerate match-*.jsonl files, newest first. Excludes the file currently
/// being written so it can't be deleted from under us.
pub fn list_matches() -> Vec<MatchLog> {
    let dir = log_dir();
    let current = current_path();
    let mut out: Vec<MatchLog> = fs::read_dir(&dir)
        .ok()
        .map(|it| {
            it.filter_map(|e| e.ok())
                .filter_map(|e| {
                    let path = e.path();
                    if Some(&path) == current.as_ref() {
                        return None;
                    }
                    let name = path.file_name()?.to_string_lossy().to_string();
                    if !name.starts_with("match-") || !name.ends_with(".jsonl") {
                        return None;
                    }
                    let meta = e.metadata().ok()?;
                    let modified_ms = meta
                        .modified()
                        .ok()
                        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                        .map(|d| d.as_millis() as u64)
                        .unwrap_or(0);
                    Some(MatchLog {
                        name,
                        size: meta.len(),
                        modified_ms,
                    })
                })
                .collect()
        })
        .unwrap_or_default();
    out.sort_by_key(|b| std::cmp::Reverse(b.modified_ms));
    out
}

/// Delete a single archived match log. Rejects paths outside the log dir
/// and the file currently being recorded — both would be a privacy footgun
/// or a write-during-write corruption.
pub fn delete_match(name: &str) -> Result<(), String> {
    if name.contains('/') || name.contains('\\') || name.contains("..") {
        return Err("ชื่อไฟล์ไม่ถูกต้อง".into());
    }
    if !name.starts_with("match-") || !name.ends_with(".jsonl") {
        return Err("ลบได้เฉพาะไฟล์ match-*.jsonl เท่านั้น".into());
    }
    let dir = log_dir();
    let path = dir.join(name);
    if current_path().as_deref() == Some(&path) {
        return Err("ลบไฟล์ที่กำลังบันทึกอยู่ไม่ได้ — รอจบแมตช์ก่อน".into());
    }
    fs::remove_file(&path).map_err(|e| format!("ลบไม่สำเร็จ: {e}"))
}

/// Wipe every archived match. The currently-recording file is preserved so
/// the active match survives the privacy reset.
pub fn delete_all() -> Result<u32, String> {
    let mut count = 0u32;
    for m in list_matches() {
        if delete_match(&m.name).is_ok() {
            count += 1;
        }
    }
    Ok(count)
}

// ─────────────────────────── Debrief timeline (CR-011 P3) ───────────────────────────
// The deck's debrief view wants the CONTENT of one archived match log, not
// just its name/size (`list_matches` above). `read_match_log` resolves an
// untrusted UI-supplied filename to a path confined to `log_dir()`, reads it,
// and reduces the JSONL into a small ordered list of human-readable moments.

/// One human-readable line for the deck's debrief timeline, derived from a
/// single JSONL record in a match log. Never invents data — every field in
/// `text` comes straight from the record; records this module doesn't
/// recognize (including raw `tick` snapshots, which have no `type`) are
/// skipped before a `TimelineEntry` is ever built. See [`parse_timeline`].
#[derive(Clone, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimelineEntry {
    /// Record timestamp (epoch ms), taken verbatim from the record's `ts`.
    pub at_ms: u64,
    /// The record's own `type` discriminator, lowercased (e.g. `"gank_signal"`,
    /// `"enemy_missing"`) — not a separate taxonomy invented for the deck.
    pub kind: String,
    /// Short human-readable line derived only from fields present on the record.
    pub text: String,
}

/// Cap on the number of entries [`parse_timeline`] returns. A 40-minute match
/// can log many `gank_signal` / `enemy_missing` events; the newest matter most
/// for a post-match debrief, so once over the cap the oldest are dropped.
const TIMELINE_MAX_ENTRIES: usize = 500;

/// Turn one already-parsed JSON record into a [`TimelineEntry`], or `None` if
/// it's missing its timestamp, isn't one of the record kinds G-Log itself
/// writes (see the `*_record` helpers above), or is missing a field its own
/// text depends on. Recognizes exactly: `match_start`, `gank_signal`,
/// `gank_revision`, `enemy_missing`. Raw `tick` snapshots (no `type` field)
/// are intentionally not surfaced — the timeline is a highlight reel of
/// discrete events, not a per-second replay.
fn to_timeline_entry(v: &serde_json::Value) -> Option<TimelineEntry> {
    let at_ms = v.get("ts").and_then(|t| t.as_u64())?;
    let record_type = v.get("type").and_then(|t| t.as_str())?;
    let kind = record_type.to_lowercase();
    let text = match record_type {
        "match_start" => {
            let study = v.get("study").and_then(|s| s.as_bool()).unwrap_or(false);
            if study {
                let silent_arm = v.get("silent_arm").and_then(|s| s.as_bool()).unwrap_or(false);
                format!(
                    "Match started (efficacy study; G-Signal {})",
                    if silent_arm { "silenced" } else { "armed" }
                )
            } else {
                "Match started".to_string()
            }
        }
        "gank_signal" => {
            let probability = v.get("probability").and_then(|p| p.as_f64())?;
            let eta_ms = v.get("eta_ms").and_then(|e| e.as_u64())?;
            let armed = v.get("armed").and_then(|a| a.as_bool()).unwrap_or(true);
            let missing: Vec<String> = v
                .get("missing_heroes")
                .and_then(|m| m.as_array())
                .map(|arr| arr.iter().filter_map(|h| h.as_str().map(str::to_string)).collect())
                .unwrap_or_default();
            let missing_part = if missing.is_empty() {
                String::new()
            } else {
                format!(" — missing: {}", missing.join(", "))
            };
            let silenced_part = if armed { "" } else { " [silenced]" };
            format!(
                "Gank warning: {:.0}% risk, ETA {eta_ms}ms{missing_part}{silenced_part}",
                probability * 100.0
            )
        }
        "gank_revision" => "Gank warning revised (threat retracted)".to_string(),
        "enemy_missing" => {
            let hero = v.get("hero").and_then(|h| h.as_str())?;
            let missing_for_ms = v.get("missing_for_ms").and_then(|m| m.as_u64())?;
            let pos_part = match v.get("last_pos").and_then(|p| p.as_array()) {
                Some(arr) if arr.len() == 2 => {
                    let x = arr[0].as_f64().unwrap_or(0.0);
                    let y = arr[1].as_f64().unwrap_or(0.0);
                    format!(" (last seen {x:.2}, {y:.2})")
                }
                _ => String::new(),
            };
            format!("{hero} missing for {missing_for_ms}ms{pos_part}")
        }
        _ => return None,
    };
    Some(TimelineEntry { at_ms, kind, text })
}

/// Parse a match log's raw JSONL text into a debrief timeline: one entry per
/// recognized event record, in file order, capped to the last
/// [`TIMELINE_MAX_ENTRIES`]. Tolerant of malformed/unknown lines — each line
/// is parsed independently and a bad one (including a torn last line from a
/// power-cut mid-write, same as [`parse_efficacy_records`]) is skipped, never
/// aborts the whole file.
pub fn parse_timeline(jsonl: &str) -> Vec<TimelineEntry> {
    let mut entries: Vec<TimelineEntry> = jsonl
        .lines()
        .filter_map(|line| {
            let line = line.trim();
            if line.is_empty() {
                return None;
            }
            let v: serde_json::Value = serde_json::from_str(line).ok()?;
            to_timeline_entry(&v)
        })
        .collect();
    if entries.len() > TIMELINE_MAX_ENTRIES {
        let drop = entries.len() - TIMELINE_MAX_ENTRIES;
        entries.drain(0..drop);
    }
    entries
}

/// Structural check that `s` is a single, ordinary path component — no
/// separators, no `..`, no drive/UNC/verbatim prefix, no root. Checked on
/// both the raw string and its `\`->`/` normalized form, matching the
/// house pattern in `voice_api::safe_pack_path` (backslash parses as a
/// separator natively on Windows, but checking both keeps this correct on
/// any platform `cargo test` runs on, and mirrors the existing convention).
/// Returns the component's text when safe, `None` otherwise.
fn as_bare_filename(s: &str) -> Option<&str> {
    if s.trim().is_empty() {
        return None;
    }
    let normalized = s.replace('\\', "/");
    for candidate in [s, normalized.as_str()] {
        let mut comps = Path::new(candidate).components();
        match (comps.next(), comps.next()) {
            (Some(Component::Normal(_)), None) => {}
            _ => return None,
        }
    }
    // Reject a colon anywhere in the name: on Windows this is either a drive
    // prefix (already caught above as a `Prefix` component when it leads the
    // string) or NTFS alternate-data-stream syntax (`name.jsonl:hidden`),
    // which `Path::components()` does not surface as a distinct component.
    if s.contains(':') {
        return None;
    }
    Some(s)
}

/// Resolve `name` to a path inside `dir`, rejecting anything that isn't a
/// bare `match-*.jsonl` filename. `name` is untrusted UI input, so this is a
/// structural check (via [`as_bare_filename`]), not a substring blocklist —
/// the same posture the manifest-path hardening in
/// `voice_api::safe_pack_path` takes for the same class of bug (attacker-
/// influenced string joined onto a directory). Takes `dir` explicitly (rather
/// than hard-coding [`log_dir()`]) so it can be exercised against a temp dir
/// in tests without touching the real log directory; [`read_match_log`]
/// always calls it with `log_dir()`.
fn safe_log_path_in_dir(dir: &Path, name: &str) -> Option<PathBuf> {
    let bare = as_bare_filename(name)?;
    if !bare.starts_with("match-") || !bare.ends_with(".jsonl") {
        return None;
    }
    Some(dir.join(bare))
}

/// Read one archived match log (from `dir`) and reduce it to a debrief
/// timeline. `name` must resolve to a bare `match-*.jsonl` filename inside
/// `dir` — see [`safe_log_path_in_dir`] for the guard. When the resolved path
/// exists, it is additionally canonicalized and checked to still sit inside
/// the canonicalized `dir` (catches a symlink planted in the log dir whose
/// target escapes it — the structural component check alone can't see
/// through that), matching `voice_api::safe_pack_path`'s containment step.
/// Split from [`read_match_log`] so it can be tested against a temp dir
/// without touching the real `log_dir()`.
fn read_match_log_in_dir(dir: &Path, name: &str) -> Result<Vec<TimelineEntry>, String> {
    let path = safe_log_path_in_dir(dir, name).ok_or_else(|| "ชื่อไฟล์ไม่ถูกต้อง".to_string())?;

    if let Ok(canon_candidate) = fs::canonicalize(&path) {
        match fs::canonicalize(dir) {
            Ok(canon_dir) if canon_candidate.starts_with(&canon_dir) => {}
            _ => return Err("ชื่อไฟล์ไม่ถูกต้อง".to_string()),
        }
    }
    // If canonicalize fails above, the file doesn't exist yet — fall through
    // to a normal read error below rather than treating "missing" as unsafe.

    let content = fs::read_to_string(&path).map_err(|e| format!("อ่านไฟล์ไม่สำเร็จ: {e}"))?;
    Ok(parse_timeline(&content))
}

/// Read one archived match log (from [`log_dir()`]) and reduce it to a
/// debrief timeline for the deck's debrief view. See
/// [`read_match_log_in_dir`] for the full contract.
pub fn read_match_log(name: &str) -> Result<Vec<TimelineEntry>, String> {
    read_match_log_in_dir(&log_dir(), name)
}

/// Open the log directory in Windows Explorer (for transparency — the user
/// can see exactly what we're keeping).
pub fn open_log_dir() {
    let dir = log_dir();
    let _ = fs::create_dir_all(&dir);
    let _ = std::process::Command::new("explorer")
        .arg(dir.as_os_str())
        .spawn();
}

// ─────────────────────────── Efficacy study (RWANG TASK 2) ───────────────────────────
// Silent-arm study: does G-Signal's gank warning actually reduce deaths? Joins
// each `gank_signal` event to a death within a fixed window, per match log,
// and buckets the result by the event's `armed` field. 100% local — this only
// reads the same on-disk logs `analyze.py` reads; nothing leaves the machine.
// Kept in lockstep with `tools/analyze-log/analyze.py`'s default window so the
// in-app card and the offline analyzer agree.

/// Window (ms) after a `gank_signal` within which a death still counts as the
/// outcome of that warning (or lack thereof).
const EFFICACY_WINDOW_MS: u64 = 8000;

/// One `gank_signal` event extracted from a match log, reduced to what the
/// efficacy join needs.
struct EfficacySignal {
    ts: u64,
    armed: bool,
}

#[derive(Default, Clone, Copy)]
struct ArmBucket {
    events: u32,
    deaths: u32,
}

impl ArmBucket {
    fn add(&mut self, other: ArmBucket) {
        self.events += other.events;
        self.deaths += other.deaths;
    }
    fn to_json(self) -> serde_json::Value {
        // No events → the rate is undefined; emit `null` (matching analyze.py's
        // `None`) rather than a misleading 0.0 that reads as "0% deaths".
        let rate = if self.events > 0 {
            serde_json::json!(self.deaths as f64 / self.events as f64)
        } else {
            serde_json::Value::Null
        };
        serde_json::json!({ "events": self.events, "deaths": self.deaths, "rate": rate })
    }
}

/// The efficacy-relevant contents of one match log: death timestamps, the
/// gank_signal rows, and whether the match was rolled under the study.
struct MatchEfficacy {
    deaths: Vec<u64>,
    signals: Vec<EfficacySignal>,
    /// `true` when the `match_start` record has `study: true` — only such
    /// matches carry the randomized armed/silent split, so only they are
    /// counted into the buckets (finding W1). Legacy logs (no `match_start`,
    /// or `study` absent) → `false`.
    study: bool,
}

/// Parse one match log's raw JSONL text. Tolerates a torn last line (power-cut
/// mid-write), same as the python analyzer. Legacy logs written before this
/// feature shipped have no `armed` field on `gank_signal` — they default to
/// `armed: true` since every alert was voiced back then — and no `study` flag,
/// so they are excluded from the efficacy buckets by the caller.
fn parse_efficacy_records(content: &str) -> MatchEfficacy {
    let mut deaths = Vec::new();
    let mut signals = Vec::new();
    let mut study = false;
    let mut seen_match_start = false;
    let mut prev_deaths: Option<i64> = None;
    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let Ok(v) = serde_json::from_str::<serde_json::Value>(line) else {
            continue;
        };
        let ts = v.get("ts").and_then(|t| t.as_u64()).unwrap_or(0);
        if let Some(tick) = v.get("tick") {
            let d = tick.get("deaths").and_then(|d| d.as_i64()).unwrap_or(0);
            if let Some(prev) = prev_deaths {
                if d > prev {
                    deaths.push(ts);
                }
            }
            prev_deaths = Some(d);
        } else {
            match v.get("type").and_then(|t| t.as_str()) {
                Some("gank_signal") => {
                    let armed = v.get("armed").and_then(|a| a.as_bool()).unwrap_or(true);
                    signals.push(EfficacySignal { ts, armed });
                }
                Some("match_start") if !seen_match_start => {
                    // Read the study flag from the FIRST match_start only, matching
                    // analyze.py's `study_flag` (one match_start per file by design;
                    // this keeps the two analyzers byte-for-byte consistent).
                    study = v.get("study").and_then(|s| s.as_bool()).unwrap_or(false);
                    seen_match_start = true;
                }
                _ => {}
            }
        }
    }
    MatchEfficacy {
        deaths,
        signals,
        study,
    }
}

/// Join `signals` to `deaths` within `window_ms` and bucket by `armed`. Pure —
/// no I/O — so it's directly unit-testable against synthetic records.
fn join_and_bucket(
    deaths: &[u64],
    signals: &[EfficacySignal],
    window_ms: u64,
) -> (ArmBucket, ArmBucket) {
    let mut armed = ArmBucket::default();
    let mut silent = ArmBucket::default();
    for sig in signals {
        let bucket = if sig.armed { &mut armed } else { &mut silent };
        bucket.events += 1;
        if deaths.iter().any(|&d| d > sig.ts && d <= sig.ts + window_ms) {
            bucket.deaths += 1;
        }
    }
    (armed, silent)
}

/// Scan every match log in `dir`, join each `gank_signal` event to a death
/// within [`EFFICACY_WINDOW_MS`], and bucket by `armed`. Only matches rolled
/// under the study (`match_start.study == true`) are counted (W1). Split from
/// [`efficacy_summary`] so it can be tested against a temp dir without touching
/// the real `log_dir()`.
fn efficacy_summary_in_dir(dir: &std::path::Path) -> serde_json::Value {
    let mut armed_total = ArmBucket::default();
    let mut silent_total = ArmBucket::default();

    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.filter_map(|e| e.ok()) {
            let path = entry.path();
            let name = path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();
            if !name.starts_with("match-") || !name.ends_with(".jsonl") {
                continue;
            }
            let Ok(content) = fs::read_to_string(&path) else {
                continue;
            };
            let m = parse_efficacy_records(&content);
            // W1: only study-enabled matches carry the randomized armed/silent
            // split; skip legacy / opted-out matches so the two buckets compare
            // the same population.
            if !m.study {
                continue;
            }
            let (armed, silent) = join_and_bucket(&m.deaths, &m.signals, EFFICACY_WINDOW_MS);
            armed_total.add(armed);
            silent_total.add(silent);
        }
    }
    // A missing log dir (fresh install, no matches) yields an empty summary,
    // not an error — the `if let Ok` above already handles that path.

    serde_json::json!({
        "armed": armed_total.to_json(),
        "silent": silent_total.to_json(),
    })
}

/// Scan every match log in `log_dir()`, join each `gank_signal` event to a
/// death within [`EFFICACY_WINDOW_MS`], and bucket by `armed` (whether the
/// user was actually alerted). Returns
/// `{ armed: {events, deaths, rate}, silent: {events, deaths, rate} }` so the
/// UI can show the user their own two-arm comparison. Local-only: reads from
/// disk, never sends anything anywhere.
pub fn efficacy_summary() -> Result<serde_json::Value, String> {
    Ok(efficacy_summary_in_dir(&log_dir()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gank_signal_record_shape() {
        let r = gank_signal_record(0.91, &["CM".into(), "SF".into()], 2500, true);
        assert_eq!(r["type"], "gank_signal");
        assert_eq!(r["eta_ms"], 2500);
        assert_eq!(r["missing_heroes"].as_array().unwrap().len(), 2);
        assert_eq!(r["armed"], true);
        // probability round-trips as a number
        assert!((r["probability"].as_f64().unwrap() - 0.91).abs() < 1e-6);
    }

    #[test]
    fn gank_signal_record_carries_armed_false_in_the_silent_arm() {
        let r = gank_signal_record(0.7, &["Lion".into()], 1800, false);
        assert_eq!(r["armed"], false);
    }

    #[test]
    fn enemy_missing_record_shape() {
        let r = enemy_missing_record("CM", 6000, (0.25, 0.5));
        assert_eq!(r["type"], "enemy_missing");
        assert_eq!(r["hero"], "CM");
        let pos = r["last_pos"].as_array().unwrap();
        assert_eq!(pos.len(), 2);
        assert!((pos[0].as_f64().unwrap() - 0.25).abs() < 1e-6);
    }

    #[test]
    fn revision_record_shape() {
        assert_eq!(gank_revision_record()["type"], "gank_revision");
    }

    #[test]
    fn risk_trace_record_shape_round_trips() {
        let missing = vec![
            ("CM".to_string(), 6000u64, (0.25f32, 0.5f32)),
            ("SF".to_string(), 9000u64, (0.75f32, 0.1f32)),
        ];
        let r = risk_trace_record(0.42, &missing);
        assert_eq!(r["type"], "risk_trace");
        assert!((r["probability"].as_f64().unwrap() - 0.42).abs() < 1e-6);
        let arr = r["missing"].as_array().unwrap();
        assert_eq!(arr.len(), 2);
        assert_eq!(arr[0]["hero"], "CM");
        assert_eq!(arr[0]["missing_for_ms"], 6000);
        let pos = arr[0]["last_pos"].as_array().unwrap();
        assert!((pos[0].as_f64().unwrap() - 0.25).abs() < 1e-6);
        assert!((pos[1].as_f64().unwrap() - 0.5).abs() < 1e-6);
        assert_eq!(arr[1]["hero"], "SF");

        // Round-trips through serde_json (de)serialization too.
        let s = serde_json::to_string(&r).unwrap();
        let back: serde_json::Value = serde_json::from_str(&s).unwrap();
        assert_eq!(back, r);
    }

    #[test]
    fn risk_trace_record_empty_missing_is_a_valid_empty_array() {
        let r = risk_trace_record(0.0, &[]);
        assert_eq!(r["type"], "risk_trace");
        assert!(r["missing"].as_array().unwrap().is_empty());
    }

    #[test]
    fn should_record_risk_trace_skips_when_nothing_missing_and_no_risk() {
        assert!(!should_record_risk_trace(5000, 1000, true, 0.0));
    }

    #[test]
    fn should_record_risk_trace_allows_when_probability_positive_even_if_missing_empty() {
        // Motion can carry residual probability momentarily even with an empty
        // missing list at the instant sampled; treat any positive risk as
        // worth recording.
        assert!(should_record_risk_trace(5000, 1000, true, 0.05));
    }

    #[test]
    fn should_record_risk_trace_allows_when_missing_nonempty_even_if_probability_zero() {
        assert!(should_record_risk_trace(5000, 1000, false, 0.0));
    }

    #[test]
    fn should_record_risk_trace_throttles_below_interval() {
        assert!(!should_record_risk_trace(500, 1000, false, 0.5));
        assert!(should_record_risk_trace(1000, 1000, false, 0.5));
        assert!(should_record_risk_trace(1500, 1000, false, 0.5));
    }

    #[test]
    fn parse_efficacy_records_extracts_deaths_armed_signals_and_study_flag() {
        let content = concat!(
            "{\"ts\":0,\"type\":\"match_start\",\"silent_arm\":false,\"study\":true}\n",
            "{\"ts\":0,\"tick\":{\"deaths\":0}}\n",
            "{\"ts\":1000,\"type\":\"gank_signal\",\"armed\":true,\"probability\":0.9}\n",
            "{\"ts\":4000,\"tick\":{\"deaths\":1}}\n",
            "{\"ts\":5000,\"type\":\"gank_signal\",\"armed\":false}\n",
            "not json, a torn power-cut line\n",
        );
        let m = parse_efficacy_records(content);
        assert_eq!(m.deaths, vec![4000]);
        assert_eq!(m.signals.len(), 2);
        assert!(m.signals[0].armed);
        assert!(!m.signals[1].armed);
        assert!(m.study, "study flag must be read from match_start");
    }

    #[test]
    fn parse_efficacy_records_defaults_study_false_and_armed_true_for_legacy_logs() {
        // Logs written before this feature shipped have no `match_start`
        // record (→ study defaults false) and no `armed` field on signals
        // (→ armed defaults true; every alert back then was actually voiced).
        let content = "{\"ts\":1000,\"type\":\"gank_signal\",\"probability\":0.9}";
        let m = parse_efficacy_records(content);
        assert_eq!(m.signals.len(), 1);
        assert!(m.signals[0].armed);
        assert!(!m.study, "legacy match with no match_start must not be a study match");
    }

    #[test]
    fn parse_efficacy_records_study_false_when_match_start_opted_out() {
        let content = concat!(
            "{\"ts\":0,\"type\":\"match_start\",\"silent_arm\":false,\"study\":false}\n",
            "{\"ts\":1000,\"type\":\"gank_signal\",\"armed\":true}\n",
        );
        let m = parse_efficacy_records(content);
        assert!(!m.study);
    }

    #[test]
    fn join_and_bucket_splits_by_armed_and_counts_deaths_in_window() {
        let deaths = vec![4000u64, 20000];
        let signals = vec![
            EfficacySignal { ts: 1000, armed: true }, // death at 4000 -> hit
            EfficacySignal { ts: 5000, armed: false }, // no death in (5000,13000] -> miss
            EfficacySignal { ts: 19000, armed: false }, // death at 20000 -> hit
        ];
        let (armed, silent) = join_and_bucket(&deaths, &signals, 8000);
        assert_eq!(armed.events, 1);
        assert_eq!(armed.deaths, 1);
        assert_eq!(silent.events, 2);
        assert_eq!(silent.deaths, 1);
    }

    #[test]
    fn join_and_bucket_death_exactly_at_window_edge_counts() {
        let deaths = vec![9000u64];
        let signals = vec![EfficacySignal { ts: 1000, armed: true }];
        let (armed, _) = join_and_bucket(&deaths, &signals, 8000);
        assert_eq!(armed.events, 1);
        assert_eq!(armed.deaths, 1, "death at ts+window_ms is inclusive");
    }

    #[test]
    fn arm_bucket_to_json_rate_is_null_when_no_events() {
        let b = ArmBucket::default();
        let j = b.to_json();
        assert_eq!(j["events"], 0);
        assert_eq!(j["deaths"], 0);
        // undefined rate → null (consistent with analyze.py's None), not 0.0.
        assert!(j["rate"].is_null());
    }

    #[test]
    fn arm_bucket_add_accumulates_across_matches() {
        let mut total = ArmBucket::default();
        total.add(ArmBucket { events: 3, deaths: 1 });
        total.add(ArmBucket { events: 2, deaths: 2 });
        assert_eq!(total.events, 5);
        assert_eq!(total.deaths, 3);
    }

    #[test]
    fn efficacy_summary_counts_only_study_matches_and_excludes_legacy() {
        // W1: a study=true match contributes to the buckets; a study=false /
        // legacy match (no match_start) is excluded entirely, so the armed
        // arm can't be polluted by a different (pre-study) population.
        let dir = std::env::temp_dir().join(format!(
            "gmaiden-eff-test-{}",
            now_ms()
        ));
        fs::create_dir_all(&dir).unwrap();

        // Study match: 1 armed signal followed by a death, 1 silent signal not.
        let study_match = concat!(
            "{\"ts\":0,\"type\":\"match_start\",\"silent_arm\":false,\"study\":true}\n",
            "{\"ts\":0,\"tick\":{\"deaths\":0}}\n",
            "{\"ts\":1000,\"type\":\"gank_signal\",\"armed\":true}\n",
            "{\"ts\":4000,\"tick\":{\"deaths\":1}}\n",
            "{\"ts\":10000,\"type\":\"gank_signal\",\"armed\":false}\n",
            "{\"ts\":30000,\"tick\":{\"deaths\":2}}\n",
        );
        fs::write(dir.join("match-100.jsonl"), study_match).unwrap();

        // Legacy match (no match_start → study=false): must be ignored.
        let legacy_match = concat!(
            "{\"ts\":0,\"tick\":{\"deaths\":0}}\n",
            "{\"ts\":1000,\"type\":\"gank_signal\",\"probability\":0.9}\n",
            "{\"ts\":4000,\"tick\":{\"deaths\":1}}\n",
        );
        fs::write(dir.join("match-050.jsonl"), legacy_match).unwrap();

        // Opted-out study match (study=false): also ignored.
        let opted_out = concat!(
            "{\"ts\":0,\"type\":\"match_start\",\"silent_arm\":false,\"study\":false}\n",
            "{\"ts\":1000,\"type\":\"gank_signal\",\"armed\":true}\n",
            "{\"ts\":4000,\"tick\":{\"deaths\":1}}\n",
        );
        fs::write(dir.join("match-075.jsonl"), opted_out).unwrap();

        let summary = efficacy_summary_in_dir(&dir);
        // Only the study match's events count: armed 1 event / 1 death,
        // silent 1 event / 0 deaths (no death in (10000, 18000]).
        assert_eq!(summary["armed"]["events"], 1);
        assert_eq!(summary["armed"]["deaths"], 1);
        assert_eq!(summary["silent"]["events"], 1);
        assert_eq!(summary["silent"]["deaths"], 0);

        let _ = fs::remove_dir_all(&dir);
    }

    // ─────────────────────── Debrief timeline (CR-011 P3) ───────────────────────

    #[test]
    fn parse_timeline_happy_path_recognizes_known_record_shapes() {
        // Real shapes copied from the `*_record` helpers / existing tests above.
        let content = concat!(
            "{\"ts\":0,\"type\":\"match_start\",\"silent_arm\":true,\"study\":true}\n",
            "{\"ts\":1500,\"type\":\"gank_signal\",\"probability\":0.91,\"missing_heroes\":[\"CM\",\"SF\"],\"eta_ms\":2500,\"armed\":false}\n",
            "{\"ts\":6000,\"type\":\"gank_revision\"}\n",
            "{\"ts\":9000,\"type\":\"enemy_missing\",\"hero\":\"CM\",\"missing_for_ms\":6000,\"last_pos\":[0.25,0.5]}\n",
        );
        let entries = parse_timeline(content);
        assert_eq!(entries.len(), 4);

        assert_eq!(entries[0].at_ms, 0);
        assert_eq!(entries[0].kind, "match_start");
        assert!(entries[0].text.contains("study"));
        assert!(entries[0].text.contains("silenced"));

        assert_eq!(entries[1].at_ms, 1500);
        assert_eq!(entries[1].kind, "gank_signal");
        assert!(entries[1].text.contains("91%"));
        assert!(entries[1].text.contains("CM, SF"));
        assert!(entries[1].text.contains("2500ms"));
        assert!(entries[1].text.contains("silenced"));

        assert_eq!(entries[2].at_ms, 6000);
        assert_eq!(entries[2].kind, "gank_revision");
        assert!(entries[2].text.to_lowercase().contains("revised"));

        assert_eq!(entries[3].at_ms, 9000);
        assert_eq!(entries[3].kind, "enemy_missing");
        assert!(entries[3].text.contains("CM"));
        assert!(entries[3].text.contains("6000ms"));
        assert!(entries[3].text.contains("0.25"));
    }

    #[test]
    fn parse_timeline_skips_malformed_unknown_and_tick_lines() {
        let content = concat!(
            "not json, a torn power-cut line\n",
            "{\"ts\":0,\"tick\":{\"deaths\":0}}\n", // raw tick snapshot: no `type`
            "{\"ts\":10,\"type\":\"some_future_event\",\"x\":1}\n", // unrecognized type
            "{\"type\":\"gank_revision\"}\n", // missing ts
            "{\"ts\":20,\"type\":\"gank_revision\"}\n", // the only valid line
        );
        let entries = parse_timeline(content);
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].at_ms, 20);
        assert_eq!(entries[0].kind, "gank_revision");
    }

    #[test]
    fn parse_timeline_caps_at_last_500_entries() {
        let mut content = String::new();
        for i in 0..600u64 {
            content.push_str(&format!("{{\"ts\":{i},\"type\":\"gank_revision\"}}\n"));
        }
        let entries = parse_timeline(&content);
        assert_eq!(entries.len(), 500);
        // The oldest 100 (ts 0..=99) must have been dropped — newest kept.
        assert_eq!(entries.first().unwrap().at_ms, 100);
        assert_eq!(entries.last().unwrap().at_ms, 599);
    }

    #[test]
    fn parse_timeline_empty_file_returns_empty_vec() {
        assert!(parse_timeline("").is_empty());
    }

    fn temp_log_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("gmaiden-readlog-test-{tag}-{}", now_ms()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn safe_log_path_rejects_separators_dotdot_absolute_and_empty() {
        let dir = temp_log_dir("guard");
        assert!(safe_log_path_in_dir(&dir, "../match-1.jsonl").is_none());
        assert!(safe_log_path_in_dir(&dir, "sub/match-1.jsonl").is_none());
        assert!(safe_log_path_in_dir(&dir, "sub\\match-1.jsonl").is_none());
        assert!(safe_log_path_in_dir(&dir, "..\\..\\match-1.jsonl").is_none());
        assert!(safe_log_path_in_dir(&dir, "C:\\Windows\\notepad.exe").is_none());
        assert!(safe_log_path_in_dir(&dir, "/etc/passwd").is_none());
        assert!(safe_log_path_in_dir(&dir, "\\\\server\\share\\evil.jsonl").is_none());
        assert!(safe_log_path_in_dir(&dir, "..").is_none());
        assert!(safe_log_path_in_dir(&dir, "").is_none());
        assert!(safe_log_path_in_dir(&dir, "match-1.jsonl:hidden").is_none());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn safe_log_path_rejects_names_outside_the_match_naming_convention() {
        let dir = temp_log_dir("naming");
        assert!(safe_log_path_in_dir(&dir, "error.log").is_none());
        assert!(safe_log_path_in_dir(&dir, "match-1.txt").is_none());
        assert!(safe_log_path_in_dir(&dir, "notes.jsonl").is_none());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn safe_log_path_accepts_well_formed_bare_filename() {
        let dir = temp_log_dir("accept");
        let resolved = safe_log_path_in_dir(&dir, "match-1752345600.jsonl").expect("should be accepted");
        assert_eq!(resolved, dir.join("match-1752345600.jsonl"));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn read_match_log_rejects_traversal_before_touching_disk() {
        let dir = temp_log_dir("traversal");
        assert_eq!(
            read_match_log_in_dir(&dir, "../../secret.jsonl"),
            Err("ชื่อไฟล์ไม่ถูกต้อง".to_string())
        );
        assert_eq!(
            read_match_log_in_dir(&dir, "C:\\Windows\\notepad.exe"),
            Err("ชื่อไฟล์ไม่ถูกต้อง".to_string())
        );
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn read_match_log_reads_and_parses_a_real_file() {
        let dir = temp_log_dir("readfile");
        let name = "match-123.jsonl";
        fs::write(dir.join(name), "{\"ts\":5,\"type\":\"gank_revision\"}\n").unwrap();

        let entries = read_match_log_in_dir(&dir, name).expect("should read the file");
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].kind, "gank_revision");

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn read_match_log_errs_when_file_does_not_exist() {
        let dir = temp_log_dir("missing");
        let err = read_match_log_in_dir(&dir, "match-999.jsonl").unwrap_err();
        assert!(err.contains("ไม่สำเร็จ"));
        let _ = fs::remove_dir_all(&dir);
    }
}

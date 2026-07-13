//! Shared runtime state between the GSI server, the capture loop, and the UI.
//!
//! These are process-global because the producers/consumers live on different
//! threads (GSI on the tokio runtime, capture on its own WGC thread, commands on
//! the main thread) and the values are tiny. Plain atomics + a couple of mutexes
//! keep it lock-light; no extra crate needed (`Mutex::new` is const since 1.63).

use std::sync::atomic::{AtomicBool, AtomicU64, AtomicU8, Ordering};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::signal::Sensitivity;

/// True while a real match is in progress (set by the GSI server). The capture
/// loop uses this to gate the expensive CV pipeline — no point detecting heroes
/// at the main menu, and it keeps idle CPU near zero.
static IN_GAME: AtomicBool = AtomicBool::new(false);

/// Whether G-Signal gank warnings are enabled (mirrors the UI toggle). Defaults
/// on so a fresh install warns out of the box.
static SIGNAL_ENABLED: AtomicBool = AtomicBool::new(true);

/// User-tunable gank-warning sensitivity (Low / Med / High). Encoded as `u8` so
/// the capture loop reads it without locking; Med default matches `Sensitivity`.
static SIGNAL_SENSITIVITY: AtomicU8 = AtomicU8::new(1); // 0=Low, 1=Med, 2=High

/// Epoch-ms of the last GSI POST received. 0 = none yet. The watchdog uses this
/// to tell "Dota open & sending" (heartbeat ~30s) from "gone quiet".
static LAST_POST_MS: AtomicU64 = AtomicU64::new(0);
static PLAYER_TEAM: AtomicU8 = AtomicU8::new(0);

/// Maiden's voice for Rust-side (G-Signal) speech, mirrored from the UI picker.
static VOICE_NAME: Mutex<Option<String>> = Mutex::new(None);
static VOICE_RATE: Mutex<Option<i32>> = Mutex::new(None);

/// G-Master backend chosen in the UI. 0=Auto (claude→ollama fallback, the
/// historical behavior), 1=ClaudeOnly, 2=OllamaOnly. Auto is the default so an
/// installer untouched by the user still works on a Plan account, and the local
/// path is one click away when claude is rate-limited or offline.
static MASTER_BACKEND: AtomicU8 = AtomicU8::new(0);

/// Ollama model name the user picked for G-Master (empty → legacy default).
static MASTER_OLLAMA_MODEL: Mutex<String> = Mutex::new(String::new());

/// G-Master Claude auth mode. `false` = use the signed-in `claude` CLI Plan quota
/// (the historical, no-API-key path); `true` = call the Anthropic Messages API
/// directly with the user's own API key. Lets users who don't have the CLI signed
/// in (or who want a dedicated key) still drive the cloud advisor.
static MASTER_USE_APIKEY: AtomicBool = AtomicBool::new(false);

/// The Anthropic API key when `MASTER_USE_APIKEY` is on (empty → not provided).
static MASTER_API_KEY: Mutex<String> = Mutex::new(String::new());

/// Silent-arm efficacy study opt-in (RWANG TASK 2, C-2): "does G-Signal's gank
/// warning actually reduce deaths?". Mirrors the UI toggle. Off by default —
/// nothing about G-Signal's behavior changes unless the user opts in.
static EFFICACY_ENABLED: AtomicBool = AtomicBool::new(false);

/// Whether the CURRENT match was randomly assigned to the study's "silent arm"
/// (G-Signal still computes + logs everything, but the gank alert — voice and
/// banner — is suppressed). Rolled once per match by [`roll_match_arm`].
static SILENT_ARM: AtomicBool = AtomicBool::new(false);

/// Percent chance (0-100) a match is silent-armed when the study is enabled.
const SILENT_ARM_PROB: u32 = 25;

pub fn mark_post(ms: u64) {
    LAST_POST_MS.store(ms, Ordering::Relaxed);
}
pub fn last_post_ms() -> u64 {
    LAST_POST_MS.load(Ordering::Relaxed)
}

pub fn set_in_game(v: bool) {
    IN_GAME.store(v, Ordering::Relaxed);
}
pub fn in_game() -> bool {
    IN_GAME.load(Ordering::Relaxed)
}

pub fn set_player_team_name(name: &str) {
    let code = if name.eq_ignore_ascii_case("radiant") {
        1
    } else if name.eq_ignore_ascii_case("dire") {
        2
    } else {
        0
    };
    PLAYER_TEAM.store(code, Ordering::Relaxed);
}

pub fn enemy_team_ring() -> (f32, f32, f32) {
    match PLAYER_TEAM.load(Ordering::Relaxed) {
        2 => crate::cv::RADIANT_RING,
        _ => crate::cv::DIRE_RING,
    }
}

pub fn set_signal_enabled(v: bool) {
    SIGNAL_ENABLED.store(v, Ordering::Relaxed);
}
pub fn signal_enabled() -> bool {
    SIGNAL_ENABLED.load(Ordering::Relaxed)
}

/// Whether G-AnnStudio announcer voice lines (kill/streak/death/etc., fired
/// from `gsi.rs`'s `announcer::most_important` path) are enabled. Defaults on
/// so a fresh install narrates out of the box.
///
/// This is intentionally independent of `SIGNAL_ENABLED` above: G-Signal's
/// gank/danger/revision interrupts are a different, always-critical path
/// (capture.rs's `voice_interrupt`, gated only by `signal_enabled()`) and must
/// never be gated by this flag — CLAUDE.md's audio priority rule.
static ANNOUNCER_ENABLED: AtomicBool = AtomicBool::new(true);

pub fn set_announcer_enabled(v: bool) {
    ANNOUNCER_ENABLED.store(v, Ordering::Relaxed);
}
pub fn announcer_enabled() -> bool {
    ANNOUNCER_ENABLED.load(Ordering::Relaxed)
}

pub fn set_signal_sensitivity(s: Sensitivity) {
    let code: u8 = match s {
        Sensitivity::Low => 0,
        Sensitivity::Med => 1,
        Sensitivity::High => 2,
    };
    SIGNAL_SENSITIVITY.store(code, Ordering::Relaxed);
}
pub fn signal_sensitivity() -> Sensitivity {
    match SIGNAL_SENSITIVITY.load(Ordering::Relaxed) {
        0 => Sensitivity::Low,
        2 => Sensitivity::High,
        _ => Sensitivity::Med,
    }
}

/// Mirror the user's chosen voice/rate so G-Signal speaks in Maiden's selected
/// voice instead of the SAPI default.
pub fn set_voice(name: Option<String>, rate: Option<i32>) {
    if let Ok(mut g) = VOICE_NAME.lock() {
        *g = name.filter(|s| !s.is_empty());
    }
    if let Ok(mut g) = VOICE_RATE.lock() {
        *g = rate;
    }
}

/// Current (voice name, rate) for the Rust speech path.
pub fn voice() -> (Option<String>, Option<i32>) {
    let name = VOICE_NAME.lock().ok().and_then(|g| g.clone());
    let rate = VOICE_RATE.lock().ok().and_then(|g| *g);
    (name, rate)
}

/// G-Master backend mode picked in the UI.
#[derive(Copy, Clone, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MasterBackend {
    Auto,
    Claude,
    Ollama,
}
pub fn set_master_backend(b: MasterBackend) {
    let code: u8 = match b {
        MasterBackend::Auto => 0,
        MasterBackend::Claude => 1,
        MasterBackend::Ollama => 2,
    };
    MASTER_BACKEND.store(code, Ordering::Relaxed);
}
pub fn master_backend() -> MasterBackend {
    match MASTER_BACKEND.load(Ordering::Relaxed) {
        1 => MasterBackend::Claude,
        2 => MasterBackend::Ollama,
        _ => MasterBackend::Auto,
    }
}

pub fn set_master_ollama_model(name: String) {
    if let Ok(mut g) = MASTER_OLLAMA_MODEL.lock() {
        *g = name;
    }
}
pub fn master_ollama_model() -> String {
    MASTER_OLLAMA_MODEL
        .lock()
        .ok()
        .map(|g| g.clone())
        .unwrap_or_default()
}

/// Set the G-Master Claude auth *mode* only. `false` keeps the `claude` CLI Plan
/// path; `true` routes Claude advice through the Anthropic Messages API using the
/// key held separately by [`set_master_api_key`]. The key is deliberately NOT a
/// parameter here so the frontend's mode-sync effect can never overwrite the
/// DPAPI-loaded key with an empty string (CR-008 WP-2, gate finding B2).
pub fn set_master_mode(use_api_key: bool) {
    MASTER_USE_APIKEY.store(use_api_key, Ordering::Relaxed);
}

/// Set (or clear, with `None`/empty) the Anthropic API key. Owned separately from
/// the mode: written once at startup from the DPAPI secret store and again only
/// on an explicit user edit — never from the mount-time mode sync.
pub fn set_master_api_key(key: Option<String>) {
    if let Ok(mut g) = MASTER_API_KEY.lock() {
        *g = key.filter(|s| !s.trim().is_empty()).unwrap_or_default();
    }
}

/// Whether an Anthropic API key is currently stored (regardless of auth mode).
/// Drives the UI "key saved" state without ever handing the plaintext back to
/// the webview.
pub fn master_api_key_present() -> bool {
    MASTER_API_KEY
        .lock()
        .ok()
        .map(|g| !g.trim().is_empty())
        .unwrap_or(false)
}

/// The Anthropic API key to use for Claude advice, or `None` when the user is on
/// the CLI Plan path (or hasn't entered a key). `Some` only when API-key mode is
/// on *and* a non-empty key is present, so callers can branch with a single check.
pub fn master_api_key() -> Option<String> {
    if !MASTER_USE_APIKEY.load(Ordering::Relaxed) {
        return None;
    }
    MASTER_API_KEY
        .lock()
        .ok()
        .map(|g| g.clone())
        .filter(|s| !s.trim().is_empty())
}

/// Toggle the silent-arm efficacy study. When turned OFF, instantly force the
/// current match out of the silent arm — the user must never keep silently
/// un-alerted matches running after opting back out (spec 2.2: "instant off").
pub fn set_efficacy_enabled(v: bool) {
    EFFICACY_ENABLED.store(v, Ordering::Relaxed);
    if !v {
        SILENT_ARM.store(false, Ordering::Relaxed);
    }
}
pub fn efficacy_enabled() -> bool {
    EFFICACY_ENABLED.load(Ordering::Relaxed)
}

/// Whether the match currently in progress is silent-armed (alert suppressed).
pub fn silent_arm() -> bool {
    SILENT_ARM.load(Ordering::Relaxed)
}

fn set_silent_arm(v: bool) {
    SILENT_ARM.store(v, Ordering::Relaxed);
}

/// Pure decision function for the silent-arm randomization, isolated from real
/// time / global state so it's directly unit-testable. `entropy % 100 < prob_pct`
/// gives a `prob_pct`-out-of-100 chance; disabled always returns `false`.
///
/// NOTE: `entropy` must already be well-mixed across its low decimal digits —
/// pass raw clock nanos through [`mix_entropy`] first. On Windows `SystemTime`
/// is FILETIME-backed (100 ns granularity), so raw nanos are always a multiple
/// of 100 and `raw % 100` is a constant `0` — feeding raw nanos here would
/// silence 100% of matches (blocker B1). The finalizer breaks that quantization.
pub fn decide_silent_arm(entropy: u64, enabled: bool, prob_pct: u32) -> bool {
    enabled && (entropy % 100) < prob_pct as u64
}

/// splitmix64 finalizer — avalanches a low-entropy / quantized input (e.g. a
/// FILETIME clock value that's always a multiple of 100) so its low decimal
/// digits are uniformly distributed. Pure + deterministic.
fn mix_entropy(raw: u64) -> u64 {
    let mut x = raw.wrapping_add(0x9E37_79B9_7F4A_7C15);
    x = (x ^ (x >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    x = (x ^ (x >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    x ^ (x >> 31)
}

/// Roll the silent-arm decision for the match that is just starting. Call
/// exactly once per match (from `log::start_match`, itself gated on the
/// GSI in-game rising edge). Stores the result in `SILENT_ARM` and returns it
/// so the caller can persist it into the match-start log record.
pub fn roll_match_arm() -> bool {
    let raw = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos() as u64)
        .unwrap_or(0);
    // Mix BEFORE the modulo — raw Windows nanos are FILETIME-quantized to
    // multiples of 100, so `raw % 100` is a degenerate constant without this.
    let arm = decide_silent_arm(mix_entropy(raw), efficacy_enabled(), SILENT_ARM_PROB);
    set_silent_arm(arm);
    arm
}

// ── Enemy roster the CV pipeline has identified this match ───────────────────
// Grounds G-Master's counter-item advice on the heroes actually seen (instead of
// the old hardcoded empty list). Populated by the capture loops as detections
// arrive, cleared at match start (`log::start_match`). It lives in Rust on
// purpose: it's the SINGLE source of truth regardless of which webview window
// asks for advice — the frontend companion store is per-window and is NOT
// populated in the overlay window, so the always-on advice path can't rely on
// it. Raw Valve/CV internal hero names (labels.json form).
// (hero name, sighting count). A hero only counts as "known" once seen in
// `MIN_ENEMY_SIGHTINGS` frames, so a single spurious CV misclassification can't
// latch a wrong hero into the advice prompt for the whole match (a real enemy on
// the minimap is detected many times a second, so it crosses the bar in a blink).
static KNOWN_ENEMIES: Mutex<Vec<(String, u32)>> = Mutex::new(Vec::new());
const MIN_ENEMY_SIGHTINGS: u32 = 3;

pub fn add_known_enemy(name: &str) {
    if name.is_empty() {
        return;
    }
    if let Ok(mut g) = KNOWN_ENEMIES.lock() {
        if let Some(entry) = g.iter_mut().find(|(n, _)| n == name) {
            entry.1 = entry.1.saturating_add(1);
        } else {
            g.push((name.to_string(), 1));
        }
    }
}

/// Enemy heroes confirmed by repeated CV sightings this match (raw label form).
pub fn known_enemies() -> Vec<String> {
    KNOWN_ENEMIES
        .lock()
        .map(|g| {
            g.iter()
                .filter(|(_, c)| *c >= MIN_ENEMY_SIGHTINGS)
                .map(|(n, _)| n.clone())
                .collect()
        })
        .unwrap_or_default()
}

pub fn clear_known_enemies() {
    if let Ok(mut g) = KNOWN_ENEMIES.lock() {
        g.clear();
    }
}

// ── Draft phase gate (Draft-CV) ──────────────────────────────────────────────
// True while the client is in hero selection / strategy time (pre-horn). The
// capture loop wakes for Draft-CV during this window even though `in_game()` is
// false: the match isn't running, so there's no FPS/latency budget to protect —
// heavy portrait CV is fine here (same idle-window logic G-Revive uses on death).
// Set from `gsi.rs` off the raw `game_state`.
static IN_DRAFT: AtomicBool = AtomicBool::new(false);

pub fn set_in_draft(v: bool) {
    let was = IN_DRAFT.swap(v, Ordering::Relaxed);
    // Entering a fresh draft → drop any prior match's roster so the capture loop
    // re-reads THIS match's picks. We clear here (not at match start like
    // KNOWN_ENEMIES) because the roster is read DURING the draft, before the
    // match starts — clearing it at match start would wipe what we just read.
    if v && !was {
        clear_roster();
    }
}

pub fn in_draft() -> bool {
    IN_DRAFT.load(Ordering::Relaxed)
}

// ── Match roster (Draft-CV) ──────────────────────────────────────────────────
// The 10 hero identities read off the pick screen (raw labels.json form), split
// by team. Unlike KNOWN_ENEMIES (which trickles in enemy-only from minimap
// sightings), this is the FULL roster known before the horn. It (a) fills ally
// identities the GSI never exposes, and (b) constrains the minimap classifier to
// the real 10 heroes via `roster_labels()`, so a misclassification into a hero
// not in the match is dropped (the definitive phantom-hero fix). Cleared at
// match start alongside KNOWN_ENEMIES.
static ROSTER: Mutex<Option<Roster>> = Mutex::new(None);

#[derive(Clone, Default, Debug, PartialEq, serde::Serialize)]
pub struct Roster {
    pub radiant: Vec<String>,
    pub dire: Vec<String>,
}

pub fn set_roster(radiant: Vec<String>, dire: Vec<String>) {
    if let Ok(mut g) = ROSTER.lock() {
        *g = Some(Roster { radiant, dire });
    }
}

pub fn roster() -> Option<Roster> {
    ROSTER.lock().ok().and_then(|g| g.clone())
}

/// All roster hero labels (both teams), or `None` if no roster has been read yet
/// (or it's empty). The minimap detector consults this to reject detections whose
/// hero isn't one of the real 10 — the roster-grounded phantom-hero fix.
pub fn roster_labels() -> Option<Vec<String>> {
    let g = ROSTER.lock().ok()?;
    let r = g.as_ref()?;
    let all: Vec<String> = r.radiant.iter().chain(r.dire.iter()).cloned().collect();
    (!all.is_empty()).then_some(all)
}

pub fn clear_roster() {
    if let Ok(mut g) = ROSTER.lock() {
        *g = None;
    }
}

// ── OAuth callback anti-CSRF gate (CR-008 WP-3) ──────────────────────────────
// `:3000/auth/callback` is an unauthenticated local endpoint. Without a gate,
// any local process — or a drive-by web page (`<img src=".../auth/callback?code
// =ATTACKER">`) — could hand the app an OAuth `code` and sign the user into an
// attacker's account (login CSRF / session fixation). We only honor a callback
// while a sign-in the app *itself* started is in flight: single-use + time-boxed.
// The OAuth redirect URL is deliberately left untouched so it keeps matching the
// Supabase redirect allowlist.
static OAUTH_PENDING: AtomicBool = AtomicBool::new(false);
static OAUTH_PENDING_SINCE_MS: AtomicU64 = AtomicU64::new(0);
const OAUTH_PENDING_TIMEOUT_MS: u64 = 600_000; // 10 min — generous for the browser round-trip

/// Arm the gate: a sign-in the app initiated is now in flight (called from the
/// frontend right before it opens the system browser).
pub fn set_oauth_pending(now_ms: u64) {
    OAUTH_PENDING_SINCE_MS.store(now_ms, Ordering::Relaxed);
    // Release publishes the SINCE store above to any thread that Acquire-observes
    // this flag in take_oauth_pending (the callback runs on a different thread).
    OAUTH_PENDING.store(true, Ordering::Release);
}

/// Pure, testable window check for the gate.
fn oauth_pending_ok(pending: bool, since_ms: u64, now_ms: u64, timeout_ms: u64) -> bool {
    pending && now_ms.saturating_sub(since_ms) <= timeout_ms
}

/// Consume the gate (single-use): `true` only if a sign-in is in flight AND still
/// within the timeout window. Clears the flag either way so a code is honored at
/// most once.
pub fn take_oauth_pending(now_ms: u64) -> bool {
    let was = OAUTH_PENDING.swap(false, Ordering::AcqRel);
    let since = OAUTH_PENDING_SINCE_MS.load(Ordering::Relaxed);
    oauth_pending_ok(was, since, now_ms, OAUTH_PENDING_TIMEOUT_MS)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn oauth_gate_rejects_unsolicited_and_expired_callbacks() {
        assert!(!oauth_pending_ok(false, 0, 1_000, 600_000), "no sign-in in flight → reject");
        assert!(oauth_pending_ok(true, 1_000, 1_000, 600_000), "same instant → accept");
        assert!(
            oauth_pending_ok(true, 1_000, 1_000 + 599_000, 600_000),
            "within window → accept"
        );
        assert!(
            !oauth_pending_ok(true, 1_000, 1_000 + 600_001, 600_000),
            "past window → reject"
        );
    }

    #[test]
    fn take_oauth_pending_is_single_use() {
        set_oauth_pending(10_000);
        assert!(take_oauth_pending(10_500), "first consume within window");
        assert!(!take_oauth_pending(10_600), "already consumed → reject the replay");
    }

    #[test]
    fn known_enemies_needs_repeat_sightings_then_clears() {
        clear_known_enemies();
        for _ in 0..MIN_ENEMY_SIGHTINGS {
            add_known_enemy("antimage");
        }
        add_known_enemy("lina"); // seen once → below threshold, excluded
        add_known_enemy(""); // ignored
        let e = known_enemies();
        assert_eq!(e, vec!["antimage".to_string()], "only repeatedly-seen heroes qualify: {e:?}");
        for _ in 0..MIN_ENEMY_SIGHTINGS {
            add_known_enemy("lina");
        }
        assert_eq!(known_enemies().len(), 2, "lina crosses the bar after repeats");
        clear_known_enemies();
        assert!(known_enemies().is_empty(), "cleared on match start");
    }

    #[test]
    fn announcer_enabled_defaults_true_and_toggles() {
        assert!(announcer_enabled(), "announcer must default to enabled");
        set_announcer_enabled(false);
        assert!(!announcer_enabled());
        set_announcer_enabled(true);
        assert!(announcer_enabled());
    }

    #[test]
    fn signal_enabled_and_announcer_enabled_are_independent_flags() {
        // CLAUDE.md audio priority rule: the announcer toggle must never gate
        // G-Signal (danger/gank/revision), and vice versa.
        set_signal_enabled(false);
        set_announcer_enabled(true);
        assert!(!signal_enabled());
        assert!(announcer_enabled());

        set_signal_enabled(true);
        set_announcer_enabled(false);
        assert!(signal_enabled());
        assert!(!announcer_enabled());

        // restore defaults for any other test sharing this process
        set_announcer_enabled(true);
    }

    #[test]
    fn decide_silent_arm_disabled_is_always_false() {
        for entropy in [0u64, 1, 24, 25, 50, 99, 12345] {
            assert!(!decide_silent_arm(entropy, false, 25));
        }
    }

    #[test]
    fn decide_silent_arm_prob_zero_is_always_false() {
        for entropy in [0u64, 1, 50, 99, 999] {
            assert!(!decide_silent_arm(entropy, true, 0));
        }
    }

    #[test]
    fn decide_silent_arm_prob_hundred_is_always_true() {
        for entropy in [0u64, 1, 50, 99, 999] {
            assert!(decide_silent_arm(entropy, true, 100));
        }
    }

    #[test]
    fn decide_silent_arm_respects_the_prob_pct_boundary() {
        // prob_pct=25 → entropy%100 in [0,25) is silent-armed, [25,100) is not.
        assert!(decide_silent_arm(0, true, 25));
        assert!(decide_silent_arm(24, true, 25));
        assert!(!decide_silent_arm(25, true, 25));
        assert!(!decide_silent_arm(99, true, 25));
        // wraps via modulo regardless of the raw entropy magnitude.
        assert!(decide_silent_arm(100_024, true, 25));
        assert!(!decide_silent_arm(100_025, true, 25));
    }

    #[test]
    fn set_efficacy_enabled_false_forces_silent_arm_off_instantly() {
        set_efficacy_enabled(true);
        set_silent_arm(true);
        assert!(silent_arm());
        set_efficacy_enabled(false);
        assert!(!silent_arm(), "turning the study off must instantly clear silent-arm");
        assert!(!efficacy_enabled());
    }

    #[test]
    fn roll_match_arm_is_false_when_efficacy_disabled() {
        set_efficacy_enabled(false);
        assert!(!roll_match_arm());
        assert!(!silent_arm());
    }

    #[test]
    fn arm_distribution_not_degenerate_under_filetime_quantization() {
        // Blocker B1 reproduction: Windows `SystemTime` is FILETIME-backed
        // (100 ns granularity), so raw clock nanos are ALWAYS a multiple of
        // 100 → `raw % 100 == 0` → `decide_silent_arm(raw, true, 25)` would be
        // `true` for EVERY match (100% silenced). Feeding FILETIME-like inputs
        // (a large base, stepped by 100) through `mix_entropy` first must
        // restore a ~25% split — neither 0 nor n.
        let n = 10_000u64;
        let base = 133_800_000_000_000_000u64; // FILETIME-scale, multiple of 100
        let mut silent = 0u64;
        // Sanity: without mixing this would be all-or-nothing.
        let mut raw_hits = 0u64;
        for i in 0..n {
            let raw = base + i * 100; // always a multiple of 100, like FILETIME
            if decide_silent_arm(mix_entropy(raw), true, 25) {
                silent += 1;
            }
            if decide_silent_arm(raw, true, 25) {
                raw_hits += 1;
            }
        }
        // The bug: raw (unmixed) FILETIME inputs are degenerate — every one is
        // silenced. This asserts the defect exists so the fix is meaningful.
        assert_eq!(raw_hits, n, "raw FILETIME nanos should be 100% silenced (the B1 bug)");
        // The fix: mixed entropy lands in a loose band around 25%.
        let low = n * 15 / 100;
        let high = n * 35 / 100;
        assert!(
            silent > low && silent < high,
            "silent-arm share {silent}/{n} outside 15%-35% band — randomization degenerate"
        );
    }
}

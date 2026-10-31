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

#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum MatchLifecycle {
    Draft,
    Live,
    Disconnected,
    End,
    Abandon,
}

#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize)]
pub struct MatchSessionSnapshot {
    pub match_id: Option<String>,
    pub session_id: Option<String>,
    pub session_epoch: u64,
    pub session_lifecycle: Option<MatchLifecycle>,
}

#[derive(Clone, Debug, serde::Serialize)]
pub struct MatchSessionEvent<T> {
    #[serde(flatten)]
    pub payload: T,
    #[serde(flatten)]
    pub session: MatchSessionSnapshot,
}

impl<T> MatchSessionEvent<T> {
    pub fn new(payload: T, session: &MatchSessionSnapshot) -> Self {
        Self {
            payload,
            session: session.clone(),
        }
    }
}

#[derive(Clone, Debug, serde::Serialize)]
pub struct SessionTextEvent {
    pub text: String,
    #[serde(flatten)]
    pub session: MatchSessionSnapshot,
}

impl SessionTextEvent {
    pub fn new(text: impl Into<String>, session: &MatchSessionSnapshot) -> Self {
        Self {
            text: text.into(),
            session: session.clone(),
        }
    }
}

#[derive(Clone, Debug)]
struct MatchSession {
    match_id: Option<String>,
    session_id: String,
    session_epoch: u64,
    lifecycle: MatchLifecycle,
    resume_lifecycle: Option<MatchLifecycle>,
    last_clock_time: i64,
}

#[derive(Default)]
struct MatchSessionState {
    current: Option<MatchSession>,
    next_epoch: u64,
    next_local_id: u64,
}

static MATCH_SESSION: Mutex<MatchSessionState> = Mutex::new(MatchSessionState {
    current: None,
    next_epoch: 0,
    next_local_id: 0,
});

/// True while a real match is in progress (set by the GSI server). The capture
/// loop uses this to gate the expensive CV pipeline — no point detecting heroes
/// at the main menu, and it keeps idle CPU near zero.
static IN_GAME: AtomicBool = AtomicBool::new(false);

/// The local capture thread is started once during app setup, independently of
/// account sign-in or network state.
static LOCAL_CAPTURE_STARTED: AtomicBool = AtomicBool::new(false);

/// Whether G-Signal gank warnings are enabled (mirrors the UI toggle). Defaults
/// on so a fresh install warns out of the box.
static SIGNAL_ENABLED: AtomicBool = AtomicBool::new(true);

/// User-tunable gank-warning sensitivity (Low / Med / High). Encoded as `u8` so
/// the capture loop reads it without locking; Med default matches `Sensitivity`.
static SIGNAL_SENSITIVITY: AtomicU8 = AtomicU8::new(1); // 0=Low, 1=Med, 2=High

/// Epoch-ms of the last GSI POST received. 0 = none yet. The watchdog uses this
/// to tell "Dota open & sending" from "gone quiet".
static LAST_POST_MS: AtomicU64 = AtomicU64::new(0);
/// Accepted MVP contract: a GSI-backed conclusion is usable only while its
/// last validated source observation is at most two seconds old.
pub const GSI_FRESHNESS_MAX_AGE_MS: u64 = 2_000;
static PLAYER_TEAM: AtomicU8 = AtomicU8::new(0);

#[derive(Default)]
struct WarningContext {
    epoch: u64,
    clock: i64,
    advanced_at: u64,
    updated_at: u64,
    playing: bool,
    alive: bool,
}

static WARNING_CONTEXT: Mutex<WarningContext> = Mutex::new(WarningContext {
    epoch: 0,
    clock: 0,
    advanced_at: 0,
    updated_at: 0,
    playing: false,
    alive: false,
});

pub fn update_warning_context(epoch: u64, tick: &crate::gsi::GameTick) {
    if let Ok(mut context) = WARNING_CONTEXT.lock() {
        let now = epoch_ms();
        if context.epoch != epoch || tick.clock_time != context.clock {
            context.advanced_at = now;
        }
        context.epoch = epoch;
        context.clock = tick.clock_time;
        context.updated_at = now;
        context.playing = tick.game_state == "DOTA_GAMERULES_STATE_GAME_IN_PROGRESS";
        context.alive = tick.alive;
    }
}

fn warning_context_ready(context: &WarningContext, epoch: u64, now: u64) -> bool {
    context.epoch == epoch
        && context.playing
        && context.alive
        && context.clock >= 30
        && now.saturating_sub(context.updated_at) <= GSI_FRESHNESS_MAX_AGE_MS
        && now.saturating_sub(context.advanced_at) <= 2500
}

pub fn warning_context_is_ready(epoch: u64) -> bool {
    WARNING_CONTEXT
        .lock()
        .is_ok_and(|context| warning_context_ready(&context, epoch, epoch_ms()))
}

/// Maiden's voice for Rust-side (G-Signal) speech, mirrored from the UI
/// picker. One lock for both fields together, not two separate ones -- a
/// caller reading name and rate through independent locks could observe a
/// torn (name, rate) pairing the user never actually selected if a
/// concurrent set_voice() lands between the two reads (tts.rs's prewarm
/// cache now keys correctness on this pair matching what it baked with).
static VOICE: Mutex<(Option<String>, Option<i32>)> = Mutex::new((None, None));

/// Routing, consent and provider settings share one generation. Auto uses
/// Claude only after separate opt-in; API credentials never grant consent.
static MASTER_CONFIG: Mutex<MasterConfig> = Mutex::new(MasterConfig {
    backend: MasterBackend::Auto,
    cloud_context_opt_in: false,
    generation: 0,
    ollama_model: String::new(),
    use_api_key: false,
    api_key: String::new(),
});

struct MasterConfig {
    backend: MasterBackend,
    cloud_context_opt_in: bool,
    generation: u64,
    ollama_model: String,
    use_api_key: bool,
    api_key: String,
}

/// A route and its authorization generation must be captured together. Never
/// serialize this object: its auth snapshot can contain the private API key.
#[derive(Clone)]
pub(crate) struct MasterRequestContext {
    pub backend: MasterBackend,
    pub cloud_context_opt_in: bool,
    pub generation: u64,
    pub ollama_model: String,
    pub api_key: Option<String>,
}

/// Silent-arm efficacy study opt-in (RWANG TASK 2, C-2): "does G-Signal's gank
/// warning actually reduce deaths?". Mirrors the UI toggle. Off by default —
/// nothing about G-Signal's behavior changes unless the user opts in.
static EFFICACY_ENABLED: AtomicBool = AtomicBool::new(false);

/// G-Persona preset: 0=Coach, 1=Silent, 2=Caster, 3=Meme.
static PERSONA_PRESET: AtomicU8 = AtomicU8::new(0);

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

pub fn gsi_is_fresh_at(last_post_ms: u64, now_ms: u64) -> bool {
    last_post_ms != 0 && now_ms.saturating_sub(last_post_ms) <= GSI_FRESHNESS_MAX_AGE_MS
}

pub fn gsi_is_fresh() -> bool {
    gsi_is_fresh_at(last_post_ms(), epoch_ms())
}

/// The score-derived dead-enemy discount is own-state. While the GSI feed is
/// stale, treat the count as unknown and keep every CV-observed missing hero in
/// the risk set rather than reusing a potentially outdated safe-side discount.
pub fn fresh_dead_enemy_count(is_gsi_fresh: bool, known_dead: usize) -> usize {
    if is_gsi_fresh {
        known_dead
    } else {
        0
    }
}

pub fn set_in_game(v: bool) {
    // Every in_game transition — horn and post-game alike — is a match
    // boundary. Bumping the epoch here (rather than from `log::start_match`)
    // keeps ONE authority for "a new match began": this is already the single
    // place the transition is recorded, and both the GSI handler and the
    // Dota-exit watchdog call it.
    if IN_GAME.swap(v, Ordering::Relaxed) != v {
        MATCH_EPOCH.fetch_add(1, Ordering::Relaxed);
        // Same boundary, same reasoning as the capture-side pipeline rebuild:
        // last match's corpses must not discount this match's threats, and the
        // score baseline has to re-seed from the new scoreboard.
        clear_enemy_deaths();
    }
}
pub fn in_game() -> bool {
    IN_GAME.load(Ordering::Relaxed)
}

fn lifecycle_is_terminal(lifecycle: MatchLifecycle) -> bool {
    matches!(lifecycle, MatchLifecycle::End | MatchLifecycle::Abandon)
}

fn local_session_id(state: &mut MatchSessionState) -> String {
    state.next_local_id = state.next_local_id.saturating_add(1);
    format!(
        "local-{}-{}-{}",
        std::process::id(),
        epoch_ms(),
        state.next_local_id
    )
}

fn session_id_for(match_id: Option<&str>, state: &mut MatchSessionState) -> String {
    match match_id {
        Some(id) => format!("dota-{id}"),
        None => local_session_id(state),
    }
}

fn should_start_new_session(
    current: &MatchSession,
    lifecycle: MatchLifecycle,
    match_id: Option<&str>,
    clock_time: i64,
) -> bool {
    if let (Some(current_id), Some(incoming_id)) = (current.match_id.as_deref(), match_id) {
        if current_id != incoming_id {
            return true;
        }
        // A validated match id is authoritative across reconnects. A clock
        // reset in the same match must not detach the resumed feed from its
        // existing identity.
        return false;
    }

    match current.lifecycle {
        MatchLifecycle::End => {
            return match lifecycle {
                MatchLifecycle::End => false,
                MatchLifecycle::Draft => true,
                MatchLifecycle::Live => current.last_clock_time > 5 && clock_time <= 5,
                MatchLifecycle::Disconnected | MatchLifecycle::Abandon => false,
            };
        }
        MatchLifecycle::Abandon => {
            if matches!(
                lifecycle,
                MatchLifecycle::Live | MatchLifecycle::Disconnected
            ) && current.match_id.is_some()
                && current.match_id.as_deref() == match_id
            {
                return false;
            }
            return lifecycle != MatchLifecycle::Abandon;
        }
        _ => {}
    }

    if lifecycle == MatchLifecycle::Draft {
        return match current.lifecycle {
            MatchLifecycle::Live => true,
            MatchLifecycle::Disconnected => current.resume_lifecycle != Some(MatchLifecycle::Draft),
            _ => false,
        };
    }

    matches!(lifecycle, MatchLifecycle::Live)
        && current.last_clock_time > 5
        && clock_time <= 5
        && matches!(
            current.lifecycle,
            MatchLifecycle::Live | MatchLifecycle::Disconnected
        )
}

fn start_session(
    state: &mut MatchSessionState,
    lifecycle: MatchLifecycle,
    match_id: Option<String>,
    clock_time: i64,
) {
    state.next_epoch = state.next_epoch.saturating_add(1);
    let session_id = session_id_for(match_id.as_deref(), state);
    state.current = Some(MatchSession {
        match_id,
        session_id,
        session_epoch: state.next_epoch,
        lifecycle,
        resume_lifecycle: None,
        last_clock_time: clock_time,
    });
}

fn snapshot_of(state: &MatchSessionState) -> MatchSessionSnapshot {
    match state.current.as_ref() {
        Some(current) => MatchSessionSnapshot {
            match_id: current.match_id.clone(),
            session_id: Some(current.session_id.clone()),
            session_epoch: current.session_epoch,
            session_lifecycle: Some(current.lifecycle),
        },
        None => MatchSessionSnapshot {
            match_id: None,
            session_id: None,
            session_epoch: 0,
            session_lifecycle: None,
        },
    }
}

fn observe_session_state(
    state: &mut MatchSessionState,
    lifecycle: MatchLifecycle,
    match_id: Option<String>,
    clock_time: i64,
) -> (MatchSessionSnapshot, bool) {
    let usable_match_id = match_id;
    // POST_GAME is terminal. A delayed tick with the same or missing ID must
    // not move the detector back to Live; a new trusted ID, a fresh draft, or
    // a clock reset can establish a distinct session.
    if let Some(current) = state
        .current
        .as_ref()
        .filter(|current| current.lifecycle == MatchLifecycle::End)
    {
        let distinct_id = match (current.match_id.as_deref(), usable_match_id.as_deref()) {
            (Some(current_id), Some(incoming_id)) => current_id != incoming_id,
            (None, Some(_)) => true,
            _ => false,
        };
        let new_without_id = usable_match_id.is_none()
            && (lifecycle == MatchLifecycle::Draft
                || (lifecycle == MatchLifecycle::Live
                    && current.last_clock_time > 5
                    && clock_time <= 5));
        if !distinct_id && !new_without_id {
            return (snapshot_of(state), false);
        }
    }
    let start_new = state.current.as_ref().is_none_or(|current| {
        should_start_new_session(current, lifecycle, usable_match_id.as_deref(), clock_time)
    });

    let mut boundary = false;
    if start_new {
        start_session(state, lifecycle, usable_match_id, clock_time);
        boundary = true;
    } else if let Some(current) = state.current.as_mut() {
        let was_terminal = lifecycle_is_terminal(current.lifecycle);
        if lifecycle == MatchLifecycle::Disconnected
            && !matches!(current.lifecycle, MatchLifecycle::Disconnected)
        {
            current.resume_lifecycle = Some(current.lifecycle);
        } else {
            current.resume_lifecycle = None;
        }
        if current.match_id.is_none() {
            if let Some(id) = usable_match_id {
                current.match_id = Some(id.clone());
                current.session_id = format!("dota-{id}");
            }
        }
        current.lifecycle = lifecycle;
        current.last_clock_time = clock_time;
        boundary = !was_terminal && lifecycle_is_terminal(lifecycle);
    }

    (snapshot_of(state), boundary)
}

/// Apply one validated GSI lifecycle observation. A trusted match id enriches
/// a draft-local session or starts a new session when it changes. A missing id
/// never destroys an already established identity.
pub fn observe_match_tick(
    lifecycle: MatchLifecycle,
    match_id: Option<String>,
    clock_time: i64,
    in_game: bool,
) -> MatchSessionSnapshot {
    let Ok(mut state) = MATCH_SESSION.lock() else {
        return MatchSessionSnapshot {
            match_id: None,
            session_id: None,
            session_epoch: 0,
            session_lifecycle: None,
        };
    };
    let (snapshot, boundary) = observe_session_state(&mut state, lifecycle, match_id, clock_time);
    let effective_in_game = in_game
        && !snapshot
            .session_lifecycle
            .is_some_and(lifecycle_is_terminal);
    let in_game_changed = IN_GAME.load(Ordering::Relaxed) != effective_in_game;
    set_in_game(effective_in_game);
    if boundary && !in_game_changed {
        MATCH_EPOCH.fetch_add(1, Ordering::Relaxed);
    }
    if boundary {
        clear_enemy_deaths();
        clear_known_enemies();
        clear_roster();
    }
    crate::master::observe_advice_session(
        snapshot.session_epoch,
        snapshot.session_lifecycle == Some(MatchLifecycle::Live),
    );
    snapshot
}

/// GSI can stop while Dota remains open. Keep the session identity stable and
/// mark its lifecycle disconnected so a fresh observation can resume it.
pub fn observe_gsi_status(dota_running: bool, gsi_fresh: bool) -> MatchSessionSnapshot {
    let Ok(mut state) = MATCH_SESSION.lock() else {
        return MatchSessionSnapshot {
            match_id: None,
            session_id: None,
            session_epoch: 0,
            session_lifecycle: None,
        };
    };
    if let Some(current) = state.current.as_mut() {
        if !dota_running && !lifecycle_is_terminal(current.lifecycle) {
            current.lifecycle = MatchLifecycle::Abandon;
            current.resume_lifecycle = None;
            let was_in_game = IN_GAME.load(Ordering::Relaxed);
            set_in_game(false);
            if !was_in_game {
                MATCH_EPOCH.fetch_add(1, Ordering::Relaxed);
            }
        } else if !gsi_fresh
            && matches!(
                current.lifecycle,
                MatchLifecycle::Live | MatchLifecycle::Draft
            )
        {
            current.resume_lifecycle = Some(current.lifecycle);
            current.lifecycle = MatchLifecycle::Disconnected;
        }
    }
    let snapshot = snapshot_of(&state);
    crate::master::observe_advice_session(
        snapshot.session_epoch,
        snapshot.session_lifecycle == Some(MatchLifecycle::Live),
    );
    snapshot
}

/// A process exit before an explicit post-game observation is recorded as an
/// abandon. If the same trusted match id is observed again, the session can
/// resume with its original epoch.
pub fn mark_dota_exited() -> MatchSessionSnapshot {
    let was_in_game = IN_GAME.load(Ordering::Relaxed);
    set_in_game(false);
    let Ok(mut state) = MATCH_SESSION.lock() else {
        return MatchSessionSnapshot {
            match_id: None,
            session_id: None,
            session_epoch: 0,
            session_lifecycle: None,
        };
    };
    let mut boundary = false;
    if let Some(current) = state.current.as_mut() {
        if !lifecycle_is_terminal(current.lifecycle) {
            current.resume_lifecycle = Some(current.lifecycle);
            current.lifecycle = MatchLifecycle::Abandon;
            boundary = true;
        }
    }
    if boundary && !was_in_game {
        MATCH_EPOCH.fetch_add(1, Ordering::Relaxed);
    }
    let snapshot = snapshot_of(&state);
    crate::master::observe_advice_session(snapshot.session_epoch, false);
    snapshot
}

pub fn match_session_snapshot() -> MatchSessionSnapshot {
    MATCH_SESSION
        .lock()
        .map(|state| snapshot_of(&state))
        .unwrap_or(MatchSessionSnapshot {
            match_id: None,
            session_id: None,
            session_epoch: 0,
            session_lifecycle: None,
        })
}

/// Whether an asynchronous result still belongs to the current session.
/// Callers should also require is_current_live_session before publishing
/// gameplay advice.
pub fn is_current_session_epoch(epoch: u64) -> bool {
    MATCH_SESSION
        .lock()
        .ok()
        .and_then(|state| {
            state
                .current
                .as_ref()
                .map(|current| current.session_epoch == epoch)
        })
        .unwrap_or(false)
}

/// Check that an utterance or announcer event still belongs to an active
/// session. Draft events are included for match-start narration; terminal
/// sessions never accept delayed speech or banners.
pub fn is_current_active_session_epoch(epoch: u64) -> bool {
    MATCH_SESSION
        .lock()
        .ok()
        .and_then(|state| {
            state.current.as_ref().map(|current| {
                current.session_epoch == epoch
                    && matches!(
                        current.lifecycle,
                        MatchLifecycle::Draft | MatchLifecycle::Live | MatchLifecycle::Disconnected
                    )
            })
        })
        .unwrap_or(false)
}

/// Check the epoch and lifecycle together before publishing session-bound
/// asynchronous work such as G-Master advice.
pub fn is_current_live_session(epoch: u64) -> bool {
    MATCH_SESSION
        .lock()
        .ok()
        .and_then(|state| {
            state.current.as_ref().map(|current| {
                current.session_epoch == epoch && current.lifecycle == MatchLifecycle::Live
            })
        })
        .unwrap_or(false)
}

// Buyback request identity is independent of the match epoch: a match can have
// many death/respawn cycles and multiple requests for the same death.
#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize)]
pub struct BuybackIdentity {
    pub death_episode: i64,
    pub request_id: u64,
}

#[derive(Clone, serde::Serialize)]
pub struct BuybackEvent<T> {
    #[serde(flatten)]
    pub payload: T,
    #[serde(flatten)]
    pub identity: BuybackIdentity,
}

#[derive(Default)]
struct BuybackState {
    session_epoch: Option<u64>,
    alive: bool,
    deaths: i64,
    next_request: u64,
    current_request: Option<BuybackIdentity>,
}

impl BuybackState {
    fn observe(&mut self, epoch: u64, alive: bool, deaths: i64) {
        if self.session_epoch.is_some_and(|current| epoch < current) {
            return;
        }
        if self.session_epoch != Some(epoch) || self.alive != alive || self.deaths != deaths {
            self.current_request = None;
        }
        self.session_epoch = Some(epoch);
        self.alive = alive;
        self.deaths = deaths;
    }

    fn begin(&mut self, epoch: u64, deaths: i64) -> Result<BuybackIdentity, String> {
        if self.session_epoch != Some(epoch) || self.alive || self.deaths != deaths || deaths < 0 {
            return Err("Buyback request belongs to an obsolete death episode.".into());
        }
        self.next_request = self.next_request.wrapping_add(1);
        let identity = BuybackIdentity {
            death_episode: deaths,
            request_id: self.next_request,
        };
        self.current_request = Some(identity);
        Ok(identity)
    }

    fn accepts(&self, epoch: u64, identity: BuybackIdentity) -> bool {
        self.session_epoch == Some(epoch)
            && !self.alive
            && self.deaths == identity.death_episode
            && self.current_request == Some(identity)
    }
}

static BUYBACK_STATE: Mutex<BuybackState> = Mutex::new(BuybackState {
    session_epoch: None,
    alive: true,
    deaths: 0,
    next_request: 0,
    current_request: None,
});

/// Called only for accepted authoritative GSI ticks, before frontend emission.
pub fn observe_buyback_tick(session_epoch: u64, alive: bool, deaths: i64) {
    if let Ok(mut state) = BUYBACK_STATE.lock() {
        state.observe(session_epoch, alive, deaths);
    }
}

fn with_live_buyback_state<T>(
    session_epoch: u64,
    admit: impl FnOnce(&mut BuybackState) -> Result<T, String>,
) -> Result<T, String> {
    let session = MATCH_SESSION
        .lock()
        .map_err(|_| "Match session is unavailable".to_string())?;
    if !session.current.as_ref().is_some_and(|current| {
        current.session_epoch == session_epoch && current.lifecycle == MatchLifecycle::Live
    }) {
        return Err("Buyback request does not belong to the active live match.".into());
    }
    let mut state = BUYBACK_STATE
        .lock()
        .map_err(|_| "Buyback state is unavailable".to_string())?;
    admit(&mut state)
}

pub fn begin_buyback_request(session_epoch: u64, deaths: i64) -> Result<BuybackIdentity, String> {
    with_live_buyback_state(session_epoch, |state| state.begin(session_epoch, deaths))
}

/// Only bounded event publication belongs here; never hold these locks over inference.
pub fn with_buyback_publication<T>(
    session_epoch: u64,
    identity: BuybackIdentity,
    publish: impl FnOnce() -> Result<T, String>,
) -> Result<T, String> {
    with_live_buyback_state(session_epoch, |state| {
        if !state.accepts(session_epoch, identity) {
            return Err("Buyback response belongs to an obsolete death episode or request.".into());
        }
        publish()
    })
}

#[cfg(test)]
mod buyback_tests {
    use super::*;

    #[test]
    fn same_session_respawn_next_death_and_newer_request_invalidate_old_work() {
        let mut state = BuybackState::default();
        state.observe(8, false, 1);
        let first = state.begin(8, 1).unwrap();
        assert!(state.accepts(8, first));
        state.observe(8, true, 1);
        assert!(!state.accepts(8, first));
        assert!(state.begin(8, 1).is_err());
        state.observe(8, false, 2);
        assert!(state.begin(8, 1).is_err());
        let second = state.begin(8, 2).unwrap();
        assert!(!state.accepts(8, first));
        assert!(state.accepts(8, second));
        let newest = state.begin(8, 2).unwrap();
        assert!(!state.accepts(8, second));
        assert!(state.accepts(8, newest));
        state.observe(9, false, 1);
        assert!(!state.accepts(8, newest));
        state.observe(8, false, 2);
        assert!(state.begin(8, 2).is_err());
        let next_match = state.begin(9, 1).unwrap();
        assert!(state.accepts(9, next_match));
    }
}

/// Check that a capture result still belongs to the current live session or to
/// its same-epoch GSI-disconnected interval. CV can remain useful while GSI is
/// stale, but must stop as soon as the session ends, is abandoned, or changes.
pub fn is_current_capture_session(epoch: u64) -> bool {
    MATCH_SESSION
        .lock()
        .ok()
        .and_then(|state| {
            state.current.as_ref().map(|current| {
                current.session_epoch == epoch
                    && matches!(
                        current.lifecycle,
                        MatchLifecycle::Live | MatchLifecycle::Disconnected
                    )
            })
        })
        .unwrap_or(false)
}

pub fn is_current_draft_session(epoch: u64) -> bool {
    MATCH_SESSION
        .lock()
        .ok()
        .and_then(|state| {
            state.current.as_ref().map(|current| {
                current.session_epoch == epoch && current.lifecycle == MatchLifecycle::Draft
            })
        })
        .unwrap_or(false)
}

/// Monotonic counter bumped on every match boundary (see [`set_in_game`]).
///
/// G-Sentry / G-Motion / G-Signal live inside the capture thread's own state,
/// so nothing outside it could ever reset them — their tracks were sticky for
/// the whole *process* lifetime. A hero confirmed in match 1 therefore stayed
/// in `Sentry::missing()` forever: it fed G-Motion a permanent residual-risk
/// floor (enough to cross the High danger bar within a couple of matches),
/// and pinned the capture loop at its 8 Hz "suspicious" cadence for the rest
/// of the session. The capture loop compares this counter every tick and
/// rebuilds the pipeline when it moves.
static MATCH_EPOCH: AtomicU64 = AtomicU64::new(0);

pub fn match_epoch() -> u64 {
    MATCH_EPOCH.load(Ordering::Relaxed)
}

pub fn set_persona_preset(val: u8) {
    PERSONA_PRESET.store(val, Ordering::Relaxed);
}

pub fn persona_preset() -> u8 {
    PERSONA_PRESET.load(Ordering::Relaxed)
}

#[derive(Debug, PartialEq, Eq)]
struct StartupSettings {
    volume: u8,
    hp_alert: crate::safety_events::Settings,
    announcer_enabled: bool,
    signal_enabled: bool,
    signal_sensitivity: u8,
    voice_name: Option<String>,
    voice_rate: Option<i32>,
    persona_preset: u8,
    master_backend: u8,
    cloud_context_opt_in: bool,
    master_auth_apikey: bool,
    master_ollama_model: String,
    telemetry_source: u8,
    calibration_enabled: bool,
    efficacy_study: bool,
}

fn parse_startup_settings(json: &str) -> Result<StartupSettings, String> {
    let value: serde_json::Value =
        serde_json::from_str(json).map_err(|_| "saved settings are not valid JSON".to_string())?;
    let settings = value
        .as_object()
        .ok_or_else(|| "saved settings must be a JSON object".to_string())?;

    let bool_or = |key: &str, fallback: bool| {
        settings
            .get(key)
            .and_then(serde_json::Value::as_bool)
            .unwrap_or(fallback)
    };
    let sensitivity = match settings
        .get("signalSensitivity")
        .and_then(serde_json::Value::as_str)
    {
        Some("low") => 0,
        Some("high") => 2,
        _ => 1,
    };
    let persona = match settings
        .get("personaPreset")
        .and_then(serde_json::Value::as_str)
    {
        Some("silent") => 1,
        Some("caster") => 2,
        Some("meme") => 3,
        _ => 0,
    };
    let backend = match settings
        .get("masterBackend")
        .and_then(serde_json::Value::as_str)
    {
        Some("claude") => 1,
        Some("ollama") => 2,
        _ => 0,
    };
    let telemetry_source = match settings
        .get("telemetrySource")
        .and_then(serde_json::Value::as_str)
    {
        Some("feeder") => 1,
        Some("gtelemetry") => 2,
        Some("off") => 3,
        _ => 0,
    };
    let voice_name = settings
        .get("voiceName")
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .filter(|name| name.len() <= 128 && !name.chars().any(char::is_control) && !name.is_empty())
        .map(str::to_owned);
    let voice_rate = settings
        .get("voiceRate")
        .and_then(serde_json::Value::as_f64)
        .filter(|rate| rate.is_finite())
        .map(|rate| rate.clamp(-10.0, 10.0).round() as i32);
    let master_ollama_model = settings
        .get("masterOllamaModel")
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .filter(|model| {
            !model.is_empty() && model.len() <= 128 && !model.chars().any(char::is_control)
        })
        .unwrap_or("qwen3.5:4b")
        .to_owned();
    let volume = settings
        .get("volume")
        .and_then(serde_json::Value::as_f64)
        .filter(|volume| volume.is_finite())
        .map(|volume| volume.clamp(0.0, 100.0).round() as u8)
        .unwrap_or(80);

    Ok(StartupSettings {
        volume,
        hp_alert: crate::safety_events::Settings {
            enabled: bool_or("alertEnabled", true),
            voice_enabled: bool_or("voiceEnabled", true),
            threshold: settings
                .get("alertThreshold")
                .and_then(serde_json::Value::as_f64)
                .filter(|n| n.is_finite())
                .map(|n| n.clamp(0.0, 100.0).round() as i64)
                .unwrap_or(25),
        },
        announcer_enabled: bool_or("announcerEnabled", true),
        signal_enabled: bool_or("signalEnabled", true),
        signal_sensitivity: sensitivity,
        voice_name,
        voice_rate,
        persona_preset: persona,
        master_backend: backend,
        cloud_context_opt_in: bool_or("cloudContextOptIn", false),
        master_auth_apikey: settings
            .get("masterAuth")
            .and_then(serde_json::Value::as_str)
            == Some("apikey"),
        master_ollama_model,
        telemetry_source,
        calibration_enabled: bool_or("calibration", false),
        efficacy_study: bool_or("efficacyStudy", false),
    })
}

/// Apply the saved runtime preferences before the GSI server starts. Unknown or
/// invalid fields use the same safe defaults as the frontend settings snapshot.
pub fn apply_startup_settings_json(json: &str) -> Result<(), String> {
    let settings = parse_startup_settings(json)?;
    crate::audio::set_volume(settings.volume);
    set_hp_alert_settings(
        settings.hp_alert.enabled,
        settings.hp_alert.voice_enabled,
        settings.hp_alert.threshold,
    );
    set_announcer_enabled(settings.announcer_enabled);
    set_signal_enabled(settings.signal_enabled);
    set_signal_sensitivity(match settings.signal_sensitivity {
        0 => Sensitivity::Low,
        2 => Sensitivity::High,
        _ => Sensitivity::Med,
    });
    set_voice(settings.voice_name, settings.voice_rate);
    set_persona_preset(settings.persona_preset);
    set_master_backend(match settings.master_backend {
        1 => MasterBackend::Claude,
        2 => MasterBackend::Ollama,
        _ => MasterBackend::Auto,
    });
    set_master_cloud_context_opt_in(settings.cloud_context_opt_in);
    set_master_mode(settings.master_auth_apikey);
    set_master_ollama_model(settings.master_ollama_model);
    crate::governor::set_telemetry_source(settings.telemetry_source);
    crate::calibration::set_enabled(settings.calibration_enabled);
    set_efficacy_enabled(settings.efficacy_study);
    Ok(())
}

pub fn mark_local_capture_started() -> bool {
    LOCAL_CAPTURE_STARTED
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_ok()
}

pub fn reset_local_capture_started() {
    LOCAL_CAPTURE_STARTED.store(false, Ordering::SeqCst);
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

// ── Dead-enemy pool (G-Motion threat discount) ───────────────────────────────
//
// A dead enemy is invisible on the minimap, so G-Sentry flags them "missing"
// and G-Motion counts them as a gank threat — exactly backwards: the map is
// SAFER right after a teamfight win, and that is precisely when the old code
// screamed loudest (5 enemies wiped ⇒ 5 "missing" ⇒ ~90% risk).
//
// What is exactly observable, and what is not:
//   • HOW MANY enemies are dead — yes. `map.{radiant,dire}_score` is kills-by
//     that team, so the LOCAL team's score is the enemy death count. Exact.
//   • WHICH enemy died — effectively no. `hero.kill_list` carries a victim
//     slot, but only for the local player's OWN kills, and mapping slot→hero
//     needs the Draft-CV roster, which ships inert (no portrait assets). So
//     this pool is deliberately ANONYMOUS: a count, never an identity.
//   • For HOW LONG — not observable. Respawn scales with the dead hero's
//     level, which GSI never exposes for enemies. The caller supplies an
//     estimate; see `gsi::enemy_respawn_estimate_ms` for the bias argument.
//
// Cleared on every match boundary alongside the epoch bump — a stale death
// from last match would silence a real warning in this one.
/// Expiry stamps and score baseline live under ONE lock on purpose. They are
/// written from the GSI thread and read from the capture thread, and the
/// watchdog can clear them concurrently with a tick — two mutexes would make
/// lock ORDER load-bearing, which is the kind of invariant a later edit breaks
/// silently. One lock, no ordering to get wrong.
struct EnemyDeaths {
    /// Wall-clock ms at which each believed-dead enemy is back up.
    expiry: Vec<u64>,
    /// Last observed local-team score, so a rise can be read as N enemy deaths.
    /// `None` until the first tick of a match: the app can attach mid-game to a
    /// 14-3 scoreboard, and that opening reading is a BASELINE, not 14 deaths.
    baseline: Option<i64>,
}

static ENEMY_DEATHS: Mutex<EnemyDeaths> = Mutex::new(EnemyDeaths {
    expiry: Vec::new(),
    baseline: None,
});

/// Fold this tick's local-team score into the dead-enemy pool. Returns how many
/// fresh deaths were recorded (0 on the baseline tick and on any tick that did
/// not advance the score). `respawn_ms` is how long each new death should keep
/// discounting a threat slot.
pub fn note_enemy_score(score: i64, respawn_ms: u64, now_ms: u64) -> usize {
    let Ok(mut d) = ENEMY_DEATHS.lock() else {
        return 0;
    };
    let previous = match d.baseline {
        // First tick of the match — seed only. See `baseline`'s doc comment.
        None => {
            d.baseline = Some(score);
            return 0;
        }
        Some(p) => p,
    };
    d.baseline = Some(score);
    // A score that went DOWN means a new match we haven't been told about yet
    // (or a malformed tick). Re-baseline rather than underflow.
    if score <= previous {
        return 0;
    }
    let fresh = (score - previous) as usize;
    for _ in 0..fresh {
        d.expiry.push(now_ms.saturating_add(respawn_ms));
    }
    fresh
}

/// How many enemies are believed dead right now. Expired entries are swept on
/// read, so the pool cannot grow across a long match.
pub fn dead_enemy_count_at(now_ms: u64) -> usize {
    let Ok(mut d) = ENEMY_DEATHS.lock() else {
        return 0;
    };
    d.expiry.retain(|expiry| *expiry > now_ms);
    d.expiry.len()
}

/// Wall-clock convenience for the capture loop, whose own `now_ms` is a
/// thread-local monotonic origin and must NOT be mixed with the epoch stamps
/// the GSI path writes here.
pub fn dead_enemy_count() -> usize {
    dead_enemy_count_at(epoch_ms())
}

fn clear_enemy_deaths() {
    if let Ok(mut d) = ENEMY_DEATHS.lock() {
        d.expiry.clear();
        d.baseline = None;
    }
}

/// Wall-clock ms. Used by the dead-enemy pool above. `gsi.rs` and `utterance.rs` each carry their own
/// private copy of this same helper — module-private by design, so no shared
/// `pub(crate)` version to reuse across files.
fn epoch_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
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
// Pack all HP preferences together so a live settings write cannot expose a partial tuple.
static HP_ALERT_SETTINGS: AtomicU64 = AtomicU64::new(25 | (1 << 8) | (1 << 9));
pub fn set_hp_alert_settings(enabled: bool, voice_enabled: bool, threshold: i64) {
    let value =
        threshold.clamp(0, 100) as u64 | ((enabled as u64) << 8) | ((voice_enabled as u64) << 9);
    HP_ALERT_SETTINGS.store(value, Ordering::Release);
}
pub(crate) fn hp_alert_settings() -> crate::safety_events::Settings {
    let value = HP_ALERT_SETTINGS.load(Ordering::Acquire);
    crate::safety_events::Settings {
        enabled: value & (1 << 8) != 0,
        voice_enabled: value & (1 << 9) != 0,
        threshold: (value & 127) as i64,
    }
}
pub fn hp_alert_media_enabled() -> bool {
    let settings = hp_alert_settings();
    settings.enabled && settings.voice_enabled
}

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
    if let Ok(mut g) = VOICE.lock() {
        *g = (name.filter(|s| !s.is_empty()), rate);
    }
}

/// Current (voice name, rate) for the Rust speech path.
pub fn voice() -> (Option<String>, Option<i32>) {
    VOICE.lock().map(|g| g.clone()).unwrap_or((None, None))
}

pub fn try_voice() -> Option<(Option<String>, Option<i32>)> {
    VOICE.try_lock().ok().map(|voice| voice.clone())
}

/// G-Master backend mode picked in the UI.
#[derive(Copy, Clone, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MasterBackend {
    Auto,
    Claude,
    Ollama,
}
pub(crate) fn master_request_context() -> Result<MasterRequestContext, String> {
    let config = MASTER_CONFIG
        .lock()
        .map_err(|_| "G-Master configuration is unavailable".to_string())?;
    Ok(MasterRequestContext {
        backend: config.backend,
        cloud_context_opt_in: config.cloud_context_opt_in,
        generation: config.generation,
        ollama_model: config.ollama_model.clone(),
        api_key: selected_api_key(&config),
    })
}

fn selected_api_key(config: &MasterConfig) -> Option<String> {
    (config.use_api_key && !config.api_key.trim().is_empty()).then(|| config.api_key.clone())
}

/// Linearizes dispatch and publication against configuration changes. Closures
/// may only perform bounded admission work (spawn/cache mutation), never wait
/// for provider I/O. An admitted spawn is in flight; revocation cannot retract
/// bytes already handed to that process, but always rejects its later output.
/// Lock order: MASTER_CONFIG -> ADVICE_CACHE -> LAST_BACKEND.
pub(crate) fn with_master_request_admission<T>(
    request: &MasterRequestContext,
    cloud: bool,
    admit: impl FnOnce() -> Result<T, String>,
) -> Result<T, String> {
    with_master_generation_admission(request.generation, cloud, admit)
}

pub(crate) fn with_master_generation_admission<T>(
    generation: u64,
    cloud: bool,
    admit: impl FnOnce() -> Result<T, String>,
) -> Result<T, String> {
    let config = MASTER_CONFIG
        .lock()
        .map_err(|_| "G-Master configuration is unavailable".to_string())?;
    if config.generation != generation || (cloud && !config.cloud_context_opt_in) {
        return Err("G-Master preference changed; advice request discarded.".into());
    }
    admit()
}

/// Linearize native speech append/spawn with preference and session changes.
/// Lock order is MASTER_CONFIG -> MATCH_SESSION. The closure must only commit
/// bounded admission work; synthesis, decoding and process waits stay outside.
pub(crate) fn with_speech_admission<T>(
    epoch: u64,
    generation: Option<u64>,
    admit: impl FnOnce() -> Result<T, String>,
) -> Result<T, String> {
    let config = MASTER_CONFIG
        .lock()
        .map_err(|_| "G-Master configuration is unavailable".to_string())?;
    if generation.is_some_and(|generation| generation != config.generation) {
        return Err("G-Master preference changed; speech discarded.".into());
    }
    let session = MATCH_SESSION
        .lock()
        .map_err(|_| "Match session is unavailable".to_string())?;
    let allowed = session.current.as_ref().is_some_and(|current| {
        current.session_epoch == epoch
            && if generation.is_some() {
                current.lifecycle == MatchLifecycle::Live
            } else {
                matches!(
                    current.lifecycle,
                    MatchLifecycle::Draft | MatchLifecycle::Live | MatchLifecycle::Disconnected
                )
            }
    });
    if !allowed {
        return Err("Speech does not belong to the current eligible match session.".into());
    }
    admit()
}

fn update_master_config(update: impl FnOnce(&mut MasterConfig) -> bool) {
    if let Ok(mut config) = MASTER_CONFIG.lock() {
        if update(&mut config) {
            config.generation = config.generation.wrapping_add(1);
            crate::master::invalidate_advice_cache();
        }
    }
}

pub fn set_master_backend(backend: MasterBackend) {
    update_master_config(|config| {
        let changed = config.backend != backend;
        config.backend = backend;
        changed
    });
}

pub fn master_backend() -> MasterBackend {
    MASTER_CONFIG
        .lock()
        .map(|c| c.backend)
        .unwrap_or(MasterBackend::Auto)
}

/// Provider selection, API-key entry and Ask never grant this separate consent.
/// Changes invalidate dispatch admission, in-flight output and cached answers.
pub fn set_master_cloud_context_opt_in(enabled: bool) {
    update_master_config(|config| {
        let changed = config.cloud_context_opt_in != enabled;
        config.cloud_context_opt_in = enabled;
        changed
    });
}

pub fn master_cloud_context_opt_in() -> bool {
    MASTER_CONFIG.lock().is_ok_and(|c| c.cloud_context_opt_in)
}

pub fn master_cloud_context_generation() -> u64 {
    MASTER_CONFIG
        .lock()
        .map(|c| c.generation)
        .unwrap_or(u64::MAX)
}

pub fn set_master_ollama_model(name: String) {
    update_master_config(|config| {
        let changed = config.ollama_model != name;
        config.ollama_model = name;
        changed
    });
}

pub fn master_ollama_model() -> String {
    MASTER_CONFIG
        .lock()
        .map(|c| c.ollama_model.clone())
        .unwrap_or_default()
}

/// Auth mode remains separate from the DPAPI-loaded key so mount-time mode
/// synchronization cannot erase the user's stored credential (CR-008 WP-2).
pub fn set_master_mode(use_api_key: bool) {
    update_master_config(|config| {
        let changed = config.use_api_key != use_api_key;
        config.use_api_key = use_api_key;
        changed
    });
}

pub fn set_master_api_key(key: Option<String>) {
    let key = key.filter(|s| !s.trim().is_empty()).unwrap_or_default();
    update_master_config(|config| {
        let changed = config.api_key != key;
        config.api_key = key;
        changed
    });
}

/// Presence only; plaintext never crosses the webview boundary.
pub fn master_api_key_present() -> bool {
    MASTER_CONFIG
        .lock()
        .is_ok_and(|c| !c.api_key.trim().is_empty())
}

pub fn master_api_key() -> Option<String> {
    MASTER_CONFIG.lock().ok().and_then(|c| selected_api_key(&c))
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

pub fn add_known_enemy_for_session(epoch: u64, name: &str) -> bool {
    let Ok(session) = MATCH_SESSION.lock() else {
        return false;
    };
    if !session.current.as_ref().is_some_and(|current| {
        current.session_epoch == epoch
            && matches!(
                current.lifecycle,
                MatchLifecycle::Live | MatchLifecycle::Disconnected
            )
    }) {
        return false;
    }
    let Ok(mut enemies) = KNOWN_ENEMIES.lock() else {
        return false;
    };
    if let Some(entry) = enemies.iter_mut().find(|(enemy, _)| enemy == name) {
        entry.1 = entry.1.saturating_add(1);
    } else {
        enemies.push((name.to_string(), 1));
    }
    true
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
// Portrait-confirmed identities, fixed player slots, and the session that owns
// them. Minimap predictions cannot add identities to this roster.
static ROSTER: Mutex<Option<Roster>> = Mutex::new(None);

#[derive(Clone, Default, Debug, PartialEq, serde::Serialize)]
pub struct Roster {
    pub session_epoch: u64,
    pub hero_ids: Vec<Option<crate::cv::identity::HeroId>>,
    pub radiant: Vec<String>,
    pub dire: Vec<String>,
}

impl Roster {
    fn enemies_for_session(&self, epoch: u64, team: u8) -> Vec<String> {
        if self.session_epoch != epoch || self.hero_ids.len() != 10 {
            return Vec::new();
        }
        let names: Vec<_> = self.radiant.iter().chain(&self.dire).collect();
        if names.len() != 10
            || names
                .iter()
                .zip(&self.hero_ids)
                .any(|(name, id)| crate::cv::identity::HeroId::from_label(name) != *id)
        {
            return Vec::new();
        }
        crate::cv::roster::enemy_labels(&self.radiant, &self.dire, team)
    }
}

/// In-progress pick-screen read. Slots stay in their player order so an
/// unrecognized pick cannot shift the identity assigned to another player.
#[derive(Clone, Debug, PartialEq, serde::Serialize)]
pub struct DraftRosterProgress {
    pub radiant: Vec<Option<String>>,
    pub dire: Vec<Option<String>>,
    pub complete: bool,
    pub recognizer_active: bool,
    pub templates_loading: bool,
}

pub fn roster() -> Option<Roster> {
    ROSTER.lock().ok().and_then(|g| g.clone())
}

pub fn enemy_roster_labels() -> Vec<String> {
    let session = match_session_snapshot();
    roster()
        .map(|roster| {
            roster.enemies_for_session(session.session_epoch, PLAYER_TEAM.load(Ordering::Relaxed))
        })
        .unwrap_or_default()
}

/// Publish temporally confirmed portrait identities, including unknown slots.
/// This cannot write across a session boundary or replace a finished match.
pub fn set_roster_for_capture_session(epoch: u64, radiant: Vec<String>, dire: Vec<String>) -> bool {
    let Ok(session) = MATCH_SESSION.lock() else {
        return false;
    };
    if !session.current.as_ref().is_some_and(|current| {
        current.session_epoch == epoch
            && matches!(
                current.lifecycle,
                MatchLifecycle::Draft | MatchLifecycle::Live
            )
    }) {
        return false;
    }
    if radiant.len() != 5 || dire.len() != 5 {
        return false;
    }
    let Ok(mut roster) = ROSTER.lock() else {
        return false;
    };
    let hero_ids = radiant
        .iter()
        .chain(&dire)
        .map(|name| crate::cv::identity::HeroId::from_label(name))
        .collect();
    *roster = Some(Roster {
        radiant,
        dire,
        session_epoch: epoch,
        hero_ids,
    });
    if let Ok(mut enemies) = KNOWN_ENEMIES.lock() {
        enemies.clear();
    }
    true
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
struct OAuthPending {
    state: String,
    since_ms: u64,
}

static OAUTH_PENDING: Mutex<Option<OAuthPending>> = Mutex::new(None);
const OAUTH_PENDING_TIMEOUT_MS: u64 = 600_000; // 10 min — generous for the browser round-trip
const OAUTH_STATE_MIN_LEN: usize = 16;
const OAUTH_STATE_MAX_LEN: usize = 4096;

/// Arm the gate: a sign-in the app initiated is now in flight (called from the
/// frontend right before it opens the system browser).
pub fn set_oauth_pending(state: String, now_ms: u64) -> bool {
    if !(OAUTH_STATE_MIN_LEN..=OAUTH_STATE_MAX_LEN).contains(&state.len()) {
        return false;
    }
    if let Ok(mut pending) = OAUTH_PENDING.lock() {
        *pending = Some(OAuthPending {
            state,
            since_ms: now_ms,
        });
        true
    } else {
        false
    }
}

/// Pure, testable window check for the gate.
fn oauth_pending_ok(
    pending: bool,
    expected_state: &str,
    callback_state: Option<&str>,
    since_ms: u64,
    now_ms: u64,
    timeout_ms: u64,
) -> bool {
    pending
        && callback_state.is_some_and(|state| state == expected_state)
        && now_ms.saturating_sub(since_ms) <= timeout_ms
}

/// Consume the gate (single-use): `true` only if a sign-in is in flight AND still
/// within the timeout window. Clears the flag either way so a code is honored at
/// most once.
pub fn take_oauth_pending(callback_state: Option<&str>, now_ms: u64) -> bool {
    let pending = OAUTH_PENDING.lock().ok().and_then(|mut p| p.take());
    pending.is_some_and(|p| {
        oauth_pending_ok(
            true,
            &p.state,
            callback_state,
            p.since_ms,
            now_ms,
            OAUTH_PENDING_TIMEOUT_MS,
        )
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn warning_gate_requires_live_alive_fresh_advancing_context() {
        let mut c = WarningContext {
            epoch: 7,
            clock: 30,
            advanced_at: 1000,
            updated_at: 1000,
            playing: true,
            alive: true,
        };
        assert!(warning_context_ready(&c, 7, 1000));
        assert!(!warning_context_ready(&c, 8, 1000));
        c.clock = 29;
        assert!(!warning_context_ready(&c, 7, 1000));
        c.clock = 30;
        c.playing = false;
        assert!(!warning_context_ready(&c, 7, 1000));
        c.playing = true;
        c.alive = false;
        assert!(!warning_context_ready(&c, 7, 1000));
        c.alive = true;
        assert!(!warning_context_ready(&c, 7, 3001));
        c.updated_at = 4000;
        assert!(!warning_context_ready(&c, 7, 4000));
    }

    #[test]
    fn local_capture_start_is_idempotent() {
        reset_local_capture_started();
        assert!(mark_local_capture_started());
        assert!(!mark_local_capture_started());
        reset_local_capture_started();
        assert!(mark_local_capture_started());
        reset_local_capture_started();
    }

    fn observe(
        state: &mut MatchSessionState,
        lifecycle: MatchLifecycle,
        match_id: Option<&str>,
        clock_time: i64,
    ) -> (MatchSessionSnapshot, bool) {
        observe_session_state(state, lifecycle, match_id.map(str::to_string), clock_time)
    }

    #[test]
    fn draft_identity_is_promoted_when_a_valid_match_id_arrives() {
        let mut state = MatchSessionState::default();
        let (draft, _) = observe(&mut state, MatchLifecycle::Draft, None, -1);
        let (live, boundary) = observe(&mut state, MatchLifecycle::Live, Some("123"), 0);
        assert_eq!(draft.session_epoch, live.session_epoch);
        assert_eq!(live.match_id.as_deref(), Some("123"));
        assert_eq!(live.session_id.as_deref(), Some("dota-123"));
        assert!(!boundary);
    }

    #[test]
    fn session_event_flattens_identity_beside_payload() {
        let session = MatchSessionSnapshot {
            match_id: Some("123".into()),
            session_id: Some("dota-123".into()),
            session_epoch: 7,
            session_lifecycle: Some(MatchLifecycle::Live),
        };
        let event =
            MatchSessionEvent::new(serde_json::json!({ "hero": "crystal_maiden" }), &session);
        let value = serde_json::to_value(event).unwrap();
        assert_eq!(value["hero"], "crystal_maiden");
        assert_eq!(value["match_id"], "123");
        assert_eq!(value["session_id"], "dota-123");
        assert_eq!(value["session_epoch"], 7);
        assert_eq!(value["session_lifecycle"], "live");
    }

    #[test]
    fn session_text_event_has_a_flattened_text_and_epoch_contract() {
        let session = MatchSessionSnapshot {
            match_id: Some("123".into()),
            session_id: Some("dota-123".into()),
            session_epoch: 7,
            session_lifecycle: Some(MatchLifecycle::Live),
        };
        let value = serde_json::to_value(SessionTextEvent::new("buyback line", &session)).unwrap();
        assert_eq!(value["text"], "buyback line");
        assert_eq!(value["session_epoch"], 7);
        assert_eq!(value["session_lifecycle"], "live");
    }

    #[test]
    fn a_reconnect_with_the_same_match_id_keeps_its_epoch_even_after_clock_reset() {
        let mut state = MatchSessionState::default();
        let (first, _) = observe(&mut state, MatchLifecycle::Live, Some("123"), 900);
        observe(&mut state, MatchLifecycle::Disconnected, Some("123"), 900);
        let (reconnected, boundary) = observe(&mut state, MatchLifecycle::Live, Some("123"), 0);
        assert_eq!(reconnected.session_epoch, first.session_epoch);
        assert_eq!(reconnected.session_id, first.session_id);
        assert_eq!(reconnected.session_lifecycle, Some(MatchLifecycle::Live));
        assert!(!boundary);
    }

    #[test]
    fn a_different_match_id_starts_a_new_epoch() {
        let mut state = MatchSessionState::default();
        let (first, _) = observe(&mut state, MatchLifecycle::Live, Some("123"), 900);
        let (next, boundary) = observe(&mut state, MatchLifecycle::Live, Some("456"), 10);
        assert_eq!(next.session_epoch, first.session_epoch + 1);
        assert_eq!(next.session_id.as_deref(), Some("dota-456"));
        assert!(boundary);
    }

    #[test]
    fn a_clock_reset_starts_a_new_local_session_when_match_id_is_unavailable() {
        let mut state = MatchSessionState::default();
        let (first, _) = observe(&mut state, MatchLifecycle::Live, None, 900);
        let (next, boundary) = observe(&mut state, MatchLifecycle::Live, None, 0);
        assert_eq!(next.session_epoch, first.session_epoch + 1);
        assert_ne!(next.session_id, first.session_id);
        assert!(boundary);
    }

    #[test]
    fn terminal_end_cannot_be_resurrected_by_a_late_tick_for_the_same_match() {
        let mut state = MatchSessionState::default();
        let (first, _) = observe(&mut state, MatchLifecycle::Live, Some("123"), 900);
        observe(&mut state, MatchLifecycle::End, Some("123"), 1200);
        let (late, boundary) = observe(&mut state, MatchLifecycle::Live, Some("123"), 1200);
        assert_eq!(late.session_epoch, first.session_epoch);
        assert_eq!(late.session_lifecycle, Some(MatchLifecycle::End));
        assert!(!boundary);

        let (late_without_id, boundary) = observe(&mut state, MatchLifecycle::Live, None, 1200);
        assert_eq!(late_without_id.session_epoch, first.session_epoch);
        assert_eq!(late_without_id.session_lifecycle, Some(MatchLifecycle::End));
        assert!(!boundary);
    }

    #[test]
    fn trusted_abandon_can_resume_but_unknown_abandon_starts_a_new_local_session() {
        let mut trusted = MatchSessionState::default();
        let (first, _) = observe(&mut trusted, MatchLifecycle::Live, Some("123"), 900);
        observe(&mut trusted, MatchLifecycle::Abandon, Some("123"), 900);
        let (resumed, _) = observe(&mut trusted, MatchLifecycle::Live, Some("123"), 1000);
        assert_eq!(resumed.session_epoch, first.session_epoch);

        let mut local = MatchSessionState::default();
        let (local_first, _) = observe(&mut local, MatchLifecycle::Live, None, 900);
        observe(&mut local, MatchLifecycle::Abandon, None, 900);
        let (local_next, boundary) = observe(&mut local, MatchLifecycle::Live, None, 1000);
        assert_eq!(local_next.session_epoch, local_first.session_epoch + 1);
        assert!(boundary);
    }

    /// Serialises the tests that drive process-global match state
    /// (`IN_GAME`/`MATCH_EPOCH` and the dead-enemy pool). Rust runs tests in
    /// parallel threads inside ONE process, so without this they race: a
    /// `set_in_game` in one test clears the pool another test just seeded, and
    /// the failure only shows up in a full-suite run, never when the test is
    /// run alone. Poisoning is ignored deliberately — one test panicking
    /// should surface as that test's own failure, not as a cascade of
    /// unrelated "poisoned lock" errors that hide it.
    static MATCH_STATE_LOCK: Mutex<()> = Mutex::new(());

    fn match_state_guard() -> std::sync::MutexGuard<'static, ()> {
        MATCH_STATE_LOCK.lock().unwrap_or_else(|e| e.into_inner())
    }

    #[test]
    fn oauth_gate_rejects_unsolicited_and_expired_callbacks() {
        assert!(
            !oauth_pending_ok(false, "expected", Some("expected"), 0, 1_000, 600_000),
            "no sign-in in flight → reject"
        );
        assert!(
            oauth_pending_ok(true, "expected", Some("expected"), 1_000, 1_000, 600_000),
            "same instant + matching state → accept"
        );
        assert!(
            !oauth_pending_ok(true, "expected", Some("attacker"), 1_000, 1_000, 600_000),
            "wrong state → reject"
        );
        assert!(
            !oauth_pending_ok(true, "expected", None, 1_000, 1_000, 600_000),
            "missing state → reject"
        );
        assert!(
            oauth_pending_ok(
                true,
                "expected",
                Some("expected"),
                1_000,
                1_000 + 599_000,
                600_000
            ),
            "within window → accept"
        );
        assert!(
            !oauth_pending_ok(
                true,
                "expected",
                Some("expected"),
                1_000,
                1_000 + 600_001,
                600_000
            ),
            "past window → reject"
        );
    }

    #[test]
    fn take_oauth_pending_is_single_use() {
        assert!(set_oauth_pending(
            "test-state-0123456789".to_string(),
            10_000
        ));
        assert!(
            take_oauth_pending(Some("test-state-0123456789"), 10_500),
            "first consume within window"
        );
        assert!(
            !take_oauth_pending(Some("test-state-0123456789"), 10_600),
            "already consumed → reject the replay"
        );
    }

    #[test]
    fn oauth_gate_rejects_unusable_state_before_arming() {
        assert!(!set_oauth_pending("short".to_string(), 10_000));
        assert!(!take_oauth_pending(Some("short"), 10_500));
        assert!(!set_oauth_pending(
            "x".repeat(OAUTH_STATE_MAX_LEN + 1),
            10_000
        ));
    }

    #[test]
    fn match_epoch_advances_on_every_in_game_transition() {
        let _guard = match_state_guard();
        // Both edges are match boundaries: the horn ends the previous match's
        // observation window, and the post-game screen ends this one. The
        // capture loop rebuilds G-Sentry/G-Motion/G-Signal on either, so both
        // must move the counter. (Statics are process-global and other tests
        // touch in_game, so this asserts on deltas, never absolute values.)
        set_in_game(false);
        let base = match_epoch();

        set_in_game(true);
        assert_eq!(match_epoch(), base + 1, "horn must bump the epoch");

        // Repeat ticks of the SAME state are the common case (GSI posts ~10Hz)
        // and must be free — otherwise the pipeline would reset every tick and
        // G-Sentry could never accumulate its confirmation hits.
        for _ in 0..50 {
            set_in_game(true);
        }
        assert_eq!(
            match_epoch(),
            base + 1,
            "steady-state ticks must not bump the epoch"
        );

        set_in_game(false);
        assert_eq!(match_epoch(), base + 2, "match end must bump the epoch");
    }

    #[test]
    fn enemy_score_baseline_does_not_count_as_deaths() {
        let _guard = match_state_guard();
        clear_enemy_deaths();
        // Attaching mid-match to a 14-3 scoreboard must record a BASELINE, not
        // fourteen corpses — otherwise every mid-game launch would silence
        // G-Signal until the fake pool expired.
        assert_eq!(
            note_enemy_score(14, 30_000, 1_000),
            0,
            "first tick seeds only"
        );
        assert_eq!(dead_enemy_count_at(1_000), 0);
        // Only the advance past the baseline counts.
        assert_eq!(note_enemy_score(16, 30_000, 2_000), 2);
        assert_eq!(dead_enemy_count_at(2_000), 2);
        clear_enemy_deaths();
    }

    #[test]
    fn enemy_deaths_expire_on_their_own_respawn_estimate() {
        let _guard = match_state_guard();
        clear_enemy_deaths();
        note_enemy_score(0, 30_000, 0);
        assert_eq!(note_enemy_score(2, 30_000, 10_000), 2);
        assert_eq!(
            dead_enemy_count_at(39_999),
            2,
            "still dead just before respawn"
        );
        assert_eq!(dead_enemy_count_at(40_001), 0, "swept once respawned");
        clear_enemy_deaths();
    }

    #[test]
    fn unchanged_or_falling_score_records_nothing() {
        let _guard = match_state_guard();
        clear_enemy_deaths();
        note_enemy_score(5, 30_000, 0);
        // GSI posts ~10Hz; the vast majority of ticks repeat the same score.
        for _ in 0..50 {
            assert_eq!(note_enemy_score(5, 30_000, 1_000), 0);
        }
        // A score that goes backwards is a stale/rolled-over tick, not deaths.
        assert_eq!(note_enemy_score(1, 30_000, 2_000), 0);
        assert_eq!(dead_enemy_count_at(2_000), 0);
        clear_enemy_deaths();
    }

    #[test]
    fn gsi_freshness_uses_the_accepted_two_second_source_age() {
        assert!(!gsi_is_fresh_at(0, 10_000), "no valid post is unknown");
        assert!(
            gsi_is_fresh_at(10_000, 12_000),
            "the 2s boundary is inclusive"
        );
        assert!(
            !gsi_is_fresh_at(10_000, 12_001),
            "older source data is stale"
        );
        assert!(
            gsi_is_fresh_at(11_000, 10_000),
            "clock rollback must not age a source"
        );
    }

    #[test]
    fn stale_gsi_cannot_reuse_score_based_dead_enemy_discount() {
        assert_eq!(fresh_dead_enemy_count(true, 3), 3);
        assert_eq!(fresh_dead_enemy_count(false, 3), 0);
    }

    #[test]
    fn match_boundary_clears_the_dead_pool() {
        let _guard = match_state_guard();
        clear_enemy_deaths();
        set_in_game(false);
        note_enemy_score(0, 600_000, 0);
        assert_eq!(note_enemy_score(5, 600_000, 1_000), 5);
        assert_eq!(dead_enemy_count_at(1_000), 5);
        // A very long respawn estimate would otherwise leak into the next match
        // and silence its opening warnings.
        set_in_game(true);
        assert_eq!(
            dead_enemy_count_at(1_000),
            0,
            "last match's corpses must not discount this match's threats"
        );
        set_in_game(false);
        clear_enemy_deaths();
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
        assert_eq!(
            e,
            vec!["antimage".to_string()],
            "only repeatedly-seen heroes qualify: {e:?}"
        );
        for _ in 0..MIN_ENEMY_SIGHTINGS {
            add_known_enemy("lina");
        }
        assert_eq!(
            known_enemies().len(),
            2,
            "lina crosses the bar after repeats"
        );
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
        assert!(
            !silent_arm(),
            "turning the study off must instantly clear silent-arm"
        );
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
        assert_eq!(
            raw_hits, n,
            "raw FILETIME nanos should be 100% silenced (the B1 bug)"
        );
        // The fix: mixed entropy lands in a loose band around 25%.
        let low = n * 15 / 100;
        let high = n * 35 / 100;
        assert!(
            silent > low && silent < high,
            "silent-arm share {silent}/{n} outside 15%-35% band — randomization degenerate"
        );
    }

    #[test]
    fn startup_settings_parse_saved_runtime_preferences() {
        let settings = parse_startup_settings(
            r#"{"volume":41,"announcerEnabled":false,"signalEnabled":false,"signalSensitivity":"high","voiceName":"  Microsoft Aria  ","voiceRate":-3,"personaPreset":"meme","masterBackend":"ollama","cloudContextOptIn":true,"masterAuth":"apikey","masterOllamaModel":"llama3.2:3b","telemetrySource":"off","calibration":true,"efficacyStudy":true}"#,
        )
        .unwrap();

        assert_eq!(settings.volume, 41);
        assert!(!settings.announcer_enabled);
        assert!(!settings.signal_enabled);
        assert_eq!(settings.signal_sensitivity, 2);
        assert_eq!(settings.voice_name.as_deref(), Some("Microsoft Aria"));
        assert_eq!(settings.voice_rate, Some(-3));
        assert_eq!(settings.persona_preset, 3);
        assert_eq!(settings.master_backend, 2);
        assert!(settings.cloud_context_opt_in);
        assert!(settings.master_auth_apikey);
        assert_eq!(settings.master_ollama_model, "llama3.2:3b");
        assert_eq!(settings.telemetry_source, 3);
        assert!(settings.calibration_enabled);
        assert!(settings.efficacy_study);
    }

    #[test]
    fn startup_settings_normalize_invalid_values_to_safe_defaults() {
        let settings = parse_startup_settings(
            r#"{"volume":101,"announcerEnabled":"yes","signalEnabled":null,"signalSensitivity":"unknown","voiceName":"\u0000","voiceRate":11,"personaPreset":"unknown","masterBackend":"unknown","masterAuth":"unknown","masterOllamaModel":"\u0000","efficacyStudy":"true"}"#,
        )
        .unwrap();

        assert_eq!(settings.volume, 100);
        assert!(settings.announcer_enabled);
        assert!(settings.signal_enabled);
        assert_eq!(settings.signal_sensitivity, 1);
        assert_eq!(settings.voice_name, None);
        assert_eq!(settings.voice_rate, Some(10));
        assert_eq!(settings.persona_preset, 0);
        assert_eq!(settings.master_backend, 0);
        assert!(!settings.cloud_context_opt_in);
        assert!(!settings.master_auth_apikey);
        assert_eq!(settings.master_ollama_model, "qwen3.5:4b");
        assert_eq!(settings.telemetry_source, 0);
        assert!(!settings.calibration_enabled);
        assert!(!settings.efficacy_study);
    }

    #[test]
    fn startup_settings_round_fractional_numeric_controls_like_the_frontend() {
        let settings = parse_startup_settings(r#"{"volume":44.6,"voiceRate":-3.6}"#).unwrap();

        assert_eq!(settings.volume, 45);
        assert_eq!(settings.voice_rate, Some(-4));
    }

    #[test]
    fn roster_ids_cannot_cross_sessions_or_disagree_with_labels() {
        let radiant = vec![String::new(); 5];
        let dire = ["axe", "lina", "", "", ""].map(str::to_string).to_vec();
        let hero_ids = radiant
            .iter()
            .chain(&dire)
            .map(|label| crate::cv::identity::HeroId::from_label(label))
            .collect();
        let mut roster = Roster {
            radiant,
            dire,
            hero_ids,
            session_epoch: 7,
        };
        assert_eq!(roster.enemies_for_session(7, 1), vec!["axe", "lina"]);
        assert!(roster.enemies_for_session(8, 1).is_empty());
        assert!(roster.enemies_for_session(7, 2).is_empty());
        assert!(roster.enemies_for_session(7, 0).is_empty());
        roster.hero_ids[5] = crate::cv::identity::HeroId::from_label("lina");
        assert!(roster.enemies_for_session(7, 1).is_empty());
    }

    #[test]
    fn startup_settings_require_a_json_object() {
        assert!(parse_startup_settings("not-json").is_err());
        assert!(parse_startup_settings("[]").is_err());
    }
}

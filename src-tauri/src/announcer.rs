//! Announcer event detection (G-AnnStudio pack contract).
//!
//! Fed every `game-tick`, this watches deltas and emits the announcer event
//! ids that a pack can voice — see the vendored `schemas/gmaiden-events.json`
//! (byte-identical copy of G-Suite/schemas/gmaiden-events.json):
//! kill / first_blood / double_kill … rampage, killing_spree / unstoppable /
//! godlike, death / respawn / levelUp / manaLow / hpLow, match_start.
//!
//! Pure integer/timing logic — cheap enough to run on the GSI POST path. The
//! caller plays a random clip per returned id (no clip → silent).
//!
//! `mod tests` enforces the streak-ladder + multi-kill ids against that
//! vendored schema, so a mirror renamed/reordered in only one place fails
//! `cargo test` instead of drifting silently.

use crate::gsi::GameTick;
use crate::runtime::{MatchLifecycle, MatchSessionSnapshot};
use std::sync::{Mutex, OnceLock};

const MULTIKILL_WINDOW_S: i64 = 18; // kills within this span chain into double/triple/…
const MANA_LOW: i64 = 15;
const HP_LOW: i64 = 20;
const LEVEL_UP_MILESTONES: [i64; 4] = [6, 12, 18, 25];

fn crossed_level_up_milestone(prev_level: i64, next_level: i64) -> bool {
    next_level > prev_level
        && LEVEL_UP_MILESTONES
            .iter()
            .any(|&milestone| prev_level < milestone && milestone <= next_level)
}

#[derive(Default)]
struct State {
    seen: bool, // have we processed at least one in-game tick
    in_game: bool,
    level: i64,
    alive: bool,
    kills: i64,
    deaths: i64,
    clock: i64,
    opening_closed: bool,
    mana: i64,
    hp: i64,
    score_total: i64,
    first_blood_done: bool,
    // streak (consecutive kills without dying) and its already-announced tier
    streak: i64,
    streak_tier: i64,
    // multikill chaining
    window_start_clock: i64,
    window_kills: i64,
}

#[derive(Default)]
struct SessionDetector {
    epoch: Option<u64>,
    detector: State,
}

fn session_state() -> &'static Mutex<SessionDetector> {
    static S: OnceLock<Mutex<SessionDetector>> = OnceLock::new();
    S.get_or_init(|| Mutex::new(SessionDetector::default()))
}

/// Higher = louder moment. Audio is single-slot, so when a tick yields several
/// events we voice only the most significant one (avoids clips cutting clips).
fn priority(ev: &str) -> u8 {
    match ev {
        "beyond_godlike" => 99,
        "rampage" => 98,
        "godlike" => 95,
        "monster_kill" => 92,
        "ultra_kill" => 90,
        "wicked_sick" => 88,
        "unstoppable" => 85,
        "mega_kill" => 82,
        "triple_kill" => 80,
        "dominating" => 75,
        "killing_spree" => 70,
        "double_kill" => 65,
        "first_blood" => 60,
        "kill" => 50,
        "death" => 45,
        "hpLow" => 40,
        "respawn" => 30,
        "manaLow" => 25,
        "levelUp" => 20,
        "match_start" => 15,
        _ => 0,
    }
}

/// The single event to voice this tick, if any.
pub fn most_important(events: &[String]) -> Option<String> {
    events.iter().max_by_key(|e| priority(e)).cloned()
}

/// Reset between matches so streaks/first-blood don't leak across games.
fn reset(s: &mut State) {
    *s = State::default();
}

/// Observe a tick only if it still belongs to the current match session.
/// Detector streaks and dedup baselines are reset once when a newer session
/// epoch arrives; an out-of-order older tick can never reset newer state.
pub fn observe_for_session(tick: &GameTick, session: &MatchSessionSnapshot) -> Vec<String> {
    let Some(lifecycle) = session.session_lifecycle else {
        return Vec::new();
    };
    let epoch = session.session_epoch;
    if epoch == 0
        || !matches!(lifecycle, MatchLifecycle::Draft | MatchLifecycle::Live)
        || !crate::runtime::is_current_active_session_epoch(epoch)
    {
        return Vec::new();
    }

    let Ok(mut current) = session_state().lock() else {
        return Vec::new();
    };
    if !crate::runtime::is_current_active_session_epoch(epoch) {
        return Vec::new();
    }
    let events = observe_session_state(&mut current, tick, epoch, lifecycle);
    if crate::runtime::is_current_active_session_epoch(epoch) {
        events
    } else {
        Vec::new()
    }
}

fn observe_session_state(
    current: &mut SessionDetector,
    tick: &GameTick,
    epoch: u64,
    lifecycle: MatchLifecycle,
) -> Vec<String> {
    if !matches!(lifecycle, MatchLifecycle::Draft | MatchLifecycle::Live)
        || current.epoch.is_some_and(|known| epoch < known)
    {
        return Vec::new();
    }
    if current.epoch != Some(epoch) {
        reset(&mut current.detector);
        current.epoch = Some(epoch);
    }
    step(&mut current.detector, tick)
}

/// Pure detector — all the logic, no globals (so tests own their state).
fn step(s: &mut State, tick: &GameTick) -> Vec<String> {
    let mut out = Vec::new();

    // match boundary
    if tick.in_game && (!s.in_game || !s.seen) {
        s.in_game = true;
        // only announce match start near the opening horn, not on reconnect
        if !s.opening_closed && (0..=5).contains(&tick.clock_time) {
            out.push("match_start".to_string());
            s.opening_closed = true;
        }
        s.opening_closed |= tick.clock_time > 5;
        s.streak = 0;
        s.streak_tier = 0;
        s.window_kills = 0;
        // seed baselines so the first real tick doesn't false-fire
        s.level = tick.level;
        s.alive = tick.alive;
        s.kills = tick.kills;
        s.deaths = tick.deaths;
        s.clock = tick.clock_time;
        s.mana = tick.mana_percent;
        s.hp = tick.hp_percent;
        s.score_total = tick.radiant_score + tick.dire_score;
        s.seen = true;
        return out;
    }
    if !tick.in_game {
        s.in_game = false;
        return out;
    }
    if !s.opening_closed && tick.clock_time >= 0 {
        if s.clock < 0 && tick.clock_time <= 5 {
            out.push("match_start".to_string());
        }
        s.opening_closed = true;
    }

    // level up
    if crossed_level_up_milestone(s.level, tick.level) {
        out.push("levelUp".to_string());
    }

    // death / respawn
    let death_observed = tick.deaths > s.deaths || (s.alive && !tick.alive);
    let counters_reset = tick.kills < s.kills || tick.deaths < s.deaths;
    if death_observed || counters_reset {
        s.streak = 0;
        s.streak_tier = 0;
        s.window_kills = 0;
    }
    if s.alive && !tick.alive {
        out.push("death".to_string());
    } else if !s.alive && tick.alive {
        out.push("respawn".to_string());
    }

    // mana / hp crossings (edge-triggered, only while alive for hp)
    if tick.mana_percent < MANA_LOW && s.mana >= MANA_LOW {
        out.push("manaLow".to_string());
    }
    if tick.alive && tick.hp_percent < HP_LOW && (s.hp >= HP_LOW || !s.alive) {
        out.push("hpLow".to_string());
    }

    // kills
    let new_kills = (tick.kills - s.kills).max(0);
    if new_kills > 0 {
        let score_total = tick.radiant_score + tick.dire_score;
        if !s.first_blood_done && s.score_total == 0 && score_total == 1 && new_kills == 1 {
            out.push("first_blood".to_string());
            s.first_blood_done = true;
        }

        // A batch containing kills and deaths does not establish their order.
        if death_observed || counters_reset || !tick.alive {
            out.push("kill".to_string());
        } else {
            // multikill window (chain kills that land close together)
            if tick.clock_time < s.window_start_clock
                || tick.clock_time - s.window_start_clock > MULTIKILL_WINDOW_S
                || s.window_kills == 0
            {
                s.window_start_clock = tick.clock_time;
                s.window_kills = 0;
            }
            s.window_kills += new_kills;

            // streak (consecutive kills without dying)
            s.streak += new_kills;

            let multikill = match s.window_kills {
                2 => Some("double_kill"),
                3 => Some("triple_kill"),
                4 => Some("ultra_kill"),
                n if n >= 5 => Some("rampage"),
                _ => None,
            };
            match multikill {
                Some(ev) => out.push(ev.to_string()),
                None => out.push("kill".to_string()),
            }

            // streak ladder — mirrors the overlay kill banner exactly
            // (App.tsx STREAK_LABELS): one rung per consecutive kill, 3→10+.
            // `streak_tier` holds the highest rung already announced (capped at 10
            // so Beyond Godlike fires once, then every further kill is silent here).
            let rung = s.streak.min(10);
            if rung >= 3 && rung > s.streak_tier {
                s.streak_tier = rung;
                let ev = match rung {
                    3 => "killing_spree",
                    4 => "dominating",
                    5 => "mega_kill",
                    6 => "unstoppable",
                    7 => "wicked_sick",
                    8 => "monster_kill",
                    9 => "godlike",
                    _ => "beyond_godlike",
                };
                out.push(ev.to_string());
            }
        }
    }

    // advance baselines
    s.level = tick.level;
    s.alive = tick.alive;
    s.kills = tick.kills;
    s.deaths = tick.deaths;
    s.clock = tick.clock_time;
    s.mana = tick.mana_percent;
    s.hp = tick.hp_percent;
    s.score_total = tick.radiant_score + tick.dire_score;
    s.first_blood_done |= s.score_total > 0;

    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tick(in_game: bool, clock: i64, kills: i64, alive: bool) -> GameTick {
        GameTick {
            in_game,
            clock_time: clock,
            alive,
            kills,
            radiant_score: kills,
            hp_percent: 100,
            mana_percent: 100,
            ..Default::default()
        }
    }

    #[test]
    fn session_detector_keeps_same_epoch_baselines() {
        let mut current = SessionDetector::default();
        observe_session_state(
            &mut current,
            &tick(true, 0, 0, true),
            4,
            MatchLifecycle::Live,
        );
        observe_session_state(
            &mut current,
            &tick(true, 10, 1, true),
            4,
            MatchLifecycle::Live,
        );

        let events = observe_session_state(
            &mut current,
            &tick(true, 15, 2, true),
            4,
            MatchLifecycle::Live,
        );
        assert!(events.contains(&"double_kill".to_string()));
    }

    #[test]
    fn next_session_epoch_resets_announcer_state_once() {
        let mut current = SessionDetector::default();
        observe_session_state(
            &mut current,
            &tick(true, 0, 0, true),
            4,
            MatchLifecycle::Live,
        );
        for kills in 1..=3 {
            observe_session_state(
                &mut current,
                &tick(true, kills * 30, kills, true),
                4,
                MatchLifecycle::Live,
            );
        }

        let events = observe_session_state(
            &mut current,
            &tick(true, 0, 0, true),
            5,
            MatchLifecycle::Live,
        );
        assert_eq!(current.epoch, Some(5));
        assert!(events.contains(&"match_start".to_string()));
        assert!(!events.contains(&"killing_spree".to_string()));
        let next = observe_session_state(
            &mut current,
            &tick(true, 10, 1, true),
            5,
            MatchLifecycle::Live,
        );
        assert!(next.contains(&"first_blood".to_string()));
        assert!(!next.contains(&"killing_spree".to_string()));
    }

    #[test]
    fn stale_epoch_cannot_mutate_or_reset_current_announcer_state() {
        let mut current = SessionDetector::default();
        observe_session_state(
            &mut current,
            &tick(true, 0, 0, true),
            5,
            MatchLifecycle::Live,
        );
        observe_session_state(
            &mut current,
            &tick(true, 10, 1, true),
            5,
            MatchLifecycle::Live,
        );

        let stale = observe_session_state(
            &mut current,
            &tick(true, 0, 10, true),
            4,
            MatchLifecycle::Live,
        );
        assert!(stale.is_empty());
        assert_eq!(current.epoch, Some(5));

        let resumed = observe_session_state(
            &mut current,
            &tick(true, 15, 2, true),
            5,
            MatchLifecycle::Live,
        );
        assert!(resumed.contains(&"double_kill".to_string()));
    }

    #[test]
    fn disconnected_or_terminal_session_does_not_advance_detector_epoch() {
        let mut current = SessionDetector::default();
        observe_session_state(
            &mut current,
            &tick(true, 0, 0, true),
            5,
            MatchLifecycle::Live,
        );
        for lifecycle in [
            MatchLifecycle::Disconnected,
            MatchLifecycle::End,
            MatchLifecycle::Abandon,
        ] {
            let events =
                observe_session_state(&mut current, &tick(false, 0, 0, false), 6, lifecycle);
            assert!(events.is_empty());
            assert_eq!(current.epoch, Some(5));
        }
    }

    // Tests use a local State via step() — no shared globals, safe in parallel.

    #[test]
    fn match_start_then_baseline() {
        let mut s = State::default();
        let e = step(&mut s, &tick(true, 0, 0, true));
        assert!(e.contains(&"match_start".to_string()));
    }

    #[test]
    fn pregame_waits_for_horn_and_same_session_reconnect_does_not_replay_start() {
        let mut s = State::default();
        assert!(step(&mut s, &tick(true, -90, 0, true)).is_empty());
        assert!(step(&mut s, &tick(true, -1, 0, true)).is_empty());
        assert_eq!(step(&mut s, &tick(true, 0, 0, true)), vec!["match_start"]);
        assert!(step(&mut s, &tick(true, 1, 0, true)).is_empty());
        step(&mut s, &tick(false, 1, 0, true));
        assert!(step(&mut s, &tick(true, 2, 0, true)).is_empty());
    }

    #[test]
    fn midmatch_attach_does_not_claim_start_or_prior_events() {
        let mut s = State::default();
        assert!(step(&mut s, &tick(true, 300, 4, true)).is_empty());
        step(&mut s, &tick(false, 300, 4, true));
        assert!(step(&mut s, &tick(true, 301, 4, true)).is_empty());
    }

    #[test]
    fn hidden_death_and_respawn_reset_streak_and_multikill() {
        let mut s = State::default();
        step(&mut s, &tick(true, 0, 0, true));
        step(&mut s, &tick(true, 10, 1, true));
        step(&mut s, &tick(true, 15, 2, true));
        let mut after_gap = tick(true, 16, 2, true);
        after_gap.deaths = 1;
        assert!(step(&mut s, &after_gap).is_empty());
        after_gap.kills = 3;
        after_gap.radiant_score = 3;
        after_gap.clock_time = 17;
        assert_eq!(step(&mut s, &after_gap), vec!["kill"]);
    }

    #[test]
    fn unordered_kills_and_deaths_do_not_establish_streak_or_multikill() {
        let mut s = State::default();
        step(&mut s, &tick(true, 0, 0, true));
        step(&mut s, &tick(true, 10, 2, true));
        let mut ambiguous = tick(true, 15, 3, true);
        ambiguous.deaths = 1;
        assert_eq!(step(&mut s, &ambiguous), vec!["kill"]);
        ambiguous.kills = 4;
        ambiguous.radiant_score = 4;
        ambiguous.clock_time = 16;
        assert_eq!(step(&mut s, &ambiguous), vec!["kill"]);
    }

    #[test]
    fn first_blood_requires_exactly_one_local_kill_and_one_total_score() {
        for (kills, radiant, dire) in [(1, 1, 1), (2, 2, 0), (1, 0, 0)] {
            let mut s = State::default();
            step(&mut s, &tick(true, 0, 0, true));
            let mut batch = tick(true, 20, kills, true);
            batch.radiant_score = radiant;
            batch.dire_score = dire;
            assert!(!step(&mut s, &batch).iter().any(|e| e == "first_blood"));
        }
        let mut s = State::default();
        step(&mut s, &tick(true, 0, 0, true));
        let events = step(&mut s, &tick(true, 20, 1, true));
        assert!(events.iter().any(|e| e == "first_blood"));
    }

    #[test]
    fn first_blood_and_multikill_chain() {
        let mut s = State::default();
        step(&mut s, &tick(true, 0, 0, true)); // start
                                               // first kill at score 0-0 → first_blood + kill
        let e1 = step(&mut s, &tick(true, 100, 1, true));
        assert!(e1.contains(&"first_blood".to_string()));
        // second kill within window → double_kill
        let e2 = step(&mut s, &tick(true, 110, 2, true));
        assert!(e2.contains(&"double_kill".to_string()));
        // third → triple_kill + killing_spree (streak 3)
        let e3 = step(&mut s, &tick(true, 118, 3, true));
        assert!(e3.contains(&"triple_kill".to_string()));
        assert!(e3.contains(&"killing_spree".to_string()));
    }

    #[test]
    fn death_resets_streak() {
        let mut s = State::default();
        step(&mut s, &tick(true, 0, 0, true));
        step(&mut s, &tick(true, 50, 1, true));
        let d = step(&mut s, &tick(true, 60, 1, false));
        assert!(d.contains(&"death".to_string()));
    }

    #[test]
    fn streak_ladder_matches_kill_banner() {
        // one kill per rung — must fire the same labels as App.tsx STREAK_LABELS
        let mut s = State::default();
        step(&mut s, &tick(true, 0, 0, true)); // start, baseline kills=0
        let expect = [
            (3, "killing_spree"),
            (4, "dominating"),
            (5, "mega_kill"),
            (6, "unstoppable"),
            (7, "wicked_sick"),
            (8, "monster_kill"),
            (9, "godlike"),
            (10, "beyond_godlike"),
        ];
        // space kills > 18s apart so multikill never masks the streak rung
        for (k, label) in expect {
            let e = step(&mut s, &tick(true, (k as i64) * 30, k as i64, true));
            assert!(
                e.contains(&label.to_string()),
                "kill {k} should fire {label}, got {e:?}"
            );
        }
    }

    #[test]
    fn level_up_only_fires_on_milestones() {
        let mut s = State::default();
        let mut t = tick(true, 0, 0, true);
        t.level = 5;
        step(&mut s, &t);

        t.level = 6;
        let e = step(&mut s, &t);
        assert!(e.contains(&"levelUp".to_string()));

        t.level = 7;
        let e = step(&mut s, &t);
        assert!(!e.contains(&"levelUp".to_string()));
    }

    #[test]
    fn level_up_fires_when_a_milestone_is_skipped_over() {
        let mut s = State::default();
        let mut t = tick(true, 0, 0, true);
        t.level = 11;
        step(&mut s, &t);

        t.level = 13;
        let e = step(&mut s, &t);
        assert!(
            e.contains(&"levelUp".to_string()),
            "11 -> 13 should fire because level 12 milestone was crossed"
        );
    }

    #[test]
    fn level_up_skips_when_no_milestone_is_crossed() {
        let mut s = State::default();
        let mut t = tick(true, 0, 0, true);
        t.level = 13;
        step(&mut s, &t);

        t.level = 17;
        let e = step(&mut s, &t);
        assert!(
            !e.contains(&"levelUp".to_string()),
            "13 -> 17 should stay silent because no milestone was crossed"
        );
    }

    // --- schema sync (schemas/gmaiden-events.json) --------------------------

    #[derive(serde::Deserialize)]
    struct SchemaEvent {
        id: String,
        category: String,
    }

    #[derive(serde::Deserialize)]
    struct EventSchema {
        #[serde(rename = "x-events")]
        x_events: Vec<SchemaEvent>,
    }

    /// Loads the vendored copy of the canonical event contract
    /// (`schemas/gmaiden-events.json`, byte-identical to the sibling
    /// `G-Suite/schemas/gmaiden-events.json`).
    fn load_vendored_schema() -> EventSchema {
        let path = format!(
            "{}/../schemas/gmaiden-events.json",
            env!("CARGO_MANIFEST_DIR")
        );
        let raw =
            std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("failed to read {path}: {e}"));
        serde_json::from_str(&raw).unwrap_or_else(|e| panic!("failed to parse {path}: {e}"))
    }

    /// The streak ladder (3..=10 consecutive kills without dying) must fire the
    /// same ids, in the same order, as the schema's `category == "streak"`
    /// entries — the production mirror of `App.tsx` STREAK_LABELS, checked
    /// against the schema instead of a hardcoded copy.
    #[test]
    fn streak_ladder_matches_schema_contract() {
        let schema = load_vendored_schema();
        let expected_streak_ids: Vec<&str> = schema
            .x_events
            .iter()
            .filter(|e| e.category == "streak")
            .map(|e| e.id.as_str())
            .collect();
        assert_eq!(
            expected_streak_ids.len(),
            8,
            "expected 8 streak rungs (3..=10) in the schema, got {expected_streak_ids:?}"
        );

        let mut s = State::default();
        step(&mut s, &tick(true, 0, 0, true)); // start, baseline kills=0
                                               // space kills > 18s apart so multikill chaining never masks the streak rung
        for (i, expected_id) in expected_streak_ids.iter().enumerate() {
            let k = i as i64 + 3;
            let e = step(&mut s, &tick(true, k * 30, k, true));
            assert!(
                e.contains(&expected_id.to_string()),
                "kill {k} should fire schema streak id {expected_id}, got {e:?}"
            );
        }
    }

    /// The multi-kill chain ids the announcer fires (`priority()` /
    /// `step()`'s `window_kills` match) must all exist in the schema.
    #[test]
    fn multikill_ids_are_present_in_schema_contract() {
        let schema = load_vendored_schema();
        let schema_ids: Vec<&str> = schema.x_events.iter().map(|e| e.id.as_str()).collect();
        for id in ["double_kill", "triple_kill", "ultra_kill", "rampage"] {
            assert!(
                schema_ids.contains(&id),
                "multi-kill id {id} fired by announcer.rs is missing from schemas/gmaiden-events.json"
            );
        }
    }
}

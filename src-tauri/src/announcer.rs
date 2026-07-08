//! Announcer event detection (G-AnnStudio pack contract).
//!
//! Fed every `game-tick`, this watches deltas and emits the announcer event
//! ids that a pack can voice (see G-Suite/schemas/gmaiden-events.json):
//! kill / first_blood / double_kill … rampage, killing_spree / unstoppable /
//! godlike, death / respawn / levelUp / manaLow / hpLow, match_start.
//!
//! Pure integer/timing logic — cheap enough to run on the GSI POST path. The
//! caller plays a random clip per returned id (no clip → silent).

use crate::gsi::GameTick;
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

fn state() -> &'static Mutex<State> {
    static S: OnceLock<Mutex<State>> = OnceLock::new();
    S.get_or_init(|| Mutex::new(State::default()))
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
    let keep_seen = s.seen;
    *s = State::default();
    s.seen = keep_seen;
}

/// Observe one tick against the global state; return event ids to voice.
pub fn observe(tick: &GameTick) -> Vec<String> {
    let mut s = state().lock().unwrap();
    step(&mut s, tick)
}

/// Pure detector — all the logic, no globals (so tests own their state).
fn step(s: &mut State, tick: &GameTick) -> Vec<String> {
    let mut out = Vec::new();

    // match boundary
    if tick.in_game && !s.in_game {
        reset(s);
        s.in_game = true;
        // only announce match start near the opening horn, not on reconnect
        if tick.clock_time <= 5 {
            out.push("match_start".to_string());
        }
        // seed baselines so the first real tick doesn't false-fire
        s.level = tick.level;
        s.alive = tick.alive;
        s.kills = tick.kills;
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
    if !s.seen {
        // first tick we ever see is mid-match (e.g. app started late) — baseline only
        s.in_game = true;
        s.level = tick.level;
        s.alive = tick.alive;
        s.kills = tick.kills;
        s.mana = tick.mana_percent;
        s.hp = tick.hp_percent;
        s.score_total = tick.radiant_score + tick.dire_score;
        s.seen = true;
        return out;
    }

    // level up
    if crossed_level_up_milestone(s.level, tick.level) {
        out.push("levelUp".to_string());
    }

    // death / respawn
    if s.alive && !tick.alive {
        out.push("death".to_string());
        s.streak = 0;
        s.streak_tier = 0;
        s.window_kills = 0;
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
        // first blood: our first kill while the match score was still 0-0
        if !s.first_blood_done && s.score_total == 0 {
            out.push("first_blood".to_string());
            s.first_blood_done = true;
        }

        // multikill window (chain kills that land close together)
        if tick.clock_time - s.window_start_clock > MULTIKILL_WINDOW_S || s.window_kills == 0 {
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

    // advance baselines
    s.level = tick.level;
    s.alive = tick.alive;
    s.kills = tick.kills;
    s.mana = tick.mana_percent;
    s.hp = tick.hp_percent;
    s.score_total = tick.radiant_score + tick.dire_score;

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
            hp_percent: 100,
            mana_percent: 100,
            ..Default::default()
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
}

use g_maiden::{
    announcer,
    gsi::GameTick,
    runtime::{self, MatchLifecycle},
};
use serde_json::Value;
use std::sync::{Mutex, MutexGuard};

static REPLAY_STATE_LOCK: Mutex<()> = Mutex::new(());

const REDACTED_TRACE: &str = concat!(
    "{\"ts\":1000,\"match_id\":\"synthetic-match-not-real\",\"session_id\":\"synthetic-session-not-real\",\"tick\":{\"in_game\":true,\"clock_time\":0,\"game_state\":\"DOTA_GAMERULES_STATE_GAME_IN_PROGRESS\",\"daytime\":true,\"radiant_score\":0,\"dire_score\":0,\"gold\":600,\"net_worth\":600,\"gpm\":0,\"xpm\":0,\"kills\":0,\"deaths\":0,\"assists\":0,\"team_name\":\"radiant\",\"last_hits\":0,\"denies\":0,\"hero\":\"npc_dota_hero_crystal_maiden\",\"level\":1,\"alive\":true,\"hp_percent\":100,\"mana_percent\":100,\"steamid\":\"STEAMID-SYNTHETIC-NOT-REAL\",\"local_player_verified\":true,\"buyback_cost\":0,\"respawn_seconds\":0,\"kill_list_len\":0,\"last_victim_slot\":-1}}\n",
    "{\"ts\":2000,\"match_id\":\"synthetic-match-not-real\",\"session_id\":\"synthetic-session-not-real\",\"tick\":{\"in_game\":true,\"clock_time\":1,\"game_state\":\"DOTA_GAMERULES_STATE_GAME_IN_PROGRESS\",\"daytime\":true,\"radiant_score\":1,\"dire_score\":0,\"gold\":660,\"net_worth\":660,\"gpm\":600,\"xpm\":0,\"kills\":1,\"deaths\":0,\"assists\":0,\"team_name\":\"radiant\",\"last_hits\":0,\"denies\":0,\"hero\":\"npc_dota_hero_crystal_maiden\",\"level\":1,\"alive\":true,\"hp_percent\":100,\"mana_percent\":100,\"steamid\":\"STEAMID-SYNTHETIC-NOT-REAL\",\"local_player_verified\":true,\"buyback_cost\":0,\"respawn_seconds\":0,\"kill_list_len\":1,\"last_victim_slot\":4}}\n",
    "{\"ts\":2500,\"type\":\"gank_signal\"}\n",
    "{\"ts\":3000,\"tick\":{\"clock_time\":2}}\n",
    "{\"ts\":4000,\"match_id\":\"synthetic-match-not-real\",\"session_id\":\"synthetic-session-not-real\",\"tick\":{\"in_game\":true,\"clock_time\":2,\"game_state\":\"DOTA_GAMERULES_STATE_GAME_IN_PROGRESS\",\"daytime\":true,\"radiant_score\":1,\"dire_score\":0,\"gold\":660,\"net_worth\":660,\"gpm\":600,\"xpm\":0,\"kills\":1,\"deaths\":0,\"assists\":0,\"team_name\":\"radiant\",\"last_hits\":0,\"denies\":0,\"hero\":\"npc_dota_hero_crystal_maiden\",\"level\":1,\"alive\":true,\"hp_percent\":100,\"mana_percent\":100,\"steamid\":\"STEAMID-SYNTHETIC-NOT-REAL\",\"local_player_verified\":true,\"buyback_cost\":0,\"respawn_seconds\":0,\"kill_list_len\":1,\"last_victim_slot\":4}}\n",
    "{\"ts\":5000,\"tick\":{\"clock_time\":",
);

#[test]
fn synthetic_trace_skips_malformed_and_non_tick_records() {
    let trace = Trace::from_jsonl(REDACTED_TRACE);

    assert_eq!(trace.ticks.len(), 3);
    assert_eq!(trace.malformed_lines, 2);
    assert_eq!(trace.non_tick_records, 1);
    assert!(
        trace.ticks.iter().all(|tick| tick.steamid.is_empty()),
        "synthetic SteamID must be cleared before GameTick deserialization"
    );
    println!(
        "PASS synthetic parse: ticks={} malformed={} non_tick={} blank={}",
        trace.ticks.len(),
        trace.malformed_lines,
        trace.non_tick_records,
        trace.blank_lines
    );
}

#[test]
fn synthetic_snapshot_replay_is_deterministic_and_returns_announcer_events() {
    let _state_guard = replay_state_lock();
    let trace = Trace::from_jsonl(REDACTED_TRACE);
    let first = replay_snapshots(&trace.ticks, "synthetic-replay-one");
    let second = replay_snapshots(&trace.ticks, "synthetic-replay-two");

    assert_eq!(first, second);
    assert_eq!(
        first,
        vec![
            vec!["match_start".to_string()],
            vec!["first_blood".to_string(), "kill".to_string()],
            Vec::new(),
        ]
    );
    println!(
        "PASS synthetic replay: ticks={} malformed={} non_tick={} blank={} steps={}",
        trace.ticks.len(),
        trace.malformed_lines,
        trace.non_tick_records,
        trace.blank_lines,
        first.len()
    );
}

#[test]
#[ignore = "opt-in only: set G_MAIDEN_TRACE_REPLAY to a local match JSONL path"]
fn replays_an_explicit_local_match_log_without_writing_it() {
    let _state_guard = replay_state_lock();
    let path = std::env::var_os("G_MAIDEN_TRACE_REPLAY")
        .expect("set G_MAIDEN_TRACE_REPLAY to one local match-*.jsonl file");
    let contents = std::fs::read_to_string(path).expect("read the explicitly supplied match log");
    let trace = Trace::from_jsonl(&contents);
    assert!(
        !trace.ticks.is_empty(),
        "the selected log must contain tick snapshots"
    );

    let first = replay_snapshots(&trace.ticks, "local-replay-one");
    let second = replay_snapshots(&trace.ticks, "local-replay-two");
    assert_eq!(
        first, second,
        "same snapshot sequence must replay deterministically"
    );
    println!(
        "PASS local replay: ticks={} malformed={} non_tick={} blank={} steps={}",
        trace.ticks.len(),
        trace.malformed_lines,
        trace.non_tick_records,
        trace.blank_lines,
        first.len()
    );
}

struct Trace {
    ticks: Vec<GameTick>,
    malformed_lines: usize,
    non_tick_records: usize,
    blank_lines: usize,
}

impl Trace {
    fn from_jsonl(contents: &str) -> Self {
        let mut trace = Self {
            ticks: Vec::new(),
            malformed_lines: 0,
            non_tick_records: 0,
            blank_lines: 0,
        };

        for line in contents.lines() {
            let line = line.trim();
            if line.is_empty() {
                trace.blank_lines += 1;
                continue;
            }

            let mut record: Value = match serde_json::from_str(line) {
                Ok(record) => record,
                Err(_) => {
                    trace.malformed_lines += 1;
                    continue;
                }
            };
            let Some(record) = record.as_object_mut() else {
                trace.malformed_lines += 1;
                continue;
            };
            record.remove("match_id");
            record.remove("session_id");
            let Some(tick_value) = record.get_mut("tick") else {
                trace.non_tick_records += 1;
                continue;
            };
            let Some(tick_object) = tick_value.as_object_mut() else {
                trace.malformed_lines += 1;
                continue;
            };
            tick_object.insert("steamid".to_string(), Value::String(String::new()));

            match serde_json::from_value::<GameTick>(tick_value.clone()) {
                Ok(tick) => trace.ticks.push(tick),
                Err(_) => trace.malformed_lines += 1,
            }
        }

        trace
    }
}

fn replay_state_lock() -> MutexGuard<'static, ()> {
    REPLAY_STATE_LOCK
        .lock()
        .expect("replay test state lock should not be poisoned")
}

fn replay_snapshots(ticks: &[GameTick], synthetic_match_id: &str) -> Vec<Vec<String>> {
    assert!(
        ticks.iter().all(|tick| tick.steamid.is_empty()),
        "replay must receive only identity-redacted ticks"
    );
    ticks
        .iter()
        .map(|tick| {
            let session = runtime::observe_match_tick(
                lifecycle_for_tick(tick),
                Some(synthetic_match_id.to_string()),
                tick.clock_time,
                tick.in_game,
            );
            announcer::observe_for_session(tick, &session)
        })
        .collect()
}

fn lifecycle_for_tick(tick: &GameTick) -> MatchLifecycle {
    match tick.game_state.as_str() {
        "DOTA_GAMERULES_STATE_DISCONNECT" => MatchLifecycle::Disconnected,
        "DOTA_GAMERULES_STATE_POST_GAME" => MatchLifecycle::End,
        "DOTA_GAMERULES_STATE_GAME_IN_PROGRESS" => MatchLifecycle::Live,
        _ => MatchLifecycle::Draft,
    }
}

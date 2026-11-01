use super::*;
use serde_json::json;

pub(super) fn playing() -> Value {
    json!({
        "provider": {"appid": 570},
        "map": {"game_state": "DOTA_GAMERULES_STATE_GAME_IN_PROGRESS", "matchid": "00123456"},
        "player": {"steamid": "76561198115363193", "team_name": "radiant", "activity": "playing"},
        "hero": {"name": "npc_dota_hero_sniper", "health_percent": 78, "mana_percent": 64,
            "health": 780, "max_health": 1000, "alive": true, "respawn_seconds": 0, "level": 14},
        "items": {"slot0": {"name": "item_secret"}},
        "auth": {"token": "must-stay-local"},
        "previously": {"hero": {"health_percent": 2}}
    })
}

#[test]
fn admits_only_present_own_vitals_from_a_playing_participant() {
    let observation = project_local(&playing(), true).expect("verified own observation");
    assert_eq!(observation.hero, "npc_dota_hero_sniper");
    assert_eq!(observation.hp, 780);
    assert_eq!(observation.max_hp, 1000);
    assert_eq!(observation.mana_percent, 64);
    assert!(observation.alive);
    assert_eq!(observation.respawn_seconds, 0);
    assert_eq!(observation.level, 14);
    assert_eq!(observation.team, "radiant");
    assert_eq!(observation.match_id, "123456");
}

#[test]
fn absent_or_malformed_vitals_never_turn_into_zero_or_dead() {
    for field in [
        "mana_percent",
        "alive",
        "respawn_seconds",
        "level",
        "health",
        "max_health",
    ] {
        let mut value = playing();
        value["hero"].as_object_mut().unwrap().remove(field);
        assert!(project_local(&value, true).is_none(), "missing {field}");
        value["hero"][field] = Value::Null;
        assert!(project_local(&value, true).is_none(), "null {field}");
        value["hero"][field] = json!("0");
        assert!(project_local(&value, true).is_none(), "string {field}");
    }
    for (field, invalid) in [
        ("mana_percent", json!(-1)),
        ("level", json!(0)),
        ("respawn_seconds", json!(601)),
        ("health", json!(1001)),
        ("max_health", json!(0)),
    ] {
        let mut value = playing();
        value["hero"][field] = invalid;
        assert!(
            project_local(&value, true).is_none(),
            "out-of-range {field}"
        );
    }
}

#[test]
fn spectators_unknown_owners_and_missing_activity_are_withheld() {
    assert!(project_local(&playing(), false).is_none());
    for activity in [Value::Null, json!("menu"), json!("spectating"), json!(true)] {
        let mut value = playing();
        value["player"]["activity"] = activity;
        assert!(project_local(&value, true).is_none());
    }
    let mut value = playing();
    value["player"].as_object_mut().unwrap().remove("activity");
    assert!(project_local(&value, true).is_none());
    value = playing();
    value["player"]["team_name"] = json!("spectator");
    assert!(project_local(&value, true).is_none());
    value = playing();
    value["player"]["steamid"] = json!("");
    assert!(project_local(&value, true).is_none());
}

#[test]
fn local_only_sessions_and_non_playing_phases_do_not_share() {
    for match_id in [
        Value::Null,
        json!(0),
        json!(-1),
        json!(1.2),
        json!("+12"),
        json!("bad-id"),
    ] {
        let mut value = playing();
        value["map"]["matchid"] = match_id;
        assert!(project_local(&value, true).is_none());
    }
    for phase in [
        "DOTA_GAMERULES_STATE_HERO_SELECTION",
        "DOTA_GAMERULES_STATE_POST_GAME",
        "DOTA_GAMERULES_STATE_DISCONNECT",
    ] {
        let mut value = playing();
        value["map"]["game_state"] = json!(phase);
        assert!(project_local(&value, true).is_none());
    }
    let mut pre_game = playing();
    pre_game["map"]["game_state"] = json!("DOTA_GAMERULES_STATE_PRE_GAME");
    assert!(project_local(&pre_game, true).is_some());
}

#[test]
fn another_provider_and_malformed_hero_identity_are_not_admitted() {
    let mut value = playing();
    value["provider"]["appid"] = json!(730);
    assert!(project_local(&value, true).is_none());
    value = playing();
    value.as_object_mut().unwrap().remove("provider");
    assert!(project_local(&value, true).is_none());
    for hero in [
        "npc_dota_hero_",
        "npc_dota_hero_../secret",
        "npc_dota_hero_😈",
        "Sniper",
    ] {
        value = playing();
        value["hero"]["name"] = json!(hero);
        assert!(project_local(&value, true).is_none());
    }
}

#[test]
fn outbound_projection_excludes_local_identifiers_and_every_unapproved_field() {
    let observation = project_local(&playing(), true).unwrap();
    let request = SyncRequest {
        sequence: 1,
        scope: Some(observation.scope("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")),
        sample: Some(observation.shared_sample(100)),
    };
    let payload = serde_json::to_value(request).unwrap();
    assert_eq!(
        payload["sample"],
        json!({"hero":"npc_dota_hero_sniper","level":14,"hp":780,"maxHp":1000,"manaPercent":64,"alive":true,"respawnSeconds":0,"sourceAgeMs":100})
    );
    let text = payload.to_string();
    for forbidden in [
        "steamid",
        "76561198115363193",
        "123456",
        "item_secret",
        "must-stay-local",
        "previously",
        "player",
        "auth",
    ] {
        assert!(!text.contains(forbidden), "leaked {forbidden}");
    }
    assert_eq!(payload["scope"]["matchKey"].as_str().unwrap().len(), 64);
    assert_ne!(
        observation.scope("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
        observation.scope("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb")
    );
}

#[test]
fn peer_health_expires_at_source_age_plus_local_elapsed_without_inventing_death() {
    let mut member = MemberView {
        member_id: "b".repeat(32),
        display_name: "CM".into(),
        is_owner: false,
        state: MemberState::Live,
        age_ms: Some(1_700),
        sample: Some(Stats {
            hero: "npc_dota_hero_crystal_maiden".into(),
            level: 12,
            hp: 0,
            max_hp: 800,
            mana_percent: 42,
            alive: false,
            respawn_seconds: 24,
        }),
    };
    member.age_by(300);
    assert_eq!(member.state, MemberState::Live);
    assert_eq!(member.age_ms, Some(2_000));
    assert_eq!(member.sample.as_ref().unwrap().respawn_seconds, 24);
    member.age_by(1);
    assert_eq!(member.state, MemberState::Stale);
    assert!(member.sample.is_none());
    assert_eq!(member.age_ms, Some(2_001));
}

#[test]
fn relay_origins_require_tls_except_literal_loopback_and_disallow_credential_routing() {
    for url in [
        "https://relay.example",
        "http://127.0.0.1:8787/",
        "http://[::1]:8787",
    ] {
        assert!(validate_relay_url(url).is_ok(), "valid origin: {url}");
    }
    for url in [
        "http://relay.example",
        "http://localhost:8787",
        "http://127.1:8787",
        "https://u:p@relay.example",
        "https://relay.example/secret",
        "https://relay.example?token=secret",
        "https://relay.example#secret",
        "file:///tmp/test",
        "https://relay.example\n",
    ] {
        assert!(validate_relay_url(url).is_err(), "unsafe origin: {url}");
    }
}

#[test]
fn names_and_invitations_are_bounded_before_any_transport() {
    assert_eq!(display_name("  เพื่อน 🧊  "), Ok("เพื่อน 🧊".into()));
    assert!(display_name("").is_err());
    assert!(display_name("hello\nworld").is_err());
    assert!(display_name(&"ก".repeat(33)).is_err());
    let valid = format!("GMP1.{}.{}", "a".repeat(32), "b".repeat(64));
    assert!(valid_invite(&valid));
    assert!(!valid_invite(&format!("{valid}.extra")));
    assert!(!valid_invite(&valid.replace('b', "B")));
}

#[test]
fn response_stats_reject_extra_fields_and_invalid_ranges() {
    let value = json!({"hero":"npc_dota_hero_sniper","level":14,"hp":780,"maxHp":1000,"manaPercent":64,"alive":true,"respawnSeconds":0});
    let stats: Stats = serde_json::from_value(value.clone()).unwrap();
    assert!(stats.valid());
    let mut bad = value.clone();
    bad["steamid"] = json!("76561198115363193");
    assert!(serde_json::from_value::<Stats>(bad).is_err());
    let mut bad = value;
    bad["hp"] = json!(1001);
    assert!(!serde_json::from_value::<Stats>(bad).unwrap().valid());
}

#[test]
fn nullable_wire_fields_are_required_even_when_unknown() {
    let member = json!({"memberId":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","displayName":"เพื่อน","isOwner":false,"state":"waiting","ageMs":null,"sample":null});
    assert!(serde_json::from_value::<MemberView>(member.clone()).is_ok());
    for field in ["ageMs", "sample"] {
        let mut missing = member.clone();
        missing.as_object_mut().unwrap().remove(field);
        assert!(
            serde_json::from_value::<MemberView>(missing).is_err(),
            "missing {field} is not an explicit unknown"
        );
    }
}

#[test]
fn confirmed_dead_own_hero_preserves_respawn_and_zero_health() {
    let mut value = playing();
    value["map"]["game_state"] = json!("DOTA_GAMERULES_STATE_PRE_GAME");
    value["hero"]["health"] = json!(0);
    value["hero"]["alive"] = json!(false);
    value["hero"]["respawn_seconds"] = json!(24);
    let sample = project_local(&value, true).unwrap().shared_sample(0);
    assert_eq!(sample.hp, 0);
    assert!(!sample.alive);
    assert_eq!(sample.respawn_seconds, 24);
}

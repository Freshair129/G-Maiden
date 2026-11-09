use std::collections::BTreeSet;
use std::path::Path;

use crate::events::schema;

const SOURCE: &str = include_str!("g-events.toml");
const HISTORY: &str = include_str!("id-history.json");
// G-Suite origin/main at 7e876ffeaa3bca79800f5d2b0475b95e22005cf3.
const G_SUITE_V1_2: &str = include_str!("fixtures/g-suite-v1.2.json");

fn config() -> schema::Config {
    schema::parse(SOURCE).expect("valid event source")
}

#[test]
fn committed_json_equals_generated_output() {
    let expected = schema::render_json(&config());
    for path in ["gann-package/events.json", "../schemas/gmaiden-events.json"] {
        let path = Path::new(env!("CARGO_MANIFEST_DIR")).join(path);
        let actual = std::fs::read_to_string(&path).unwrap();
        assert_eq!(
            actual.replace("\r\n", "\n"),
            expected,
            "{} is stale; run the regenerate command in events/README.md",
            path.display()
        );
    }
}

#[test]
fn generated_json_preserves_g_suite_v1_2_semantics() {
    let expected: serde_json::Value = serde_json::from_str(G_SUITE_V1_2).unwrap();
    let generated: serde_json::Value =
        serde_json::from_str(&schema::render_json(&config())).unwrap();
    // Value equality ignores object-key order and whitespace, but pins array order,
    // every original field (including the Thai prose), and the exact field set.
    assert_eq!(generated, expected);
}

#[test]
fn runtime_metadata_does_not_change_studio_json() {
    let mut changed = config();
    let event = &mut changed.events[0];
    event.deck_label = Some("Deck-only label".into());
    event.deck_order = Some(99);
    event.label.th = "Deck-only Thai".into();
    event.group = "advisor".into();
    event.subtitle = "Deck-only subtitle".into();
    event.notes = Some("Internal notes".into());
    event.detector = "pending".into();
    event.voice_rank = 42;
    event.since = "9.0".into();
    event.tier = Some(2);
    event.deprecated = true;
    assert_eq!(
        schema::render_json(&changed),
        schema::render_json(&config())
    );
}

#[test]
fn deck_preserves_legacy_event_def_order_and_labels() {
    // G-Maiden origin/main at 66c1b8b551224a53aa81b9fd868cfe60ed8dc19a.
    let expected = [
        (
            "danger",
            "warning",
            "Danger",
            "High danger warning",
            "อันตราย",
        ),
        ("gank", "warning", "Gank", "Incoming gank", "แก๊งค์"),
        (
            "revision",
            "warning",
            "Revision",
            "Belief revision",
            "ยกเลิกเตือน",
        ),
        ("hpLow", "warning", "HP Low", "Health is low", "เลือดต่ำ"),
        ("manaLow", "warning", "Mana Low", "Mana is low", "มานาต่ำ"),
        (
            "first_blood",
            "combat",
            "First Blood",
            "First blood",
            "เลือดแรก",
        ),
        ("kill", "combat", "Kill", "Hero kill", "คิล"),
        (
            "double_kill",
            "combat",
            "Double Kill",
            "Double kill",
            "ดับเบิลคิล",
        ),
        (
            "triple_kill",
            "combat",
            "Triple Kill",
            "Triple kill",
            "ทริปเปิลคิล",
        ),
        ("ultra_kill", "combat", "Ultra Kill", "Ultra kill", "อัลตร้า"),
        ("rampage", "combat", "Rampage", "Rampage", "แรมเพจ"),
        (
            "killing_spree",
            "streak",
            "Killing Spree",
            "Killing spree",
            "สปรี",
        ),
        (
            "dominating",
            "streak",
            "Dominating",
            "Dominating",
            "ครอบครอง",
        ),
        ("mega_kill", "streak", "Mega Kill", "Mega kill", "เมก้าคิล"),
        (
            "unstoppable",
            "streak",
            "Unstoppable",
            "Unstoppable",
            "หยุดไม่ได้",
        ),
        (
            "wicked_sick",
            "streak",
            "Wicked Sick",
            "Wicked sick",
            "โหดจัด",
        ),
        (
            "monster_kill",
            "streak",
            "Monster Kill",
            "Monster kill",
            "มอนสเตอร์คิล",
        ),
        ("godlike", "streak", "Godlike", "Godlike", "เทพเจ้า"),
        (
            "beyond_godlike",
            "streak",
            "Beyond Godlike",
            "Beyond godlike",
            "เหนือเทพเจ้า",
        ),
        ("levelUp", "state", "Level Up", "Level up", "เลเวลอัพ"),
        (
            "match_start",
            "state",
            "Match Start",
            "Match start",
            "เริ่มเกม",
        ),
        ("death", "state", "Death", "Hero died", "ตาย"),
        ("respawn", "state", "Respawn", "Respawn", "เกิดใหม่"),
        ("advice", "advisor", "Advice", "Advisor line", "คำแนะนำ"),
    ];
    let actual: Vec<_> = crate::events::EVENTS
        .iter()
        .map(|event| {
            (
                event.id,
                event.group,
                event.label,
                event.subtitle,
                event.thai,
            )
        })
        .collect();
    assert_eq!(actual, expected);
}

#[test]
fn generated_table_version_and_ids_match_source() {
    let config = config();
    let expected: BTreeSet<_> = config
        .events
        .iter()
        .filter(|e| e.deck_order.is_some())
        .map(|e| e.id.as_str())
        .collect();
    let actual: BTreeSet<_> = crate::voice_api::event_ids().collect();
    assert_eq!(actual, expected);
    assert_eq!(crate::events::TAXONOMY_VERSION, config.taxonomy.version);
    for event in &config.events {
        assert_eq!(crate::events::priority(&event.id), event.voice_rank);
        if event.deck_order.is_none() {
            continue;
        }
        let generated = crate::events::EVENTS
            .iter()
            .find(|e| e.id == event.id)
            .unwrap();
        assert_eq!(
            (
                generated.group,
                generated.label,
                generated.subtitle,
                generated.thai
            ),
            (
                event.group.as_str(),
                event.deck_label.as_deref().unwrap(),
                event.subtitle.as_str(),
                event.label.th.as_str()
            )
        );
    }
    assert_eq!(
        crate::events::NON_FIRING_EVENTS,
        &["enemy_missing", "unused"]
    );
}

#[test]
fn id_set_matches_version_history() {
    schema::check_id_version(&config(), HISTORY).unwrap();
}

#[test]
fn id_change_cannot_be_hidden_by_regenerating_json() {
    let mut changed = config();
    changed
        .events
        .iter_mut()
        .find(|event| event.id == "enemy_missing")
        .expect("taxonomy 1.2 contains enemy_missing")
        .id = "another_pending_event".into();
    assert!(schema::check_id_version(&changed, HISTORY)
        .unwrap_err()
        .contains("without a taxonomy version bump"));
}

#[test]
fn changed_metadata_makes_committed_json_stale() {
    let changed =
        schema::parse(&SOURCE.replacen("en = \"Danger\"", "en = \"Changed warning\"", 1)).unwrap();
    assert_ne!(
        schema::render_json(&changed),
        schema::render_json(&config())
    );
}

#[test]
fn validation_rejects_bad_inputs_with_source_location() {
    for (source, message) in [
        (
            SOURCE.replace(
                "value = 18, min = 5, max = 60",
                "value = 99, min = 5, max = 60",
            ),
            "multikill_window_s.value = 99 is outside 5..=60",
        ),
        (
            SOURCE.replace(
                "detector = \"safety.hp\"",
                "detector = \"unknown.detector\"",
            ),
            "unknown detector",
        ),
        (
            SOURCE.replace("id = \"gank\"", "id = \"danger\""),
            "duplicate id",
        ),
        (
            SOURCE.replace("voice_rank = 111", "voice_rank = 110"),
            "duplicate non-zero voice_rank",
        ),
        (
            SOURCE.replacen("deck_order = 1", "deck_order = 0", 1),
            "duplicate deck_order",
        ),
        (
            SOURCE.replace("deck_label = \"Gank\"", ""),
            "deck_order and deck_label are required",
        ),
        (
            SOURCE.replace("since = \"1.2\"", "since = \"1.1\""),
            "pending misuse",
        ),
        (SOURCE.replace("max = 60", "max = 99"), "bounds must remain"),
        (
            SOURCE.replace("[6, 12, 18, 25]", "[6, 6, 31]"),
            "strictly increasing",
        ),
    ] {
        let error = schema::parse(&source)
            .err()
            .expect("must reject invalid source");
        assert!(error.contains(message), "expected {message}: {error}");
        assert!(error.starts_with("g-events.toml:"), "{error}");
        assert!(
            error.split(':').nth(1).unwrap().parse::<usize>().is_ok(),
            "{error}"
        );
    }
}

#[test]
fn unknown_fields_are_rejected_at_every_authoring_level() {
    for source in [
        format!("unknown = true\n{SOURCE}"),
        SOURCE.replace("version = \"1.2\"", "version = \"1.2\"\nunknown = true"),
        SOURCE.replace(
            "[params.announcer]",
            "[params]\nunknown = true\n[params.announcer]",
        ),
        SOURCE.replace(
            "level_up_milestones = [6, 12, 18, 25]",
            "level_up_milestones = [6, 12, 18, 25]\nunknown = true",
        ),
        SOURCE.replace("value = 18,", "unknown = true, value = 18,"),
        SOURCE.replacen("label = {", "label = { unknown = true,", 1),
        SOURCE.replacen("id = \"danger\"", "id = \"danger\"\nunknown = true", 1),
    ] {
        assert!(schema::parse(&source)
            .err()
            .unwrap()
            .contains("unknown field"));
    }
}

#[test]
fn debug_override_validates_bounds_and_only_accepts_params() {
    let defaults = config().params;
    let valid = "[params.announcer]\nmultikill_window_s = { value = 60 }\nhp_low_percent = { value = 5 }\nmana_low_percent = { value = 50 }\nlevel_up_milestones = [6, 25]";
    let changed = schema::override_params(&defaults, valid).unwrap();
    assert_eq!(changed.announcer.multikill_window_s.value, 60);
    assert_eq!(changed.announcer.hp_low_percent.value, 5);
    assert_eq!(changed.announcer.mana_low_percent.value, 50);
    assert_eq!(changed.announcer.level_up_milestones, [6, 25]);
    let partial = schema::override_params(
        &defaults,
        "[params.announcer]\nhp_low_percent = { value = 25 }",
    )
    .unwrap();
    assert_eq!(
        partial.announcer.multikill_window_s.value,
        defaults.announcer.multikill_window_s.value
    );
    for patch in [
        "[params.announcer]\nmultikill_window_s = { value = 99 }",
        "[params.announcer]\nhp_low_percent = { value = 4 }",
        "[params.announcer]\nmana_low_percent = { value = 51 }",
        "[params.announcer]\nmultikill_window_s = { value = 99, max = 100 }",
        "[params.announcer]\nlevel_up_milestones = [12, 6]",
        "[params.announcer]\nlevel_up_milestones = []",
        "[params.announcer]\nunknown = 1",
        "[taxonomy]\nversion = '9.0'\n[params.announcer]",
        "[[events]]\nid = 'bad'\n[params.announcer]",
    ] {
        assert!(
            schema::override_params(&defaults, patch).is_err(),
            "accepted {patch}"
        );
    }
}

#[test]
fn pr1_preserves_announcer_defaults_and_ranks() {
    let a = crate::events::announcer_params();
    assert_eq!(
        (a.multikill_window_s, a.hp_low_percent, a.mana_low_percent),
        (18, 20, 15)
    );
    assert_eq!(a.level_up_milestones, [6, 12, 18, 25]);
    for (id, rank) in [
        ("rampage", 113),
        ("ultra_kill", 112),
        ("triple_kill", 111),
        ("double_kill", 110),
        ("beyond_godlike", 99),
        ("godlike", 95),
        ("monster_kill", 92),
        ("wicked_sick", 88),
        ("unstoppable", 85),
        ("mega_kill", 82),
        ("dominating", 75),
        ("killing_spree", 70),
        ("first_blood", 60),
        ("kill", 50),
        ("death", 45),
        ("hpLow", 40),
        ("respawn", 30),
        ("manaLow", 25),
        ("levelUp", 20),
        ("match_start", 15),
        ("danger", 0),
        ("gank", 0),
        ("revision", 0),
        ("advice", 0),
        ("unused", 0),
        ("enemy_missing", 0),
        ("unknown", 0),
    ] {
        assert_eq!(crate::events::priority(id), rank, "{id}");
    }
}

#[test]
#[ignore = "explicit authoring command; writes the two generated JSON files"]
fn regenerate_events_json() {
    let config = config();
    schema::check_id_version(&config, HISTORY).expect("version history must be reviewed first");
    let json = schema::render_json(&config);
    for path in ["gann-package/events.json", "../schemas/gmaiden-events.json"] {
        std::fs::write(Path::new(env!("CARGO_MANIFEST_DIR")).join(path), &json).unwrap();
    }
}

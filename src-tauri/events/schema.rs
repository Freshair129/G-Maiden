//! Shared authoring parser. Included by build.rs, contract tests and debug startup only.
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::BTreeSet;

pub const RUNTIME_DETECTS_VERSION: &str = "1.2";
pub const DETECTORS: &[&str] = &[
    "announcer.multikill",
    "announcer.streak",
    "announcer.first_blood",
    "announcer.kill",
    "announcer.death",
    "announcer.respawn",
    "announcer.level_up",
    "announcer.hp_edge",
    "announcer.mana_edge",
    "announcer.match_start",
    "signal.cv",
    "sentry.enemy_missing",
    "safety.hp",
    "maiden.advice",
    "none",
    "pending",
];

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Config {
    pub taxonomy: Taxonomy,
    pub params: Params,
    pub events: Vec<Event>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Taxonomy {
    pub version: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Label {
    pub en: String,
    pub th: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Event {
    pub id: String,
    pub label: Label,
    pub deck_order: Option<u8>,
    pub deck_label: Option<String>,
    pub category: String,
    pub group: String,
    pub subtitle: String,
    pub detector: String,
    pub tier: Option<u8>,
    pub voice_rank: u8,
    pub since: String,
    #[serde(default)]
    pub deprecated: bool,
    pub notes: Option<String>,
    // Legacy JSON presentation metadata, independent of single-slot voice_rank.
    pub priority: String,
    pub status: String,
    pub trigger: String,
}

#[derive(Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Params {
    pub announcer: Announcer,
}

#[derive(Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Announcer {
    pub multikill_window_s: Bounded,
    pub hp_low_percent: Bounded,
    pub mana_low_percent: Bounded,
    pub level_up_milestones: Vec<i64>,
}

#[derive(Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Bounded {
    pub value: i64,
    pub min: i64,
    pub max: i64,
}

fn version(value: &str) -> Result<(u64, u64, u64), String> {
    let parts: Vec<_> = value.split('.').collect();
    if !(2..=3).contains(&parts.len())
        || parts.iter().any(|p| {
            p.is_empty()
                || (p.len() > 1 && p.starts_with('0'))
                || !p.bytes().all(|c| c.is_ascii_digit())
        })
    {
        return Err(format!(
            "invalid taxonomy version {value:?}; use major.minor[.patch]"
        ));
    }
    let numbers: Vec<u64> = parts
        .iter()
        .map(|p| p.parse::<u64>())
        .collect::<Result<_, _>>()
        .map_err(|e| e.to_string())?;
    Ok((numbers[0], numbers[1], *numbers.get(2).unwrap_or(&0)))
}

// Semantic errors carry a source line as well as a field/event name, like TOML parse errors.
fn at(source: &str, needle: &str, message: impl std::fmt::Display) -> String {
    let line = source
        .lines()
        .position(|line| line.trim_start().starts_with(needle))
        .map_or(1, |line| line + 1);
    format!("g-events.toml:{line}: {message}")
}

pub fn parse(source: &str) -> Result<Config, String> {
    let config: Config = toml::from_str(source).map_err(|e| format!("g-events.toml: {e}"))?;
    let current = version(&config.taxonomy.version).map_err(|e| at(source, "version", e))?;
    let detected = version(RUNTIME_DETECTS_VERSION)?;
    let mut ids = BTreeSet::new();
    let mut ranks = BTreeSet::new();
    let mut deck_orders = BTreeSet::new();
    for (index, event) in config.events.iter().enumerate() {
        let line = source
            .lines()
            .enumerate()
            .filter(|(_, line)| line.split('#').next().unwrap_or("").trim() == "[[events]]")
            .nth(index)
            .map_or(1, |(line, _)| line + 1);
        let error = |message: String| format!("g-events.toml:{line}: {message}");
        if event.id.is_empty()
            || !event
                .id
                .bytes()
                .all(|c| c.is_ascii_alphanumeric() || c == b'_')
        {
            return Err(error(format!("invalid event id {:?}", event.id)));
        }
        if !ids.insert(&event.id) {
            return Err(error(format!("duplicate id {:?}", event.id)));
        }
        let deck_event = event.detector != "none" && event.detector != "pending";
        if event.deck_order.is_some() != deck_event || event.deck_label.is_some() != deck_event {
            return Err(error(format!(
                "{}: deck_order and deck_label are required only for implemented runtime events",
                event.id
            )));
        }
        if let Some(order) = event.deck_order {
            if !deck_orders.insert(order) {
                return Err(error(format!(
                    "duplicate deck_order {order} ({})",
                    event.id
                )));
            }
        }
        if event.voice_rank != 0 && !ranks.insert(event.voice_rank) {
            return Err(error(format!(
                "duplicate non-zero voice_rank {} ({})",
                event.voice_rank, event.id
            )));
        }
        if !DETECTORS.contains(&event.detector.as_str()) {
            return Err(error(format!(
                "unknown detector {:?} ({})",
                event.detector, event.id
            )));
        }
        let since = version(&event.since).map_err(error)?;
        if since > current {
            return Err(error(format!(
                "{}: since exceeds taxonomy version",
                event.id
            )));
        }
        if event.detector == "pending" && (since <= detected || event.voice_rank != 0) {
            return Err(error(format!("pending misuse for {}: since must exceed runtime detected version {RUNTIME_DETECTS_VERSION} and voice_rank must be 0", event.id)));
        }
        if !["warning", "combat", "streak", "state", "advisor", "none"]
            .contains(&event.group.as_str())
        {
            return Err(error(format!("unknown group {:?}", event.group)));
        }
        if !["critical", "high", "normal", "low", "none"].contains(&event.priority.as_str()) {
            return Err(error(format!("unknown JSON priority {:?}", event.priority)));
        }
        if !["active", "new", "deprecated"].contains(&event.status.as_str()) {
            return Err(error(format!("unknown JSON status {:?}", event.status)));
        }
        if (event.detector == "none") != (event.category == "none") {
            return Err(error(format!(
                "{}: none detector/category must agree",
                event.id
            )));
        }
    }
    validate_params(&config.params, source)?;
    Ok(config)
}

pub fn validate_params(params: &Params, source: &str) -> Result<(), String> {
    let a = &params.announcer;
    for (name, param, min, max) in [
        ("multikill_window_s", &a.multikill_window_s, 5, 60),
        ("hp_low_percent", &a.hp_low_percent, 5, 50),
        ("mana_low_percent", &a.mana_low_percent, 5, 50),
    ] {
        if param.min != min || param.max != max {
            return Err(at(
                source,
                name,
                format!("params.announcer.{name}: bounds must remain {min}..={max}"),
            ));
        }
        if !(min..=max).contains(&param.value) {
            return Err(at(
                source,
                name,
                format!(
                    "params.announcer.{name}.value = {} is outside {min}..={max}",
                    param.value
                ),
            ));
        }
    }
    let levels = &a.level_up_milestones;
    if levels.is_empty()
        || levels.iter().any(|n| !(1..=30).contains(n))
        || levels.windows(2).any(|pair| pair[0] >= pair[1])
    {
        return Err(at(
            source,
            "level_up_milestones",
            "level_up_milestones must be strictly increasing, unique levels in 1..=30",
        ));
    }
    Ok(())
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Override {
    params: OverrideParams,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct OverrideParams {
    announcer: OverrideAnnouncer,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct OverrideAnnouncer {
    multikill_window_s: Option<OverrideValue>,
    hp_low_percent: Option<OverrideValue>,
    mana_low_percent: Option<OverrideValue>,
    level_up_milestones: Option<Vec<i64>>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct OverrideValue {
    value: i64,
}

pub fn override_params(defaults: &Params, source: &str) -> Result<Params, String> {
    let patch: Override = toml::from_str(source).map_err(|e| format!("params override: {e}"))?;
    let mut result = defaults.clone();
    let values = patch.params.announcer;
    let a = &mut result.announcer;
    for (target, value) in [
        (&mut a.multikill_window_s, values.multikill_window_s),
        (&mut a.hp_low_percent, values.hp_low_percent),
        (&mut a.mana_low_percent, values.mana_low_percent),
    ] {
        if let Some(value) = value {
            target.value = value.value;
        }
    }
    if let Some(levels) = values.level_up_milestones {
        a.level_up_milestones = levels;
    }
    validate_params(&result, source)?;
    Ok(result)
}

pub fn render_json(config: &Config) -> String {
    let events: Vec<_> = config
        .events
        .iter()
        .map(|event| {
            json!({
                "id": event.id, "label": event.label.en, "category": event.category,
                "priority": event.priority, "status": event.status, "trigger": event.trigger,
            })
        })
        .collect();
    let value = json!({
        "$schema": "http://json-schema.org/draft-07/schema#",
        "$id": "https://github.com/Freshair129/G-Suite/schemas/gmaiden-events.json",
        "title": "G-Maiden Announcer Event Taxonomy",
        "description": "Canonical event taxonomy. Studio authors and verifies GANN audio/video pairs; Maiden resolves only the selected verified GANN event mapping. Detection and eligibility remain native runtime responsibilities.",
        "version": config.taxonomy.version,
        "x-events": events,
    });
    format!(
        "{}\n",
        serde_json::to_string_pretty(&value).expect("event JSON")
    )
}

pub fn render_rust(config: &Config) -> String {
    let a = &config.params.announcer;
    let mut out = format!(
        "// Generated from events/g-events.toml; do not edit.\n\
         pub(crate) const MULTIKILL_WINDOW_S: i64 = {};\n\
         pub(crate) const HP_LOW: i64 = {};\n\
         pub(crate) const MANA_LOW: i64 = {};\n\
         pub(crate) const LEVEL_UP_MILESTONES: &[i64] = &{:?};\n\
         pub(crate) const TAXONOMY_VERSION: &str = {:?};\n\
         pub(crate) const NON_FIRING_EVENTS: &[&str] = &[",
        a.multikill_window_s.value,
        a.hp_low_percent.value,
        a.mana_low_percent.value,
        a.level_up_milestones,
        config.taxonomy.version,
    );
    for e in &config.events {
        if e.detector == "pending" || e.detector == "none" {
            out.push_str(&format!("{:?},", e.id));
        }
    }
    out.push_str("];\npub(crate) const EVENTS: &[crate::voice_api::EventDef] = &[\n");
    let mut deck_events: Vec<_> = config
        .events
        .iter()
        .filter(|e| e.deck_order.is_some())
        .collect();
    deck_events.sort_by_key(|e| e.deck_order);
    for e in deck_events {
        out.push_str(&format!(
            "crate::voice_api::EventDef {{ id: {:?}, group: {:?}, label: {:?}, subtitle: {:?}, thai: {:?} }},\n",
            e.id, e.group, e.deck_label.as_deref().expect("validated deck_label"), e.subtitle, e.label.th,
        ));
    }
    out.push_str("];\npub(crate) fn priority(event: &str) -> u8 { match event {\n");
    for e in &config.events {
        if e.voice_rank != 0 {
            out.push_str(&format!("{:?} => {},\n", e.id, e.voice_rank));
        }
    }
    out.push_str("_ => 0,\n} }\n");
    out
}

pub fn check_id_version(config: &Config, history: &str) -> Result<(), String> {
    let history: Value = serde_json::from_str(history).map_err(|e| e.to_string())?;
    let snapshots = history
        .as_object()
        .ok_or("expected version-to-id-set history")?;
    let current = version(&config.taxonomy.version)?;
    let ids: BTreeSet<_> = config.events.iter().map(|e| e.id.as_str()).collect();
    let mut found = false;
    for (v, snapshot) in snapshots {
        let snapshot_version = version(v)?;
        let previous: BTreeSet<_> = snapshot
            .as_array()
            .ok_or("expected id array")?
            .iter()
            .map(|id| id.as_str().ok_or("expected string id"))
            .collect::<Result<_, _>>()?;
        if snapshot_version == current {
            found = true;
            if ids != previous {
                return Err(format!("id set changed without a taxonomy version bump ({v}); preserve this historical snapshot"));
            }
        }
        if snapshot_version < current && !previous.is_subset(&ids) {
            return Err("event ids must not be removed/reused; mark deprecated instead".into());
        }
        if snapshot_version < current
            && previous != ids
            && (snapshot_version.0, snapshot_version.1) == (current.0, current.1)
        {
            return Err("adding event ids requires a minor or major taxonomy version bump".into());
        }
    }
    if !found {
        return Err("new taxonomy version needs an appended id-history.json snapshot".into());
    }
    Ok(())
}

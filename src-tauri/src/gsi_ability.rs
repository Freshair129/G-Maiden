//! CR-039: bounded, typed *candidate* parse of the current Dota GSI abilities section.
//!
//! SECURITY BOUNDARY: GSI abilities can refer to the currently selected unit.
//! A verified player SteamID does NOT prove the entries belong to that player's
//! hero. Nothing in this module is a live skill, readiness, UI or Party DTO.
//! Do not serialize, emit, share, log, or feed candidates to AI. Promotion requires
//! real player-mode ownership fixtures and a separate reviewed admission gate.

use serde_json::Value;
use std::collections::HashSet;

const MAX_ENTRIES: usize = 32;
const MAX_SLOT: u8 = 63;
const MAX_NAME_BYTES: usize = 96;
const MAX_COOLDOWN_SECONDS: f64 = 3_600.0;
const MAX_CHARGES: u8 = 255;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum AbilityAttribution {
    /// Selection/hero ownership is not established by this parser.
    UnverifiedSelectedUnit,
}

#[derive(Clone, Debug, PartialEq)]
#[allow(dead_code)] // Parsed but deliberately not projected until CR-039 ownership gates land.
pub(super) struct AbilityEntry {
    pub slot_key: String,
    pub slot_index: u8,
    pub canonical_name: String,
    pub level: Option<u8>,
    pub passive: Option<bool>,
    pub ultimate: Option<bool>,
    pub can_cast: Option<bool>,
    /// Cast lock, not necessarily the same as charge replenishment.
    pub cast_cooldown_seconds: Option<f64>,
    pub charges: Option<u8>,
    pub max_charges: Option<u8>,
    pub charge_replenish_seconds: Option<f64>,
    /// Ingested for fixture comparison only. NOT a readiness/toggle indicator.
    pub ability_active_raw: Option<bool>,
}

#[derive(Clone, Debug, PartialEq)]
#[allow(dead_code)] // Candidate is retained internally only; not a producer for any consumer.
pub(super) struct AbilityCandidate {
    pub attribution: AbilityAttribution,
    pub producer: &'static str,
    pub provider_timestamp_seconds: Option<u64>,
    pub selected_unit_hint: Option<bool>,
    pub entries: Vec<AbilityEntry>,
}

fn slot_index(key: &str) -> Option<u8> {
    let digits = key.strip_prefix("ability")?;
    if digits.is_empty()
        || (digits.len() > 1 && digits.starts_with('0'))
        || !digits.bytes().all(|b| b.is_ascii_digit())
    {
        return None;
    }
    digits.parse::<u8>().ok().filter(|slot| *slot <= MAX_SLOT)
}

fn valid_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= MAX_NAME_BYTES
        && name.bytes().next().is_some_and(|b| b.is_ascii_lowercase())
        && name
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'_')
}

fn optional_bool(row: &serde_json::Map<String, Value>, key: &str) -> Option<Option<bool>> {
    match row.get(key) {
        None | Some(Value::Null) => Some(None),
        Some(value) => value.as_bool().map(Some),
    }
}

fn optional_u8(row: &serde_json::Map<String, Value>, key: &str, max: u8) -> Option<Option<u8>> {
    match row.get(key) {
        None | Some(Value::Null) => Some(None),
        Some(value) => value
            .as_u64()
            .filter(|n| *n <= u64::from(max))
            .map(|n| Some(n as u8)),
    }
}

fn optional_seconds(row: &serde_json::Map<String, Value>, key: &str) -> Option<Option<f64>> {
    match row.get(key) {
        None | Some(Value::Null) => Some(None),
        Some(value) => value
            .as_f64()
            .filter(|n| n.is_finite() && (0.0..=MAX_COOLDOWN_SECONDS).contains(n))
            .map(Some),
    }
}

/// Parse an untrusted single-unit ability section. Only `abilityN` keys are
/// accepted: spectator `teamN/playerN` trees must not be mistaken for our hero.
/// Malformed entries withhold the *whole ability candidate*, not the valid
/// player/hero vitals in the enclosing GSI tick. Missing means None, never zero.
pub(super) fn parse_candidate(payload: &Value) -> Option<AbilityCandidate> {
    let rows = payload.get("abilities")?.as_object()?;
    if rows.is_empty() || rows.len() > MAX_ENTRIES {
        return None;
    }

    let mut seen_names = HashSet::with_capacity(rows.len());
    let mut seen_slots = HashSet::with_capacity(rows.len());
    let mut entries = Vec::with_capacity(rows.len());

    for (key, value) in rows {
        let slot_index = slot_index(key)?;
        if !seen_slots.insert(slot_index) {
            return None;
        }
        let row = value.as_object()?;
        let name = row.get("name")?.as_str()?;
        if !valid_name(name) || !seen_names.insert(name) {
            return None;
        }
        let charges = optional_u8(row, "charges", MAX_CHARGES)?;
        let max_charges = optional_u8(row, "max_charges", MAX_CHARGES)?;
        if charges.zip(max_charges).is_some_and(|(current, max)| current > max) {
            return None;
        }
        entries.push(AbilityEntry {
            slot_key: key.clone(),
            slot_index,
            canonical_name: name.to_owned(),
            level: optional_u8(row, "level", 30)?,
            passive: optional_bool(row, "passive")?,
            ultimate: optional_bool(row, "ultimate")?,
            can_cast: optional_bool(row, "can_cast")?,
            cast_cooldown_seconds: optional_seconds(row, "cooldown")?,
            charges,
            max_charges,
            charge_replenish_seconds: optional_seconds(row, "charge_cooldown")?,
            ability_active_raw: optional_bool(row, "ability_active")?,
        });
    }
    entries.sort_by_key(|entry| entry.slot_index);
    Some(AbilityCandidate {
        attribution: AbilityAttribution::UnverifiedSelectedUnit,
        producer: "dota2_gsi_unverified",
        // A provider timestamp is source metadata, not a measured receive age.
        provider_timestamp_seconds: payload.pointer("/provider/timestamp").and_then(Value::as_u64),
        selected_unit_hint: payload.pointer("/hero/selected_unit").and_then(Value::as_bool),
        entries,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn sample() -> Value {
        // Synthetic parser fixture, NOT captured live Dota evidence.
        json!({
            "provider": {"timestamp": 1_700_000_000},
            "hero": {"selected_unit": true},
            "abilities": {
                "ability4": {
                    "name": "crystal_maiden_freezing_field", "level": 2,
                    "can_cast": true, "passive": false, "ultimate": true,
                    "cooldown": 0.0, "charges": 1, "max_charges": 2,
                    "charge_cooldown": 9.75, "ability_active": false
                },
                "ability0": {
                    "name": "crystal_maiden_crystal_nova", "level": 0,
                    "can_cast": null, "cooldown": 12.25
                }
            }
        })
    }

    #[test]
    fn typed_candidate_preserves_source_precision_and_stable_slots() {
        let result = parse_candidate(&sample()).unwrap();
        assert_eq!(result.attribution, AbilityAttribution::UnverifiedSelectedUnit);
        assert_eq!(result.producer, "dota2_gsi_unverified");
        assert_eq!(result.selected_unit_hint, Some(true));
        assert_eq!(result.provider_timestamp_seconds, Some(1_700_000_000));
        assert_eq!(result.entries.len(), 2);
        assert_eq!(result.entries[0].slot_key, "ability0");
        assert_eq!(result.entries[0].level, Some(0));
        assert_eq!(result.entries[0].can_cast, None);
        assert_eq!(result.entries[0].cast_cooldown_seconds, Some(12.25));
        assert_eq!(result.entries[1].slot_index, 4);
        assert_eq!(result.entries[1].ultimate, Some(true));
        assert_eq!(result.entries[1].can_cast, Some(true));
        assert_eq!(result.entries[1].charge_replenish_seconds, Some(9.75));
        // No readiness field or inference exists in this candidate model.
    }

    #[test]
    fn absent_or_wrong_unit_shape_is_withheld() {
        for value in [
            json!({}),
            json!({"abilities": null}),
            json!({"abilities": {}}),
            json!({"abilities": []}),
            json!({"abilities": {"team2": {"player0": {"ability0": {"name": "x"}}}}}),
            json!({"abilities": {"ability0": null}}),
            json!({"abilities": {"ability00": {"name": "valid_name"}}}),
            json!({"abilities": {"ability64": {"name": "valid_name"}}})
        ] {
            assert!(parse_candidate(&value).is_none(), "{value}");
        }
    }

    #[test]
    fn invalid_optional_values_do_not_turn_into_false_or_zero() {
        let mut value = sample();
        for (field, invalid) in [
            ("level", json!(-1)),
            ("can_cast", json!(0)),
            ("passive", json!("false")),
            ("ultimate", json!(1)),
            ("cooldown", json!(-0.1)),
            ("charge_cooldown", json!(9_999)),
            ("charges", json!(-1)),
            ("max_charges", json!(300)),
            ("ability_active", json!("true")),
        ] {
            value["abilities"]["ability0"][field] = invalid;
            assert!(parse_candidate(&value).is_none(), "field {field} must withhold");
            value = sample();
        }
        value["abilities"]["ability4"]["charges"] = json!(3);
        assert!(parse_candidate(&value).is_none());
    }

    #[test]
    fn duplicate_ability_names_and_unbounded_payload_are_withheld() {
        let mut value = sample();
        value["abilities"]["ability4"]["name"] = json!("crystal_maiden_crystal_nova");
        assert!(parse_candidate(&value).is_none());
        let mut value = json!({"abilities": {}});
        for n in 0..=MAX_ENTRIES {
            value["abilities"][format!("ability{n}")] = json!({"name": format!("spell_{n}")});
        }
        assert!(parse_candidate(&value).is_none());
    }

    #[test]
    fn missing_fields_stay_unknown_even_with_zero_cooldown() {
        let value = json!({"abilities": {"ability0": {
            "name": "crystal_maiden_freezing_field", "cooldown": 0
        }}});
        let skill = &parse_candidate(&value).unwrap().entries[0];
        assert_eq!(skill.level, None);
        assert_eq!(skill.can_cast, None);
        assert_eq!(skill.ultimate, None);
        assert_eq!(skill.passive, None);
        assert_eq!(skill.cast_cooldown_seconds, Some(0.0));
        assert_eq!(skill.charges, None);
        assert_eq!(skill.charge_replenish_seconds, None);
    }
}

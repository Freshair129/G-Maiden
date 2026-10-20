//! Action-scoped damage estimates, separate from G-Damage's combo burst.
//!
//! A verified action definition must name its patch and source. Missing
//! mechanics or target data produce an explicit UNKNOWN result with no damage
//! values, so the existing multi-action burst cannot be mistaken for one cast.

use serde::Serialize;

use crate::damage::{
    armor_multiplier, magic_multiplier, DamageType, TargetCombatSnapshot, TargetLethalityInput,
};

pub const ACTION_DAMAGE_SCHEMA_VERSION: u32 = 1;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ActionVerdict {
    Unknown,
    NonLethal,
    LethalPossible,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum MissingActionFactor {
    MechanicsUnverified,
    UnsupportedPatch,
    TargetData,
    AbilityLevel,
    AttackerAttackDamage,
    TalentsUpgradesOrItems,
    CooldownOrManaAvailability,
    ProjectileTravelAndHpRegeneration,
    DamageBarrier,
    SpellImmunity,
    SpellBlock,
}

#[derive(Clone, Debug, PartialEq)]
pub struct DamageComponentRange {
    pub name: String,
    pub low: f64,
    pub high: f64,
    pub damage_type: DamageType,
}

#[derive(Clone, Debug, PartialEq)]
pub struct SingleActionMechanics {
    pub action_id: String,
    pub patch_id: String,
    pub source_reference: String,
    pub components: Vec<DamageComponentRange>,
    /// Factors that the definition or current observation cannot resolve.
    /// Any entry keeps the result UNKNOWN.
    pub missing_factors: Vec<MissingActionFactor>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct ActionDamageResult {
    pub schema_version: u32,
    pub action_id: String,
    pub target_id: Option<String>,
    pub effective_damage_low: Option<f64>,
    pub effective_damage_high: Option<f64>,
    pub target_hp_low: Option<f64>,
    pub target_hp_high: Option<f64>,
    pub margin_low: Option<f64>,
    pub margin_high: Option<f64>,
    pub verdict: ActionVerdict,
    pub missing_factors: Vec<MissingActionFactor>,
    pub patch_id: Option<String>,
    pub target_confidence: Option<f64>,
    pub observed_at_ms: Option<u64>,
}

#[derive(Clone, Debug, Default)]
struct TargetEvidence {
    target_id: Option<String>,
    hp_low: Option<f64>,
    hp_high: Option<f64>,
    confidence: Option<f64>,
    observed_at_ms: Option<u64>,
}

fn target_evidence(
    target: Option<&TargetCombatSnapshot>,
    now_ms: u64,
) -> (TargetEvidence, Option<TargetLethalityInput>) {
    let normalized = target.and_then(|snapshot| snapshot.to_kill_input(now_ms));
    let evidence = TargetEvidence {
        target_id: target.map(|snapshot| snapshot.target_id.clone()),
        hp_low: normalized.and_then(|_| target.map(|snapshot| snapshot.current_hp_low)),
        hp_high: normalized.and_then(|_| target.map(|snapshot| snapshot.current_hp_high)),
        confidence: target.map(|snapshot| snapshot.data_confidence(now_ms)),
        observed_at_ms: target.map(|snapshot| snapshot.observed_at_ms),
    };
    (evidence, normalized)
}

/// Evaluate exactly one action. Combo callers continue to use `can_i_kill_with`
/// and cannot silently route their multi-hit burst through this API.
pub fn evaluate_single_action(
    action_id: &str,
    current_patch_id: &str,
    mechanics: Option<&SingleActionMechanics>,
    target: Option<&TargetCombatSnapshot>,
    now_ms: u64,
) -> ActionDamageResult {
    let mut missing = Vec::new();
    let (target_evidence, target_input) = target_evidence(target, now_ms);
    if target_input.is_none() {
        missing.push(MissingActionFactor::TargetData);
    }

    let Some(mechanics) = mechanics else {
        missing.push(MissingActionFactor::MechanicsUnverified);
        return unknown(
            action_id,
            current_patch_id,
            target_evidence,
            deduplicate(missing),
        );
    };

    if mechanics.action_id != action_id
        || mechanics.source_reference.trim().is_empty()
        || !mechanics_is_well_formed(mechanics)
    {
        missing.push(MissingActionFactor::MechanicsUnverified);
    }
    if mechanics.patch_id != current_patch_id {
        missing.push(MissingActionFactor::UnsupportedPatch);
    }
    missing.extend(mechanics.missing_factors.iter().copied());
    let Some(target_input) = target_input else {
        return unknown(
            action_id,
            current_patch_id,
            target_evidence,
            deduplicate(missing),
        );
    };
    if !missing.is_empty() {
        return unknown(
            action_id,
            current_patch_id,
            target_evidence,
            deduplicate(missing),
        );
    }

    let mut damage_low = 0.0;
    let mut damage_high = 0.0;
    for component in &mechanics.components {
        let multiplier = match component.damage_type {
            DamageType::Physical => armor_multiplier(target_input.target_armor),
            DamageType::Magical => magic_multiplier(target_input.target_magic_res),
            DamageType::Pure => 1.0,
        };
        damage_low += component.low * multiplier;
        damage_high += component.high * multiplier;
    }
    let margin_low = damage_low - target_input.current_hp * (1.0 + target_input.ehp_uncertainty);
    let margin_high = damage_high - target_input.current_hp * (1.0 - target_input.ehp_uncertainty);
    let verdict = if margin_high >= 0.0 {
        ActionVerdict::LethalPossible
    } else {
        ActionVerdict::NonLethal
    };
    ActionDamageResult {
        schema_version: ACTION_DAMAGE_SCHEMA_VERSION,
        action_id: action_id.into(),
        target_id: target_evidence.target_id,
        effective_damage_low: Some(damage_low),
        effective_damage_high: Some(damage_high),
        target_hp_low: target_evidence.hp_low,
        target_hp_high: target_evidence.hp_high,
        margin_low: Some(margin_low),
        margin_high: Some(margin_high),
        verdict,
        missing_factors: Vec::new(),
        patch_id: Some(current_patch_id.into()),
        target_confidence: target_evidence.confidence,
        observed_at_ms: target_evidence.observed_at_ms,
    }
}

/// The available official patch and hero references establish Assassinate's
/// broad attack-damage-plus-bonus behavior but do not version every current
/// modifier interaction needed for an exact effective-damage result. Keep it
/// UNKNOWN until a complete patch-stamped definition is reviewed.
pub fn sniper_assassinate_unknown(
    current_patch_id: &str,
    target: Option<&TargetCombatSnapshot>,
    now_ms: u64,
) -> ActionDamageResult {
    let mut missing = vec![
        MissingActionFactor::MechanicsUnverified,
        MissingActionFactor::AbilityLevel,
        MissingActionFactor::AttackerAttackDamage,
        MissingActionFactor::TalentsUpgradesOrItems,
        MissingActionFactor::CooldownOrManaAvailability,
        MissingActionFactor::ProjectileTravelAndHpRegeneration,
        MissingActionFactor::DamageBarrier,
        MissingActionFactor::SpellImmunity,
        MissingActionFactor::SpellBlock,
    ];
    let (target_evidence, target_input) = target_evidence(target, now_ms);
    if target_input.is_none() {
        missing.push(MissingActionFactor::TargetData);
    }
    unknown(
        "sniper_assassinate",
        current_patch_id,
        target_evidence,
        deduplicate(missing),
    )
}

fn mechanics_is_well_formed(mechanics: &SingleActionMechanics) -> bool {
    !mechanics.action_id.trim().is_empty()
        && !mechanics.patch_id.trim().is_empty()
        && !mechanics.source_reference.trim().is_empty()
        && !mechanics.components.is_empty()
        && mechanics.components.iter().all(|component| {
            !component.name.trim().is_empty()
                && component.low.is_finite()
                && component.high.is_finite()
                && component.low >= 0.0
                && component.low <= component.high
        })
}

fn unknown(
    action_id: &str,
    patch_id: &str,
    target: TargetEvidence,
    missing_factors: Vec<MissingActionFactor>,
) -> ActionDamageResult {
    ActionDamageResult {
        schema_version: ACTION_DAMAGE_SCHEMA_VERSION,
        action_id: action_id.into(),
        target_id: target.target_id,
        effective_damage_low: None,
        effective_damage_high: None,
        target_hp_low: target.hp_low,
        target_hp_high: target.hp_high,
        margin_low: None,
        margin_high: None,
        verdict: ActionVerdict::Unknown,
        missing_factors,
        patch_id: (!patch_id.trim().is_empty()).then(|| patch_id.into()),
        target_confidence: target.confidence,
        observed_at_ms: target.observed_at_ms,
    }
}

fn deduplicate(mut factors: Vec<MissingActionFactor>) -> Vec<MissingActionFactor> {
    let mut unique = Vec::with_capacity(factors.len());
    for factor in factors.drain(..) {
        if !unique.contains(&factor) {
            unique.push(factor);
        }
    }
    unique
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::damage::{TargetCombatSnapshot, TARGET_DATA_CONFIDENCE_FLOOR};

    fn target() -> TargetCombatSnapshot {
        TargetCombatSnapshot {
            target_id: "npc_dota_hero_pudge".into(),
            current_hp_low: 280.0,
            current_hp_high: 320.0,
            max_hp: Some(1000.0),
            level: Some(12),
            armor: Some(0.0),
            magic_resistance_pct: Some(25.0),
            observed_at_ms: 1_000,
            source_confidence: 1.0,
        }
    }

    fn verified_single_action() -> SingleActionMechanics {
        SingleActionMechanics {
            action_id: "test_single_action".into(),
            patch_id: "7.41f".into(),
            source_reference: "unit-test fixture".into(),
            components: vec![
                DamageComponentRange {
                    name: "physical shot".into(),
                    low: 100.0,
                    high: 100.0,
                    damage_type: DamageType::Physical,
                },
                DamageComponentRange {
                    name: "magical bonus".into(),
                    low: 200.0,
                    high: 200.0,
                    damage_type: DamageType::Magical,
                },
            ],
            missing_factors: Vec::new(),
        }
    }

    #[test]
    fn single_action_uses_one_physical_component_and_one_magical_component() {
        let result = evaluate_single_action(
            "test_single_action",
            "7.41f",
            Some(&verified_single_action()),
            Some(&target()),
            1_100,
        );
        assert_eq!(result.effective_damage_low, Some(250.0));
        assert_eq!(result.effective_damage_high, Some(250.0));
        assert_eq!(result.verdict, ActionVerdict::NonLethal);
        assert_eq!(result.missing_factors, Vec::<MissingActionFactor>::new());
    }

    #[test]
    fn unsupported_or_unverified_mechanics_never_emit_damage_values() {
        let unknown =
            evaluate_single_action("test_single_action", "7.41f", None, Some(&target()), 1_100);
        assert_eq!(unknown.verdict, ActionVerdict::Unknown);
        assert_eq!(unknown.effective_damage_low, None);
        assert!(unknown
            .missing_factors
            .contains(&MissingActionFactor::MechanicsUnverified));

        let mut obsolete = verified_single_action();
        obsolete.patch_id = "7.41e".into();
        let unsupported = evaluate_single_action(
            "test_single_action",
            "7.41f",
            Some(&obsolete),
            Some(&target()),
            1_100,
        );
        assert_eq!(unsupported.verdict, ActionVerdict::Unknown);
        assert!(unsupported
            .missing_factors
            .contains(&MissingActionFactor::UnsupportedPatch));
        assert!(unsupported.effective_damage_high.is_none());
    }

    #[test]
    fn unknown_required_modifiers_and_incomplete_targets_fail_closed() {
        let mut mechanics = verified_single_action();
        mechanics
            .missing_factors
            .push(MissingActionFactor::SpellBlock);
        let result = evaluate_single_action(
            "test_single_action",
            "7.41f",
            Some(&mechanics),
            Some(&target()),
            1_100,
        );
        assert_eq!(result.verdict, ActionVerdict::Unknown);
        assert!(result
            .missing_factors
            .contains(&MissingActionFactor::SpellBlock));

        let mut incomplete = target();
        incomplete.armor = None;
        let result = evaluate_single_action(
            "test_single_action",
            "7.41f",
            Some(&verified_single_action()),
            Some(&incomplete),
            1_100,
        );
        assert_eq!(result.verdict, ActionVerdict::Unknown);
        assert!(result
            .missing_factors
            .contains(&MissingActionFactor::TargetData));
    }

    #[test]
    fn sniper_assassinate_remains_unknown_until_current_patch_factors_are_verified() {
        let result = sniper_assassinate_unknown("7.41f", Some(&target()), 1_100);
        assert_eq!(result.action_id, "sniper_assassinate");
        assert_eq!(result.patch_id.as_deref(), Some("7.41f"));
        assert_eq!(result.verdict, ActionVerdict::Unknown);
        assert!(result.effective_damage_low.is_none());
        assert!(result
            .missing_factors
            .contains(&MissingActionFactor::MechanicsUnverified));
        assert!(result
            .missing_factors
            .contains(&MissingActionFactor::ProjectileTravelAndHpRegeneration));
    }

    #[test]
    fn no_lethality_output_is_possible_without_the_existing_snapshot_confidence_floor() {
        let mut low_quality = target();
        low_quality.source_confidence = TARGET_DATA_CONFIDENCE_FLOOR - 0.01;
        let result = evaluate_single_action(
            "test_single_action",
            "7.41f",
            Some(&verified_single_action()),
            Some(&low_quality),
            1_100,
        );
        assert_eq!(result.verdict, ActionVerdict::Unknown);
        assert!(result.effective_damage_low.is_none());
    }
}

//! G-Damage — Dota 2 burst damage calculator for dynamic HP warnings.
//!
//! Computes the maximum burst damage an enemy hero can deal to the player,
//! factoring in abilities, base attack, damage types, armor, and magic
//! resistance. When the player's current HP falls below the calculated
//! lethal threshold, G-Signal fires a voice warning.

// `self_burst` (own-hero burst estimate) IS wired live into G-Master
// (`master::advise` -> `damage::self_burst`, July 2026). The offensive-lethality
// direction below it — `is_lethal`/`can_i_kill(_with)`/`kill_confidence`/
// `KillWindow`/`all_heroes`/`HeroData::{burst_damage,armor_at_level}` — is still
// unwired scaffold: it answers "can MY combo kill THAT enemy", which needs a
// live read of the *enemy's* current HP/armor (CV HP-bar or OCR scoreboard,
// still BLOCKED-BY-DATA per the 2026-07 audit). The target snapshot adapter
// below enforces that boundary; per-item `#[allow(dead_code)]` stays on the
// source-dependent half until a real local source is approved and wired.
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::OnceLock;

// ────────────────────────── Dota 2 damage formulas ──────────────────────────

/// Physical damage multiplier after armor reduction.
/// Formula: mult = 1 - (0.06 * armor) / (1 + 0.06 * |armor|)
pub fn armor_multiplier(armor: f64) -> f64 {
    if armor >= 0.0 {
        1.0 - (0.06 * armor) / (1.0 + 0.06 * armor)
    } else {
        // Negative armor amplifies damage
        1.0 - (0.06 * armor) / (1.0 + 0.06 * armor.abs())
    }
}

/// Magical damage multiplier after magic resistance.
/// Base magic resistance for most heroes is 25%.
pub fn magic_multiplier(magic_resistance_pct: f64) -> f64 {
    1.0 - magic_resistance_pct / 100.0
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum DamageType {
    Physical,
    Magical,
    Pure,
}

/// A burst-relevant item in a hero's loadout. Only the fields that affect a
/// kill calculation are modelled: flat attack-damage bonus, and an instant
/// active burst (e.g. Dagon). Sustain / on-hit / armor-shred effects are out of
/// scope here and tracked for P-D4.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoadoutItem {
    pub name: String,
    /// Flat bonus attack damage added to every hit.
    pub bonus_attack_damage: f64,
    /// Instant on-use burst (0.0 if the item has none in a burst combo).
    pub active_burst: f64,
    pub active_burst_type: DamageType,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AbilityDamage {
    pub name: String,
    pub damage_type: DamageType,
    /// Damage values per ability level (index 0 = level 1).
    pub damage_per_level: Vec<f64>,
    /// Cooldown in seconds (for burst window estimation).
    pub cooldown: f64,
    /// Whether this is an ultimate ability.
    pub is_ultimate: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HeroData {
    pub internal_name: String,
    pub display_name: String,
    pub base_damage_min: f64,
    pub base_damage_max: f64,
    pub base_armor: f64,
    pub base_magic_resistance: f64,
    /// Primary attribute: "str", "agi", "int", "uni"
    pub primary_attr: String,
    pub base_str: f64,
    pub str_gain: f64,
    pub base_agi: f64,
    pub agi_gain: f64,
    pub base_int: f64,
    pub int_gain: f64,
    pub base_attack_speed: f64,
    pub attack_range: f64,
    pub abilities: Vec<AbilityDamage>,
}

impl HeroData {
    /// Total attack damage at a given level (base + primary stat).
    pub fn attack_damage_at_level(&self, level: u32) -> f64 {
        let avg_base = (self.base_damage_min + self.base_damage_max) / 2.0;
        let levels_gained = (level.saturating_sub(1)) as f64;
        let primary_bonus = match self.primary_attr.as_str() {
            "str" => self.str_gain * levels_gained,
            "agi" => self.agi_gain * levels_gained,
            "int" => self.int_gain * levels_gained,
            _ => 0.0, // universal heroes get a fraction from all
        };
        avg_base + primary_bonus
    }

    /// Armor at a given level (base + agi gain).
    // Offensive-lethality scaffold (see module-top note) — no caller yet.
    #[allow(dead_code)]
    pub fn armor_at_level(&self, level: u32) -> f64 {
        let levels_gained = (level.saturating_sub(1)) as f64;
        self.base_armor + (self.base_agi + self.agi_gain * levels_gained) / 6.0
    }

    /// Maximum single-rotation burst damage at given hero level vs target's defenses.
    /// Convenience wrapper: estimates ability levels and carries no items.
    // Offensive-lethality scaffold (see module-top note) — no caller yet.
    #[allow(dead_code)]
    pub fn burst_damage(
        &self,
        hero_level: u32,
        target_armor: f64,
        target_magic_res: f64,
    ) -> BurstResult {
        self.burst_damage_with(hero_level, None, &[], target_armor, target_magic_res)
    }

    /// Maximum single-rotation burst damage, item- and ability-level-aware.
    ///
    /// - `ability_levels`: actual levels (from GSI) aligned to `self.abilities` order.
    ///   `None`, or any missing index, falls back to [`estimate_ability_level`].
    /// - `items`: burst-relevant loadout — adds flat attack damage and item actives.
    ///
    /// Attack damage assumes 2 hits in the combo window (gap #3 — real attack-speed
    /// timing is P-D4).
    pub fn burst_damage_with(
        &self,
        hero_level: u32,
        ability_levels: Option<&[u32]>,
        items: &[LoadoutItem],
        target_armor: f64,
        target_magic_res: f64,
    ) -> BurstResult {
        let phys_mult = armor_multiplier(target_armor);
        let magic_mult = magic_multiplier(target_magic_res);

        let item_atk_bonus: f64 = items.iter().map(|it| it.bonus_attack_damage).sum();
        let atk_dmg = self.attack_damage_at_level(hero_level) + item_atk_bonus;
        let atk_after_armor = atk_dmg * phys_mult;

        let mut ability_damage = 0.0_f64;
        let mut ability_breakdown = Vec::new();

        for (idx_ab, ability) in self.abilities.iter().enumerate() {
            // Prefer the real ability level from GSI; estimate only when absent.
            let ab_level = ability_levels
                .and_then(|levels| levels.get(idx_ab).copied())
                .unwrap_or_else(|| estimate_ability_level(hero_level, ability.is_ultimate));
            if ab_level == 0 {
                continue;
            }
            let idx = (ab_level as usize)
                .saturating_sub(1)
                .min(ability.damage_per_level.len().saturating_sub(1));
            let raw = ability.damage_per_level.get(idx).copied().unwrap_or(0.0);

            let effective = match ability.damage_type {
                DamageType::Physical => raw * phys_mult,
                DamageType::Magical => raw * magic_mult,
                DamageType::Pure => raw,
            };
            ability_damage += effective;
            ability_breakdown.push(AbilityBurst {
                name: ability.name.clone(),
                raw_damage: raw,
                effective_damage: effective,
                damage_type: ability.damage_type,
                level: ab_level,
            });
        }

        // Item actives (e.g. Dagon) join the burst with their own damage type.
        for it in items {
            if it.active_burst > 0.0 {
                let effective = match it.active_burst_type {
                    DamageType::Physical => it.active_burst * phys_mult,
                    DamageType::Magical => it.active_burst * magic_mult,
                    DamageType::Pure => it.active_burst,
                };
                ability_damage += effective;
                ability_breakdown.push(AbilityBurst {
                    name: it.name.clone(),
                    raw_damage: it.active_burst,
                    effective_damage: effective,
                    damage_type: it.active_burst_type,
                    level: 0,
                });
            }
        }

        // Assume 2 attacks in a burst combo (typical engagement)
        let total = ability_damage + atk_after_armor * 2.0;

        BurstResult {
            total_burst: total,
            attack_damage: atk_dmg,
            attack_after_armor: atk_after_armor,
            abilities: ability_breakdown,
            phys_multiplier: phys_mult,
            magic_multiplier: magic_mult,
        }
    }
}

/// Estimate what level an ability would be at a given hero level.
/// Assumes standard skill build: max one non-ult ability first, take ult at 6/12/18.
fn estimate_ability_level(hero_level: u32, is_ultimate: bool) -> u32 {
    if is_ultimate {
        if hero_level >= 18 {
            3
        } else if hero_level >= 12 {
            2
        } else if hero_level >= 6 {
            1
        } else {
            0
        }
    } else {
        // Regular abilities can have up to 4 levels, one point per 2 hero levels roughly
        (hero_level / 2).min(4)
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct AbilityBurst {
    pub name: String,
    pub raw_damage: f64,
    pub effective_damage: f64,
    pub damage_type: DamageType,
    pub level: u32,
}

#[derive(Debug, Clone, Serialize)]
pub struct BurstResult {
    pub total_burst: f64,
    pub attack_damage: f64,
    pub attack_after_armor: f64,
    pub abilities: Vec<AbilityBurst>,
    pub phys_multiplier: f64,
    pub magic_multiplier: f64,
}

/// Compute whether the enemy can kill the player in one burst.
// Offensive-lethality scaffold (see module-top note) — no caller yet.
#[allow(dead_code)]
pub fn is_lethal(
    enemy: &HeroData,
    enemy_level: u32,
    player_hp: f64,
    player_armor: f64,
    player_magic_res: f64,
) -> (bool, BurstResult) {
    let result = enemy.burst_damage(enemy_level, player_armor, player_magic_res);
    (result.total_burst >= player_hp, result)
}

// ────────────────────────── Offensive lethality (P-D1) ──────────────────────────
//
// The reverse direction of `is_lethal`: "can MY combo kill THAT target right now?".
// Same burst math, target = enemy. The honest twist is that the target side is never
// fully observable (current HP via CV ±error, hidden buffs/regen), so we never emit a
// boolean alone — we emit a `confidence` that feeds Belief Revision (see FEAT-G-DAMAGE §6).

/// Confidence floor at which G-Signal is allowed to say "press it!".
// Offensive-lethality scaffold (see module-top note) — no caller yet.
#[allow(dead_code)]
pub const KILL_CONFIDENCE: f64 = 0.7;

/// Default fractional uncertainty on the target's effective HP when we have no
/// better signal (hidden buffs/regen, stale item scout, no CV HP-bar read yet).
#[allow(dead_code)]
pub const DEFAULT_EHP_UNCERTAINTY: f64 = 0.15;

/// Probability that `burst` actually exceeds the target's true effective HP, given
/// that the true value is uncertain by ±`uncertainty` (fraction) around `ehp`.
///
/// Models the unknown true EHP as uniform over `[ehp*(1-u), ehp*(1+u)]` and returns
/// `P(burst >= true_ehp)`. This is deliberately simple and unit-testable; later phases
/// can replace the uniform prior with a CV-quality / buff-detection informed one.
#[allow(dead_code)]
pub fn kill_confidence(burst: f64, ehp: f64, uncertainty: f64) -> f64 {
    let u = uncertainty.clamp(0.0, 1.0);
    let lo = ehp * (1.0 - u);
    let hi = ehp * (1.0 + u);
    if burst >= hi {
        1.0
    } else if burst <= lo {
        0.0
    } else {
        // hi > lo here because ehp > 0 and u > 0
        ((burst - lo) / (hi - lo)).clamp(0.0, 1.0)
    }
}

/// Result of an offensive lethality query: can my combo kill this target now?
// Offensive-lethality scaffold (see module-top note) — no caller yet.
#[allow(dead_code)]
#[derive(Debug, Clone, Serialize)]
pub struct KillWindow {
    /// True when `confidence >= KILL_CONFIDENCE`.
    pub can_kill: bool,
    /// `burst - effective_hp`. Positive = lethal on paper.
    pub margin: f64,
    /// 0.0–1.0. Feeds Belief Revision — low confidence must NOT be reported as a sure kill.
    pub confidence: f64,
    /// Abilities that contributed to the burst, in DB order (the suggested combo).
    pub combo: Vec<String>,
    /// Full damage breakdown for overlay / debrief.
    pub burst: BurstResult,
    /// How long the window stays valid (cooldowns/regen). P-D2 — needs ability
    /// cooldown + target regen tracking, so `None` in P-D1.
    pub ttl_ms: Option<u32>,
}

/// Maximum age for an observed target HP interval before an offensive decision
/// is no longer actionable.
pub const TARGET_HP_TTL_MS: u64 = 500;

/// Maximum age for target level and defensive-stat observations.
pub const TARGET_STATS_TTL_MS: u64 = 5_000;

/// Minimum source-quality score required before target-side lethality can be
/// passed to the damage calculator.
pub const TARGET_DATA_CONFIDENCE_FLOOR: f64 = 0.70;

const TARGET_REQUIRED_FIELDS: usize = 5;

/// Local, source-neutral target data contract for offensive lethality.
///
/// The snapshot deliberately stores an HP interval instead of pretending that
/// a visual estimate is exact. A future local CV/OCR adapter must populate all
/// required fields before [`to_kill_input`](Self::to_kill_input) can succeed.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TargetCombatSnapshot {
    pub target_id: String,
    pub current_hp_low: f64,
    pub current_hp_high: f64,
    /// Required only when an upstream source supplies HP as a ratio. The
    /// normalized absolute interval above is sufficient for the calculator.
    pub max_hp: Option<f64>,
    pub level: Option<u32>,
    pub armor: Option<f64>,
    pub magic_resistance_pct: Option<f64>,
    pub observed_at_ms: u64,
    pub source_confidence: f64,
}

/// Canonical target values accepted by the existing lethality formula.
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
pub struct TargetLethalityInput {
    pub current_hp: f64,
    pub target_armor: f64,
    pub target_magic_res: f64,
    pub ehp_uncertainty: f64,
}

impl TargetCombatSnapshot {
    /// Reconcile two local observations without silently preferring one source.
    ///
    /// The observations must identify the same target and be close enough that
    /// the HP TTL can cover both. Optional fields may complement one another;
    /// overlapping HP intervals are widened conservatively. Conflicting scalar
    /// values or disjoint HP intervals return `None`, which keeps the caller on
    /// the fail-closed `UNKNOWN` path.
    pub fn merge(&self, other: &Self) -> Option<Self> {
        if self.target_id.trim().is_empty()
            || self.target_id != other.target_id
            || self.observed_at_ms.abs_diff(other.observed_at_ms) > TARGET_HP_TTL_MS
        {
            return None;
        }

        let (current_hp_low, current_hp_high) = merge_hp_interval(
            self.current_hp_low,
            self.current_hp_high,
            other.current_hp_low,
            other.current_hp_high,
        )?;
        let max_hp = merge_optional_f64(self.max_hp, other.max_hp)?;
        let level = merge_optional_value(self.level, other.level)?;
        let armor = merge_optional_f64(self.armor, other.armor)?;
        let magic_resistance_pct =
            merge_optional_f64(self.magic_resistance_pct, other.magic_resistance_pct)?;

        Some(Self {
            target_id: self.target_id.clone(),
            current_hp_low,
            current_hp_high,
            max_hp,
            level,
            armor,
            magic_resistance_pct,
            observed_at_ms: self.observed_at_ms.max(other.observed_at_ms),
            source_confidence: self.source_confidence.min(other.source_confidence),
        })
    }

    /// Return the source-quality score after freshness and completeness are
    /// applied. Invalid values return zero instead of being clamped into a
    /// seemingly trustworthy observation.
    pub fn data_confidence(&self, now_ms: u64) -> f64 {
        if !self.source_confidence.is_finite() || !(0.0..=1.0).contains(&self.source_confidence) {
            return 0.0;
        }

        let age_ms = now_ms.saturating_sub(self.observed_at_ms);
        let freshness_factor = freshness_factor(age_ms, TARGET_HP_TTL_MS)
            .min(freshness_factor(age_ms, TARGET_STATS_TTL_MS));
        let completeness_factor =
            self.present_required_fields() as f64 / TARGET_REQUIRED_FIELDS as f64;
        self.source_confidence * freshness_factor * completeness_factor
    }

    /// Normalize a complete, fresh snapshot into the scalar values consumed by
    /// `can_i_kill_with`. Returns `None` for missing, contradictory, stale, or
    /// low-confidence target data.
    pub fn to_kill_input(&self, now_ms: u64) -> Option<TargetLethalityInput> {
        if !self.is_well_formed() || self.data_confidence(now_ms) < TARGET_DATA_CONFIDENCE_FLOOR {
            return None;
        }

        let armor = self.armor?;
        let target_magic_res = self.magic_resistance_pct?;

        let current_hp = (self.current_hp_low + self.current_hp_high) / 2.0;
        let hp_sum = self.current_hp_low + self.current_hp_high;
        let ehp_uncertainty = if hp_sum == 0.0 {
            0.0
        } else {
            (self.current_hp_high - self.current_hp_low) / hp_sum
        };
        if !current_hp.is_finite() || !ehp_uncertainty.is_finite() {
            return None;
        }

        Some(TargetLethalityInput {
            current_hp,
            target_armor: armor,
            target_magic_res,
            ehp_uncertainty,
        })
    }

    fn is_well_formed(&self) -> bool {
        !self.target_id.trim().is_empty()
            && self.current_hp_low.is_finite()
            && self.current_hp_high.is_finite()
            && self.current_hp_low >= 0.0
            && self.current_hp_low <= self.current_hp_high
            && self
                .max_hp
                .map(|value| value.is_finite() && value > 0.0)
                .unwrap_or(true)
            && self.level.map(|value| value > 0).unwrap_or(false)
            && self.armor.map(|value| value.is_finite()).unwrap_or(false)
            && self
                .magic_resistance_pct
                .map(|value| value.is_finite() && (0.0..=100.0).contains(&value))
                .unwrap_or(false)
    }

    fn present_required_fields(&self) -> usize {
        let target_id = usize::from(!self.target_id.trim().is_empty());
        let hp_interval = usize::from(
            self.current_hp_low.is_finite()
                && self.current_hp_high.is_finite()
                && self.current_hp_low >= 0.0
                && self.current_hp_low <= self.current_hp_high,
        );
        let level = usize::from(self.level.map(|value| value > 0).unwrap_or(false));
        let armor = usize::from(self.armor.map(|value| value.is_finite()).unwrap_or(false));
        let magic_resistance = usize::from(
            self.magic_resistance_pct
                .map(|value| value.is_finite() && (0.0..=100.0).contains(&value))
                .unwrap_or(false),
        );
        target_id + hp_interval + level + armor + magic_resistance
    }
}

fn merge_hp_interval(
    left_low: f64,
    left_high: f64,
    right_low: f64,
    right_high: f64,
) -> Option<(f64, f64)> {
    if left_high < right_low || right_high < left_low {
        None
    } else {
        Some((left_low.min(right_low), left_high.max(right_high)))
    }
}

fn merge_optional_value<T: Copy + PartialEq>(
    left: Option<T>,
    right: Option<T>,
) -> Option<Option<T>> {
    match (left, right) {
        (Some(left), Some(right)) if left != right => None,
        (Some(value), _) | (_, Some(value)) => Some(Some(value)),
        (None, None) => Some(None),
    }
}

fn merge_optional_f64(left: Option<f64>, right: Option<f64>) -> Option<Option<f64>> {
    match (left, right) {
        (Some(left), Some(right)) if !approximately_equal(left, right) => None,
        (Some(value), _) | (_, Some(value)) => Some(Some(value)),
        (None, None) => Some(None),
    }
}

fn approximately_equal(left: f64, right: f64) -> bool {
    let scale = left.abs().max(right.abs()).max(1.0);
    (left - right).abs() <= scale * 1e-6
}

fn freshness_factor(age_ms: u64, ttl_ms: u64) -> f64 {
    if ttl_ms == 0 {
        0.0
    } else {
        (1.0 - age_ms as f64 / ttl_ms as f64).clamp(0.0, 1.0)
    }
}

/// Can `attacker` (my hero) kill a target at its current HP with one burst rotation?
///
/// `target_current_hp` is the target's *current* HP (from CV HP-bar read, or an
/// estimate). `ehp_uncertainty` is the fractional error on that effective HP — pass
/// [`DEFAULT_EHP_UNCERTAINTY`] when there is no better signal. Damage type reductions
/// (armor / magic resist) are applied inside [`HeroData::burst_damage`], so the burst
/// total is already the *effective* damage landed on this target.
// Offensive-lethality scaffold (see module-top note) — no caller yet.
#[allow(dead_code)]
pub fn can_i_kill(
    attacker: &HeroData,
    attacker_level: u32,
    target_current_hp: f64,
    target_armor: f64,
    target_magic_res: f64,
    ehp_uncertainty: f64,
) -> KillWindow {
    can_i_kill_with(
        attacker,
        attacker_level,
        None,
        &[],
        target_current_hp,
        target_armor,
        target_magic_res,
        ehp_uncertainty,
    )
}

/// Item- and ability-level-aware offensive lethality (P-D2). See [`can_i_kill`].
/// `ability_levels` and `items` are fed from live GSI; the rest matches `can_i_kill`.
// Offensive-lethality scaffold (see module-top note) — no caller yet.
#[allow(dead_code)]
#[allow(clippy::too_many_arguments)]
pub fn can_i_kill_with(
    attacker: &HeroData,
    attacker_level: u32,
    ability_levels: Option<&[u32]>,
    items: &[LoadoutItem],
    target_current_hp: f64,
    target_armor: f64,
    target_magic_res: f64,
    ehp_uncertainty: f64,
) -> KillWindow {
    let burst = attacker.burst_damage_with(
        attacker_level,
        ability_levels,
        items,
        target_armor,
        target_magic_res,
    );
    let ehp = target_current_hp.max(0.0);
    let margin = burst.total_burst - ehp;
    let confidence = if ehp <= 0.0 {
        1.0 // already dead
    } else {
        kill_confidence(burst.total_burst, ehp, ehp_uncertainty)
    };
    let combo = burst.abilities.iter().map(|a| a.name.clone()).collect();
    KillWindow {
        can_kill: confidence >= KILL_CONFIDENCE,
        margin,
        confidence,
        combo,
        burst,
        ttl_ms: None,
    }
}

/// Source-safe offensive lethality wrapper. A `KillWindow` is only produced
/// when the target snapshot has complete, fresh, high-confidence data.
#[allow(dead_code)]
pub fn can_i_kill_from_snapshot(
    attacker: &HeroData,
    attacker_level: u32,
    ability_levels: Option<&[u32]>,
    items: &[LoadoutItem],
    snapshot: &TargetCombatSnapshot,
    now_ms: u64,
) -> Option<KillWindow> {
    let target = snapshot.to_kill_input(now_ms)?;
    Some(can_i_kill_with(
        attacker,
        attacker_level,
        ability_levels,
        items,
        target.current_hp,
        target.target_armor,
        target.target_magic_res,
        target.ehp_uncertainty,
    ))
}

// ────────────────────────── Hero database ──────────────────────────

fn hero_db() -> &'static HashMap<String, HeroData> {
    static DB: OnceLock<HashMap<String, HeroData>> = OnceLock::new();
    DB.get_or_init(|| {
        // Generated from dotaconstants by tools/gen-herodb/gen_herodb.py: base stats
        // for the full roster; ability tables are curated (verified) entries only —
        // uncurated heroes have `abilities: []` and rely on attack-damage burst.
        const RAW: &str = include_str!("../data/heroes.json");
        let heroes: Vec<HeroData> =
            serde_json::from_str(RAW).expect("data/heroes.json must be valid HeroData JSON");
        heroes
            .into_iter()
            .map(|h| (h.internal_name.clone(), h))
            .collect()
    })
}

pub fn lookup_hero(internal_name: &str) -> Option<&'static HeroData> {
    hero_db().get(internal_name)
}

// Offensive-lethality scaffold (see module-top note) — no caller yet.
#[allow(dead_code)]
pub fn all_heroes() -> Vec<&'static HeroData> {
    hero_db().values().collect()
}

// ────────────────────────── Item database ──────────────────────────
//
// Burst-relevant items, loaded from data/items.json (see FEAT-G-DAMAGE). Values
// are approximate to the current patch; regenerate alongside the hero DB.

fn item_db() -> &'static HashMap<String, LoadoutItem> {
    static DB: OnceLock<HashMap<String, LoadoutItem>> = OnceLock::new();
    DB.get_or_init(|| {
        const RAW: &str = include_str!("../data/items.json");
        let items: Vec<LoadoutItem> =
            serde_json::from_str(RAW).expect("data/items.json must be valid LoadoutItem JSON");
        items.into_iter().map(|it| (it.name.clone(), it)).collect()
    })
}

/// Look up a single item's burst contribution by GSI internal name.
pub fn lookup_item(name: &str) -> Option<&'static LoadoutItem> {
    item_db().get(name)
}

/// Build a loadout from GSI item names, dropping any we don't model. Items not in
/// the DB (boots, consumables, sustain) simply contribute nothing to burst.
pub fn loadout_from_names<I: AsRef<str>>(names: &[I]) -> Vec<LoadoutItem> {
    names
        .iter()
        .filter_map(|n| lookup_item(n.as_ref()).cloned())
        .collect()
}

// Baseline defender for the self-burst estimate. Enemy armor/HP/magic-res aren't
// observable in own-game (CLAUDE.md honest limit), so instead of a kill verdict
// we express raw combo potential against a soft target: 0 armor, the default
// 25% hero magic resistance. "your combo hits ~X on a squishy", not "you kill Y".
const BASELINE_TARGET_ARMOR: f64 = 0.0;
const BASELINE_TARGET_MAGIC_RES: f64 = 25.0;

/// Estimate the LOCAL player's single-combo burst from their real hero + level +
/// items. The skill build is estimated (`ability_levels = None`) on purpose: GSI's
/// ability-slot ordering can't be aligned to the curated `HeroData.abilities`
/// without live verification, and a misaligned level would silently produce a
/// wrong number — worse than the built-in standard-build estimate. Items and
/// level are exact. `None` when the hero isn't in the DB. Grounds G-Master advice
/// on real kill potential instead of an LLM guess. Own-hero only.
pub fn self_burst(hero_internal: &str, level: u32, item_names: &[String]) -> Option<BurstResult> {
    let hero = lookup_hero(hero_internal)?;
    let items = loadout_from_names(item_names);
    Some(hero.burst_damage_with(
        level,
        None,
        &items,
        BASELINE_TARGET_ARMOR,
        BASELINE_TARGET_MAGIC_RES,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn armor_mult_positive() {
        // 10 armor → ~37.5% reduction
        let m = armor_multiplier(10.0);
        assert!((m - 0.625).abs() < 0.01, "got {m}");
    }

    #[test]
    fn armor_mult_zero() {
        assert!((armor_multiplier(0.0) - 1.0).abs() < f64::EPSILON);
    }

    #[test]
    fn self_burst_grounds_on_hero_and_items() {
        // Unknown hero → None (no confabulation).
        assert!(self_burst("npc_dota_hero_not_a_hero", 10, &[]).is_none());
        // Known hero → positive burst from real level; a burst item raises it.
        let bare = self_burst("npc_dota_hero_antimage", 16, &[]).expect("known hero in DB");
        let armed = self_burst("npc_dota_hero_antimage", 16, &["item_desolator".to_string()])
            .expect("known hero in DB");
        assert!(bare.total_burst > 0.0, "level alone yields attack burst");
        assert!(
            armed.total_burst >= bare.total_burst,
            "a modelled attack item can only add burst: {} vs {}",
            armed.total_burst,
            bare.total_burst
        );
    }

    #[test]
    fn self_burst_applies_baseline_magic_resistance_as_percentage() {
        let bare = self_burst("npc_dota_hero_crystal_maiden", 6, &[])
            .expect("known hero in DB");
        let dagon = self_burst(
            "npc_dota_hero_crystal_maiden",
            6,
            &["item_dagon_5".to_string()],
        )
        .expect("known hero in DB");

        // Dagon 5 is 800 magical damage; baseline 25% resistance must leave 600.
        let dagon_effective = dagon.total_burst - bare.total_burst;
        assert!(
            (dagon_effective - 600.0).abs() < 0.5,
            "self-burst must apply 25% baseline magic resistance: got {dagon_effective}"
        );
    }

    #[test]
    fn armor_mult_negative() {
        // -5 armor → amplifies damage
        let m = armor_multiplier(-5.0);
        assert!(m > 1.0, "negative armor should amplify: got {m}");
    }

    #[test]
    fn magic_mult_default() {
        // 25% base magic resistance
        assert!((magic_multiplier(25.0) - 0.75).abs() < f64::EPSILON);
    }

    #[test]
    fn sniper_burst_at_6() {
        let sniper = lookup_hero("npc_dota_hero_sniper").expect("sniper in db");
        let result = sniper.burst_damage(6, 3.0, 25.0);
        // Should have Assassinate + Shrapnel + Headshot + 2 attacks
        assert!(
            result.total_burst > 200.0,
            "burst should be significant: {}",
            result.total_burst
        );
        assert!(
            result.abilities.iter().any(|a| a.name == "Assassinate"),
            "should include ult"
        );
    }

    #[test]
    fn lina_kills_squishy_at_6() {
        let lina = lookup_hero("npc_dota_hero_lina").expect("lina in db");
        // Squishy hero with 0 armor, 25% magic res, 600 HP
        let (lethal, result) = is_lethal(lina, 6, 600.0, 0.0, 25.0);
        assert!(
            lethal,
            "Lina should kill 600HP target at 6: burst={}",
            result.total_burst
        );
    }

    #[test]
    fn hero_db_has_entries() {
        assert!(all_heroes().len() >= 8, "should have at least 8 heroes");
    }

    #[test]
    fn attack_damage_scales() {
        let sniper = lookup_hero("npc_dota_hero_sniper").unwrap();
        let d1 = sniper.attack_damage_at_level(1);
        let d10 = sniper.attack_damage_at_level(10);
        assert!(d10 > d1, "damage should increase with level");
    }

    // ───────────── JSON-backed DB (P-D3) ─────────────

    #[test]
    fn full_roster_loads_from_json() {
        // data/heroes.json carries the whole roster, not just the curated few.
        assert!(
            all_heroes().len() >= 120,
            "expected full roster, got {}",
            all_heroes().len()
        );
    }

    #[test]
    fn uncurated_hero_has_base_stats_but_no_abilities() {
        // Axe is in the roster (base stats) but not yet curated — abilities empty,
        // so it still produces an attack-only burst rather than panicking.
        let axe = lookup_hero("npc_dota_hero_axe").expect("axe in roster");
        assert!(axe.abilities.is_empty(), "axe abilities not curated yet");
        assert!(axe.base_str > 0.0, "base stats must be populated");
        let burst = axe.burst_damage(10, 0.0, 25.0);
        assert!(burst.total_burst > 0.0, "attack-only burst should be > 0");
        assert!(
            burst.abilities.is_empty(),
            "no ability burst without curation"
        );
    }

    // ───────────── Offensive lethality (P-D1) ─────────────

    #[test]
    fn kill_confidence_above_band_is_certain() {
        // burst well above the upper uncertainty bound → 1.0
        assert!((kill_confidence(1000.0, 500.0, 0.15) - 1.0).abs() < f64::EPSILON);
    }

    #[test]
    fn kill_confidence_below_band_is_zero() {
        // burst below the lower uncertainty bound → 0.0
        assert!(kill_confidence(100.0, 500.0, 0.15).abs() < f64::EPSILON);
    }

    #[test]
    fn kill_confidence_midpoint_is_half() {
        // burst exactly at ehp, ±15% band → ~0.5
        let c = kill_confidence(500.0, 500.0, 0.15);
        assert!(
            (c - 0.5).abs() < 0.01,
            "midpoint confidence should be ~0.5: got {c}"
        );
    }

    #[test]
    fn kill_confidence_monotonic_in_burst() {
        let low = kill_confidence(450.0, 500.0, 0.15);
        let mid = kill_confidence(500.0, 500.0, 0.15);
        let high = kill_confidence(550.0, 500.0, 0.15);
        assert!(
            low < mid && mid < high,
            "confidence must rise with burst: {low} {mid} {high}"
        );
    }

    #[test]
    fn can_kill_squishy_target() {
        let lina = lookup_hero("npc_dota_hero_lina").expect("lina in db");
        // 200 HP squishy, 0 armor, 25% magic res
        let kw = can_i_kill(lina, 18, 200.0, 0.0, 25.0, DEFAULT_EHP_UNCERTAINTY);
        assert!(
            kw.can_kill,
            "Lina lv18 should kill a 200HP target: margin={}",
            kw.margin
        );
        assert!(kw.margin > 0.0, "margin should be positive");
        assert!(
            kw.confidence >= KILL_CONFIDENCE,
            "confidence={}",
            kw.confidence
        );
        assert!(
            !kw.combo.is_empty(),
            "combo should list contributing abilities"
        );
    }

    #[test]
    fn cannot_kill_tanky_target() {
        let cm = lookup_hero("npc_dota_hero_crystal_maiden").expect("cm in db");
        // 2500 HP tank
        let kw = can_i_kill(cm, 6, 2500.0, 5.0, 25.0, DEFAULT_EHP_UNCERTAINTY);
        assert!(!kw.can_kill, "CM lv6 must not kill a 2500HP tank");
        assert!(kw.margin < 0.0, "margin should be negative: {}", kw.margin);
        assert!(
            kw.confidence < KILL_CONFIDENCE,
            "confidence={}",
            kw.confidence
        );
    }

    #[test]
    fn borderline_kill_has_tempered_confidence() {
        // A target whose HP sits right around the burst total should NOT report a sure kill:
        // hidden-buff uncertainty must temper confidence below 1.0.
        let lina = lookup_hero("npc_dota_hero_lina").expect("lina in db");
        let burst = lina.burst_damage(12, 0.0, 25.0).total_burst;
        let kw = can_i_kill(lina, 12, burst, 0.0, 25.0, DEFAULT_EHP_UNCERTAINTY);
        assert!(
            kw.confidence > 0.0 && kw.confidence < 1.0,
            "borderline kill must be uncertain, not a sure thing: {}",
            kw.confidence
        );
        // margin ≈ 0 at this point
        assert!(kw.margin.abs() < 1.0, "margin should be ~0: {}", kw.margin);
    }

    #[test]
    fn already_dead_target_is_certain_kill() {
        let cm = lookup_hero("npc_dota_hero_crystal_maiden").expect("cm in db");
        let kw = can_i_kill(cm, 6, 0.0, 0.0, 25.0, DEFAULT_EHP_UNCERTAINTY);
        assert!(
            kw.can_kill && (kw.confidence - 1.0).abs() < f64::EPSILON,
            "0 HP target is a certain kill"
        );
    }

    #[test]
    fn offensive_uses_target_defenses() {
        // Higher target armor should reduce margin (more EHP survived) for an attacker
        // whose burst is partly physical.
        let pa = lookup_hero("npc_dota_hero_phantom_assassin").expect("pa in db");
        let soft = can_i_kill(pa, 16, 800.0, 0.0, 25.0, DEFAULT_EHP_UNCERTAINTY);
        let armored = can_i_kill(pa, 16, 800.0, 20.0, 25.0, DEFAULT_EHP_UNCERTAINTY);
        assert!(
            armored.margin < soft.margin,
            "armor must lower the kill margin: soft={} armored={}",
            soft.margin,
            armored.margin
        );
    }

    // ───────────── Item / ability-level aware (P-D2) ─────────────

    #[test]
    fn item_db_lookup() {
        assert!(lookup_item("item_dagon_5").is_some());
        assert!(lookup_item("item_demon_edge").is_some());
        assert!(
            lookup_item("item_boots_of_travel").is_none(),
            "unmodelled item → None"
        );
    }

    #[test]
    fn loadout_drops_unknown_items() {
        let loadout = loadout_from_names(&["item_demon_edge", "item_tango", "item_dagon"]);
        assert_eq!(
            loadout.len(),
            2,
            "tango is not burst-relevant and should be dropped"
        );
    }

    #[test]
    fn attack_damage_item_raises_burst() {
        let pa = lookup_hero("npc_dota_hero_phantom_assassin").expect("pa in db");
        let bare = pa.burst_damage_with(16, None, &[], 0.0, 25.0);
        let edge = loadout_from_names(&["item_greater_crit"]);
        let armed = pa.burst_damage_with(16, None, &edge, 0.0, 25.0);
        assert!(
            armed.total_burst > bare.total_burst,
            "a +damage item must raise burst: bare={} armed={}",
            bare.total_burst,
            armed.total_burst
        );
        // +88 damage over 2 unmitigated hits (0 armor) = +176
        assert!((armed.total_burst - bare.total_burst - 176.0).abs() < 0.5);
    }

    #[test]
    fn dagon_adds_magical_burst_to_breakdown() {
        let cm = lookup_hero("npc_dota_hero_crystal_maiden").expect("cm in db");
        let dagon = loadout_from_names(&["item_dagon_5"]);
        let with = cm.burst_damage_with(6, None, &dagon, 0.0, 25.0);
        assert!(
            with.abilities.iter().any(|a| a.name == "item_dagon_5"),
            "dagon should appear in the burst breakdown"
        );
        // 800 magical * 0.75 (25% MR) = 600 effective
        let dagon_eff = with
            .abilities
            .iter()
            .find(|a| a.name == "item_dagon_5")
            .unwrap()
            .effective_damage;
        assert!((dagon_eff - 600.0).abs() < 0.5, "got {dagon_eff}");
    }

    #[test]
    fn real_ability_levels_override_estimate() {
        let lina = lookup_hero("npc_dota_hero_lina").expect("lina in db");
        // At level 6 the estimate gives non-ults lv3, ult lv1. Feed actual MAX levels.
        let estimated = lina.burst_damage(6, 0.0, 25.0);
        let maxed = lina.burst_damage_with(6, Some(&[4, 4, 3]), &[], 0.0, 25.0);
        assert!(
            maxed.total_burst > estimated.total_burst,
            "real higher ability levels must beat the estimate: est={} real={}",
            estimated.total_burst,
            maxed.total_burst
        );
    }

    #[test]
    fn dagon_flips_a_borderline_kill() {
        // Target the bare combo can't quite kill, but Dagon pushes it through.
        let cm = lookup_hero("npc_dota_hero_crystal_maiden").expect("cm in db");
        let bare = can_i_kill(cm, 6, 700.0, 0.0, 25.0, DEFAULT_EHP_UNCERTAINTY);
        let dagon = loadout_from_names(&["item_dagon_5"]);
        let armed = can_i_kill_with(
            cm,
            6,
            None,
            &dagon,
            700.0,
            0.0,
            25.0,
            DEFAULT_EHP_UNCERTAINTY,
        );
        assert!(
            !bare.can_kill,
            "bare CM should not kill a 700HP target at lv6"
        );
        assert!(
            armed.can_kill,
            "Dagon 5 (+600 effective) should flip it to a kill"
        );
        assert!(armed.confidence > bare.confidence);
    }

    fn fresh_target_snapshot() -> TargetCombatSnapshot {
        TargetCombatSnapshot {
            target_id: "npc_dota_hero_lina".to_string(),
            current_hp_low: 600.0,
            current_hp_high: 1000.0,
            max_hp: Some(2000.0),
            level: Some(12),
            armor: Some(5.0),
            magic_resistance_pct: Some(25.0),
            observed_at_ms: 1_000,
            source_confidence: 1.0,
        }
    }

    #[test]
    fn target_snapshot_normalizes_hp_interval() {
        let snapshot = fresh_target_snapshot();
        let input = snapshot
            .to_kill_input(1_000)
            .expect("complete fresh target snapshot should be actionable");

        assert!((input.current_hp - 800.0).abs() < f64::EPSILON);
        assert!((input.ehp_uncertainty - 0.25).abs() < f64::EPSILON);
        assert_eq!(input.target_armor, 5.0);
        assert_eq!(input.target_magic_res, 25.0);
    }

    #[test]
    fn target_snapshot_confidence_includes_freshness_and_completeness() {
        let mut snapshot = fresh_target_snapshot();
        snapshot.source_confidence = 0.8;
        snapshot.observed_at_ms = 1_000;

        let confidence = snapshot.data_confidence(1_250);
        assert!((confidence - 0.4).abs() < f64::EPSILON);
        assert!(snapshot.to_kill_input(1_250).is_none());

        snapshot.level = None;
        assert!(snapshot.data_confidence(1_000) < 0.8);
        assert!(snapshot.to_kill_input(1_000).is_none());
    }

    #[test]
    fn target_snapshot_rejects_missing_invalid_or_stale_fields() {
        let mut snapshot = fresh_target_snapshot();
        snapshot.target_id.clear();
        assert!(snapshot.to_kill_input(1_000).is_none());

        let mut snapshot = fresh_target_snapshot();
        snapshot.current_hp_low = 1_100.0;
        assert!(snapshot.to_kill_input(1_000).is_none());

        let mut snapshot = fresh_target_snapshot();
        snapshot.magic_resistance_pct = Some(100.1);
        assert!(snapshot.to_kill_input(1_000).is_none());

        let mut snapshot = fresh_target_snapshot();
        snapshot.source_confidence = 0.69;
        assert!(snapshot.to_kill_input(1_000).is_none());

        let snapshot = fresh_target_snapshot();
        assert!(snapshot.to_kill_input(1_000 + TARGET_HP_TTL_MS).is_none());
    }

    #[test]
    fn target_snapshot_merge_combines_compatible_partial_observations() {
        let mut hp = fresh_target_snapshot();
        hp.max_hp = None;
        hp.level = None;
        hp.armor = None;
        hp.magic_resistance_pct = None;

        let mut stats = fresh_target_snapshot();
        stats.current_hp_low = 700.0;
        stats.current_hp_high = 900.0;
        stats.source_confidence = 0.9;

        let merged = hp
            .merge(&stats)
            .expect("compatible local observations should merge");
        let input = merged
            .to_kill_input(1_000)
            .expect("merged complete observation should be actionable");

        assert_eq!(input.current_hp, 800.0);
        assert_eq!(input.ehp_uncertainty, 0.25);
        assert_eq!(merged.source_confidence, 0.9);
    }

    #[test]
    fn target_snapshot_merge_rejects_conflicting_observations() {
        let first = fresh_target_snapshot();

        let mut different_target = first.clone();
        different_target.target_id = "npc_dota_hero_axe".to_string();
        assert!(first.merge(&different_target).is_none());

        let mut different_armor = first.clone();
        different_armor.armor = Some(7.0);
        assert!(first.merge(&different_armor).is_none());

        let mut disjoint_hp = first.clone();
        disjoint_hp.current_hp_low = 1_100.0;
        disjoint_hp.current_hp_high = 1_300.0;
        assert!(first.merge(&disjoint_hp).is_none());
    }

    #[test]
    fn target_snapshot_merge_rejects_observations_outside_hp_ttl() {
        let first = fresh_target_snapshot();
        let mut later = first.clone();
        later.observed_at_ms += TARGET_HP_TTL_MS + 1;

        assert!(first.merge(&later).is_none());
    }

    #[test]
    fn snapshot_path_preserves_canonical_magic_resistance_percentage() {
        let cm = lookup_hero("npc_dota_hero_crystal_maiden").expect("cm in db");
        let dagon = loadout_from_names(&["item_dagon_5"]);
        let snapshot = fresh_target_snapshot();
        let kw = can_i_kill_from_snapshot(cm, 6, None, &dagon, &snapshot, 1_000)
            .expect("complete fresh target snapshot should produce a kill window");

        assert!((kw.burst.magic_multiplier - 0.75).abs() < f64::EPSILON);
    }
}

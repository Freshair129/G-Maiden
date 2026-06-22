//! G-Damage — Dota 2 burst damage calculator for dynamic HP warnings.
//!
//! Computes the maximum burst damage an enemy hero can deal to the player,
//! factoring in abilities, base attack, damage types, armor, and magic
//! resistance. When the player's current HP falls below the calculated
//! lethal threshold, G-Signal fires a voice warning.

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
    pub fn armor_at_level(&self, level: u32) -> f64 {
        let levels_gained = (level.saturating_sub(1)) as f64;
        self.base_armor + (self.base_agi + self.agi_gain * levels_gained) / 6.0
    }

    /// Maximum single-rotation burst damage at given hero level vs target's defenses.
    /// Convenience wrapper: estimates ability levels and carries no items.
    pub fn burst_damage(&self, hero_level: u32, target_armor: f64, target_magic_res: f64) -> BurstResult {
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
            let idx = (ab_level as usize).saturating_sub(1).min(ability.damage_per_level.len().saturating_sub(1));
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
pub fn is_lethal(enemy: &HeroData, enemy_level: u32, player_hp: f64, player_armor: f64, player_magic_res: f64) -> (bool, BurstResult) {
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
pub const KILL_CONFIDENCE: f64 = 0.7;

/// Default fractional uncertainty on the target's effective HP when we have no
/// better signal (hidden buffs/regen, stale item scout, no CV HP-bar read yet).
pub const DEFAULT_EHP_UNCERTAINTY: f64 = 0.15;

/// Probability that `burst` actually exceeds the target's true effective HP, given
/// that the true value is uncertain by ±`uncertainty` (fraction) around `ehp`.
///
/// Models the unknown true EHP as uniform over `[ehp*(1-u), ehp*(1+u)]` and returns
/// `P(burst >= true_ehp)`. This is deliberately simple and unit-testable; later phases
/// can replace the uniform prior with a CV-quality / buff-detection informed one.
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

/// Can `attacker` (my hero) kill a target at its current HP with one burst rotation?
///
/// `target_current_hp` is the target's *current* HP (from CV HP-bar read, or an
/// estimate). `ehp_uncertainty` is the fractional error on that effective HP — pass
/// [`DEFAULT_EHP_UNCERTAINTY`] when there is no better signal. Damage type reductions
/// (armor / magic resist) are applied inside [`HeroData::burst_damage`], so the burst
/// total is already the *effective* damage landed on this target.
pub fn can_i_kill(
    attacker: &HeroData,
    attacker_level: u32,
    target_current_hp: f64,
    target_armor: f64,
    target_magic_res: f64,
    ehp_uncertainty: f64,
) -> KillWindow {
    can_i_kill_with(attacker, attacker_level, None, &[], target_current_hp, target_armor, target_magic_res, ehp_uncertainty)
}

/// Item- and ability-level-aware offensive lethality (P-D2). See [`can_i_kill`].
/// `ability_levels` and `items` are fed from live GSI; the rest matches `can_i_kill`.
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
    let burst = attacker.burst_damage_with(attacker_level, ability_levels, items, target_armor, target_magic_res);
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

// ────────────────────────── Hero database ──────────────────────────

fn hero_db() -> &'static HashMap<String, HeroData> {
    static DB: OnceLock<HashMap<String, HeroData>> = OnceLock::new();
    DB.get_or_init(|| {
        let mut m = HashMap::new();
        for hero in built_in_heroes() {
            m.insert(hero.internal_name.clone(), hero);
        }
        m
    })
}

pub fn lookup_hero(internal_name: &str) -> Option<&'static HeroData> {
    hero_db().get(internal_name)
}

pub fn all_heroes() -> Vec<&'static HeroData> {
    hero_db().values().collect()
}

fn built_in_heroes() -> Vec<HeroData> {
    vec![
        HeroData {
            internal_name: "npc_dota_hero_sniper".into(),
            display_name: "Sniper".into(),
            base_damage_min: 15.0, base_damage_max: 21.0,
            base_armor: -1.0, base_magic_resistance: 25.0,
            primary_attr: "agi".into(),
            base_str: 19.0, str_gain: 2.0,
            base_agi: 27.0, agi_gain: 3.2,
            base_int: 15.0, int_gain: 2.6,
            base_attack_speed: 100.0, attack_range: 550.0,
            abilities: vec![
                AbilityDamage { name: "Shrapnel".into(), damage_type: DamageType::Magical, damage_per_level: vec![75.0, 150.0, 225.0, 300.0], cooldown: 0.0, is_ultimate: false },
                AbilityDamage { name: "Headshot".into(), damage_type: DamageType::Physical, damage_per_level: vec![15.0, 40.0, 65.0, 90.0], cooldown: 0.0, is_ultimate: false },
                AbilityDamage { name: "Assassinate".into(), damage_type: DamageType::Magical, damage_per_level: vec![320.0, 485.0, 650.0], cooldown: 20.0, is_ultimate: true },
            ],
        },
        HeroData {
            internal_name: "npc_dota_hero_silencer".into(),
            display_name: "Silencer".into(),
            base_damage_min: 43.0, base_damage_max: 57.0,
            base_armor: 0.0, base_magic_resistance: 25.0,
            primary_attr: "int".into(),
            base_str: 19.0, str_gain: 2.4,
            base_agi: 22.0, agi_gain: 2.1,
            base_int: 27.0, int_gain: 3.0,
            base_attack_speed: 100.0, attack_range: 600.0,
            abilities: vec![
                AbilityDamage { name: "Arcane Curse".into(), damage_type: DamageType::Magical, damage_per_level: vec![24.0, 42.0, 60.0, 78.0], cooldown: 20.0, is_ultimate: false },
                AbilityDamage { name: "Glaives of Wisdom".into(), damage_type: DamageType::Pure, damage_per_level: vec![0.0, 0.0, 0.0, 0.0], cooldown: 0.0, is_ultimate: false },
                AbilityDamage { name: "Last Word".into(), damage_type: DamageType::Magical, damage_per_level: vec![120.0, 180.0, 240.0, 300.0], cooldown: 28.0, is_ultimate: false },
            ],
        },
        HeroData {
            internal_name: "npc_dota_hero_crystal_maiden".into(),
            display_name: "Crystal Maiden".into(),
            base_damage_min: 16.0, base_damage_max: 22.0,
            base_armor: 0.0, base_magic_resistance: 25.0,
            primary_attr: "int".into(),
            base_str: 18.0, str_gain: 2.2,
            base_agi: 16.0, agi_gain: 1.6,
            base_int: 16.0, int_gain: 3.3,
            base_attack_speed: 100.0, attack_range: 600.0,
            abilities: vec![
                AbilityDamage { name: "Crystal Nova".into(), damage_type: DamageType::Magical, damage_per_level: vec![130.0, 170.0, 210.0, 260.0], cooldown: 11.0, is_ultimate: false },
                AbilityDamage { name: "Frostbite".into(), damage_type: DamageType::Magical, damage_per_level: vec![100.0, 150.0, 200.0, 250.0], cooldown: 9.0, is_ultimate: false },
                AbilityDamage { name: "Freezing Field".into(), damage_type: DamageType::Magical, damage_per_level: vec![250.0, 350.0, 450.0], cooldown: 110.0, is_ultimate: true },
            ],
        },
        HeroData {
            internal_name: "npc_dota_hero_lina".into(),
            display_name: "Lina".into(),
            base_damage_min: 28.0, base_damage_max: 36.0,
            base_armor: 0.0, base_magic_resistance: 25.0,
            primary_attr: "int".into(),
            base_str: 20.0, str_gain: 2.4,
            base_agi: 23.0, agi_gain: 1.8,
            base_int: 30.0, int_gain: 3.7,
            base_attack_speed: 100.0, attack_range: 670.0,
            abilities: vec![
                AbilityDamage { name: "Dragon Slave".into(), damage_type: DamageType::Magical, damage_per_level: vec![85.0, 160.0, 235.0, 310.0], cooldown: 8.0, is_ultimate: false },
                AbilityDamage { name: "Light Strike Array".into(), damage_type: DamageType::Magical, damage_per_level: vec![120.0, 160.0, 200.0, 240.0], cooldown: 7.0, is_ultimate: false },
                AbilityDamage { name: "Laguna Blade".into(), damage_type: DamageType::Magical, damage_per_level: vec![500.0, 700.0, 900.0], cooldown: 50.0, is_ultimate: true },
            ],
        },
        HeroData {
            internal_name: "npc_dota_hero_lion".into(),
            display_name: "Lion".into(),
            base_damage_min: 47.0, base_damage_max: 53.0,
            base_armor: 0.0, base_magic_resistance: 25.0,
            primary_attr: "int".into(),
            base_str: 18.0, str_gain: 2.2,
            base_agi: 15.0, agi_gain: 1.5,
            base_int: 20.0, int_gain: 3.5,
            base_attack_speed: 100.0, attack_range: 600.0,
            abilities: vec![
                AbilityDamage { name: "Earth Spike".into(), damage_type: DamageType::Magical, damage_per_level: vec![80.0, 140.0, 200.0, 260.0], cooldown: 12.0, is_ultimate: false },
                AbilityDamage { name: "Finger of Death".into(), damage_type: DamageType::Magical, damage_per_level: vec![600.0, 725.0, 850.0], cooldown: 160.0, is_ultimate: true },
            ],
        },
        HeroData {
            internal_name: "npc_dota_hero_pudge".into(),
            display_name: "Pudge".into(),
            base_damage_min: 68.0, base_damage_max: 74.0,
            base_armor: 1.0, base_magic_resistance: 25.0,
            primary_attr: "str".into(),
            base_str: 25.0, str_gain: 3.5,
            base_agi: 14.0, agi_gain: 1.5,
            base_int: 16.0, int_gain: 1.5,
            base_attack_speed: 100.0, attack_range: 175.0,
            abilities: vec![
                AbilityDamage { name: "Meat Hook".into(), damage_type: DamageType::Pure, damage_per_level: vec![150.0, 220.0, 290.0, 360.0], cooldown: 12.0, is_ultimate: false },
                AbilityDamage { name: "Rot".into(), damage_type: DamageType::Magical, damage_per_level: vec![30.0, 60.0, 90.0, 120.0], cooldown: 0.0, is_ultimate: false },
                AbilityDamage { name: "Dismember".into(), damage_type: DamageType::Pure, damage_per_level: vec![120.0, 180.0, 240.0], cooldown: 30.0, is_ultimate: true },
            ],
        },
        HeroData {
            internal_name: "npc_dota_hero_phantom_assassin".into(),
            display_name: "Phantom Assassin".into(),
            base_damage_min: 50.0, base_damage_max: 52.0,
            base_armor: 2.0, base_magic_resistance: 25.0,
            primary_attr: "agi".into(),
            base_str: 19.0, str_gain: 2.2,
            base_agi: 23.0, agi_gain: 3.4,
            base_int: 15.0, int_gain: 1.4,
            base_attack_speed: 100.0, attack_range: 150.0,
            abilities: vec![
                AbilityDamage { name: "Stifling Dagger".into(), damage_type: DamageType::Physical, damage_per_level: vec![65.0, 100.0, 135.0, 170.0], cooldown: 6.0, is_ultimate: false },
                AbilityDamage { name: "Fan of Knives".into(), damage_type: DamageType::Pure, damage_per_level: vec![0.0, 0.0, 0.0, 0.0], cooldown: 12.0, is_ultimate: false },
            ],
        },
        HeroData {
            internal_name: "npc_dota_hero_invoker".into(),
            display_name: "Invoker".into(),
            base_damage_min: 42.0, base_damage_max: 48.0,
            base_armor: 0.0, base_magic_resistance: 25.0,
            primary_attr: "uni".into(),
            base_str: 19.0, str_gain: 2.4,
            base_agi: 20.0, agi_gain: 1.9,
            base_int: 22.0, int_gain: 4.6,
            base_attack_speed: 100.0, attack_range: 600.0,
            abilities: vec![
                AbilityDamage { name: "Sun Strike".into(), damage_type: DamageType::Pure, damage_per_level: vec![100.0, 162.5, 225.0, 287.5, 350.0, 412.5, 475.0, 537.5], cooldown: 25.0, is_ultimate: false },
                AbilityDamage { name: "Chaos Meteor".into(), damage_type: DamageType::Magical, damage_per_level: vec![57.0, 76.0, 95.0, 114.0, 133.0, 152.0, 171.0, 190.0], cooldown: 55.0, is_ultimate: false },
                AbilityDamage { name: "EMP".into(), damage_type: DamageType::Pure, damage_per_level: vec![100.0, 175.0, 250.0, 325.0, 400.0, 475.0, 550.0, 625.0], cooldown: 30.0, is_ultimate: false },
            ],
        },
    ]
}

// ────────────────────────── Item database ──────────────────────────
//
// Curated, burst-relevant items only. Values are approximate to the current
// patch and should be generated from dotaconstants alongside the hero DB in P-D3.

fn item_db() -> &'static HashMap<String, LoadoutItem> {
    static DB: OnceLock<HashMap<String, LoadoutItem>> = OnceLock::new();
    DB.get_or_init(|| {
        let mut m = HashMap::new();
        let dmg = |name: &str, atk: f64| LoadoutItem {
            name: name.into(), bonus_attack_damage: atk, active_burst: 0.0, active_burst_type: DamageType::Physical,
        };
        let dagon = |name: &str, burst: f64| LoadoutItem {
            name: name.into(), bonus_attack_damage: 0.0, active_burst: burst, active_burst_type: DamageType::Magical,
        };
        for it in [
            dmg("item_broadsword", 18.0),
            dmg("item_claymore", 33.0),
            dmg("item_demon_edge", 46.0),
            dmg("item_lesser_crit", 34.0),   // Crystalys
            dmg("item_greater_crit", 88.0),  // Daedalus (crit chance ignored for now)
            dmg("item_desolator", 50.0),     // armor shred not modelled yet
            dmg("item_monkey_king_bar", 40.0),
            dagon("item_dagon", 400.0),
            dagon("item_dagon_2", 500.0),
            dagon("item_dagon_3", 600.0),
            dagon("item_dagon_4", 700.0),
            dagon("item_dagon_5", 800.0),
        ] {
            m.insert(it.name.clone(), it);
        }
        m
    })
}

/// Look up a single item's burst contribution by GSI internal name.
pub fn lookup_item(name: &str) -> Option<&'static LoadoutItem> {
    item_db().get(name)
}

/// Build a loadout from GSI item names, dropping any we don't model. Items not in
/// the DB (boots, consumables, sustain) simply contribute nothing to burst.
pub fn loadout_from_names<I: AsRef<str>>(names: &[I]) -> Vec<LoadoutItem> {
    names.iter().filter_map(|n| lookup_item(n.as_ref()).cloned()).collect()
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
        assert!(result.total_burst > 200.0, "burst should be significant: {}", result.total_burst);
        assert!(result.abilities.iter().any(|a| a.name == "Assassinate"), "should include ult");
    }

    #[test]
    fn lina_kills_squishy_at_6() {
        let lina = lookup_hero("npc_dota_hero_lina").expect("lina in db");
        // Squishy hero with 0 armor, 25% magic res, 600 HP
        let (lethal, result) = is_lethal(lina, 6, 600.0, 0.0, 25.0);
        assert!(lethal, "Lina should kill 600HP target at 6: burst={}", result.total_burst);
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
        assert!((c - 0.5).abs() < 0.01, "midpoint confidence should be ~0.5: got {c}");
    }

    #[test]
    fn kill_confidence_monotonic_in_burst() {
        let low = kill_confidence(450.0, 500.0, 0.15);
        let mid = kill_confidence(500.0, 500.0, 0.15);
        let high = kill_confidence(550.0, 500.0, 0.15);
        assert!(low < mid && mid < high, "confidence must rise with burst: {low} {mid} {high}");
    }

    #[test]
    fn can_kill_squishy_target() {
        let lina = lookup_hero("npc_dota_hero_lina").expect("lina in db");
        // 200 HP squishy, 0 armor, 25% magic res
        let kw = can_i_kill(lina, 18, 200.0, 0.0, 25.0, DEFAULT_EHP_UNCERTAINTY);
        assert!(kw.can_kill, "Lina lv18 should kill a 200HP target: margin={}", kw.margin);
        assert!(kw.margin > 0.0, "margin should be positive");
        assert!(kw.confidence >= KILL_CONFIDENCE, "confidence={}", kw.confidence);
        assert!(!kw.combo.is_empty(), "combo should list contributing abilities");
    }

    #[test]
    fn cannot_kill_tanky_target() {
        let cm = lookup_hero("npc_dota_hero_crystal_maiden").expect("cm in db");
        // 2500 HP tank
        let kw = can_i_kill(cm, 6, 2500.0, 5.0, 25.0, DEFAULT_EHP_UNCERTAINTY);
        assert!(!kw.can_kill, "CM lv6 must not kill a 2500HP tank");
        assert!(kw.margin < 0.0, "margin should be negative: {}", kw.margin);
        assert!(kw.confidence < KILL_CONFIDENCE, "confidence={}", kw.confidence);
    }

    #[test]
    fn borderline_kill_has_tempered_confidence() {
        // A target whose HP sits right around the burst total should NOT report a sure kill:
        // hidden-buff uncertainty must temper confidence below 1.0.
        let lina = lookup_hero("npc_dota_hero_lina").expect("lina in db");
        let burst = lina.burst_damage(12, 0.0, 25.0).total_burst;
        let kw = can_i_kill(lina, 12, burst, 0.0, 25.0, DEFAULT_EHP_UNCERTAINTY);
        assert!(kw.confidence > 0.0 && kw.confidence < 1.0,
            "borderline kill must be uncertain, not a sure thing: {}", kw.confidence);
        // margin ≈ 0 at this point
        assert!(kw.margin.abs() < 1.0, "margin should be ~0: {}", kw.margin);
    }

    #[test]
    fn already_dead_target_is_certain_kill() {
        let cm = lookup_hero("npc_dota_hero_crystal_maiden").expect("cm in db");
        let kw = can_i_kill(cm, 6, 0.0, 0.0, 25.0, DEFAULT_EHP_UNCERTAINTY);
        assert!(kw.can_kill && (kw.confidence - 1.0).abs() < f64::EPSILON,
            "0 HP target is a certain kill");
    }

    #[test]
    fn offensive_uses_target_defenses() {
        // Higher target armor should reduce margin (more EHP survived) for an attacker
        // whose burst is partly physical.
        let pa = lookup_hero("npc_dota_hero_phantom_assassin").expect("pa in db");
        let soft = can_i_kill(pa, 16, 800.0, 0.0, 25.0, DEFAULT_EHP_UNCERTAINTY);
        let armored = can_i_kill(pa, 16, 800.0, 20.0, 25.0, DEFAULT_EHP_UNCERTAINTY);
        assert!(armored.margin < soft.margin,
            "armor must lower the kill margin: soft={} armored={}", soft.margin, armored.margin);
    }

    // ───────────── Item / ability-level aware (P-D2) ─────────────

    #[test]
    fn item_db_lookup() {
        assert!(lookup_item("item_dagon_5").is_some());
        assert!(lookup_item("item_demon_edge").is_some());
        assert!(lookup_item("item_boots_of_travel").is_none(), "unmodelled item → None");
    }

    #[test]
    fn loadout_drops_unknown_items() {
        let loadout = loadout_from_names(&["item_demon_edge", "item_tango", "item_dagon"]);
        assert_eq!(loadout.len(), 2, "tango is not burst-relevant and should be dropped");
    }

    #[test]
    fn attack_damage_item_raises_burst() {
        let pa = lookup_hero("npc_dota_hero_phantom_assassin").expect("pa in db");
        let bare = pa.burst_damage_with(16, None, &[], 0.0, 25.0);
        let edge = loadout_from_names(&["item_greater_crit"]);
        let armed = pa.burst_damage_with(16, None, &edge, 0.0, 25.0);
        assert!(armed.total_burst > bare.total_burst,
            "a +damage item must raise burst: bare={} armed={}", bare.total_burst, armed.total_burst);
        // +88 damage over 2 unmitigated hits (0 armor) = +176
        assert!((armed.total_burst - bare.total_burst - 176.0).abs() < 0.5);
    }

    #[test]
    fn dagon_adds_magical_burst_to_breakdown() {
        let cm = lookup_hero("npc_dota_hero_crystal_maiden").expect("cm in db");
        let dagon = loadout_from_names(&["item_dagon_5"]);
        let with = cm.burst_damage_with(6, None, &dagon, 0.0, 25.0);
        assert!(with.abilities.iter().any(|a| a.name == "item_dagon_5"),
            "dagon should appear in the burst breakdown");
        // 800 magical * 0.75 (25% MR) = 600 effective
        let dagon_eff = with.abilities.iter().find(|a| a.name == "item_dagon_5").unwrap().effective_damage;
        assert!((dagon_eff - 600.0).abs() < 0.5, "got {dagon_eff}");
    }

    #[test]
    fn real_ability_levels_override_estimate() {
        let lina = lookup_hero("npc_dota_hero_lina").expect("lina in db");
        // At level 6 the estimate gives non-ults lv3, ult lv1. Feed actual MAX levels.
        let estimated = lina.burst_damage(6, 0.0, 25.0);
        let maxed = lina.burst_damage_with(6, Some(&[4, 4, 3]), &[], 0.0, 25.0);
        assert!(maxed.total_burst > estimated.total_burst,
            "real higher ability levels must beat the estimate: est={} real={}",
            estimated.total_burst, maxed.total_burst);
    }

    #[test]
    fn dagon_flips_a_borderline_kill() {
        // Target the bare combo can't quite kill, but Dagon pushes it through.
        let cm = lookup_hero("npc_dota_hero_crystal_maiden").expect("cm in db");
        let bare = can_i_kill(cm, 6, 700.0, 0.0, 25.0, DEFAULT_EHP_UNCERTAINTY);
        let dagon = loadout_from_names(&["item_dagon_5"]);
        let armed = can_i_kill_with(cm, 6, None, &dagon, 700.0, 0.0, 25.0, DEFAULT_EHP_UNCERTAINTY);
        assert!(!bare.can_kill, "bare CM should not kill a 700HP target at lv6");
        assert!(armed.can_kill, "Dagon 5 (+600 effective) should flip it to a kill");
        assert!(armed.confidence > bare.confidence);
    }
}

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
    pub fn burst_damage(&self, hero_level: u32, target_armor: f64, target_magic_res: f64) -> BurstResult {
        let phys_mult = armor_multiplier(target_armor);
        let magic_mult = magic_multiplier(target_magic_res);

        let atk_dmg = self.attack_damage_at_level(hero_level);
        let atk_after_armor = atk_dmg * phys_mult;

        let mut ability_damage = 0.0_f64;
        let mut ability_breakdown = Vec::new();

        for ability in &self.abilities {
            // Determine ability level based on hero level and skill point allocation
            let ab_level = estimate_ability_level(hero_level, ability.is_ultimate);
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
}

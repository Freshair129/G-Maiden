//! Dota 2 respawn-time constants and lookups.
//!
//! All values are data — they live in `data/respawn.json` so a balance patch is a
//! config edit, not a code change. Consumers: G-Signal (enemy "back in Xs" timing),
//! G-Master (buyback decisions), G-Motion (dead enemy is not a threat until respawn).
//!
//! See `docs/research/assets/dota2-hud-reference.md` (image 9) for the source table.
//!
//! Consumed by `crate::revive` (buyback advisor): respawn_seconds,
//! next_respawn_after_buyback, respawn_with_wk_aura, modifiers. `revive` itself is
//! not yet wired into the live flow, so the whole table reads as dead in the binary
//! build — drop this allow once G-Revive's call site lands (see FEAT-G-REVIVE).

#![allow(dead_code)]

use serde::Deserialize;
use std::sync::OnceLock;

#[derive(Debug, Deserialize)]
pub struct RespawnConfig {
    pub patch: String,
    /// Respawn seconds indexed by level: `[0]` = level 1 … `[24]` = level 25+.
    pub default_respawn: Vec<f64>,
    /// Turbo-mode respawn seconds, same indexing as `default_respawn`.
    pub turbo_respawn: Vec<f64>,
    pub modifiers: RespawnModifiers,
}

#[derive(Debug, Deserialize)]
pub struct RespawnModifiers {
    /// Seconds added to your NEXT respawn after using buyback.
    pub buyback_respawn_increase: f64,
    /// Respawn set to this value when dying to neutral creeps.
    pub neutral_set_respawn: f64,
    /// Minimum respawn floor when dying to neutral creeps.
    pub neutral_min_respawn: f64,
    pub courier_base_respawn: f64,
    pub courier_respawn_per_level: f64,
    /// Wraith King Reincarnation: ally heroes' respawn reduced by this percent.
    pub wraith_king_reincarnation_ally_reduction_pct: f64,
}

fn config() -> &'static RespawnConfig {
    static CFG: OnceLock<RespawnConfig> = OnceLock::new();
    CFG.get_or_init(|| {
        const RAW: &str = include_str!("../data/respawn.json");
        serde_json::from_str(RAW).expect("data/respawn.json must be valid RespawnConfig JSON")
    })
}

/// Base respawn time in seconds for a hero of `level`, clamped to the table range
/// (level 1 .. 25+). `turbo` selects the Turbo-mode table.
pub fn respawn_seconds(level: u32, turbo: bool) -> f64 {
    let cfg = config();
    let table = if turbo { &cfg.turbo_respawn } else { &cfg.default_respawn };
    let max_level = table.len() as u32;
    let idx = (level.clamp(1, max_level) - 1) as usize;
    table[idx]
}

/// Respawn time for your NEXT death after using buyback (base + buyback penalty).
/// Useful for G-Master's "if you buy back now, your next death costs +Ns" warning.
pub fn next_respawn_after_buyback(level: u32, turbo: bool) -> f64 {
    respawn_seconds(level, turbo) + config().modifiers.buyback_respawn_increase
}

/// Respawn time with Wraith King's Reincarnation aura applied (−reduction%).
pub fn respawn_with_wk_aura(level: u32, turbo: bool) -> f64 {
    let pct = config().modifiers.wraith_king_reincarnation_ally_reduction_pct;
    respawn_seconds(level, turbo) * (1.0 - pct / 100.0)
}

/// Courier respawn time in seconds at a given courier level.
pub fn courier_respawn_seconds(courier_level: u32) -> f64 {
    let m = &config().modifiers;
    m.courier_base_respawn + m.courier_respawn_per_level * f64::from(courier_level)
}

/// Read-only access to the loaded modifier constants.
pub fn modifiers() -> &'static RespawnModifiers {
    &config().modifiers
}

/// The game patch the loaded respawn table is calibrated for.
pub fn patch() -> &'static str {
    &config().patch
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn config_tables_have_25_entries() {
        assert_eq!(config().default_respawn.len(), 25, "default table must cover levels 1..25+");
        assert_eq!(config().turbo_respawn.len(), 25, "turbo table must cover levels 1..25+");
    }

    #[test]
    fn default_respawn_endpoints() {
        assert_eq!(respawn_seconds(1, false), 12.0);
        assert_eq!(respawn_seconds(25, false), 100.0);
    }

    #[test]
    fn turbo_respawn_endpoints() {
        assert_eq!(respawn_seconds(1, true), 9.0);
        assert_eq!(respawn_seconds(6, true), 20.0);
        assert_eq!(respawn_seconds(25, true), 75.0);
    }

    #[test]
    fn level_is_clamped_both_ends() {
        // Level 0 clamps up to level 1; level 30 clamps down to 25+.
        assert_eq!(respawn_seconds(0, false), respawn_seconds(1, false));
        assert_eq!(respawn_seconds(30, false), respawn_seconds(25, false));
    }

    #[test]
    fn buyback_adds_penalty() {
        assert_eq!(
            next_respawn_after_buyback(25, false),
            respawn_seconds(25, false) + 25.0
        );
    }

    #[test]
    fn wk_aura_reduces_by_ten_percent() {
        assert!((respawn_with_wk_aura(25, false) - 90.0).abs() < 1e-9);
    }

    #[test]
    fn courier_respawn_scales_with_level() {
        assert_eq!(courier_respawn_seconds(0), 60.0);
        assert_eq!(courier_respawn_seconds(5), 90.0);
    }

    #[test]
    fn modifiers_load() {
        assert_eq!(modifiers().neutral_min_respawn, 26.0);
        assert!(!patch().is_empty());
    }
}

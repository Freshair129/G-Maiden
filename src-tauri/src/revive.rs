//! G-Revive — death-window buyback advisor.
//!
//! When the player is dead, the respawn wait is forced idle time — the most
//! generous latency budget in the app. G-Revive uses it to answer one
//! high-stakes question deterministically: should you buy back?
//!
//! The verdict is pure math (respawn timing vs base-fall threat vs gold) so it
//! is testable and never hallucinates. The local SLM layer turns this verdict
//! into Maiden's voiced advice + the "why you died" narrative (see FEAT-G-REVIVE).
//!
//! Respawn timing comes from `crate::respawn` (config-driven table) as a
//! fallback/predictor; the live GSI `hero.respawn_seconds` is preferred when present.
//!
//! Live call site: the `request_buyback_advice` Tauri command (main.rs) builds a
//! DeathContext from the tick, runs `advise_buyback`, and voices the verdict via
//! the local SLM (`narrate_prompt` → `slm::advise_offline`).

use crate::respawn;

/// What we know at the moment of (or during) death. CV supplies the threat
/// fields; GSI supplies level/gold/respawn. Unknowns are `None` and the advice
/// degrades gracefully rather than guessing.
#[derive(Debug, Clone)]
pub struct DeathContext {
    pub level: u32,
    pub turbo: bool,
    pub gold: u32,
    /// GSI `hero.buyback_cost` when exposed; None → affordability unknown.
    pub buyback_cost: Option<u32>,
    /// Live GSI `hero.respawn_seconds` (preferred). None → estimate from table.
    pub respawn_remaining: Option<f64>,
    /// Seconds elapsed since death — used only when `respawn_remaining` is None.
    pub seconds_since_death: f64,
    /// A Wraith King with Reincarnation is on our team (−10% respawn aura).
    pub wk_reincarnation_ally: bool,
    /// Living teammates who could defend without you (0 = you're the last hope).
    pub allies_alive: u32,
    /// Enemies are actively pushing our high ground / throne (from CV).
    pub base_under_threat: bool,
    /// Estimated seconds until the throne falls if undefended (from CV). None →
    /// threat timing unknown.
    pub seconds_to_base_fall: Option<f64>,
}

impl DeathContext {
    /// Build the GSI-derived half of a death context from a game tick. Threat
    /// fields (base push, allies-alive, base-fall time) come from CV and default
    /// to "no known threat" until that layer is wired — so the verdict stays
    /// conservative (no buyback recommended) on GSI data alone.
    pub fn from_tick(tick: &crate::gsi::GameTick) -> Self {
        DeathContext {
            level: tick.level.max(0) as u32,
            turbo: false, // GSI game_mode not parsed yet
            gold: tick.gold.max(0) as u32,
            buyback_cost: (tick.buyback_cost > 0).then_some(tick.buyback_cost as u32),
            respawn_remaining: (tick.respawn_seconds > 0).then_some(tick.respawn_seconds as f64),
            seconds_since_death: 0.0,
            wk_reincarnation_ally: false,
            allies_alive: 4, // unknown until CV; team-intact is the conservative default
            base_under_threat: false, // unknown until CV
            seconds_to_base_fall: None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
pub enum Urgency {
    /// No need to buy back.
    None,
    /// Buyback is a reasonable option.
    Consider,
    /// Buy back now — base falls before you respawn and no one else can defend.
    Strong,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct ReviveAdvice {
    pub recommend_buyback: bool,
    pub urgency: Urgency,
    /// Seconds until you respawn naturally (no buyback).
    pub natural_respawn_remaining: f64,
    /// Some(true/false) when buyback cost is known; None when unknown.
    pub affordable: Option<bool>,
    /// Your NEXT respawn time if you buy back now (base + penalty).
    pub next_respawn_if_buyback: f64,
    /// Short deterministic Thai reason — the SLM layer expands this into persona voice.
    pub reason: String,
}

/// Seconds until natural respawn, preferring the live GSI value and falling back
/// to the config table (with the Wraith King aura applied when present).
fn natural_respawn(ctx: &DeathContext) -> f64 {
    if let Some(live) = ctx.respawn_remaining {
        return live.max(0.0);
    }
    let base = if ctx.wk_reincarnation_ally {
        respawn::respawn_with_wk_aura(ctx.level, ctx.turbo)
    } else {
        respawn::respawn_seconds(ctx.level, ctx.turbo)
    };
    (base - ctx.seconds_since_death).max(0.0)
}

/// Compute the buyback verdict. Pure function — no I/O, fully testable.
pub fn advise_buyback(ctx: &DeathContext) -> ReviveAdvice {
    let natural = natural_respawn(ctx);
    let affordable = ctx.buyback_cost.map(|c| ctx.gold >= c);
    let next_if_buyback = respawn::next_respawn_after_buyback(ctx.level, ctx.turbo);

    // Would natural respawn arrive too late to save the base?
    let too_late = ctx.seconds_to_base_fall.map(|t| t < natural);

    let recommend = ctx.base_under_threat && affordable == Some(true) && too_late == Some(true);

    let urgency = if recommend && ctx.allies_alive == 0 {
        Urgency::Strong
    } else if recommend {
        Urgency::Consider
    } else {
        Urgency::None
    };

    let reason = build_reason(ctx, affordable, too_late, natural, next_if_buyback, urgency);

    ReviveAdvice {
        recommend_buyback: recommend,
        urgency,
        natural_respawn_remaining: natural,
        affordable,
        next_respawn_if_buyback: next_if_buyback,
        reason,
    }
}

fn build_reason(
    ctx: &DeathContext,
    affordable: Option<bool>,
    too_late: Option<bool>,
    natural: f64,
    next_if_buyback: f64,
    urgency: Urgency,
) -> String {
    let secs = natural.round() as i64;
    if !ctx.base_under_threat {
        return format!("ปลอดภัย รอเกิด {secs}s ได้เลย เก็บเงินไว้ก่อน");
    }
    match (affordable, too_late, urgency) {
        (Some(true), Some(true), Urgency::Strong) => format!(
            "บ้านแตกแน่ — ซื้อเกิดเลย! เกิดเองไม่ทัน ({secs}s) แล้วไม่มีใครป้องบ้าน \
             (ตายซ้ำจะรอ {next:.0}s)",
            next = next_if_buyback
        ),
        (Some(true), Some(true), _) => format!(
            "ซื้อเกิดได้ — เกิดเอง {secs}s อาจไม่ทันป้องบ้าน เพื่อนยังอยู่ {allies} คน \
             (ตายซ้ำจะรอ {next:.0}s)",
            allies = ctx.allies_alive,
            next = next_if_buyback
        ),
        (Some(true), Some(false), _) => {
            format!("เกิดปกติทันป้องบ้าน ({secs}s) ไม่ต้องเปลืองซื้อเกิด")
        }
        (Some(false), _, _) => format!("บ้านโดนรุมแต่เงินไม่พอซื้อเกิด — รอเกิด {secs}s"),
        _ => format!("บ้านโดนกดดัน — รอเกิด {secs}s (ข้อมูลไม่พอประเมินซื้อเกิด)"),
    }
}

/// Build the local-SLM prompt that voices a buyback verdict in Maiden's persona.
/// The deterministic verdict is ground truth; the SLM only phrases it — and is told
/// not to invent the death cause (we lack combat-log data until CV is wired).
pub fn narrate_prompt(advice: &ReviveAdvice, tick: &crate::gsi::GameTick) -> String {
    let hero = tick
        .hero
        .strip_prefix("npc_dota_hero_")
        .unwrap_or(&tick.hero)
        .replace('_', " ");
    let action = if advice.recommend_buyback {
        "แนะนำให้ซื้อเกิด (buyback)"
    } else {
        "ไม่ต้องซื้อเกิด รอเกิดปกติ"
    };
    format!(
        "คุณคือ Maiden ที่ปรึกษา Dota 2 บุคลิก Crystal Maiden — อ่อนโยน ฉลาด ไม่ตำหนิผู้เล่น \
         มี humor เรื่อง Nerf CM ได้ในจังหวะปลอดภัย. ผู้เล่น ({hero}) เพิ่งตาย กำลังรอเกิดอีก {secs} วินาที. \
         การตัดสินใจ: {action}. เหตุผล: {reason}. \
         พูดเป็นไทยสั้น ๆ 1-2 ประโยค ให้กำลังใจและบอกสิ่งที่ควรทำ. ห้ามแต่งเหตุการณ์ที่ไม่รู้.",
        hero = hero,
        secs = advice.natural_respawn_remaining.round() as i64,
        action = action,
        reason = advice.reason,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn base() -> DeathContext {
        DeathContext {
            level: 14,
            turbo: false,
            gold: 2000,
            buyback_cost: Some(1500),
            respawn_remaining: None,
            seconds_since_death: 0.0,
            wk_reincarnation_ally: false,
            allies_alive: 4,
            base_under_threat: false,
            seconds_to_base_fall: None,
        }
    }

    #[test]
    fn safe_when_no_threat() {
        let a = advise_buyback(&base());
        assert!(!a.recommend_buyback);
        assert_eq!(a.urgency, Urgency::None);
        assert!(a.reason.contains("ปลอดภัย"));
    }

    #[test]
    fn strong_when_base_falls_and_no_defenders() {
        let ctx = DeathContext {
            base_under_threat: true,
            seconds_to_base_fall: Some(20.0), // < respawn(14)=48
            allies_alive: 0,
            ..base()
        };
        let a = advise_buyback(&ctx);
        assert!(a.recommend_buyback);
        assert_eq!(a.urgency, Urgency::Strong);
        assert!(a.reason.contains("บ้านแตกแน่"));
    }

    #[test]
    fn consider_when_teammates_still_alive() {
        let ctx = DeathContext {
            base_under_threat: true,
            seconds_to_base_fall: Some(20.0),
            allies_alive: 2,
            ..base()
        };
        let a = advise_buyback(&ctx);
        assert!(a.recommend_buyback);
        assert_eq!(a.urgency, Urgency::Consider);
    }

    #[test]
    fn no_buyback_when_respawn_arrives_in_time() {
        let ctx = DeathContext {
            base_under_threat: true,
            seconds_to_base_fall: Some(90.0), // > respawn(14)=48 → make it back
            allies_alive: 0,
            ..base()
        };
        let a = advise_buyback(&ctx);
        assert!(!a.recommend_buyback);
        assert!(a.reason.contains("ทันป้องบ้าน"));
    }

    #[test]
    fn cant_afford_flags_but_does_not_recommend() {
        let ctx = DeathContext {
            base_under_threat: true,
            seconds_to_base_fall: Some(20.0),
            gold: 100,
            buyback_cost: Some(1500),
            ..base()
        };
        let a = advise_buyback(&ctx);
        assert!(!a.recommend_buyback);
        assert_eq!(a.affordable, Some(false));
        assert!(a.reason.contains("เงินไม่พอ"));
    }

    #[test]
    fn prefers_live_gsi_respawn_over_table() {
        let ctx = DeathContext { respawn_remaining: Some(7.0), ..base() };
        let a = advise_buyback(&ctx);
        assert!((a.natural_respawn_remaining - 7.0).abs() < 1e-9);
    }

    #[test]
    fn wk_aura_shortens_table_respawn() {
        let no_wk = advise_buyback(&base()).natural_respawn_remaining;
        let with_wk = advise_buyback(&DeathContext { wk_reincarnation_ally: true, ..base() })
            .natural_respawn_remaining;
        assert!(with_wk < no_wk, "WK aura should reduce respawn: {with_wk} !< {no_wk}");
    }

    #[test]
    fn elapsed_time_reduces_remaining() {
        let ctx = DeathContext { seconds_since_death: 40.0, ..base() };
        let a = advise_buyback(&ctx);
        // respawn(14)=48, minus 40 elapsed = 8
        assert!((a.natural_respawn_remaining - 8.0).abs() < 1e-9);
    }

    #[test]
    fn narrate_prompt_embeds_verdict_and_hero() {
        let ctx = DeathContext {
            base_under_threat: true,
            seconds_to_base_fall: Some(20.0),
            allies_alive: 0,
            ..base()
        };
        let advice = advise_buyback(&ctx);
        let tick = crate::gsi::GameTick {
            hero: "npc_dota_hero_crystal_maiden".into(),
            ..Default::default()
        };
        let p = narrate_prompt(&advice, &tick);
        assert!(p.contains("crystal maiden"), "prompt should name the hero: {p}");
        assert!(p.contains("ซื้อเกิด"), "prompt should carry the buyback verdict: {p}");
        assert!(p.contains(&advice.reason), "prompt should include the deterministic reason");
    }

    #[test]
    fn from_tick_maps_gsi_fields() {
        let tick = crate::gsi::GameTick {
            level: 16,
            gold: 1800,
            buyback_cost: 1500,
            respawn_seconds: 30,
            ..Default::default()
        };
        let ctx = DeathContext::from_tick(&tick);
        assert_eq!(ctx.level, 16);
        assert_eq!(ctx.gold, 1800);
        assert_eq!(ctx.buyback_cost, Some(1500));
        assert_eq!(ctx.respawn_remaining, Some(30.0));
        // Missing GSI fields → None (alive hero: no buyback/respawn exposed).
        let empty = DeathContext::from_tick(&crate::gsi::GameTick::default());
        assert_eq!(empty.buyback_cost, None);
        assert_eq!(empty.respawn_remaining, None);
    }

    #[test]
    fn unknown_buyback_cost_degrades_gracefully() {
        let ctx = DeathContext {
            base_under_threat: true,
            seconds_to_base_fall: Some(20.0),
            buyback_cost: None,
            ..base()
        };
        let a = advise_buyback(&ctx);
        assert!(!a.recommend_buyback);
        assert_eq!(a.affordable, None);
    }
}

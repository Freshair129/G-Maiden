//! G-Revive — death-window buyback advisor.
//!
//! When the player is dead, the respawn wait is forced idle time. G-Revive uses
//! trustworthy game and threat facts to answer the high-stakes question of
//! whether to buy back; missing evidence produces an explicit unknown state.
//!
//! The verdict is pure math (respawn timing vs base-fall threat vs gold) so it
//! is testable and never hallucinates. Unknown inputs remain unknown; the local
//! SLM only phrases a verdict when the required evidence is available.
//!
//! Respawn timing prefers live GSI `hero.respawn_seconds`. The config table is
//! used only when mode, elapsed time, and Wraith King aura status are all known.
//!
//! Live call site: the `request_buyback_advice` Tauri command (lib.rs) builds a
//! DeathContext from the tick, runs `advise_buyback`, and voices a known verdict
//! via the local SLM (`narrate_prompt` → `slm::advise_offline`).

use crate::respawn;

/// What we know at the moment of (or during) death. Missing values stay `None`;
/// a buyback verdict is not produced until the game mode, threat, and defender
/// facts required by that verdict are available.
#[derive(Debug, Clone)]
pub struct DeathContext {
    pub level: Option<u32>,
    /// `None` until the active game mode has been identified from a trusted source.
    pub turbo: Option<bool>,
    pub gold: u32,
    /// GSI `hero.buyback_cost` when exposed; zero/absent is unknown.
    pub buyback_cost: Option<u32>,
    /// Live GSI `hero.respawn_seconds`; no mode-based estimate is used when absent.
    pub respawn_remaining: Option<f64>,
    /// Seconds elapsed since death, if a timestamped death observation exists.
    pub seconds_since_death: Option<f64>,
    /// A Wraith King with Reincarnation is on our team (−10% respawn aura).
    pub wk_reincarnation_ally: Option<bool>,
    /// Living teammates who could defend without you (0 = you're the last hope).
    pub allies_alive: Option<u32>,
    /// Whether enemies are actively pushing our high ground / throne (from CV).
    pub base_under_threat: Option<bool>,
    /// Estimated seconds until the throne falls if undefended (from CV). None →
    /// threat timing unknown.
    pub seconds_to_base_fall: Option<f64>,
}

impl DeathContext {
    /// Build a death context from the current GSI tick. GSI does not provide the
    /// game mode or live base/ally threat facts used by the table-based verdict,
    /// so those values remain unknown instead of defaulting to normal mode or a
    /// safe base. The live countdown and buyback cost are kept when present.
    pub fn from_tick(tick: &crate::gsi::GameTick) -> Self {
        DeathContext {
            level: (tick.level > 0).then_some(tick.level as u32),
            turbo: None,
            gold: tick.gold.max(0) as u32,
            buyback_cost: (tick.buyback_cost > 0).then_some(tick.buyback_cost as u32),
            respawn_remaining: (!tick.alive && tick.respawn_seconds > 0)
                .then_some(tick.respawn_seconds as f64),
            seconds_since_death: None,
            wk_reincarnation_ally: None,
            allies_alive: None,
            base_under_threat: None,
            seconds_to_base_fall: None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
pub enum Urgency {
    /// The available facts do not support a buyback verdict.
    Unknown,
    /// No need to buy back.
    None,
    /// Buyback is a reasonable option.
    Consider,
    /// Buy back now — base falls before you respawn and no one else can defend.
    Strong,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct ReviveAdvice {
    /// `None` means the evidence is insufficient for either recommendation.
    pub recommend_buyback: Option<bool>,
    pub urgency: Urgency,
    /// Current gold from the validated GSI tick.
    pub gold: u32,
    /// `None` when GSI did not expose a positive buyback cost.
    pub buyback_cost: Option<u32>,
    /// Seconds until you respawn naturally (no buyback), if known from GSI or
    /// from a fully specified mode/timestamp/aura context.
    pub natural_respawn_remaining: Option<f64>,
    /// Some(true/false) when buyback cost is known; None when unknown.
    pub affordable: Option<bool>,
    /// Your NEXT respawn time if you buy back now (base + penalty).
    pub next_respawn_if_buyback: Option<f64>,
    /// Short deterministic Thai reason — the SLM layer expands this into persona voice.
    pub reason: String,
}

/// Seconds until natural respawn, preferring live GSI. The config table requires
/// an identified mode, elapsed time, and known Wraith King aura status.
fn natural_respawn(ctx: &DeathContext) -> Option<f64> {
    if let Some(live) = ctx.respawn_remaining {
        return (live.is_finite() && live >= 0.0).then_some(live);
    }
    let level = ctx.level?;
    let turbo = ctx.turbo?;
    let elapsed = ctx.seconds_since_death?;
    if !elapsed.is_finite() || elapsed < 0.0 {
        return None;
    }
    let wk_reincarnation_ally = ctx.wk_reincarnation_ally?;
    let base = if wk_reincarnation_ally {
        respawn::respawn_with_wk_aura(level, turbo)
    } else {
        respawn::respawn_seconds(level, turbo)
    };
    Some((base - elapsed).max(0.0))
}

/// Compute the buyback verdict. Pure function — no I/O, fully testable.
pub fn advise_buyback(ctx: &DeathContext) -> ReviveAdvice {
    let natural = natural_respawn(ctx);
    let affordable = ctx.buyback_cost.map(|c| ctx.gold >= c);
    let next_if_buyback = match (ctx.level, ctx.turbo, ctx.wk_reincarnation_ally) {
        (Some(level), Some(turbo), Some(false)) => {
            Some(respawn::next_respawn_after_buyback(level, turbo))
        }
        _ => None,
    };
    let too_late = match (ctx.seconds_to_base_fall, natural) {
        (Some(seconds), Some(respawn)) if seconds.is_finite() && seconds >= 0.0 => {
            Some(seconds < respawn)
        }
        _ => None,
    };

    // A known-safe base is enough to say buyback is unnecessary. Under threat,
    // every field that changes the decision or urgency must be known.
    let (recommend, urgency) = match ctx.base_under_threat {
        Some(false) => (Some(false), Urgency::None),
        Some(true) => {
            match (too_late, affordable, ctx.allies_alive) {
                (Some(false), _, _) => (Some(false), Urgency::None),
                (Some(true), Some(true), Some(0)) => (Some(true), Urgency::Strong),
                (Some(true), Some(true), Some(_)) => (Some(true), Urgency::Consider),
                (Some(true), Some(false), _) => (Some(false), Urgency::None),
                _ => (None, Urgency::Unknown),
            }
        }
        None => (None, Urgency::Unknown),
    };

    let reason = build_reason(ctx, natural, too_late, affordable, recommend, urgency);

    ReviveAdvice {
        recommend_buyback: recommend,
        urgency,
        gold: ctx.gold,
        buyback_cost: ctx.buyback_cost,
        natural_respawn_remaining: natural,
        affordable,
        next_respawn_if_buyback: next_if_buyback,
        reason,
    }
}

fn build_reason(
    ctx: &DeathContext,
    natural: Option<f64>,
    too_late: Option<bool>,
    affordable: Option<bool>,
    recommend: Option<bool>,
    urgency: Urgency,
) -> String {
    let timer = natural
        .map(|seconds| format!("เกิดเองใน {:.0}s", seconds.max(0.0)))
        .unwrap_or_else(|| "เวลาเกิดยังไม่ทราบ".to_string());
    let cost = match (ctx.buyback_cost, affordable) {
        (Some(cost), Some(true)) => format!("ทอง {} / ค่า buyback {} (พอซื้อ)", ctx.gold, cost),
        (Some(cost), Some(false)) => format!("ทอง {} / ค่า buyback {} (ไม่พอซื้อ)", ctx.gold, cost),
        (Some(cost), None) => format!("ทอง {} / ค่า buyback {}", ctx.gold, cost),
        (None, _) => format!("ทอง {} / ค่า buyback ยังไม่ทราบ", ctx.gold),
    };

    match (recommend, urgency, ctx.base_under_threat) {
        (None, Urgency::Unknown, _) => format!("ข้อมูลยังไม่พอสรุป buyback · {timer} · {cost}"),
        (Some(false), Urgency::None, Some(false)) => {
            format!("ไม่พบภัยฐานจากข้อมูลที่ยืนยันได้ จึงไม่แนะนำซื้อเกิด · {timer} · {cost}")
        }
        (Some(false), Urgency::None, Some(true))
            if too_late == Some(true) && affordable == Some(false) =>
        {
            format!("ค่า buyback สูงกว่าทองที่มี · {timer} · {cost}")
        }
        (Some(false), Urgency::None, Some(true)) if too_late == Some(false) => {
            format!("เกิดเองทันตามเวลาที่ทราบ จึงไม่แนะนำซื้อเกิด · {timer} · {cost}")
        }
        (Some(true), Urgency::Strong, _) => {
            format!("ภัยฐานมาก่อนเวลาเกิดและเพื่อนไม่เหลือคนที่ยังมีชีวิต · {timer} · {cost}")
        }
        (Some(true), Urgency::Consider, _) => {
            let allies = ctx.allies_alive.unwrap_or_default();
            format!("ภัยฐานมาก่อนเวลาเกิด มีเพื่อนยังมีชีวิต {allies} คน · {timer} · {cost}")
        }
        _ => format!("ข้อมูลยังไม่พอสรุป buyback · {timer} · {cost}"),
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
    let action = match advice.recommend_buyback {
        Some(true) => "แนะนำให้ซื้อเกิด (buyback)",
        Some(false) => "ไม่แนะนำให้ซื้อเกิด",
        None => "ข้อมูลยังไม่พอสรุป buyback",
    };
    let timer = advice
        .natural_respawn_remaining
        .map(|seconds| format!("รอเกิดอีก {:.0} วินาที", seconds.max(0.0)))
        .unwrap_or_else(|| "ยังไม่ทราบเวลาเกิด".to_string());
    format!(
        "คุณคือ Maiden ที่ปรึกษา Dota 2 บุคลิก Crystal Maiden — อ่อนโยน ฉลาด ไม่ตำหนิผู้เล่น \
         มี humor เรื่อง Nerf CM ได้ในจังหวะปลอดภัย. ผู้เล่น ({hero}) เพิ่งตาย: {timer}. \
         การตัดสินใจ: {action}. เหตุผล: {reason}. \
         พูดเป็นไทยสั้น ๆ 1-2 ประโยค. ห้ามแนะนำการซื้อเกิดเมื่อ verdict ยังสรุปไม่ได้ \
         และห้ามแต่งเหตุการณ์ที่ไม่รู้.",
        hero = hero,
        timer = timer,
        action = action,
        reason = advice.reason,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn base() -> DeathContext {
        DeathContext {
            level: Some(14),
            turbo: Some(false),
            gold: 2000,
            buyback_cost: Some(1500),
            respawn_remaining: Some(48.0),
            seconds_since_death: Some(0.0),
            wk_reincarnation_ally: Some(false),
            allies_alive: Some(4),
            base_under_threat: Some(false),
            seconds_to_base_fall: None,
        }
    }

    #[test]
    fn safe_when_no_threat() {
        let a = advise_buyback(&base());
        assert_eq!(a.recommend_buyback, Some(false));
        assert_eq!(a.urgency, Urgency::None);
        assert!(a.reason.contains("ไม่พบภัยฐาน"));
    }

    #[test]
    fn strong_when_base_falls_and_no_defenders() {
        let ctx = DeathContext {
            base_under_threat: Some(true),
            seconds_to_base_fall: Some(20.0), // < respawn(14)=48
            allies_alive: Some(0),
            ..base()
        };
        let a = advise_buyback(&ctx);
        assert_eq!(a.recommend_buyback, Some(true));
        assert_eq!(a.urgency, Urgency::Strong);
        assert!(a.reason.contains("ภัยฐานมาก่อนเวลาเกิด"));
    }

    #[test]
    fn consider_when_teammates_still_alive() {
        let ctx = DeathContext {
            base_under_threat: Some(true),
            seconds_to_base_fall: Some(20.0),
            allies_alive: Some(2),
            ..base()
        };
        let a = advise_buyback(&ctx);
        assert_eq!(a.recommend_buyback, Some(true));
        assert_eq!(a.urgency, Urgency::Consider);
    }

    #[test]
    fn no_buyback_when_respawn_arrives_in_time() {
        let ctx = DeathContext {
            base_under_threat: Some(true),
            seconds_to_base_fall: Some(90.0), // > respawn(14)=48 → make it back
            allies_alive: Some(0),
            ..base()
        };
        let a = advise_buyback(&ctx);
        assert_eq!(a.recommend_buyback, Some(false));
        assert!(a.reason.contains("เกิดเองทันตามเวลาที่ทราบ"));
    }

    #[test]
    fn cant_afford_flags_but_does_not_recommend() {
        let ctx = DeathContext {
            base_under_threat: Some(true),
            seconds_to_base_fall: Some(20.0),
            gold: 100,
            buyback_cost: Some(1500),
            ..base()
        };
        let a = advise_buyback(&ctx);
        assert_eq!(a.recommend_buyback, Some(false));
        assert_eq!(a.affordable, Some(false));
        assert!(a.reason.contains("ไม่พอซื้อ"));
    }

    #[test]
    fn prefers_live_gsi_respawn_over_table() {
        let ctx = DeathContext {
            respawn_remaining: Some(7.0),
            ..base()
        };
        let a = advise_buyback(&ctx);
        assert!((a.natural_respawn_remaining.unwrap() - 7.0).abs() < 1e-9);
    }

    #[test]
    fn wk_aura_shortens_table_respawn() {
        let no_wk = advise_buyback(&DeathContext {
            respawn_remaining: None,
            ..base()
        })
        .natural_respawn_remaining
        .unwrap();
        let with_wk = advise_buyback(&DeathContext {
            respawn_remaining: None,
            wk_reincarnation_ally: Some(true),
            ..base()
        })
        .natural_respawn_remaining;
        let with_wk = with_wk.unwrap();
        assert!(
            with_wk < no_wk,
            "WK aura should reduce respawn: {with_wk} !< {no_wk}"
        );
    }

    #[test]
    fn elapsed_time_reduces_remaining() {
        let ctx = DeathContext {
            respawn_remaining: None,
            seconds_since_death: Some(40.0),
            ..base()
        };
        let a = advise_buyback(&ctx);
        // respawn(14)=48, minus 40 elapsed = 8
        assert!((a.natural_respawn_remaining.unwrap() - 8.0).abs() < 1e-9);
    }

    #[test]
    fn narrate_prompt_embeds_verdict_and_hero() {
        let ctx = DeathContext {
            base_under_threat: Some(true),
            seconds_to_base_fall: Some(20.0),
            allies_alive: Some(0),
            ..base()
        };
        let advice = advise_buyback(&ctx);
        let tick = crate::gsi::GameTick {
            hero: "npc_dota_hero_crystal_maiden".into(),
            ..Default::default()
        };
        let p = narrate_prompt(&advice, &tick);
        assert!(
            p.contains("crystal maiden"),
            "prompt should name the hero: {p}"
        );
        assert!(
            p.contains("ซื้อเกิด"),
            "prompt should carry the buyback verdict: {p}"
        );
        assert!(
            p.contains(&advice.reason),
            "prompt should include the deterministic reason"
        );
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
        assert_eq!(ctx.level, Some(16));
        assert_eq!(ctx.gold, 1800);
        assert_eq!(ctx.buyback_cost, Some(1500));
        assert_eq!(ctx.respawn_remaining, Some(30.0));
        assert_eq!(ctx.turbo, None);
        assert_eq!(ctx.allies_alive, None);
        assert_eq!(ctx.base_under_threat, None);
        // Missing GSI fields → None (alive hero: no buyback/respawn exposed).
        let empty = DeathContext::from_tick(&crate::gsi::GameTick::default());
        assert_eq!(empty.buyback_cost, None);
        assert_eq!(empty.respawn_remaining, None);
    }

    #[test]
    fn unknown_buyback_cost_degrades_gracefully() {
        let ctx = DeathContext {
            base_under_threat: Some(true),
            seconds_to_base_fall: Some(20.0),
            buyback_cost: None,
            ..base()
        };
        let a = advise_buyback(&ctx);
        assert_eq!(a.recommend_buyback, None);
        assert_eq!(a.urgency, Urgency::Unknown);
        assert_eq!(a.affordable, None);
    }
}

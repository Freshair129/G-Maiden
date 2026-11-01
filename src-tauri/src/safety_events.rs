//! G-Signal HP eligibility stays native even when no announcer package is equipped.
#[path = "safety_events_core.rs"]
mod core;
pub(crate) use core::Settings;
use std::sync::{Mutex, OnceLock};
use std::time::Instant;

pub(crate) fn observe_for_session(
    tick: &crate::gsi::GameTick,
    session: &crate::runtime::MatchSessionSnapshot,
) -> Option<&'static str> {
    static DETECTOR: OnceLock<Mutex<core::Detector>> = OnceLock::new();
    static START: OnceLock<Instant> = OnceLock::new();
    let now = START
        .get_or_init(Instant::now)
        .elapsed()
        .as_millis()
        .min(u64::MAX as u128) as u64;
    DETECTOR.get_or_init(Mutex::default).lock().ok()?.observe(
        core::Observation {
            epoch: session.session_epoch,
            owner: &tick.steamid,
            live: tick.in_game
                && session.session_lifecycle == Some(crate::runtime::MatchLifecycle::Live),
            verified: tick.local_player_verified,
            alive: tick.alive,
            hp: tick.hp_percent,
            kills: tick.kills,
        },
        crate::runtime::hp_alert_settings(),
        now,
    )
}

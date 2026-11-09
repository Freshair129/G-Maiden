//! Generated event metadata and announcer tuning. No parsing in release.

// Version/non-firing metadata is also consumed by contract tests; it is not a new dispatcher.
#[allow(dead_code)]
mod generated {
    include!(concat!(env!("OUT_DIR"), "/events_gen.rs"));
}
pub(crate) use generated::{priority, EVENTS};
#[cfg(test)]
pub(crate) use generated::{NON_FIRING_EVENTS, TAXONOMY_VERSION};

#[derive(Clone, Copy)]
pub(crate) struct AnnouncerParams<'a> {
    pub multikill_window_s: i64,
    pub hp_low_percent: i64,
    pub mana_low_percent: i64,
    pub level_up_milestones: &'a [i64],
}

const DEFAULT_PARAMS: AnnouncerParams<'static> = AnnouncerParams {
    multikill_window_s: generated::MULTIKILL_WINDOW_S,
    hp_low_percent: generated::HP_LOW,
    mana_low_percent: generated::MANA_LOW,
    level_up_milestones: generated::LEVEL_UP_MILESTONES,
};

pub(crate) fn announcer_params() -> AnnouncerParams<'static> {
    #[cfg(debug_assertions)]
    if let Some(params) = debug_override::params() {
        return params;
    }
    DEFAULT_PARAMS
}

#[cfg(debug_assertions)]
pub(crate) use debug_override::initialize;

#[cfg(any(debug_assertions, test))]
#[allow(dead_code)]
#[path = "../events/schema.rs"]
pub(crate) mod schema;

#[cfg(debug_assertions)]
mod debug_override {
    use super::{schema, AnnouncerParams, DEFAULT_PARAMS};
    use std::io::Read;
    use std::sync::OnceLock;

    static OVERRIDE: OnceLock<Option<schema::Params>> = OnceLock::new();

    pub(super) fn params() -> Option<AnnouncerParams<'static>> {
        let a = &OVERRIDE.get()?.as_ref()?.announcer;
        Some(AnnouncerParams {
            multikill_window_s: a.multikill_window_s.value,
            hp_low_percent: a.hp_low_percent.value,
            mana_low_percent: a.mana_low_percent.value,
            level_up_milestones: &a.level_up_milestones,
        })
    }

    // Called before GSI/capture startup. Accessors never read the environment or filesystem.
    pub(crate) fn initialize() {
        OVERRIDE.get_or_init(|| {
            let path = std::env::var_os("GMAIDEN_EVENTS_OVERRIDE")?;
            let load = || -> Result<schema::Params, String> {
                let mut source = String::new();
                std::fs::File::open(path)
                    .map_err(|e| e.to_string())?
                    .take(65_537)
                    .read_to_string(&mut source)
                    .map_err(|e| e.to_string())?;
                if source.len() > 65_536 {
                    return Err("params override exceeds 64 KiB".into());
                }
                let bounded = |value, min, max| schema::Bounded { value, min, max };
                let defaults = schema::Params {
                    announcer: schema::Announcer {
                        multikill_window_s: bounded(DEFAULT_PARAMS.multikill_window_s, 5, 60),
                        hp_low_percent: bounded(DEFAULT_PARAMS.hp_low_percent, 5, 50),
                        mana_low_percent: bounded(DEFAULT_PARAMS.mana_low_percent, 5, 50),
                        level_up_milestones: DEFAULT_PARAMS.level_up_milestones.to_vec(),
                    },
                };
                schema::override_params(&defaults, &source)
            };
            match load() {
                Ok(params) => Some(params),
                Err(error) => {
                    eprintln!("[G-Events] rejected debug params override; using generated defaults: {error}");
                    None
                }
            }
        });
    }
}

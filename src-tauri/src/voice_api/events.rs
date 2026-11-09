//! Event + group contract for the announcer/voice system — pure data, no I/O.
//! Split out of the original `voice_api.rs` monolith (facade refactor, no
//! behavior change).

#[derive(Clone, Copy)]
pub(crate) struct GroupDef {
    pub(crate) id: &'static str,
    pub(crate) label: &'static str,
    pub(crate) accent: &'static str,
}

#[derive(Clone, Copy)]
pub(crate) struct EventDef {
    pub(crate) id: &'static str,
    pub(crate) group: &'static str,
    pub(crate) label: &'static str,
    pub(crate) subtitle: &'static str,
    pub(crate) thai: &'static str,
}

pub(crate) const GROUPS: &[GroupDef] = &[
    GroupDef {
        id: "warning",
        label: "แจ้งเตือน",
        accent: "#ff6370",
    },
    GroupDef {
        id: "combat",
        label: "คิล / มัลติคิล",
        accent: "#ffe24a",
    },
    GroupDef {
        id: "streak",
        label: "สตรีค",
        accent: "#ff9b45",
    },
    GroupDef {
        id: "state",
        label: "สถานะ",
        accent: "#66f2b5",
    },
    GroupDef {
        id: "advisor",
        label: "คำแนะนำ",
        accent: "#8fd3ff",
    },
];

/// Generated from events/g-events.toml; EventDef remains the UI contract.
pub(crate) use crate::events::EVENTS;

pub fn event_ids() -> impl Iterator<Item = &'static str> {
    EVENTS.iter().map(|event| event.id)
}

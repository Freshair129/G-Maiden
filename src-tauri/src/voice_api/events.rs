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

/// Mirrors the canonical event contract vendored at `schemas/gmaiden-events.json`
/// (originally authored in the sibling `G-Suite` repo) — every non-`"none"`
/// entry in that schema's `x-events` must have a matching id here, and vice
/// versa. `mod tests::events_match_schema_contract` enforces this both ways so
/// drift between the schema and this list fails `cargo test` instead of
/// shipping a silently-uncovered event.
pub(crate) const EVENTS: &[EventDef] = &[
    EventDef {
        id: "danger",
        group: "warning",
        label: "Danger",
        subtitle: "High danger warning",
        thai: "อันตราย",
    },
    EventDef {
        id: "gank",
        group: "warning",
        label: "Gank",
        subtitle: "Incoming gank",
        thai: "แก๊งค์",
    },
    EventDef {
        id: "revision",
        group: "warning",
        label: "Revision",
        subtitle: "Belief revision",
        thai: "ยกเลิกเตือน",
    },
    EventDef {
        id: "hpLow",
        group: "warning",
        label: "HP Low",
        subtitle: "Health is low",
        thai: "เลือดต่ำ",
    },
    EventDef {
        id: "manaLow",
        group: "warning",
        label: "Mana Low",
        subtitle: "Mana is low",
        thai: "มานาต่ำ",
    },
    EventDef {
        id: "first_blood",
        group: "combat",
        label: "First Blood",
        subtitle: "First blood",
        thai: "เลือดแรก",
    },
    EventDef {
        id: "kill",
        group: "combat",
        label: "Kill",
        subtitle: "Hero kill",
        thai: "คิล",
    },
    EventDef {
        id: "double_kill",
        group: "combat",
        label: "Double Kill",
        subtitle: "Double kill",
        thai: "ดับเบิลคิล",
    },
    EventDef {
        id: "triple_kill",
        group: "combat",
        label: "Triple Kill",
        subtitle: "Triple kill",
        thai: "ทริปเปิลคิล",
    },
    EventDef {
        id: "ultra_kill",
        group: "combat",
        label: "Ultra Kill",
        subtitle: "Ultra kill",
        thai: "อัลตร้า",
    },
    EventDef {
        id: "rampage",
        group: "combat",
        label: "Rampage",
        subtitle: "Rampage",
        thai: "แรมเพจ",
    },
    EventDef {
        id: "killing_spree",
        group: "streak",
        label: "Killing Spree",
        subtitle: "Killing spree",
        thai: "สปรี",
    },
    EventDef {
        id: "dominating",
        group: "streak",
        label: "Dominating",
        subtitle: "Dominating",
        thai: "ครอบครอง",
    },
    EventDef {
        id: "mega_kill",
        group: "streak",
        label: "Mega Kill",
        subtitle: "Mega kill",
        thai: "เมก้าคิล",
    },
    EventDef {
        id: "unstoppable",
        group: "streak",
        label: "Unstoppable",
        subtitle: "Unstoppable",
        thai: "หยุดไม่ได้",
    },
    EventDef {
        id: "wicked_sick",
        group: "streak",
        label: "Wicked Sick",
        subtitle: "Wicked sick",
        thai: "โหดจัด",
    },
    EventDef {
        id: "monster_kill",
        group: "streak",
        label: "Monster Kill",
        subtitle: "Monster kill",
        thai: "มอนสเตอร์คิล",
    },
    EventDef {
        id: "godlike",
        group: "streak",
        label: "Godlike",
        subtitle: "Godlike",
        thai: "เทพเจ้า",
    },
    EventDef {
        id: "beyond_godlike",
        group: "streak",
        label: "Beyond Godlike",
        subtitle: "Beyond godlike",
        thai: "เหนือเทพเจ้า",
    },
    EventDef {
        id: "levelUp",
        group: "state",
        label: "Level Up",
        subtitle: "Level up",
        thai: "เลเวลอัพ",
    },
    EventDef {
        id: "match_start",
        group: "state",
        label: "Match Start",
        subtitle: "Match start",
        thai: "เริ่มเกม",
    },
    EventDef {
        id: "death",
        group: "state",
        label: "Death",
        subtitle: "Hero died",
        thai: "ตาย",
    },
    EventDef {
        id: "respawn",
        group: "state",
        label: "Respawn",
        subtitle: "Respawn",
        thai: "เกิดใหม่",
    },
    EventDef {
        id: "advice",
        group: "advisor",
        label: "Advice",
        subtitle: "Advisor line",
        thai: "คำแนะนำ",
    },
];

pub fn event_ids() -> impl Iterator<Item = &'static str> {
    EVENTS.iter().map(|event| event.id)
}

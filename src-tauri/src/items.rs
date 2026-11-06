//! Net-worth derivation from GSI's `items` block.
//!
//! Dota 2's GSI sends `player.net_worth = 0` in player mode (the value is only
//! populated in spectator mode), so the overlay showed "—" or nothing. To get a
//! real own-NW number for the player we parse the items the GSI DOES send
//! (`items.slot0..slot8` + `stash0..stash5` + `neutral0` + `teleport0`), look
//! each up in a cost table snapshotted from OpenDota's `/constants/items`
//! endpoint, and add the gold the player is carrying.
//!
//! GSI sends only the item *name* — no cost field — so the table is mandatory.
//! It's 6 KB (294 items with cost > 0); snapshotted once and regenerated when
//! the meta shifts (see `tools/voice-gen/` style; future tool will do this).
//! Names from GSI carry the `item_` prefix (`item_blink`) which we strip before
//! the lookup since OpenDota's keys don't.
//!
//! When the GSI happens to include a non-zero `net_worth` (spectator clients,
//! future patches), the caller should prefer that — this module is the
//! fallback path. Empty/recipe slots show up as `"empty"` or missing names and
//! contribute 0.

use serde_json::Value;
use std::collections::HashMap;
use std::sync::OnceLock;

/// Lazily-parsed `name → cost` map, baked into the binary at compile time.
fn table() -> &'static HashMap<String, i64> {
    static T: OnceLock<HashMap<String, i64>> = OnceLock::new();
    T.get_or_init(|| {
        let raw = include_str!("../data/item-prices.json");
        serde_json::from_str::<HashMap<String, i64>>(raw).unwrap_or_default()
    })
}

/// Cost of one item by its bare or `item_`-prefixed GSI name. Empty/unknown
/// names return 0 so the caller can sum without conditionals.
pub fn item_cost(name: &str) -> i64 {
    let key = name
        .strip_prefix("item_")
        .unwrap_or(name)
        .to_ascii_lowercase();
    if key.is_empty() || key == "empty" {
        return 0;
    }
    *table().get(&key).unwrap_or(&0)
}

/// Walk every slot in the GSI `items` block (inventory + backpack + stash +
/// neutral + tp scroll) and sum the costs. Caller adds the carried gold to get
/// net worth.
///
/// Iterates ALL keys under `items` rather than enumerating slot names so the
/// derivation survives future GSI additions (e.g. extra backpack slots, ward
/// charges) without code changes — anything with a `name` field counts.
pub fn item_cost_sum(items_block: &Value) -> i64 {
    let Some(obj) = items_block.as_object() else {
        return 0;
    };
    let mut total = 0;
    for (_slot, item) in obj.iter() {
        if let Some(name) = item.get("name").and_then(|n| n.as_str()) {
            total += item_cost(name);
        }
    }
    total
}

/// Net worth = gold + Σ item costs. Used when GSI's own `net_worth` is 0 (the
/// player-mode case), so the overlay can show a real number.
pub fn net_worth_from(items_block: &Value, gold: i64) -> i64 {
    gold + item_cost_sum(items_block)
}

/// Collect the internal item names present in the GSI `items` block, skipping
/// empty slots. This describes ownership, including backpack/stash, and must
/// not be used as the currently available combat loadout.
pub fn item_names_from(items_block: &Value) -> Vec<String> {
    let Some(obj) = items_block.as_object() else {
        return Vec::new();
    };
    obj.values()
        .filter_map(|item| item.get("name").and_then(|n| n.as_str()))
        .filter(|n| !n.is_empty() && *n != "empty")
        .map(|n| n.to_string())
        .collect()
}

/// Resolve equipped combat contributions separately from ownership/net worth.
/// Only main inventory and the neutral slot confer combat bonuses. Backpack,
/// stash, TP and unrecognized slots are excluded. Item actives require both an
/// explicit zero cooldown and `can_cast: true`; unknown readiness adds no active
/// burst. Cooldown does not remove an equipped item's passive attack bonus.
pub fn combat_loadout_from(items_block: &Value) -> Vec<crate::damage::LoadoutItem> {
    let Some(obj) = items_block.as_object() else {
        return Vec::new();
    };
    obj.iter()
        .filter(|(slot, _)| {
            matches!(
                slot.as_str(),
                "slot0" | "slot1" | "slot2" | "slot3" | "slot4" | "slot5" | "neutral0"
            )
        })
        .filter_map(|(_, item)| {
            let name = item.get("name")?.as_str()?;
            let mut contribution = crate::damage::lookup_item(name)?.clone();
            let active_ready = item.get("cooldown").and_then(Value::as_f64) == Some(0.0)
                && item.get("can_cast").and_then(Value::as_bool) == Some(true);
            if !active_ready {
                contribution.active_burst = 0.0;
            }
            Some(contribution)
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn known_items_look_up() {
        // Hand-verified against OpenDota's snapshot at the time of capture.
        assert_eq!(item_cost("item_blink"), 2250);
        assert_eq!(item_cost("item_black_king_bar"), 4050);
        assert_eq!(item_cost("blink"), 2250); // bare name also works
        assert_eq!(item_cost("BLINK"), 2250); // case-insensitive
    }

    #[test]
    fn unknown_and_empty_return_zero() {
        assert_eq!(item_cost("item_emergency_pizza_8k"), 0);
        assert_eq!(item_cost("empty"), 0);
        assert_eq!(item_cost(""), 0);
    }

    #[test]
    fn sum_a_realistic_inventory() {
        // Mid-game core: blink + BKB + tps + tangos in main slots, midas + null
        // in backpack/stash, a recipe placeholder (empty) — exercises every
        // branch of the iterator.
        let items = json!({
            "slot0": { "name": "item_blink" },               // 2250
            "slot1": { "name": "item_black_king_bar" },      // 4050
            "slot2": { "name": "item_tpscroll" },            // 100
            "slot3": { "name": "item_tango" },               // 90
            "slot4": { "name": "empty" },                    // 0
            "slot5": { "name": "item_null_talisman" },       // 505 (snapshot)
            "stash0": { "name": "item_hand_of_midas" },      // 2200
            "stash1": { "name": "empty" },                   // 0
            "neutral0": { "name": "item_keen_optic" },       // unknown to table → 0
            "teleport0": { "name": "item_tpscroll" },        // 100
        });
        // Sum the known costs (the neutral is fine at 0; it's correct to miss
        // neutrals the OpenDota constants didn't list yet).
        let expected = 2250 + 4050 + 100 + 90 + 505 + 2200 + 100;
        assert_eq!(item_cost_sum(&items), expected);
        // net_worth includes carried gold.
        assert_eq!(net_worth_from(&items, 1234), expected + 1234);
    }

    #[test]
    fn item_names_skips_empty_slots() {
        let items = json!({
            "slot0": { "name": "item_blink" },
            "slot1": { "name": "empty" },
            "slot2": { "name": "" },
            "stash0": { "name": "item_dagon" },
        });
        let mut names = item_names_from(&items);
        names.sort();
        assert_eq!(
            names,
            vec!["item_blink".to_string(), "item_dagon".to_string()]
        );
        assert!(item_names_from(&Value::Null).is_empty());
    }

    #[test]
    fn combat_loadout_excludes_backpack_stash_and_unknown_slots_without_losing_ownership() {
        let items = json!({
            "slot0": {"name": "item_demon_edge"},
            "slot6": {"name": "item_dagon_5", "cooldown": 0, "can_cast": true},
            "stash0": {"name": "item_dagon_5", "cooldown": 0, "can_cast": true},
            "future0": {"name": "item_dagon_5", "cooldown": 0, "can_cast": true},
            "teleport0": {"name": "item_dagon_5", "cooldown": 0, "can_cast": true}
        });
        let combat = combat_loadout_from(&items);
        assert_eq!(combat.len(), 1);
        assert_eq!(combat[0].name, "item_demon_edge");
        assert_eq!(item_names_from(&items).len(), 5);
        assert_eq!(net_worth_from(&items, 100), 2200 + 4 * 7650 + 100);
    }

    #[test]
    fn combat_actives_require_explicit_ready_and_castable_state() {
        for unavailable in [
            json!({"name":"item_dagon_5"}),
            json!({"name":"item_dagon_5", "cooldown":0}),
            json!({"name":"item_dagon_5", "cooldown":1, "can_cast":true}),
            json!({"name":"item_dagon_5", "cooldown":0, "can_cast":false}),
            json!({"name":"item_dagon_5", "cooldown":-1, "can_cast":true}),
            json!({"name":"item_dagon_5", "cooldown":"0", "can_cast":true}),
        ] {
            let combat = combat_loadout_from(&json!({"slot0":unavailable}));
            assert_eq!(combat[0].active_burst, 0.0);
        }
        let combat = combat_loadout_from(&json!({
            "slot5":{"name":"item_dagon_5", "cooldown":0, "can_cast":true},
            "neutral0":{"name":"item_demon_edge"}
        }));
        assert_eq!(combat.len(), 2);
        assert!(combat.iter().any(|item| item.active_burst == 800.0));
    }

    #[test]
    fn combat_preserves_equipped_passive_damage_while_active_is_unavailable() {
        let combat = combat_loadout_from(&json!({
            "slot0":{"name":"item_demon_edge", "cooldown":8, "can_cast":false}
        }));
        assert_eq!(combat[0].bonus_attack_damage, 46.0);
    }

    #[test]
    fn self_burst_uses_only_equipped_ready_contributions() {
        let hero = "npc_dota_hero_crystal_maiden";
        let burst = |items: Value| {
            crate::damage::self_burst_with_loadout(hero, 6, &combat_loadout_from(&items))
                .unwrap()
                .total_burst
        };
        let bare = burst(json!({}));
        let stashed =
            burst(json!({"stash0":{"name":"item_dagon_5", "cooldown":0, "can_cast":true}}));
        let cooling =
            burst(json!({"slot0":{"name":"item_dagon_5", "cooldown":1, "can_cast":true}}));
        let ready = burst(json!({"slot0":{"name":"item_dagon_5", "cooldown":0, "can_cast":true}}));
        assert_eq!(stashed, bare);
        assert_eq!(cooling, bare);
        assert!((ready - bare - 600.0).abs() < 0.001);
        assert!(
            burst(json!({"slot0":{"name":"item_demon_edge", "cooldown":1, "can_cast":false}}))
                > bare
        );
    }

    #[test]
    fn empty_or_missing_block_is_zero() {
        assert_eq!(item_cost_sum(&Value::Null), 0);
        assert_eq!(item_cost_sum(&json!({})), 0);
        assert_eq!(net_worth_from(&Value::Null, 500), 500);
    }

    #[test]
    fn table_loaded_and_nontrivial() {
        // Sanity: the embedded JSON parsed and has hundreds of entries.
        assert!(
            table().len() > 100,
            "table size {} — embed file broken?",
            table().len()
        );
    }
}

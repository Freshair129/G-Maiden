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
    let key = name.strip_prefix("item_").unwrap_or(name).to_ascii_lowercase();
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
    let Some(obj) = items_block.as_object() else { return 0 };
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
    fn empty_or_missing_block_is_zero() {
        assert_eq!(item_cost_sum(&Value::Null), 0);
        assert_eq!(item_cost_sum(&json!({})), 0);
        assert_eq!(net_worth_from(&Value::Null, 500), 500);
    }

    #[test]
    fn table_loaded_and_nontrivial() {
        // Sanity: the embedded JSON parsed and has hundreds of entries.
        assert!(table().len() > 100, "table size {} — embed file broken?", table().len());
    }
}

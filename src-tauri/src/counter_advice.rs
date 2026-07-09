//! G5.2 — Counter-item advice engine.
//! Reads meta dataset (item_counters.json) and maps enemy heroes to recommended items.

use serde_json::Value;

const COUNTERS_JSON: &str = include_str!("../data/item_counters.json");

/// Given a list of enemy hero names (raw GSI style, e.g. "phantom_assassin"),
/// returns a Thai-language advice string, e.g.
/// "counter: Phantom Assassin → MKB, Blade Mail | Lina → BKB, Pipe"
pub fn counter_advice_text(enemies: &[String]) -> String {
    let data: Value = serde_json::from_str(COUNTERS_JSON).unwrap_or(Value::Null);
    let hero_map = data.get("hero_counters");

    let mut parts: Vec<String> = Vec::new();
    for enemy in enemies {
        let key = strip_hero_prefix(enemy);
        if let Some(entry) = hero_map.and_then(|m| m.get(key)) {
            let items = entry
                .get("buy")
                .and_then(|b| b.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str())
                        .map(item_thai)
                        .collect::<Vec<_>>()
                        .join(", ")
                })
                .unwrap_or_default();
            if !items.is_empty() {
                let display = capitalize_hero(key);
                parts.push(format!("{display} → {items}"));
            }
        }
    }

    if parts.is_empty() {
        String::new()
    } else {
        format!("counter: {}", parts.join(" | "))
    }
}

fn strip_hero_prefix(raw: &str) -> &str {
    raw.strip_prefix("npc_dota_hero_").unwrap_or(raw)
}

fn capitalize_hero(key: &str) -> String {
    key.split('_')
        .map(|w| {
            let mut c = w.chars();
            match c.next() {
                None => String::new(),
                Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn item_thai(key: &str) -> &str {
    match key {
        "monkey_king_bar" => "MKB",
        "blade_mail" => "Blade Mail",
        "nullifier" => "Nullifier",
        "force_staff" => "Force Staff",
        "ghost" => "Ghost Scepter",
        "hurricane_pike" => "Hurricane Pike",
        "orchid" => "Orchid",
        "bkb" => "BKB",
        "linkens_sphere" => "Linken",
        "pipe" => "Pipe",
        "hood_of_defiance" => "Hood",
        "aeon_disk" => "Aeon Disk",
        "manta" => "Manta",
        "diffusal_blade" => "Diffusal",
        "silver_edge" => "Silver Edge",
        "desolator" => "Deso",
        "blink" => "Blink",
        "solar_crest" => "Solar Crest",
        "ethereal_blade" => "Ethereal",
        _ => key,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pa_gives_mkb() {
        let result = counter_advice_text(&["phantom_assassin".to_string()]);
        assert!(
            result.contains("MKB"),
            "PA counter must include MKB, got: {result}"
        );
    }

    #[test]
    fn magic_burst_gives_bkb_pipe() {
        let result = counter_advice_text(&["lina".to_string(), "storm_spirit".to_string()]);
        assert!(
            result.contains("BKB"),
            "magic burst must suggest BKB, got: {result}"
        );
        assert!(
            result.contains("Pipe"),
            "magic burst must suggest Pipe, got: {result}"
        );
    }

    #[test]
    fn unknown_hero_returns_empty() {
        let result = counter_advice_text(&["unknown_hero".to_string()]);
        assert!(
            result.is_empty(),
            "unknown hero should give no advice, got: {result}"
        );
    }

    #[test]
    fn strip_npc_prefix() {
        let result = counter_advice_text(&["npc_dota_hero_phantom_assassin".to_string()]);
        assert!(
            result.contains("MKB"),
            "npc_ prefix should be stripped, got: {result}"
        );
    }
}

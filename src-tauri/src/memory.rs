//! G-Memory — local derived player memory from archived G-Log JSONL.
//!
//! This module never performs network I/O. It reads only archived `match-*.jsonl`
//! files, keeps unavailable fields as `None`, and persists a schema-versioned
//! snapshot beside the G-Log directory for fast repeat queries.

use std::cmp::Ordering;
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::log;

const MEMORY_SCHEMA_VERSION: u32 = 1;
const RECENT_HERO_LIMIT: usize = 20;

#[derive(Clone, Debug)]
pub struct MemoryLogSource {
    pub name: String,
    pub modified_ms: u64,
    pub content: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HeroMemory {
    pub hero: String,
    pub play_count: u32,
    pub wins: u32,
    pub win_rate: Option<f64>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeathHotspot {
    pub x: f64,
    pub y: f64,
    pub frequency: u32,
    pub avg_game_time: Option<f64>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeathCause {
    pub cause: String,
    pub count: u32,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MmrPoint {
    pub at_ms: u64,
    pub estimated_mmr: f64,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MemorySourceStatus {
    #[default]
    Empty,
    Partial,
    Complete,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryContext {
    pub schema_version: u32,
    pub source_status: MemorySourceStatus,
    pub source_match_count: u32,
    pub complete_match_count: u32,
    pub favorite_heroes: Vec<HeroMemory>,
    pub recent_heroes: Vec<String>,
    pub death_hotspots: Option<Vec<DeathHotspot>>,
    pub common_death_causes: Option<Vec<DeathCause>>,
    pub mmr_trend: Option<Vec<MmrPoint>>,
    pub avg_gpm: Option<f64>,
    pub avg_xpm: Option<f64>,
    pub aggression_score: Option<f64>,
    pub farming_preference: Option<f64>,
    pub ward_buy_rate: Option<f64>,
    pub unknown_fields: Vec<String>,
}

impl Default for MemoryContext {
    fn default() -> Self {
        Self {
            schema_version: MEMORY_SCHEMA_VERSION,
            source_status: MemorySourceStatus::Empty,
            source_match_count: 0,
            complete_match_count: 0,
            favorite_heroes: Vec::new(),
            recent_heroes: Vec::new(),
            death_hotspots: None,
            common_death_causes: None,
            mmr_trend: None,
            avg_gpm: None,
            avg_xpm: None,
            aggression_score: None,
            farming_preference: None,
            ward_buy_rate: None,
            unknown_fields: Vec::new(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
struct SourceStamp {
    name: String,
    modified_ms: u64,
    size: u64,
}

#[derive(Debug, Serialize, Deserialize)]
struct MemorySnapshot {
    schema_version: u32,
    sources: Vec<SourceStamp>,
    context: MemoryContext,
}

#[derive(Default)]
struct MatchFacts {
    hero: Option<String>,
    final_gpm: Option<f64>,
    final_xpm: Option<f64>,
    win: Option<bool>,
}

#[derive(Default)]
struct HeroAggregate {
    play_count: u32,
    wins: u32,
    outcomes: u32,
}

/// Return the local derived snapshot path. This is beside, not inside, the
/// match-log directory so deleting archived logs remains a separate action.
pub fn memory_path() -> PathBuf {
    log::log_dir()
        .parent()
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."))
        .join("memory.json")
}

/// Derive a memory context from already-read JSONL sources.
///
/// The function is pure apart from parsing input strings, which makes the
/// aggregation contract testable without touching the user's log directory.
pub fn derive_from_sources(sources: &[MemoryLogSource]) -> MemoryContext {
    let mut ordered = sources.to_vec();
    ordered.sort_by(|a, b| {
        b.modified_ms
            .cmp(&a.modified_ms)
            .then_with(|| a.name.cmp(&b.name))
    });

    let facts: Vec<MatchFacts> = ordered.iter().map(parse_match).collect();
    let valid_facts: Vec<&MatchFacts> = facts.iter().filter(|fact| fact.hero.is_some()).collect();

    let mut hero_totals: BTreeMap<String, HeroAggregate> = BTreeMap::new();
    let mut recent_heroes = Vec::new();
    let mut gpm_sum = 0.0;
    let mut gpm_count = 0u32;
    let mut xpm_sum = 0.0;
    let mut xpm_count = 0u32;
    let mut complete_match_count = 0u32;

    for fact in valid_facts.iter().copied() {
        let Some(hero) = fact.hero.as_ref() else {
            continue;
        };
        if recent_heroes.len() < RECENT_HERO_LIMIT {
            recent_heroes.push(hero.clone());
        }

        let aggregate = hero_totals.entry(hero.clone()).or_default();
        aggregate.play_count += 1;
        if let Some(win) = fact.win {
            aggregate.outcomes += 1;
            complete_match_count += 1;
            if win {
                aggregate.wins += 1;
            }
        }
        if let Some(gpm) = fact.final_gpm {
            gpm_sum += gpm;
            gpm_count += 1;
        }
        if let Some(xpm) = fact.final_xpm {
            xpm_sum += xpm;
            xpm_count += 1;
        }
    }

    let mut favorite_heroes: Vec<HeroMemory> = hero_totals
        .into_iter()
        .map(|(hero, aggregate)| HeroMemory {
            hero,
            play_count: aggregate.play_count,
            wins: aggregate.wins,
            win_rate: (aggregate.outcomes > 0)
                .then_some(aggregate.wins as f64 / aggregate.outcomes as f64),
        })
        .collect();
    favorite_heroes.sort_by(|a, b| {
        b.play_count
            .cmp(&a.play_count)
            .then_with(|| match (b.win_rate, a.win_rate) {
                (Some(left), Some(right)) => left.partial_cmp(&right).unwrap_or(Ordering::Equal),
                _ => Ordering::Equal,
            })
            .then_with(|| a.hero.cmp(&b.hero))
    });

    let avg_gpm = (gpm_count > 0).then_some(gpm_sum / gpm_count as f64);
    let avg_xpm = (xpm_count > 0).then_some(xpm_sum / xpm_count as f64);
    let mut unknown_fields = vec![
        "deathHotspots".to_string(),
        "commonDeathCauses".to_string(),
        "mmrTrend".to_string(),
        "aggressionScore".to_string(),
        "farmingPreference".to_string(),
        "wardBuyRate".to_string(),
    ];
    if avg_gpm.is_none() {
        unknown_fields.push("avgGpm".into());
    }
    if avg_xpm.is_none() {
        unknown_fields.push("avgXpm".into());
    }
    if favorite_heroes.iter().any(|hero| hero.win_rate.is_none()) {
        unknown_fields.push("favoriteHeroes.winRate".into());
    }

    let source_status = if valid_facts.is_empty() {
        MemorySourceStatus::Empty
    } else if unknown_fields.is_empty() {
        MemorySourceStatus::Complete
    } else {
        MemorySourceStatus::Partial
    };

    MemoryContext {
        schema_version: MEMORY_SCHEMA_VERSION,
        source_status,
        source_match_count: valid_facts.len() as u32,
        complete_match_count,
        favorite_heroes,
        recent_heroes,
        // G-Log has no player death coordinates, rating, or style events yet.
        // Keep these fields explicitly unknown instead of inferring them.
        death_hotspots: None,
        common_death_causes: None,
        mmr_trend: None,
        avg_gpm,
        avg_xpm,
        aggression_score: None,
        farming_preference: None,
        ward_buy_rate: None,
        unknown_fields,
    }
}

/// Load the current snapshot or rebuild it when archived log metadata changes.
pub fn get_player_memory() -> Result<MemoryContext, String> {
    let matches = log::list_matches();
    let stamps = matches
        .iter()
        .map(|entry| SourceStamp {
            name: entry.name.clone(),
            modified_ms: entry.modified_ms,
            size: entry.size,
        })
        .collect::<Vec<_>>();
    let path = memory_path();

    if let Ok(bytes) = fs::read(&path) {
        if let Ok(snapshot) = serde_json::from_slice::<MemorySnapshot>(&bytes) {
            if snapshot.schema_version == MEMORY_SCHEMA_VERSION
                && snapshot.context.schema_version == MEMORY_SCHEMA_VERSION
                && snapshot.sources == stamps
            {
                return Ok(snapshot.context);
            }
        }
    }

    let (sources, read_error) = read_sources(&matches);
    let mut context = derive_from_sources(&sources);
    if read_error {
        context.source_status = MemorySourceStatus::Partial;
        context.unknown_fields.push("sourceReadError".into());
    }
    let snapshot = MemorySnapshot {
        schema_version: MEMORY_SCHEMA_VERSION,
        sources: stamps,
        context: context.clone(),
    };
    write_snapshot(&path, &snapshot)?;
    Ok(context)
}

/// Delete only the derived G-Memory snapshot. G-Log archives are governed by
/// the separate `delete_all_match_logs` privacy command.
pub fn delete_player_memory() -> Result<(), String> {
    match fs::remove_file(memory_path()) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("ลบ G-Memory ไม่สำเร็จ: {error}")),
    }
}

fn parse_match(source: &MemoryLogSource) -> MatchFacts {
    let mut facts = MatchFacts::default();
    for line in source.content.lines() {
        let Ok(value) = serde_json::from_str::<Value>(line) else {
            continue;
        };
        // Win/loss is intentionally opt-in: current G-Log has no outcome record.
        if value.get("type").and_then(Value::as_str) == Some("match_result") {
            if let Some(win) = value.get("win").and_then(Value::as_bool) {
                facts.win = Some(win);
            }
            continue;
        }
        let Some(tick) = value.get("tick") else {
            continue;
        };
        if let Some(hero) = tick.get("hero").and_then(Value::as_str) {
            if !hero.trim().is_empty() {
                facts.hero = Some(hero.to_string());
            }
        }
        if let Some(gpm) = positive_number(tick.get("gpm")) {
            facts.final_gpm = Some(gpm);
        }
        if let Some(xpm) = positive_number(tick.get("xpm")) {
            facts.final_xpm = Some(xpm);
        }
    }
    facts
}

fn positive_number(value: Option<&Value>) -> Option<f64> {
    let number = value?.as_f64()?;
    (number.is_finite() && number > 0.0).then_some(number)
}

fn read_sources(matches: &[log::MatchLog]) -> (Vec<MemoryLogSource>, bool) {
    let dir = log::log_dir();
    let mut had_error = false;
    let sources = matches
        .iter()
        .filter_map(|entry| match fs::read_to_string(dir.join(&entry.name)) {
            Ok(content) => Some(MemoryLogSource {
                name: entry.name.clone(),
                modified_ms: entry.modified_ms,
                content,
            }),
            Err(_) => {
                had_error = true;
                None
            }
        })
        .collect();
    (sources, had_error)
}

fn write_snapshot(path: &Path, snapshot: &MemorySnapshot) -> Result<(), String> {
    let Some(parent) = path.parent() else {
        return Err("G-Memory path ไม่มี parent directory".into());
    };
    fs::create_dir_all(parent)
        .map_err(|error| format!("สร้าง G-Memory directory ไม่สำเร็จ: {error}"))?;
    let bytes = serde_json::to_vec_pretty(snapshot)
        .map_err(|error| format!("แปลง G-Memory snapshot ไม่สำเร็จ: {error}"))?;
    let temp = path.with_extension("json.tmp");
    fs::write(&temp, bytes).map_err(|error| format!("เขียน G-Memory snapshot ไม่สำเร็จ: {error}"))?;
    match fs::rename(&temp, path) {
        Ok(()) => Ok(()),
        Err(rename_error) if path.exists() => {
            fs::remove_file(path)
                .map_err(|error| format!("แทนที่ G-Memory snapshot ไม่สำเร็จ: {error}"))?;
            fs::rename(&temp, path).map_err(|error| {
                format!("แทนที่ G-Memory snapshot ไม่สำเร็จ ({rename_error}): {error}")
            })
        }
        Err(error) => Err(format!("ย้าย G-Memory snapshot ไม่สำเร็จ: {error}")),
    }
}

#[cfg(test)]
mod tests {
    use super::{derive_from_sources, MemoryLogSource};

    #[test]
    fn derive_from_sources_uses_latest_tick_and_explicit_outcome() {
        let sources = vec![MemoryLogSource {
            name: "match-2.jsonl".into(),
            modified_ms: 2,
            content: concat!(
                r#"{"ts":10,"tick":{"hero":"npc_dota_hero_crystal_maiden","gpm":300,"xpm":400,"clock_time":10}}"#, "\n",
                r#"{"ts":20,"tick":{"hero":"npc_dota_hero_crystal_maiden","gpm":500,"xpm":600,"clock_time":20}}"#, "\n",
                r#"{"ts":30,"type":"match_result","win":true}"#,
            )
            .into(),
        }];

        let memory = derive_from_sources(&sources);

        assert_eq!(memory.source_match_count, 1);
        assert_eq!(memory.recent_heroes, vec!["npc_dota_hero_crystal_maiden"]);
        assert_eq!(memory.avg_gpm, Some(500.0));
        assert_eq!(memory.avg_xpm, Some(600.0));
        assert_eq!(memory.favorite_heroes[0].play_count, 1);
        assert_eq!(memory.favorite_heroes[0].win_rate, Some(1.0));
    }

    #[test]
    fn derive_from_sources_keeps_unavailable_fields_unknown() {
        let sources = vec![MemoryLogSource {
            name: "match-1.jsonl".into(),
            modified_ms: 1,
            content:
                r#"{"ts":10,"tick":{"hero":"npc_dota_hero_lina","gpm":0,"xpm":0,"clock_time":10}}"#
                    .into(),
        }];

        let memory = derive_from_sources(&sources);

        assert_eq!(memory.avg_gpm, None);
        assert_eq!(memory.avg_xpm, None);
        assert_eq!(memory.mmr_trend, None);
        assert_eq!(memory.death_hotspots, None);
        assert_eq!(memory.common_death_causes, None);
    }

    #[test]
    fn derive_from_sources_skips_malformed_lines_without_fabricating_data() {
        let sources = vec![MemoryLogSource {
            name: "match-1.jsonl".into(),
            modified_ms: 1,
            content: "not-json\n{\"type\":\"unknown\"}\n".into(),
        }];

        let memory = derive_from_sources(&sources);

        assert_eq!(memory.source_match_count, 0);
        assert!(memory.favorite_heroes.is_empty());
        assert!(memory.recent_heroes.is_empty());
    }
}

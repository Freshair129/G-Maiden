//! G-Memory — local derived player memory from archived G-Log JSONL.
//!
//! This module never performs network I/O. It reads only archived `match-*.jsonl`
//! files, keeps unavailable fields as `None`, and persists a schema-versioned
//! snapshot beside the G-Log directory for fast repeat queries.

use std::cmp::Ordering;
use std::collections::BTreeMap;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::log;

const MEMORY_SCHEMA_VERSION: u32 = 1;
const MEMORY_CLEAR_SCHEMA_VERSION: u32 = 1;
const RECENT_HERO_LIMIT: usize = 20;

static MEMORY_IO: Mutex<()> = Mutex::new(());

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
    #[serde(default)]
    clear_before_ms: Option<u64>,
    context: MemoryContext,
}

#[derive(Debug, Serialize, Deserialize)]
struct MemoryClearMarker {
    schema_version: u32,
    cleared_before_ms: u64,
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

fn memory_clear_path() -> PathBuf {
    memory_path().with_file_name("memory-clear.json")
}

fn match_start_ms(name: &str) -> Option<u64> {
    name.strip_prefix("match-")?
        .strip_suffix(".jsonl")?
        .parse::<u64>()
        .ok()?
        .checked_mul(1000)
}

fn filter_matches(
    matches: Vec<log::MatchLog>,
    clear_before_ms: Option<u64>,
) -> (Vec<log::MatchLog>, bool) {
    let Some(clear_before_ms) = clear_before_ms else {
        return (matches, false);
    };

    let mut invalid_name = false;
    let eligible = matches
        .into_iter()
        .filter(|entry| match match_start_ms(&entry.name) {
            Some(start_ms) => start_ms > clear_before_ms,
            None => {
                invalid_name = true;
                false
            }
        })
        .collect();
    (eligible, invalid_name)
}

fn load_clear_before_ms(path: &Path) -> Result<Option<u64>, String> {
    let temp_path = path.with_extension("json.tmp");
    let mut cutoff = None;

    for candidate in [path, temp_path.as_path()] {
        let bytes = match fs::read(candidate) {
            Ok(bytes) => bytes,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
            Err(error) => return Err(format!("อ่าน G-Memory clear marker ไม่สำเร็จ: {error}")),
        };
        let marker = serde_json::from_slice::<MemoryClearMarker>(&bytes)
            .map_err(|error| format!("G-Memory clear marker ไม่ถูกต้อง: {error}"))?;
        if marker.schema_version != MEMORY_CLEAR_SCHEMA_VERSION {
            return Err("G-Memory clear marker ใช้ schema version ที่ไม่รองรับ".into());
        }
        cutoff = Some(cutoff.unwrap_or(0).max(marker.cleared_before_ms));
    }

    Ok(cutoff)
}

fn write_clear_marker(path: &Path, cleared_before_ms: u64) -> Result<(), String> {
    let Some(parent) = path.parent() else {
        return Err("G-Memory clear marker ไม่มี parent directory".into());
    };
    fs::create_dir_all(parent)
        .map_err(|error| format!("สร้าง G-Memory directory ไม่สำเร็จ: {error}"))?;
    let bytes = serde_json::to_vec_pretty(&MemoryClearMarker {
        schema_version: MEMORY_CLEAR_SCHEMA_VERSION,
        cleared_before_ms,
    })
    .map_err(|error| format!("แปลง G-Memory clear marker ไม่สำเร็จ: {error}"))?;
    let temp_path = path.with_extension("json.tmp");
    let mut temp_file = fs::File::create(&temp_path)
        .map_err(|error| format!("สร้าง G-Memory clear marker ชั่วคราวไม่สำเร็จ: {error}"))?;
    temp_file
        .write_all(&bytes)
        .and_then(|()| temp_file.sync_all())
        .map_err(|error| format!("เขียน G-Memory clear marker ไม่สำเร็จ: {error}"))?;

    match fs::rename(&temp_path, path) {
        Ok(()) => Ok(()),
        Err(rename_error) if path.exists() => {
            fs::remove_file(path)
                .map_err(|error| format!("แทนที่ G-Memory clear marker ไม่สำเร็จ: {error}"))?;
            fs::rename(&temp_path, path).map_err(|error| {
                format!("แทนที่ G-Memory clear marker ไม่สำเร็จ ({rename_error}): {error}")
            })
        }
        Err(error) => Err(format!("บันทึก G-Memory clear marker ไม่สำเร็จ: {error}")),
    }
}

fn clear_player_memory_at(
    snapshot_path: &Path,
    marker_path: &Path,
    now_ms: u64,
) -> Result<(), String> {
    let previous_cutoff = load_clear_before_ms(marker_path)?.unwrap_or(0);
    write_clear_marker(marker_path, previous_cutoff.max(now_ms))?;
    match fs::remove_file(snapshot_path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("ลบ G-Memory snapshot ไม่สำเร็จ: {error}")),
    }
}

fn current_epoch_ms() -> Result<u64, String> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .map_err(|error| format!("อ่านเวลาเพื่อ clear G-Memory ไม่สำเร็จ: {error}"))
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
    // Keep a concurrent read from republishing a pre-clear snapshot after delete returns.
    let _guard = MEMORY_IO
        .lock()
        .map_err(|error| format!("ล็อก G-Memory ไม่สำเร็จ: {error}"))?;
    let clear_before_ms = load_clear_before_ms(&memory_clear_path())?;
    let (matches, invalid_source_name) = filter_matches(log::list_matches(), clear_before_ms);
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
                && snapshot.clear_before_ms == clear_before_ms
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
    if invalid_source_name {
        context.source_status = MemorySourceStatus::Partial;
        context
            .unknown_fields
            .push("unrecognizedSourceTimestamp".into());
    }
    let snapshot = MemorySnapshot {
        schema_version: MEMORY_SCHEMA_VERSION,
        sources: stamps,
        clear_before_ms,
        context: context.clone(),
    };
    write_snapshot(&path, &snapshot)?;
    Ok(context)
}

/// Forget G-Memory derived from matches started before this cutoff while
/// preserving the separately governed G-Log archives.
pub fn delete_player_memory() -> Result<(), String> {
    let _guard = MEMORY_IO
        .lock()
        .map_err(|error| format!("ล็อก G-Memory ไม่สำเร็จ: {error}"))?;
    clear_player_memory_at(&memory_path(), &memory_clear_path(), current_epoch_ms()?)
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
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    use super::{
        clear_player_memory_at, derive_from_sources, filter_matches, load_clear_before_ms,
        MemoryLogSource,
    };
    use crate::log::MatchLog;

    fn test_dir() -> std::path::PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock after epoch")
            .as_nanos();
        std::env::temp_dir().join(format!(
            "gmaiden-memory-clear-{}-{nonce}",
            std::process::id()
        ))
    }

    fn match_log(name: &str) -> MatchLog {
        MatchLog {
            name: name.into(),
            size: 10,
            modified_ms: 1,
        }
    }

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

    #[test]
    fn clear_player_memory_persists_cutoff_and_preserves_archives() {
        let dir = test_dir();
        let snapshot = dir.join("memory.json");
        let marker = dir.join("memory-clear.json");
        let log_dir = dir.join("logs");
        fs::create_dir_all(&log_dir).unwrap();
        let archived_log = log_dir.join("match-10.jsonl");
        let original_log = br#"{"tick":{"hero":"npc_dota_hero_lina"}}"#;
        fs::write(&snapshot, b"stale snapshot").unwrap();
        fs::write(&archived_log, original_log).unwrap();

        clear_player_memory_at(&snapshot, &marker, 10_500).unwrap();

        assert!(!snapshot.exists());
        assert_eq!(fs::read(&archived_log).unwrap(), original_log);
        assert_eq!(load_clear_before_ms(&marker).unwrap(), Some(10_500));

        // Reloading the marker models a fresh app process; the old source stays
        // excluded while a match after the cutoff is eligible.
        let cutoff = load_clear_before_ms(&marker).unwrap();
        let (eligible, invalid_name) = filter_matches(
            vec![match_log("match-10.jsonl"), match_log("match-11.jsonl")],
            cutoff,
        );
        assert!(!invalid_name);
        assert_eq!(
            eligible
                .iter()
                .map(|entry| entry.name.as_str())
                .collect::<Vec<_>>(),
            vec!["match-11.jsonl"]
        );

        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn clear_cutoff_excludes_sources_in_the_same_second_and_unknown_names() {
        let (eligible, invalid_name) = filter_matches(
            vec![
                match_log("match-10.jsonl"),
                match_log("match-11.jsonl"),
                match_log("match-unknown.jsonl"),
            ],
            Some(10_500),
        );

        assert!(invalid_name);
        assert_eq!(
            eligible
                .iter()
                .map(|entry| entry.name.as_str())
                .collect::<Vec<_>>(),
            vec!["match-11.jsonl"]
        );
    }

    #[test]
    fn clear_cutoff_never_moves_backwards() {
        let dir = test_dir();
        fs::create_dir_all(&dir).unwrap();
        let snapshot = dir.join("memory.json");
        let marker = dir.join("memory-clear.json");
        fs::write(&marker, r#"{"schema_version":1,"cleared_before_ms":20000}"#).unwrap();

        clear_player_memory_at(&snapshot, &marker, 10_000).unwrap();

        assert_eq!(load_clear_before_ms(&marker).unwrap(), Some(20_000));
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn malformed_clear_marker_fails_closed() {
        let dir = test_dir();
        fs::create_dir_all(&dir).unwrap();
        let marker = dir.join("memory-clear.json");
        fs::write(&marker, b"not-json").unwrap();

        assert!(load_clear_before_ms(&marker).is_err());
        fs::remove_dir_all(dir).unwrap();
    }
}

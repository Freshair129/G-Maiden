//! G-Master — local advice with an optional, explicitly consented cloud route.
//! Cloud requests use a purpose-built own-stat allowlist; local Ollama may use
//! the richer match context. Provider choice and manual Ask are not consent.
//!
//! Throttle to 30s/request and cache the last answer so a quick double-click
//! still feels responsive without burning the Plan budget.

use std::process::{Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};

/// Cheap, fast Anthropic model for short advice calls (1-2 sentence tips).
const ANTHROPIC_MODEL: &str = "claude-haiku-4-5";

use crate::counter_advice::counter_advice_text;
use crate::gsi::GameTick;

const PERSONA_PROMPT: &str = r#"คุณคือ "Maiden" — ที่ปรึกษา Dota 2 บุคลิก Crystal Maiden แคสเตอร์
สไตล์: สุภาพ ฉลาด มี humor เกี่ยวกับ Nerf CM. ตอบเป็นไทย สั้นกระชับ (1-2 ประโยค) เน้นคำแนะนำเชิงปฏิบัติทันที
สำหรับสถานการณ์ที่ให้. ห้ามทักทาย ห้ามสรุป — ตอบคำแนะนำตรง ๆ."#;

const THROTTLE: Duration = Duration::from_secs(30);

struct CachedAdvice {
    text: String,
    created_at: Instant,
    context_generation: u64,
    from_slm: bool,
}

static LAST_RESPONSE: Mutex<Option<CachedAdvice>> = Mutex::new(None);
/// Which backend resolved the most recent *fresh* (non-cached) `advise()`
/// call — "claude" or "ollama". Recorded purely for the CR-011 §B utterance
/// ledger's `meta` field (main.rs::request_advice) so that event can say who
/// produced the advice without changing `Advice`/the `advice-update` payload.
static LAST_BACKEND: Mutex<Option<&'static str>> = Mutex::new(None);

#[derive(serde::Serialize, Clone)]
pub struct Advice {
    pub text: String,
    pub cached: bool,
}

/// Backend that produced the last fresh advice ("claude"/"ollama"), if known.
/// `None` before the first call, or if the mutex is poisoned.
pub fn last_backend() -> Option<&'static str> {
    LAST_BACKEND.lock().ok().and_then(|g| *g)
}

/// Consent changes must not leave a cloud-derived answer available through the
/// throttle cache, nor allow an older in-flight call to be reused as fresh.
pub(crate) fn invalidate_advice_cache() {
    if let Ok(mut response) = LAST_RESPONSE.lock() {
        *response = None;
    }
    if let Ok(mut backend) = LAST_BACKEND.lock() {
        *backend = None;
    }
}

fn hero_thai(raw: &str) -> String {
    raw.strip_prefix("npc_dota_hero_")
        .unwrap_or(raw)
        .replace('_', " ")
}

fn build_prompt(tick: &GameTick, enemies: &[String]) -> String {
    let phase = if tick.clock_time < 0 {
        "ก่อนเข้าเลน"
    } else if tick.clock_time < 600 {
        "early game"
    } else if tick.clock_time < 1800 {
        "mid game"
    } else {
        "late game"
    };

    // G5.2: inject counter-item advice from the dataset, grounded on the enemy
    // heroes the CV pipeline has identified this match (passed from the frontend
    // via request_advice). Empty list → empty advice string (best-effort: heroes
    // CV never spots simply don't contribute).
    let advice = counter_advice_text(enemies);

    // Ground the advice on the player's OWN single-combo burst (real hero + level
    // + items; skill build estimated). Empty when the hero isn't in the damage DB.
    // Own-data only — enemy defenses aren't observable, so this is "combo hits ~X
    // on a soft target", not a kill call.
    let burst_line = crate::damage::self_burst(&tick.hero, tick.level.max(1) as u32, &tick.item_names)
        .map(|b| {
            format!(
                "พลังคอมโบโดยประมาณ ~{:.0} dmg (คิดกับเป้าเปลือย เกราะ 0 / ต้านเวท 25%, สกิลบิลด์มาตรฐาน).",
                b.total_burst
            )
        })
        .unwrap_or_default();

    format!(
        "{persona}\n\nสถานการณ์ ({phase} · clock {clock}s): \
         ฮีโร่ {hero} เลเวล {lvl}, KDA {k}/{d}/{a}, net worth {nw}, gold {gold}, \
         HP {hp}%, mana {mana}%, score {rs}:{ds}.\n\
         คำแนะนำ: {advice}\n\
         {burst}\n\
         แนะนำสั้น ๆ ว่าควรทำอะไรต่อ (ซื้อของ/ขึ้นสกิล/positioning).",
        persona = PERSONA_PROMPT,
        phase = phase,
        clock = tick.clock_time,
        hero = hero_thai(&tick.hero),
        lvl = tick.level,
        k = tick.kills,
        d = tick.deaths,
        a = tick.assists,
        nw = tick.net_worth,
        gold = tick.gold,
        hp = tick.hp_percent,
        mana = tick.mana_percent,
        rs = tick.radiant_score,
        ds = tick.dire_score,
        advice = advice,
        burst = burst_line,
    )
}

/// The only live-match fields allowed into an external provider request.
/// Keep this purpose-built object separate from `GameTick` so adding a GSI
/// field cannot silently widen the cloud payload.
#[derive(Debug, PartialEq, Eq)]
struct CloudAdviceContext {
    phase: &'static str,
    own_hero: String,
    own_level: i64,
    own_kills: i64,
    own_deaths: i64,
    own_assists: i64,
    own_net_worth: i64,
    own_gold: i64,
    own_hp_percent: i64,
    own_mana_percent: i64,
    radiant_score: i64,
    dire_score: i64,
}

fn safe_own_hero(raw: &str) -> String {
    let name = raw.strip_prefix("npc_dota_hero_").unwrap_or(raw);
    if name.is_empty()
        || name.len() > 64
        || !name
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'_')
    {
        return "unknown".into();
    }
    name.replace('_', " ")
}

fn cloud_advice_context(tick: &GameTick) -> CloudAdviceContext {
    let phase = if tick.clock_time < 0 {
        "pre-game"
    } else if tick.clock_time < 600 {
        "early game"
    } else if tick.clock_time < 1800 {
        "mid game"
    } else {
        "late game"
    };
    CloudAdviceContext {
        phase,
        own_hero: safe_own_hero(&tick.hero),
        own_level: tick.level.clamp(0, 30),
        own_kills: tick.kills.max(0),
        own_deaths: tick.deaths.max(0),
        own_assists: tick.assists.max(0),
        own_net_worth: tick.net_worth.max(0),
        own_gold: tick.gold.max(0),
        own_hp_percent: tick.hp_percent.clamp(0, 100),
        own_mana_percent: tick.mana_percent.clamp(0, 100),
        radiant_score: tick.radiant_score.max(0),
        dire_score: tick.dire_score.max(0),
    }
}

fn build_cloud_prompt(tick: &GameTick) -> String {
    let context = cloud_advice_context(tick);
    format!(
        "{persona}\n\nสถานการณ์โดยสรุป ({phase}): ฮีโร่ของผู้เล่น {hero} เลเวล {level}, KDA {kills}/{deaths}/{assists}, net worth {net_worth}, gold {gold}, HP {hp}%, mana {mana}%, score {radiant}:{dire}.\nแนะนำสั้น ๆ ว่าควรทำอะไรต่อ โดยอ้างอิงเฉพาะข้อมูลที่ให้มา.",
        persona = PERSONA_PROMPT,
        phase = context.phase,
        hero = context.own_hero,
        level = context.own_level,
        kills = context.own_kills,
        deaths = context.own_deaths,
        assists = context.own_assists,
        net_worth = context.own_net_worth,
        gold = context.own_gold,
        hp = context.own_hp_percent,
        mana = context.own_mana_percent,
        radiant = context.radiant_score,
        dire = context.dire_score,
    )
}

#[derive(Copy, Clone, Debug, PartialEq, Eq)]
enum AdviceRoute {
    LocalOnly,
    CloudOnly,
    CloudThenLocal,
}

fn advice_route(
    backend: crate::runtime::MasterBackend,
    cloud_context_opt_in: bool,
) -> Result<AdviceRoute, &'static str> {
    use crate::runtime::MasterBackend::{Auto, Claude, Ollama};
    match (backend, cloud_context_opt_in) {
        (Ollama, _) | (Auto, false) => Ok(AdviceRoute::LocalOnly),
        (Claude, false) => {
            Err("Cloud game context is off. Enable the separate opt-in or choose Ollama.")
        }
        (Claude, true) => Ok(AdviceRoute::CloudOnly),
        (Auto, true) => Ok(AdviceRoute::CloudThenLocal),
    }
}

fn execute_advice_route<C, L>(
    route: AdviceRoute,
    cloud: C,
    local: L,
) -> Result<(String, bool), String>
where
    C: FnOnce() -> Result<String, String>,
    L: FnOnce() -> Result<String, String>,
{
    match route {
        AdviceRoute::LocalOnly => local()
            .map(|text| (text, true))
            .map_err(|error| format!("ollama: {error}")),
        AdviceRoute::CloudOnly => cloud()
            .map(|text| (text, false))
            .map_err(|error| format!("claude: {error}")),
        AdviceRoute::CloudThenLocal => match cloud() {
            Ok(text) => Ok((text, false)),
            Err(cloud_error) => {
                eprintln!("[G-Master] claude unavailable ({cloud_error}); trying local SLM…");
                local()
                    .map(|text| (text, true))
                    .map_err(|local_error| format!("claude: {cloud_error}; SLM: {local_error}"))
            }
        },
    }
}

fn cache_origin_allowed(route: AdviceRoute, from_slm: bool) -> bool {
    match route {
        AdviceRoute::LocalOnly => from_slm,
        AdviceRoute::CloudOnly => !from_slm,
        AdviceRoute::CloudThenLocal => true,
    }
}

/// Ask Maiden for advice on the current game state. Auto stays on local Ollama
/// until cloud-context consent is enabled; opted-in Claude failures may fall
/// back to Ollama. Blocking — call from a worker thread. Throttled to 30s.
pub fn advise(tick: &GameTick, enemies: &[String]) -> Result<Advice, String> {
    let backend = crate::runtime::master_backend();
    let cloud_context_opt_in = crate::runtime::master_cloud_context_opt_in();
    let route = advice_route(backend, cloud_context_opt_in).map_err(str::to_string)?;
    let context_generation = crate::runtime::master_cloud_context_generation();

    // Throttle window — serve cached.
    if let Ok(response) = LAST_RESPONSE.lock() {
        if let Some(cached) = response.as_ref() {
            if cached.context_generation == context_generation
                && cached.created_at.elapsed() < THROTTLE
                && cache_origin_allowed(route, cached.from_slm)
                && crate::runtime::master_cloud_context_generation() == context_generation
            {
                return Ok(Advice {
                    text: cached.text.clone(),
                    cached: true,
                });
            }
        }
    }

    let local_prompt = build_prompt(tick, enemies);

    // Cloud receives a separately-built allowlisted prompt. Auto skips cloud
    // entirely while consent is off; a forced Claude route fails closed.
    let ollama_model = crate::runtime::master_ollama_model();
    let (text, from_slm) = execute_advice_route(
        route,
        || try_claude(&build_cloud_prompt(tick)),
        || crate::slm::advise_offline(&local_prompt, &ollama_model),
    )?;

    if crate::runtime::master_cloud_context_generation() != context_generation {
        return Err("Cloud-context preference changed; advice response discarded.".into());
    }

    if let Ok(mut g) = LAST_RESPONSE.lock() {
        *g = Some(CachedAdvice {
            text: text.clone(),
            created_at: Instant::now(),
            context_generation,
            from_slm,
        });
    }
    if crate::runtime::master_cloud_context_generation() != context_generation {
        invalidate_advice_cache();
        return Err("Cloud-context preference changed; advice response discarded.".into());
    }
    if let Ok(mut g) = LAST_BACKEND.lock() {
        *g = Some(if from_slm { "ollama" } else { "claude" });
    }
    // Quota monitor — only Claude-served responses burn Plan/API quota.
    // Ollama answers are free, and cached hits returned before this point.
    if !from_slm {
        crate::usage::record_advice(
            build_cloud_prompt(tick).chars().count(),
            text.chars().count(),
        );
    }
    Ok(Advice {
        text,
        cached: false,
    })
}

/// Claude advice path. When the user has chosen API-key auth and entered a key,
/// call the Anthropic Messages API directly; otherwise shell out to the signed-in
/// `claude` CLI (Plan quota, no key).
fn try_claude(prompt: &str) -> Result<String, String> {
    if let Some(key) = crate::runtime::master_api_key() {
        return try_anthropic_api(prompt, &key);
    }
    try_claude_cli(prompt)
}

/// POST the prompt to the Anthropic Messages API via curl (same shell-out pattern
/// as the ollama path — no new Rust dependency). Parses `content[0].text`.
fn try_anthropic_api(prompt: &str, key: &str) -> Result<String, String> {
    let body = anthropic_request_body(prompt);

    let mut cmd = Command::new("curl");
    cmd.args([
        "-s",
        "--max-time",
        "30",
        "-X",
        "POST",
        "https://api.anthropic.com/v1/messages",
        "-H",
        &format!("x-api-key: {key}"),
        "-H",
        "anthropic-version: 2023-06-01",
        "-H",
        "content-type: application/json",
        "-d",
        &body,
    ])
    .stdin(Stdio::null())
    .stdout(Stdio::piped())
    .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW — no console flash
    }
    let out = cmd.output().map_err(|e| format!("เรียก curl ไม่ได้: {e}"))?;
    if !out.status.success() {
        return Err(format!("curl exit {:?}", out.status.code()));
    }
    let raw = String::from_utf8_lossy(&out.stdout);
    let v: serde_json::Value = serde_json::from_str(&raw).map_err(|e| {
        format!(
            "JSON parse: {e} — raw: {}",
            raw.chars().take(160).collect::<String>()
        )
    })?;
    // Surface API errors (bad key, rate limit) instead of a confusing empty parse.
    if let Some(err) = v.pointer("/error/message").and_then(|m| m.as_str()) {
        return Err(format!("Anthropic API: {err}"));
    }
    v.pointer("/content/0/text")
        .and_then(|t| t.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "Anthropic API คืนผลว่าง".into())
}

fn anthropic_request_body(prompt: &str) -> String {
    serde_json::json!({
        "model": ANTHROPIC_MODEL,
        "max_tokens": 300,
        "messages": [{ "role": "user", "content": prompt }],
    })
    .to_string()
}

fn claude_cli_args(prompt: &str) -> [&str; 2] {
    ["-p", prompt]
}

fn try_claude_cli(prompt: &str) -> Result<String, String> {
    let mut cmd = Command::new("claude");
    cmd.args(claude_cli_args(prompt))
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
    let out = cmd
        .output()
        .map_err(|e| format!("เรียก claude CLI ไม่ได้: {e}"))?;
    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr);
        return Err(format!("claude คืน error: {}", stderr.trim()));
    }
    let text = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if text.is_empty() {
        return Err("claude คืนผลว่าง".into());
    }
    Ok(text)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fake_tick() -> GameTick {
        GameTick {
            in_game: true,
            clock_time: 720,
            game_state: "DOTA_GAMERULES_STATE_GAME_IN_PROGRESS".into(),
            daytime: true,
            radiant_score: 8,
            dire_score: 5,
            gold: 1850,
            net_worth: 8200,
            gpm: 470,
            xpm: 540,
            kills: 4,
            deaths: 2,
            assists: 6,
            team_name: "radiant".into(),
            last_hits: 92,
            denies: 5,
            hero: "npc_dota_hero_crystal_maiden".into(),
            level: 11,
            alive: true,
            hp_percent: 68,
            mana_percent: 55,
            hp: 897,
            max_hp: 1320,
            steamid: String::new(),
            buyback_cost: 0,
            respawn_seconds: 0,
            kill_list_len: 4,
            last_victim_slot: 7,
            item_names: vec!["item_dagon".into()],
        }
    }

    #[test]
    fn hero_thai_strips_npc_prefix() {
        assert_eq!(hero_thai("npc_dota_hero_crystal_maiden"), "crystal maiden");
        assert_eq!(hero_thai(""), "");
        assert_eq!(hero_thai("foo"), "foo");
    }

    #[test]
    fn prompt_includes_phase_and_kda() {
        let p = build_prompt(&fake_tick(), &[]);
        assert!(p.contains("mid game"), "phase missing: {p}");
        assert!(p.contains("crystal maiden"), "hero name missing: {p}");
        assert!(p.contains("KDA 4/2/6"), "kda missing: {p}");
        assert!(p.contains("HP 68%"), "hp missing: {p}");
        assert!(p.contains("Maiden"), "persona missing: {p}");
        // Self-burst grounding: CM is in the damage DB, so the estimate appears.
        assert!(p.contains("พลังคอมโบโดยประมาณ"), "self-burst line missing: {p}");
    }

    #[test]
    fn prompt_phases_by_clock() {
        let mut t = fake_tick();
        t.clock_time = -30;
        assert!(build_prompt(&t, &[]).contains("ก่อนเข้าเลน"));
        t.clock_time = 300;
        assert!(build_prompt(&t, &[]).contains("early game"));
        t.clock_time = 1200;
        assert!(build_prompt(&t, &[]).contains("mid game"));
        t.clock_time = 2400;
        assert!(build_prompt(&t, &[]).contains("late game"));
    }

    #[test]
    fn prompt_grounds_counter_advice_on_enemies() {
        // With no enemies the counter line is blank; with a known enemy the
        // dataset advice is injected into the prompt (grounding, not confabulation).
        let empty = build_prompt(&fake_tick(), &[]);
        assert!(!empty.contains("counter:"), "no enemies → no counter line: {empty}");
        let grounded = build_prompt(&fake_tick(), &["phantom_assassin".to_string()]);
        assert!(grounded.contains("counter:"), "enemy → counter line present: {grounded}");
        assert!(grounded.contains("MKB"), "PA counter item must reach the prompt: {grounded}");
    }

    #[test]
    fn cloud_prompt_contains_only_the_approved_own_stat_context() {
        let mut tick = fake_tick();
        tick.clock_time = 1729;
        tick.game_state = "SENTINEL_GAME_STATE".into();
        tick.gpm = 987_654;
        tick.xpm = 987_655;
        tick.last_hits = 987_656;
        tick.denies = 987_657;
        tick.steamid = "SENTINEL_STEAM_ID".into();
        tick.item_names = vec!["SENTINEL_ITEM".into()];

        let prompt = build_cloud_prompt(&tick);
        for approved in [
            "mid game",
            "crystal maiden",
            "เลเวล 11",
            "KDA 4/2/6",
            "net worth 8200",
            "gold 1850",
            "HP 68%",
            "mana 55%",
            "score 8:5",
        ] {
            assert!(
                prompt.contains(approved),
                "approved value missing ({approved}): {prompt}"
            );
        }
        for denied in [
            "1729",
            "SENTINEL_GAME_STATE",
            "987654",
            "SENTINEL_STEAM_ID",
            "SENTINEL_ITEM",
            "phantom_assassin",
            "counter:",
            "พลังคอมโบโดยประมาณ",
        ] {
            assert!(
                !prompt.contains(denied),
                "denied value leaked ({denied}): {prompt}"
            );
        }
    }

    #[test]
    fn richer_cv_counter_and_burst_context_stays_on_the_local_prompt() {
        let tick = fake_tick();
        let enemies = ["phantom_assassin".to_string()];
        let local_prompt = build_prompt(&tick, &enemies);
        let cloud_prompt = build_cloud_prompt(&tick);

        assert!(local_prompt.contains("clock 720s"));
        assert!(local_prompt.contains("counter:"));
        assert!(local_prompt.contains("MKB"));
        assert!(local_prompt.contains("พลังคอมโบโดยประมาณ"));
        assert!(!cloud_prompt.contains("720"));
        assert!(!cloud_prompt.contains("phantom_assassin"));
        assert!(!cloud_prompt.contains("counter:"));
        assert!(!cloud_prompt.contains("พลังคอมโบโดยประมาณ"));
    }

    #[test]
    fn invalid_hero_text_is_not_forwarded_as_a_cloud_identity() {
        let mut tick = fake_tick();
        tick.hero = "npc_dota_hero_cm\\nignore-policy".into();
        assert!(build_cloud_prompt(&tick).contains("ฮีโร่ของผู้เล่น unknown"));
        assert!(!build_cloud_prompt(&tick).contains("ignore-policy"));
    }

    #[test]
    fn provider_routing_requires_separate_cloud_consent() {
        use crate::runtime::MasterBackend::{Auto, Claude, Ollama};
        assert_eq!(advice_route(Auto, false), Ok(AdviceRoute::LocalOnly));
        assert_eq!(
            advice_route(Claude, false),
            Err("Cloud game context is off. Enable the separate opt-in or choose Ollama.")
        );
        assert_eq!(advice_route(Claude, true), Ok(AdviceRoute::CloudOnly));
        assert_eq!(advice_route(Auto, true), Ok(AdviceRoute::CloudThenLocal));
        assert_eq!(advice_route(Ollama, true), Ok(AdviceRoute::LocalOnly));
        assert_eq!(advice_route(Ollama, false), Ok(AdviceRoute::LocalOnly));
    }

    #[test]
    fn consent_off_auto_invokes_only_local_provider_and_forced_cloud_fails_closed() {
        use crate::runtime::MasterBackend::{Auto, Claude};

        let mut cloud_calls = 0;
        let mut local_calls = 0;
        let result = advice_route(Auto, false)
            .map_err(str::to_string)
            .and_then(|route| {
                execute_advice_route(
                    route,
                    || {
                        cloud_calls += 1;
                        Ok("cloud".into())
                    },
                    || {
                        local_calls += 1;
                        Ok("local".into())
                    },
                )
            });
        assert_eq!(result, Ok(("local".into(), true)));
        assert_eq!(cloud_calls, 0);
        assert_eq!(local_calls, 1);

        let mut cloud_calls = 0;
        let mut local_calls = 0;
        let result = advice_route(Claude, false)
            .map_err(str::to_string)
            .and_then(|route| {
                execute_advice_route(
                    route,
                    || {
                        cloud_calls += 1;
                        Ok("cloud".into())
                    },
                    || {
                        local_calls += 1;
                        Ok("local".into())
                    },
                )
            });
        assert!(result.is_err());
        assert_eq!(cloud_calls, 0);
        assert_eq!(local_calls, 0);
    }

    #[test]
    fn opted_in_auto_cloud_failure_falls_back_to_local_provider() {
        use crate::runtime::MasterBackend::Auto;

        let mut cloud_calls = 0;
        let mut local_calls = 0;
        let result = advice_route(Auto, true)
            .map_err(str::to_string)
            .and_then(|route| {
                execute_advice_route(
                    route,
                    || {
                        cloud_calls += 1;
                        Err("offline".into())
                    },
                    || {
                        local_calls += 1;
                        Ok("local".into())
                    },
                )
            });
        assert_eq!(result, Ok(("local".into(), true)));
        assert_eq!(cloud_calls, 1);
        assert_eq!(local_calls, 1);
    }

    #[test]
    fn local_only_routes_never_reuse_a_cloud_derived_cached_answer() {
        assert!(!cache_origin_allowed(AdviceRoute::LocalOnly, false));
        assert!(cache_origin_allowed(AdviceRoute::LocalOnly, true));
        assert!(!cache_origin_allowed(AdviceRoute::CloudOnly, true));
        assert!(cache_origin_allowed(AdviceRoute::CloudOnly, false));
        assert!(cache_origin_allowed(AdviceRoute::CloudThenLocal, false));
        assert!(cache_origin_allowed(AdviceRoute::CloudThenLocal, true));
    }

    #[test]
    fn serialized_anthropic_payload_contains_only_the_cloud_prompt() {
        let prompt = build_cloud_prompt(&fake_tick());
        let body: serde_json::Value =
            serde_json::from_str(&anthropic_request_body(&prompt)).unwrap();
        let root = body.as_object().unwrap();
        assert_eq!(root.len(), 3);
        assert_eq!(root["model"], ANTHROPIC_MODEL);
        assert_eq!(root["max_tokens"], 300);
        let message = root["messages"][0].as_object().unwrap();
        assert_eq!(message.len(), 2);
        assert_eq!(message["role"], "user");
        assert_eq!(message["content"], prompt);
        assert!(!body.to_string().contains("item_dagon"));
    }

    #[test]
    fn serialized_claude_cli_arguments_contain_only_the_cloud_prompt() {
        let prompt = build_cloud_prompt(&fake_tick());
        let args = claude_cli_args(&prompt);
        assert_eq!(args, ["-p", prompt.as_str()]);
        assert!(!args[1].contains("item_dagon"));
    }

    #[test]
    fn last_backend_reports_the_most_recent_write() {
        // Direct static access — no test in this module calls the real
        // (network/process) `advise()`, so this is the only writer and the
        // read-back is deterministic without spinning up claude/ollama.
        if let Ok(mut g) = LAST_BACKEND.lock() {
            *g = Some("ollama");
        }
        assert_eq!(last_backend(), Some("ollama"));
    }
}

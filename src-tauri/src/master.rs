//! G-Master — cloud advisor backed by the user's `claude` CLI (Plan quota).
//! No API key, no per-token cost: we shell out to `claude -p "<prompt>"` and
//! the CLI uses the session the user already logged into. Same shell-out
//! pattern as TTS/registry/VDF — no new Rust dependency.
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

static LAST_CALL: Mutex<Option<Instant>> = Mutex::new(None);
static LAST_RESPONSE: Mutex<Option<String>> = Mutex::new(None);

#[derive(serde::Serialize, Clone)]
pub struct Advice {
    pub text: String,
    pub cached: bool,
}

fn hero_thai(raw: &str) -> String {
    raw.strip_prefix("npc_dota_hero_")
        .unwrap_or(raw)
        .replace('_', " ")
}

fn build_prompt(tick: &GameTick) -> String {
    let phase = if tick.clock_time < 0 {
        "ก่อนเข้าเลน"
    } else if tick.clock_time < 600 {
        "early game"
    } else if tick.clock_time < 1800 {
        "mid game"
    } else {
        "late game"
    };

    // G5.2: inject counter-item advice from dataset
    // enemies will be provided by G-Sentry when that integration is ready
    let advice = counter_advice_text(&[]);

    format!(
        "{persona}\n\nสถานการณ์ ({phase} · clock {clock}s): \
         ฮีโร่ {hero} เลเวล {lvl}, KDA {k}/{d}/{a}, net worth {nw}, gold {gold}, \
         HP {hp}%, mana {mana}%, score {rs}:{ds}.\n\
         คำแนะนำ: {advice}\n\
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
        advice = advice, // Inserted advice here
    )
}

/// Ask Maiden (via Claude Plan quota) for advice on the current game state.
/// On claude CLI failure, falls back to the local SLM (G7.1, ollama).
/// Blocking — call from a worker thread. Throttled to 30s; cached responses
/// are returned with `cached=true` so the UI can hint at staleness.
pub fn advise(tick: &GameTick) -> Result<Advice, String> {
    // Throttle window — serve cached.
    if let Ok(g) = LAST_CALL.lock() {
        if let Some(t) = *g {
            if t.elapsed() < THROTTLE {
                if let Ok(r) = LAST_RESPONSE.lock() {
                    if let Some(text) = r.clone() {
                        return Ok(Advice { text, cached: true });
                    }
                }
            }
        }
    }

    let prompt = build_prompt(tick);

    // Backend choice respects the UI selector — Auto keeps the historical
    // claude-then-SLM ladder; Claude/Ollama force one path so the user can
    // route around rate-limits or stay offline by choice.
    let backend = crate::runtime::master_backend();
    let ollama_model = crate::runtime::master_ollama_model();
    let (text, from_slm) = match backend {
        crate::runtime::MasterBackend::Ollama => {
            let t = crate::slm::advise_offline(&prompt, &ollama_model)
                .map_err(|e| format!("ollama: {e}"))?;
            (t, true)
        }
        crate::runtime::MasterBackend::Claude => {
            let t = try_claude(&prompt).map_err(|e| format!("claude: {e}"))?;
            (t, false)
        }
        crate::runtime::MasterBackend::Auto => match try_claude(&prompt) {
            Ok(t) => (t, false),
            Err(e) => {
                eprintln!("[G-Master] claude unavailable ({e}); trying local SLM…");
                match crate::slm::advise_offline(&prompt, &ollama_model) {
                    Ok(t) => (t, true),
                    Err(e2) => return Err(format!("claude: {e}; SLM: {e2}")),
                }
            }
        },
    };

    if let Ok(mut g) = LAST_CALL.lock() {
        *g = Some(Instant::now());
    }
    if let Ok(mut g) = LAST_RESPONSE.lock() {
        *g = Some(text.clone());
    }
    let _ = from_slm; // available for future telemetry
    Ok(Advice { text, cached: false })
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
    let body = serde_json::json!({
        "model": ANTHROPIC_MODEL,
        "max_tokens": 300,
        "messages": [{ "role": "user", "content": prompt }],
    })
    .to_string();

    let mut cmd = Command::new("curl");
    cmd.args([
        "-s",
        "--max-time", "30",
        "-X", "POST",
        "https://api.anthropic.com/v1/messages",
        "-H", &format!("x-api-key: {key}"),
        "-H", "anthropic-version: 2023-06-01",
        "-H", "content-type: application/json",
        "-d", &body,
    ])
    .stdin(Stdio::null())
    .stdout(Stdio::piped())
    .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW — no console flash
    }
    let out = cmd
        .output()
        .map_err(|e| format!("เรียก curl ไม่ได้: {e}"))?;
    if !out.status.success() {
        return Err(format!("curl exit {:?}", out.status.code()));
    }
    let raw = String::from_utf8_lossy(&out.stdout);
    let v: serde_json::Value = serde_json::from_str(&raw).map_err(|e| {
        format!("JSON parse: {e} — raw: {}", &raw.chars().take(160).collect::<String>())
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

fn try_claude_cli(prompt: &str) -> Result<String, String> {
    let mut cmd = Command::new("claude");
    cmd.args(["-p", prompt])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
    let out = cmd.output().map_err(|e| {
        format!("เรียก claude CLI ไม่ได้: {e}")
    })?;
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
            last_hits: 92,
            denies: 5,
            hero: "npc_dota_hero_crystal_maiden".into(),
            level: 11,
            alive: true,
            hp_percent: 68,
            mana_percent: 55,
            buyback_cost: 0,
            respawn_seconds: 0,
            kill_list_len: 4,
            last_victim_slot: 7,
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
        let p = build_prompt(&fake_tick());
        assert!(p.contains("mid game"), "phase missing: {p}");
        assert!(p.contains("crystal maiden"), "hero name missing: {p}");
        assert!(p.contains("KDA 4/2/6"), "kda missing: {p}");
        assert!(p.contains("HP 68%"), "hp missing: {p}");
        assert!(p.contains("Maiden"), "persona missing: {p}");
    }

    #[test]
    fn prompt_phases_by_clock() {
        let mut t = fake_tick();
        t.clock_time = -30;
        assert!(build_prompt(&t).contains("ก่อนเข้าเลน"));
        t.clock_time = 300;
        assert!(build_prompt(&t).contains("early game"));
        t.clock_time = 1200;
        assert!(build_prompt(&t).contains("mid game"));
        t.clock_time = 2400;
        assert!(build_prompt(&t).contains("late game"));
    }
}
//! Quota monitor — track Claude usage จาก G-Master calls.
//! ทุก call ที่ Claude ตอบจริง (ไม่ใช่ cache/Ollama) บันทึกลง JSONL
//! ที่ `%LOCALAPPDATA%\G-Maiden\usage\events.jsonl` เพื่อให้ UI แสดง
//! 5-hour rate-limit window + 7-day weekly window — เทียบเคียงกับขอบของ
//! Claude Plan แม้ไม่ได้เป็นเปอร์เซ็นต์ทางการ.
//!
//! เราไม่ได้ access ตัวเลข quota จริงของ Anthropic (CLI ไม่เปิด API ให้);
//! เลย estimate ค่า in/out tokens จากความยาวข้อความและคูณราคา model ที่ใช้.
//! ตัวเลขที่แสดง = "เครื่องนี้ใช้ไปเท่าไหร่" ไม่ใช่ % คงเหลือ.

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

const SESSION_WINDOW_MS: u64 = 5 * 60 * 60 * 1000;
const WEEKLY_WINDOW_MS: u64 = 7 * 24 * 60 * 60 * 1000;

/// ~chars per token. ภาษาไทยหนาแน่นกว่า English ~1.2 เท่า — ใช้ 3.5 ตรงกลาง.
const CHARS_PER_TOKEN: f64 = 3.5;

/// ราคาเริ่มต้นของ Sonnet 4.x (USD per million tokens). Plan subscription มัก route
/// ไป Sonnet โดย default; user เปลี่ยน defaults ได้โดยแก้ไฟล์ config ในอนาคต.
const PRICE_IN_USD_PER_MTOK: f64 = 3.0;
const PRICE_OUT_USD_PER_MTOK: f64 = 15.0;

fn usage_dir() -> PathBuf {
    let base = std::env::var("LOCALAPPDATA")
        .ok()
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."));
    base.join("G-Maiden").join("usage")
}

fn events_path() -> PathBuf {
    usage_dir().join("events.jsonl")
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn estimate_tokens(chars: usize) -> u64 {
    ((chars as f64) / CHARS_PER_TOKEN).ceil() as u64
}

fn estimate_cost(in_tok: u64, out_tok: u64) -> f64 {
    (in_tok as f64) * PRICE_IN_USD_PER_MTOK / 1_000_000.0
        + (out_tok as f64) * PRICE_OUT_USD_PER_MTOK / 1_000_000.0
}

/// Which Claude auth mode the advice path is on — mirrors the UI's G-Master
/// auth setting (`set_master_mode`), not an env-var heuristic.
pub fn plan_mode() -> &'static str {
    if crate::runtime::master_api_key().is_some() {
        "apikey"
    } else {
        "plan"
    }
}

fn append_event(line: &str) {
    let dir = usage_dir();
    if let Err(e) = fs::create_dir_all(&dir) {
        eprintln!("[G-Maiden usage] mkdir failed: {e}");
        return;
    }
    let path = events_path();
    match OpenOptions::new().create(true).append(true).open(&path) {
        Ok(mut f) => {
            let _ = f.write_all(line.as_bytes());
            let _ = f.write_all(b"\n");
            let _ = f.flush();
        }
        Err(e) => eprintln!("[G-Maiden usage] open failed: {e}"),
    }
}

/// Record a Claude-served G-Master advice call. `prompt_chars`/`out_chars` are
/// character counts (not bytes — Thai is 3 bytes/char in UTF-8).
pub fn record_advice(prompt_chars: usize, out_chars: usize) {
    let in_tok = estimate_tokens(prompt_chars);
    let out_tok = estimate_tokens(out_chars);
    let cost = estimate_cost(in_tok, out_tok);
    let line = format!(
        "{{\"ts\":{ts},\"kind\":\"advice\",\"model\":\"{model}\",\"in_tok\":{in_tok},\"out_tok\":{out_tok},\"cost_usd\":{cost}}}",
        ts = now_ms(),
        model = "sonnet",
    );
    append_event(&line);
}

/// Aggregated counters for one time window.
#[derive(serde::Serialize, Clone, Default)]
pub struct WindowAgg {
    pub calls: u64,
    pub in_tok: u64,
    pub out_tok: u64,
    pub cost_usd: f64,
}

/// Aggregated usage stats for the UI.
#[derive(serde::Serialize, Clone)]
pub struct UsageStats {
    pub plan: String,
    pub session_window_h: u64,
    pub weekly_window_d: u64,
    pub session: WindowAgg,
    pub weekly: WindowAgg,
    pub log_path: String,
}

fn parse_event(line: &str) -> Option<(u64, u64, u64, f64)> {
    // Tiny ad-hoc parser to avoid pulling serde_json::Value here — we control
    // the producer so the schema is stable. Returns (ts, in_tok, out_tok, cost).
    let mut ts = 0u64;
    let mut in_tok = 0u64;
    let mut out_tok = 0u64;
    let mut cost = 0.0f64;
    for part in line.trim_matches(|c| c == '{' || c == '}').split(',') {
        let mut it = part.splitn(2, ':');
        let key = it.next()?.trim().trim_matches('"');
        let val = it.next()?.trim();
        match key {
            "ts" => ts = val.parse().ok()?,
            "in_tok" => in_tok = val.parse().ok()?,
            "out_tok" => out_tok = val.parse().ok()?,
            "cost_usd" => cost = val.parse().ok()?,
            _ => {}
        }
    }
    Some((ts, in_tok, out_tok, cost))
}

pub fn read_stats() -> UsageStats {
    let now = now_ms();
    let mut session = WindowAgg::default();
    let mut weekly = WindowAgg::default();
    let path = events_path();
    if let Ok(text) = fs::read_to_string(&path) {
        for line in text.lines() {
            if line.is_empty() {
                continue;
            }
            let Some((ts, in_tok, out_tok, cost)) = parse_event(line) else {
                continue;
            };
            let age = now.saturating_sub(ts);
            if age <= WEEKLY_WINDOW_MS {
                weekly.calls += 1;
                weekly.in_tok += in_tok;
                weekly.out_tok += out_tok;
                weekly.cost_usd += cost;
                if age <= SESSION_WINDOW_MS {
                    session.calls += 1;
                    session.in_tok += in_tok;
                    session.out_tok += out_tok;
                    session.cost_usd += cost;
                }
            }
        }
    }
    UsageStats {
        plan: plan_mode().into(),
        session_window_h: SESSION_WINDOW_MS / (60 * 60 * 1000),
        weekly_window_d: WEEKLY_WINDOW_MS / (24 * 60 * 60 * 1000),
        session,
        weekly,
        log_path: path.to_string_lossy().to_string(),
    }
}

/// Privacy reset — wipe the usage log. Matches the G-Log delete-all gesture.
pub fn clear() -> Result<(), String> {
    let path = events_path();
    if !path.exists() {
        return Ok(());
    }
    fs::remove_file(&path).map_err(|e| format!("ลบ usage log ไม่สำเร็จ: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn estimate_tokens_scales_with_length() {
        assert_eq!(estimate_tokens(0), 0);
        assert_eq!(estimate_tokens(7), 2); // 7 / 3.5 = 2.0 -> ceil 2
        assert_eq!(estimate_tokens(8), 3); // 8 / 3.5 ≈ 2.29 -> ceil 3
    }

    #[test]
    fn estimate_cost_matches_sonnet_pricing() {
        // 1M input tokens at $3/M = $3
        let cost = estimate_cost(1_000_000, 0);
        assert!((cost - 3.0).abs() < 1e-6);
        // 1M output tokens at $15/M = $15
        let cost = estimate_cost(0, 1_000_000);
        assert!((cost - 15.0).abs() < 1e-6);
    }

    #[test]
    fn parse_event_extracts_fields() {
        let line = r#"{"ts":1234567890,"kind":"advice","model":"sonnet","in_tok":150,"out_tok":60,"cost_usd":0.00135}"#;
        let (ts, in_tok, out_tok, cost) = parse_event(line).unwrap();
        assert_eq!(ts, 1234567890);
        assert_eq!(in_tok, 150);
        assert_eq!(out_tok, 60);
        assert!((cost - 0.00135).abs() < 1e-9);
    }

    #[test]
    fn parse_event_rejects_garbage() {
        assert!(parse_event("").is_none());
        assert!(parse_event("not json").is_none());
    }
}

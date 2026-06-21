//! G-Maiden first-run setup (G8.1 — installer companion).
//! Locates the user's Dota 2 install and writes our GSI config there so the
//! game starts POSTing to 127.0.0.1:3000 on next launch. No new Rust deps:
//! the Steam install path comes from `reg query`, the library that owns
//! Dota 2 (appid 570) is discovered by scanning `libraryfolders.vdf`.

use std::fs;
use std::path::PathBuf;
use std::process::Command;

const DOTA_APPID: &str = "570";
const CFG_NAME: &str = "gamestate_integration_gmaiden.cfg";
const CFG_BODY: &str = r#""G-Maiden Integration"
{
    "uri"           "http://127.0.0.1:3000/gsi"
    "timeout"       "5.0"
    "buffer"        "0.1"
    "throttle"      "0.1"
    "heartbeat"     "30.0"
    "data"
    {
        "provider"      "1"
        "map"           "1"
        "player"        "1"
        "hero"          "1"
        "abilities"     "1"
        "items"         "1"
    }
}
"#;

#[derive(serde::Serialize, Clone)]
pub struct SetupStatus {
    pub installed: bool,
    pub steam_path: Option<String>,
    pub dota_cfg_dir: Option<String>,
    pub cfg_present: bool,
    pub message: String,
}

fn read_steam_path() -> Option<PathBuf> {
    // Valve writes SteamPath with forward slashes — fine for std::path on Windows.
    let out = Command::new("reg")
        .args([
            "query",
            r"HKCU\Software\Valve\Steam",
            "/v",
            "SteamPath",
        ])
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&out.stdout);
    for line in text.lines() {
        if let Some(idx) = line.find("REG_SZ") {
            let path = line[idx + 6..].trim();
            if !path.is_empty() {
                return Some(PathBuf::from(path));
            }
        }
    }
    None
}

/// Scan libraryfolders.vdf for the library that owns Dota 2 (appid 570).
/// VDF is structurally nested but we only need a flat scan: track the most
/// recent `"path"` and return it when we see the app id line inside the
/// same block.
fn find_dota_library(steam: &PathBuf) -> Option<PathBuf> {
    let vdf = steam.join("steamapps").join("libraryfolders.vdf");
    let text = fs::read_to_string(&vdf).ok()?;
    let mut current_path: Option<String> = None;
    for raw in text.lines() {
        let line = raw.trim();
        if let Some(rest) = line.strip_prefix("\"path\"") {
            // "path"\t\t"D:\\steam"
            if let (Some(a), Some(b)) = (rest.find('"'), rest.rfind('"')) {
                if a < b {
                    let p = &rest[a + 1..b];
                    current_path = Some(p.replace("\\\\", "\\"));
                }
            }
        } else if line.starts_with(&format!("\"{DOTA_APPID}\"")) {
            if let Some(p) = current_path.clone() {
                return Some(PathBuf::from(p));
            }
        }
    }
    None
}

fn dota_cfg_dir(library: &PathBuf) -> PathBuf {
    library
        .join("steamapps")
        .join("common")
        .join("dota 2 beta")
        .join("game")
        .join("dota")
        .join("cfg")
        .join("gamestate_integration")
}

/// Check current setup state without modifying anything.
pub fn detect() -> SetupStatus {
    let Some(steam) = read_steam_path() else {
        return SetupStatus {
            installed: false,
            steam_path: None,
            dota_cfg_dir: None,
            cfg_present: false,
            message: "ไม่พบ Steam ในรีจิสทรี (HKCU\\Software\\Valve\\Steam). \
                      ติดตั้ง Steam แล้วลองใหม่อีกครั้ง."
                .into(),
        };
    };
    let steam_str = steam.to_string_lossy().to_string();
    let Some(library) = find_dota_library(&steam) else {
        return SetupStatus {
            installed: false,
            steam_path: Some(steam_str),
            dota_cfg_dir: None,
            cfg_present: false,
            message: "พบ Steam แล้ว แต่ยังไม่ได้ติดตั้ง Dota 2 (appid 570). \
                      ติดตั้ง Dota 2 จาก Steam แล้วลองใหม่อีกครั้ง."
                .into(),
        };
    };
    let dir = dota_cfg_dir(&library);
    let cfg = dir.join(CFG_NAME);
    let present = cfg.is_file();
    SetupStatus {
        installed: present,
        steam_path: Some(steam_str),
        dota_cfg_dir: Some(dir.to_string_lossy().to_string()),
        cfg_present: present,
        message: if present {
            "GSI config ติดตั้งแล้ว — เปิด Dota 2 ได้เลย.".into()
        } else {
            "พร้อมติดตั้ง GSI config ใน Dota 2 ของคุณ.".into()
        },
    }
}

/// Write our GSI cfg to the discovered Dota 2 directory. Returns the updated
/// status. Idempotent: rewriting the cfg is harmless and keeps the file in
/// sync if we ever change its contents.
pub fn install() -> SetupStatus {
    let mut s = detect();
    let Some(dir_str) = s.dota_cfg_dir.clone() else {
        return s;
    };
    let dir = PathBuf::from(&dir_str);
    if let Err(e) = fs::create_dir_all(&dir) {
        s.message = format!("สร้างโฟลเดอร์ cfg ไม่สำเร็จ: {e}");
        return s;
    }
    let cfg = dir.join(CFG_NAME);
    match fs::write(&cfg, CFG_BODY) {
        Ok(()) => {
            s.installed = true;
            s.cfg_present = true;
            s.message = format!("ติดตั้ง GSI config ที่ {} แล้ว.", cfg.to_string_lossy());
        }
        Err(e) => {
            s.message = format!("เขียนไฟล์ cfg ไม่สำเร็จ: {e}");
        }
    }
    s
}

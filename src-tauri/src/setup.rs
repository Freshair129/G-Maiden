//! G-Maiden first-run setup (G8.1 — installer companion).
//! Locates the user's Dota 2 install and writes our GSI config there so the
//! game starts POSTing to 127.0.0.1:3000 on next launch. No new Rust deps:
//! the Steam install path comes from `reg query`, the library that owns
//! Dota 2 (appid 570) is discovered by scanning `libraryfolders.vdf`.

use std::fs;
use std::io::Read;
use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use std::process::Command;

/// Win32 CREATE_NO_WINDOW — stop spawned console tools (tasklist, reg) from
/// flashing a cmd window. Critical for the 4s watchdog `tasklist` poll, which
/// otherwise pops a console every tick.
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

const DOTA_APPID: &str = "570";
const CFG_NAME: &str = "gamestate_integration_gmaiden.cfg";
const MAX_CFG_BYTES: usize = 64 * 1024;
const CFG_BODY: &str = r#""G-Maiden Integration"
{
    "uri"           "http://127.0.0.1:3000/gsi"
    "timeout"       "5.0"
    "buffer"        "0.1"
    "throttle"      "0.1"
    "heartbeat"     "1.0"
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
    pub cfg_valid: bool,
    pub message: String,
}

#[derive(Debug, PartialEq, Eq)]
enum KvToken {
    Text(String),
    Open,
    Close,
}

#[derive(Debug, PartialEq, Eq)]
enum KvEntry {
    Pair(String, String),
    Block(String, Vec<KvEntry>),
}

fn tokenize_keyvalues(text: &str) -> Result<Vec<KvToken>, ()> {
    let mut chars = text.trim_start_matches('\u{feff}').chars().peekable();
    let mut tokens = Vec::new();
    while let Some(ch) = chars.next() {
        if ch.is_whitespace() {
            continue;
        }
        if ch == '/' && chars.peek() == Some(&'/') {
            chars.next();
            for rest in chars.by_ref() {
                if rest == '\n' {
                    break;
                }
            }
            continue;
        }
        match ch {
            '{' => tokens.push(KvToken::Open),
            '}' => tokens.push(KvToken::Close),
            '"' => {
                let mut value = String::new();
                let mut closed = false;
                while let Some(next) = chars.next() {
                    match next {
                        '"' => {
                            closed = true;
                            break;
                        }
                        '\\' => {
                            let Some(escaped) = chars.next() else {
                                return Err(());
                            };
                            value.push(escaped);
                        }
                        _ => value.push(next),
                    }
                }
                if !closed {
                    return Err(());
                }
                tokens.push(KvToken::Text(value));
            }
            _ => {
                let mut value = String::from(ch);
                while let Some(&next) = chars.peek() {
                    if next.is_whitespace() || matches!(next, '{' | '}' | '"') {
                        break;
                    }
                    value.push(chars.next().expect("peeked character"));
                }
                tokens.push(KvToken::Text(value));
            }
        }
    }
    Ok(tokens)
}

fn parse_keyvalues_entries(
    tokens: &[KvToken],
    cursor: &mut usize,
    nested: bool,
    depth: u8,
) -> Result<Vec<KvEntry>, ()> {
    if depth > 16 {
        return Err(());
    }
    let mut entries = Vec::new();
    loop {
        let Some(token) = tokens.get(*cursor) else {
            return if nested { Err(()) } else { Ok(entries) };
        };
        let key = match token {
            KvToken::Text(key) => key.clone(),
            KvToken::Close if nested => {
                *cursor += 1;
                return Ok(entries);
            }
            _ => return Err(()),
        };
        *cursor += 1;
        match tokens.get(*cursor) {
            Some(KvToken::Text(value)) => {
                entries.push(KvEntry::Pair(key, value.clone()));
                *cursor += 1;
            }
            Some(KvToken::Open) => {
                *cursor += 1;
                entries.push(KvEntry::Block(
                    key,
                    parse_keyvalues_entries(tokens, cursor, true, depth + 1)?,
                ));
            }
            _ => return Err(()),
        }
    }
}

fn validate_gsi_config(text: &str) -> bool {
    if text.len() > MAX_CFG_BYTES {
        return false;
    }
    let Ok(tokens) = tokenize_keyvalues(text) else {
        return false;
    };
    let mut cursor = 0;
    let Ok(entries) = parse_keyvalues_entries(&tokens, &mut cursor, false, 0) else {
        return false;
    };
    if cursor != tokens.len() {
        return false;
    }
    let Some(KvEntry::Block(_, root)) = entries
        .iter()
        .find(|entry| {
            matches!(entry, KvEntry::Block(name, _) if name.eq_ignore_ascii_case("G-Maiden Integration"))
        })
    else {
        return false;
    };
    let pair_is = |entries: &[KvEntry], key: &str, value: &str| {
        entries.iter().any(|entry| {
            matches!(entry, KvEntry::Pair(candidate, actual) if candidate.eq_ignore_ascii_case(key) && actual == value)
        })
    };
    if !pair_is(root, "uri", "http://127.0.0.1:3000/gsi") {
        return false;
    }
    let mut heartbeat_count = 0;
    let mut heartbeat_ok = false;
    for entry in root {
        if let KvEntry::Pair(key, value) = entry {
            if key.eq_ignore_ascii_case("heartbeat") {
                heartbeat_count += 1;
                heartbeat_ok = value
                    .parse::<f64>()
                    .is_ok_and(|seconds| seconds.is_finite() && seconds > 0.0 && seconds <= 1.0);
                if !heartbeat_ok {
                    return false;
                }
            }
        }
    }
    if heartbeat_count != 1 || !heartbeat_ok {
        return false;
    }
    let Some(KvEntry::Block(_, data)) = root.iter().find(
        |entry| matches!(entry, KvEntry::Block(name, _) if name.eq_ignore_ascii_case("data")),
    ) else {
        return false;
    };
    ["provider", "map", "player", "hero", "abilities", "items"]
        .iter()
        .all(|key| pair_is(data, key, "1"))
}

/// Whether the Dota 2 client process is currently running. Used by the GSI
/// watchdog to reset connection state + close the G-Log when the game exits
/// (Dota just stops POSTing on close — it doesn't send a final out-of-game tick).
pub fn dota_running() -> bool {
    // tasklist filtered to the exact image name; if it's running the name shows
    // up in stdout, otherwise tasklist prints an "INFO: No tasks" line.
    let out = Command::new("tasklist")
        .args(["/FI", "IMAGENAME eq dota2.exe", "/NH"])
        .creation_flags(CREATE_NO_WINDOW)
        .output();
    match out {
        Ok(o) => String::from_utf8_lossy(&o.stdout)
            .to_lowercase()
            .contains("dota2.exe"),
        Err(_) => false,
    }
}

/// True when a *true* exclusive-fullscreen Direct3D app (e.g. Dota in "Exclusive
/// Fullscreen") is on screen. In that mode Windows bypasses the DWM compositor,
/// so our WGC minimap capture and the WebView2 overlay can't draw — and the
/// exclusive↔composited mode-thrash can freeze the whole desktop (observed). The
/// design forbids render-hook injection (R-06), so Borderless is required.
/// Borderless / Windowed (and Win10+ Fullscreen-Optimizations) stay
/// DWM-composited and do NOT trip this — a clean "switch to Borderless" signal.
pub fn exclusive_fullscreen_active() -> bool {
    use windows::Win32::UI::Shell::{SHQueryUserNotificationState, QUNS_RUNNING_D3D_FULL_SCREEN};
    // Read-only query of the shell's current notification state.
    matches!(
        unsafe { SHQueryUserNotificationState() },
        Ok(QUNS_RUNNING_D3D_FULL_SCREEN)
    )
}

fn read_steam_path() -> Option<PathBuf> {
    // Valve writes SteamPath with forward slashes — fine for std::path on Windows.
    let out = Command::new("reg")
        .args(["query", r"HKCU\Software\Valve\Steam", "/v", "SteamPath"])
        .creation_flags(CREATE_NO_WINDOW)
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

/// Scan libraryfolders.vdf text for the library that owns Dota 2 (appid 570).
/// Pure function (no I/O) so it can be exhaustively unit-tested. VDF is
/// structurally nested but we only need a flat scan: track the most recent
/// `"path"` and return it when we see the app id line inside the same block.
fn parse_dota_library(text: &str) -> Option<PathBuf> {
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

/// I/O wrapper: read libraryfolders.vdf from the Steam install and parse it.
fn find_dota_library(steam: &std::path::Path) -> Option<PathBuf> {
    let text = fs::read_to_string(steam.join("steamapps").join("libraryfolders.vdf")).ok()?;
    parse_dota_library(&text)
}

fn dota_cfg_dir(library: &std::path::Path) -> PathBuf {
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
            cfg_valid: false,
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
            cfg_valid: false,
            message: "พบ Steam แล้ว แต่ยังไม่ได้ติดตั้ง Dota 2 (appid 570). \
                      ติดตั้ง Dota 2 จาก Steam แล้วลองใหม่อีกครั้ง."
                .into(),
        };
    };
    let dir = dota_cfg_dir(&library);
    let cfg = dir.join(CFG_NAME);
    let present = cfg.is_file();
    let valid = if present {
        fs::File::open(&cfg)
            .ok()
            .and_then(|file| {
                let mut contents = String::new();
                file.take((MAX_CFG_BYTES + 1) as u64)
                    .read_to_string(&mut contents)
                    .ok()?;
                Some(validate_gsi_config(&contents))
            })
            .unwrap_or(false)
    } else {
        false
    };
    SetupStatus {
        installed: valid,
        steam_path: Some(steam_str),
        dota_cfg_dir: Some(dir.to_string_lossy().to_string()),
        cfg_present: present,
        cfg_valid: valid,
        message: if valid {
            "GSI config ติดตั้งแล้ว — เปิด Dota 2 ได้เลย.".into()
        } else if present {
            "พบ GSI config แต่รูปแบบหรือปลายทางไม่ถูกต้อง กดซ่อมไฟล์เพื่อใช้ค่าที่ G-Maiden รองรับ.".into()
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
            s.cfg_valid = true;
            s.message = format!("ติดตั้ง GSI config ที่ {} แล้ว.", cfg.to_string_lossy());
        }
        Err(e) => {
            s.message = format!("เขียนไฟล์ cfg ไม่สำเร็จ: {e}");
        }
    }
    s
}

#[cfg(test)]
mod tests {
    use super::*;

    // Real-shape VDF fixture from a single-library Windows install — same format
    // we see on the test machine, with Dota 2 (570) inside.
    const VDF_SINGLE: &str = r#""libraryfolders"
{
    "0"
    {
        "path"		"D:\\steam"
        "label"		""
        "contentid"	"688021015348573715"
        "apps"
        {
            "570"		"72601154005"
            "228980"	"161787441"
        }
    }
}"#;

    // Two libraries; Dota 2 is only in the second one. Tests that the `path`
    // tracking honors block boundaries (returns the right library, not the first).
    const VDF_MULTI: &str = r#""libraryfolders"
{
    "0"
    {
        "path"		"C:\\Program Files (x86)\\Steam"
        "apps"
        {
            "292030"	"123"
        }
    }
    "1"
    {
        "path"		"E:\\SteamLibrary"
        "apps"
        {
            "570"		"72601154005"
        }
    }
}"#;

    // No Dota 2 in any library.
    const VDF_NO_DOTA: &str = r#""libraryfolders"
{
    "0"
    {
        "path"		"C:\\Steam"
        "apps"
        {
            "292030"	"123"
        }
    }
}"#;

    #[test]
    fn parses_single_library() {
        assert_eq!(
            parse_dota_library(VDF_SINGLE),
            Some(PathBuf::from("D:\\steam"))
        );
    }

    #[test]
    fn picks_correct_library_when_dota_is_in_the_second() {
        assert_eq!(
            parse_dota_library(VDF_MULTI),
            Some(PathBuf::from("E:\\SteamLibrary"))
        );
    }

    #[test]
    fn returns_none_when_dota_not_installed() {
        assert_eq!(parse_dota_library(VDF_NO_DOTA), None);
    }

    #[test]
    fn returns_none_on_empty_or_malformed_vdf() {
        assert_eq!(parse_dota_library(""), None);
        assert_eq!(parse_dota_library("garbage \"570\""), None); // 570 without a prior path block
        assert_eq!(parse_dota_library("\"path\" \"D:\\\\steam\""), None); // path but no 570
    }

    #[test]
    fn cfg_dir_layout_is_dota_specific() {
        let library = PathBuf::from("D:\\steam");
        let dir = dota_cfg_dir(&library);
        let s = dir.to_string_lossy().replace('/', "\\");
        // Must hit the exact spot Dota 2 scans for GSI configs.
        assert!(
            s.ends_with("\\steamapps\\common\\dota 2 beta\\game\\dota\\cfg\\gamestate_integration")
        );
    }

    #[test]
    fn accepts_the_installed_gsi_config() {
        assert!(validate_gsi_config(CFG_BODY));
    }

    #[test]
    fn requires_a_heartbeat_that_can_satisfy_freshness_contract() {
        assert!(validate_gsi_config(&CFG_BODY.replace("\"1.0\"", "\"0.5\"")));
        assert!(!validate_gsi_config(&CFG_BODY.replace("\"1.0\"", "\"2.1\"")));
        assert!(!validate_gsi_config(&CFG_BODY.replace("\"1.0\"", "\"30.0\"")));
        assert!(!validate_gsi_config(&CFG_BODY.replace("\"1.0\"", "\"NaN\"")));
        let duplicate_heartbeat = CFG_BODY.replace(
            "\"heartbeat\"     \"1.0\"",
            "\"heartbeat\"     \"1.0\"\n    \"heartbeat\"     \"30.0\"",
        );
        assert!(!validate_gsi_config(&duplicate_heartbeat));
    }

    #[test]
    fn legacy_thirty_second_config_is_invalid_and_installer_config_repairs_it() {
        let legacy = CFG_BODY.replace("\"1.0\"", "\"30.0\"");
        assert!(!validate_gsi_config(&legacy));
        assert!(validate_gsi_config(CFG_BODY));
        assert!(CFG_BODY.contains("\"heartbeat\"     \"1.0\""));
    }

    #[test]
    fn accepts_valid_whitespace_and_comments() {
        let edited = CFG_BODY.replace("\"timeout\"", "// local note\n    \"timeout\"");
        assert!(validate_gsi_config(&edited));
    }

    #[test]
    fn rejects_wrong_endpoint_and_missing_data_fields() {
        assert!(!validate_gsi_config(
            &CFG_BODY.replace("127.0.0.1:3000", "127.0.0.1:3001")
        ));
        assert!(!validate_gsi_config(
            &CFG_BODY.replace("\"items\"", "\"unused\"")
        ));
    }

    #[test]
    fn rejects_malformed_keyvalues() {
        let mut malformed = CFG_BODY.to_string();
        let last_close = malformed.rfind('}').expect("config has a closing brace");
        malformed.remove(last_close);
        assert!(!validate_gsi_config(&malformed));
        assert!(!validate_gsi_config(
            "\"G-Maiden Integration\" { \"uri\" \"unterminated }"
        ));
    }

    #[test]
    fn rejects_oversized_and_deeply_nested_configs() {
        assert!(!validate_gsi_config(&"x".repeat(MAX_CFG_BYTES + 1)));
        let nested = format!("{}\"G-Maiden Integration\" {{}}", "\"x\" { ".repeat(17));
        assert!(!validate_gsi_config(&nested));
    }
}

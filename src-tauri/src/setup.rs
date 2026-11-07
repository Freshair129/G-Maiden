//! G-Maiden first-run setup (G8.1 — installer companion).
//! Locates the user's Dota 2 install and writes our GSI config there so the
//! game starts POSTing to 127.0.0.1:3000 on next launch. No new Rust deps:
//! the Steam install path comes from `reg query`, the library that owns
//! Dota 2 (appid 570) is discovered by scanning `libraryfolders.vdf`.

use std::fs;
use std::io::Read;
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::Command;

#[path = "process_snapshot.rs"]
mod process_snapshot;

/// Win32 CREATE_NO_WINDOW — keep registry queries out of the desktop.
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

fn cfg_body_for_port(port: u16) -> String {
    CFG_BODY.replace("127.0.0.1:3000/gsi", &format!("127.0.0.1:{port}/gsi"))
}

fn repair_config_port(text: &str, port: u16) -> Result<Option<String>, String> {
    for previous in crate::local_endpoint::PORT_START..=crate::local_endpoint::PORT_END {
        if !validate_gsi_config_for_port(text, previous) {
            continue;
        }
        if previous == port {
            return Ok(None);
        }
        let uri = format!("http://127.0.0.1:{previous}/gsi");
        if text.matches(&uri).count() != 1 {
            return Err("GSI config มี URI ซ้ำหรือกำกวม จึงไม่แก้ไขอัตโนมัติ".into());
        }
        return Ok(Some(text.replacen(
            &uri,
            &format!("http://127.0.0.1:{port}/gsi"),
            1,
        )));
    }
    Ok(None)
}

#[cfg(test)]
fn validate_gsi_config(text: &str) -> bool {
    validate_gsi_config_for_port(text, 3000)
}

fn validate_gsi_config_for_port(text: &str, port: u16) -> bool {
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
    let uri_count = root
        .iter()
        .filter(|entry| matches!(entry, KvEntry::Pair(key, _) if key.eq_ignore_ascii_case("uri")))
        .count();
    if uri_count != 1 || !pair_is(root, "uri", &format!("http://127.0.0.1:{port}/gsi")) {
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
    dota_running_status().unwrap_or(false)
}

/// Unlike the display watchdog, update admission must distinguish probe failure.
pub fn dota_running_status() -> Option<bool> {
    process_snapshot::image_running("dota2.exe")
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

fn dota_install_dir(library: &std::path::Path) -> PathBuf {
    library.join("steamapps").join("common").join("dota 2 beta")
}

fn dota_cfg_dir(install_dir: &std::path::Path) -> PathBuf {
    install_dir
        .join("game")
        .join("dota")
        .join("cfg")
        .join("gamestate_integration")
}

fn integration_file(name: &str) -> Option<PathBuf> {
    std::env::var_os("LOCALAPPDATA").map(|path| PathBuf::from(path).join("G-Maiden").join(name))
}

pub fn publish_gsi_port(port: u16) -> Result<(), String> {
    let file = integration_file("gsi-port.txt").ok_or("LocalAppData unavailable")?;
    fs::create_dir_all(file.parent().ok_or("invalid port file")?).map_err(|e| e.to_string())?;
    fs::write(file, format!("{port}\n")).map_err(|e| e.to_string())
}

pub fn clear_published_gsi_port(port: u16) {
    if let Some(file) = integration_file("gsi-port.txt") {
        if fs::read_to_string(&file)
            .ok()
            .is_some_and(|body| body.trim() == port.to_string())
        {
            let _ = fs::remove_file(file);
        }
    }
}

static SELECTION_READY: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
static CONFIG_SYNC: std::sync::Mutex<()> = std::sync::Mutex::new(());

fn gsi_config_writes_disabled(isolated_smoke: bool) -> bool {
    isolated_smoke || crate::secret::is_mvp009_isolated_smoke_process()
}

pub fn set_dota_selection(selected: Option<&str>) -> Result<bool, String> {
    let isolated_smoke = crate::secret::is_mvp009_isolated_smoke_process();
    if gsi_config_writes_disabled(isolated_smoke) {
        return Ok(false);
    }
    let file = integration_file("gsi-dota-path.txt").ok_or("LocalAppData unavailable")?;
    set_dota_selection_at(&file, selected, isolated_smoke, sync_selected_config)
}

fn set_dota_selection_at(
    file: &Path,
    selected: Option<&str>,
    isolated_smoke: bool,
    sync: impl FnOnce() -> Result<bool, String>,
) -> Result<bool, String> {
    if gsi_config_writes_disabled(isolated_smoke) {
        return Ok(false);
    }
    let _guard = CONFIG_SYNC.lock().map_err(|_| "GSI setup is unavailable")?;
    let root = selected
        .map(|path| validate_dota_install_dir(std::path::Path::new(path)))
        .transpose()?;
    write_selected_root(file, root.as_deref())?;
    SELECTION_READY.store(true, std::sync::atomic::Ordering::Release);
    match sync() {
        Ok(changed) => Ok(changed),
        Err(error) => {
            eprintln!("[G-Maiden] selected Dota config needs repair: {error}");
            Ok(false)
        }
    }
}

fn write_selected_root(
    file: &std::path::Path,
    root: Option<&std::path::Path>,
) -> Result<(), String> {
    if let Some(root) = root {
        fs::create_dir_all(file.parent().ok_or("invalid setup file")?)
            .map_err(|e| e.to_string())?;
        fs::write(file, root.to_string_lossy().as_bytes()).map_err(|e| e.to_string())
    } else {
        match fs::remove_file(file) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(error.to_string()),
        }
    }
}

fn saved_install_root() -> Result<Option<PathBuf>, String> {
    let file = integration_file("gsi-dota-path.txt").ok_or("LocalAppData unavailable")?;
    let text = match fs::read_to_string(file) {
        Ok(text) => text,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.to_string()),
    };
    let path = PathBuf::from(text.trim());
    // Older setup saved game/dota. An invalid remembered selection must never
    // silently redirect automatic repair to another Steam installation.
    validate_dota_install_dir(&path)
        .or_else(|_| {
            let root = path
                .parent()
                .and_then(|p| p.parent())
                .ok_or("Invalid saved Dota selection")?;
            validate_dota_install_dir(root)
        })
        .map(Some)
}

pub fn sync_gsi_config_port() -> Result<bool, String> {
    sync_gsi_config_port_with_policy(
        crate::secret::is_mvp009_isolated_smoke_process(),
        &CONFIG_SYNC,
        || SELECTION_READY.load(std::sync::atomic::Ordering::Acquire),
        sync_selected_config,
    )
}

fn sync_gsi_config_port_with_policy(
    isolated_smoke: bool,
    sync_lock: &std::sync::Mutex<()>,
    selection_ready: impl FnOnce() -> bool,
    sync: impl FnOnce() -> Result<bool, String>,
) -> Result<bool, String> {
    if gsi_config_writes_disabled(isolated_smoke) {
        return Ok(false);
    }
    let _guard = sync_lock.lock().map_err(|_| "GSI setup is unavailable")?;
    if !selection_ready() {
        return Ok(false);
    }
    sync()
}

fn sync_selected_config() -> Result<bool, String> {
    sync_selected_config_with_policy(crate::secret::is_mvp009_isolated_smoke_process())
}

fn sync_selected_config_with_policy(isolated_smoke: bool) -> Result<bool, String> {
    if gsi_config_writes_disabled(isolated_smoke) {
        return Ok(false);
    }
    let saved = saved_install_root()?;
    let selected = saved
        .as_ref()
        .map(|path| path.to_string_lossy().to_string());
    let (_, root) =
        resolve_dota_install_dir(selected.as_deref()).map_err(|status| status.message)?;
    sync_config_at_root_with_policy(
        &root,
        crate::local_endpoint::current_port(),
        isolated_smoke,
    )
}

#[cfg(test)]
fn sync_config_at_root(root: &std::path::Path, port: u16) -> Result<bool, String> {
    sync_config_at_root_with_policy(
        root,
        port,
        crate::secret::is_mvp009_isolated_smoke_process(),
    )
}

fn sync_config_at_root_with_policy(
    root: &std::path::Path,
    port: u16,
    isolated_smoke: bool,
) -> Result<bool, String> {
    if gsi_config_writes_disabled(isolated_smoke) {
        return Ok(false);
    }
    let cfg = resolve_cfg_dir(root, false)?.join(CFG_NAME);
    let path = match fs::canonicalize(&cfg) {
        Ok(path) if path.starts_with(root) => path,
        Ok(_) => return Err("GSI config points outside Dota install".into()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(false),
        Err(error) => return Err(error.to_string()),
    };
    let mut text = String::new();
    fs::File::open(&path)
        .map_err(|e| e.to_string())?
        .take((MAX_CFG_BYTES + 1) as u64)
        .read_to_string(&mut text)
        .map_err(|e| e.to_string())?;
    let Some(updated) = repair_config_port(&text, port)? else {
        return Ok(false);
    };
    fs::write(path, updated).map_err(|e| e.to_string())?;
    Ok(true)
}

fn empty_status(steam_path: Option<String>, message: String) -> SetupStatus {
    SetupStatus {
        installed: false,
        steam_path,
        dota_cfg_dir: None,
        cfg_present: false,
        cfg_valid: false,
        message,
    }
}

fn status_at_root_with_error(
    steam_path: Option<String>,
    root: &std::path::Path,
    message: String,
) -> SetupStatus {
    let root_string = root.to_string_lossy().to_string();
    let mut status = detect(Some(&root_string));
    status.steam_path = steam_path;
    status.message = message;
    status
}

/// Accept only a Dota 2 install root. The game executable and config tree are
/// both checked after canonicalization so a user-selected junction cannot
/// redirect the config write outside the selected game folder.
fn validate_dota_install_dir(path: &std::path::Path) -> Result<PathBuf, String> {
    let root = fs::canonicalize(path)
        .map_err(|_| "ไม่พบโฟลเดอร์นี้ เลือกโฟลเดอร์ Dota 2 beta ที่มีโฟลเดอร์ game อยู่ด้านใน.".to_string())?;
    if !root.is_dir() {
        return Err("ตำแหน่งที่เลือกไม่ใช่โฟลเดอร์ Dota 2.".into());
    }
    let game_dir = root.join("game");
    let dota_dir = game_dir.join("dota");
    let executable = game_dir.join("bin").join("win64").join("dota2.exe");
    for required in [&game_dir, &dota_dir, &executable] {
        let resolved = fs::canonicalize(required).map_err(|_| {
            "ไม่พบไฟล์เกม Dota 2 ในตำแหน่งนี้ เลือกโฟลเดอร์ Dota 2 beta แล้วลองอีกครั้ง.".to_string()
        })?;
        if !resolved.starts_with(&root) {
            return Err("ตำแหน่ง Dota 2 อ้างอิงออกนอกโฟลเดอร์เกม จึงไม่สามารถเขียน GSI config ได้.".into());
        }
    }
    if !dota_dir.is_dir() || !executable.is_file() {
        return Err(
            "โฟลเดอร์ที่เลือกไม่มีไฟล์เกม Dota 2 ที่จำเป็น เลือกโฟลเดอร์ Dota 2 beta แล้วลองอีกครั้ง.".into(),
        );
    }
    Ok(root)
}

/// Resolve either the explicitly selected game root or the Steam library that
/// owns appid 570. A failed lookup returns actionable UI text and never writes.
fn resolve_dota_install_dir(
    selected_install_dir: Option<&str>,
) -> Result<(Option<String>, PathBuf), SetupStatus> {
    if let Some(selected) = selected_install_dir
        .map(str::trim)
        .filter(|path| !path.is_empty())
    {
        return validate_dota_install_dir(std::path::Path::new(selected))
            .map(|root| (None, root))
            .map_err(|message| empty_status(None, message));
    }

    let Some(steam) = read_steam_path() else {
        return Err(empty_status(
            None,
            "ไม่พบ Steam ในรีจิสทรี (HKCU\\Software\\Valve\\Steam). ติดตั้ง Steam หรือเลือกโฟลเดอร์ Dota 2 ด้วยตนเอง.".into(),
        ));
    };
    let steam_path = steam.to_string_lossy().to_string();
    let Some(library) = find_dota_library(&steam) else {
        return Err(empty_status(
            Some(steam_path),
            "พบ Steam แล้ว แต่ไม่พบ Dota 2 (appid 570) ใน libraryfolders.vdf. ติดตั้งเกมหรือเลือกโฟลเดอร์ Dota 2 ด้วยตนเอง.".into(),
        ));
    };
    let install_dir = dota_install_dir(&library);
    validate_dota_install_dir(&install_dir)
        .map(|root| (Some(steam_path.clone()), root))
        .map_err(|_| {
            empty_status(
                Some(steam_path),
                "Steam ระบุตำแหน่ง Dota 2 ที่ไม่มีไฟล์เกมครบ อาจย้ายหรือติดตั้งใหม่แล้ว เลือกโฟลเดอร์ Dota 2 beta เพื่อแก้ตำแหน่ง.".into(),
            )
        })
}

/// Resolve every existing component of the config directory before creating
/// the rest. This rejects directory symlinks/junctions that leave the game root.
fn resolve_cfg_dir(root: &std::path::Path, create: bool) -> Result<PathBuf, String> {
    let candidate = dota_cfg_dir(root);
    let relative = candidate
        .strip_prefix(root)
        .map_err(|_| "ตำแหน่ง GSI config อยู่นอกโฟลเดอร์ Dota 2.".to_string())?;
    let mut resolved = root.to_path_buf();
    for component in relative.components() {
        let next = resolved.join(component);
        if next.exists() {
            let canonical = fs::canonicalize(&next)
                .map_err(|e| format!("ตรวจตำแหน่ง GSI config ไม่สำเร็จ: {e}"))?;
            if !canonical.starts_with(root) {
                return Err("ตำแหน่ง GSI config อ้างอิงออกนอกโฟลเดอร์เกม จึงไม่สามารถเขียนได้.".into());
            }
            resolved = canonical;
        } else if create {
            fs::create_dir(&next).map_err(|e| format!("สร้างโฟลเดอร์ cfg ไม่สำเร็จ: {e}"))?;
            let canonical = fs::canonicalize(&next)
                .map_err(|e| format!("ตรวจตำแหน่ง GSI config ไม่สำเร็จ: {e}"))?;
            if !canonical.starts_with(root) {
                return Err("ตำแหน่ง GSI config อ้างอิงออกนอกโฟลเดอร์เกม จึงไม่สามารถเขียนได้.".into());
            }
            resolved = canonical;
        } else {
            return Ok(candidate);
        }
    }
    Ok(resolved)
}

/// Check current setup state without modifying anything.
pub fn detect(selected_install_dir: Option<&str>) -> SetupStatus {
    let (steam_path, root) = match resolve_dota_install_dir(selected_install_dir) {
        Ok(resolved) => resolved,
        Err(status) => return status,
    };
    let dir = match resolve_cfg_dir(&root, false) {
        Ok(dir) => dir,
        Err(message) => return empty_status(steam_path, message),
    };
    let cfg = dir.join(CFG_NAME);
    let present = cfg.is_file();
    let valid = if present {
        fs::canonicalize(&cfg)
            .ok()
            .filter(|path| path.starts_with(&root))
            .and_then(|_| fs::File::open(&cfg).ok())
            .and_then(|file| {
                let mut contents = String::new();
                file.take((MAX_CFG_BYTES + 1) as u64)
                    .read_to_string(&mut contents)
                    .ok()?;
                Some(validate_gsi_config_for_port(
                    &contents,
                    crate::local_endpoint::current_port(),
                ))
            })
            .unwrap_or(false)
    } else {
        false
    };
    SetupStatus {
        installed: valid,
        steam_path,
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

/// Write our GSI cfg only under a validated Dota 2 install root.
pub fn install(selected_install_dir: Option<&str>) -> SetupStatus {
    install_with_policy(
        selected_install_dir,
        crate::secret::is_mvp009_isolated_smoke_process(),
    )
}

fn install_with_policy(selected_install_dir: Option<&str>, isolated_smoke: bool) -> SetupStatus {
    if gsi_config_writes_disabled(isolated_smoke) {
        return empty_status(
            None,
            "Dota GSI config writes are disabled in isolated smoke mode.".into(),
        );
    }
    let (steam_path, root) = match resolve_dota_install_dir(selected_install_dir) {
        Ok(resolved) => resolved,
        Err(status) => return status,
    };
    let dir = match resolve_cfg_dir(&root, true) {
        Ok(dir) => dir,
        Err(message) => return status_at_root_with_error(steam_path, &root, message),
    };
    let cfg = dir.join(CFG_NAME);
    match fs::symlink_metadata(&cfg) {
        Ok(metadata) if metadata.file_type().is_symlink() => {
            if let Err(error) = fs::remove_file(&cfg) {
                return status_at_root_with_error(
                    steam_path,
                    &root,
                    format!("ไฟล์ GSI config เป็นลิงก์และลบเพื่อซ่อมไม่ได้: {error} เปิดโฟลเดอร์ config ใน Explorer แล้วลบเฉพาะไฟล์ {CFG_NAME} ก่อนลองใหม่."),
                );
            }
        }
        Ok(_) => {
            let Ok(existing) = fs::canonicalize(&cfg) else {
                return status_at_root_with_error(
                    steam_path,
                    &root,
                    "ตรวจไฟล์ GSI config เดิมไม่สำเร็จ จึงไม่เขียนทับ.".into(),
                );
            };
            if !existing.starts_with(&root) {
                return status_at_root_with_error(
                    steam_path,
                    &root,
                    "ไฟล์ GSI config อ้างอิงออกนอกโฟลเดอร์เกม จึงไม่เขียนทับ.".into(),
                );
            }
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => {
            return status_at_root_with_error(
                steam_path,
                &root,
                format!("ตรวจไฟล์ GSI config เดิมไม่สำเร็จ: {error}"),
            );
        }
    }
    match fs::write(
        &cfg,
        cfg_body_for_port(crate::local_endpoint::current_port()),
    ) {
        Ok(()) => {
            let root_string = root.to_string_lossy().to_string();
            let mut status = detect(Some(&root_string));
            status.steam_path = steam_path;
            status
        }
        Err(e) => status_at_root_with_error(
            steam_path,
            &root,
            format!("เขียนไฟล์ cfg ไม่สำเร็จ: {e} ตรวจสิทธิ์ของโฟลเดอร์ใน Explorer แล้วลองอีกครั้ง."),
        ),
    }
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
        let install = PathBuf::from("D:\\steam\\steamapps\\common\\dota 2 beta");
        let dir = dota_cfg_dir(&install);
        let s = dir.to_string_lossy().replace('/', "\\");
        // Must hit the exact spot Dota 2 scans for GSI configs.
        assert!(s.ends_with("\\dota 2 beta\\game\\dota\\cfg\\gamestate_integration"));
    }

    fn fake_dota_install() -> PathBuf {
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("gmaiden-dota-setup-{unique}"));
        fs::create_dir_all(root.join("game/dota")).unwrap();
        fs::create_dir_all(root.join("game/bin/win64")).unwrap();
        fs::write(root.join("game/bin/win64/dota2.exe"), b"fixture").unwrap();
        root
    }

    #[test]
    fn selected_install_path_must_contain_the_dota_executable_and_config_tree() {
        let root = fake_dota_install();
        let selected = validate_dota_install_dir(&root).unwrap();
        assert_eq!(selected, fs::canonicalize(&root).unwrap());
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn selected_arbitrary_folder_is_rejected_without_a_config_target() {
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("gmaiden-not-dota-{unique}"));
        fs::create_dir_all(&root).unwrap();
        let root_text = root.to_string_lossy().to_string();
        let status = detect(Some(&root_text));
        assert!(!status.installed);
        assert!(status.dota_cfg_dir.is_none());
        assert!(status.message.contains("ไฟล์เกม Dota 2"));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn selected_path_install_writes_only_to_the_gsi_config_location() {
        let root = fake_dota_install();
        let root_text = root.to_string_lossy().to_string();
        let status = install(Some(&root_text));
        assert!(status.installed, "{}", status.message);
        let config = root
            .join("game/dota/cfg/gamestate_integration")
            .join(CFG_NAME);
        assert_eq!(fs::read_to_string(&config).unwrap(), CFG_BODY);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn install_failure_keeps_the_repair_location_visible() {
        let root = fake_dota_install();
        let canonical_root = fs::canonicalize(&root).unwrap();
        let config_dir = dota_cfg_dir(&canonical_root);
        fs::create_dir_all(config_dir.join(CFG_NAME)).unwrap();
        let root_text = root.to_string_lossy().to_string();
        let status = install(Some(&root_text));
        let expected_config_dir = config_dir.to_string_lossy().to_string();
        assert!(!status.installed);
        assert_eq!(
            status.dota_cfg_dir.as_deref(),
            Some(expected_config_dir.as_str())
        );
        assert!(status.message.contains("Explorer"));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn accepts_the_installed_gsi_config() {
        assert!(validate_gsi_config(CFG_BODY));
    }

    #[test]
    fn requires_a_heartbeat_that_can_satisfy_freshness_contract() {
        assert!(validate_gsi_config(&CFG_BODY.replace("\"1.0\"", "\"0.5\"")));
        assert!(!validate_gsi_config(
            &CFG_BODY.replace("\"1.0\"", "\"2.1\"")
        ));
        assert!(!validate_gsi_config(
            &CFG_BODY.replace("\"1.0\"", "\"30.0\"")
        ));
        assert!(!validate_gsi_config(
            &CFG_BODY.replace("\"1.0\"", "\"NaN\"")
        ));
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

    #[test]
    fn selected_port_render_validation_and_preserving_repair() {
        let body = cfg_body_for_port(3007);
        assert!(body.contains("127.0.0.1:3007/gsi"));
        assert!(validate_gsi_config_for_port(&body, 3007));
        assert!(!validate_gsi_config_for_port(&body, 3000));
        let original = CFG_BODY.replace("\"timeout\"", "// keep my note\n    \"timeout\"");
        let updated = repair_config_port(&original, 3002).unwrap().unwrap();
        assert!(updated.contains("// keep my note"));
        assert!(validate_gsi_config_for_port(&updated, 3002));
        assert!(repair_config_port(&updated, 3002).unwrap().is_none());
        let manual = CFG_BODY.replace("127.0.0.1:3000/gsi", "localhost:9000/manual");
        assert!(repair_config_port(&manual, 3002).unwrap().is_none());
    }

    #[test]
    fn port_repair_changes_only_selected_validated_install() {
        let first = fake_dota_install();
        let second = fake_dota_install();
        let first = fs::canonicalize(first).unwrap();
        let second = fs::canonicalize(second).unwrap();
        for root in [&first, &second] {
            let dir = resolve_cfg_dir(root, true).unwrap();
            fs::write(dir.join(CFG_NAME), CFG_BODY).unwrap();
        }
        assert!(sync_config_at_root(&first, 3004).unwrap());
        assert!(fs::read_to_string(dota_cfg_dir(&first).join(CFG_NAME))
            .unwrap()
            .contains(":3004/gsi"));
        assert_eq!(
            fs::read_to_string(dota_cfg_dir(&second).join(CFG_NAME)).unwrap(),
            CFG_BODY
        );
        fs::remove_dir_all(first).unwrap();
        fs::remove_dir_all(second).unwrap();
    }

    #[test]
    fn isolated_smoke_blocks_every_gsi_config_write_path_without_process_env_changes() {
        let root = fs::canonicalize(fake_dota_install()).unwrap();
        let config_dir = resolve_cfg_dir(&root, true).unwrap();
        let config = config_dir.join(CFG_NAME);
        let original = CFG_BODY.replace("127.0.0.1:3000/gsi", "127.0.0.1:3001/gsi");
        fs::write(&config, &original).unwrap();

        let selection_file = root.join("preferences/selection.txt");
        fs::create_dir_all(selection_file.parent().unwrap()).unwrap();
        fs::write(&selection_file, "remembered selection").unwrap();
        let selection_before = fs::read(&selection_file).unwrap();
        let config_before = fs::read(&config).unwrap();
        let mut selection_sync_called = false;

        assert!(!set_dota_selection_at(&selection_file, None, true, || {
            selection_sync_called = true;
            Ok(false)
        })
        .unwrap());
        assert!(!selection_sync_called);
        assert_eq!(fs::read(&selection_file).unwrap(), selection_before);

        let port_sync_lock = std::sync::Mutex::new(());
        let mut port_sync_called = false;
        assert!(!sync_gsi_config_port_with_policy(
            true,
            &port_sync_lock,
            || true,
            || {
                port_sync_called = true;
                sync_config_at_root_with_policy(&root, 3002, false)
            }
        )
        .unwrap());
        assert!(!port_sync_called);

        assert!(!sync_config_at_root_with_policy(&root, 3003, true).unwrap());
        let root_text = root.to_string_lossy().to_string();
        let status = install_with_policy(Some(&root_text), true);
        assert!(!status.installed);
        assert_eq!(fs::read(&config).unwrap(), config_before);

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn port_sync_checks_selection_readiness_after_acquiring_the_config_lock() {
        let config_sync = std::sync::Mutex::new(());
        let mut readiness_was_checked_under_lock = false;
        let mut sync_called = false;

        let changed = sync_gsi_config_port_with_policy(
            false,
            &config_sync,
            || {
                readiness_was_checked_under_lock = matches!(
                    config_sync.try_lock(),
                    Err(std::sync::TryLockError::WouldBlock)
                );
                false
            },
            || {
                sync_called = true;
                Ok(true)
            },
        )
        .unwrap();

        assert!(!changed);
        assert!(readiness_was_checked_under_lock);
        assert!(!sync_called);
    }

    #[test]
    fn selected_root_persistence_replaces_and_clears_the_exact_selection_file() {
        let root = fake_dota_install();
        let file = root.join("preferences/selection.txt");
        let first = root.join("first");
        let second = root.join("second");
        write_selected_root(&file, Some(&first)).unwrap();
        assert_eq!(fs::read_to_string(&file).unwrap(), first.to_string_lossy());
        write_selected_root(&file, Some(&second)).unwrap();
        assert_eq!(fs::read_to_string(&file).unwrap(), second.to_string_lossy());
        write_selected_root(&file, None).unwrap();
        assert!(!file.exists());
        write_selected_root(&file, None).unwrap();
        fs::remove_dir_all(root).unwrap();
    }
}

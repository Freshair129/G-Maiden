//! Tauri-facing voice-pack commands: state assembly, pack lifecycle
//! (create/import/upload/map/update), and the two small readers the live
//! audio + GSI paths call per event. Split out of the original
//! `voice_api.rs` monolith (facade refactor, no behavior change).

use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::Duration;

use crate::audio;

use super::events::GROUPS;
use super::pack_io::{
    self, read_active_pack_id, read_manifest, sanitize_file_name, sanitize_id, write_active_pack_id,
    write_bytes, write_manifest, ManifestMapping, StoreInstallRecord,
};
use super::paths::{create_pack_skeleton, discover_pack_dirs, pack_dir, packs_dir, voice_root};
use super::types::{
    ImportResult, MapEventRequest, UpdatePackRequest, UploadResult, VoiceGroup, VoiceState,
    DEFAULT_PACK_ID,
};

const STORE_SUPABASE_URL: &str = "https://wsseitulmcgnolgsrxgh.supabase.co";
const STORE_PUBLISHABLE_KEY: &str = "sb_publishable__vr0-aNdudlq3aPbH8OMXw_0rr0JScZ";
const MAX_ARCHIVE_BYTES: usize = 32 * 1024 * 1024;
const MAX_EXPANDED_BYTES: u64 = 96 * 1024 * 1024;

#[derive(serde::Deserialize)]
struct StoreDownloadGrant {
    item_id: String,
    pack_id: String,
    url: String,
    install_receipt: StoreInstallRecord,
}

/// Consumer builds may only author packs in a development build. Store install
/// uses the private internal importer below after server-side purchase checks.
pub fn ensure_dev_authoring() -> Result<(), String> {
    if cfg!(debug_assertions) {
        Ok(())
    } else {
        Err("การสร้างหรือนำเข้าแพ็กเสียงทำได้ใน G-AnnStudio; ติดตั้งแพ็กสำหรับผู้ใช้จาก Store เท่านั้น".into())
    }
}

/// A pack is trusted by the consumer UI/runtime only when its installation
/// came through the Store command. Development builds retain local authoring.
pub fn is_store_installed(pack_id: &str) -> bool {
    pack_id == DEFAULT_PACK_ID || cfg!(debug_assertions) || pack_io::is_store_installed(pack_id)
}

/// Ask the server to authorize the signed-in user, download the private bundle
/// from the fixed Supabase host, and install only the pack id returned by the
/// server. The WebView never supplies archive bytes or a storage URL.
pub fn install_store_pack(item_id: &str, access_token: &str) -> Result<VoiceState, String> {
    if !is_uuid(item_id) {
        return Err("รหัสไอเทม Store ไม่ถูกต้อง".into());
    }
    if access_token.trim().is_empty() || access_token.len() > 16 * 1024 {
        return Err("ไม่พบเซสชัน Store ที่ใช้งานได้ กรุณาเข้าสู่ระบบใหม่".into());
    }

    let client = reqwest::blocking::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(45))
        .build()
        .map_err(|e| format!("สร้างการเชื่อมต่อ Store ไม่สำเร็จ: {e}"))?;
    let grant_response = client
        .post(format!("{STORE_SUPABASE_URL}/functions/v1/pack-download"))
        .header("apikey", STORE_PUBLISHABLE_KEY)
        .bearer_auth(access_token)
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .body(serde_json::json!({ "item_id": item_id }).to_string())
        .send()
        .map_err(|_| "ติดต่อ Store ไม่ได้ กรุณาลองอีกครั้ง".to_string())?;
    let grant_status = grant_response.status();
    if !grant_status.is_success() {
        return Err(match grant_status.as_u16() {
            401 => "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่".into(),
            403 => "แพ็กนี้ยังไม่ได้ซื้อจาก Store ด้วยบัญชีนี้".into(),
            _ => "Store ยังไม่อนุญาตให้ดาวน์โหลดแพ็กนี้".into(),
        });
    }
    if grant_response
        .content_length()
        .is_some_and(|length| length > 64 * 1024)
    {
        return Err("Store ส่งคำตอบที่มีขนาดเกินกำหนด".into());
    }
    let mut grant_response = grant_response;
    let mut grant_body = Vec::new();
    grant_response
        .by_ref()
        .take(64 * 1024 + 1)
        .read_to_end(&mut grant_body)
        .map_err(|_| "อ่านคำตอบจาก Store ไม่สำเร็จ".to_string())?;
    if grant_body.len() > 64 * 1024 {
        return Err("Store ส่งคำตอบที่มีขนาดเกินกำหนด".into());
    }
    let grant: StoreDownloadGrant = serde_json::from_slice(&grant_body)
        .map_err(|_| "คำตอบจาก Store มีรูปแบบไม่ถูกต้อง".to_string())?;
    if grant.item_id != item_id || grant.pack_id.is_empty() || sanitize_id(&grant.pack_id) != grant.pack_id {
        return Err("Store ส่งข้อมูลแพ็กที่ไม่ตรงกับรายการที่ซื้อ".into());
    }
    if grant.install_receipt.item_id != grant.item_id
        || grant.install_receipt.pack_id != grant.pack_id
        || !pack_io::verify_store_install(&grant.install_receipt)
    {
        return Err("หลักฐานติดตั้งจาก Store ไม่ถูกต้อง".into());
    }

    let signed_url = reqwest::Url::parse(&grant.url)
        .map_err(|_| "Store ส่งที่อยู่ดาวน์โหลดที่ไม่ถูกต้อง".to_string())?;
    if signed_url.scheme() != "https"
        || signed_url.host_str() != Some("wsseitulmcgnolgsrxgh.supabase.co")
        || signed_url.port_or_known_default() != Some(443)
        || !signed_url.username().is_empty()
        || signed_url.password().is_some()
        || !signed_url.path().starts_with("/storage/v1/object/sign/packs/")
    {
        return Err("ปฏิเสธที่อยู่ดาวน์โหลดที่ไม่ได้มาจาก Store".into());
    }

    let mut download = client
        .get(signed_url)
        .send()
        .map_err(|_| "ดาวน์โหลดแพ็กจาก Store ไม่สำเร็จ".to_string())?;
    if !download.status().is_success() {
        return Err("ลิงก์ดาวน์โหลดหมดอายุหรือแพ็กไม่พร้อมใช้งาน".into());
    }
    if download.content_length().is_some_and(|n| n > MAX_ARCHIVE_BYTES as u64) {
        return Err("แพ็กจาก Store มีขนาดเกินกำหนด".into());
    }
    let mut bytes = Vec::new();
    download
        .by_ref()
        .take(MAX_ARCHIVE_BYTES as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "อ่านไฟล์แพ็กจาก Store ไม่สำเร็จ".to_string())?;
    if bytes.len() > MAX_ARCHIVE_BYTES {
        return Err("แพ็กจาก Store มีขนาดเกินกำหนด".into());
    }

    let imported = import_archive_with_expected("store-pack.zip", &bytes, Some(&grant.pack_id))?;
    if imported.imported.len() != 1 || imported.imported[0].as_str() != grant.pack_id.as_str() {
        return Err("แพ็กที่ดาวน์โหลดไม่ตรงกับรายการใน Store".into());
    }
    pack_io::record_store_install(grant.install_receipt)?;
    pack_io::rebuild_resolved_cache();
    state()
}

fn is_uuid(value: &str) -> bool {
    let parts: Vec<_> = value.split('-').collect();
    parts.len() == 5
        && [8, 4, 4, 4, 12].iter().zip(parts).all(|(len, part)| {
            part.len() == *len && part.bytes().all(|byte| byte.is_ascii_hexdigit())
        })
}

pub fn state() -> Result<VoiceState, String> {
    let root = voice_root();
    let packs = packs_dir();
    fs::create_dir_all(&packs).map_err(|e| format!("create voice packs dir: {e}"))?;

    let mut pack_dirs = discover_pack_dirs(&packs);
    if !cfg!(debug_assertions) {
        pack_dirs.retain(|dir| {
            dir.file_name()
                .and_then(|name| name.to_str())
                .is_some_and(pack_io::is_store_installed)
        });
    }
    if cfg!(debug_assertions) && pack_dirs.is_empty() {
        let starter = packs.join("maiden-custom");
        create_pack_skeleton(&starter, "maiden-custom", "Maiden Custom", "th-TH")?;
        pack_dirs.push(starter);
    }

    let bundled_default = pack_io::default_pack();

    // With no explicit choice on record, the truthful "equipped" pack is the
    // bundled default (that IS what voices Maiden out of the box) — only when
    // it's absent do we fall back to the first user pack dir.
    let active_id = read_active_pack_id()
        .filter(|id| cfg!(debug_assertions) || id == DEFAULT_PACK_ID || pack_io::is_store_installed(id))
        .or_else(|| {
        if bundled_default.is_some() {
            Some(DEFAULT_PACK_ID.to_string())
        } else {
            pack_dirs
                .first()
                .and_then(|dir| dir.file_name())
                .map(|name| name.to_string_lossy().to_string())
        }
    });

    let mut packs_out = Vec::new();

    for dir in pack_dirs {
        match pack_io::build_pack(&dir) {
            Ok(pack) => packs_out.push(pack),
            Err(e) => eprintln!("[G-Maiden] voice pack load failed: {e}"),
        }
    }
    packs_out.sort_by(|a, b| a.name.cmp(&b.name));
    // Built-in default pinned first, like a store's default kit slot.
    if let Some(default) = bundled_default {
        packs_out.insert(0, default);
    }

    let active_pack_id = active_id.filter(|id| packs_out.iter().any(|pack| &pack.id == id))
        .or_else(|| packs_out.first().map(|pack| pack.id.clone()));
    let active_pack = active_pack_id
        .as_ref()
        .and_then(|id| packs_out.iter().find(|pack| &pack.id == id).cloned());

    Ok(VoiceState {

        root_dir: root.to_string_lossy().to_string(),
        packs_dir: packs.to_string_lossy().to_string(),
        cache_dir: audio::voice_cache_dir().to_string_lossy().to_string(),
        active_pack_id,
        active_pack,
        packs: packs_out,
        groups: GROUPS
            .iter()
            .map(|g| VoiceGroup {
                id: g.id.into(),
                label: g.label.into(),
                accent: g.accent.into(),
            })
            .collect(),
    })
}

pub fn action(action: &str, pack_id: Option<&str>) -> Result<VoiceState, String> {
    match action {
        "activate" => {
            let id = pack_id.ok_or_else(|| "missing packId".to_string())?;
            if !is_store_installed(id) {
                return Err("ติดตั้งและใช้งานได้เฉพาะแพ็กที่ซื้อจาก Store".into());
            }
            if id != DEFAULT_PACK_ID { super::banner::activate_if_exists(id)?; }
            else { write_active_pack_id(id)?; }
            state()
        }
        "rescan" => { pack_io::rebuild_resolved_cache(); state() },
        "open-root" => {
            ensure_dev_authoring()?;
            let dir = voice_root();
            fs::create_dir_all(&dir).map_err(|e| format!("create voice root: {e}"))?;
            let _ = std::process::Command::new("explorer")
                .arg(dir.as_os_str())
                .spawn();
            state()
        }
        _ => Err(format!("unknown voice action: {action}")),
    }
}

pub fn create_template(pack_id: &str, name: &str, locale: &str) -> Result<VoiceState, String> {
    ensure_dev_authoring()?;
    let id = sanitize_id(pack_id);
    if id.is_empty() {
        return Err("pack id is required".into());
    }
    let dir = packs_dir().join(&id);
    create_pack_skeleton(&dir, &id, name, locale)?;
    write_active_pack_id(&id)?;
    state()
}

pub fn upload_asset(
    pack_id: &str,
    kind: &str,
    name: &str,
    bytes: &[u8],
) -> Result<UploadResult, String> {
    ensure_dev_authoring()?;
    let base = pack_dir(pack_id)?;
    let folder = match kind {
        "clip" => "clips",
        "banner" => "banners",
        _ => return Err("kind must be clip or banner".into()),
    };
    let file_name = sanitize_file_name(name);
    if file_name.is_empty() {
        return Err("file name is required".into());
    }
    let rel = format!("{folder}/{file_name}");
    let dest = base.join(&rel);
    write_bytes(&dest, bytes)?;
    // The one resolved-cache mutation site that doesn't flow through
    // write_manifest/write_active_pack_id: a manifest can already map an
    // event to a clip path that doesn't exist on disk yet (e.g. authored in
    // G-AnnStudio, uploaded after), and `resolve_existing_clips`'s existence
    // check is what decides whether that mapping counts. Only clips affect
    // it — a banner upload changes nothing `active_event_clips` reads.
    if kind == "clip" {
        pack_io::rebuild_resolved_cache();
    }
    Ok(UploadResult {
        path: rel.replace('\\', "/"),
    })
}

struct ImportStage { root: PathBuf, dir: PathBuf, committed: bool }
impl Drop for ImportStage {
    fn drop(&mut self) {
        // A failed rollback must keep the previous pack recoverable.
        if !self.committed && self.dir.join("previous").exists() {
            eprintln!("[G-Maiden] preserved previous pack at {}", self.dir.display());
            return;
        }
        if let Ok(path) = self.dir.canonicalize() {
            if path != self.root && path.starts_with(&self.root) {
                let _ = fs::remove_dir_all(path);
            }
        }
    }
}

pub fn import_archive(name: &str, bytes: &[u8]) -> Result<ImportResult, String> {
    ensure_dev_authoring()?;
    import_archive_with_expected(name, bytes, None)
}

fn import_archive_with_expected(
    name: &str,
    bytes: &[u8],
    expected_pack_id: Option<&str>,
) -> Result<ImportResult, String> {
    if bytes.len() > MAX_ARCHIVE_BYTES { return Err("ไฟล์แพ็กต้องมีขนาดไม่เกิน 32 MB".into()); }
    let imports = voice_root().join("imports");
    fs::create_dir_all(&imports).map_err(|e| e.to_string())?;
    let root = imports.canonicalize().map_err(|e| e.to_string())?;
    let nonce = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|e| e.to_string())?.as_nanos();
    let mut stage = ImportStage { dir: root.join(format!("stage-{}-{nonce}", std::process::id())), root, committed: false };
    fs::create_dir(&stage.dir).map_err(|e| e.to_string())?;
    let unpacked = stage.dir.join("unpacked");
    fs::create_dir(&unpacked).map_err(|e| e.to_string())?;
    extract_pack_zip(bytes, &unpacked, name)?;
    let source = if unpacked.join("manifest.json").is_file() { unpacked.clone() } else {
        let candidates: Vec<_> = discover_pack_dirs(&unpacked).into_iter()
            .filter(|dir| dir.join("manifest.json").is_file()).collect();
        if candidates.len() != 1 { return Err("ZIP ต้องมี manifest.json ของแพ็กเดียว".into()); }
        candidates[0].clone()
    };
    let manifest = read_manifest(&source)?;
    let id = manifest.id.clone();
    if id.is_empty() || sanitize_id(&id) != id || id == DEFAULT_PACK_ID {
        return Err("รหัสแพ็กไม่ถูกต้อง หรือใช้รหัสแพ็กมาตรฐานที่สงวนไว้".into());
    }
    if expected_pack_id.is_some_and(|expected| expected != id) {
        return Err("รหัสแพ็กในไฟล์ไม่ตรงกับแพ็กที่ Store อนุญาต".into());
    }
    for (event, mapping) in &manifest.mappings {
        if !super::events::event_ids().any(|known| known == event) {
            return Err(format!("ไม่รู้จักเหตุการณ์: {event}"));
        }
        for clip in &mapping.clips {
            let path = super::path_safety::safe_pack_path(&source, clip)
                .ok_or_else(|| format!("ไม่พบไฟล์เสียงที่ใช้ได้: {clip}"))?;
            audio::validate_clip(&path)?;
        }
        if !mapping.banner_asset.is_empty() && super::path_safety::safe_pack_path(&source, &mapping.banner_asset).is_none() {
            return Err(format!("ไม่พบแบนเนอร์: {}", mapping.banner_asset));
        }
    }
    if !manifest.cover_image.is_empty() && super::path_safety::safe_pack_path(&source, &manifest.cover_image).is_none() {
        return Err("ไม่พบภาพปกของแพ็ก".into());
    }
    fs::create_dir_all(packs_dir()).map_err(|e| e.to_string())?;
    let dest = packs_dir().join(&id);
    let backup = stage.dir.join("previous");
    if dest.exists() { fs::rename(&dest, &backup).map_err(|e| format!("สำรองแพ็กเดิมไม่ได้: {e}"))?; }
    if let Err(e) = fs::rename(&source, &dest) {
        if backup.exists() { let _ = fs::rename(&backup, &dest); }
        return Err(format!("ติดตั้งแพ็กไม่ได้: {e}"));
    }
    if let Err(e) = write_active_pack_id(&id) {
        // Both paths are generated inside the validated staging directory.
        let _ = fs::rename(&dest, stage.dir.join("failed"));
        if backup.exists() { let _ = fs::rename(&backup, &dest); }
        return Err(e);
    }
    stage.committed = true;
    Ok(ImportResult { imported: vec![id] })
}

/// In-process, zip-slip-safe extraction of an imported pack archive.
///
/// Replaces the previous `Expand-Archive` shell-out, whose safety depended
/// entirely on the .NET implementation (no app-level validation at all) —
/// and, as a side benefit, removes a `powershell.exe` spawn entirely, so
/// there's no `CREATE_NO_WINDOW` concern left on this path (a spawn without
/// it flashes a console and has been known to minimize a focused Dota 2
/// window; see `governor.rs`/`tts.rs`/`master.rs`/`setup.rs` for the existing
/// pattern this codebase uses everywhere it *does* still spawn PowerShell).
///
/// `zip` is already pulled in transitively via `tauri-plugin-updater` at the
/// same major version (`4`), so this adds it as an explicit, minimally
/// featured (`default-features = false`, `features = ["deflate"]`) direct
/// dependency rather than a brand-new one.
///
/// Validates EVERY entry before writing ANY of them (two-pass): an entry is
/// refused if `ZipFile::enclosed_name()` returns `None` — the zip crate's own
/// component-based check, which rejects absolute paths, drive/UNC/verbatim
/// prefixes, and any entry whose `..` count would walk it outside the
/// archive root — or if `ZipFile::is_symlink()` is true. Unlike
/// `ZipArchive::extract()` (which *would* create a symlink if its target
/// happens to resolve inside the destination), we refuse symlink entries
/// outright: a voice pack directory should never contain a live symlink. On
/// the first unsafe entry the whole import is refused and nothing is
/// written under `dest` (pass 1 touches no files).
pub(crate) fn extract_pack_zip(bytes: &[u8], dest: &Path, pack_id: &str) -> Result<(), String> {
    let mut archive =
        zip::ZipArchive::new(std::io::Cursor::new(bytes)).map_err(|e| format!("open zip: {e}"))?;

    // Pass 1 — validate every entry before writing anything.
    if archive.len() > 4096 { return Err("แพ็กมีจำนวนไฟล์มากเกินไป".into()); }
    let mut expanded = 0u64;
    let mut entries = Vec::with_capacity(archive.len());
    for i in 0..archive.len() {
        let file = archive
            .by_index(i)
            .map_err(|e| format!("read zip entry {i}: {e}"))?;
        expanded = expanded.saturating_add(file.size());
        if expanded > MAX_EXPANDED_BYTES { return Err("ขนาดแพ็กหลังแตกไฟล์เกิน 96 MB".into()); }
        let raw_name = file.name().to_string();
        let is_dir = file.is_dir();
        let is_symlink = file.is_symlink();
        let enclosed = file.enclosed_name();
        drop(file);

        let Some(rel) = enclosed else {
            eprintln!(
                "[G-Maiden] voice pack import '{pack_id}': refused unsafe archive entry '{raw_name}'"
            );
            return Err("archive contains an unsafe entry path".into());
        };
        if is_symlink {
            eprintln!(
                "[G-Maiden] voice pack import '{pack_id}': refused symlink archive entry '{raw_name}'"
            );
            return Err("archive contains a symlink entry".into());
        }
        entries.push((i, rel, is_dir));
    }

    // Pass 2 — every entry validated; now actually extract, confined to `dest`
    // by construction (`enclosed_name()` already guarantees no `..`/absolute
    // escape, so a plain `dest.join(rel)` cannot land outside it).
    for (i, rel, is_dir) in entries {
        let outpath = dest.join(&rel);
        if is_dir {
            fs::create_dir_all(&outpath)
                .map_err(|e| format!("create {}: {e}", outpath.display()))?;
            continue;
        }
        if let Some(parent) = outpath.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("create {}: {e}", parent.display()))?;
        }
        let mut file = archive
            .by_index(i)
            .map_err(|e| format!("read zip entry {i}: {e}"))?;
        let mut outfile = fs::File::create(&outpath)
            .map_err(|e| format!("create {}: {e}", outpath.display()))?;
        std::io::copy(&mut file, &mut outfile)
            .map_err(|e| format!("write {}: {e}", outpath.display()))?;
    }
    Ok(())
}

pub fn map_event(payload: MapEventRequest) -> Result<VoiceState, String> {
    ensure_dev_authoring()?;
    let dir = pack_dir(&payload.pack_id)?;
    let mut manifest = read_manifest(&dir)?;
    manifest.mappings.insert(
        payload.event_id,
        ManifestMapping {
            text: payload.text,
            thai: payload.thai,
            banner: payload.banner,
            banner_asset: payload.banner_asset,
            clips: payload.clips,
        },
    );
    write_manifest(&dir, &manifest)?;
    state()
}

pub fn update_pack(payload: UpdatePackRequest) -> Result<VoiceState, String> {
    ensure_dev_authoring()?;
    let dir = pack_dir(&payload.pack_id)?;
    let mut manifest = read_manifest(&dir)?;
    manifest.name = payload.name;
    manifest.version = payload.version;
    manifest.locale = payload.locale;
    manifest.author = payload.author;
    manifest.description = payload.description;
    manifest.cover_image = payload.cover_image;
    write_manifest(&dir, &manifest)?;
    state()
}

/// Absolute paths to the clips the ACTIVE pack maps to `event`. The active pack
/// (its manifest) is the source of truth for playback, so a fired announcer event
/// voices the pack's clips and its banner together — the "bundle" contract.
/// Existing files only; empty when there is no active pack / manifest / mapping.
///
/// Audit H8: this is the entry point `audio::list_clips` calls first, ahead of
/// the legacy flat dir and the bundled default — i.e. it runs on EVERY fired
/// event, including a gank alert on the ≤300ms G-Signal path. It used to do 2
/// file reads + a JSON parse + a per-clip stat+canonicalize live, right there.
/// Now it's a lookup into the cache `pack_io::rebuild_resolved_cache` keeps
/// current — no I/O here at all. See that function's doc comment for exactly
/// when the cache is rebuilt.
pub fn active_event_clips(event: &str) -> Vec<PathBuf> {
    pack_io::cached_event_clips(event).unwrap_or_default()
}

/// Human-facing name of the currently active pack, if any. Used only to tag
/// the CR-011 §B `utterance` telemetry event with which pack voiced a line —
/// same cost profile as `active_event_clips` above (two small file reads: the
/// active-pack pointer, then that pack's manifest). `None` when there's no
/// active pack or its manifest can't be read.
pub fn active_pack_name() -> Option<String> {
    let id = read_active_pack_id()?;
    let dir = packs_dir().join(sanitize_id(&id));
    let manifest = read_manifest(&dir).ok()?;
    Some(if manifest.name.is_empty() {
        manifest.id
    } else {
        manifest.name
    })
}

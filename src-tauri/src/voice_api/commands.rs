//! Installed GANN inventory, activation, and purchase-verified Store installation.

use std::fs;
use std::io::Read;
use std::path::PathBuf;
use std::time::Duration;

use crate::audio;

use super::events::GROUPS;
use super::pack_io::{self, read_active_pack_id, sanitize_id, StoreInstallRecord};
use super::paths::{discover_pack_dirs, packs_dir, voice_root};
use super::types::{VoiceGroup, VoiceState};

const STORE_SUPABASE_URL: &str = "https://wsseitulmcgnolgsrxgh.supabase.co";
const STORE_PUBLISHABLE_KEY: &str = "sb_publishable__vr0-aNdudlq3aPbH8OMXw_0rr0JScZ";
const MAX_ARCHIVE_BYTES: usize = 32 * 1024 * 1024;

#[derive(serde::Deserialize)]
struct StoreDownloadGrant {
    item_id: String,
    pack_id: String,
    url: String,
    install_receipt: StoreInstallRecord,
}

/// Restrict developer folder utilities; this never grants event-media admission.
pub fn ensure_dev_authoring() -> Result<(), String> {
    if cfg!(debug_assertions) {
        Ok(())
    } else {
        Err("การสร้างหรือนำเข้าแพ็กเสียงทำได้ใน G-AnnStudio; ติดตั้งแพ็กสำหรับผู้ใช้จาก Store เท่านั้น".into())
    }
}

/// Admit verified GANN containers without conferring a signed Store receipt.
pub fn is_pack_available(pack_id: &str) -> bool {
    if let Some(installer) = crate::package_ipc::installer() {
        if let Ok(records) = installer.installed() {
            if records.iter().any(|r| r.installation_id.0 == pack_id) {
                return true;
            }
        }
        return false;
    }
    super::id_container::is_local_package(pack_id)
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
    if grant.item_id != item_id
        || !super::id_manifest::valid_id(&grant.pack_id, "ann_")
        || sanitize_id(&grant.pack_id) != grant.pack_id
    {
        return Err("Store ส่งข้อมูลแพ็กที่ไม่ตรงกับรายการที่ซื้อ".into());
    }
    if grant.install_receipt.item_id != grant.item_id
        || grant.install_receipt.pack_id != grant.pack_id
        || !pack_io::verify_store_install(&grant.install_receipt)
    {
        return Err("หลักฐานติดตั้งจาก Store ไม่ถูกต้อง".into());
    }

    let signed_url =
        reqwest::Url::parse(&grant.url).map_err(|_| "Store ส่งที่อยู่ดาวน์โหลดที่ไม่ถูกต้อง".to_string())?;
    if signed_url.scheme() != "https"
        || signed_url.host_str() != Some("wsseitulmcgnolgsrxgh.supabase.co")
        || signed_url.port_or_known_default() != Some(443)
        || !signed_url.username().is_empty()
        || signed_url.password().is_some()
        || !signed_url
            .path()
            .starts_with("/storage/v1/object/sign/packs/")
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
    if download
        .content_length()
        .is_some_and(|n| n > MAX_ARCHIVE_BYTES as u64)
    {
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

    if !pack_io::archive_hash_matches(&grant.install_receipt, &bytes) {
        return Err("Store GANN digest mismatch".into());
    }
    let temporary = voice_root().join(format!(".store-{}.gann", std::process::id()));
    fs::create_dir_all(voice_root()).map_err(|e| e.to_string())?;
    let mut file = fs::OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&temporary)
        .map_err(|e| e.to_string())?;
    use std::io::Write;
    file.write_all(&bytes).map_err(|e| e.to_string())?;
    drop(file);
    let installed = (|| {
        let package = g_ann_package::Package::open(&temporary)?;
        if package.index.announcer_id != grant.pack_id {
            return Err("Store GANN ID mismatch".into());
        }
        Err::<super::ImportResult,String>("Store installation requires a verified release envelope and authorization adapter; the previous selection was kept".into())
    })();
    let _ = fs::remove_file(&temporary);
    installed?;
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
    let registry = crate::package_ipc::installer();
    #[cfg(not(test))]
    if registry.is_none() {
        return Err(
            "บริการติดตั้งแพ็กยังไม่พร้อม — เปิดโปรไฟล์ Maiden ใหม่ แล้วนำเข้าไฟล์ .gann ผ่าน Studio".into(),
        );
    }
    let root = registry
        .map(|i| i.profile_root().to_path_buf())
        .unwrap_or_else(voice_root);
    let packs = if registry.is_some() {
        root.join("installed")
    } else {
        packs_dir()
    };
    if registry.is_none() {
        fs::create_dir_all(&packs).map_err(|e| format!("create voice packs dir: {e}"))?;
    }

    let pack_dirs = discover_pack_dirs(&packs).into_iter().filter(|dir| {
        dir.file_name()
            .and_then(|name| name.to_str())
            .is_some_and(is_pack_available)
    });
    let active_id = if registry.is_none() {
        read_active_pack_id().filter(|id| is_pack_available(id))
    } else {
        None
    };
    let mut packs_out = Vec::new();

    if registry.is_none() {
        for dir in pack_dirs {
            match pack_io::build_pack(&dir) {
                Ok(pack) => packs_out.push(pack),
                Err(e) => eprintln!("[G-Maiden] voice pack load failed: {e}"),
            }
        }
    }
    if let Some(installer) = crate::package_ipc::installer() {
        if let Ok(records) = installer.installed() {
            for record in records {
                if let Ok(admitted) = installer.admit_package(&record.installation_id) {
                    if let Ok(mut pack) = pack_io::build_pack(admitted.cache_root()) {
                        pack.installation_id = Some(record.installation_id.0.clone());
                        pack.id = record.installation_id.0;
                        pack.version = record.artifact.revision.to_string();
                        pack.description = format!(
                            "Local .gann · revision {} · {}",
                            record.artifact.revision,
                            &record.artifact.digest[..12]
                        );
                        packs_out.push(pack);
                    }
                }
            }
        }
    }
    packs_out.sort_by(|a, b| a.name.cmp(&b.name));
    let active_id = if let Some(installer) = crate::package_ipc::installer() {
        installer
            .selection()
            .map_err(|e| e.to_string())?
            .active
            .map(|id| id.0)
    } else {
        active_id
    };
    let active_pack_id = active_id.filter(|id| packs_out.iter().any(|pack| &pack.id == id));
    let active_pack = active_pack_id
        .as_ref()
        .and_then(|id| packs_out.iter().find(|pack| &pack.id == id).cloned());

    Ok(VoiceState {
        authoring_enabled: false,
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
            if let Some(installer) = crate::package_ipc::installer() {
                if installer
                    .installed()
                    .map_err(|e| e.to_string())?
                    .iter()
                    .any(|r| r.installation_id.0 == id)
                {
                    installer
                        .equip_package(
                            &crate::package_registry::InstallationId(id.into()),
                            crate::package_install::EquipPolicy::NowIfIdle,
                        )
                        .map_err(|e| e.to_string())?;
                    pack_io::adopt_registry_selection(installer)?;
                    return state();
                }
                return Err("แพ็กนี้ยังไม่ได้ลงทะเบียนในโปรไฟล์นี้ — นำเข้าไฟล์ .gann ผ่าน Studio แล้วเลือกโปรไฟล์ Maiden อีกครั้ง".into());
            }
            if !is_pack_available(id) {
                return Err("เลือกแพ็กที่ติดตั้งจาก Store หรือนำเข้าไฟล์ .gann แล้ว".into());
            }
            super::banner::activate_if_exists(id)?;
            state()
        }
        "rescan" => {
            pack_io::rebuild_resolved_cache();
            state()
        }
        "deactivate" => {
            let installer = crate::package_ipc::installer().ok_or("บริการติดตั้งแพ็กยังไม่พร้อม")?;
            installer.clear_selection().map_err(|e| e.to_string())?;
            pack_io::adopt_registry_selection(installer)?;
            state()
        }
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

/// Read only the mixed sounds from the admitted GANN snapshot.
pub fn active_event_clips(event: &str) -> Vec<PathBuf> {
    pack_io::cached_event_playback_clips(event).unwrap_or_default()
}

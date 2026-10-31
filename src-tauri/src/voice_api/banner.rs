//! GANN event preview lookup and activation/reporting of installed packages.
#[cfg(test)]
use super::events::event_ids;
use super::pack_io::{read_manifest, sanitize_id, write_active_pack_id};
#[cfg(test)]
use super::path_safety::resolve_existing_clips;
#[cfg(test)]
use super::path_safety::safe_pack_path;
#[cfg(test)]
use std::collections::BTreeMap;
use std::path::PathBuf;
/// Resolve one named variant from the already admitted pack manifest.
pub(crate) fn preview_variant(pack_id: &str, event: &str, clip_id: &str) -> Option<PathBuf> {
    super::pack_io::select_announcer_variant(pack_id, event, clip_id).map(|clip| clip.path)
}

/// Verified per-event coverage returned by the installation API.
#[cfg(test)]
pub struct InstallReport {
    pub pack_id: String,
    pub counts: BTreeMap<String, usize>,
    pub unmapped_events: Vec<String>,
    pub missing_clips: Vec<String>,
}

/// Reports only an admitted GANN registry; rejected packages cannot be activated.
#[cfg(test)]
pub fn install_report(pack_id: &str) -> Result<InstallReport, String> {
    let id = sanitize_id(pack_id);
    if id.is_empty() {
        return Err("pack id is required".into());
    }
    if !super::commands::is_pack_available(&id) {
        return Err("Only verified GANN packages can be installed".into());
    }
    let dir = super::paths::pack_dir(&id);
    let manifest = read_manifest(&dir)?;

    let mut counts = BTreeMap::new();
    let mut unmapped_events = Vec::new();
    let mut missing_clips = Vec::new();

    for event in event_ids() {
        let Some(mapping) = manifest.mappings.get(event) else {
            counts.insert(event.to_string(), 0);
            unmapped_events.push(event.to_string());
            continue;
        };
        for rel in &mapping.clips {
            // Rejected (unsafe) and genuinely-missing entries both surface
            // here identically — see `safe_pack_path`'s doc comment for why
            // that's the deliberate, documented choice rather than an
            // omission: the JSON response shape stays exactly as before, and
            // the distinction is preserved only in the local eprintln log.
            if safe_pack_path(&dir, rel).is_none() {
                missing_clips.push(rel.clone());
            }
        }
        let existing = resolve_existing_clips(&dir, &mapping.clips).len();
        counts.insert(event.to_string(), existing);
        if existing == 0 {
            unmapped_events.push(event.to_string());
        }
    }

    Ok(InstallReport {
        pack_id: id,
        counts,
        unmapped_events,
        missing_clips,
    })
}

/// Activate an already installed, verified GANN via the same serialized mutation as the UI.
/// The loopback notification never extracts or writes package media.
pub fn activate_if_exists(pack_id: &str) -> Result<(), String> {
    #[cfg(not(test))]
    if crate::package_ipc::installer().is_none() {
        return Err(
            "บริการติดตั้งแพ็กยังไม่พร้อม — นำเข้าไฟล์ .gann ผ่าน Studio หลังเปิดโปรไฟล์ Maiden ใหม่".into(),
        );
    }
    if let Some(installer) = crate::package_ipc::installer() {
        if installer
            .installed()
            .map_err(|e| e.to_string())?
            .iter()
            .any(|r| r.installation_id.0 == pack_id)
        {
            installer
                .equip_package(
                    &crate::package_registry::InstallationId(pack_id.into()),
                    crate::package_install::EquipPolicy::NowIfIdle,
                )
                .map_err(|e| e.to_string())?;
            super::pack_io::adopt_registry_selection(installer)?;
            return Ok(());
        }
        return Err("แพ็กนี้ยังไม่ได้ลงทะเบียน — นำเข้าไฟล์ .gann ผ่าน Studio แล้วเลือกโปรไฟล์ Maiden".into());
    }
    let id = sanitize_id(pack_id);
    if id.is_empty() {
        return Err("pack id is required".into());
    }
    if !super::commands::is_pack_available(&id) {
        return Err("Only verified GANN packages can be activated".into());
    }
    let dir = super::paths::pack_dir(&id);
    read_manifest(&dir)?;
    if super::id_manifest::manifest_path(&dir)?.is_some() {
        super::id_manifest::read(&dir)?.admit(&dir)?;
    }
    write_active_pack_id(&id)
}

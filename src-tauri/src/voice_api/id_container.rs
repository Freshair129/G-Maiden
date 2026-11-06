//! Local single-file import; the signed Store path keeps its own provenance.
use super::{id_manifest, paths, types::ImportResult};
use std::{
    fs,
    io::{Read, Seek, SeekFrom},
    path::Path,
};
#[derive(serde::Serialize, serde::Deserialize)]
pub(super) struct Origin {
    announcer_id: String,
    container_sha256: String,
    manifest_sha256: String,
}
fn origin(id: &str) -> Option<Origin> {
    if !g_ann_package::valid_id(id, "ann_") {
        return None;
    }
    let dir = paths::packs_dir().join(id);
    let raw = id_manifest::bounded_bytes(&dir.join("local-gann.json"), 4096).ok()?;
    let record: Origin = serde_json::from_slice(&raw).ok()?;
    if record.announcer_id != id
        || record.container_sha256.len() != 64
        || !record
            .container_sha256
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
    {
        return None;
    }
    id_manifest::verified_bytes(
        &dir.join(format!("{id}.json")),
        &record.manifest_sha256,
        2 * 1024 * 1024,
    )
    .ok()?;
    if !paths::voice_root()
        .join("containers")
        .join(format!("{}.gann", record.container_sha256))
        .is_file()
    {
        return None;
    }
    Some(record)
}
pub(super) fn verified_origin(id: &str) -> Option<Origin> {
    let record = origin(id)?;
    let archive = paths::voice_root()
        .join("containers")
        .join(format!("{}.gann", record.container_sha256));
    let package = g_ann_package::Package::open(&archive).ok()?;
    if package.digest != record.container_sha256
        || package.index.announcer_id != id
        || package
            .index
            .files
            .iter()
            .find(|entry| entry.path == package.index.manifest)?
            .sha256
            != record.manifest_sha256
    {
        return None;
    }
    package.validate_playback().ok()?;
    Some(record)
}
pub(super) fn is_local_package(id: &str) -> bool {
    verified_origin(id).is_some()
}
#[cfg(test)]
pub fn container_sha256(id: &str) -> Option<String> {
    if let Some(installer) = crate::package_ipc::installer() {
        let active = installer.selection().ok()?.active?;
        let record = installer
            .installed()
            .ok()?
            .into_iter()
            .find(|r| r.installation_id == active)?;
        if record.artifact.announcer_id == id || record.installation_id.0 == id {
            return Some(record.artifact.digest);
        }
    }
    Some(verified_origin(id)?.container_sha256)
}
pub(super) fn open_local_clip(id: &str, relative: &Path) -> Result<fs::File, String> {
    let dir = paths::packs_dir().join(id);
    let name = relative.to_string_lossy().replace('\\', "/");
    let path = super::path_safety::safe_pack_path(&dir, &name).ok_or("Unsafe local sound")?;
    let expected = super::pack_io::cached_audio_hash(id, &path)
        .ok_or("Sound is not in the admitted GANN snapshot")?;
    let mut file = fs::File::open(path).map_err(|e| e.to_string())?;
    let mut bytes = Vec::new();
    Read::by_ref(&mut file)
        .take(16 * 1024 * 1024 + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() > 16 * 1024 * 1024 || g_ann_package::sha256(&bytes) != expected {
        return Err("Local .gann sound SHA-256 mismatch".into());
    }
    file.seek(SeekFrom::Start(0)).map_err(|e| e.to_string())?;
    Ok(file)
}
pub fn import_file(source: &Path) -> Result<ImportResult, String> {
    if let Some(installer) = crate::package_ipc::installer() {
        let result = installer
            .install_package(crate::package_install::InstallSource::Local {
                path: source.to_path_buf(),
                expected_digest: g_ann_package::file_digest(source)?,
                project_binding: None,
            })
            .map_err(|e| e.to_string())?;
        return Ok(ImportResult {
            imported: vec![result.installation_id.0],
        });
    }
    #[cfg(not(test))]
    {
        Err("The registered Maiden installation service is unavailable; restart this profile before importing".into())
    }
    #[cfg(test)]
    {
        let installed = g_ann_package::install(source, &paths::voice_root())?;
        let registry = id_manifest::read(&installed.pack_dir)?;
        registry.admit(&installed.pack_dir)?;
        Ok(ImportResult {
            imported: vec![installed.pack_id],
        })
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    #[ignore = "requires GANN_FIXTURE file"]
    fn real_container_import_reload_and_preserve() {
        let source = std::env::var("GANN_FIXTURE").unwrap();
        let root = std::env::temp_dir().join(format!("gm-gann-test-{}", std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        super::super::paths::set_test_voice_root(Some(root.clone()));
        struct Cleanup(std::path::PathBuf);
        impl Drop for Cleanup {
            fn drop(&mut self) {
                super::super::paths::set_test_voice_root(None);
                super::super::pack_io::clear_resolved_cache_for_test();
                let _ = std::fs::remove_dir_all(&self.0);
            }
        }
        let _cleanup = Cleanup(root.clone());
        let imported = import_file(Path::new(&source)).expect("single-file import must succeed");
        assert_eq!(imported.imported.len(), 1);
        assert!(super::super::pack_io::read_active_pack_id().is_none());
        let original = g_ann_package::Package::open(Path::new(&source)).unwrap();
        let installed = root.join("packs").join(&original.index.announcer_id);
        let registry_path = installed.join(&original.index.manifest);
        let mut changed: serde_json::Value =
            serde_json::from_slice(&std::fs::read(&registry_path).unwrap()).unwrap();
        changed["name"] = "Conflicting revision".into();
        let conflict_source = root.join("conflicting-source");
        std::fs::create_dir(&conflict_source).unwrap();
        original.extract(&conflict_source).unwrap();
        std::fs::write(
            conflict_source.join(&original.index.manifest),
            serde_json::to_vec(&changed).unwrap(),
        )
        .unwrap();
        let conflict = root.join("conflict.gann");
        g_ann_package::create(&conflict_source, &original.index.manifest, &conflict).unwrap();
        assert!(import_file(&conflict).is_err());
        assert!(is_local_package(&original.index.announcer_id));

        let id = &imported.imported[0];
        assert_eq!(
            import_file(Path::new(&source)).unwrap().imported,
            imported.imported
        );
        super::super::activate_if_exists(id).unwrap();
        for event in ["first_blood", "double_kill", "rampage"] {
            let clip = super::super::select_announcer_clip(event).unwrap();
            assert!(clip.pair.is_some());
            let rel = clip.path.strip_prefix(&installed).unwrap();
            assert!(open_local_clip(&imported.imported[0], rel).is_ok());
        }
        let bad = root.join("bad.gann");
        std::fs::write(&bad, b"bad").unwrap();
        assert!(import_file(&bad).is_err());
        assert_eq!(
            super::super::pack_io::read_active_pack_id().as_deref(),
            Some(id.as_str())
        );
    }
}

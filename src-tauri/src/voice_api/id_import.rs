//! Staged filesystem import, preserving the active pack and canonical manifest.
use std::{fs, path::Path, sync::Mutex};
use super::{id_manifest, paths, types::ImportResult};

pub fn import_directory(source: &Path) -> Result<ImportResult, String> {
    super::commands::ensure_dev_authoring()?;
    static IMPORT: Mutex<()> = Mutex::new(());
    let _guard = IMPORT.try_lock().map_err(|_| "Another ID package import is running")?;
    let source = source.canonicalize().map_err(|e| e.to_string())?;
    let registry = id_manifest::read(&source)?;
    registry.admit(&source)?;
    let packs = paths::packs_dir();
    fs::create_dir_all(&packs).map_err(|e| e.to_string())?;
    let dest = packs.join(&registry.announcer_id);
    if dest.exists() { return Err("This announcer ID is already installed; existing package was preserved".into()); }
    let nonce = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|e| e.to_string())?.as_nanos();
    let stage = packs.join(format!(".ann-stage-{}-{nonce}", std::process::id()));
    fs::create_dir(&stage).map_err(|e| e.to_string())?;
    let result = (|| {
        for (rel, hash) in registry.files() {
            let path = super::path_safety::safe_pack_path(&source, &rel).ok_or("Source asset disappeared")?;
            let bytes = id_manifest::verified_bytes(&path, &hash, id_manifest::MAX_MEDIA)?;
            let target = stage.join(&rel);
            fs::create_dir_all(target.parent().ok_or("Asset parent")?).map_err(|e| e.to_string())?;
            fs::write(target, bytes).map_err(|e| e.to_string())?;
        }
        let manifest = id_manifest::manifest_path(&source)?.ok_or("Manifest disappeared")?;
        let bytes = id_manifest::bounded_bytes(&manifest, 2 * 1024 * 1024)?;
        fs::write(stage.join(format!("{}.json", registry.announcer_id)), bytes).map_err(|e| e.to_string())?;
        let staged = id_manifest::read(&stage)?;
        if staged.announcer_id != registry.announcer_id { return Err("Manifest changed during import".into()); }
        staged.admit(&stage)?;
        if dest.exists() { return Err("Destination appeared during import".into()); }
        fs::rename(&stage, &dest).map_err(|e| e.to_string())?;
        Ok(ImportResult { imported: vec![registry.announcer_id.clone()] })
    })();
    if stage.is_dir() {
        // This exact generated staging directory contains copies only.
        let _ = fs::remove_dir_all(&stage);
    }
    result
}

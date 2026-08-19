//! Tauri-facing voice-pack commands: state assembly, pack lifecycle
//! (create/import/upload/map/update), and the two small readers the live
//! audio + GSI paths call per event. Split out of the original
//! `voice_api.rs` monolith (facade refactor, no behavior change).

use std::fs;
use std::path::{Path, PathBuf};

use crate::audio;

use super::events::GROUPS;
use super::pack_io::{
    self, read_active_pack_id, read_manifest, sanitize_file_name, sanitize_id, write_active_pack_id,
    write_bytes, write_manifest, ManifestMapping,
};
use super::paths::{create_pack_skeleton, discover_pack_dirs, pack_dir, packs_dir, voice_root};
use super::types::{
    ImportResult, MapEventRequest, UpdatePackRequest, UploadResult, VoiceGroup, VoiceState,
    DEFAULT_PACK_ID,
};

pub fn state() -> Result<VoiceState, String> {
    let root = voice_root();
    let packs = packs_dir();
    fs::create_dir_all(&packs).map_err(|e| format!("create voice packs dir: {e}"))?;

    let mut pack_dirs = discover_pack_dirs(&packs);
    if pack_dirs.is_empty() {
        let starter = packs.join("maiden-custom");
        create_pack_skeleton(&starter, "maiden-custom", "Maiden Custom", "th-TH")?;
        pack_dirs.push(starter);
    }

    let bundled_default = pack_io::default_pack();

    // With no explicit choice on record, the truthful "equipped" pack is the
    // bundled default (that IS what voices Maiden out of the box) — only when
    // it's absent do we fall back to the first user pack dir.
    let active_id = read_active_pack_id().or_else(|| {
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
        packs_out.push(pack_io::build_pack(&dir)?);
    }
    packs_out.sort_by(|a, b| a.name.cmp(&b.name));
    // Built-in default pinned first, like a store's default kit slot.
    if let Some(default) = bundled_default {
        packs_out.insert(0, default);
    }

    let active_pack_id = active_id.or_else(|| packs_out.first().map(|pack| pack.id.clone()));
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
            write_active_pack_id(id)?;
            state()
        }
        "rescan" => state(),
        "open-root" => {
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

pub fn import_archive(name: &str, bytes: &[u8]) -> Result<ImportResult, String> {
    let id = sanitize_id(
        Path::new(name)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("imported-pack"),
    );
    let id = if id.is_empty() {
        "imported-pack".to_string()
    } else {
        id
    };
    let root = voice_root();
    let imports = root.join("imports");
    fs::create_dir_all(&imports).map_err(|e| format!("create imports dir: {e}"))?;
    let archive = imports.join(format!("{id}.zip"));
    write_bytes(&archive, bytes)?;

    let dest = packs_dir().join(&id);
    fs::create_dir_all(&dest).map_err(|e| format!("create import dir: {e}"))?;

    extract_pack_zip(bytes, &dest, &id)?;

    if !dest.join("manifest.json").is_file() {
        create_pack_skeleton(&dest, &id, name, "th-TH")?;
    }
    write_active_pack_id(&id)?;
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
    let mut entries = Vec::with_capacity(archive.len());
    for i in 0..archive.len() {
        let file = archive
            .by_index(i)
            .map_err(|e| format!("read zip entry {i}: {e}"))?;
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

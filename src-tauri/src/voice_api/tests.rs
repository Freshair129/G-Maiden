//! Unit tests for the voice-pack API, moved verbatim out of the original
//! single-file `voice_api.rs` (facade refactor — no behavior/logic change,
//! no test renamed or dropped). Reaches into sibling submodules' private
//! helpers via their `pub(crate)` visibility (bumped from bare-private only
//! because this file now lives in its own submodule — see each submodule's
//! header comment).

use std::collections::BTreeMap;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use serde::Deserialize;

use crate::audio;

use super::banner::{
    activate_if_exists, fired_banner, fired_banner_from, image_mime, install_report, preview_clip,
};
use super::base64::base64_encode;
use super::commands::{active_pack_name, extract_pack_zip};
use super::events::EVENTS;
use super::pack_io::{
    default_pack, sanitize_id, write_active_pack_id, write_manifest, Manifest, ManifestMapping,
};
use super::path_safety::safe_pack_path;
use super::paths::set_test_voice_root;
use super::types::DEFAULT_PACK_ID;

#[test]
fn base64_rfc4648_vectors() {
    // Canonical RFC 4648 §10 test vectors — a wrong encoder = broken banners.
    assert_eq!(base64_encode(b""), "");
    assert_eq!(base64_encode(b"f"), "Zg==");
    assert_eq!(base64_encode(b"fo"), "Zm8=");
    assert_eq!(base64_encode(b"foo"), "Zm9v");
    assert_eq!(base64_encode(b"foob"), "Zm9vYg==");
    assert_eq!(base64_encode(b"fooba"), "Zm9vYmE=");
    assert_eq!(base64_encode(b"foobar"), "Zm9vYmFy");
}

#[test]
fn base64_handles_high_bytes() {
    assert_eq!(base64_encode(&[0xff, 0xff, 0xff]), "////");
    assert_eq!(base64_encode(&[0x00, 0x00, 0x00]), "AAAA");
}

#[test]
fn image_mime_maps_known_extensions() {
    assert_eq!(image_mime("PNG"), "image/png");
    assert_eq!(image_mime("jpg"), "image/jpeg");
    assert_eq!(image_mime("jpeg"), "image/jpeg");
    assert_eq!(image_mime("svg"), "image/svg+xml");
    assert_eq!(image_mime("bmp"), "application/octet-stream");
}

#[test]
fn sanitize_id_collapses_path_traversal_to_a_plain_name() {
    // A malicious "packId" like "../../evil" must never let a caller of
    // packs_dir().join(sanitize_id(..)) walk outside packs/. sanitize_id
    // maps every non alnum/-/_ char (including '.' and '/') to '-', then
    // trims leading/trailing '-', so this collapses to a bare "evil" —
    // still confined under packs_dir(), never an actual traversal.
    assert_eq!(sanitize_id("../../evil"), "evil");
    assert_eq!(sanitize_id("..\\..\\evil"), "evil");
    assert_eq!(sanitize_id("/etc/passwd"), "etc-passwd");
}

/// Scratch dir for the install-report / activation tests below, isolated
/// per test via `set_test_voice_root` (thread_local — see its comment).
fn temp_root(tag: &str) -> PathBuf {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let dir =
        std::env::temp_dir().join(format!("gmaiden-voice-api-test-{tag}-{}", nanos));
    fs::create_dir_all(&dir).unwrap();
    dir
}

fn write_pack(root: &Path, id: &str, mappings: BTreeMap<String, ManifestMapping>) -> PathBuf {
    let dir = root.join("packs").join(id);
    fs::create_dir_all(dir.join("clips")).unwrap();
    let manifest = Manifest {
        id: id.to_string(),
        name: "Test Pack".into(),
        version: "0.1.0".into(),
        locale: "th-TH".into(),
        author: String::new(),
        author_gid: None,
        description: String::new(),
        cover_image: String::new(),
        mappings,
    };
    write_manifest(&dir, &manifest).unwrap();
    dir
}

fn mapping(clips: &[&str]) -> ManifestMapping {
    ManifestMapping {
        text: String::new(),
        thai: String::new(),
        banner: String::new(),
        banner_asset: String::new(),
        clips: clips.iter().map(|c| c.to_string()).collect(),
    }
}

struct RootGuard(PathBuf);
impl Drop for RootGuard {
    fn drop(&mut self) {
        set_test_voice_root(None);
        let _ = fs::remove_dir_all(&self.0);
    }
}

#[test]
fn install_report_happy_path_counts_existing_clips() {
    let root = temp_root("happy");
    set_test_voice_root(Some(root.clone()));
    let _guard = RootGuard(root.clone());

    let pack_dir = write_pack(
        &root,
        "demo",
        BTreeMap::from([("kill".to_string(), mapping(&["clips/kill_01.wav", "clips/kill_02.wav"]))]),
    );
    fs::write(pack_dir.join("clips/kill_01.wav"), b"x").unwrap();
    fs::write(pack_dir.join("clips/kill_02.wav"), b"x").unwrap();

    let report = install_report("demo").expect("report");
    assert_eq!(report.pack_id, "demo");
    assert_eq!(report.counts.get("kill"), Some(&2));
    assert!(!report.unmapped_events.contains(&"kill".to_string()));
    assert!(report.missing_clips.is_empty());

    activate_if_exists("demo").expect("activate");
    let active = fs::read_to_string(root.join("active-pack.txt")).unwrap();
    assert_eq!(active.trim(), "demo");
}

#[test]
fn install_report_flags_mapped_but_missing_clip() {
    let root = temp_root("missing-clip");
    set_test_voice_root(Some(root.clone()));
    let _guard = RootGuard(root.clone());

    let pack_dir = write_pack(
        &root,
        "demo",
        BTreeMap::from([("kill".to_string(), mapping(&["clips/kill_01.wav", "clips/ghost.wav"]))]),
    );
    fs::write(pack_dir.join("clips/kill_01.wav"), b"x").unwrap();
    // clips/ghost.wav intentionally never written.

    let report = install_report("demo").expect("report");
    assert_eq!(report.counts.get("kill"), Some(&1));
    assert!(report
        .missing_clips
        .iter()
        .any(|c| c == "clips/ghost.wav"));
}

#[test]
fn install_report_flags_event_with_zero_clips_as_unmapped() {
    let root = temp_root("zero-clip");
    set_test_voice_root(Some(root.clone()));
    let _guard = RootGuard(root.clone());

    write_pack(
        &root,
        "demo",
        BTreeMap::from([("kill".to_string(), mapping(&[]))]),
    );

    let report = install_report("demo").expect("report");
    assert_eq!(report.counts.get("kill"), Some(&0));
    assert!(report.unmapped_events.contains(&"kill".to_string()));
}

#[test]
fn real_pack_mrijgajn_maps_voice_and_banners() {
    // Exercises the manifest reader against the REAL committed announcer pack
    // (G-Maiden `2a7ba551`, blessed as reader test data by CR-009 §3): the
    // local half of CR-009's still-pending "install → activate → hear/see in
    // Dota" gate — it proves the pack's voice + banner mapping resolves.
    // cargo test runs from `src-tauri/`, so the repo assets are one level up.
    let root = PathBuf::from("../assets/voice-cache");
    if !root.join("packs/pack_mrijgajn/manifest.json").is_file() {
        eprintln!("skip: pack_mrijgajn not present under {}", root.display());
        return;
    }
    // Reset the override on the way out. Do NOT delete the dir — unlike the
    // scratch-tempdir tests above, this points at the real repo asset.
    struct Reset;
    impl Drop for Reset {
        fn drop(&mut self) {
            set_test_voice_root(None);
        }
    }
    let _reset = Reset;
    set_test_voice_root(Some(root));

    let report = install_report("pack_mrijgajn").expect("report for real pack");

    // Core integrity: every mapped clip resolves to a real, in-bounds file —
    // no dangling or path-escaping references.
    assert!(
        report.missing_clips.is_empty(),
        "pack has dangling/unsafe clip refs: {:?}",
        report.missing_clips
    );

    // Each of the 13 mapped events resolves >=1 clip; two have two takes.
    for ev in [
        "death", "dominating", "double_kill", "first_blood", "kill",
        "killing_spree", "mega_kill", "monster_kill", "respawn",
        "triple_kill", "ultra_kill", "unstoppable", "wicked_sick",
    ] {
        assert!(
            report.counts.get(ev).copied().unwrap_or(0) >= 1,
            "mapped event {ev} resolved no clips"
        );
        assert!(
            !report.unmapped_events.contains(&ev.to_string()),
            "{ev} wrongly reported unmapped"
        );
    }
    assert_eq!(report.counts.get("death"), Some(&2));
    assert_eq!(report.counts.get("mega_kill"), Some(&2));

    // Events the pack doesn't cover fall through cleanly (count 0, unmapped).
    for ev in ["danger", "gank", "match_start", "advice"] {
        assert_eq!(report.counts.get(ev), Some(&0), "{ev} unexpectedly mapped");
        assert!(report.unmapped_events.contains(&ev.to_string()));
    }

    // Banner resolution: a mapped event inlines its webp as a data: URL and
    // carries the event's default Thai caption; an unmapped event yields no
    // image but still the default caption (overlay falls back to its card).
    let kill = fired_banner_from(Some("pack_mrijgajn".to_string()), "kill");
    assert!(
        kill.banner_data
            .as_deref()
            .unwrap_or("")
            .starts_with("data:image/webp;base64,"),
        "kill banner did not resolve to a webp data URL"
    );
    assert_eq!(kill.thai, "คิล");

    let danger = fired_banner_from(Some("pack_mrijgajn".to_string()), "danger");
    assert!(danger.banner_data.is_none());
    assert_eq!(danger.thai, "อันตราย");
}

#[test]
fn install_report_errs_for_nonexistent_pack_and_activation_is_skipped() {
    let root = temp_root("no-pack");
    set_test_voice_root(Some(root.clone()));
    let _guard = RootGuard(root.clone());

    assert!(install_report("does-not-exist").is_err());
    assert!(activate_if_exists("does-not-exist").is_err());
    assert!(!root.join("active-pack.txt").is_file());
}

#[test]
fn traversal_pack_id_resolves_only_under_packs_dir_never_escapes() {
    let root = temp_root("traversal");
    set_test_voice_root(Some(root.clone()));
    let _guard = RootGuard(root.clone());

    // No pack named "evil" exists anywhere — including outside packs/ at
    // the literal relative path "../../evil" the raw id spells out. Since
    // sanitize_id collapses it to "evil" and packs_dir().join(..) confines
    // the lookup under root/packs/, this must fail exactly like any other
    // unknown id — never read/activate something outside packs_dir().
    assert!(install_report("../../evil").is_err());
    assert!(activate_if_exists("../../evil").is_err());
    assert!(!root.join("active-pack.txt").is_file());
}

// -- Gap 1: manifest-relative path traversal (safe_pack_path) -------

#[test]
fn safe_pack_path_rejects_dot_dot_traversal() {
    let root = temp_root("safe-path-dotdot");
    let _guard = RootGuard(root.clone());
    let dir = write_pack(&root, "demo", BTreeMap::new());

    assert!(safe_pack_path(&dir, "../../../../Windows/System32/config/SAM").is_none());
    assert!(safe_pack_path(&dir, "..\\..\\..\\..\\Windows\\System32\\config\\SAM").is_none());
    // `..` buried mid-path must be caught too — not just a leading match.
    assert!(safe_pack_path(&dir, "clips/../../evil.wav").is_none());
}

#[test]
fn safe_pack_path_rejects_absolute_paths() {
    let root = temp_root("safe-path-absolute");
    let _guard = RootGuard(root.clone());
    let dir = write_pack(&root, "demo", BTreeMap::new());

    assert!(safe_pack_path(&dir, "C:\\Windows\\notepad.exe").is_none());
    assert!(safe_pack_path(&dir, "/etc/passwd").is_none());
}

#[test]
fn safe_pack_path_rejects_unc_and_verbatim_prefixes() {
    let root = temp_root("safe-path-unc");
    let _guard = RootGuard(root.clone());
    let dir = write_pack(&root, "demo", BTreeMap::new());

    assert!(safe_pack_path(&dir, "\\\\server\\share\\evil.wav").is_none());
    assert!(safe_pack_path(&dir, "\\\\?\\C:\\Windows\\notepad.exe").is_none());
}

#[test]
fn safe_pack_path_accepts_well_formed_nested_path() {
    let root = temp_root("safe-path-nested");
    let _guard = RootGuard(root.clone());
    let dir = write_pack(&root, "demo", BTreeMap::new());
    fs::create_dir_all(dir.join("clips/sub")).unwrap();
    fs::write(dir.join("clips/sub/kill_01.wav"), b"x").unwrap();

    // No false positive: a legitimate nested path inside the pack must
    // still resolve, canonicalize-containment check included.
    assert_eq!(
        safe_pack_path(&dir, "clips/sub/kill_01.wav"),
        Some(dir.join("clips/sub/kill_01.wav"))
    );
}

#[test]
fn safe_pack_path_treats_missing_file_as_none_not_error() {
    let root = temp_root("safe-path-missing");
    let _guard = RootGuard(root.clone());
    let dir = write_pack(&root, "demo", BTreeMap::new());

    // Safe by construction, but nothing on disk — same bucket as a
    // rejected path from the caller's point of view (both are skipped),
    // yet this path never touches the eprintln-tagged rejection branch.
    assert!(safe_pack_path(&dir, "clips/does_not_exist.wav").is_none());
}

#[test]
fn safe_pack_path_rejects_symlink_escape_when_creatable() {
    let root = temp_root("safe-path-symlink");
    let _guard = RootGuard(root.clone());
    let dir = write_pack(&root, "demo", BTreeMap::new());

    let outside = root.join("outside-secret.txt");
    fs::write(&outside, b"secret").unwrap();
    let link = dir.join("clips").join("escape.wav");

    #[cfg(windows)]
    let created = std::os::windows::fs::symlink_file(&outside, &link).is_ok();
    #[cfg(not(windows))]
    let created = std::os::unix::fs::symlink(&outside, &link).is_ok();

    if !created {
        // Most sandboxed/CI Windows accounts lack
        // SeCreateSymbolicLinkPrivilege — covered instead by
        // `canonicalize_containment_predicate_direct` below, which
        // exercises the exact same starts_with() containment math this
        // branch relies on, without needing symlink-creation rights.
        eprintln!(
            "skipping safe_pack_path_rejects_symlink_escape_when_creatable: \
             no permission to create symlinks in this environment"
        );
        return;
    }
    assert!(safe_pack_path(&dir, "clips/escape.wav").is_none());
}

/// Direct test of the canonicalize + `starts_with` containment predicate
/// `safe_pack_path` uses to catch a symlink escape, independent of
/// whether this environment can actually create a symlink (see above).
#[test]
fn canonicalize_containment_predicate_direct() {
    let root = temp_root("containment-predicate");
    let _guard = RootGuard(root.clone());
    let pack_dir = root.join("packs").join("demo");
    let sibling_dir = root.join("packs").join("other");
    fs::create_dir_all(pack_dir.join("clips")).unwrap();
    fs::create_dir_all(&sibling_dir).unwrap();
    fs::write(pack_dir.join("clips/kill_01.wav"), b"x").unwrap();
    fs::write(sibling_dir.join("secret.txt"), b"x").unwrap();

    let canon_pack = fs::canonicalize(&pack_dir).unwrap();
    let canon_inside = fs::canonicalize(pack_dir.join("clips/kill_01.wav")).unwrap();
    let canon_outside = fs::canonicalize(sibling_dir.join("secret.txt")).unwrap();

    assert!(
        canon_inside.starts_with(&canon_pack),
        "a legitimate nested file must be considered contained"
    );
    assert!(
        !canon_outside.starts_with(&canon_pack),
        "a file in a sibling directory must NOT be considered contained — \
         this is exactly the check that rejects a symlink whose real \
         target canonicalizes to a path like `canon_outside`"
    );
}

#[test]
fn fired_banner_ignores_traversal_banner_asset() {
    let root = temp_root("banner-traversal");
    set_test_voice_root(Some(root.clone()));
    let _guard = RootGuard(root.clone());

    let mut evil_mapping = mapping(&[]);
    evil_mapping.banner_asset = "../../../../Windows/win.ini".to_string();
    write_pack(
        &root,
        "demo",
        BTreeMap::from([("kill".to_string(), evil_mapping)]),
    );
    write_active_pack_id("demo").unwrap();

    // Falls back to the built-in card (no banner_data) instead of
    // resolving the traversal and inlining whatever it points at.
    let banner = fired_banner("kill");
    assert!(banner.banner_data.is_none());
    assert_eq!(banner.event, "kill");
}

#[test]
fn preview_clip_ignores_traversal_and_finds_real_clip_after() {
    let root = temp_root("preview-clip-traversal");
    set_test_voice_root(Some(root.clone()));
    let _guard = RootGuard(root.clone());

    let dir = write_pack(
        &root,
        "demo",
        BTreeMap::from([(
            "kill".to_string(),
            mapping(&["../../evil.wav", "clips/kill_01.wav"]),
        )]),
    );
    fs::write(dir.join("clips/kill_01.wav"), b"x").unwrap();

    // The traversal entry is skipped; the real clip after it is still found.
    let clip = preview_clip("demo", "kill");
    assert_eq!(clip, Some(dir.join("clips/kill_01.wav")));
}

#[test]
fn install_report_rejects_traversal_clip_as_missing() {
    let root = temp_root("install-report-traversal");
    set_test_voice_root(Some(root.clone()));
    let _guard = RootGuard(root.clone());

    write_pack(
        &root,
        "demo",
        BTreeMap::from([(
            "kill".to_string(),
            mapping(&["../../../evil.wav"]),
        )]),
    );

    let report = install_report("demo").expect("report");
    assert_eq!(report.counts.get("kill"), Some(&0));
    assert!(report.missing_clips.iter().any(|c| c == "../../../evil.wav"));
    assert!(report.unmapped_events.contains(&"kill".to_string()));
}

// -- Gap 2: zip-slip on archive import (extract_pack_zip) -----------

/// Builds an in-memory `.zip` with the given (entry name, contents)
/// pairs, using `Stored` (uncompressed) so the test needs no codec
/// feature beyond what the crate always provides.
fn build_test_zip(entries: &[(&str, &[u8])]) -> Vec<u8> {
    let mut buf = Vec::new();
    {
        let cursor = std::io::Cursor::new(&mut buf);
        let mut writer = zip::ZipWriter::new(cursor);
        let options = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Stored);
        for (name, data) in entries {
            writer.start_file(*name, options).unwrap();
            writer.write_all(data).unwrap();
        }
        writer.finish().unwrap();
    }
    buf
}

#[test]
fn extract_pack_zip_refuses_traversal_entry_and_writes_nothing() {
    let root = temp_root("zip-traversal");
    let _guard = RootGuard(root.clone());
    let dest = root.join("dest");
    let bytes = build_test_zip(&[
        ("manifest.json", b"{}" as &[u8]),
        ("../evil.txt", b"pwned"),
    ]);

    assert!(extract_pack_zip(&bytes, &dest, "demo").is_err());
    assert!(!root.join("evil.txt").is_file());
    // Two-pass validation: pass 1 rejected before pass 2 wrote anything,
    // so not even the well-formed sibling entry landed.
    assert!(!dest.join("manifest.json").is_file());
}

#[test]
fn extract_pack_zip_refuses_absolute_path_entry() {
    let root = temp_root("zip-absolute");
    let _guard = RootGuard(root.clone());
    let dest = root.join("dest");
    let bytes = build_test_zip(&[("/evil.txt", b"pwned" as &[u8])]);

    assert!(extract_pack_zip(&bytes, &dest, "demo").is_err());
    assert!(!std::path::Path::new("/evil.txt").is_file());
}

#[test]
fn extract_pack_zip_imports_clean_archive() {
    let root = temp_root("zip-clean");
    let _guard = RootGuard(root.clone());
    let dest = root.join("dest");
    fs::create_dir_all(&dest).unwrap();
    let bytes = build_test_zip(&[
        ("manifest.json", b"{}" as &[u8]),
        ("clips/kill_01.wav", b"clipdata"),
    ]);

    extract_pack_zip(&bytes, &dest, "demo").expect("clean archive should import");
    assert!(dest.join("manifest.json").is_file());
    assert!(dest.join("clips/kill_01.wav").is_file());
    assert_eq!(fs::read(dest.join("clips/kill_01.wav")).unwrap(), b"clipdata");
}

// --- authorGid (GID pipeline Phase 2 Task 4) ----------------------------

#[test]
fn manifest_author_gid_roundtrip() {
    // with the field
    let with: super::pack_io::Manifest = serde_json::from_str(
        r#"{"id":"p1","name":"n","version":"1","locale":"th","author":"a",
            "description":"","mappings":{},"authorGid":"G-F43KRAKGE"}"#,
    )
    .unwrap();
    assert_eq!(with.author_gid.as_deref(), Some("G-F43KRAKGE"));
    let out = serde_json::to_string(&with).unwrap();
    assert!(out.contains("\"authorGid\":\"G-F43KRAKGE\""));

    // without the field: parses, and does NOT serialize a null/empty key
    let without: super::pack_io::Manifest = serde_json::from_str(
        r#"{"id":"p2","name":"n","version":"1","locale":"th","author":"a",
            "description":"","mappings":{}}"#,
    )
    .unwrap();
    assert_eq!(without.author_gid, None);
    let out2 = serde_json::to_string(&without).unwrap();
    assert!(!out2.contains("authorGid"));
}

// --- active_pack_name (CR-011 §B utterance ledger meta) ---------------

#[test]
fn active_pack_name_none_when_nothing_activated() {
    let root = temp_root("active-name-none");
    set_test_voice_root(Some(root.clone()));
    let _guard = RootGuard(root.clone());

    assert_eq!(active_pack_name(), None);
}

#[test]
fn active_pack_name_returns_the_manifest_name() {
    let root = temp_root("active-name-ok");
    set_test_voice_root(Some(root.clone()));
    let _guard = RootGuard(root.clone());

    write_pack(&root, "demo", BTreeMap::new());
    activate_if_exists("demo").expect("activate");

    assert_eq!(active_pack_name(), Some("Test Pack".to_string()));
}

// --- bundled default pack (the out-of-the-box voice) -------------------

/// Every event in the contract must ship at least one clip in the bundled
/// default pack. This is the "event ไม่ครบ" regression guard: adding an
/// event to `EVENTS` without adding lines to
/// `tools/voice-gen/gen_default_pack.py` (and regenerating) fails here.
#[test]
fn bundled_default_pack_covers_every_event() {
    // cargo test runs from src-tauri/, where the committed pack lives.
    let Some(pack) = default_pack() else {
        panic!("bundled voice-pack-default/ missing next to src-tauri");
    };
    assert!(pack.built_in);
    assert_eq!(pack.total_events, EVENTS.len());
    let missing: Vec<_> = pack
        .items
        .iter()
        .filter(|item| item.mapping.is_none())
        .map(|item| item.id.clone())
        .collect();
    assert!(
        missing.is_empty(),
        "default pack has no clips for: {} — add lines to gen_default_pack.py and re-run it",
        missing.join(", ")
    );
}

/// Previewing the built-in pack must resolve a real clip even though it
/// has no manifest (the UI "Preview" button on the default card).
#[test]
fn preview_clip_resolves_bundled_default_clips() {
    if audio::default_pack_dir().is_none() {
        eprintln!("skip: bundled voice-pack-default not present");
        return;
    }
    let clip = preview_clip(DEFAULT_PACK_ID, "kill");
    assert!(clip.is_some_and(|p| p.is_file()));
}

// --- event-contract sync vs schemas/gmaiden-events.json -----------------

#[derive(Deserialize)]
struct SchemaEvent {
    id: String,
    category: String,
}

#[derive(Deserialize)]
struct EventSchema {
    #[serde(rename = "x-events")]
    x_events: Vec<SchemaEvent>,
}

/// Loads the vendored copy of the canonical event contract
/// (`schemas/gmaiden-events.json`, byte-identical to the sibling
/// `G-Suite/schemas/gmaiden-events.json`).
fn load_vendored_schema() -> EventSchema {
    let path = format!("{}/../schemas/gmaiden-events.json", env!("CARGO_MANIFEST_DIR"));
    let raw = fs::read_to_string(&path).unwrap_or_else(|e| panic!("failed to read {path}: {e}"));
    serde_json::from_str(&raw).unwrap_or_else(|e| panic!("failed to parse {path}: {e}"))
}

/// Two-way sync check against the vendored schema. The `"none"` category
/// (currently just `"unused"`) is a G-AnnStudio authoring-only concept and
/// is deliberately exempt — everything else must appear on both sides.
#[test]
fn events_match_schema_contract() {
    let schema = load_vendored_schema();
    let schema_ids: Vec<&str> = schema.x_events.iter().map(|e| e.id.as_str()).collect();
    let rust_ids: Vec<&str> = EVENTS.iter().map(|e| e.id).collect();

    let missing_from_schema: Vec<&str> = rust_ids
        .iter()
        .filter(|id| !schema_ids.contains(id))
        .copied()
        .collect();
    let missing_from_rust: Vec<&str> = schema
        .x_events
        .iter()
        .filter(|e| e.category != "none" && !rust_ids.contains(&e.id.as_str()))
        .map(|e| e.id.as_str())
        .collect();

    assert!(
        missing_from_schema.is_empty() && missing_from_rust.is_empty(),
        "event contract drift — in voice_api::EVENTS but missing from schema x-events: {missing_from_schema:?}; \
         in schema x-events (category != \"none\") but missing from voice_api::EVENTS: {missing_from_rust:?}. \
         update schemas/gmaiden-events.json + G-Suite/schemas/gmaiden-events.json + voice_api.rs EVENTS together"
    );
}

/// Drift guard against the sibling repo's canonical copy. Skips (passes)
/// when the sibling checkout isn't present — CI only has this repo.
#[test]
fn vendored_schema_matches_g_suite_sibling() {
    let g_suite_dir = std::env::var("G_SUITE_DIR").unwrap_or_else(|_| {
        format!("{}/../../G-Suite", env!("CARGO_MANIFEST_DIR"))
    });
    let sibling_path = format!("{g_suite_dir}/schemas/gmaiden-events.json");
    let Ok(sibling_raw) = fs::read_to_string(&sibling_path) else {
        eprintln!("skip: sibling G-Suite checkout not found at {sibling_path}");
        return;
    };

    let vendored_path = format!("{}/../schemas/gmaiden-events.json", env!("CARGO_MANIFEST_DIR"));
    let vendored_raw = fs::read_to_string(&vendored_path)
        .unwrap_or_else(|e| panic!("failed to read {vendored_path}: {e}"));

    let sibling_value: serde_json::Value = serde_json::from_str(&sibling_raw)
        .unwrap_or_else(|e| panic!("failed to parse {sibling_path}: {e}"));
    let vendored_value: serde_json::Value = serde_json::from_str(&vendored_raw)
        .unwrap_or_else(|e| panic!("failed to parse {vendored_path}: {e}"));

    assert_eq!(
        vendored_value, sibling_value,
        "vendored schemas/gmaiden-events.json is stale vs G-Suite — re-copy and review the diff"
    );
}

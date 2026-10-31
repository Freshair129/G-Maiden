//! GANN admission, exact media pairing, mutation fencing, and Store signature behavior.

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

use serde::Deserialize;

use super::banner::{activate_if_exists, install_report};
use super::commands::active_event_clips;
use super::events::EVENTS;
use super::pack_io::{
    cached_event_clips, clear_resolved_cache_for_test, sanitize_id, Manifest, ManifestMapping,
};
use super::path_safety::safe_pack_path;
use super::paths::set_test_voice_root;

#[test]
fn gann_only_rejects_legacy_manifest_packs_without_changing_selection() {
    let root = temp_root("gann-only-legacy");
    set_test_voice_root(Some(root.clone()));
    let _guard = RootGuard(root.clone());
    let dir = write_pack(
        &root,
        "legacy",
        BTreeMap::from([("kill".into(), mapping(&["clips/k.wav"]))]),
    );
    fs::write(dir.join("clips/k.wav"), b"legacy").unwrap();
    assert!(!super::is_pack_available("legacy"));
    assert!(super::activate_if_exists("legacy").is_err());
    assert!(super::select_announcer_clip("kill").is_none());
    assert!(super::preview_variant("legacy", "kill", "k").is_none());
    assert!(super::state().unwrap().packs.is_empty());
}

#[test]
fn gann_only_selects_the_indexed_pair_and_never_substitutes_an_unmapped_event() {
    let root = temp_root("gann-pair");
    set_test_voice_root(Some(root.clone()));
    let _guard = RootGuard(root.clone());
    let (id, original, mixed) = super::test_package::install(&root, 1, "kill");
    activate_if_exists(&id).unwrap();
    let clip = super::select_announcer_clip("kill").unwrap();
    assert_eq!(clip.path, original);
    let pair = clip.pair.as_ref().unwrap();
    assert_eq!(pair.mixed, mixed);
    assert_eq!(active_event_clips("kill"), vec![mixed]);
    assert!(super::select_announcer_clip("death").is_none());
    assert!(crate::audio::pick_clip("death").is_none());
    assert!(super::with_current_announcer_clip("kill", &clip, || ()).is_some());
    let (other, _, _) = super::test_package::install(&root, 2, "death");
    activate_if_exists(&other).unwrap();
    assert!(super::with_current_announcer_clip("kill", &clip, || ()).is_none());
    assert!(crate::audio::pick_clip("kill").is_none());
}

#[test]
fn named_preview_uses_admitted_generation_and_fences_other_events() {
    let root = temp_root("preview-admitted-generation");
    set_test_voice_root(Some(root.clone()));
    let _guard = RootGuard(root.clone());
    let (id, original, _) = super::test_package::install(&root, 1201, "kill");
    activate_if_exists(&id).unwrap();
    let marker: serde_json::Value = serde_json::from_slice(
        &fs::read(root.join("packs").join(&id).join("local-gann.json")).unwrap(),
    )
    .unwrap();
    let container = root.join("containers").join(format!(
        "{}.gann",
        marker["container_sha256"].as_str().unwrap()
    ));
    fs::write(container, b"changed archive after admission").unwrap();
    let clip_id = original.file_stem().unwrap().to_str().unwrap();
    assert_eq!(super::preview_variant(&id, "kill", clip_id), Some(original.clone()));
    assert!(super::preview_variant(&id, "death", clip_id).is_none());
    assert!(super::preview_variant(&id, "kill", "../escape").is_none());
}

#[test]
fn gann_only_rejects_changed_container_even_when_marker_and_manifest_remain() {
    let root = temp_root("gann-origin");
    set_test_voice_root(Some(root.clone()));
    let _guard = RootGuard(root.clone());
    let (id, _, _) = super::test_package::install(&root, 3, "kill");
    assert!(super::is_pack_available(&id));
    let marker: serde_json::Value = serde_json::from_slice(
        &fs::read(root.join("packs").join(&id).join("local-gann.json")).unwrap(),
    )
    .unwrap();
    let container = root.join("containers").join(format!(
        "{}.gann",
        marker["container_sha256"].as_str().unwrap()
    ));
    fs::write(container, b"changed archive").unwrap();
    assert!(!super::is_pack_available(&id));
    assert!(activate_if_exists(&id).is_err());
    assert!(super::select_announcer_clip("kill").is_none());
}

#[test]
fn gann_only_resolves_every_schema_event_to_its_own_exact_media_pair() {
    let root = temp_root("gann-schema-events");
    set_test_voice_root(Some(root.clone()));
    let _guard = RootGuard(root.clone());
    let schema: serde_json::Value =
        serde_json::from_str(include_str!("../../../schemas/gmaiden-events.json")).unwrap();
    for (index, event) in schema["x-events"].as_array().unwrap().iter().enumerate() {
        let event = event["id"].as_str().unwrap();
        if event == "unused" {
            continue;
        }
        let serial = index as u64 + 20;
        let (id, original, mixed) = super::test_package::install(&root, serial, event);
        activate_if_exists(&id).unwrap();
        let selected = super::select_announcer_clip(event).unwrap();
        assert_eq!(selected.path, original);
        let pair = selected.pair.as_ref().unwrap();
        assert_eq!(pair.mixed, mixed);
        assert_eq!(
            pair.banner_id,
            format!("bnr_00000000-0000-0000-0000-{serial:012x}")
        );
        assert!(pair.video.ends_with(format!(
            "video/bnr_00000000-0000-0000-0000-{serial:012x}.webm"
        )));
        assert_eq!(active_event_clips(event), vec![mixed]);
        assert!(super::verify_visual(&selected).is_ok());
        assert!(super::select_announcer_clip("unknown_event").is_none());
    }
}

#[test]
fn gann_only_preflight_rejects_missing_video_and_changed_audio_before_playback() {
    let root = temp_root("gann-read-integrity");
    set_test_voice_root(Some(root.clone()));
    let _guard = RootGuard(root.clone());
    let (id, _, mixed) = super::test_package::install(&root, 81, "kill");
    activate_if_exists(&id).unwrap();
    let selected = super::select_announcer_clip("kill").unwrap();
    assert!(crate::audio::validate_clip(&mixed).is_ok());
    fs::write(&mixed, b"changed mixed").unwrap();
    assert!(crate::audio::validate_clip(&mixed).is_err());
    fs::remove_file(&selected.pair.as_ref().unwrap().video).unwrap();
    assert!(super::verify_visual(&selected).is_err());
}

#[test]
fn gann_only_selection_publication_cannot_overtake_a_prior_activation() {
    use std::sync::{mpsc, Arc, Mutex};
    use std::time::Duration;
    let root = temp_root("gann-publish-race");
    set_test_voice_root(Some(root.clone()));
    let _guard = RootGuard(root.clone());
    let (a, _, _) = super::test_package::install(&root, 82, "kill");
    let (b, _, _) = super::test_package::install(&root, 83, "death");
    let (read_tx, read_rx) = mpsc::sync_channel(1);
    let (release_tx, release_rx) = mpsc::sync_channel(1);
    let (attempt_tx, attempt_rx) = mpsc::sync_channel(1);
    let (published_tx, published_rx) = mpsc::sync_channel(1);
    let release = Mutex::new(release_rx);
    let journal = Arc::new(Mutex::new(Vec::new()));
    let hooked_root = root.clone();
    let hooked_a = a.clone();
    let hooked_b = b.clone();
    let entries = journal.clone();
    super::pack_io::set_mutation_hook(Some(Arc::new(move |phase, id| {
        if super::paths::voice_root() != hooked_root {
            return;
        }
        if phase == "read" && id == hooked_a {
            read_tx.send(()).unwrap();
            release.lock().unwrap().recv().unwrap();
        }
        if phase == "attempt" && id == hooked_b {
            attempt_tx.send(()).unwrap();
        }
        if phase == "published" {
            assert!(
                !crate::audio::critical_media_ready(),
                "HP edges must wait for this generation to finish prewarming"
            );
            entries.lock().unwrap().push(id.to_owned());
            if id == hooked_b {
                published_tx.send(()).unwrap();
            }
        }
    })));
    struct Reset;
    impl Drop for Reset {
        fn drop(&mut self) {
            super::pack_io::set_mutation_hook(None);
        }
    }
    let _reset = Reset;
    let root_a = root.clone();
    let id_a = a.clone();
    let first = std::thread::spawn(move || {
        set_test_voice_root(Some(root_a));
        super::pack_io::write_active_pack_id(&id_a).unwrap();
        assert!(crate::audio::critical_media_ready());
    });
    read_rx.recv_timeout(Duration::from_secs(5)).unwrap();
    let root_b = root.clone();
    let id_b = b.clone();
    let second = std::thread::spawn(move || {
        set_test_voice_root(Some(root_b));
        super::pack_io::write_active_pack_id(&id_b).unwrap();
        assert!(crate::audio::critical_media_ready());
    });
    attempt_rx.recv_timeout(Duration::from_secs(5)).unwrap();
    let overtook = published_rx.recv_timeout(Duration::from_secs(2)).is_ok();
    release_tx.send(()).unwrap();
    first.join().unwrap();
    second.join().unwrap();
    assert!(
        !overtook,
        "B published while A was still validating its selected GANN"
    );
    assert_eq!(journal.lock().unwrap().as_slice(), [a, b.clone()]);
    assert_eq!(fs::read_to_string(root.join("active-pack.txt")).unwrap(), b);
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
    let dir = std::env::temp_dir().join(format!("gmaiden-voice-api-test-{tag}-{}", nanos));
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
    fs::write(
        dir.join("manifest.json"),
        serde_json::to_vec(&manifest).unwrap(),
    )
    .unwrap();
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
        clear_resolved_cache_for_test();
        let _ = fs::remove_dir_all(&self.0);
    }
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
fn event_clip_preview_uses_only_exact_mixed_path_from_the_current_gann() {
    let root = temp_root("gann-exact-clip");
    set_test_voice_root(Some(root.clone()));
    let _guard = RootGuard(root.clone());
    let (id, original, mixed) = super::test_package::install(&root, 994, "kill");
    activate_if_exists(&id).unwrap();
    assert!(super::select_announcer_playback_path("kill", &original).is_none());
    assert!(super::select_announcer_playback_path("death", &mixed).is_none());
    let selected = super::select_announcer_playback_path("kill", &mixed).unwrap();
    assert_eq!(selected.path, original);
    assert_eq!(selected.pair.unwrap().mixed, mixed);
    let (other, _, _) = super::test_package::install(&root, 995, "death");
    activate_if_exists(&other).unwrap();
    assert!(super::select_announcer_playback_path("kill", &mixed).is_none());
}

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
    let path = format!(
        "{}/../schemas/gmaiden-events.json",
        env!("CARGO_MANIFEST_DIR")
    );
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
    let selected_root = std::env::var("G_SUITE_DIR").ok();
    let g_suite_dir = selected_root
        .clone()
        .unwrap_or_else(|| format!("{}/../../G-Suite", env!("CARGO_MANIFEST_DIR")));
    let sibling_path = format!("{g_suite_dir}/schemas/gmaiden-events.json");
    let sibling_raw = match fs::read_to_string(&sibling_path) {
        Ok(raw) => raw,
        Err(error) if selected_root.is_some() => {
            panic!("selected G_SUITE_DIR schema {sibling_path} is unavailable: {error}")
        }
        Err(_) => {
            eprintln!("skip: sibling G-Suite checkout not found at {sibling_path}");
            return;
        }
    };

    let vendored_path = format!(
        "{}/../schemas/gmaiden-events.json",
        env!("CARGO_MANIFEST_DIR")
    );
    let vendored_raw = fs::read_to_string(&vendored_path)
        .unwrap_or_else(|e| panic!("failed to read {vendored_path}: {e}"));

    let sibling_value: serde_json::Value = serde_json::from_str(&sibling_raw)
        .unwrap_or_else(|e| panic!("failed to parse {sibling_path}: {e}"));
    let vendored_value: serde_json::Value = serde_json::from_str(&vendored_raw)
        .unwrap_or_else(|e| panic!("failed to parse {vendored_path}: {e}"));

    assert_eq!(
        vendored_value, sibling_value,
        "vendored schemas/gmaiden-events.json is stale vs selected G-Suite — review the full diff"
    );
}

// A fresh test root cannot inherit another equipped GANN generation.
#[test]
fn no_active_pack_is_a_clean_none_not_a_leftover_from_a_prior_test() {
    // Guards the test-isolation fix itself: on a freshly test-rooted
    // directory with NOTHING activated, the cache must read as empty even
    // though other tests in this file (possibly on the same pooled worker
    // thread) activate packs constantly. If this ever fails, the
    // thread_local + Drop-guard teardown pairing has regressed.
    let root = temp_root("h8-clean-slate");
    set_test_voice_root(Some(root.clone()));
    let _guard = RootGuard(root.clone());

    assert_eq!(cached_event_clips("gank"), None);
    assert_eq!(cached_event_clips("kill"), None);
    assert_eq!(active_event_clips("gank"), Vec::<PathBuf>::new());
}

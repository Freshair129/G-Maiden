use g_ann_package::{sha256, Package};
use serde_json::json;
use std::{fs, path::PathBuf, process::Command};

static INSTALL_TESTS: std::sync::Mutex<()> = std::sync::Mutex::new(());

fn fixture(tag: &str) -> (PathBuf, PathBuf, String) {
    let root = std::env::temp_dir().join(format!("gann-install-{tag}-{}", std::process::id()));
    fs::create_dir_all(root.join("source/audio")).unwrap();
    fs::create_dir_all(root.join("source/video")).unwrap();
    let ann = "ann_00000000-0000-0000-0000-000000000001";
    let original = "snd_00000000-0000-0000-0000-000000000002";
    let mixed = "snd_00000000-0000-0000-0000-000000000003";
    let banner = "bnr_00000000-0000-0000-0000-000000000004";
    let samples = [120i16, -120, 0, 0];
    let mut wav = Vec::new();
    wav.extend(b"RIFF");
    wav.extend((36u32 + 8).to_le_bytes());
    wav.extend(b"WAVEfmt ");
    wav.extend(16u32.to_le_bytes());
    wav.extend(1u16.to_le_bytes());
    wav.extend(1u16.to_le_bytes());
    wav.extend(48000u32.to_le_bytes());
    wav.extend(96000u32.to_le_bytes());
    wav.extend(2u16.to_le_bytes());
    wav.extend(16u16.to_le_bytes());
    wav.extend(b"data");
    wav.extend(8u32.to_le_bytes());
    for sample in samples {
        wav.extend(sample.to_le_bytes());
    }
    let video = include_bytes!("fixtures/silent.webm");
    for id in [original, mixed] {
        fs::write(root.join(format!("source/audio/{id}.wav")), &wav).unwrap();
    }
    fs::write(root.join(format!("source/video/{banner}.webm")), video).unwrap();
    let registry = json!({"schema_version":1,"announcer_id":ann,"revision":1,"name":"Independent fixture","locale":"th",
        "sounds":[{"sound_id":original,"role":"original_voice","label":"Original","path":format!("audio/{original}.wav"),"sha256":sha256(&wav)},
                  {"sound_id":mixed,"role":"mixed_voice_sfx","label":"Played","path":format!("audio/{mixed}.wav"),"sha256":sha256(&wav)}],
        "components":[],"unmapped_sound_ids":[],"events":{"kill":[{"sound_id":original,"banner_id":banner}]},
        "banners":[{"banner_id":banner,"event_key":"kill","original_sound_id":original,"playback_sound_id":mixed,
            "visual_source":{"root":".","silent":true,"video":format!("video/{banner}.webm"),"sha256":sha256(video)},
            "components":[],"cues":[],"config":{"duration_seconds":1}}]});
    let manifest = format!("{ann}.json");
    fs::write(
        root.join("source").join(&manifest),
        serde_json::to_vec(&registry).unwrap(),
    )
    .unwrap();
    let package = root.join("fixture.gann");
    g_ann_package::create(&root.join("source"), &manifest, &package).unwrap();
    (root, package, ann.into())
}

#[test]
fn cli_install_preserves_container_and_verified_pairs_without_activation() {
    let (root, package, ann) = fixture("cli");
    let voice = root.join("voice");
    let result = Command::new(env!("CARGO_BIN_EXE_g-ann-package"))
        .args([
            "install",
            package.to_str().unwrap(),
            voice.to_str().unwrap(),
        ])
        .output()
        .unwrap();
    assert!(
        result.status.success(),
        "{}",
        String::from_utf8_lossy(&result.stderr)
    );
    let report: serde_json::Value = serde_json::from_slice(&result.stdout).unwrap();
    assert_eq!(report["pack_id"], ann);
    assert!(
        report["voice_root_id"]
            .as_str()
            .is_some_and(|s| s.len() == 64),
        "installer must identify selected runtime root"
    );
    let opened = Package::open(&package).unwrap();
    assert_eq!(
        fs::read(
            voice
                .join("containers")
                .join(format!("{}.gann", opened.digest))
        )
        .unwrap(),
        fs::read(&package).unwrap()
    );
    let installed = voice.join("packs").join(&ann);
    for entry in &opened.index.files {
        assert_eq!(
            sha256(&fs::read(installed.join(&entry.path)).unwrap()),
            entry.sha256
        );
    }
    assert!(installed.join("local-gann.json").is_file());
    assert!(!voice.join("active-pack.txt").exists());
    assert!(!installed.join("manifest.json").exists());
    let repeat = Command::new(env!("CARGO_BIN_EXE_g-ann-package"))
        .args([
            "install",
            package.to_str().unwrap(),
            voice.to_str().unwrap(),
        ])
        .output()
        .unwrap();
    assert!(repeat.status.success());
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn cli_install_rejects_incomplete_playback_schema_without_touching_selection() {
    let (root, _, ann) = fixture("schema");
    let path = root.join("source").join(format!("{ann}.json"));
    let mut v: serde_json::Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
    v.as_object_mut().unwrap().remove("locale");
    fs::write(path, serde_json::to_vec(&v).unwrap()).unwrap();
    let package = root.join("incomplete.gann");
    g_ann_package::create(&root.join("source"), &format!("{ann}.json"), &package).unwrap();
    let voice = root.join("voice");
    fs::create_dir(&voice).unwrap();
    fs::write(voice.join("active-pack.txt"), "keep-existing").unwrap();
    let result = Command::new(env!("CARGO_BIN_EXE_g-ann-package"))
        .args([
            "install",
            package.to_str().unwrap(),
            voice.to_str().unwrap(),
        ])
        .output()
        .unwrap();
    assert!(!result.status.success());
    assert_eq!(
        fs::read_to_string(voice.join("active-pack.txt")).unwrap(),
        "keep-existing"
    );
    assert!(!voice.join("packs").join(ann).exists());
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn playback_validation_rejects_extreme_wav_rate_without_panicking() {
    let (root, _, ann) = fixture("rate");
    let manifest = root.join("source").join(format!("{ann}.json"));
    let mut registry: serde_json::Value =
        serde_json::from_slice(&fs::read(&manifest).unwrap()).unwrap();
    let sound = &mut registry["sounds"][0];
    let wav_path = root.join("source").join(sound["path"].as_str().unwrap());
    let mut wav = fs::read(&wav_path).unwrap();
    wav[24..28].copy_from_slice(&u32::MAX.to_le_bytes());
    fs::write(wav_path, &wav).unwrap();
    sound["sha256"] = sha256(&wav).into();
    fs::write(manifest, serde_json::to_vec(&registry).unwrap()).unwrap();
    let package = root.join("invalid-rate.gann");
    let opened =
        g_ann_package::create(&root.join("source"), &format!("{ann}.json"), &package).unwrap();
    assert!(opened.validate_playback().is_err());
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn install_rejects_cache_tampering_and_conflicting_revision_preserving_selection() {
    let _order = INSTALL_TESTS.lock().unwrap();
    let (root, package, ann) = fixture("conflict");
    let voice = root.join("voice");
    let installed = g_ann_package::install(&package, &voice).unwrap();
    fs::write(voice.join("active-pack.txt"), &ann).unwrap();
    let registry_path = root.join("source").join(format!("{ann}.json"));
    let mut registry: serde_json::Value =
        serde_json::from_slice(&fs::read(&registry_path).unwrap()).unwrap();
    registry["revision"] = 2.into();
    fs::write(registry_path, serde_json::to_vec(&registry).unwrap()).unwrap();
    let conflict = root.join("conflict.gann");
    g_ann_package::create(&root.join("source"), &format!("{ann}.json"), &conflict).unwrap();
    assert!(g_ann_package::install(&conflict, &voice).is_err());
    let original = g_ann_package::Package::open(&package).unwrap();
    let audio = original
        .index
        .files
        .iter()
        .find(|e| e.path.starts_with("audio/"))
        .unwrap();
    fs::write(installed.pack_dir.join(&audio.path), b"tampered").unwrap();
    assert!(g_ann_package::install(&package, &voice).is_err());
    assert_eq!(
        fs::read_to_string(voice.join("active-pack.txt")).unwrap(),
        ann
    );
    assert_eq!(
        fs::read(
            voice
                .join("containers")
                .join(format!("{}.gann", original.digest))
        )
        .unwrap(),
        fs::read(package).unwrap()
    );
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn playback_validation_rejects_nonvideo_truncation_and_audible_visual_tracks() {
    for (tag, video) in [
        ("header-only", &[0x1a, 0x45, 0xdf, 0xa3, 0x80][..]),
        ("truncated", &include_bytes!("fixtures/silent.webm")[..100]),
        ("audible", &include_bytes!("fixtures/with-audio.webm")[..]),
    ] {
        let (root, _, ann) = fixture(tag);
        let manifest = root.join("source").join(format!("{ann}.json"));
        let mut registry: serde_json::Value =
            serde_json::from_slice(&fs::read(&manifest).unwrap()).unwrap();
        let visual = &mut registry["banners"][0]["visual_source"];
        fs::write(
            root.join("source").join(visual["video"].as_str().unwrap()),
            video,
        )
        .unwrap();
        visual["sha256"] = sha256(video).into();
        fs::write(manifest, serde_json::to_vec(&registry).unwrap()).unwrap();
        let package = root.join("bad-video.gann");
        let p =
            g_ann_package::create(&root.join("source"), &format!("{ann}.json"), &package).unwrap();
        assert!(
            p.validate_playback().is_err(),
            "{tag} is not a silent playable video"
        );
        fs::remove_dir_all(root).unwrap();
    }
}

#[test]
fn unused_authoring_bucket_cannot_be_admitted_as_a_runtime_event() {
    let (root, _, ann) = fixture("unused");
    let manifest = root.join("source").join(format!("{ann}.json"));
    let mut registry: serde_json::Value =
        serde_json::from_slice(&fs::read(&manifest).unwrap()).unwrap();
    let mapping = registry["events"]
        .as_object_mut()
        .unwrap()
        .remove("kill")
        .unwrap();
    registry["events"]["unused"] = mapping;
    registry["banners"][0]["event_key"] = "unused".into();
    fs::write(manifest, serde_json::to_vec(&registry).unwrap()).unwrap();
    let p = g_ann_package::create(
        &root.join("source"),
        &format!("{ann}.json"),
        &root.join("unused.gann"),
    )
    .unwrap();
    assert!(
        p.validate_playback().is_err(),
        "the unassigned authoring bucket is not a runtime event"
    );
    fs::remove_dir_all(root).unwrap();
}

fn write_registry(root: &std::path::Path, ann: &str, registry: &serde_json::Value) {
    fs::write(
        root.join("source").join(format!("{ann}.json")),
        serde_json::to_vec(registry).unwrap(),
    )
    .unwrap();
}

fn future_registry(root: &std::path::Path, package: &Package) -> serde_json::Value {
    let mut registry = package.registry.clone();
    registry["taxonomy_version"] = "1.3".into();
    let original = "snd_00000000-0000-0000-0000-000000000005";
    let mixed = "snd_00000000-0000-0000-0000-000000000006";
    let banner_id = "bnr_00000000-0000-0000-0000-000000000007";
    for (index, id) in [original, mixed].iter().enumerate() {
        let mut sound = registry["sounds"][index].clone();
        let bytes = package.read(sound["path"].as_str().unwrap()).unwrap();
        sound["sound_id"] = (*id).into();
        sound["path"] = format!("audio/{id}.wav").into();
        fs::write(
            root.join("source").join(sound["path"].as_str().unwrap()),
            bytes,
        )
        .unwrap();
        registry["sounds"].as_array_mut().unwrap().push(sound);
    }
    let mut banner = registry["banners"][0].clone();
    let video = package
        .read(banner["visual_source"]["video"].as_str().unwrap())
        .unwrap();
    banner["banner_id"] = banner_id.into();
    banner["event_key"] = "future_event".into();
    banner["original_sound_id"] = original.into();
    banner["playback_sound_id"] = mixed.into();
    banner["visual_source"]["video"] = format!("video/{banner_id}.webm").into();
    fs::write(
        root.join("source").join(format!("video/{banner_id}.webm")),
        video,
    )
    .unwrap();
    registry["banners"].as_array_mut().unwrap().push(banner);
    registry["events"]["future_event"] = json!([{"sound_id":original,"banner_id":banner_id}]);
    registry
}

#[test]
fn taxonomy_legacy_and_absent_versions_have_identical_admission() {
    let (root, path, ann) = fixture("taxonomy-legacy");
    let absent = Package::open(&path).unwrap();
    let mut registry = absent.registry.clone();
    registry["taxonomy_version"] = "1.1".into();
    write_registry(&root, &ann, &registry);
    let explicit = g_ann_package::create(
        &root.join("source"),
        &format!("{ann}.json"),
        &root.join("legacy.gann"),
    )
    .unwrap();
    let report = explicit.validate_playback_with_report().unwrap();
    assert_eq!(report, absent.validate_playback_with_report().unwrap());
    assert_eq!(report.pack_taxonomy_version, "1.1");
    assert_eq!(
        report.runtime_taxonomy_version,
        g_ann_package::taxonomy_version()
    );
    assert!(report.inert_events.is_empty());
    assert_eq!(explicit.registry["events"], absent.registry["events"]);
    assert!(explicit.registry["events"]["enemy_missing"].is_null());
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn taxonomy_newer_minor_reports_verified_inert_ids_and_preserves_known_mapping() {
    let (root, path, ann) = fixture("taxonomy-future");
    let original = Package::open(&path).unwrap();
    let registry = future_registry(&root, &original);
    write_registry(&root, &ann, &registry);
    let package = g_ann_package::create(
        &root.join("source"),
        &format!("{ann}.json"),
        &root.join("future.gann"),
    )
    .unwrap();
    let report = package.validate_playback_with_report().unwrap();
    assert_eq!(report.inert_events.len(), 1);
    assert_eq!(
        report.inert_events["future_event"],
        format!(
            "inert: unknown to taxonomy {}",
            g_ann_package::taxonomy_version()
        )
    );
    assert_eq!(
        package.registry["events"]["kill"],
        original.registry["events"]["kill"]
    );
    // The original Result<(), String> API applies exactly the same admission.
    package.validate_playback().unwrap();
    for entry in &package.index.files {
        assert_eq!(sha256(&package.read(&entry.path).unwrap()), entry.sha256);
    }
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn taxonomy_unknown_event_still_checks_hash_pairing_and_media_format() {
    let (root, path, ann) = fixture("taxonomy-integrity");
    let original = Package::open(&path).unwrap();
    let registry = future_registry(&root, &original);
    let mut bad_hash = registry.clone();
    bad_hash["sounds"][3]["sha256"] = "0".repeat(64).into();
    write_registry(&root, &ann, &bad_hash);
    let error = g_ann_package::create(
        &root.join("source"),
        &format!("{ann}.json"),
        &root.join("bad-hash.gann"),
    )
    .err()
    .unwrap();
    assert!(error.contains("sound file/hash reference"), "{error}");
    assert!(!root.join("bad-hash.gann").exists());

    let mut bad_pair = registry.clone();
    bad_pair["events"]["future_event"][0]["sound_id"] = registry["sounds"][0]["sound_id"].clone();
    assert!(g_ann_package::validate_playback_registry(&bad_pair)
        .unwrap_err()
        .contains("pairing"));

    let mut bad_video = registry.clone();
    let video = include_bytes!("fixtures/with-audio.webm");
    let visual = &mut bad_video["banners"][1]["visual_source"];
    fs::write(
        root.join("source").join(visual["video"].as_str().unwrap()),
        video,
    )
    .unwrap();
    visual["sha256"] = sha256(video).into();
    write_registry(&root, &ann, &bad_video);
    let package = g_ann_package::create(
        &root.join("source"),
        &format!("{ann}.json"),
        &root.join("bad-video.gann"),
    )
    .unwrap();
    assert!(package.validate_playback_with_report().is_err());
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn taxonomy_wrong_major_install_preserves_selection_and_installed_bytes() {
    let _order = INSTALL_TESTS.lock().unwrap();
    let (root, path, ann) = fixture("taxonomy-major");
    let voice = root.join("voice");
    let original = g_ann_package::install(&path, &voice).unwrap();
    fs::write(voice.join("active-pack.txt"), &ann).unwrap();
    let mut registry = Package::open(&path).unwrap().registry;
    registry["taxonomy_version"] = "2.0".into();
    write_registry(&root, &ann, &registry);
    let future = root.join("major.gann");
    g_ann_package::create(&root.join("source"), &format!("{ann}.json"), &future).unwrap();
    let error = g_ann_package::install(&future, &voice).unwrap_err();
    assert!(error.contains("taxonomy major mismatch"), "{error}");
    assert_eq!(
        fs::read_to_string(voice.join("active-pack.txt")).unwrap(),
        ann
    );
    assert_eq!(
        fs::read(original.pack_dir.join(format!("{ann}.json"))).unwrap(),
        Package::open(&path)
            .unwrap()
            .read(&format!("{ann}.json"))
            .unwrap()
    );
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn taxonomy_rejects_malformed_versions_and_unknown_ids_at_or_below_runtime() {
    let (root, path, _) = fixture("taxonomy-grammar");
    let package = Package::open(&path).unwrap();
    for value in [
        json!("1"),
        json!("x.y"),
        json!("1.2.3"),
        json!("01.2"),
        json!("1.02"),
        json!("+1.2"),
        json!("1.2 "),
        json!("1.-2"),
        json!("1.4294967296"),
        json!(null),
        json!(1.2),
    ] {
        let mut registry = package.registry.clone();
        registry["taxonomy_version"] = value.clone();
        let error = g_ann_package::validate_playback_registry(&registry).unwrap_err();
        assert!(
            error.contains("Invalid taxonomy_version"),
            "{value}: {error}"
        );
    }
    for version in ["1.0", "1.1", "1.2", "1.3", "1.10"] {
        let mut known_only = package.registry.clone();
        known_only["taxonomy_version"] = version.into();
        assert!(g_ann_package::validate_playback_registry(&known_only)
            .unwrap()
            .inert_events
            .is_empty());
    }
    let registry = future_registry(&root, &package);
    let mut numeric_minor = registry.clone();
    numeric_minor["taxonomy_version"] = "1.10".into();
    assert!(g_ann_package::validate_playback_registry(&numeric_minor)
        .unwrap()
        .inert_events
        .contains_key("future_event"));
    for version in [None, Some("1.1"), Some("1.2")] {
        let mut registry = registry.clone();
        if let Some(version) = version {
            registry["taxonomy_version"] = version.into();
        } else {
            registry.as_object_mut().unwrap().remove("taxonomy_version");
        }
        let error = g_ann_package::validate_playback_registry(&registry).unwrap_err();
        assert!(error.contains("unknown event"), "{error}");
    }
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn taxonomy_event_bound_is_independent_of_the_known_event_count() {
    let (root, path, _) = fixture("taxonomy-bound");
    let mut registry = Package::open(&path).unwrap().registry;
    registry["taxonomy_version"] = "1.3".into();
    let template = registry["banners"][0].clone();
    for n in 1..128 {
        let event = format!("future_{n}");
        let id = format!("bnr_10000000-0000-0000-0000-{n:012x}");
        let mut banner = template.clone();
        banner["banner_id"] = id.clone().into();
        banner["event_key"] = event.clone().into();
        banner["visual_source"]["video"] = format!("video/{id}.webm").into();
        registry["events"][&event] =
            json!([{"sound_id":template["original_sound_id"],"banner_id":id}]);
        registry["banners"].as_array_mut().unwrap().push(banner);
    }
    assert_eq!(
        g_ann_package::validate_playback_registry(&registry)
            .unwrap()
            .inert_events
            .len(),
        127
    );
    registry["events"]["overflow"] = json!([]);
    assert!(g_ann_package::validate_playback_registry(&registry)
        .unwrap_err()
        .contains("event count"));
    fs::remove_dir_all(root).unwrap();
}

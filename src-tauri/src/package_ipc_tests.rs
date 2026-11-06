use super::*;
use serde_json::json;

#[test]
fn preview_identity_keeps_installation_authority_separate_from_announcer_identity() {
    assert!(matches_preview_identity(
        "installation-a",
        "ann_same",
        Some("installation-a")
    ));
    assert!(!matches_preview_identity(
        "ann_same",
        "ann_same",
        Some("installation-a")
    ));
    assert!(!matches_preview_identity(
        "installation-b",
        "ann_same",
        Some("installation-a")
    ));
    assert!(matches_preview_identity("ann_system", "ann_system", None));
}

#[test]
fn adoption_retries_when_external_rescan_clears_same_selection() {
    let root = std::env::temp_dir().join(format!(
        "gann-adoption-rescan-{}",
        local_ipc::random_nonce().unwrap()
    ));
    let installer = PackageInstaller::new(&root, ProfileId("test".into())).unwrap();
    let mut tracker = AdoptionTracker::default();
    let mut publishes = 0;
    tracker
        .poll(&installer, false, || {
            publishes += 1;
            Ok(note_cache_publication())
        })
        .unwrap();
    note_cache_publication(); // the real rescan failure publishes an empty cache
    tracker
        .poll(&installer, false, || {
            publishes += 1;
            Ok(note_cache_publication())
        })
        .unwrap();
    assert_eq!(
        publishes, 2,
        "a cleared cache needs publication even when the selection key is unchanged"
    );
    note_cache_publication();
    tracker
        .poll(&installer, false, || {
            publishes += 1;
            let successful = note_cache_publication();
            note_cache_publication(); // another rescan clears it before poll records success
            Ok(successful)
        })
        .unwrap();
    tracker
        .poll(&installer, false, || {
            publishes += 1;
            Ok(note_cache_publication())
        })
        .unwrap();
    assert_eq!(
        publishes, 4,
        "remember the successful publication's token, never a later invalidation's token"
    );
    drop(installer);
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn adoption_retries_failed_publication_and_repair_refreshes_same_installation() {
    let root = std::env::temp_dir().join(format!(
        "gann-adoption-{}",
        local_ipc::random_nonce().unwrap()
    ));
    std::fs::create_dir(&root).unwrap();
    let (path, digest) = fixture(&root);
    let installer = PackageInstaller::new(&root.join("data"), ProfileId("test".into())).unwrap();
    let result = installer
        .install_package(InstallSource::Local {
            path,
            expected_digest: digest,
            project_binding: None,
        })
        .unwrap();
    installer
        .equip_package(&result.installation_id, EquipPolicy::NowIfIdle)
        .unwrap();
    let mut tracker = AdoptionTracker::default();
    assert!(tracker
        .poll(&installer, false, || Err("profile_busy".into()))
        .is_err());
    let mut publishes = 0;
    tracker
        .poll(&installer, false, || {
            publishes += 1;
            Ok(note_cache_publication())
        })
        .unwrap();
    tracker
        .poll(&installer, false, || {
            publishes += 1;
            Ok(note_cache_publication())
        })
        .unwrap();
    assert_eq!(publishes, 1);
    installer.repair_package(&result.installation_id).unwrap();
    tracker
        .poll(&installer, false, || {
            publishes += 1;
            Ok(note_cache_publication())
        })
        .unwrap();
    assert_eq!(publishes, 2);
    installer.clear_selection().unwrap();
    tracker
        .poll(&installer, false, || {
            publishes += 1;
            Ok(note_cache_publication())
        })
        .unwrap();
    assert_eq!(publishes, 3);
    assert!(installer.selection().unwrap().active.is_none());
    drop(installer);
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn package_ipc_rejects_wrong_profile_before_source_access() {
    let root = std::env::temp_dir().join(format!("gann-ipc-test-{}", std::process::id()));
    let installer = PackageInstaller::new(&root, ProfileId("test".into())).unwrap();
    let service = InstallService::new(installer, ProfileId("test".into()));
    let response=service.handle(json!({"protocol_version":1,"request_id":"request1","profile_id":"other",
        "source_path":"C:/missing.gann","expected_digest":"a".repeat(64),"project_binding":null,"equip_policy":"never"}));
    assert_eq!(response["error"]["code"], "wrong_profile");
    drop(service);
    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn package_ipc_duplicate_identity_cannot_change_request_payload() {
    let root = std::env::temp_dir().join(format!("gann-ipc-repeat-{}", std::process::id()));
    let installer = PackageInstaller::new(&root, ProfileId("test".into())).unwrap();
    let service = InstallService::new(installer, ProfileId("test".into()));
    let mut request = json!({"protocol_version":1,"request_id":"request1","profile_id":"test",
        "source_path":"C:/missing.gann","expected_digest":"a".repeat(64),"project_binding":null,"equip_policy":"never"});
    let first = service.handle(request.clone());
    assert_eq!(first, service.handle(request.clone()));
    request["expected_digest"] = "b".repeat(64).into();
    assert_eq!(
        service.handle(request)["error"]["code"],
        "request_id_reused"
    );
    drop(service);
    let _ = std::fs::remove_dir_all(root);
}

fn fixture(root: &std::path::Path) -> (PathBuf, String) {
    let source = root.join("source");
    std::fs::create_dir_all(source.join("audio")).unwrap();
    std::fs::create_dir(source.join("video")).unwrap();
    let ann = "ann_00000000-0000-0000-0000-000000000001";
    let original = "snd_00000000-0000-0000-0000-000000000002";
    let mixed = "snd_00000000-0000-0000-0000-000000000003";
    let banner = "bnr_00000000-0000-0000-0000-000000000004";
    let mut wav = Vec::new();
    wav.extend(b"RIFF");
    wav.extend(44u32.to_le_bytes());
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
    wav.extend([0u8; 8]);
    let video = include_bytes!("../gann-package/tests/fixtures/silent.webm");
    for sound in [original, mixed] {
        std::fs::write(source.join(format!("audio/{sound}.wav")), &wav).unwrap();
    }
    std::fs::write(source.join(format!("video/{banner}.webm")), video).unwrap();
    let registry = json!({"schema_version":1,"announcer_id":ann,"revision":1,"name":"ภาษาไทย","locale":"th",
        "sounds":[{"sound_id":original,"role":"original_voice","label":"original","path":format!("audio/{original}.wav"),"sha256":g_ann_package::sha256(&wav)},
            {"sound_id":mixed,"role":"mixed_voice_sfx","label":"played","path":format!("audio/{mixed}.wav"),"sha256":g_ann_package::sha256(&wav)}],
        "events":{"kill":[{"sound_id":original,"banner_id":banner}]},"components":[],"unmapped_sound_ids":[],
        "banners":[{"banner_id":banner,"event_key":"kill","original_sound_id":original,"playback_sound_id":mixed,
            "visual_source":{"root":".","silent":true,"video":format!("video/{banner}.webm"),"sha256":g_ann_package::sha256(video)},"components":[],"cues":[],"config":{"duration_seconds":1}}]});
    let manifest = format!("{ann}.json");
    std::fs::write(
        source.join(&manifest),
        serde_json::to_vec(&registry).unwrap(),
    )
    .unwrap();
    let path = root.join("แพ็ก.gann");
    let package = g_ann_package::create(&source, &manifest, &path).unwrap();
    (path, package.digest)
}

#[test]
fn package_ipc_installed_result_survives_equip_failure() {
    use std::sync::atomic::{AtomicUsize, Ordering};
    let root = std::env::temp_dir().join(format!(
        "gann-ipc-equip-{}",
        local_ipc::random_nonce().unwrap()
    ));
    std::fs::create_dir(&root).unwrap();
    let (path, digest) = fixture(&root);
    let installer = PackageInstaller::new(&root.join("data"), ProfileId("test".into())).unwrap();
    let selection = installer.profile_root().join("selection.json");
    let calls = AtomicUsize::new(0);
    let service = InstallService::new(installer, ProfileId("test".into())).with_match_status(
        Arc::new(move || {
            if calls.fetch_add(1, Ordering::Relaxed) == 1 {
                std::fs::write(&selection, b"corrupt").unwrap();
            }
            false
        }),
    );
    let reply=service.handle(json!({"protocol_version":1,"request_id":"equip-fail","profile_id":"test","source_path":path,
        "expected_digest":digest,"project_binding":null,"equip_policy":"now_if_idle"}));
    assert_eq!(reply["result"]["installed"], true);
    assert!(reply["activation_error"].is_object());
    assert_eq!(reply["result"]["activation"], "inactive");
    drop(service);
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn package_ipc_authoritative_match_barrier_and_selected_lease_fence() {
    use std::sync::atomic::{AtomicBool, Ordering};
    let root = std::env::temp_dir().join(format!(
        "gann-ipc-barrier-{}",
        local_ipc::random_nonce().unwrap()
    ));
    std::fs::create_dir(&root).unwrap();
    let (path, digest) = fixture(&root);
    let installer = PackageInstaller::new(&root.join("data"), ProfileId("test".into())).unwrap();
    let install = || {
        installer
            .install_package(InstallSource::Local {
                path: path.clone(),
                expected_digest: digest.clone(),
                project_binding: None,
            })
            .unwrap()
    };
    let first = install();
    installer
        .equip_package(&first.installation_id, EquipPolicy::NowIfIdle)
        .unwrap();
    let admitted = installer.admit_package(&first.installation_id).unwrap();
    let barrier = Arc::new(AtomicBool::new(true));
    installer.attach_match_barrier(barrier.clone()).unwrap();
    let second = install();
    installer.set_match_active(false).unwrap();
    assert_eq!(
        installer
            .equip_package(&second.installation_id, EquipPolicy::NowIfIdle)
            .unwrap(),
        crate::package_registry::ActivationState::DeferredUntilMatchEnd
    );
    installer.set_match_active(false).unwrap();
    assert_eq!(
        installer.selection().unwrap().active,
        Some(first.installation_id)
    );
    barrier.store(false, Ordering::Release);
    installer.set_match_active(false).unwrap();
    assert_eq!(
        admitted.lease_active().unwrap_err().code,
        "selection_changed"
    );
    drop(admitted);
    drop(installer);
    std::fs::remove_dir_all(root).unwrap();
}

#[cfg(windows)]
#[test]
fn package_ipc_native_install_is_profile_bound_and_idempotent() {
    use local_ipc::windows::*;
    let root = std::env::temp_dir().join(format!(
        "gann-ipc-native-{}",
        local_ipc::random_nonce().unwrap()
    ));
    std::fs::create_dir(&root).unwrap();
    let (path, digest) = fixture(&root);
    let installer = PackageInstaller::new(&root.join("data"), ProfileId("test".into())).unwrap();
    let service = Arc::new(InstallService::new(
        installer.clone(),
        ProfileId("test".into()),
    ));
    let registration =
        new_registration("test".into(), "test".into(), "test".into(), root.clone()).unwrap();
    let registration_dir = root.join("registration");
    let rt = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(2)
        .enable_all()
        .build()
        .unwrap();
    rt.block_on(async {
        let handler=service.clone();let host=tokio::spawn(serve(registration.clone(),registration_dir.clone(),Arc::new(move |r|handler.handle(r))));
        for _ in 0..100 {if registration_dir.join("test.json").exists(){break}tokio::time::sleep(std::time::Duration::from_millis(10)).await;}
        let request_body=json!({"protocol_version":1,"request_id":"native-1","profile_id":"test","source_path":path,
            "expected_digest":digest,"project_binding":null,"equip_policy":"now_if_idle"});
        let mut wrong=request_body.clone();wrong["profile_id"]="other".into();
        assert_eq!(request(&registration,wrong).await.unwrap()["error"]["code"],"wrong_profile");
        let first=request(&registration,request_body.clone()).await.unwrap();
        assert_eq!(first["result"]["installed"],true);assert_eq!(first["result"]["activation"],"active");
        assert_eq!(first,request(&registration,request_body).await.unwrap());
        assert_eq!(installer.installed().unwrap().len(),1);
        host.abort();let _=host.await;
    });
    drop(rt);
    drop(service);
    drop(installer);
    std::fs::remove_dir_all(root).unwrap();
}

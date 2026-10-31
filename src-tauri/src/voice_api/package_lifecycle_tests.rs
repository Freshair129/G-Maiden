use super::*;
use crate::package_install::{EquipPolicy, InstallSource, PackageInstaller};
use crate::package_registry::{ActivationState, ProfileId};

#[test]
fn installed_event_lease_keeps_exact_pair_until_safe_boundary() {
    let root = std::env::temp_dir().join(format!(
        "gann-runtime-{}-{}",
        std::process::id(),
        g_ann_package::local_ipc::random_nonce().unwrap()
    ));
    fs::create_dir(&root).unwrap();
    super::super::paths::set_test_voice_root(Some(root.clone()));
    let (old, _, _) = super::super::test_package::install(&root, 9831, "kill");
    let (new, _, _) = super::super::test_package::install(&root, 9832, "kill");
    let installer =
        PackageInstaller::new(&root.join("data"), ProfileId("runtime-test".into())).unwrap();
    let install = |id: &str| {
        let path = root.join(format!("{id}.gann"));
        installer
            .install_package(InstallSource::Local {
                expected_digest: g_ann_package::file_digest(&path).unwrap(),
                path,
                project_binding: None,
            })
            .unwrap()
    };
    let first = install(&old);
    installer
        .equip_package(&first.installation_id, EquipPolicy::NowIfIdle)
        .unwrap();
    store_resolved_cache(Some(build_installed_cache(&installer).unwrap()));
    let mut tracker = crate::package_ipc::AdoptionTracker::default();
    tracker
        .poll(&installer, false, || adopt_registry_selection(&installer))
        .unwrap();
    let unchanged_key = installer.adoption_key().unwrap();
    let transaction = fs::File::options()
        .read(true)
        .write(true)
        .open(installer.profile_root().join("transaction.lock"))
        .unwrap();
    transaction.try_lock().unwrap();
    assert!(adopt_registry_selection(&installer).is_err());
    assert!(select_announcer_clip("kill").is_none());
    drop(transaction);
    assert_eq!(installer.adoption_key().unwrap(), unchanged_key);
    tracker
        .poll(&installer, false, || adopt_registry_selection(&installer))
        .unwrap();
    assert!(select_announcer_clip("kill").is_some());
    let selected = select_announcer_clip("kill").unwrap();
    let clip_id = selected.path.file_stem().unwrap().to_str().unwrap();
    assert_eq!(
        super::super::preview_variant(&first.installation_id.0, "kill", clip_id),
        Some(selected.path.clone())
    );
    assert!(super::super::preview_variant(&old, "kill", clip_id).is_none());
    assert!(super::super::preview_variant(&first.installation_id.0, "death", clip_id).is_none());
    assert!(super::super::preview_variant(&first.installation_id.0, "kill", "../escape").is_none());
    assert!(select_announcer_path(&first.installation_id.0, "kill", &selected.path).is_some());
    assert!(select_announcer_path(&old, "kill", &selected.path).is_none());
    installer.repair_package(&first.installation_id).unwrap();
    assert!(selected.installation_lease().is_err());
    adopt_registry_selection(&installer).unwrap();
    let selected = select_announcer_clip("kill").unwrap();
    assert!(select_announcer_clip("unmapped").is_none());
    let lease = selected.installation_lease().unwrap().unwrap();
    let second = install(&new);
    assert_eq!(
        installer
            .equip_package(&second.installation_id, EquipPolicy::NowIfIdle)
            .unwrap(),
        ActivationState::DeferredUntilMatchEnd
    );
    installer.set_match_active(false).unwrap();
    assert_eq!(
        installer.selection().unwrap().active,
        Some(first.installation_id.clone())
    );
    assert_eq!(
        select_announcer_clip("kill")
            .unwrap()
            .pair
            .as_ref()
            .unwrap()
            .mixed,
        selected.pair.as_ref().unwrap().mixed
    );
    assert_eq!(lease.artifact().digest, first.artifact.digest);
    assert!(
        open_verified_store_clip(&selected.pair.as_ref().unwrap().mixed)
            .unwrap()
            .is_some()
    );
    drop(lease);
    installer.set_match_active(false).unwrap();
    assert_eq!(
        installer.selection().unwrap().active,
        Some(second.installation_id)
    );
    store_resolved_cache(Some(build_installed_cache(&installer).unwrap()));
    assert_eq!(select_announcer_clip("kill").unwrap().pack_id, new);
    assert!(with_current_announcer_clip("kill", &selected, || ()).is_none());
    fs::write(root.join("active-pack.txt"), &old).unwrap();
    installer.clear_selection().unwrap();
    adopt_registry_selection(&installer).unwrap();
    assert!(select_announcer_clip("kill").is_none());
    clear_resolved_cache_for_test();
    super::super::paths::set_test_voice_root(None);
    drop(selected);
    drop(installer);
    fs::remove_dir_all(root).unwrap();
}

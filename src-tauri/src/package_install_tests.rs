use super::*;
use g_ann_package::{sha256, Package};
use serde_json::json;
use std::{
    fs,
    sync::atomic::{AtomicU64, Ordering},
};

static NEXT: AtomicU64 = AtomicU64::new(0);
struct Fixture(PathBuf);
impl Fixture {
    fn new() -> Self {
        let path = std::env::temp_dir().join(format!(
            "gann-transaction-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir(&path).unwrap();
        Self(path)
    }
    fn installer(&self, profile: &str) -> PackageInstaller {
        PackageInstaller::new(&self.0, ProfileId(profile.into())).unwrap()
    }
    fn package(&self, revision: u64, label: &str) -> (PathBuf, String) {
        let source = self.0.join(format!("source-{revision}-{label}"));
        fs::create_dir_all(source.join("audio")).unwrap();
        fs::create_dir(source.join("video")).unwrap();
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
            fs::write(source.join(format!("audio/{sound}.wav")), &wav).unwrap();
        }
        fs::write(source.join(format!("video/{banner}.webm")), video).unwrap();
        let registry = json!({"schema_version":1,"announcer_id":ann,"revision":revision,"name":label,"locale":"th",
            "sounds":[{"sound_id":original,"role":"original_voice","label":"Original","path":format!("audio/{original}.wav"),"sha256":sha256(&wav)},
                {"sound_id":mixed,"role":"mixed_voice_sfx","label":"Played","path":format!("audio/{mixed}.wav"),"sha256":sha256(&wav)}],
            "components":[],"unmapped_sound_ids":[],"events":{"kill":[{"sound_id":original,"banner_id":banner}]},
            "banners":[{"banner_id":banner,"event_key":"kill","original_sound_id":original,"playback_sound_id":mixed,
                "visual_source":{"root":".","silent":true,"video":format!("video/{banner}.webm"),"sha256":sha256(video)},
                "components":[],"cues":[],"config":{"duration_seconds":1}}]});
        let manifest = format!("{ann}.json");
        fs::write(
            source.join(&manifest),
            serde_json::to_vec(&registry).unwrap(),
        )
        .unwrap();
        let path = self.0.join(format!("{revision}-{label}.gann"));
        let package = g_ann_package::create(&source, &manifest, &path).unwrap();
        (path, package.digest)
    }
    fn install(
        &self,
        installer: &PackageInstaller,
        revision: u64,
        label: &str,
        binding: Option<String>,
    ) -> InstallResult {
        let (path, expected_digest) = self.package(revision, label);
        installer
            .install_package(InstallSource::Local {
                path,
                expected_digest,
                project_binding: binding,
            })
            .unwrap()
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

#[test]
fn package_install_commits_without_equip_and_preserves_retained_container() {
    let f = Fixture::new();
    let installer = f.installer("test");
    let result = f.install(&installer, 1, "ภาษาไทย", None);
    assert!(result.installed);
    assert_eq!(result.activation, ActivationState::Inactive);
    assert_eq!(installer.selection().unwrap(), Selection::default());
    let archive = installer
        .profile_root()
        .join("containers")
        .join(format!("{}.gann", result.artifact.digest));
    assert_eq!(
        Package::open(&archive).unwrap().digest,
        result.artifact.digest
    );
    assert!(result.project_binding.is_some());
}

#[test]
fn package_install_versions_are_side_by_side_and_match_equip_is_deferred() {
    let f = Fixture::new();
    let installer = f.installer("test");
    let first = f.install(&installer, 1, "one", None);
    installer
        .equip_package(&first.installation_id, EquipPolicy::NowIfIdle)
        .unwrap();
    installer.set_match_active(true).unwrap();
    let second = f.install(&installer, 2, "two", first.project_binding);
    assert_eq!(
        installer
            .equip_package(&second.installation_id, EquipPolicy::NowIfIdle)
            .unwrap(),
        ActivationState::DeferredUntilMatchEnd
    );
    assert_eq!(
        installer.selection().unwrap().active,
        Some(first.installation_id.clone())
    );
    assert_eq!(
        installer.selection().unwrap().pending,
        Some(second.installation_id.clone())
    );
    assert!(installer
        .cache_path(&first.installation_id)
        .unwrap()
        .is_dir());
    installer.set_match_active(false).unwrap();
    assert_eq!(
        installer.selection().unwrap().active,
        Some(second.installation_id)
    );
    assert_eq!(installer.installed().unwrap().len(), 2);
}

#[test]
fn package_install_same_revision_different_digest_cannot_update_lineage() {
    let f = Fixture::new();
    let installer = f.installer("test");
    let first = f.install(&installer, 1, "one", None);
    installer
        .equip_package(&first.installation_id, EquipPolicy::NowIfIdle)
        .unwrap();
    let (path, expected_digest) = f.package(1, "altered");
    let error = installer
        .install_package(InstallSource::Local {
            path,
            expected_digest,
            project_binding: first.project_binding,
        })
        .unwrap_err();
    assert_eq!(error.code, "revision_conflict");
    assert_eq!(
        installer.selection().unwrap().active,
        Some(first.installation_id)
    );
    assert_eq!(installer.installed().unwrap().len(), 1);
}

#[test]
fn package_install_new_local_source_never_shadows_existing_authority() {
    let f = Fixture::new();
    let installer = f.installer("test");
    let first = f.install(&installer, 1, "one", None);
    installer
        .equip_package(&first.installation_id, EquipPolicy::NowIfIdle)
        .unwrap();
    let second = f.install(&installer, 1, "two", None);
    assert_ne!(first.installation_id, second.installation_id);
    let records = installer.installed().unwrap();
    assert_ne!(records[0].authority, records[1].authority);
    assert_eq!(
        installer.selection().unwrap().active,
        Some(first.installation_id)
    );
}

#[test]
fn package_install_digest_and_binding_failures_preserve_selection() {
    let f = Fixture::new();
    let installer = f.installer("test");
    let first = f.install(&installer, 1, "one", None);
    installer
        .equip_package(&first.installation_id, EquipPolicy::NowIfIdle)
        .unwrap();
    let (path, expected_digest) = f.package(2, "two");
    let bad = installer
        .install_package(InstallSource::Local {
            path: path.clone(),
            expected_digest: "0".repeat(64),
            project_binding: first.project_binding.clone(),
        })
        .unwrap_err();
    assert_eq!(bad.code, "digest_mismatch");
    let bad = installer
        .install_package(InstallSource::Local {
            path,
            expected_digest,
            project_binding: Some("forged".into()),
        })
        .unwrap_err();
    assert_eq!(bad.code, "invalid_binding");
    assert_eq!(
        installer.selection().unwrap().active,
        Some(first.installation_id)
    );
    assert_eq!(installer.installed().unwrap().len(), 1);
}

#[test]
fn package_install_repair_bad_cache_and_rollback_reverify_retained_bytes() {
    let f = Fixture::new();
    let installer = f.installer("test");
    let first = f.install(&installer, 1, "one", None);
    let first_cache = installer.cache_path(&first.installation_id).unwrap();
    let manifest = first_cache.join(format!("{}.json", first.artifact.announcer_id));
    fs::write(&manifest, b"corrupted").unwrap();
    installer.repair_package(&first.installation_id).unwrap();
    let registry: serde_json::Value =
        serde_json::from_slice(&fs::read(&manifest).unwrap()).unwrap();
    assert_eq!(registry["revision"], 1);
    let second = f.install(&installer, 2, "two", first.project_binding);
    installer
        .equip_package(&second.installation_id, EquipPolicy::NowIfIdle)
        .unwrap();
    installer
        .rollback_package(&first.installation_id, EquipPolicy::NowIfIdle)
        .unwrap();
    assert_eq!(
        installer.selection().unwrap().active,
        Some(first.installation_id.clone())
    );
    fs::write(
        installer
            .profile_root()
            .join("containers")
            .join(format!("{}.gann", first.artifact.digest)),
        b"bad",
    )
    .unwrap();
    assert!(installer
        .rollback_package(&first.installation_id, EquipPolicy::NowIfIdle)
        .is_err());
}

#[test]
fn package_install_rejects_profile_path_and_cross_profile_binding() {
    let f = Fixture::new();
    assert!(PackageInstaller::new(&f.0, ProfileId("../escape".into())).is_err());
    let a = f.installer("a");
    let b = f.installer("b");
    let first = f.install(&a, 1, "one", None);
    let (path, expected_digest) = f.package(2, "two");
    assert_eq!(
        b.install_package(InstallSource::Local {
            path,
            expected_digest,
            project_binding: first.project_binding
        })
        .unwrap_err()
        .code,
        "invalid_binding"
    );
    assert!(b.installed().unwrap().is_empty());
}

thread_local! { static FAULT:std::cell::RefCell<Option<(&'static str,&'static str)>>=const {std::cell::RefCell::new(None)}; }
pub(super) fn checkpoint(point: &str) -> Result<(), PackageError> {
    FAULT.with(|fault| {
        if let Some((target, code)) = *fault.borrow() {
            if target == point {
                return Err(PackageError::new(code, "Injected storage failure"));
            }
        }
        Ok(())
    })
}

#[test]
fn package_install_interrupted_copy_disk_full_and_crash_before_commit_preserve_active() {
    for (point, code) in [
        ("copy", "interrupted_copy"),
        ("copy", "disk_full"),
        ("before_registry", "crash_before_commit"),
    ] {
        let f = Fixture::new();
        let installer = f.installer("test");
        let first = f.install(&installer, 1, "one", None);
        installer
            .equip_package(&first.installation_id, EquipPolicy::NowIfIdle)
            .unwrap();
        let (path, expected_digest) = f.package(2, "two");
        FAULT.with(|fault| *fault.borrow_mut() = Some((point, code)));
        let result = installer.install_package(InstallSource::Local {
            path,
            expected_digest,
            project_binding: first.project_binding,
        });
        FAULT.with(|fault| *fault.borrow_mut() = None);
        assert_eq!(result.unwrap_err().code, code);
        installer.recover().unwrap();
        installer.recover().unwrap();
        assert_eq!(installer.installed().unwrap().len(), 1);
        assert_eq!(
            installer.selection().unwrap().active,
            Some(first.installation_id.clone())
        );
        assert_eq!(
            Package::open(
                &installer
                    .profile_root()
                    .join("containers")
                    .join(format!("{}.gann", first.artifact.digest))
            )
            .unwrap()
            .digest,
            first.artifact.digest
        );
        assert!(installer
            .cache_path(&first.installation_id)
            .unwrap()
            .is_dir());
    }
}

#[test]
fn package_install_crash_after_registry_before_equip_keeps_old_selection() {
    let f = Fixture::new();
    let installer = f.installer("test");
    let first = f.install(&installer, 1, "one", None);
    installer
        .equip_package(&first.installation_id, EquipPolicy::NowIfIdle)
        .unwrap();
    let (path, expected_digest) = f.package(2, "two");
    FAULT.with(|fault| *fault.borrow_mut() = Some(("after_registry", "crash_after_registry")));
    let result = installer.install_package(InstallSource::Local {
        path,
        expected_digest,
        project_binding: first.project_binding,
    });
    FAULT.with(|fault| *fault.borrow_mut() = None);
    assert_eq!(result.unwrap_err().code, "crash_after_registry");
    installer.recover().unwrap();
    installer.recover().unwrap();
    assert_eq!(installer.installed().unwrap().len(), 2);
    assert_eq!(
        installer.selection().unwrap().active,
        Some(first.installation_id)
    );
}

#[test]
fn package_install_recovery_restores_cache_after_interrupted_repair_rename() {
    let f = Fixture::new();
    let installer = f.installer("test");
    let first = f.install(&installer, 1, "one", None);
    installer
        .equip_package(&first.installation_id, EquipPolicy::NowIfIdle)
        .unwrap();
    let cache = installer.cache_path(&first.installation_id).unwrap();
    let stage_name = format!("tx-{}", "a".repeat(32));
    let stage = installer.profile_root().join("staging").join(&stage_name);
    fs::create_dir(&stage).unwrap();
    fs::rename(&cache, stage.join("previous-cache")).unwrap();
    fs::write(
        installer.profile_root().join("journal.json"),
        serde_json::to_vec(&json!({"stage":stage_name,"repair":first.installation_id})).unwrap(),
    )
    .unwrap();
    installer.recover().unwrap();
    installer.recover().unwrap();
    assert!(cache
        .join(format!("{}.json", first.artifact.announcer_id))
        .is_file());
    assert_eq!(
        installer.selection().unwrap().active,
        Some(first.installation_id)
    );
}

#[test]
fn package_install_snapshot_pin_blocks_equip_and_repair_through_second_handle() {
    let f = Fixture::new();
    let installer = f.installer("test");
    let first = f.install(&installer, 1, "one", None);
    installer
        .equip_package(&first.installation_id, EquipPolicy::NowIfIdle)
        .unwrap();
    let second = f.install(&installer, 2, "two", first.project_binding);
    let lease = installer.pin_package(&first.installation_id).unwrap();
    let alias = f.installer("test");
    assert_eq!(
        alias
            .equip_package(&second.installation_id, EquipPolicy::NowIfIdle)
            .unwrap(),
        ActivationState::DeferredUntilMatchEnd
    );
    assert_eq!(
        alias
            .repair_package(&first.installation_id)
            .unwrap_err()
            .code,
        "revision_pinned"
    );
    alias.set_match_active(false).unwrap();
    assert_eq!(
        alias.selection().unwrap().active,
        Some(first.installation_id.clone())
    );
    assert_eq!(lease.artifact.digest, first.artifact.digest);
    drop(lease);
    alias.set_match_active(false).unwrap();
    assert_eq!(
        alias.selection().unwrap().active,
        Some(second.installation_id)
    );
}

#[test]
fn package_install_local_cannot_bind_to_or_shadow_store() {
    let f = Fixture::new();
    let installer = f.installer("test");
    let first = f.install(&installer, 1, "one", None);
    let mut registry = installer.registry().unwrap();
    registry.installations[0].authority = OriginAuthority::Store {
        issuer: "gstore".into(),
        publisher_id: "publisher".into(),
    };
    registry.bindings.clear();
    atomic_json(&installer.profile_root().join("installed.json"), &registry).unwrap();
    let second = f.install(&installer, 2, "two", None);
    assert_ne!(first.installation_id, second.installation_id);
    assert!(matches!(
        installer.installed().unwrap()[0].authority,
        OriginAuthority::Store { .. }
    ));
    assert!(matches!(
        installer.installed().unwrap()[1].authority,
        OriginAuthority::Local { .. }
    ));
    let (path, expected_digest) = f.package(3, "three");
    assert_eq!(
        installer
            .install_package(InstallSource::Local {
                path,
                expected_digest,
                project_binding: Some(first.installation_id.0)
            })
            .unwrap_err()
            .code,
        "invalid_binding"
    );
}

#[test]
fn package_install_transaction_lock_excludes_simultaneous_import_and_equip() {
    let f = Fixture::new();
    let installer = f.installer("test");
    let first = f.install(&installer, 1, "one", None);
    let lock = installer.lock().unwrap();
    assert_eq!(
        installer
            .equip_package(&first.installation_id, EquipPolicy::NowIfIdle)
            .unwrap_err()
            .code,
        "profile_busy"
    );
    let (path, expected_digest) = f.package(2, "two");
    assert_eq!(
        installer
            .install_package(InstallSource::Local {
                path,
                expected_digest,
                project_binding: first.project_binding
            })
            .unwrap_err()
            .code,
        "profile_busy"
    );
    drop(lock);
    assert_eq!(installer.installed().unwrap().len(), 1);
}

#[test]
fn package_install_stream_reports_real_writer_failure_and_never_uses_large_scratch() {
    struct FullDisk;
    impl Write for FullDisk {
        fn write(&mut self, _: &[u8]) -> std::io::Result<usize> {
            Err(std::io::Error::from(std::io::ErrorKind::StorageFull))
        }
        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }
    struct Chunks {
        remaining: usize,
        max_request: usize,
    }
    impl Read for Chunks {
        fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
            self.max_request = self.max_request.max(buf.len());
            let n = buf.len().min(self.remaining);
            buf[..n].fill(0);
            self.remaining -= n;
            Ok(n)
        }
    }
    let mut input = Chunks {
        remaining: 200_000,
        max_request: 0,
    };
    assert_eq!(
        bounded_copy(&mut input, &mut FullDisk).unwrap_err().code,
        "disk_full"
    );
    assert!(input.max_request <= 1_048_576);
}

#[test]
fn package_install_store_authority_from_disk_metadata_cannot_activate() {
    let f = Fixture::new();
    let installer = f.installer("test");
    let first = f.install(&installer, 1, "one", None);
    let second = f.install(&installer, 2, "two", None);
    installer
        .equip_package(&first.installation_id, EquipPolicy::NowIfIdle)
        .unwrap();
    let mut registry = installer.registry().unwrap();
    registry.installations[1].authority = OriginAuthority::Store {
        issuer: "gstore".into(),
        publisher_id: "forged".into(),
    };
    registry.bindings.retain(|binding| {
        binding.announcer_id != second.artifact.announcer_id
            || binding.token != second.project_binding.as_deref().unwrap()
    });
    let old_cache = installer.cache_path(&second.installation_id).unwrap();
    let new_cache = installer.cache_for(&registry.installations[1]);
    fs::create_dir_all(new_cache.parent().unwrap()).unwrap();
    fs::rename(old_cache, new_cache).unwrap();
    atomic_json(&installer.profile_root().join("installed.json"), &registry).unwrap();
    assert_eq!(
        installer
            .equip_package(&second.installation_id, EquipPolicy::NowIfIdle)
            .unwrap_err()
            .code,
        "store_adapter_unavailable"
    );
    assert_eq!(
        installer.selection().unwrap().active,
        Some(first.installation_id)
    );
}

#[test]
fn package_install_store_failure_never_falls_back_to_local_import() {
    use g_ann_package::{verify_store_release, TrustedKey, TrustedKeyState};
    let f = Fixture::new();
    let installer = f.installer("test");
    let first = f.install(&installer, 1, "one", None);
    installer
        .equip_package(&first.installation_id, EquipPolicy::NowIfIdle)
        .unwrap();
    let public = "03a107bff3ce10be1d70dd18e74bc09967e4d6309ba50d5f1ddc8664125531b8";
    let key: Vec<u8> = public
        .as_bytes()
        .chunks_exact(2)
        .map(|p| u8::from_str_radix(std::str::from_utf8(p).unwrap(), 16).unwrap())
        .collect();
    let release = verify_store_release(
        include_bytes!("../gann-package/tests/fixtures/release-v1.json"),
        &[TrustedKey {
            issuer: "gstore".into(),
            key_id: "test-release-2026-01".into(),
            public_key: key.try_into().unwrap(),
            state: TrustedKeyState::Active,
        }],
    )
    .unwrap();
    let (path, _) = f.package(2, "two");
    assert_eq!(
        installer
            .install_package(InstallSource::Store {
                path,
                release: Box::new(release),
                authorization: VerifiedStoreAuthorization { _private: () }
            })
            .unwrap_err()
            .code,
        "store_adapter_unavailable"
    );
    assert_eq!(installer.installed().unwrap().len(), 1);
    assert_eq!(
        installer.selection().unwrap().active,
        Some(first.installation_id)
    );
}

#[test]
fn package_install_admitted_descriptor_does_not_pin_until_event_lease() {
    let f = Fixture::new();
    let installer = f.installer("test");
    let first = f.install(&installer, 1, "one", None);
    installer
        .equip_package(&first.installation_id, EquipPolicy::NowIfIdle)
        .unwrap();
    let admitted = installer.admit_package(&first.installation_id).unwrap();
    let second = f.install(&installer, 2, "two", first.project_binding);
    assert_eq!(
        installer
            .equip_package(&second.installation_id, EquipPolicy::NowIfIdle)
            .unwrap(),
        ActivationState::Active
    );
    let storage_busy = installer.lock().unwrap();
    let lease = admitted.lease().unwrap();
    drop(storage_busy);
    assert_eq!(
        installer
            .rollback_package(&first.installation_id, EquipPolicy::NowIfIdle)
            .unwrap(),
        ActivationState::DeferredUntilMatchEnd
    );
    drop(lease);
    installer.set_match_active(false).unwrap();
    assert_eq!(
        installer.selection().unwrap().active,
        Some(first.installation_id)
    );
}

#[test]
fn package_install_repair_invalidates_unpinned_admission_before_cache_replacement() {
    let f = Fixture::new();
    let installer = f.installer("test");
    let first = f.install(&installer, 1, "one", None);
    let admitted = installer.admit_package(&first.installation_id).unwrap();
    installer.repair_package(&first.installation_id).unwrap();
    assert_eq!(admitted.lease().unwrap_err().code, "snapshot_stale");
    installer
        .admit_package(&first.installation_id)
        .unwrap()
        .lease()
        .unwrap();
}

#[test]
fn package_install_reopening_profile_recovers_interrupted_repair_before_admission() {
    let f = Fixture::new();
    let installer = f.installer("test");
    let first = f.install(&installer, 1, "one", None);
    let cache = installer.cache_path(&first.installation_id).unwrap();
    let stage_name = format!("tx-{}", "b".repeat(32));
    let stage = installer.profile_root().join("staging").join(&stage_name);
    fs::create_dir(&stage).unwrap();
    fs::rename(&cache, stage.join("previous-cache")).unwrap();
    fs::write(
        installer.profile_root().join("journal.json"),
        serde_json::to_vec(&json!({"stage":stage_name,"repair":first.installation_id})).unwrap(),
    )
    .unwrap();
    drop(installer);
    let reopened = f.installer("test");
    reopened.admit_package(&first.installation_id).unwrap();
}

#[test]
fn package_install_owner_probe_child() {
    let Ok(root) = std::env::var("GANN_INSTALL_OWNER_PROBE") else {
        return;
    };
    let code = PackageInstaller::new(Path::new(&root), ProfileId("test".into()))
        .err()
        .map(|e| e.code);
    assert_eq!(code.as_deref(), Some("profile_busy"));
}

#[test]
fn package_install_second_process_cannot_take_profile_ownership() {
    let f = Fixture::new();
    let _installer = f.installer("test");
    let output = std::process::Command::new(std::env::current_exe().unwrap())
        .args([
            "--exact",
            "package_install::tests::package_install_owner_probe_child",
            "--nocapture",
        ])
        .env("GANN_INSTALL_OWNER_PROBE", &f.0)
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "{}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
}

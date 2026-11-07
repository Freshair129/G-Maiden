//! One event-media owner: a verified GANN pair, admitted by native audio.
use std::sync::{Arc, OnceLock};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

static APP: OnceLock<AppHandle> = OnceLock::new();

#[derive(Default)]
struct RotationRequest {
    permit: Option<super::variant_rotation::Permit>,
    fence: Option<crate::audio::AnnouncerRequestFence>,
}

struct EventRequest {
    selected: super::AnnouncerClip,
    event: String,
    preview: bool,
    priority: crate::audio::Priority,
    rotation: RotationRequest,
}

pub(crate) fn install(app: AppHandle) {
    let _ = APP.set(app);
}

pub(crate) fn app() -> Option<AppHandle> {
    APP.get().cloned()
}

pub(crate) fn changed() {
    if let Some(app) = APP.get() {
        let _ = app.emit("announcer-pack-changed", ());
    }
}

pub(crate) fn verify_visual(selected: &super::AnnouncerClip) -> Result<(), String> {
    let pair = selected.pair.as_ref().ok_or("GANN pair unavailable")?;
    super::video_cache::verified(selected.revision, &pair.video, &pair.video_hash)
        .map(|_| ())
        .ok_or_else(|| "GANN video is missing or changed".into())
}

pub(crate) fn native_asset(
    selected: &super::AnnouncerClip,
) -> Result<Arc<crate::gann_native::Asset>, String> {
    let pair = selected.pair.as_ref().ok_or("GANN pair unavailable")?;
    let bytes = super::video_cache::verified(selected.revision, &pair.video, &pair.video_hash)
        .ok_or("GANN video is missing or changed")?;
    let mut asset = crate::gann_native::Asset::new(bytes)?;
    if asset.video.duration_us
        > (pair.samples as u64).saturating_mul(1_000_000) / 48000
            + u64::from(pair.visual_tail_ms) * 1000
            + 20_000
    {
        return Err("GANN video exceeds the declared audio and visual-tail timeline".into());
    }
    Arc::get_mut(&mut asset)
        .ok_or("native asset ownership")?
        .lease = selected.installation_lease()?;
    Ok(asset)
}

pub(crate) fn play_event(
    app: AppHandle,
    event: String,
    epoch: u64,
    preview: bool,
    priority: crate::audio::Priority,
    request_fence: Option<crate::audio::AnnouncerRequestFence>,
) -> Result<(), String> {
    let request = prepare_event_request(
        event,
        preview,
        priority,
        request_fence,
        |event, revision, last| {
            super::pack_io::select_announcer_clip_for_revision(event, revision, last)
        },
    )?;
    play_selected_tracked(
        app,
        request.selected,
        request.event,
        epoch,
        request.preview,
        request.priority,
        request.rotation,
    )
}

/// The selection/reservation boundary used by GSI's `play_event` dispatch.
/// Keeping it separate lets tests drive the real non-critical routing without
/// requiring a physical output device or a Tauri window.
fn prepare_event_request(
    event: String,
    preview: bool,
    priority: crate::audio::Priority,
    request_fence: Option<crate::audio::AnnouncerRequestFence>,
    select: impl FnOnce(&str, Option<u64>, Option<&std::path::Path>) -> Option<super::AnnouncerClip>,
) -> Result<EventRequest, String> {
    let permit = if !preview && priority == crate::audio::Priority::Announcer {
        if !super::events::EVENTS.iter().any(|item| item.id == event) {
            return Err("Unknown announcer event".into());
        }
        let revision = super::current_announcer_revision().ok_or("GANN event is unmapped")?;
        Some(
            super::variant_rotation::coordinator()
                .reserve_current(revision, &event, Duration::from_secs(2), || {
                    request_fence
                        .as_ref()
                        .is_some_and(|fence| fence.is_current())
                })
                .ok_or("Announcer event selection busy or stale")?,
        )
    } else {
        None
    };
    let selected = (if let Some(permit) = permit.as_ref() {
        select(&event, Some(permit.revision()), permit.last())
    } else if priority == crate::audio::Priority::Critical {
        crate::audio::critical_event_selection(&event)
    } else {
        select(&event, None, None)
    })
    .ok_or_else(|| {
        eprintln!("[G-AnnouncerMedia] phase=unmapped event={event} source=gann");
        "เหตุการณ์นี้ไม่มีคู่เสียงและภาพในแพ็ก GANN ที่ใช้งาน".to_string()
    })?;
    Ok(EventRequest {
        selected,
        event,
        preview,
        priority,
        rotation: RotationRequest {
            permit,
            fence: request_fence,
        },
    })
}

fn record_rotation_outcome(
    permit: Option<super::variant_rotation::Permit>,
    outcome: crate::audio::PlaybackResult,
    played_path: std::path::PathBuf,
) {
    if outcome == crate::audio::PlaybackResult::Admitted {
        if let Some(permit) = permit {
            permit.admitted(played_path);
        }
    }
}

pub(crate) fn play_selected(
    app: AppHandle,
    selected: super::AnnouncerClip,
    event: String,
    epoch: u64,
    preview: bool,
    priority: crate::audio::Priority,
) -> Result<(), String> {
    play_selected_tracked(
        app,
        selected,
        event,
        epoch,
        preview,
        priority,
        RotationRequest::default(),
    )
}

fn play_selected_tracked(
    app: AppHandle,
    selected: super::AnnouncerClip,
    event: String,
    epoch: u64,
    preview: bool,
    priority: crate::audio::Priority,
    rotation: RotationRequest,
) -> Result<(), String> {
    let RotationRequest {
        permit,
        fence: request_fence,
    } = rotation;
    if super::with_current_announcer_clip(&event, &selected, || ()).is_none() {
        return Err("GANN selection changed".into());
    }
    let pair = selected.pair.as_ref().ok_or("GANN pair unavailable")?;
    verify_visual(&selected)?;
    let request = serde_json::json!({"phase":"requested","event":event,"pack_id":selected.pack_id,
        "installation_id":selected.installation.as_ref().map(|i|&i.installation_id().0),
        "artifact":selected.installation.as_ref().map(|i|i.artifact()),
        "pack_name":selected.pack_name,"banner_id":pair.banner_id,"original_sha256":pair.original_hash,"played_sha256":pair.mixed_hash,
        "revision":selected.revision,"session_epoch":epoch,"preview":preview});
    eprintln!("[G-AnnouncerMedia] {request}");
    let hp = priority == crate::audio::Priority::Critical;
    let current = selected.clone();
    let current_event = event.clone();
    let scope = Arc::new(move || {
        (preview
            || ((if hp {
                crate::runtime::hp_alert_media_enabled()
            } else {
                crate::runtime::announcer_enabled()
            }) && crate::runtime::is_current_active_session_epoch(epoch)))
            && super::with_current_announcer_clip(&current_event, &current, || ()).is_some()
    });
    let mut observer = crate::vrzo_playback::observer(
        app.clone(),
        selected.clone(),
        event.clone(),
        epoch,
        preview,
        scope.clone(),
    )
    .ok_or("ตัวเล่น GANN ยังไม่พร้อม")?;
    if hp {
        observer.visual_scope = Some((selected.revision, epoch, preview, 2));
    }
    let path = selected.path.clone();
    let played_path = path.clone();
    crate::audio::play_observed_with_lifecycle(
        path,
        priority,
        move |commit| {
            if scope() {
                if preview {
                    let _ = super::with_current_announcer_clip(&event, &selected, commit);
                } else {
                    let _ = crate::runtime::with_speech_admission(epoch, None, || {
                        let _ = super::with_current_announcer_clip(&event, &selected, commit);
                        Ok(())
                    });
                }
            }
        },
        move |outcome| {
            record_rotation_outcome(permit, outcome, played_path);
            let mut receipt = request;
            receipt["phase"] = if outcome == crate::audio::PlaybackResult::Admitted {
                "admitted"
            } else {
                "rejected"
            }
            .into();
            eprintln!("[G-AnnouncerMedia] {receipt}");
        },
        observer,
        request_fence,
    );
    Ok(())
}

#[cfg(test)]
fn prepare_event_request_at(
    event: &str,
    preview: bool,
    priority: crate::audio::Priority,
    request_fence: Option<crate::audio::AnnouncerRequestFence>,
    index: usize,
) -> Result<EventRequest, String> {
    prepare_event_request(
        event.to_owned(),
        preview,
        priority,
        request_fence,
        |event, revision, last| {
            super::pack_io::select_announcer_clip_for_revision_at(event, revision, last, index)
        },
    )
}

/// Drives the same pair verification and bounded PCM preparation as the
/// non-critical worker, then reaches the same receipt-side rotation commit.
/// It deliberately stops at the device boundary: native output needs an owner
/// run and must not make this deterministic source test depend on a sound card.
#[cfg(test)]
fn prepare_and_admit_noncritical_for_test(
    request: EventRequest,
) -> Result<std::path::PathBuf, String> {
    let EventRequest {
        selected,
        event,
        preview,
        priority,
        rotation,
    } = request;
    if priority != crate::audio::Priority::Announcer {
        return Err("test admission is only for the non-critical announcer path".into());
    }
    let RotationRequest {
        permit,
        fence: request_fence,
    } = rotation;
    if request_fence
        .as_ref()
        .is_some_and(|fence| !fence.is_current())
    {
        return Err("GANN request fence changed before preparation".into());
    }
    if super::with_current_announcer_clip(&event, &selected, || ()).is_none() {
        return Err("GANN selection changed before preparation".into());
    }
    verify_visual(&selected)?;
    let pair = selected.pair.as_ref().ok_or("GANN pair unavailable")?;
    let mixed = crate::event_media::MixedSelection {
        path: pair.mixed.clone(),
        original_sha256: pair.original_hash.clone(),
        mixed_sha256: pair.mixed_hash.clone(),
        samples: pair.samples,
    };
    crate::audio::prepare_announcer_pair_for_test(&selected.path, &mixed)?;
    if request_fence
        .as_ref()
        .is_some_and(|fence| !fence.is_current())
    {
        return Err("GANN request fence changed before admission".into());
    }
    if super::with_current_announcer_clip(&event, &selected, || ()).is_none() {
        return Err("GANN selection changed before admission".into());
    }
    record_rotation_outcome(
        permit,
        crate::audio::PlaybackResult::Admitted,
        selected.path.clone(),
    );
    let _ = preview;
    Ok(selected.path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::{Path, PathBuf};

    use crate::voice_api::{
        activate_if_exists, clear_resolved_cache_for_test, current_announcer_revision,
        set_test_voice_root,
    };

    struct RootGuard(PathBuf);

    impl Drop for RootGuard {
        fn drop(&mut self) {
            set_test_voice_root(None);
            clear_resolved_cache_for_test();
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn temp_root(tag: &str) -> PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!(
            "gmaiden-gsi-announcer-admission-{tag}-{}-{nanos}",
            std::process::id()
        ));
        fs::create_dir_all(&root).unwrap();
        root
    }

    fn last(request: &EventRequest) -> Option<PathBuf> {
        request
            .rotation
            .permit
            .as_ref()
            .and_then(|permit| permit.last())
            .map(Path::to_path_buf)
    }

    fn dispatch(event: &str, preview: bool, index: usize) -> Result<EventRequest, String> {
        prepare_event_request_at(
            event,
            preview,
            crate::audio::Priority::Announcer,
            Some(crate::audio::AnnouncerRequestFence::capture()),
            index,
        )
    }

    #[test]
    fn gsi_noncritical_admission_rotates_verified_pairs_without_repeats() {
        let root = temp_root("rotation");
        set_test_voice_root(Some(root.clone()));
        let _guard = RootGuard(root.clone());
        let id = super::super::test_package::install_rotation_fixture(&root, 31_001);
        activate_if_exists(&id).unwrap();

        let mut previous = None;
        for index in 0..50 {
            let request = dispatch("kill", false, index).unwrap();
            let selected = request.selected.path.clone();
            let pair = request.selected.pair.as_ref().unwrap();
            assert_eq!(pair.original, selected);
            assert!(pair.video.is_file());
            assert_ne!(previous.as_ref(), Some(&selected));
            assert_eq!(
                prepare_and_admit_noncritical_for_test(request).unwrap(),
                selected
            );
            previous = Some(selected);
        }

        let first_death = dispatch("death", false, 0).unwrap();
        assert_eq!(last(&first_death), None, "event histories are independent");
        let first = prepare_and_admit_noncritical_for_test(first_death).unwrap();
        let second =
            prepare_and_admit_noncritical_for_test(dispatch("death", false, 1).unwrap()).unwrap();
        assert_eq!(first, second, "a one-pair event remains eligible to repeat");
    }

    #[test]
    fn preview_and_rejected_preparation_do_not_change_admitted_history() {
        let root = temp_root("preview-rejection");
        set_test_voice_root(Some(root.clone()));
        let _guard = RootGuard(root.clone());
        let id = super::super::test_package::install_rotation_fixture(&root, 31_002);
        activate_if_exists(&id).unwrap();

        let first =
            prepare_and_admit_noncritical_for_test(dispatch("kill", false, 0).unwrap()).unwrap();
        let preview = dispatch("kill", true, 0).unwrap();
        assert!(preview.rotation.permit.is_none());
        prepare_and_admit_noncritical_for_test(preview).unwrap();

        let after_preview = dispatch("kill", false, 0).unwrap();
        assert_eq!(last(&after_preview), Some(first.clone()));
        assert_ne!(after_preview.selected.path, first);
        let rejected_path = after_preview.selected.path.clone();
        let mixed = after_preview.selected.pair.as_ref().unwrap().mixed.clone();
        fs::write(mixed, b"changed mixed WAV after selection").unwrap();
        assert!(prepare_and_admit_noncritical_for_test(after_preview).is_err());

        let after_rejection = dispatch("kill", false, 0).unwrap();
        assert_eq!(last(&after_rejection), Some(first));
        assert_eq!(after_rejection.selected.path, rejected_path);
    }

    #[test]
    fn package_revision_change_resets_history_and_invalidates_inflight_permit() {
        let root = temp_root("revision");
        set_test_voice_root(Some(root.clone()));
        let _guard = RootGuard(root.clone());
        let first_id = super::super::test_package::install_rotation_fixture(&root, 31_003);
        activate_if_exists(&first_id).unwrap();
        let old_path =
            prepare_and_admit_noncritical_for_test(dispatch("kill", false, 0).unwrap()).unwrap();
        let stale = dispatch("kill", false, 0).unwrap();
        assert_eq!(last(&stale), Some(old_path));
        let old_revision = stale.selected.revision;

        let second_id = super::super::test_package::install_rotation_fixture(&root, 31_004);
        activate_if_exists(&second_id).unwrap();
        assert!(current_announcer_revision().unwrap() > old_revision);
        assert!(prepare_and_admit_noncritical_for_test(stale).is_err());

        let fresh = dispatch("kill", false, 0).unwrap();
        assert_eq!(fresh.selected.pack_id, second_id);
        assert_eq!(
            last(&fresh),
            None,
            "new package revision starts without history"
        );
        prepare_and_admit_noncritical_for_test(fresh).unwrap();
    }

    #[test]
    fn cancelled_gsi_dispatch_fence_cannot_admit_or_commit_history() {
        let root = temp_root("cancelled-fence");
        set_test_voice_root(Some(root.clone()));
        let _guard = RootGuard(root.clone());
        let id = super::super::test_package::install_rotation_fixture(&root, 31_005);
        activate_if_exists(&id).unwrap();

        let (fence, cancellation) = crate::audio::test_announcer_request_fence();
        let stale = prepare_event_request_at(
            "kill",
            false,
            crate::audio::Priority::Announcer,
            Some(fence),
            0,
        )
        .unwrap();
        cancellation.cancel();
        assert!(prepare_and_admit_noncritical_for_test(stale).is_err());

        let fresh = dispatch("kill", false, 0).unwrap();
        assert_eq!(last(&fresh), None);
    }

    #[test]
    fn critical_cached_events_never_request_rotation() {
        let root = temp_root("critical");
        set_test_voice_root(Some(root.clone()));
        let _guard = RootGuard(root.clone());
        let id = super::super::test_package::install_rotation_fixture(&root, 31_006);
        activate_if_exists(&id).unwrap();

        for event in ["gank", "danger", "revision"] {
            let cached = crate::audio::critical_event_selection(event).unwrap();
            let request = prepare_event_request(
                event.to_owned(),
                false,
                crate::audio::Priority::Critical,
                None,
                |_, _, _| panic!("critical events must not enter variant selection"),
            )
            .unwrap();
            assert!(request.rotation.permit.is_none());
            assert_eq!(request.selected.path, cached.path);
            assert_eq!(request.selected.revision, cached.revision);
        }
    }
}

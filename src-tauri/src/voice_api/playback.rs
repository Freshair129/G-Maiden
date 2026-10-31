//! One event-media owner: a verified GANN pair, admitted by native audio.
use std::sync::{Arc, OnceLock};
use tauri::{AppHandle, Emitter};

static APP: OnceLock<AppHandle> = OnceLock::new();

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

pub(crate) fn play_event(
    app: AppHandle,
    event: String,
    epoch: u64,
    preview: bool,
    priority: crate::audio::Priority,
) -> Result<(), String> {
    let selected = (if priority == crate::audio::Priority::Critical {
        crate::audio::critical_event_selection(&event)
    } else {
        super::select_announcer_clip(&event)
    })
    .ok_or_else(|| {
        eprintln!("[G-AnnouncerMedia] phase=unmapped event={event} source=gann");
        "เหตุการณ์นี้ไม่มีคู่เสียงและภาพในแพ็ก GANN ที่ใช้งาน".to_string()
    })?;
    play_selected(app, selected, event, epoch, preview, priority)
}

pub(crate) fn play_selected(
    app: AppHandle,
    selected: super::AnnouncerClip,
    event: String,
    epoch: u64,
    preview: bool,
    priority: crate::audio::Priority,
) -> Result<(), String> {
    if super::with_current_announcer_clip(&event, &selected, || ()).is_none() {
        return Err("GANN selection changed".into());
    }
    let pair = selected.pair.as_ref().ok_or("GANN pair unavailable")?;
    verify_visual(&selected)?;
    let request = serde_json::json!({"phase":"requested","event":event,"pack_id":selected.pack_id,
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
    );
    Ok(())
}

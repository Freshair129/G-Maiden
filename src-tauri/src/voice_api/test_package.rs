use std::{
    fs,
    path::{Path, PathBuf},
};

pub(crate) fn install(root: &Path, serial: u64, event: &str) -> (String, PathBuf, PathBuf) {
    try_install(root, serial, event)
        .unwrap_or_else(|error| panic!("failed to import event {event}: {error}"))
}

pub(crate) fn try_install(
    root: &Path,
    serial: u64,
    event: &str,
) -> Result<(String, PathBuf, PathBuf), String> {
    install_with_variants(root, serial, event, false, &[])
}

pub(crate) fn install_two_variants(
    root: &Path,
    serial: u64,
    event: &str,
) -> (String, PathBuf, PathBuf) {
    install_with_variants(root, serial, event, true, &[]).unwrap()
}

/// One verified package with two `kill` pairs and single-pair event mappings.
/// This is intentionally one archive so tests exercise the active-cache and
/// pair registry exactly as a runtime GSI event does.
pub(crate) fn install_rotation_fixture(root: &Path, serial: u64) -> String {
    install_with_variants(
        root,
        serial,
        "kill",
        true,
        &["death", "gank", "danger", "revision"],
    )
    .unwrap()
    .0
}

fn install_with_variants(
    root: &Path,
    serial: u64,
    event: &str,
    second: bool,
    single_pair_events: &[&str],
) -> Result<(String, PathBuf, PathBuf), String> {
    let id = format!("ann_00000000-0000-0000-0000-{serial:012x}");
    let original = format!("snd_00000000-0000-0000-0000-{:012x}", serial * 3);
    let mixed = format!("snd_00000000-0000-0000-0000-{:012x}", serial * 3 + 1);
    let banner = format!("bnr_00000000-0000-0000-0000-{serial:012x}");
    let source = root.join(format!("source-{serial}"));
    fs::create_dir_all(source.join("audio")).unwrap();
    fs::create_dir_all(source.join("video")).unwrap();
    let samples: Vec<i16> = (0..480)
        .map(|n| if n % 2 == 0 { 100 } else { -100 })
        .collect();
    let mut wav = Vec::new();
    wav.extend_from_slice(b"RIFF");
    wav.extend_from_slice(&(36u32 + samples.len() as u32 * 2).to_le_bytes());
    wav.extend_from_slice(b"WAVEfmt ");
    wav.extend_from_slice(&16u32.to_le_bytes());
    wav.extend_from_slice(&1u16.to_le_bytes());
    wav.extend_from_slice(&1u16.to_le_bytes());
    wav.extend_from_slice(&48000u32.to_le_bytes());
    wav.extend_from_slice(&96000u32.to_le_bytes());
    wav.extend_from_slice(&2u16.to_le_bytes());
    wav.extend_from_slice(&16u16.to_le_bytes());
    wav.extend_from_slice(b"data");
    wav.extend_from_slice(&(samples.len() as u32 * 2).to_le_bytes());
    for sample in samples {
        wav.extend_from_slice(&sample.to_le_bytes());
    }
    let video = include_bytes!("../../gann-package/tests/fixtures/silent.webm");
    let mut mixed_wav = wav.clone();
    for chunk in mixed_wav[44..].chunks_exact_mut(2) {
        let n = i16::from_le_bytes([chunk[0], chunk[1]]) * 2;
        chunk.copy_from_slice(&n.to_le_bytes());
    }
    fs::write(source.join(format!("audio/{original}.wav")), &wav).unwrap();
    fs::write(source.join(format!("audio/{mixed}.wav")), &mixed_wav).unwrap();
    fs::write(source.join(format!("video/{banner}.webm")), video).unwrap();
    let mut registry = serde_json::json!({"schema_version":1,"announcer_id":id,"revision":1,"name":"GANN test","locale":"th",
        "sounds":[{"sound_id":original,"role":"original_voice","label":"original","path":format!("audio/{original}.wav"),"sha256":g_ann_package::sha256(&wav)},
          {"sound_id":mixed,"role":"mixed_voice_sfx","label":"played","path":format!("audio/{mixed}.wav"),"sha256":g_ann_package::sha256(&mixed_wav)}],
        "events":{(event):[{"sound_id":original,"banner_id":banner}]},
        "banners":[{"banner_id":banner,"event_key":event,"original_sound_id":original,"playback_sound_id":mixed,
          "visual_source":{"root":".","silent":true,"video":format!("video/{banner}.webm"),"sha256":g_ann_package::sha256(video)},
          "components":[],"cues":[],"config":{"duration_seconds":0.01}}],"components":[],"unmapped_sound_ids":[]});
    if second {
        let original2 = format!("snd_10000000-0000-0000-0000-{:012x}", serial * 3);
        let mixed2 = format!("snd_10000000-0000-0000-0000-{:012x}", serial * 3 + 1);
        let banner2 = format!("bnr_10000000-0000-0000-0000-{serial:012x}");
        let mut wav2 = wav.clone();
        let mut mixed_wav2 = mixed_wav.clone();
        wav2[44..46].copy_from_slice(&150i16.to_le_bytes());
        mixed_wav2[44..46].copy_from_slice(&300i16.to_le_bytes());
        fs::write(source.join(format!("audio/{original2}.wav")), &wav2).unwrap();
        fs::write(source.join(format!("audio/{mixed2}.wav")), &mixed_wav2).unwrap();
        fs::write(source.join(format!("video/{banner2}.webm")), video).unwrap();
        registry["sounds"].as_array_mut().unwrap().extend([
            serde_json::json!({"sound_id":original2,"role":"original_voice","label":"second original","path":format!("audio/{original2}.wav"),"sha256":g_ann_package::sha256(&wav2)}),
            serde_json::json!({"sound_id":mixed2,"role":"mixed_voice_sfx","label":"second played","path":format!("audio/{mixed2}.wav"),"sha256":g_ann_package::sha256(&mixed_wav2)})
        ]);
        registry["events"][event]
            .as_array_mut()
            .unwrap()
            .push(serde_json::json!({"sound_id":original2,"banner_id":banner2}));
        registry["banners"].as_array_mut().unwrap().push(serde_json::json!({"banner_id":banner2,"event_key":event,"original_sound_id":original2,"playback_sound_id":mixed2,
          "visual_source":{"root":".","silent":true,"video":format!("video/{banner2}.webm"),"sha256":g_ann_package::sha256(video)},
          "components":[],"cues":[],"config":{"duration_seconds":0.01}}));
    }
    for (index, extra_event) in single_pair_events.iter().enumerate() {
        let offset = serial * 10 + index as u64;
        let original = format!("snd_20000000-0000-0000-0000-{:012x}", offset * 3);
        let mixed = format!("snd_20000000-0000-0000-0000-{:012x}", offset * 3 + 1);
        let banner = format!("bnr_20000000-0000-0000-0000-{offset:012x}");
        let mut wav_extra = wav.clone();
        let mut mixed_wav_extra = mixed_wav.clone();
        let amplitude = 200_i16 + index as i16 * 50;
        wav_extra[44..46].copy_from_slice(&amplitude.to_le_bytes());
        mixed_wav_extra[44..46].copy_from_slice(&(amplitude * 2).to_le_bytes());
        fs::write(source.join(format!("audio/{original}.wav")), &wav_extra).unwrap();
        fs::write(source.join(format!("audio/{mixed}.wav")), &mixed_wav_extra).unwrap();
        fs::write(source.join(format!("video/{banner}.webm")), video).unwrap();
        registry["sounds"].as_array_mut().unwrap().extend([
            serde_json::json!({"sound_id":original,"role":"original_voice","label":"extra original","path":format!("audio/{original}.wav"),"sha256":g_ann_package::sha256(&wav_extra)}),
            serde_json::json!({"sound_id":mixed,"role":"mixed_voice_sfx","label":"extra played","path":format!("audio/{mixed}.wav"),"sha256":g_ann_package::sha256(&mixed_wav_extra)}),
        ]);
        registry["events"][*extra_event] =
            serde_json::json!([{"sound_id":original,"banner_id":banner}]);
        registry["banners"].as_array_mut().unwrap().push(serde_json::json!({"banner_id":banner,"event_key":extra_event,"original_sound_id":original,"playback_sound_id":mixed,
          "visual_source":{"root":".","silent":true,"video":format!("video/{banner}.webm"),"sha256":g_ann_package::sha256(video)},
          "components":[],"cues":[],"config":{"duration_seconds":0.01}}));
    }
    let manifest = format!("{id}.json");
    fs::write(
        source.join(&manifest),
        serde_json::to_vec(&registry).unwrap(),
    )
    .unwrap();
    let archive = root.join(format!("{id}.gann"));
    g_ann_package::create(&source, &manifest, &archive).unwrap();
    static INSTALL: std::sync::Mutex<()> = std::sync::Mutex::new(());
    let _order = INSTALL.lock().unwrap();
    super::import_file(&archive)?;
    let dir = root.join("packs").join(&id);
    Ok((
        id,
        dir.join(format!("audio/{original}.wav")),
        dir.join(format!("audio/{mixed}.wav")),
    ))
}

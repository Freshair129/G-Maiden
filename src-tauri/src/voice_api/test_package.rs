use std::{
    fs,
    path::{Path, PathBuf},
};

pub(crate) fn install(root: &Path, serial: u64, event: &str) -> (String, PathBuf, PathBuf) {
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
    let registry = serde_json::json!({"schema_version":1,"announcer_id":id,"revision":1,"name":"GANN test","locale":"th",
        "sounds":[{"sound_id":original,"role":"original_voice","label":"original","path":format!("audio/{original}.wav"),"sha256":g_ann_package::sha256(&wav)},
          {"sound_id":mixed,"role":"mixed_voice_sfx","label":"played","path":format!("audio/{mixed}.wav"),"sha256":g_ann_package::sha256(&mixed_wav)}],
        "events":{(event):[{"sound_id":original,"banner_id":banner}]},
        "banners":[{"banner_id":banner,"event_key":event,"original_sound_id":original,"playback_sound_id":mixed,
          "visual_source":{"root":".","silent":true,"video":format!("video/{banner}.webm"),"sha256":g_ann_package::sha256(video)},
          "components":[],"cues":[],"config":{"duration_seconds":0.01}}],"components":[],"unmapped_sound_ids":[]});
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
    super::import_file(&archive).unwrap();
    let dir = root.join("packs").join(&id);
    (
        id,
        dir.join(format!("audio/{original}.wav")),
        dir.join(format!("audio/{mixed}.wav")),
    )
}

//! ID-only video endpoint. Never accepts a path from the webview.
static READS: super::video_reads::ReadSlots = super::video_reads::ReadSlots::new();

pub(crate) fn response(request: tauri::http::Request<Vec<u8>>) -> tauri::http::Response<Vec<u8>> {
    let read = || -> Option<Vec<u8>> {
        if request.method() != tauri::http::Method::GET {
            return None;
        }
        let parts: Vec<_> = request
            .uri()
            .path()
            .trim_start_matches('/')
            .split('/')
            .collect();
        if parts.len() != 3
            || !super::id_manifest::valid_id(parts[0], "ann_")
            || !super::id_manifest::valid_id(parts[1], "bnr_")
        {
            return None;
        }
        let revision = parts[2].parse::<u64>().ok()?;
        let pair = super::pack_io::id_video(parts[0], parts[1], revision)?;
        let root = super::pack_io::cached_pack_root(parts[0])?;
        let safe = super::path_safety::safe_pack_path(&root, &format!("video/{}.webm", parts[1]))?;
        if safe != pair.video {
            return None;
        }
        let _slot = READS.acquire_timeout(std::time::Duration::from_millis(500))?;
        super::pack_io::id_video(parts[0], parts[1], revision)?;
        let bytes = super::video_cache::verified(revision, &pair.video, &pair.video_hash)?;
        super::pack_io::id_video(parts[0], parts[1], revision)?;
        Some(bytes.as_ref().clone())
    };
    let bytes = read();
    tauri::http::Response::builder()
        .status(if bytes.is_some() { 200 } else { 404 })
        .header("Content-Type", "video/webm")
        .header("Cache-Control", "no-store")
        .header("X-Content-Type-Options", "nosniff")
        .body(bytes.unwrap_or_default())
        .expect("fixed response headers")
}

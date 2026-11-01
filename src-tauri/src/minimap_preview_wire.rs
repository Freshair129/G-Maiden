//! Bounded child-process framing; never accepts a caller-selected image source.
use crate::minimap_preview::{self as core, Snapshot, Status};
pub const WORKER_ARG: &str = "--minimap-preview-worker";

pub fn worker_role(args: &[String]) -> Option<bool> {
    if !args.iter().any(|arg| arg == WORKER_ARG) {
        return None;
    }
    Some(args.len() == 2 && args[1] == WORKER_ARG)
}

pub fn heartbeat_live(last: u64, now: u64) -> bool {
    last != 0
        && now
            .checked_sub(last)
            .is_some_and(|age| age <= core::LEASE_US)
}

#[derive(Debug)]
pub struct Header {
    pub status: Status,
    pub sequence: u64,
    pub width: u32,
    pub height: u32,
    pub acquired_us: u64,
    pub payload: usize,
    pub stale: bool,
}
pub fn header(bytes: &[u8; core::HEADER_LEN], source: Snapshot, now: u64) -> Option<Header> {
    let u32_at = |at| u32::from_le_bytes(bytes[at..at + 4].try_into().unwrap());
    let u64_at = |at| u64::from_le_bytes(bytes[at..at + 8].try_into().unwrap());
    let i32_at = |at| i32::from_le_bytes(bytes[at..at + 4].try_into().unwrap());
    let g = source.geometry;
    if !g.valid()
        || source.lease == 0
        || source.epoch == 0
        || source.generation == 0
        || now == 0
        || &bytes[..4] != b"GMMP"
        || u32_at(4) != 2
        || u32_at(120) != core::HEADER_LEN as u32
        || u32_at(124) != 0
        || u64_at(24) != source.lease
        || u64_at(32) != source.epoch
        || u64_at(104) != source.generation
        || u32_at(64) != g.x
        || u32_at(68) != g.y
        || u32_at(72) != g.side
        || u32_at(92) != g.screen_w
        || u32_at(96) != g.screen_h
        || u32_at(100) != g.display
        || u64_at(128) != g.display_id
        || i32_at(136) != g.origin_x
        || i32_at(140) != g.origin_y
        || core::MAP_CROP
            .iter()
            .enumerate()
            .any(|(i, f)| u32_at(76 + i * 4) != f.to_bits())
        || u64_at(56) > now
    {
        return None;
    }
    let status = match u32_at(8) {
        0 => Status::Waiting,
        1 => Status::Frame,
        4 => Status::Unavailable,
        _ => return None,
    };
    let (width, height, payload) = (u32_at(12), u32_at(16), u32_at(116) as usize);
    let acquired_us = u64_at(48);
    let sequence = u64_at(40);
    if status == Status::Frame {
        if width == 0
            || height == 0
            || width > core::MAX_SIDE
            || height > core::MAX_SIDE
            || u32_at(20) != width * 4
            || payload != width as usize * height as usize * 4
            || u32_at(112) != 1
            || sequence == 0
            || acquired_us == 0
            || u64_at(56) < acquired_us
            || now.checked_sub(acquired_us).is_none()
        {
            return None;
        }
    } else if width != 0
        || height != 0
        || u32_at(20) != 0
        || payload != 0
        || acquired_us != 0
        || u32_at(112) != 0
    {
        return None;
    }
    Some(Header {
        status,
        sequence,
        width,
        height,
        acquired_us,
        payload,
        stale: status == Status::Frame && now.saturating_sub(acquired_us) > core::STALE_US,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::minimap_preview::{Geometry, Pixels};
    fn source() -> Snapshot {
        Snapshot {
            lease: 9,
            epoch: 8,
            generation: 7,
            geometry: Geometry {
                x: 0,
                y: 788,
                side: 292,
                screen_w: 1920,
                screen_h: 1080,
                display: 0,
                display_id: 1,
                origin_x: 0,
                origin_y: 0,
            },
        }
    }
    fn packet() -> Vec<u8> {
        core::worker_packet(
            source(),
            42,
            Status::Frame,
            Some(&Pixels {
                width: 2,
                height: 2,
                acquired_us: 100,
                rgba: vec![2; 16],
            }),
            101,
        )
    }
    fn parse(bytes: &[u8], s: Snapshot, now: u64) -> Option<Header> {
        header(bytes[..core::HEADER_LEN].try_into().unwrap(), s, now)
    }
    #[test]
    fn frame_metadata_round_trips_before_bounded_pixel_allocation() {
        let h = parse(&packet(), source(), 102).unwrap();
        assert_eq!(h.payload, 16);
        assert_eq!(h.width, 2);
        assert_eq!(h.height, 2);
        assert_eq!(h.sequence, 42);
        assert_eq!(h.acquired_us, 100);
        assert_eq!(h.status, Status::Frame);
    }
    #[test]
    fn wrong_source_session_geometry_and_display_cannot_cross_pipe() {
        let p = packet();
        assert!(parse(&p, source(), 102).is_some());
        let mut s = source();
        s.epoch += 1;
        assert!(parse(&p, s, 102).is_none());
        s = source();
        s.lease += 1;
        assert!(parse(&p, s, 102).is_none());
        s = source();
        s.generation += 1;
        assert!(parse(&p, s, 102).is_none());
        s = source();
        s.geometry.display += 1;
        assert!(parse(&p, s, 102).is_none());
        s = source();
        s.geometry.x += 1;
        assert!(parse(&p, s, 102).is_none());
    }
    #[test]
    fn same_index_and_dimensions_do_not_admit_different_output_identity() {
        let p = packet();
        let mut s = source();
        s.geometry.display_id += 1;
        assert!(parse(&p, s, 102).is_none());
        s = source();
        s.geometry.origin_x = -1920;
        assert!(parse(&p, s, 102).is_none());
        s = source();
        s.geometry.origin_y = 1080;
        assert!(parse(&p, s, 102).is_none());
    }
    #[test]
    fn malformed_or_oversize_headers_are_rejected_before_allocation() {
        for (offset, value) in [
            (4, 1),
            (8, 7),
            (12, 321),
            (20, 123),
            (112, 0),
            (116, u32::MAX),
            (120, 0),
            (124, 1),
        ] {
            let mut p = packet();
            p[offset..offset + 4].copy_from_slice(&value.to_le_bytes());
            assert!(parse(&p, source(), 102).is_none(), "offset {offset}");
        }
        let mut p = packet();
        p[0] = 0;
        assert!(parse(&p, source(), 102).is_none());
    }
    #[test]
    fn child_clock_cannot_be_future_rollback_or_expired() {
        let p = packet();
        assert!(parse(&p, source(), 102).is_some());
        assert!(parse(&p, source(), 99).is_none());
        let stale = parse(&p, source(), core::STALE_US + 101)
            .expect("valid old frame must be drained without resetting the worker");
        assert!(stale.stale);
        assert_eq!(stale.payload, 16);
        let mut p = p;
        p[56..64].copy_from_slice(&99u64.to_le_bytes());
        assert!(parse(&p, source(), 102).is_none());
    }
    #[test]
    fn unavailable_packet_has_no_pixel_buffer_and_preserves_source() {
        let p = core::worker_packet(source(), 0, Status::Unavailable, None, 101);
        let h = parse(&p, source(), 102).unwrap();
        assert_eq!(h.payload, 0);
        assert_eq!(h.status, Status::Unavailable);
    }
    #[test]
    fn heartbeat_expires_even_if_output_writes_are_blocked() {
        assert!(heartbeat_live(100, 101));
        assert!(heartbeat_live(100, core::LEASE_US + 100));
        assert!(!heartbeat_live(100, core::LEASE_US + 101));
        assert!(!heartbeat_live(100, 99));
        assert!(!heartbeat_live(0, 100));
    }
    #[test]
    fn internal_worker_role_does_not_fall_through_to_app_on_bad_arguments() {
        let args = |a: &[&str]| a.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        assert_eq!(worker_role(&args(&["app"])), None);
        assert_eq!(worker_role(&args(&["app", WORKER_ARG])), Some(true));
        assert_eq!(
            worker_role(&args(&["app", WORKER_ARG, "extra"])),
            Some(false)
        );
        assert_eq!(
            worker_role(&args(&["app", "extra", WORKER_ARG])),
            Some(false)
        );
    }
}

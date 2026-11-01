//! Bounded, clock-independent contracts for the live minimap image stream.
pub const HEADER_LEN: usize = 144;
pub const MAX_SIDE: u32 = 320;
pub const MAX_SOURCE_SIDE: u32 = 1024;
pub const LEASE_US: u64 = 1_000_000;
pub const STALE_US: u64 = 250_000;
pub const PERIOD_US: u64 = 16_667;
pub const MAP_CROP: [f32; 4] = [0.031, 0.064, 0.932, 0.961];

pub(crate) fn packet_health(
    packet_at: &std::sync::atomic::AtomicU64,
    started: u64,
    clock: impl FnOnce() -> u64,
) -> Option<u64> {
    let last = packet_at.load(std::sync::atomic::Ordering::Acquire);
    // A concurrent reader may publish a packet after the clock is sampled.
    let now = clock();
    let age = now.checked_sub(if last == 0 { started } else { last })?;
    (now != 0 && age <= if last == 0 { 2_000_000 } else { 500_000 }).then_some(now)
}

pub fn matches_output(g: Geometry, display_id: u64, origin: (i32, i32), size: (u32, u32)) -> bool {
    g.valid()
        && g.display_id == display_id
        && (g.origin_x, g.origin_y) == origin
        && (g.screen_w, g.screen_h) == size
}

pub fn within_window(g: Geometry, origin: (i32, i32), window: (i32, i32, i32, i32)) -> bool {
    let x = i64::from(origin.0) + i64::from(g.x);
    let y = i64::from(origin.1) + i64::from(g.y);
    g.valid()
        && x >= i64::from(window.0)
        && y >= i64::from(window.1)
        && x + i64::from(g.side) <= i64::from(window.2)
        && y + i64::from(g.side) <= i64::from(window.3)
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Status {
    Waiting = 0,
    Frame = 1,
    Inactive = 2,
    Pressure = 3,
    Unavailable = 4,
    Stale = 5,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Geometry {
    pub x: u32,
    pub y: u32,
    pub side: u32,
    pub screen_w: u32,
    pub screen_h: u32,
    pub display: u32,
    pub display_id: u64,
    pub origin_x: i32,
    pub origin_y: i32,
}
impl Geometry {
    pub fn valid(self) -> bool {
        self.display_id != 0
            && self.side > 0
            && self.side <= MAX_SOURCE_SIDE
            && self
                .x
                .checked_add(self.side)
                .is_some_and(|x| x <= self.screen_w)
            && self
                .y
                .checked_add(self.side)
                .is_some_and(|y| y <= self.screen_h)
    }
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Snapshot {
    pub lease: u64,
    pub epoch: u64,
    pub generation: u64,
    pub geometry: Geometry,
}
pub struct Pixels {
    pub width: u32,
    pub height: u32,
    pub acquired_us: u64,
    pub rgba: Vec<u8>,
}

pub fn worker_packet(
    source: Snapshot,
    sequence: u64,
    status: Status,
    pixels: Option<&Pixels>,
    now: u64,
) -> Vec<u8> {
    Stream {
        counter: source.lease,
        epoch: source.epoch,
        geometry: Some(source.geometry),
        generation: source.generation,
        sequence,
        ..Stream::default()
    }
    .packet(status, pixels, now)
}
#[derive(Default)]
pub struct Stream {
    counter: u64,
    lease: Option<(u64, u64)>,
    epoch: u64,
    geometry: Option<Geometry>,
    generation: u64,
    sequence: u64,
    frame: Option<Pixels>,
    status: Option<Status>,
}
impl Stream {
    pub fn start(&mut self, now: u64) -> u64 {
        self.counter = self.counter.wrapping_add(1).max(1);
        self.lease = Some((self.counter, now));
        self.frame = None;
        self.status = Some(Status::Waiting);
        self.counter
    }
    pub fn stop(&mut self, lease: u64) -> bool {
        if self.lease.is_none_or(|(id, _)| id != lease) {
            return false;
        }
        self.lease = None;
        self.frame = None;
        self.status = Some(Status::Inactive);
        true
    }
    pub fn source(&mut self, epoch: u64, geometry: Option<Geometry>, generation: u64) {
        let geometry = geometry.filter(|g| g.valid());
        if self.epoch != epoch || self.geometry != geometry || self.generation != generation {
            self.epoch = epoch;
            self.geometry = geometry;
            self.generation = generation;
            self.frame = None;
            self.status = Some(Status::Waiting);
        }
    }
    fn alive(&mut self, now: u64) -> bool {
        if self
            .lease
            .is_some_and(|(_, at)| now.checked_sub(at).is_some_and(|age| age <= LEASE_US))
        {
            return true;
        }
        self.lease = None;
        self.frame = None;
        self.status = Some(Status::Inactive);
        false
    }
    pub fn snapshot(&mut self, now: u64) -> Option<Snapshot> {
        if !self.alive(now) || self.epoch == 0 {
            return None;
        }
        Some(Snapshot {
            lease: self.lease?.0,
            epoch: self.epoch,
            generation: self.generation,
            geometry: self.geometry?,
        })
    }
    pub fn publish(&mut self, source: Snapshot, pixels: Pixels, now: u64) -> bool {
        if self.snapshot(now) != Some(source)
            || pixels.width == 0
            || pixels.height == 0
            || pixels.width > MAX_SIDE
            || pixels.height > MAX_SIDE
            || pixels.rgba.len() != pixels.width as usize * pixels.height as usize * 4
            || now
                .checked_sub(pixels.acquired_us)
                .is_none_or(|age| age > STALE_US)
        {
            return false;
        }
        self.sequence = self.sequence.saturating_add(1);
        self.frame = Some(pixels);
        self.status = Some(Status::Frame);
        true
    }
    pub fn set_status(&mut self, status: Status) {
        if status == Status::Frame {
            return;
        }
        if status != Status::Waiting {
            self.frame = None;
        }
        self.status = Some(status);
    }
    pub fn response(&mut self, lease: u64, after: u64, now: u64) -> Vec<u8> {
        if self.lease.is_none_or(|(id, _)| id != lease) {
            return self.packet(Status::Inactive, None, now);
        }
        if !self.alive(now) {
            return self.packet(Status::Inactive, None, now);
        }
        self.lease = Some((lease, now));
        if self.epoch == 0 {
            return self.packet(Status::Inactive, None, now);
        }
        if self.geometry.is_none() {
            return self.packet(Status::Unavailable, None, now);
        }
        if self.frame.as_ref().is_some_and(|f| {
            now.checked_sub(f.acquired_us)
                .is_none_or(|age| age > STALE_US)
        }) {
            self.frame = None;
            self.status = Some(Status::Stale);
        }
        if let Some(frame) = &self.frame {
            if after < self.sequence {
                return self.packet(Status::Frame, Some(frame), now);
            }
            return self.packet(Status::Waiting, None, now);
        }
        self.packet(self.status.unwrap_or(Status::Waiting), None, now)
    }
    fn packet(&self, status: Status, pixels: Option<&Pixels>, now: u64) -> Vec<u8> {
        fn put<const N: usize>(b: &mut [u8], o: usize, v: [u8; N]) {
            b[o..o + N].copy_from_slice(&v);
        }
        let payload = pixels.map_or(&[][..], |p| p.rgba.as_slice());
        let mut b = vec![0; HEADER_LEN + payload.len()];
        b[..4].copy_from_slice(b"GMMP");
        put(&mut b, 4, 2u32.to_le_bytes());
        put(&mut b, 8, (status as u32).to_le_bytes());
        if let Some(p) = pixels {
            put(&mut b, 12, p.width.to_le_bytes());
            put(&mut b, 16, p.height.to_le_bytes());
            put(&mut b, 20, (p.width * 4).to_le_bytes());
            put(&mut b, 48, p.acquired_us.to_le_bytes());
        }
        put(&mut b, 24, self.counter.to_le_bytes());
        put(&mut b, 32, self.epoch.to_le_bytes());
        put(&mut b, 40, self.sequence.to_le_bytes());
        put(&mut b, 56, now.to_le_bytes());
        if let Some(g) = self.geometry {
            put(&mut b, 128, g.display_id.to_le_bytes());
            put(&mut b, 136, g.origin_x.to_le_bytes());
            put(&mut b, 140, g.origin_y.to_le_bytes());
            for (o, v) in [
                (64, g.x),
                (68, g.y),
                (72, g.side),
                (92, g.screen_w),
                (96, g.screen_h),
                (100, g.display),
            ] {
                put(&mut b, o, v.to_le_bytes());
            }
        }
        for (i, v) in MAP_CROP.iter().enumerate() {
            put(&mut b, 76 + i * 4, v.to_le_bytes());
        }
        put(&mut b, 104, self.generation.to_le_bytes());
        put(&mut b, 112, u32::from(pixels.is_some()).to_le_bytes());
        put(&mut b, 116, (payload.len() as u32).to_le_bytes());
        put(&mut b, 120, (HEADER_LEN as u32).to_le_bytes());
        b[HEADER_LEN..].copy_from_slice(payload);
        b
    }
}
#[derive(Default)]
pub struct Pacer {
    next: u64,
}
impl Pacer {
    pub fn due(&self, now: u64) -> bool {
        now >= self.next
    }
    pub fn advance(&mut self, now: u64) {
        self.next = self
            .next
            .saturating_add(PERIOD_US)
            .max(now.saturating_add(1));
        if self.next <= now.saturating_add(1) {
            self.next = now.saturating_add(PERIOD_US);
        }
    }
    pub fn wait_us(&self, now: u64) -> u64 {
        self.next.saturating_sub(now)
    }
}
fn crop_native_rgba(bgra: &[u8], width: usize, x: usize, y: usize, w: usize, h: usize) -> Vec<u8> {
    let mut rgba = vec![0; w * h * 4];
    for row in 0..h {
        let from = ((y + row) * width + x) * 4;
        let input = &bgra[from..from + w * 4];
        let output = &mut rgba[row * w * 4..(row + 1) * w * 4];
        for (source, dest) in input.chunks_exact(4).zip(output.chunks_exact_mut(4)) {
            dest.copy_from_slice(&[source[2], source[1], source[0], 255]);
        }
    }
    rgba
}
pub fn crop_rgba(bgra: &[u8], width: u32, height: u32, acquired_us: u64) -> Option<Pixels> {
    if width == 0
        || height == 0
        || width > MAX_SOURCE_SIDE
        || height > MAX_SOURCE_SIDE
        || bgra.len() != width as usize * height as usize * 4
    {
        return None;
    }
    let x = (width as f32 * MAP_CROP[0]) as u32;
    let y = (height as f32 * MAP_CROP[1]) as u32;
    let w = ((width as f32 * (MAP_CROP[2] - MAP_CROP[0])) as u32).max(1);
    let h = ((height as f32 * (MAP_CROP[3] - MAP_CROP[1])) as u32).max(1);
    if x + w > width || y + h > height {
        return None;
    }
    let tw = w.min(MAX_SIDE);
    let th = ((u64::from(tw) * u64::from(h)) / u64::from(w)).max(1) as u32;
    if th > MAX_SIDE {
        return None;
    }
    if tw == w && th == h {
        return Some(Pixels {
            width: tw,
            height: th,
            acquired_us,
            rgba: crop_native_rgba(
                bgra,
                width as usize,
                x as usize,
                y as usize,
                w as usize,
                h as usize,
            ),
        });
    }
    let mut rgba = vec![0; tw as usize * th as usize * 4];
    for dy in 0..th {
        let sy = y + (u64::from(dy) * u64::from(h) / u64::from(th)) as u32;
        for dx in 0..tw {
            let sx = x + (u64::from(dx) * u64::from(w) / u64::from(tw)) as u32;
            let from = ((sy * width + sx) * 4) as usize;
            let to = ((dy * tw + dx) * 4) as usize;
            rgba[to..to + 4].copy_from_slice(&[bgra[from + 2], bgra[from + 1], bgra[from], 255]);
        }
    }
    Some(Pixels {
        width: tw,
        height: th,
        acquired_us,
        rgba,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn packet_arriving_during_clock_sample_does_not_kill_healthy_worker() {
        use std::sync::atomic::{AtomicU64, Ordering};
        let packet_at = AtomicU64::new(100);
        assert_eq!(
            packet_health(&packet_at, 1, || {
                packet_at.store(102, Ordering::Release);
                101
            }),
            Some(101)
        );
    }

    #[test]
    fn worker_health_keeps_startup_timeout_freshness_and_clock_failure_checks() {
        use std::sync::atomic::AtomicU64;
        assert_eq!(
            packet_health(&AtomicU64::new(0), 100, || 2_000_100),
            Some(2_000_100)
        );
        assert_eq!(packet_health(&AtomicU64::new(0), 100, || 2_000_101), None);
        assert_eq!(
            packet_health(&AtomicU64::new(100), 1, || 500_100),
            Some(500_100)
        );
        assert_eq!(packet_health(&AtomicU64::new(100), 1, || 500_101), None);
        assert_eq!(packet_health(&AtomicU64::new(100), 1, || 99), None);
        assert_eq!(packet_health(&AtomicU64::new(100), 1, || 0), None);
    }

    #[test]
    fn native_crop_fast_path_preserves_every_pixel_and_alpha() {
        for (w, h, x, y, cw, ch) in [
            (292, 292, 9, 18, 263, 261),
            (12, 9, 2, 1, 7, 6),
            (1, 1, 0, 0, 1, 1),
        ] {
            let data: Vec<u8> = (0..w * h * 4).map(|i| (i * 17 % 251) as u8).collect();
            let mut expected = Vec::new();
            for dy in 0..ch {
                for dx in 0..cw {
                    let i = ((y + dy) * w + x + dx) * 4;
                    expected.extend_from_slice(&[data[i + 2], data[i + 1], data[i], 255]);
                }
            }
            assert_eq!(crop_native_rgba(&data, w, x, y, cw, ch), expected);
        }
    }
    #[test]
    fn preview_roi_stays_inside_the_visible_game_window_in_virtual_desktop_coordinates() {
        let g = geometry();
        assert!(within_window(g, (1920, 0), (1920, 0, 3840, 1080)));
        assert!(within_window(g, (-1920, 0), (-1920, 0, 0, 1080)));
        assert!(!within_window(g, (1920, 0), (0, 0, 1920, 1080)));
        assert!(!within_window(g, (0, 0), (0, -32000, 1920, -30920)));
        assert!(!within_window(g, (0, 0), (0, 0, 100, 100)));
    }
    #[test]
    fn same_index_size_and_roi_do_not_match_another_physical_output() {
        let g = geometry();
        assert!(matches_output(g, 1, (0, 0), (1920, 1080)));
        assert!(!matches_output(g, 2, (0, 0), (1920, 1080)));
        assert!(!matches_output(g, 1, (-1920, 0), (1920, 1080)));
        assert!(!matches_output(g, 1, (0, 1080), (1920, 1080)));
        assert!(!matches_output(g, 1, (0, 0), (2560, 1440)));
    }

    fn geometry() -> Geometry {
        Geometry {
            x: 0,
            y: 788,
            side: 292,
            screen_w: 1920,
            screen_h: 1080,
            display: 0,
            display_id: 1,
            origin_x: 0,
            origin_y: 0,
        }
    }
    fn pixels(at: u64) -> Pixels {
        Pixels {
            width: 2,
            height: 2,
            acquired_us: at,
            rgba: vec![7; 16],
        }
    }
    fn u32_at(b: &[u8], o: usize) -> u32 {
        u32::from_le_bytes(b[o..o + 4].try_into().unwrap())
    }
    fn u64_at(b: &[u8], o: usize) -> u64 {
        u64::from_le_bytes(b[o..o + 8].try_into().unwrap())
    }
    fn active() -> (Stream, u64) {
        let mut s = Stream::default();
        s.source(9, Some(geometry()), 3);
        let id = s.start(0);
        (s, id)
    }

    #[test]
    fn replaced_lease_and_late_stop_cannot_affect_new_stream() {
        let (mut s, old) = active();
        let new = s.start(10);
        assert_ne!(old, new);
        assert!(!s.stop(old));
        assert_eq!(s.snapshot(20).unwrap().lease, new);
        assert!(s.stop(new));
        assert!(s.snapshot(30).is_none());
    }

    #[test]
    fn wire_ids_preserve_values_above_javascript_number_precision() {
        let (mut s, _) = active();
        s.counter = (1_u64 << 53) + 17;
        s.sequence = (1_u64 << 53) + 41;
        let id = s.start(10);
        let source = s.snapshot(11).unwrap();
        assert!(s.publish(source, pixels(11), 12));
        let packet = s.response(id, 0, 13);
        assert_eq!(u64_at(&packet, 24), (1_u64 << 53) + 18);
        assert_eq!(u64_at(&packet, 40), (1_u64 << 53) + 42);
    }
    #[test]
    fn lease_expires_without_ui_heartbeat_and_read_does_not_resurrect_it() {
        let (mut s, id) = active();
        assert!(s.snapshot(LEASE_US + 1).is_none());
        assert_eq!(
            u32_at(&s.response(id, 0, LEASE_US + 2), 8),
            Status::Inactive as u32
        );
    }
    #[test]
    fn late_epoch_or_geometry_pixels_are_rejected_without_replacing_newer_frame() {
        let (mut s, id) = active();
        let old = s.snapshot(1).unwrap();
        s.source(10, Some(geometry()), 4);
        assert!(!s.publish(old, pixels(2), 3));
        let new = s.snapshot(4).unwrap();
        assert!(s.publish(new, pixels(4), 5));
        assert!(!s.publish(old, pixels(6), 7));
        let b = s.response(id, 0, 8);
        assert_eq!(u64_at(&b, 32), 10);
        assert_eq!(u64_at(&b, 104), 4);
        assert_eq!(b.len(), HEADER_LEN + 16);
    }
    #[test]
    fn newest_frame_only_and_no_duplicate_id_or_old_image_after_pressure() {
        let (mut s, id) = active();
        let source = s.snapshot(1).unwrap();
        for t in 1..100 {
            assert!(s.publish(source, pixels(t), t));
        }
        let b = s.response(id, 0, 100);
        let seq = u64_at(&b, 40);
        assert_eq!(seq, 99);
        assert_eq!(b.len(), HEADER_LEN + 16);
        let wait = s.response(id, seq, 101);
        assert_eq!(u32_at(&wait, 8), Status::Waiting as u32);
        assert_eq!(wait.len(), HEADER_LEN);
        s.set_status(Status::Pressure);
        let b = s.response(id, 0, 102);
        assert_eq!(u32_at(&b, 8), 3);
        assert_eq!(b.len(), HEADER_LEN);
        assert_eq!(u64_at(&b, 24), id);
        assert_eq!(u64_at(&b, 32), 9);
        assert_eq!(u64_at(&b, 104), 3);
    }
    #[test]
    fn binary_header_is_bounded_and_preserves_full_width_ids_and_geometry() {
        let (mut s, id) = active();
        let source = s.snapshot(1).unwrap();
        assert!(s.publish(source, pixels(2), 3));
        let b = s.response(id, 0, 4);
        assert_eq!(&b[..4], b"GMMP");
        assert_eq!(u32_at(&b, 4), 2);
        assert_eq!(u32_at(&b, 12), 2);
        assert_eq!(u32_at(&b, 20), 8);
        assert_eq!(u32_at(&b, 68), 788);
        assert_eq!(u32_at(&b, 72), 292);
        assert_eq!(u32_at(&b, 116), 16);
        assert_eq!(u32_at(&b, 120), HEADER_LEN as u32);
        assert_eq!(u64_at(&b, 48), 2);
        assert_eq!(u64_at(&b, 56), 4);
    }
    #[test]
    fn malformed_oversize_future_or_stale_pixels_never_publish() {
        let (mut s, _) = active();
        let source = s.snapshot(1).unwrap();
        assert!(!s.publish(
            source,
            Pixels {
                width: 321,
                height: 1,
                acquired_us: 1,
                rgba: vec![0; 1284]
            },
            2
        ));
        assert!(!s.publish(
            source,
            Pixels {
                width: 2,
                height: 2,
                acquired_us: 1,
                rgba: vec![0; 15]
            },
            2
        ));
        assert!(!s.publish(source, pixels(5), 2));
        assert!(!s.publish(source, pixels(1), STALE_US + 2));
        assert!(s.publish(source, pixels(4), 5));
        assert_eq!(u32_at(&s.response(source.lease, 0, STALE_US + 5), 8), 5);
    }
    #[test]
    fn geometry_rejects_overflow_and_raw_crop_is_bounded_rgba_not_png() {
        assert!(geometry().valid());
        assert!(!Geometry {
            x: u32::MAX,
            ..geometry()
        }
        .valid());
        assert!(!Geometry {
            side: 0,
            ..geometry()
        }
        .valid());
        assert!(!Geometry {
            side: MAX_SOURCE_SIDE + 1,
            ..geometry()
        }
        .valid());
        let p = crop_rgba(&[3, 2, 1, 0].repeat(400 * 400), 400, 400, 20).unwrap();
        assert_eq!((p.width, p.height), (320, 318));
        assert_eq!(&p.rgba[..4], &[1, 2, 3, 255]);
        assert_eq!(p.acquired_us, 20);
        assert!(crop_rgba(&[0; 3], 1, 1, 0).is_none());
        assert!(crop_rgba(&[], 0, 0, 0).is_none());
    }
    #[test]
    fn sixty_hz_deadlines_do_not_add_a_second_interval_or_catch_up_burst() {
        let mut p = Pacer::default();
        assert!(p.due(0));
        p.advance(0);
        assert!(!p.due(16_666));
        assert!(p.due(16_667));
        p.advance(16_667);
        assert_eq!(p.wait_us(20_000), 13_334);
        p.advance(100_000);
        assert!(!p.due(100_000));
        assert_eq!(p.wait_us(100_000), PERIOD_US);
    }
}

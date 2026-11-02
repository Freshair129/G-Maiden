use std::{
    sync::{
        atomic::{AtomicU64, AtomicUsize, Ordering},
        Mutex,
    },
    time::{Duration, Instant},
};

pub(super) struct PlaybackCadence {
    users: AtomicUsize,
    epoch: AtomicU64,
}
impl PlaybackCadence {
    const fn new() -> Self {
        Self {
            users: AtomicUsize::new(0),
            epoch: AtomicU64::new(0),
        }
    }
    pub fn acquire(&self) -> Playing<'_> {
        self.epoch.fetch_add(1, Ordering::AcqRel);
        self.users.fetch_add(1, Ordering::AcqRel);
        Playing(&self.users)
    }
    pub fn active(&self) -> bool {
        self.users.load(Ordering::Acquire) != 0
    }
    pub fn activity(&self) -> (bool, u64) {
        (self.active(), self.epoch.load(Ordering::Acquire))
    }
    pub fn preview_fps(&self, configured: u8) -> u8 {
        if self.active() {
            configured.min(5)
        } else {
            configured
        }
    }
}
#[must_use]
pub(super) struct Playing<'a>(&'a AtomicUsize);
impl Drop for Playing<'_> {
    fn drop(&mut self) {
        self.0.fetch_sub(1, Ordering::AcqRel);
    }
}
pub(super) static PLAYING: PlaybackCadence = PlaybackCadence::new();
#[derive(Default)]
struct Budget {
    workers: usize,
    pixels: usize,
}
impl Budget {
    fn take(&mut self, critical: bool, pixels: usize, critical_reserved: bool) -> bool {
        if (!critical && critical_reserved)
            || self.workers >= if critical { 4 } else { 3 }
            || self
                .pixels
                .checked_add(pixels)
                .is_none_or(|n| n > 2_097_152)
        {
            return false;
        }
        self.workers += 1;
        self.pixels += pixels;
        true
    }
    fn release(&mut self, pixels: usize) {
        self.workers -= 1;
        self.pixels -= pixels;
    }
}
static POOL: Mutex<Budget> = Mutex::new(Budget {
    workers: 0,
    pixels: 0,
});
pub(crate) struct Lease {
    pixels: usize,
}
impl Drop for Lease {
    fn drop(&mut self) {
        if let Ok(mut pool) = POOL.lock() {
            pool.release(self.pixels);
        }
    }
}
pub(crate) fn acquire(
    critical: bool,
    pixels: usize,
    pending: Option<&(dyn Fn() -> bool + Send + Sync)>,
    reserved: impl Fn() -> bool,
) -> Result<Lease, String> {
    if pixels == 0 || pixels > 2_097_152 {
        return Err("native decoded-frame budget".into());
    }
    let started = Instant::now();
    loop {
        if pending.is_some_and(|valid| !valid()) {
            return Err("native preparation revoked".into());
        }
        if POOL
            .lock()
            .map_err(|_| "native resource lock")?
            .take(critical, pixels, reserved())
        {
            return Ok(Lease { pixels });
        }
        if !critical || started.elapsed() >= Duration::from_millis(180) {
            return Err("native playback capacity".into());
        }
        std::thread::sleep(Duration::from_millis(1));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn playing_owners_cap_preview_and_only_the_last_release_restores_it() {
        for configured in [15, 30, 60] {
            let cadence = PlaybackCadence::new();
            assert_eq!(cadence.preview_fps(configured), configured);
            let first = cadence.acquire();
            let second = cadence.acquire();
            assert_eq!(cadence.preview_fps(configured), 5);
            drop(first);
            assert_eq!(cadence.preview_fps(configured), 5);
            drop(second);
            assert_eq!(cadence.preview_fps(configured), configured);
        }
    }
    #[test]
    fn error_and_unwind_release_playback_cadence() {
        let cadence = PlaybackCadence::new();
        let error = || -> Result<(), ()> {
            let _playing = cadence.acquire();
            assert_eq!(cadence.preview_fps(30), 5);
            Err(())?;
            Ok(())
        };
        assert!(error().is_err());
        assert_eq!(cadence.preview_fps(30), 30);
        assert!(std::panic::catch_unwind(|| {
            let _playing = cadence.acquire();
            panic!("test unwind");
        })
        .is_err());
        assert_eq!(cadence.preview_fps(60), 60);
    }
    #[test]
    fn critical_reservation_blocks_new_normal_allocations_before_they_take_pixels() {
        let mut pool = Budget::default();
        assert!(!pool.take(false, 1920 * 1080, true));
        assert_eq!((pool.workers, pool.pixels), (0, 0));
        assert!(pool.take(true, 640 * 360, true));
        assert!(!pool.take(false, 960 * 420, true));
    }
    #[test]
    fn reclaiming_a_normal_owner_allows_a_critical_claim_without_oversubscribing() {
        let mut pool = Budget::default();
        assert!(pool.take(false, 1920 * 1080, false));
        assert!(!pool.take(true, 640 * 360, true));
        assert_eq!(pool.pixels, 1920 * 1080);
        pool.release(1920 * 1080);
        assert!(pool.take(true, 640 * 360, true));
        assert_eq!((pool.workers, pool.pixels), (1, 640 * 360));
    }
    #[test]
    fn worker_and_pixel_limits_are_one_reservation() {
        let mut pool = Budget::default();
        for _ in 0..3 {
            assert!(pool.take(false, 960 * 420, false));
        }
        assert!(!pool.take(false, 960 * 420, false));
        assert!(pool.take(true, 960 * 420, true));
        assert!(!pool.take(true, 1, true));
        assert_eq!((pool.workers, pool.pixels), (4, 4 * 960 * 420));
    }
}

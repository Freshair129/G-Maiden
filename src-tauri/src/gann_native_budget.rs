use std::{
    sync::Mutex,
    time::{Duration, Instant},
};
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

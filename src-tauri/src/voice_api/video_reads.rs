use std::sync::atomic::{AtomicUsize, Ordering};

pub(crate) struct ReadSlots(AtomicUsize);
pub(crate) struct ReadSlot<'a>(&'a ReadSlots);
impl ReadSlots {
    pub(crate) const fn new() -> Self {
        Self(AtomicUsize::new(0))
    }
    pub(crate) fn acquire(&self) -> Option<ReadSlot<'_>> {
        self.0
            .fetch_update(Ordering::AcqRel, Ordering::Acquire, |n| {
                (n < 3).then_some(n + 1)
            })
            .ok()
            .map(|_| ReadSlot(self))
    }
    pub(crate) fn acquire_timeout(&self, timeout: std::time::Duration) -> Option<ReadSlot<'_>> {
        let deadline = std::time::Instant::now() + timeout;
        loop {
            if let Some(slot) = self.acquire() {
                return Some(slot);
            }
            if std::time::Instant::now() >= deadline {
                return None;
            }
            // A cancelled WebView request can leave a short verified read in flight.
            std::thread::sleep(std::time::Duration::from_millis(2));
        }
    }
}
impl Drop for ReadSlot<'_> {
    fn drop(&mut self) {
        self.0 .0.fetch_sub(1, Ordering::AcqRel);
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn three_decoder_requests_can_read_together_but_fourth_is_bounded() {
        let slots = ReadSlots::new();
        let a = slots.acquire().expect("active");
        let b = slots.acquire().expect("outgoing");
        let c = slots.acquire().expect("warm");
        assert!(slots.acquire().is_none());
        drop(b);
        let d = slots.acquire().expect("released slot");
        drop((a, c, d));
        assert_eq!(slots.0.load(Ordering::Acquire), 0);
    }
    #[test]
    fn next_generation_waits_for_a_cancelled_request_without_a_transient_404() {
        let slots = ReadSlots::new();
        let a = slots.acquire().unwrap();
        let b = slots.acquire().unwrap();
        let c = slots.acquire().unwrap();
        std::thread::scope(|scope| {
            let next = scope.spawn(|| {
                slots
                    .acquire_timeout(std::time::Duration::from_millis(500))
                    .is_some()
            });
            std::thread::sleep(std::time::Duration::from_millis(10));
            drop(a);
            assert!(next.join().unwrap());
        });
        assert!(slots.acquire_timeout(std::time::Duration::ZERO).is_some());
        drop((b, c));
    }
}

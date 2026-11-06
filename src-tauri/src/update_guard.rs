use std::sync::atomic::{AtomicBool, Ordering};

#[derive(Clone, Copy)]
pub struct UpdateSafety {
    pub dota_running: Option<bool>,
    pub session_active: bool,
    pub in_game: bool,
}

pub fn ensure_idle(state: UpdateSafety) -> Result<(), String> {
    if state.dota_running != Some(false) || state.session_active || state.in_game {
        return Err("ปิด Dota 2 และรอให้แมตช์สิ้นสุดก่อนติดตั้งอัปเดต แล้วลองอีกครั้ง".into());
    }
    Ok(())
}

pub struct InstallLease<'a>(&'a AtomicBool);
impl<'a> InstallLease<'a> {
    pub fn acquire(busy: &'a AtomicBool) -> Result<Self, String> {
        busy.compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .map(|_| Self(busy))
            .map_err(|_| "กำลังติดตั้งอัปเดตอยู่แล้ว".into())
    }
}
impl Drop for InstallLease<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}

pub fn commit_if_idle<T>(
    probe: impl FnOnce() -> UpdateSafety,
    commit: impl FnOnce() -> T,
) -> Result<T, String> {
    ensure_idle(probe())?;
    Ok(commit())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn idle() -> UpdateSafety {
        UpdateSafety {
            dota_running: Some(false),
            session_active: false,
            in_game: false,
        }
    }
    #[test]
    fn match_start_after_download_blocks_install() {
        ensure_idle(idle()).unwrap();
        let committed = std::cell::Cell::new(false);
        let result = commit_if_idle(
            || UpdateSafety {
                dota_running: Some(true),
                ..idle()
            },
            || committed.set(true),
        );
        assert!(result.is_err());
        assert!(!committed.get());
    }
    #[test]
    fn active_and_unknown_are_blocked_but_closed_idle_can_commit() {
        assert!(ensure_idle(UpdateSafety {
            session_active: true,
            ..idle()
        })
        .is_err());
        assert!(ensure_idle(UpdateSafety {
            dota_running: None,
            ..idle()
        })
        .is_err());
        assert!(ensure_idle(UpdateSafety {
            in_game: true,
            ..idle()
        })
        .is_err());
        assert_eq!(commit_if_idle(idle, || 42).unwrap(), 42);
    }
    #[test]
    fn concurrent_install_is_rejected_and_error_releases_lease() {
        let busy = AtomicBool::new(false);
        let first = InstallLease::acquire(&busy).unwrap();
        assert!(InstallLease::acquire(&busy).is_err());
        drop(first);
        assert!(InstallLease::acquire(&busy).is_ok());
    }
}

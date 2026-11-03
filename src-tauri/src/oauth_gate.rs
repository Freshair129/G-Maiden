use std::sync::Mutex;

// OAuth callback anti-CSRF gate. The loopback callback endpoint accepts only a
// state value that matches the active sign-in request and has not expired.
struct OAuthPending {
    state: String,
    since_ms: u64,
}

static OAUTH_PENDING: Mutex<Option<OAuthPending>> = Mutex::new(None);
const OAUTH_PENDING_TIMEOUT_MS: u64 = 600_000;
const OAUTH_STATE_MIN_LEN: usize = 16;
const OAUTH_STATE_MAX_LEN: usize = 4096;

#[derive(Debug, PartialEq, Eq)]
pub enum OAuthPendingResolution {
    Accepted { state: String },
    Expired { state: String },
    Rejected,
}

pub fn set_oauth_pending(state: String, now_ms: u64) -> bool {
    if !(OAUTH_STATE_MIN_LEN..=OAUTH_STATE_MAX_LEN).contains(&state.len()) {
        return false;
    }
    if let Ok(mut pending) = OAUTH_PENDING.lock() {
        *pending = Some(OAuthPending {
            state,
            since_ms: now_ms,
        });
        true
    } else {
        false
    }
}

fn oauth_pending_ok(
    pending: bool,
    expected_state: &str,
    callback_state: Option<&str>,
    since_ms: u64,
    now_ms: u64,
    timeout_ms: u64,
) -> bool {
    pending
        && callback_state.is_some_and(|state| state == expected_state)
        && now_ms.saturating_sub(since_ms) <= timeout_ms
}

/// Consume a matching gate once and return its state so the event to the
/// WebView can be correlated to the same OAuth attempt. A mismatch leaves the
/// active gate intact; a stale callback cannot consume a newer retry.
pub fn resolve_oauth_pending(callback_state: Option<&str>, now_ms: u64) -> OAuthPendingResolution {
    let Ok(mut gate) = OAUTH_PENDING.lock() else {
        return OAuthPendingResolution::Rejected;
    };
    let Some(active) = gate.as_ref() else {
        return OAuthPendingResolution::Rejected;
    };
    let Some(callback_state) = callback_state else {
        return OAuthPendingResolution::Rejected;
    };
    if callback_state != active.state {
        return OAuthPendingResolution::Rejected;
    }

    let Some(pending) = gate.take() else {
        return OAuthPendingResolution::Rejected;
    };
    let expired = !oauth_pending_ok(
        true,
        &pending.state,
        Some(callback_state),
        pending.since_ms,
        now_ms,
        OAUTH_PENDING_TIMEOUT_MS,
    );
    if expired {
        OAuthPendingResolution::Expired {
            state: pending.state,
        }
    } else {
        OAuthPendingResolution::Accepted {
            state: pending.state,
        }
    }
}

/// Compatibility predicate for existing callers that only need acceptance.
pub fn take_oauth_pending(callback_state: Option<&str>, now_ms: u64) -> bool {
    matches!(
        resolve_oauth_pending(callback_state, now_ms),
        OAuthPendingResolution::Accepted { .. }
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    static TEST_LOCK: Mutex<()> = Mutex::new(());

    #[test]
    fn take_oauth_pending_is_single_use() {
        let _guard = TEST_LOCK.lock().unwrap();
        assert!(set_oauth_pending(
            "test-state-0123456789".to_string(),
            10_000
        ));
        assert!(take_oauth_pending(Some("test-state-0123456789"), 10_500));
        assert!(!take_oauth_pending(Some("test-state-0123456789"), 10_600));
    }

    #[test]
    fn mismatched_oauth_state_does_not_consume_current_pending_gate() {
        let _guard = TEST_LOCK.lock().unwrap();
        assert!(set_oauth_pending(
            "current-state-0123456789".to_string(),
            20_000
        ));
        assert!(!take_oauth_pending(Some("stale-state-0123456789"), 20_100));
        assert!(take_oauth_pending(Some("current-state-0123456789"), 20_200));
    }

    #[test]
    fn resolution_returns_the_matching_attempt_state() {
        let _guard = TEST_LOCK.lock().unwrap();
        assert!(set_oauth_pending(
            "accepted-state-0123456789".to_string(),
            30_000
        ));
        assert_eq!(
            resolve_oauth_pending(Some("accepted-state-0123456789"), 30_100),
            OAuthPendingResolution::Accepted {
                state: "accepted-state-0123456789".to_string()
            }
        );
    }

    #[test]
    fn expired_matching_state_is_consumed_and_reported() {
        let _guard = TEST_LOCK.lock().unwrap();
        assert!(set_oauth_pending(
            "expired-state-0123456789".to_string(),
            40_000
        ));
        assert_eq!(
            resolve_oauth_pending(Some("expired-state-0123456789"), 640_001),
            OAuthPendingResolution::Expired {
                state: "expired-state-0123456789".to_string()
            }
        );
        assert_eq!(
            resolve_oauth_pending(Some("expired-state-0123456789"), 640_002),
            OAuthPendingResolution::Rejected
        );
    }

    #[test]
    fn oauth_gate_rejects_unusable_state_before_arming() {
        let _guard = TEST_LOCK.lock().unwrap();
        assert!(!set_oauth_pending("short".to_string(), 10_000));
        assert!(!take_oauth_pending(Some("short"), 10_500));
        assert!(!set_oauth_pending(
            "x".repeat(OAUTH_STATE_MAX_LEN + 1),
            10_000
        ));
    }
}

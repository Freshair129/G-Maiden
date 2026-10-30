//! Playback-identity fence for synchronized local visuals.
pub(crate) fn valid_visual(
    id: u64,
    generation: u64,
    current: u64,
    tail: bool,
    scope: bool,
) -> bool {
    id != 0 && scope && generation == id && if tail { current == 0 } else { current == id }
}

/// Monotonic visual lifetime, including the transition before completion is received.
#[derive(Default)]
pub(crate) struct VisualLifetime {
    completed_at_ms: Option<u64>,
}
impl VisualLifetime {
    pub(crate) fn complete(&mut self, elapsed_ms: u64) {
        self.completed_at_ms.get_or_insert(elapsed_ms);
    }
    pub(crate) fn valid(
        &self,
        id: u64,
        generation: u64,
        current: u64,
        scope: bool,
        elapsed_ms: u64,
    ) -> bool {
        elapsed_ms < 15_000
            && self.completed_at_ms.is_none_or(|at| elapsed_ms < at.saturating_add(4200))
            // Audio publishes current=0 before queuing Completed. The unchanged
            // generation distinguishes this transition from cancellation/replacement.
            && valid_visual(id, generation, current, self.completed_at_ms.is_some() || current == 0, scope)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn poll_survives_current_zero_before_completed_message_arrives() {
        let life = VisualLifetime::default();
        assert!(life.valid(7, 7, 7, true, 2700));
        // Lifecycle::finish(Completed) publishes zero before its channel send.
        assert!(life.valid(7, 7, 0, true, 2701));
        assert!(!life.valid(7, 8, 0, true, 2701));
        assert!(!life.valid(7, 7, 0, false, 2701));
    }
    #[test]
    fn late_decode_can_reach_media_end_without_duplicate_completion_extending_tail() {
        let mut life = VisualLifetime::default();
        life.complete(2700);
        assert!(life.valid(7, 7, 0, true, 6000));
        life.complete(6000);
        assert!(life.valid(7, 7, 0, true, 6899));
        assert!(!life.valid(7, 7, 0, true, 6900));
    }
    #[test]
    fn completion_is_capped_by_start_expiry_and_invalidated_by_cancel_scope_or_new_audio() {
        let mut life = VisualLifetime::default();
        life.complete(14_000);
        assert!(life.valid(7, 7, 0, true, 14_999));
        assert!(!life.valid(7, 7, 0, true, 15_000));
        assert!(!life.valid(7, 8, 0, true, 14_001));
        assert!(!life.valid(7, 7, 0, false, 14_001));
        assert!(!life.valid(7, 7, 8, true, 14_001));
    }
    #[test]
    fn live_visual_follows_current_admitted_playback_and_scope() {
        assert!(valid_visual(7, 7, 7, false, true));
        assert!(!valid_visual(7, 7, 0, false, true));
        assert!(!valid_visual(7, 8, 7, false, true));
        assert!(!valid_visual(7, 7, 7, false, false));
    }
    #[test]
    fn natural_tail_survives_completion_but_not_new_audio_or_scope_change() {
        assert!(valid_visual(7, 7, 0, true, true));
        assert!(!valid_visual(7, 8, 0, true, true));
        assert!(!valid_visual(7, 7, 0, true, false));
        assert!(!valid_visual(0, 0, 0, true, true));
    }
}

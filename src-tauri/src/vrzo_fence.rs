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
#[cfg(test)]
mod tests {
    use super::*;
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

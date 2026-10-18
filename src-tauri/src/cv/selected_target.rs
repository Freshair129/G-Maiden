//! Fail-closed state and provenance contracts for selected-target HUD reads.
//!
//! The recognizer is deliberately fed by calibrated visible-HUD evidence. It
//! does not infer a target from input events and does not read game memory.

use serde::Serialize;

use crate::capture_frame::{CaptureRect, FrameCaptureMetadata};
use crate::damage::{TargetCombatSnapshot, TARGET_HP_TTL_MS, TARGET_STATS_TTL_MS};

const IDENTITY_CONFIDENCE_FLOOR: f64 = 0.70;
const TEMPORAL_CONFIRMATION_COUNT: u8 = 2;
const RECOGNITION_RETRY_INTERVAL_MS: u64 = 120;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum HudOverrideMode {
    On,
    Off,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum TargetState {
    NoTarget,
    Candidate,
    Confirmed,
    Unknown,
    Stale,
    #[default]
    Unavailable,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum TargetUnitKind {
    EnemyHero,
    AlliedHero,
    Creep,
    Building,
    Other,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct HudTargetRegions {
    pub panel: CaptureRect,
    pub identity: CaptureRect,
    pub hp: CaptureRect,
    pub level: CaptureRect,
    pub armor: CaptureRect,
    pub magic_resistance: CaptureRect,
}

#[derive(Clone, Debug, PartialEq)]
pub struct TargetHudCalibration {
    pub mode: HudOverrideMode,
    pub calibration_id: String,
    pub display_id: u64,
    pub screen_width: u32,
    pub screen_height: u32,
    pub regions: HudTargetRegions,
}

impl TargetHudCalibration {
    pub fn validate(&self) -> bool {
        !self.calibration_id.trim().is_empty()
            && self.screen_width > 0
            && self.screen_height > 0
            && self
                .regions
                .panel
                .fits(self.screen_width, self.screen_height)
            && [
                self.regions.identity,
                self.regions.hp,
                self.regions.level,
                self.regions.armor,
                self.regions.magic_resistance,
            ]
            .into_iter()
            .all(|region| {
                region.fits(self.screen_width, self.screen_height)
                    && contains(self.regions.panel, region)
            })
    }
}

fn contains(outer: CaptureRect, inner: CaptureRect) -> bool {
    inner.x >= outer.x
        && inner.y >= outer.y
        && inner
            .x
            .checked_add(inner.width)
            .zip(outer.x.checked_add(outer.width))
            .is_some_and(|(inner_right, outer_right)| inner_right <= outer_right)
        && inner
            .y
            .checked_add(inner.height)
            .zip(outer.y.checked_add(outer.height))
            .is_some_and(|(inner_bottom, outer_bottom)| inner_bottom <= outer_bottom)
}

#[derive(Clone, Debug, Default)]
pub struct HudCalibrationRegistry {
    on: Option<TargetHudCalibration>,
    off: Option<TargetHudCalibration>,
}

impl HudCalibrationRegistry {
    pub fn register(&mut self, calibration: TargetHudCalibration) -> bool {
        if !calibration.validate() {
            return false;
        }
        match calibration.mode {
            HudOverrideMode::On => self.on = Some(calibration),
            HudOverrideMode::Off => self.off = Some(calibration),
        }
        true
    }

    pub fn get(&self, mode: HudOverrideMode) -> Option<&TargetHudCalibration> {
        match mode {
            HudOverrideMode::On => self.on.as_ref(),
            HudOverrideMode::Off => self.off.as_ref(),
        }
    }
}

/// The mode is supplied by the active, per-mode calibration. A screenshot
/// sample for one setting is never reused as evidence for the other setting.
pub struct PanelModeDetector;

impl PanelModeDetector {
    pub fn calibrated_mode(
        registry: &HudCalibrationRegistry,
        requested_mode: HudOverrideMode,
        display_id: u64,
        screen_width: u32,
        screen_height: u32,
    ) -> Option<&TargetHudCalibration> {
        registry.get(requested_mode).filter(|calibration| {
            calibration.display_id == display_id
                && calibration.screen_width == screen_width
                && calibration.screen_height == screen_height
        })
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct HpInterval {
    pub low: f64,
    pub high: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub enum ObservationSource {
    HudOcr { calibration_id: String },
    HudEstimate { calibration_id: String },
}

#[derive(Clone, Debug, PartialEq)]
pub struct ObservedValue<T> {
    pub value: T,
    pub target_id: String,
    pub selection_token: u64,
    pub frame_id: u64,
    pub session_epoch: u64,
    pub observed_at_ms: u64,
    pub confidence: f64,
    pub source: ObservationSource,
}

#[derive(Clone, Debug, PartialEq)]
pub struct UnitObservation {
    pub kind: TargetUnitKind,
    /// Canonical internal hero id, such as `npc_dota_hero_pudge`.
    pub target_id: Option<String>,
    pub identity_confidence: f64,
    pub hp: Option<ObservedValue<HpInterval>>,
    pub level: Option<ObservedValue<u32>>,
    pub armor: Option<ObservedValue<f64>>,
    pub magic_resistance_pct: Option<ObservedValue<f64>>,
}

#[derive(Clone, Debug, PartialEq)]
pub enum RecognitionResult {
    NoPanel,
    Unidentified { reason: String },
    Unit(Box<UnitObservation>),
    OcrUnavailable,
}

impl RecognitionResult {
    pub fn unit(unit: UnitObservation) -> Self {
        Self::Unit(Box::new(unit))
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ObservationRejectReason {
    SupersededFrame,
    SessionChanged,
    SelectionChanged,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum FrameAdmission {
    NoChange,
    OcrUnavailable,
    CalibrationUnavailable,
    DisplayChanged,
    FrameRejected,
    Ticket(RecognitionTicket),
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RecognitionTicket {
    metadata: FrameCaptureMetadata,
    mode: HudOverrideMode,
    panel_revision: u64,
    selection_token: u64,
    calibration_id: String,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct TargetObservationStatus {
    pub state: TargetState,
    pub target_id: Option<String>,
    pub selection_token: u64,
    pub session_epoch: Option<u64>,
    pub frame_id: Option<u64>,
    pub observed_at_ms: Option<u64>,
    pub confidence: Option<f64>,
    pub reason: Option<String>,
}

#[derive(Clone, Debug)]
struct AcceptedTarget {
    target_id: String,
    identity_confidence: f64,
    last_seen_at_ms: u64,
    unit: UnitObservation,
    metadata: FrameCaptureMetadata,
    selection_token: u64,
}

#[derive(Clone, Debug)]
struct CandidateTarget {
    target_id: String,
    count: u8,
}

#[derive(Default)]
pub struct SelectedTargetObserver {
    calibrations: HudCalibrationRegistry,
    state: TargetState,
    reason: Option<String>,
    session_epoch: Option<u64>,
    display_extent: Option<(u64, u32, u32)>,
    mode: Option<HudOverrideMode>,
    latest_frame_id: Option<u64>,
    panel_signature: Option<u64>,
    panel_revision: u64,
    pending_ocr_frame_id: Option<u64>,
    last_ocr_ticket_at_ms: Option<u64>,
    selection_token: u64,
    candidate: Option<CandidateTarget>,
    accepted: Option<AcceptedTarget>,
    latest_observed_at_ms: Option<u64>,
}

impl SelectedTargetObserver {
    pub fn new(calibrations: HudCalibrationRegistry) -> Self {
        Self {
            calibrations,
            state: TargetState::Unavailable,
            reason: Some("calibration_unavailable".into()),
            ..Self::default()
        }
    }

    /// Offer a cheap panel fingerprint before OCR. A changed fingerprint
    /// replaces any older ticket, so delayed OCR cannot queue up or be attached
    /// to a later target selection.
    pub fn begin_frame(
        &mut self,
        metadata: FrameCaptureMetadata,
        mode: HudOverrideMode,
        panel_signature: u64,
        ocr_available: bool,
    ) -> FrameAdmission {
        let extent = (
            metadata.display_id,
            metadata.screen_width,
            metadata.screen_height,
        );
        if self
            .latest_frame_id
            .is_some_and(|frame_id| metadata.frame_id <= frame_id)
        {
            return FrameAdmission::FrameRejected;
        }

        let session_changed = self
            .session_epoch
            .is_some_and(|session_epoch| session_epoch != metadata.session_epoch);
        let display_changed = self.display_extent.is_some_and(|current| current != extent);
        let mode_changed = self.mode.is_some_and(|current| current != mode);
        if session_changed || display_changed || mode_changed {
            self.invalidate_selection();
            self.state = TargetState::Unknown;
            self.reason = Some(if display_changed {
                "display_changed_observation_cleared".into()
            } else if session_changed {
                "match_session_changed".into()
            } else {
                "hud_mode_changed".into()
            });
            self.panel_signature = None;
            self.panel_revision = self.panel_revision.wrapping_add(1);
        }

        self.session_epoch = Some(metadata.session_epoch);
        self.display_extent = Some(extent);
        self.mode = Some(mode);
        self.latest_frame_id = Some(metadata.frame_id);

        if !ocr_available {
            self.invalidate_selection();
            self.state = TargetState::Unavailable;
            self.reason = Some("ocr_models_unavailable".into());
            self.panel_signature = Some(panel_signature);
            self.panel_revision = self.panel_revision.wrapping_add(1);
            return FrameAdmission::OcrUnavailable;
        }

        let Some(calibration) = PanelModeDetector::calibrated_mode(
            &self.calibrations,
            mode,
            metadata.display_id,
            metadata.screen_width,
            metadata.screen_height,
        ) else {
            self.invalidate_selection();
            self.state = TargetState::Unavailable;
            self.reason = Some(if display_changed {
                "display_changed_recalibration_required".into()
            } else {
                "hud_mode_not_calibrated".into()
            });
            self.panel_signature = Some(panel_signature);
            self.panel_revision = self.panel_revision.wrapping_add(1);
            return if display_changed {
                FrameAdmission::DisplayChanged
            } else {
                FrameAdmission::CalibrationUnavailable
            };
        };

        if self.panel_signature == Some(panel_signature) {
            let retryable = matches!(
                self.state,
                TargetState::Candidate | TargetState::Unknown | TargetState::Unavailable
            );
            let retry_ready = self.pending_ocr_frame_id.is_none()
                && self.last_ocr_ticket_at_ms.is_none_or(|last| {
                    metadata.acquired_at_ms >= last
                        && metadata.acquired_at_ms - last >= RECOGNITION_RETRY_INTERVAL_MS
                });
            if !retryable || !retry_ready {
                return FrameAdmission::NoChange;
            }
        } else {
            if self.accepted.is_some() {
                self.accepted = None;
                self.state = TargetState::Candidate;
                self.reason = Some("panel_changed_observation_pending".into());
            }
            self.panel_signature = Some(panel_signature);
            self.panel_revision = self.panel_revision.wrapping_add(1);
            self.pending_ocr_frame_id = None;
        }

        let ticket = RecognitionTicket {
            metadata,
            mode,
            panel_revision: self.panel_revision,
            selection_token: self.selection_token,
            calibration_id: calibration.calibration_id.clone(),
        };
        self.pending_ocr_frame_id = Some(metadata.frame_id);
        self.last_ocr_ticket_at_ms = Some(metadata.acquired_at_ms);
        FrameAdmission::Ticket(ticket)
    }

    pub fn complete_ocr(
        &mut self,
        ticket: RecognitionTicket,
        result: RecognitionResult,
    ) -> Result<TargetObservationStatus, ObservationRejectReason> {
        if self.session_epoch != Some(ticket.metadata.session_epoch) {
            return Err(ObservationRejectReason::SessionChanged);
        }
        if self.pending_ocr_frame_id != Some(ticket.metadata.frame_id)
            || self.panel_revision != ticket.panel_revision
        {
            return Err(ObservationRejectReason::SupersededFrame);
        }
        if self.selection_token != ticket.selection_token || self.mode != Some(ticket.mode) {
            return Err(ObservationRejectReason::SelectionChanged);
        }
        self.pending_ocr_frame_id = None;
        if self
            .calibrations
            .get(ticket.mode)
            .is_none_or(|calibration| calibration.calibration_id != ticket.calibration_id)
        {
            self.invalidate_selection();
            self.state = TargetState::Unavailable;
            self.reason = Some("calibration_changed_during_ocr".into());
            return Ok(self.status(ticket.metadata.acquired_at_ms));
        }

        self.latest_observed_at_ms = Some(ticket.metadata.acquired_at_ms);
        match result {
            RecognitionResult::NoPanel => {
                self.clear_target();
                self.state = TargetState::NoTarget;
                self.reason = None;
            }
            RecognitionResult::OcrUnavailable => {
                self.invalidate_selection();
                self.state = TargetState::Unavailable;
                self.reason = Some("ocr_inference_unavailable".into());
            }
            RecognitionResult::Unidentified { reason } => {
                self.invalidate_selection();
                self.state = TargetState::Unknown;
                self.reason = Some(reason);
            }
            RecognitionResult::Unit(unit) => self.accept_unit(ticket.metadata, *unit),
        }

        Ok(self.status(ticket.metadata.acquired_at_ms))
    }

    /// A lost DXGI frame or failed capture invalidates the observation. The
    /// caller can keep G-Signal running while this lower-priority path recovers.
    pub fn capture_lost(&mut self, session_epoch: u64) {
        if self.session_epoch != Some(session_epoch) {
            return;
        }
        self.invalidate_selection();
        self.state = TargetState::Unavailable;
        self.reason = Some("capture_unavailable".into());
    }

    pub fn status(&self, now_ms: u64) -> TargetObservationStatus {
        let stale = self.latest_observed_at_ms.is_some_and(|observed_at_ms| {
            now_ms < observed_at_ms || now_ms - observed_at_ms > TARGET_HP_TTL_MS
        });
        let state =
            if stale && matches!(self.state, TargetState::Candidate | TargetState::Confirmed) {
                TargetState::Stale
            } else {
                self.state
            };
        TargetObservationStatus {
            state,
            target_id: self
                .accepted
                .as_ref()
                .map(|target| target.target_id.clone()),
            selection_token: self.selection_token,
            session_epoch: self.session_epoch,
            frame_id: self
                .accepted
                .as_ref()
                .map(|target| target.metadata.frame_id),
            observed_at_ms: self.accepted.as_ref().map(|target| target.last_seen_at_ms),
            confidence: self
                .accepted
                .as_ref()
                .map(|target| target.identity_confidence),
            reason: if state == TargetState::Stale {
                Some("hp_observation_stale".into())
            } else {
                self.reason.clone()
            },
        }
    }

    /// Adapt only a temporally confirmed enemy hero to G-Damage's canonical
    /// snapshot. Every field keeps its own source and age until this boundary.
    pub fn target_combat_snapshot(&self, now_ms: u64) -> Option<TargetCombatSnapshot> {
        if self.status(now_ms).state != TargetState::Confirmed {
            return None;
        }
        let accepted = self.accepted.as_ref()?;
        if accepted.metadata.session_epoch != self.session_epoch? {
            return None;
        }
        let calibration_id = self.calibrations.get(self.mode?)?.calibration_id.as_str();
        let hp = accepted.unit.hp.as_ref()?;
        let level = accepted.unit.level.as_ref()?;
        let armor = accepted.unit.armor.as_ref()?;
        let magic_resistance = accepted.unit.magic_resistance_pct.as_ref()?;
        if !field_belongs_to_target(hp, accepted)
            || !field_belongs_to_target(level, accepted)
            || !field_belongs_to_target(armor, accepted)
            || !field_belongs_to_target(magic_resistance, accepted)
        {
            return None;
        }
        for observed in [
            hp.session_epoch,
            level.session_epoch,
            armor.session_epoch,
            magic_resistance.session_epoch,
        ] {
            if observed != accepted.metadata.session_epoch {
                return None;
            }
        }
        if hp.frame_id != accepted.metadata.frame_id
            || hp.observed_at_ms != accepted.metadata.acquired_at_ms
            || !source_matches(&hp.source, calibration_id)
            || !source_matches(&level.source, calibration_id)
            || !source_matches(&armor.source, calibration_id)
            || !source_matches(&magic_resistance.source, calibration_id)
            || !fresh(now_ms, hp.observed_at_ms, TARGET_HP_TTL_MS)
            || !fresh(now_ms, level.observed_at_ms, TARGET_STATS_TTL_MS)
            || !fresh(now_ms, armor.observed_at_ms, TARGET_STATS_TTL_MS)
            || !fresh(now_ms, magic_resistance.observed_at_ms, TARGET_STATS_TTL_MS)
        {
            return None;
        }
        if !hp.value.low.is_finite()
            || !hp.value.high.is_finite()
            || hp.value.low < 0.0
            || hp.value.low > hp.value.high
            || level.value == 0
            || !armor.value.is_finite()
            || !magic_resistance.value.is_finite()
            || !(0.0..=100.0).contains(&magic_resistance.value)
        {
            return None;
        }
        let field_confidences = [
            hp.confidence,
            level.confidence,
            armor.confidence,
            magic_resistance.confidence,
        ];
        if field_confidences
            .iter()
            .any(|confidence| !confidence.is_finite() || !(0.0..=1.0).contains(confidence))
        {
            return None;
        }
        let confidence = field_confidences
            .into_iter()
            .fold(accepted.identity_confidence, f64::min);
        if confidence < IDENTITY_CONFIDENCE_FLOOR {
            return None;
        }
        let snapshot = TargetCombatSnapshot {
            target_id: accepted.target_id.clone(),
            current_hp_low: hp.value.low,
            current_hp_high: hp.value.high,
            max_hp: None,
            level: Some(level.value),
            armor: Some(armor.value),
            magic_resistance_pct: Some(magic_resistance.value),
            observed_at_ms: hp.observed_at_ms,
            source_confidence: confidence,
        };
        snapshot.to_kill_input(now_ms)?;
        Some(snapshot)
    }

    fn accept_unit(&mut self, metadata: FrameCaptureMetadata, unit: UnitObservation) {
        let Some(target_id) = unit.target_id.as_deref() else {
            self.invalidate_selection();
            self.state = TargetState::Unknown;
            self.reason = Some("target_identity_unavailable".into());
            return;
        };
        if unit.kind != TargetUnitKind::EnemyHero {
            self.invalidate_selection();
            self.state = TargetState::Unknown;
            self.reason = Some("selected_unit_is_not_an_enemy_hero".into());
            return;
        }
        if !target_id.starts_with("npc_dota_hero_")
            || crate::damage::lookup_hero(target_id).is_none()
            || !unit.identity_confidence.is_finite()
            || !(0.0..=1.0).contains(&unit.identity_confidence)
        {
            self.invalidate_selection();
            self.state = TargetState::Unknown;
            self.reason = Some("target_identity_invalid_or_unverified".into());
            return;
        }

        let same_candidate = self
            .candidate
            .as_ref()
            .is_some_and(|candidate| candidate.target_id == target_id);
        if !same_candidate {
            self.selection_token = self.selection_token.wrapping_add(1);
            self.accepted = None;
            self.candidate = Some(CandidateTarget {
                target_id: target_id.into(),
                count: 0,
            });
        }

        let candidate = self.candidate.as_mut().expect("candidate checked above");
        if unit.identity_confidence < IDENTITY_CONFIDENCE_FLOOR {
            candidate.count = 0;
            self.accepted = None;
            self.state = TargetState::Candidate;
            self.reason = Some("identity_confidence_below_threshold".into());
            return;
        }
        candidate.count = candidate.count.saturating_add(1);
        if candidate.count < TEMPORAL_CONFIRMATION_COUNT {
            self.state = TargetState::Candidate;
            self.reason = Some("awaiting_temporal_confirmation".into());
            return;
        }

        self.state = TargetState::Confirmed;
        self.reason = None;
        self.accepted = Some(AcceptedTarget {
            target_id: target_id.into(),
            identity_confidence: unit.identity_confidence,
            last_seen_at_ms: metadata.acquired_at_ms,
            unit,
            metadata,
            selection_token: self.selection_token,
        });
    }

    fn clear_target(&mut self) {
        if self.candidate.is_some() || self.accepted.is_some() {
            self.selection_token = self.selection_token.wrapping_add(1);
        }
        self.candidate = None;
        self.accepted = None;
    }

    fn invalidate_selection(&mut self) {
        self.clear_target();
        self.pending_ocr_frame_id = None;
        self.panel_revision = self.panel_revision.wrapping_add(1);
    }
}

fn source_matches(source: &ObservationSource, calibration_id: &str) -> bool {
    match source {
        ObservationSource::HudOcr {
            calibration_id: source_id,
        }
        | ObservationSource::HudEstimate {
            calibration_id: source_id,
        } => source_id == calibration_id,
    }
}

fn field_belongs_to_target<T>(field: &ObservedValue<T>, accepted: &AcceptedTarget) -> bool {
    field.target_id == accepted.target_id
        && (field.selection_token == accepted.selection_token
            || field.frame_id == accepted.metadata.frame_id)
}

fn fresh(now_ms: u64, observed_at_ms: u64, max_age_ms: u64) -> bool {
    now_ms >= observed_at_ms && now_ms - observed_at_ms <= max_age_ms
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::capture_frame::CaptureRect;

    fn calibration(mode: HudOverrideMode, width: u32, height: u32) -> TargetHudCalibration {
        TargetHudCalibration {
            mode,
            calibration_id: format!("mode-{mode:?}"),
            display_id: 1,
            screen_width: width,
            screen_height: height,
            regions: HudTargetRegions {
                panel: CaptureRect::new(0, 0, 200, 100),
                identity: CaptureRect::new(0, 0, 80, 20),
                hp: CaptureRect::new(0, 20, 50, 10),
                level: CaptureRect::new(50, 20, 20, 10),
                armor: CaptureRect::new(70, 20, 30, 10),
                magic_resistance: CaptureRect::new(100, 20, 40, 10),
            },
        }
    }

    fn metadata(
        frame_id: u64,
        session_epoch: u64,
        acquired_at_ms: u64,
        width: u32,
        height: u32,
    ) -> FrameCaptureMetadata {
        FrameCaptureMetadata {
            frame_id,
            session_epoch,
            acquired_at_ms,
            display_id: 1,
            screen_width: width,
            screen_height: height,
        }
    }

    fn make_observer() -> SelectedTargetObserver {
        let mut calibrations = HudCalibrationRegistry::default();
        assert!(calibrations.register(calibration(HudOverrideMode::On, 1920, 1080)));
        SelectedTargetObserver::new(calibrations)
    }

    fn recognized_enemy(
        target_id: &str,
        frame_id: u64,
        session_epoch: u64,
        time_ms: u64,
    ) -> UnitObservation {
        let source = ObservationSource::HudOcr {
            calibration_id: "mode-On".into(),
        };
        UnitObservation {
            kind: TargetUnitKind::EnemyHero,
            target_id: Some(target_id.into()),
            identity_confidence: 0.98,
            hp: Some(ObservedValue {
                value: HpInterval {
                    low: 500.0,
                    high: 520.0,
                },
                target_id: target_id.into(),
                selection_token: 0,
                frame_id,
                session_epoch,
                observed_at_ms: time_ms,
                confidence: 0.95,
                source: source.clone(),
            }),
            level: Some(ObservedValue {
                value: 12,
                target_id: target_id.into(),
                selection_token: 0,
                frame_id,
                session_epoch,
                observed_at_ms: time_ms,
                confidence: 0.95,
                source: source.clone(),
            }),
            armor: Some(ObservedValue {
                value: 8.0,
                target_id: target_id.into(),
                selection_token: 0,
                frame_id,
                session_epoch,
                observed_at_ms: time_ms,
                confidence: 0.95,
                source: source.clone(),
            }),
            magic_resistance_pct: Some(ObservedValue {
                value: 25.0,
                target_id: target_id.into(),
                selection_token: 0,
                frame_id,
                session_epoch,
                observed_at_ms: time_ms,
                confidence: 0.95,
                source,
            }),
        }
    }

    fn issue_ticket(
        observer: &mut SelectedTargetObserver,
        frame_id: u64,
        time_ms: u64,
        signature: u64,
    ) -> RecognitionTicket {
        match observer.begin_frame(
            metadata(frame_id, 1, time_ms, 1920, 1080),
            HudOverrideMode::On,
            signature,
            true,
        ) {
            FrameAdmission::Ticket(ticket) => ticket,
            other => panic!("expected OCR ticket, got {other:?}"),
        }
    }

    #[test]
    fn override_on_and_off_require_separate_calibrations() {
        let mut calibrations = HudCalibrationRegistry::default();
        assert!(calibrations.register(calibration(HudOverrideMode::On, 1920, 1080)));
        assert!(PanelModeDetector::calibrated_mode(
            &calibrations,
            HudOverrideMode::On,
            1,
            1920,
            1080
        )
        .is_some());
        assert!(PanelModeDetector::calibrated_mode(
            &calibrations,
            HudOverrideMode::Off,
            1,
            1920,
            1080
        )
        .is_none());
        assert!(calibrations.register(calibration(HudOverrideMode::Off, 1920, 1080)));
        assert!(PanelModeDetector::calibrated_mode(
            &calibrations,
            HudOverrideMode::Off,
            1,
            1920,
            1080
        )
        .is_some());
    }

    #[test]
    fn enemy_hero_requires_two_temporal_observations_before_snapshot() {
        let mut observer = make_observer();
        let first = issue_ticket(&mut observer, 1, 100, 11);
        let status = observer
            .complete_ocr(
                first,
                RecognitionResult::unit(recognized_enemy("npc_dota_hero_pudge", 1, 1, 100)),
            )
            .unwrap();
        assert_eq!(status.state, TargetState::Candidate);
        assert!(observer.target_combat_snapshot(100).is_none());

        let second = issue_ticket(&mut observer, 2, 220, 12);
        let status = observer
            .complete_ocr(
                second,
                RecognitionResult::unit(recognized_enemy("npc_dota_hero_pudge", 2, 1, 220)),
            )
            .unwrap();
        assert_eq!(status.state, TargetState::Confirmed);
        assert_eq!(
            observer.target_combat_snapshot(220).unwrap().target_id,
            "npc_dota_hero_pudge"
        );
    }

    #[test]
    fn unchanged_candidate_retries_after_completion_without_queuing_ocr() {
        let mut observer = make_observer();
        let first = issue_ticket(&mut observer, 1, 100, 11);
        assert_eq!(
            observer.begin_frame(
                metadata(2, 1, 220, 1920, 1080),
                HudOverrideMode::On,
                11,
                true,
            ),
            FrameAdmission::NoChange
        );
        let first_status = observer
            .complete_ocr(
                first,
                RecognitionResult::unit(recognized_enemy("npc_dota_hero_pudge", 1, 1, 100)),
            )
            .unwrap();
        assert_eq!(first_status.state, TargetState::Candidate);

        let retry = issue_ticket(&mut observer, 3, 240, 11);
        let second_status = observer
            .complete_ocr(
                retry,
                RecognitionResult::unit(recognized_enemy("npc_dota_hero_pudge", 3, 1, 240)),
            )
            .unwrap();
        assert_eq!(second_status.state, TargetState::Confirmed);
    }

    #[test]
    fn low_confidence_identity_resets_temporal_confirmation() {
        let mut observer = make_observer();
        for frame_id in [1, 2] {
            let timestamp = frame_id * 120;
            let ticket = issue_ticket(&mut observer, frame_id, timestamp, frame_id);
            let mut unit = recognized_enemy("npc_dota_hero_pudge", frame_id, 1, timestamp);
            unit.identity_confidence = 0.65;
            let status = observer
                .complete_ocr(ticket, RecognitionResult::unit(unit))
                .unwrap();
            assert_eq!(status.state, TargetState::Candidate);
        }

        for frame_id in [3, 4] {
            let timestamp = frame_id * 120;
            let ticket = issue_ticket(&mut observer, frame_id, timestamp, frame_id);
            let status = observer
                .complete_ocr(
                    ticket,
                    RecognitionResult::unit(recognized_enemy(
                        "npc_dota_hero_pudge",
                        frame_id,
                        1,
                        timestamp,
                    )),
                )
                .unwrap();
            assert_eq!(
                status.state,
                if frame_id == 3 {
                    TargetState::Candidate
                } else {
                    TargetState::Confirmed
                }
            );
        }
    }

    #[test]
    fn allied_creep_and_building_selection_are_never_enemy_targets() {
        for kind in [
            TargetUnitKind::AlliedHero,
            TargetUnitKind::Creep,
            TargetUnitKind::Building,
        ] {
            let mut observer = make_observer();
            let ticket = issue_ticket(&mut observer, 1, 100, 11);
            let mut unit = recognized_enemy("npc_dota_hero_pudge", 1, 1, 100);
            unit.kind = kind;
            let status = observer
                .complete_ocr(ticket, RecognitionResult::unit(unit))
                .unwrap();
            assert_eq!(status.state, TargetState::Unknown);
            assert!(observer.target_combat_snapshot(100).is_none());
        }
    }

    #[test]
    fn no_panel_clears_target_and_advances_selection_token() {
        let mut observer = make_observer();
        let first = issue_ticket(&mut observer, 1, 100, 11);
        observer
            .complete_ocr(
                first,
                RecognitionResult::unit(recognized_enemy("npc_dota_hero_pudge", 1, 1, 100)),
            )
            .unwrap();
        let old_token = observer.selection_token;
        let no_panel = issue_ticket(&mut observer, 2, 220, 12);
        let status = observer
            .complete_ocr(no_panel, RecognitionResult::NoPanel)
            .unwrap();
        assert_eq!(status.state, TargetState::NoTarget);
        assert!(status.target_id.is_none());
        assert!(observer.selection_token > old_token);
    }

    #[test]
    fn target_switch_during_ocr_rejects_old_frame_before_new_identity_is_accepted() {
        let mut observer = make_observer();
        let old = issue_ticket(&mut observer, 1, 100, 11);
        observer
            .complete_ocr(
                old,
                RecognitionResult::unit(recognized_enemy("npc_dota_hero_pudge", 1, 1, 100)),
            )
            .unwrap();

        let switching = issue_ticket(&mut observer, 2, 220, 12);
        let newest = issue_ticket(&mut observer, 3, 340, 13);
        assert_eq!(
            observer.complete_ocr(
                switching,
                RecognitionResult::unit(recognized_enemy("npc_dota_hero_sniper", 2, 1, 220))
            ),
            Err(ObservationRejectReason::SupersededFrame)
        );
        let status = observer
            .complete_ocr(
                newest,
                RecognitionResult::unit(recognized_enemy("npc_dota_hero_sniper", 3, 1, 340)),
            )
            .unwrap();
        assert_eq!(status.state, TargetState::Candidate);
        assert!(observer.target_combat_snapshot(340).is_none());
    }

    #[test]
    fn stale_hp_session_change_and_capture_loss_invalidate_snapshot() {
        let mut observer = make_observer();
        let first = issue_ticket(&mut observer, 1, 100, 11);
        observer
            .complete_ocr(
                first,
                RecognitionResult::unit(recognized_enemy("npc_dota_hero_pudge", 1, 1, 100)),
            )
            .unwrap();
        let second = issue_ticket(&mut observer, 2, 220, 12);
        observer
            .complete_ocr(
                second,
                RecognitionResult::unit(recognized_enemy("npc_dota_hero_pudge", 2, 1, 220)),
            )
            .unwrap();
        assert_eq!(observer.status(721).state, TargetState::Stale);
        assert!(observer.target_combat_snapshot(721).is_none());

        let new_session = observer.begin_frame(
            metadata(3, 2, 800, 1920, 1080),
            HudOverrideMode::On,
            13,
            true,
        );
        assert!(matches!(new_session, FrameAdmission::Ticket(_)));
        assert!(observer.target_combat_snapshot(800).is_none());
        observer.capture_lost(2);
        assert_eq!(observer.status(801).state, TargetState::Unavailable);
        assert!(observer.target_combat_snapshot(801).is_none());
    }

    #[test]
    fn missing_ocr_or_calibration_and_display_change_report_unavailable() {
        let mut observer = make_observer();
        assert_eq!(
            observer.begin_frame(
                metadata(1, 1, 100, 1920, 1080),
                HudOverrideMode::On,
                1,
                false
            ),
            FrameAdmission::OcrUnavailable
        );
        assert_eq!(observer.status(100).state, TargetState::Unavailable);
        assert_eq!(
            observer.begin_frame(
                metadata(2, 1, 220, 1920, 1080),
                HudOverrideMode::Off,
                2,
                true
            ),
            FrameAdmission::CalibrationUnavailable
        );

        let mut observer = make_observer();
        assert!(matches!(
            observer.begin_frame(
                metadata(1, 1, 100, 1920, 1080),
                HudOverrideMode::On,
                1,
                true
            ),
            FrameAdmission::Ticket(_)
        ));
        assert_eq!(
            observer.begin_frame(metadata(2, 1, 220, 1280, 720), HudOverrideMode::On, 2, true),
            FrameAdmission::DisplayChanged
        );
        assert_eq!(observer.status(220).state, TargetState::Unavailable);

        let mut observer = make_observer();
        assert!(matches!(
            observer.begin_frame(
                metadata(1, 1, 100, 1920, 1080),
                HudOverrideMode::On,
                1,
                true
            ),
            FrameAdmission::Ticket(_)
        ));
        let mut changed_display = metadata(1, 1, 100, 1920, 1080);
        changed_display.frame_id = 2;
        changed_display.acquired_at_ms = 220;
        changed_display.display_id = 2;
        assert_eq!(
            observer.begin_frame(changed_display, HudOverrideMode::On, 2, true),
            FrameAdmission::DisplayChanged
        );
        assert_eq!(observer.status(220).state, TargetState::Unavailable);
    }

    #[test]
    fn old_stats_from_a_prior_selection_cannot_be_reused_for_a_new_target() {
        let mut observer = make_observer();
        let first = issue_ticket(&mut observer, 1, 100, 11);
        observer
            .complete_ocr(
                first,
                RecognitionResult::unit(recognized_enemy("npc_dota_hero_pudge", 1, 1, 100)),
            )
            .unwrap();
        let second = issue_ticket(&mut observer, 2, 220, 12);
        observer
            .complete_ocr(
                second,
                RecognitionResult::unit(recognized_enemy("npc_dota_hero_pudge", 2, 1, 220)),
            )
            .unwrap();

        let third = issue_ticket(&mut observer, 3, 340, 13);
        observer
            .complete_ocr(
                third,
                RecognitionResult::unit(recognized_enemy("npc_dota_hero_sniper", 3, 1, 340)),
            )
            .unwrap();
        let fourth = issue_ticket(&mut observer, 4, 460, 14);
        let mut sniper = recognized_enemy("npc_dota_hero_sniper", 4, 1, 460);
        sniper.armor.as_mut().unwrap().target_id = "npc_dota_hero_pudge".into();
        observer
            .complete_ocr(fourth, RecognitionResult::unit(sniper))
            .unwrap();
        assert_eq!(observer.status(460).state, TargetState::Confirmed);
        assert!(observer.target_combat_snapshot(460).is_none());
    }

    #[test]
    fn defensive_fields_can_remain_fresh_for_five_seconds_while_hp_is_current() {
        let mut observer = make_observer();
        let first = issue_ticket(&mut observer, 1, 1_000, 11);
        observer
            .complete_ocr(
                first,
                RecognitionResult::unit(recognized_enemy("npc_dota_hero_pudge", 1, 1, 1_000)),
            )
            .unwrap();
        let second = issue_ticket(&mut observer, 2, 5_900, 12);
        let mut current = recognized_enemy("npc_dota_hero_pudge", 2, 1, 5_900);
        current.level.as_mut().unwrap().frame_id = 1;
        current.level.as_mut().unwrap().observed_at_ms = 1_000;
        current.level.as_mut().unwrap().selection_token = 1;
        current.armor.as_mut().unwrap().frame_id = 1;
        current.armor.as_mut().unwrap().observed_at_ms = 1_000;
        current.armor.as_mut().unwrap().selection_token = 1;
        current.magic_resistance_pct.as_mut().unwrap().frame_id = 1;
        current
            .magic_resistance_pct
            .as_mut()
            .unwrap()
            .observed_at_ms = 1_000;
        current
            .magic_resistance_pct
            .as_mut()
            .unwrap()
            .selection_token = 1;
        observer
            .complete_ocr(second, RecognitionResult::unit(current))
            .unwrap();
        assert!(observer.target_combat_snapshot(6_000).is_some());
        assert!(observer.target_combat_snapshot(6_001).is_none());
    }

    #[test]
    fn invalid_or_missing_fields_do_not_create_a_damage_snapshot() {
        let mut observer = make_observer();
        let first = issue_ticket(&mut observer, 1, 100, 11);
        observer
            .complete_ocr(
                first,
                RecognitionResult::unit(recognized_enemy("npc_dota_hero_pudge", 1, 1, 100)),
            )
            .unwrap();
        let second = issue_ticket(&mut observer, 2, 220, 12);
        let mut unit = recognized_enemy("npc_dota_hero_pudge", 2, 1, 220);
        unit.armor = None;
        observer
            .complete_ocr(second, RecognitionResult::unit(unit))
            .unwrap();
        assert!(observer.target_combat_snapshot(220).is_none());
    }

    #[test]
    fn calibration_requires_field_rois_inside_the_visible_panel() {
        let mut invalid = calibration(HudOverrideMode::On, 1920, 1080);
        invalid.regions.hp = CaptureRect::new(300, 20, 10, 10);
        assert!(!invalid.validate());
        assert!(!HudCalibrationRegistry::default().clone().register(invalid));
    }
}

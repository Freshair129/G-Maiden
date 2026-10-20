use serde::{Deserialize, Serialize};
use std::fmt;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

use crate::motion::MotionParams;

/// Schema revision for the local replay-fit handoff file.
pub const TUNING_SCHEMA_VERSION: u32 = 1;
/// A single match is too noisy to change the live heuristic.
pub const MIN_FULL_MATCHES: u32 = 3;
/// Require a measurable improvement over the shipped default before applying.
const MIN_F1_IMPROVEMENT: f64 = 0.01;
const TUNING_FILE_NAME: &str = "motion-tuning.json";

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum TuningEvidence {
    Full,
    Approx,
}

/// Offline replay result accepted by the next-match runtime boundary.
#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct TuningDelta {
    pub schema_version: u32,
    pub generated_at_ms: u64,
    pub evidence: TuningEvidence,
    pub full_matches: u32,
    pub baseline_f1: f64,
    pub candidate_f1: f64,
    pub old_params: MotionParams,
    pub new_params: MotionParams,
}

#[derive(Debug)]
pub enum TuningError {
    Invalid(String),
    Io(String),
    Json(String),
}

impl fmt::Display for TuningError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            TuningError::Invalid(message) => write!(f, "invalid tuning delta: {message}"),
            TuningError::Io(message) => write!(f, "tuning I/O failed: {message}"),
            TuningError::Json(message) => write!(f, "tuning JSON failed: {message}"),
        }
    }
}

impl std::error::Error for TuningError {}

impl TuningDelta {
    /// Validate provenance, evidence quality, improvement, and parameter bounds
    /// before a candidate can be persisted or applied.
    pub fn validate(&self) -> Result<(), TuningError> {
        if self.schema_version != TUNING_SCHEMA_VERSION {
            return Err(TuningError::Invalid("unsupported schema version".into()));
        }
        if !matches!(self.evidence, TuningEvidence::Full) {
            return Err(TuningError::Invalid(
                "APPROX evidence cannot tune the live path".into(),
            ));
        }
        if self.full_matches < MIN_FULL_MATCHES {
            return Err(TuningError::Invalid(format!(
                "need at least {MIN_FULL_MATCHES} FULL matches"
            )));
        }
        if !self.baseline_f1.is_finite()
            || !self.candidate_f1.is_finite()
            || !(0.0..=1.0).contains(&self.baseline_f1)
            || !(0.0..=1.0).contains(&self.candidate_f1)
        {
            return Err(TuningError::Invalid(
                "F1 scores must be finite percentages".into(),
            ));
        }
        if self.candidate_f1 < self.baseline_f1 + MIN_F1_IMPROVEMENT {
            return Err(TuningError::Invalid(
                "candidate does not improve the shipped baseline enough".into(),
            ));
        }
        if self.old_params != MotionParams::default() {
            return Err(TuningError::Invalid(
                "candidate baseline does not match the shipped parameters".into(),
            ));
        }
        if !self.old_params.is_valid() || !self.new_params.is_valid() {
            return Err(TuningError::Invalid(
                "motion parameters are out of bounds".into(),
            ));
        }
        Ok(())
    }
}

/// Resolve the local-only profile path used by the runtime and replay tool.
pub fn motion_tuning_path() -> PathBuf {
    let base = std::env::var("LOCALAPPDATA")
        .ok()
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."));
    base.join("G-Maiden").join(TUNING_FILE_NAME)
}

/// Load parameters for a new match. Invalid or missing primary and backup
/// profiles fail closed to the shipped defaults.
pub fn load_motion_params() -> MotionParams {
    load_motion_params_at(&motion_tuning_path())
}

/// Testable loader that also implements rollback to the previous valid file.
pub fn load_motion_params_at(path: &Path) -> MotionParams {
    [path.to_path_buf(), backup_path(path)]
        .iter()
        .filter_map(|candidate| read_delta(candidate))
        .map(|delta| delta.new_params)
        .next()
        .unwrap_or_default()
}

/// Persist a validated profile for the next match only.
pub fn write_tuning_delta(delta: &TuningDelta) -> Result<(), TuningError> {
    write_tuning_delta_at(&motion_tuning_path(), delta)
}

/// Testable writer. A complete temporary file replaces the primary only after
/// a valid previous profile is moved to a backup; failures therefore leave a
/// valid rollback/default path.
pub fn write_tuning_delta_at(path: &Path, delta: &TuningDelta) -> Result<(), TuningError> {
    delta.validate()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| TuningError::Io(err.to_string()))?;
    }

    let backup = backup_path(path);
    let primary_is_valid = path.is_file() && read_delta(path).is_some();

    let tmp = temp_path(path);
    let payload =
        serde_json::to_vec_pretty(delta).map_err(|err| TuningError::Json(err.to_string()))?;
    let write_result = (|| {
        let mut file = OpenOptions::new()
            .create(true)
            .truncate(true)
            .write(true)
            .open(&tmp)
            .map_err(|err| TuningError::Io(err.to_string()))?;
        file.write_all(&payload)
            .map_err(|err| TuningError::Io(err.to_string()))?;
        file.sync_all()
            .map_err(|err| TuningError::Io(err.to_string()))?;
        Ok::<(), TuningError>(())
    })();
    if let Err(err) = write_result {
        let _ = fs::remove_file(&tmp);
        return Err(err);
    }

    let replace_result = (|| {
        if path.is_file() {
            if primary_is_valid {
                if backup.is_file() {
                    fs::remove_file(&backup).map_err(|err| TuningError::Io(err.to_string()))?;
                }
                fs::rename(path, &backup).map_err(|err| TuningError::Io(err.to_string()))?;
            } else {
                fs::remove_file(path).map_err(|err| TuningError::Io(err.to_string()))?;
            }
        }
        fs::rename(&tmp, path).map_err(|err| TuningError::Io(err.to_string()))?;
        Ok::<(), TuningError>(())
    })();
    if let Err(err) = replace_result {
        let _ = fs::remove_file(&tmp);
        return Err(err);
    }
    Ok(())
}

fn read_delta(path: &Path) -> Option<TuningDelta> {
    let bytes = fs::read(path).ok()?;
    let delta = serde_json::from_slice::<TuningDelta>(&bytes).ok()?;
    delta.validate().ok()?;
    Some(delta)
}

fn backup_path(path: &Path) -> PathBuf {
    path.with_extension("json.bak")
}

fn temp_path(path: &Path) -> PathBuf {
    path.with_extension("json.tmp")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::motion::MotionParams;
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_path(test_name: &str) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock should be after epoch")
            .as_nanos();
        std::env::temp_dir()
            .join("g-maiden-tuning-tests")
            .join(format!("{test_name}-{nonce}"))
            .join("motion-tuning.json")
    }

    fn valid_delta() -> TuningDelta {
        TuningDelta {
            schema_version: TUNING_SCHEMA_VERSION,
            generated_at_ms: 1,
            evidence: TuningEvidence::Full,
            full_matches: MIN_FULL_MATCHES,
            baseline_f1: 0.50,
            candidate_f1: 0.60,
            old_params: MotionParams::default(),
            new_params: MotionParams {
                peak_s: 15.0,
                ..MotionParams::default()
            },
        }
    }

    fn cleanup(path: &Path) {
        if let Some(parent) = path.parent() {
            let _ = fs::remove_dir_all(parent);
        }
    }

    #[test]
    fn valid_full_delta_passes_validation() {
        assert!(valid_delta().validate().is_ok());
    }

    #[test]
    fn tuning_rejects_approx_insufficient_or_non_improving_evidence() {
        let mut delta = valid_delta();
        delta.evidence = TuningEvidence::Approx;
        assert!(delta.validate().is_err());

        let mut delta = valid_delta();
        delta.full_matches = MIN_FULL_MATCHES - 1;
        assert!(delta.validate().is_err());

        let mut delta = valid_delta();
        delta.candidate_f1 = delta.baseline_f1;
        assert!(delta.validate().is_err());
    }

    #[test]
    fn tuning_rejects_non_finite_or_out_of_bounds_params() {
        let mut delta = valid_delta();
        delta.new_params.peak_s = f32::NAN;
        assert!(delta.validate().is_err());

        let mut delta = valid_delta();
        delta.new_params.multi_boost = 2.1;
        assert!(delta.validate().is_err());
    }

    #[test]
    fn valid_profile_loads_new_params_for_the_next_match() {
        let path = temp_path("load");
        let delta = valid_delta();
        write_tuning_delta_at(&path, &delta).expect("valid profile should write");

        assert_eq!(load_motion_params_at(&path), delta.new_params);
        assert!(!path.with_extension("json.tmp").exists());
        cleanup(&path);
    }

    #[test]
    fn corrupt_primary_rolls_back_to_previous_valid_profile() {
        let path = temp_path("rollback");
        let first = valid_delta();
        write_tuning_delta_at(&path, &first).expect("first profile should write");

        let mut second = valid_delta();
        second.new_params.peak_s = 10.0;
        write_tuning_delta_at(&path, &second).expect("second profile should write");
        fs::write(&path, b"not-json").expect("test should corrupt primary");

        assert_eq!(load_motion_params_at(&path), first.new_params);
        cleanup(&path);
    }

    #[test]
    fn invalid_primary_does_not_replace_a_valid_backup() {
        let path = temp_path("preserve-backup");
        let first = valid_delta();
        write_tuning_delta_at(&path, &first).expect("first profile should write");

        let mut second = valid_delta();
        second.new_params.peak_s = 10.0;
        write_tuning_delta_at(&path, &second).expect("second profile should write");
        fs::write(&path, b"not-json").expect("test should corrupt primary");

        let mut third = valid_delta();
        third.new_params.peak_s = 20.0;
        write_tuning_delta_at(&path, &third).expect("third profile should replace corrupt primary");
        fs::write(&path, b"not-json").expect("test should corrupt replaced primary");

        assert_eq!(load_motion_params_at(&path), first.new_params);
        cleanup(&path);
    }

    #[test]
    fn invalid_profile_falls_back_to_default_params() {
        let path = temp_path("fallback");
        fs::create_dir_all(path.parent().expect("temp path has parent")).expect("mkdir");
        fs::write(&path, b"{}").expect("test should write invalid profile");

        assert_eq!(load_motion_params_at(&path), MotionParams::default());
        cleanup(&path);
    }
}

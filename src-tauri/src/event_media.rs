//! Snapshot identities from one verified GANN sound/banner pair.
pub(crate) struct MixedSelection {
    pub path: std::path::PathBuf,
    pub original_sha256: String,
    pub mixed_sha256: String,
    pub samples: usize,
}

//! G-Ann profile-owned installation. Disk IO runs outside the playback thread.
use crate::package_registry::*;
use g_ann_package::{file_digest, sha256, Package, MAX_PACKAGE};
use ring::rand::{SecureRandom, SystemRandom};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex, OnceLock, Weak,
    },
};

const MAX_METADATA: usize = 2 * 1024 * 1024;
const MAX_INSTALLATIONS: usize = 2048;

#[derive(Clone, Debug, Serialize)]
pub struct PackageError {
    pub code: String,
    pub safe_detail: String,
}
impl PackageError {
    fn new(code: &str, detail: &str) -> Self {
        Self {
            code: code.into(),
            safe_detail: detail.into(),
        }
    }
}
impl std::fmt::Display for PackageError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: {}", self.code, self.safe_detail)
    }
}
impl std::error::Error for PackageError {}
fn io_error(error: std::io::Error) -> PackageError {
    let code = match error.kind() {
        std::io::ErrorKind::StorageFull => "disk_full",
        std::io::ErrorKind::PermissionDenied => "permission_denied",
        _ => "io_error",
    };
    PackageError::new(
        code,
        "Package storage could not be read or written; check free space and permissions",
    )
}
fn invalid(detail: &str) -> PackageError {
    PackageError::new("invalid_registry", detail)
}
fn package_error(_: String) -> PackageError {
    PackageError::new("invalid_package", "Package validation failed")
}

pub enum InstallSource {
    Local {
        path: PathBuf,
        expected_digest: String,
        project_binding: Option<String>,
    },
    Store {
        path: PathBuf,
        release: Box<g_ann_package::VerifiedRelease>,
        authorization: VerifiedStoreAuthorization,
    },
}

/// Created only by a future trusted receipt/current-authorization adapter.
/// There is deliberately no renderer/IPC deserializer or public constructor.
pub struct VerifiedStoreAuthorization {
    _private: (),
}

fn store_unavailable() -> PackageError {
    PackageError::new(
        "store_adapter_unavailable",
        "Store installation requires a trusted receipt and current-authorization adapter",
    )
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct InstallResult {
    pub installation_id: InstallationId,
    pub artifact: ArtifactRef,
    pub profile_id: ProfileId,
    pub installed: bool,
    pub activation: ActivationState,
    pub project_binding: Option<String>,
}
#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EquipPolicy {
    NowIfIdle,
    AfterMatch,
}
struct RuntimeState {
    match_active: bool,
    match_barrier: Option<Arc<AtomicBool>>,
    active_id: Option<InstallationId>,
    pins: usize,
    generations: BTreeMap<String, u64>,
    _owner_lock: File,
}
impl RuntimeState {
    fn match_is_active(&self) -> bool {
        self.match_active
            || self
                .match_barrier
                .as_ref()
                .is_some_and(|b| b.load(Ordering::Acquire))
    }
}
#[derive(Clone)]
pub struct PackageInstaller {
    root: PathBuf,
    profile: ProfileId,
    runtime: Arc<Mutex<RuntimeState>>,
}
/// Keep this lease through audio, video, and the natural-completion tail.
pub struct InstalledSnapshot {
    installation_id: InstallationId,
    artifact: ArtifactRef,
    cache_root: PathBuf,
    container_path: PathBuf,
    runtime: Arc<Mutex<RuntimeState>>,
}
impl InstalledSnapshot {
    pub fn installation_id(&self) -> &InstallationId {
        &self.installation_id
    }
    pub fn artifact(&self) -> &ArtifactRef {
        &self.artifact
    }
    pub fn cache_root(&self) -> &Path {
        &self.cache_root
    }
    pub fn container_path(&self) -> &Path {
        &self.container_path
    }
}
impl std::fmt::Debug for InstalledSnapshot {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("InstalledSnapshot")
            .field("installation_id", &self.installation_id)
            .field("artifact", &self.artifact)
            .finish_non_exhaustive()
    }
}

/// A worker verifies this descriptor; taking an event lease performs no disk IO.
#[derive(Clone)]
pub struct AdmittedInstallation {
    installation_id: InstallationId,
    artifact: ArtifactRef,
    cache_root: PathBuf,
    container_path: PathBuf,
    generation: u64,
    runtime: Arc<Mutex<RuntimeState>>,
}
impl std::fmt::Debug for AdmittedInstallation {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("AdmittedInstallation")
            .field("installation_id", &self.installation_id)
            .field("artifact", &self.artifact)
            .finish_non_exhaustive()
    }
}
impl AdmittedInstallation {
    pub fn installation_id(&self) -> &InstallationId {
        &self.installation_id
    }
    pub fn artifact(&self) -> &ArtifactRef {
        &self.artifact
    }
    pub fn cache_root(&self) -> &Path {
        &self.cache_root
    }
    pub fn container_path(&self) -> &Path {
        &self.container_path
    }
    pub fn lease(&self) -> Result<InstalledSnapshot, PackageError> {
        self.lease_inner(false)
    }
    pub fn lease_active(&self) -> Result<InstalledSnapshot, PackageError> {
        self.lease_inner(true)
    }
    fn lease_inner(&self, require_selected: bool) -> Result<InstalledSnapshot, PackageError> {
        let mut state = self
            .runtime
            .try_lock()
            .map_err(|_| PackageError::new("runtime_busy", "Runtime state is unavailable"))?;
        if require_selected && state.active_id.as_ref() != Some(&self.installation_id) {
            return Err(PackageError::new(
                "selection_changed",
                "The selected installed revision changed",
            ));
        }
        if state
            .generations
            .get(&self.installation_id.0)
            .copied()
            .unwrap_or(0)
            != self.generation
        {
            return Err(PackageError::new(
                "snapshot_stale",
                "Package media was repaired; admit this revision again",
            ));
        }
        state.pins += 1;
        Ok(InstalledSnapshot {
            installation_id: self.installation_id.clone(),
            artifact: self.artifact.clone(),
            cache_root: self.cache_root.clone(),
            container_path: self.container_path.clone(),
            runtime: Arc::clone(&self.runtime),
        })
    }
}
impl Drop for InstalledSnapshot {
    fn drop(&mut self) {
        if let Ok(mut state) = self.runtime.lock() {
            state.pins = state.pins.saturating_sub(1);
        }
    }
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Journal {
    stage: String,
    #[serde(default)]
    repair: Option<InstallationId>,
}

fn hex_id(value: &str) -> bool {
    value.len() == 32
        && value
            .bytes()
            .all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c))
}
fn digest_ok(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c))
}
fn profile_ok(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 64
        && value
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_')
}
fn nonce() -> Result<String, PackageError> {
    let mut bytes = [0u8; 16];
    SystemRandom::new().fill(&mut bytes).map_err(|_| {
        PackageError::new(
            "random_unavailable",
            "Secure random identity could not be created",
        )
    })?;
    Ok(bytes.iter().map(|b| format!("{b:02x}")).collect())
}
fn is_link(metadata: &fs::Metadata) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        metadata.file_type().is_symlink() || metadata.file_attributes() & 0x400 != 0
    }
    #[cfg(not(windows))]
    {
        metadata.file_type().is_symlink()
    }
}
fn regular_file(path: &Path) -> Result<(), PackageError> {
    let metadata = fs::symlink_metadata(path).map_err(io_error)?;
    if is_link(&metadata) || !metadata.is_file() {
        return Err(PackageError::new(
            "unsafe_path",
            "Package storage contains an unsafe file",
        ));
    }
    Ok(())
}
fn ensure_directory(path: &Path) -> Result<(), PackageError> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if !is_link(&metadata) && metadata.is_dir() => Ok(()),
        Ok(_) => Err(PackageError::new(
            "unsafe_path",
            "Package storage contains an unsafe directory",
        )),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            fs::create_dir(path).map_err(io_error)
        }
        Err(error) => Err(io_error(error)),
    }
}
fn ensure_chain(root: &Path, relative: &Path) -> Result<PathBuf, PackageError> {
    ensure_directory(root)?;
    let mut current = root.to_owned();
    for component in relative.components() {
        let std::path::Component::Normal(part) = component else {
            return Err(PackageError::new(
                "unsafe_path",
                "Invalid package storage path",
            ));
        };
        current.push(part);
        ensure_directory(&current)?;
    }
    Ok(current)
}
fn read_json<T: DeserializeOwned>(path: &Path) -> Result<Option<T>, PackageError> {
    if !path.try_exists().map_err(io_error)? {
        return Ok(None);
    }
    regular_file(path)?;
    let input = File::open(path).map_err(io_error)?;
    if input.metadata().map_err(io_error)?.len() > MAX_METADATA as u64 {
        return Err(invalid("Package metadata exceeds its size limit"));
    }
    let mut bytes = Vec::new();
    input
        .take((MAX_METADATA + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(io_error)?;
    if bytes.len() > MAX_METADATA {
        return Err(invalid("Package metadata grew beyond its size limit"));
    }
    serde_json::from_slice(&bytes)
        .map(Some)
        .map_err(|_| invalid("Package metadata is corrupt"))
}
fn atomic_json<T: Serialize>(path: &Path, value: &T) -> Result<(), PackageError> {
    let bytes =
        serde_json::to_vec(value).map_err(|_| invalid("Package metadata cannot be encoded"))?;
    if bytes.len() > MAX_METADATA {
        return Err(PackageError::new(
            "registry_limit",
            "Package registry is full",
        ));
    }
    if path.try_exists().map_err(io_error)? {
        regular_file(path)?;
    }
    let temporary = path.with_file_name(format!(".commit-{}.tmp", nonce()?));
    let result = (|| {
        let mut output = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
            .map_err(io_error)?;
        output.write_all(&bytes).map_err(io_error)?;
        output.sync_all().map_err(io_error)?;
        drop(output);
        atomic_replace(&temporary, path)
    })();
    if temporary.exists() {
        let _ = fs::remove_file(temporary);
    }
    result
}
#[cfg(windows)]
fn atomic_replace(source: &Path, destination: &Path) -> Result<(), PackageError> {
    use std::os::windows::ffi::OsStrExt;
    #[link(name = "kernel32")]
    unsafe extern "system" {
        fn MoveFileExW(source: *const u16, destination: *const u16, flags: u32) -> i32;
    }
    let source: Vec<u16> = source.as_os_str().encode_wide().chain(Some(0)).collect();
    let destination: Vec<u16> = destination
        .as_os_str()
        .encode_wide()
        .chain(Some(0))
        .collect();
    // Same-volume replacement keeps the prior complete metadata visible until commit.
    if unsafe { MoveFileExW(source.as_ptr(), destination.as_ptr(), 0x1 | 0x8) } == 0 {
        Err(io_error(std::io::Error::last_os_error()))
    } else {
        Ok(())
    }
}
#[cfg(not(windows))]
fn atomic_replace(source: &Path, destination: &Path) -> Result<(), PackageError> {
    fs::rename(source, destination).map_err(io_error)?;
    File::open(
        destination
            .parent()
            .ok_or_else(|| invalid("Missing metadata parent"))?,
    )
    .map_err(io_error)?
    .sync_all()
    .map_err(io_error)
}
fn bounded_copy<R: Read, W: Write>(input: &mut R, output: &mut W) -> Result<(), PackageError> {
    let mut buffer = [0u8; 65536];
    let mut total = 0u64;
    loop {
        let count = input.read(&mut buffer).map_err(io_error)?;
        if count == 0 {
            break;
        }
        total = total
            .checked_add(count as u64)
            .ok_or_else(|| PackageError::new("package_limit", "Package size overflow"))?;
        if total > MAX_PACKAGE {
            return Err(PackageError::new(
                "package_limit",
                "Package exceeds the container size limit",
            ));
        }
        output.write_all(&buffer[..count]).map_err(io_error)?;
        #[cfg(test)]
        tests::checkpoint("copy")?;
    }
    Ok(())
}

impl PackageInstaller {
    /// Maiden resolves `app_local_data`; renderer and IPC clients cannot choose it.
    pub fn new(app_local_data: &Path, profile: ProfileId) -> Result<Self, PackageError> {
        if !profile_ok(&profile.0) {
            return Err(PackageError::new(
                "invalid_profile",
                "Choose a registered Maiden profile",
            ));
        }
        fs::create_dir_all(app_local_data).map_err(io_error)?;
        let base = app_local_data.canonicalize().map_err(io_error)?;
        let root = ensure_chain(&base, &PathBuf::from("profiles").join(&profile.0))?;
        for directory in ["containers", "installed", "staging"] {
            ensure_chain(&root, Path::new(directory))?;
        }
        static RUNTIMES: OnceLock<Mutex<BTreeMap<PathBuf, Weak<Mutex<RuntimeState>>>>> =
            OnceLock::new();
        let mut runtimes = RUNTIMES
            .get_or_init(|| Mutex::new(BTreeMap::new()))
            .lock()
            .map_err(|_| PackageError::new("runtime_busy", "Profile ownership is unavailable"))?;
        runtimes.retain(|_, state| state.strong_count() > 0);
        let runtime = if let Some(state) = runtimes.get(&root).and_then(Weak::upgrade) {
            state
        } else {
            let owner_path = root.join("owner.lock");
            if owner_path.exists() {
                regular_file(&owner_path)?;
            }
            let owner_lock = OpenOptions::new()
                .read(true)
                .write(true)
                .create(true)
                .truncate(false)
                .open(owner_path)
                .map_err(io_error)?;
            owner_lock.try_lock().map_err(|_| {
                PackageError::new(
                    "profile_busy",
                    "This profile is already owned by another Maiden process",
                )
            })?;
            let state = Arc::new(Mutex::new(RuntimeState {
                match_active: false,
                match_barrier: None,
                active_id: None,
                pins: 0,
                generations: BTreeMap::new(),
                _owner_lock: owner_lock,
            }));
            runtimes.insert(root.clone(), Arc::downgrade(&state));
            state
        };
        let installer = Self {
            root,
            profile,
            runtime,
        };
        drop(runtimes);
        installer.recover()?;
        {
            let _lock = installer.lock()?;
            let registry = installer.registry()?;
            let active = installer.selection_unlocked(&registry)?.active;
            installer
                .runtime
                .lock()
                .map_err(|_| PackageError::new("runtime_busy", "Runtime state is unavailable"))?
                .active_id = active;
        }
        Ok(installer)
    }
    pub fn profile_root(&self) -> &Path {
        &self.root
    }
    pub fn profile_id(&self) -> &ProfileId {
        &self.profile
    }
    pub fn adoption_key(&self) -> Result<(Option<InstallationId>, u64), PackageError> {
        let _lock = self.lock()?;
        let registry = self.registry()?;
        let active = self.selection_unlocked(&registry)?.active;
        let state = self
            .runtime
            .lock()
            .map_err(|_| PackageError::new("runtime_busy", "Runtime state is unavailable"))?;
        let generation = active
            .as_ref()
            .and_then(|id| state.generations.get(&id.0))
            .copied()
            .unwrap_or(0);
        Ok((active, generation))
    }
    pub fn clear_selection(&self) -> Result<(), PackageError> {
        let _lock = self.lock()?;
        let mut state = self
            .runtime
            .lock()
            .map_err(|_| PackageError::new("runtime_busy", "Runtime state is unavailable"))?;
        if state.match_is_active() || state.pins > 0 {
            return Err(PackageError::new(
                "revision_pinned",
                "Wait for the match and playback to finish before disabling the pack",
            ));
        }
        atomic_json(&self.root.join("selection.json"), &Selection::default())?;
        state.active_id = None;
        Ok(())
    }
    pub fn attach_match_barrier(&self, barrier: Arc<AtomicBool>) -> Result<(), PackageError> {
        self.runtime
            .lock()
            .map_err(|_| PackageError::new("runtime_busy", "Runtime state is unavailable"))?
            .match_barrier = Some(barrier);
        Ok(())
    }
    fn lock(&self) -> Result<File, PackageError> {
        ensure_directory(&self.root)?;
        let path = self.root.join("transaction.lock");
        if path.exists() {
            regular_file(&path)?;
        }
        let file = OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .open(path)
            .map_err(io_error)?;
        file.try_lock().map_err(|_| {
            PackageError::new(
                "profile_busy",
                "Another package operation is using this profile",
            )
        })?;
        Ok(file)
    }
    fn registry(&self) -> Result<Registry, PackageError> {
        let registry: Registry = read_json(&self.root.join("installed.json"))?
            .unwrap_or_else(|| Registry::empty(self.profile.clone()));
        if registry.schema_version != 1
            || registry.profile_id != self.profile
            || registry.installations.len() > MAX_INSTALLATIONS
            || registry.bindings.len() > MAX_INSTALLATIONS
        {
            return Err(invalid("Package registry profile or schema does not match"));
        }
        let mut ids = BTreeSet::new();
        let mut revisions = BTreeSet::new();
        for entry in &registry.installations {
            if !hex_id(&entry.installation_id.0)
                || !ids.insert(entry.installation_id.0.clone())
                || !digest_ok(&entry.artifact.digest)
                || !g_ann_package::valid_id(&entry.artifact.announcer_id, "ann_")
                || entry.artifact.revision == 0
            {
                return Err(invalid("Invalid installed artifact identity"));
            }
            if let OriginAuthority::Local { lineage_id } = &entry.authority {
                if !hex_id(lineage_id) {
                    return Err(invalid("Invalid Local lineage"));
                }
            }
            let key = serde_json::to_string(&entry.authority)
                .map_err(|_| invalid("Invalid authority"))?;
            if !revisions.insert((
                key,
                entry.artifact.announcer_id.clone(),
                entry.artifact.revision,
            )) {
                return Err(invalid("Conflicting installed revisions"));
            }
        }
        let mut tokens = BTreeSet::new();
        for binding in &registry.bindings {
            if !hex_id(&binding.token)
                || !hex_id(&binding.lineage_id)
                || !tokens.insert(&binding.token)
                || !registry.installations.iter().any(|entry| {
                    entry.authority
                        == (OriginAuthority::Local {
                            lineage_id: binding.lineage_id.clone(),
                        })
                        && entry.artifact.announcer_id == binding.announcer_id
                })
            {
                return Err(invalid("Invalid project binding"));
            }
        }
        Ok(registry)
    }
    fn selection_unlocked(&self, registry: &Registry) -> Result<Selection, PackageError> {
        let selection: Selection =
            read_json(&self.root.join("selection.json"))?.unwrap_or_default();
        for id in [&selection.active, &selection.pending]
            .into_iter()
            .flatten()
        {
            Self::find(registry, id)?;
        }
        Ok(selection)
    }
    fn find<'a>(
        registry: &'a Registry,
        id: &InstallationId,
    ) -> Result<&'a InstalledRevision, PackageError> {
        registry
            .installations
            .iter()
            .find(|entry| &entry.installation_id == id)
            .ok_or_else(|| {
                PackageError::new(
                    "not_installed",
                    "The selected revision is not installed in this profile",
                )
            })
    }
    fn cache_for(&self, entry: &InstalledRevision) -> PathBuf {
        let authority = sha256(
            serde_json::to_string(&entry.authority)
                .expect("serializable authority")
                .as_bytes(),
        );
        self.root
            .join("installed")
            .join(authority)
            .join(&entry.artifact.announcer_id)
            .join(entry.artifact.revision.to_string())
            .join(&entry.artifact.digest)
    }
    fn container_for(&self, artifact: &ArtifactRef) -> PathBuf {
        self.root
            .join("containers")
            .join(format!("{}.gann", artifact.digest))
    }
    fn verify_container(&self, entry: &InstalledRevision) -> Result<Package, PackageError> {
        if matches!(entry.authority, OriginAuthority::Store { .. }) {
            return Err(store_unavailable());
        }
        let path = self.container_for(&entry.artifact);
        regular_file(&path)?;
        let package = Package::open(&path).map_err(package_error)?;
        if package.digest != entry.artifact.digest
            || package.index.announcer_id != entry.artifact.announcer_id
            || package.registry["revision"].as_u64() != Some(entry.artifact.revision)
        {
            return Err(PackageError::new(
                "digest_mismatch",
                "Retained package does not match its installed identity",
            ));
        }
        package.validate_playback().map_err(package_error)?;
        Ok(package)
    }
    fn verify_cache(&self, package: &Package, directory: &Path) -> Result<(), PackageError> {
        let relative = directory
            .strip_prefix(&self.root)
            .map_err(|_| invalid("Cache escaped profile"))?;
        let mut current = self.root.clone();
        for part in relative.components() {
            current.push(part);
            let m = fs::symlink_metadata(&current).map_err(io_error)?;
            if is_link(&m) || !m.is_dir() {
                return Err(PackageError::new(
                    "unsafe_path",
                    "Unsafe package cache directory",
                ));
            }
        }
        for entry in &package.index.files {
            let path = directory.join(&entry.path);
            let mut ancestor = directory.to_owned();
            if let Some(parent) = Path::new(&entry.path).parent() {
                for part in parent.components() {
                    ancestor.push(part);
                    let m = fs::symlink_metadata(&ancestor).map_err(io_error)?;
                    if is_link(&m) || !m.is_dir() {
                        return Err(PackageError::new(
                            "unsafe_path",
                            "Unsafe package cache directory",
                        ));
                    }
                }
            }
            regular_file(&path)?;
            if fs::metadata(&path).map_err(io_error)?.len() != entry.bytes
                || file_digest(&path).map_err(package_error)? != entry.sha256
            {
                return Err(PackageError::new(
                    "cache_mismatch",
                    "Installed media is damaged; repair the package",
                ));
            }
        }
        Ok(())
    }
    fn recover_unlocked(&self) -> Result<(), PackageError> {
        if let Some(journal) = read_json::<Journal>(&self.root.join("journal.json"))? {
            if !journal.stage.strip_prefix("tx-").is_some_and(hex_id) {
                return Err(invalid("Invalid package recovery journal"));
            }
            let staging = self.root.join("staging");
            ensure_directory(&staging)?;
            let stage = staging.join(&journal.stage);
            if stage.exists() {
                let metadata = fs::symlink_metadata(&stage).map_err(io_error)?;
                if is_link(&metadata) || !metadata.is_dir() {
                    return Err(PackageError::new(
                        "unsafe_path",
                        "Unsafe package recovery directory",
                    ));
                }
                let canonical = stage.canonicalize().map_err(io_error)?;
                let staging = staging.canonicalize().map_err(io_error)?;
                if canonical == staging || !canonical.starts_with(staging) {
                    return Err(invalid("Recovery escaped staging"));
                }
                if let Some(id) = &journal.repair {
                    let registry = self.registry()?;
                    let entry = Self::find(&registry, id)?;
                    let destination = self.cache_for(entry);
                    let backup = stage.join("previous-cache");
                    if backup.exists() && !destination.exists() {
                        let metadata = fs::symlink_metadata(&backup).map_err(io_error)?;
                        if is_link(&metadata) || !metadata.is_dir() {
                            return Err(PackageError::new("unsafe_path", "Unsafe repair backup"));
                        }
                        // Roll back an interrupted directory swap before discarding staging.
                        ensure_chain(
                            &self.root,
                            destination
                                .parent()
                                .and_then(|p| p.strip_prefix(&self.root).ok())
                                .ok_or_else(|| invalid("Repair escaped profile"))?,
                        )?;
                        fs::rename(&backup, &destination).map_err(io_error)?;
                    } else if destination.exists() && backup.exists() {
                        let package = self.verify_container(entry)?;
                        self.verify_cache(&package, &destination)?;
                    }
                }
                fs::remove_dir_all(canonical).map_err(io_error)?;
            }
            fs::remove_file(self.root.join("journal.json")).map_err(io_error)?;
        }
        Ok(())
    }
    pub fn recover(&self) -> Result<(), PackageError> {
        let _lock = self.lock()?;
        self.recover_unlocked()?;
        let registry = self.registry()?;
        self.selection_unlocked(&registry)?;
        Ok(())
    }
    pub fn selection(&self) -> Result<Selection, PackageError> {
        let _lock = self.lock()?;
        let registry = self.registry()?;
        self.selection_unlocked(&registry)
    }
    pub fn installed(&self) -> Result<Vec<InstalledRevision>, PackageError> {
        let _lock = self.lock()?;
        Ok(self.registry()?.installations)
    }
    pub fn cache_path(&self, id: &InstallationId) -> Result<PathBuf, PackageError> {
        let _lock = self.lock()?;
        let registry = self.registry()?;
        Ok(self.cache_for(Self::find(&registry, id)?))
    }
    pub fn install_package(&self, source: InstallSource) -> Result<InstallResult, PackageError> {
        let _lock = self.lock()?;
        self.recover_unlocked()?;
        let mut registry = self.registry()?;
        let (path, expected_digest, project_binding) = match source {
            InstallSource::Local {
                path,
                expected_digest,
                project_binding,
            } => (path, expected_digest, project_binding),
            InstallSource::Store { .. } => return Err(store_unavailable()),
        };
        if !digest_ok(&expected_digest) {
            return Err(PackageError::new(
                "digest_mismatch",
                "A valid expected artifact digest is required",
            ));
        }
        let binding=project_binding.as_ref().map(|token|registry.bindings.iter().find(|binding|&binding.token==token).cloned().ok_or_else(||PackageError::new("invalid_binding","This project update binding was not issued by the selected Maiden profile"))).transpose()?;
        regular_file(&path)?;
        let stage_name = format!("tx-{}", nonce()?);
        atomic_json(
            &self.root.join("journal.json"),
            &Journal {
                stage: stage_name.clone(),
                repair: None,
            },
        )?;
        let stage = ensure_chain(&self.root, &PathBuf::from("staging").join(&stage_name))?;
        let staged_container = stage.join("package.gann");
        let mut input = File::open(&path).map_err(io_error)?;
        if input.metadata().map_err(io_error)?.len() > MAX_PACKAGE {
            return Err(PackageError::new(
                "package_limit",
                "Package exceeds the container size limit",
            ));
        }
        let mut output = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&staged_container)
            .map_err(io_error)?;
        bounded_copy(&mut input, &mut output)?;
        output.sync_all().map_err(io_error)?;
        drop(output);
        let package = Package::open(&staged_container).map_err(package_error)?;
        if package.digest != expected_digest {
            return Err(PackageError::new(
                "digest_mismatch",
                "Copied package does not match the requested artifact",
            ));
        }
        package.validate_playback().map_err(package_error)?;
        let artifact = ArtifactRef {
            digest: package.digest.clone(),
            announcer_id: package.index.announcer_id.clone(),
            revision: package.registry["revision"]
                .as_u64()
                .ok_or_else(|| invalid("Missing package revision"))?,
        };
        let (authority, token) = match binding {
            Some(binding) => {
                if binding.announcer_id != artifact.announcer_id {
                    return Err(PackageError::new(
                        "invalid_binding",
                        "Project binding does not match this announcer",
                    ));
                }
                (
                    OriginAuthority::Local {
                        lineage_id: binding.lineage_id,
                    },
                    binding.token,
                )
            }
            None => (
                OriginAuthority::Local {
                    lineage_id: nonce()?,
                },
                nonce()?,
            ),
        };
        if let Some(existing) = registry.installations.iter().find(|entry| {
            entry.authority == authority
                && entry.artifact.announcer_id == artifact.announcer_id
                && entry.artifact.revision == artifact.revision
        }) {
            if existing.artifact.digest != artifact.digest {
                return Err(PackageError::new(
                    "revision_conflict",
                    "This lineage revision already contains different bytes; build a new revision",
                ));
            }
            self.verify_container(existing)?;
            self.verify_cache(&package, &self.cache_for(existing))?;
            let report = self.report(existing, Some(token), &self.selection_unlocked(&registry)?);
            self.recover_unlocked()?;
            return Ok(report);
        }
        if registry.installations.len() >= MAX_INSTALLATIONS {
            return Err(PackageError::new(
                "registry_limit",
                "Package registry is full",
            ));
        }
        let entry = InstalledRevision {
            installation_id: InstallationId(nonce()?),
            artifact,
            authority,
        };
        let cache = stage.join("cache");
        fs::create_dir(&cache).map_err(io_error)?;
        package.extract(&cache).map_err(package_error)?;
        self.verify_cache(&package, &cache)?;
        let retained = self.container_for(&entry.artifact);
        ensure_directory(&self.root.join("containers"))?;
        if retained.exists() {
            regular_file(&retained)?;
            if file_digest(&retained).map_err(package_error)? != entry.artifact.digest {
                return Err(PackageError::new(
                    "digest_mismatch",
                    "Existing retained container is damaged",
                ));
            }
        } else {
            fs::rename(&staged_container, &retained).map_err(io_error)?;
        }
        let destination = self.cache_for(&entry);
        let parent = destination
            .parent()
            .ok_or_else(|| invalid("Missing cache parent"))?;
        ensure_chain(
            &self.root,
            parent
                .strip_prefix(&self.root)
                .map_err(|_| invalid("Cache escaped profile"))?,
        )?;
        if destination.exists() {
            self.verify_cache(&package, &destination)?;
        } else {
            fs::rename(&cache, &destination).map_err(io_error)?;
        }
        if let OriginAuthority::Local { lineage_id } = &entry.authority {
            if !registry
                .bindings
                .iter()
                .any(|binding| binding.token == token)
            {
                registry.bindings.push(ProjectBinding {
                    token: token.clone(),
                    lineage_id: lineage_id.clone(),
                    announcer_id: entry.artifact.announcer_id.clone(),
                });
            }
        }
        let selection = self.selection_unlocked(&registry)?;
        registry.installations.push(entry.clone());
        #[cfg(test)]
        tests::checkpoint("before_registry")?;
        atomic_json(&self.root.join("installed.json"), &registry)?;
        #[cfg(test)]
        tests::checkpoint("after_registry")?;
        self.recover_unlocked()?;
        Ok(self.report(&entry, Some(token), &selection))
    }
    fn report(
        &self,
        entry: &InstalledRevision,
        project_binding: Option<String>,
        selection: &Selection,
    ) -> InstallResult {
        let activation = if selection.active.as_ref() == Some(&entry.installation_id) {
            ActivationState::Active
        } else if selection.pending.as_ref() == Some(&entry.installation_id) {
            ActivationState::DeferredUntilMatchEnd
        } else {
            ActivationState::Inactive
        };
        InstallResult {
            installation_id: entry.installation_id.clone(),
            artifact: entry.artifact.clone(),
            profile_id: self.profile.clone(),
            installed: true,
            activation,
            project_binding,
        }
    }
    pub fn equip_package(
        &self,
        id: &InstallationId,
        policy: EquipPolicy,
    ) -> Result<ActivationState, PackageError> {
        let _lock = self.lock()?;
        self.recover_unlocked()?;
        let registry = self.registry()?;
        let entry = Self::find(&registry, id)?;
        let package = self.verify_container(entry)?;
        self.verify_cache(&package, &self.cache_for(entry))?;
        let mut selection = self.selection_unlocked(&registry)?;
        let mut state = self
            .runtime
            .lock()
            .map_err(|_| PackageError::new("runtime_busy", "Runtime state is unavailable"))?;
        if state.match_is_active() || state.pins > 0 || matches!(policy, EquipPolicy::AfterMatch) {
            selection.pending = Some(id.clone());
            atomic_json(&self.root.join("selection.json"), &selection)?;
            Ok(ActivationState::DeferredUntilMatchEnd)
        } else {
            selection.active = Some(id.clone());
            selection.pending = None;
            atomic_json(&self.root.join("selection.json"), &selection)?;
            state.active_id = selection.active.clone();
            Ok(ActivationState::Active)
        }
    }
    /// Call again at the safe boundary after the final event lease is released.
    pub fn set_match_active(&self, active: bool) -> Result<(), PackageError> {
        let _lock = self.lock()?;
        {
            let mut state = self
                .runtime
                .lock()
                .map_err(|_| PackageError::new("runtime_busy", "Runtime state is unavailable"))?;
            state.match_active = active;
            if state.match_is_active() || state.pins > 0 {
                return Ok(());
            }
        }
        if !active {
            let registry = self.registry()?;
            let mut selection = self.selection_unlocked(&registry)?;
            if let Some(id) = &selection.pending {
                let entry = Self::find(&registry, id)?;
                let package = self.verify_container(entry)?;
                self.verify_cache(&package, &self.cache_for(entry))?;
                let mut state = self.runtime.lock().map_err(|_| {
                    PackageError::new("runtime_busy", "Runtime state is unavailable")
                })?;
                if state.match_is_active() || state.pins > 0 {
                    return Ok(());
                }
                selection.active = selection.pending.take();
                atomic_json(&self.root.join("selection.json"), &selection)?;
                state.active_id = selection.active.clone();
            }
        }
        Ok(())
    }
    pub fn pin_package(&self, id: &InstallationId) -> Result<InstalledSnapshot, PackageError> {
        self.admit_package(id)?.lease()
    }
    pub fn admit_package(&self, id: &InstallationId) -> Result<AdmittedInstallation, PackageError> {
        let _lock = self.lock()?;
        let registry = self.registry()?;
        let entry = Self::find(&registry, id)?;
        let package = self.verify_container(entry)?;
        let cache_root = self.cache_for(entry);
        self.verify_cache(&package, &cache_root)?;
        let generation = self
            .runtime
            .lock()
            .map_err(|_| PackageError::new("runtime_busy", "Runtime state is unavailable"))?
            .generations
            .get(&id.0)
            .copied()
            .unwrap_or(0);
        Ok(AdmittedInstallation {
            installation_id: id.clone(),
            artifact: entry.artifact.clone(),
            cache_root,
            container_path: self.container_for(&entry.artifact),
            generation,
            runtime: Arc::clone(&self.runtime),
        })
    }
    pub fn repair_package(&self, id: &InstallationId) -> Result<(), PackageError> {
        let _lock = self.lock()?;
        self.recover_unlocked()?;
        {
            let mut state = self
                .runtime
                .lock()
                .map_err(|_| PackageError::new("runtime_busy", "Runtime state is unavailable"))?;
            if state.pins > 0 {
                return Err(PackageError::new(
                    "revision_pinned",
                    "Wait for playback to finish before repairing media",
                ));
            }
            let generation = state.generations.entry(id.0.clone()).or_default();
            *generation = generation
                .checked_add(1)
                .ok_or_else(|| invalid("Package generation overflow"))?;
        }
        let registry = self.registry()?;
        let entry = Self::find(&registry, id)?;
        let package = self.verify_container(entry)?;
        let stage_name = format!("tx-{}", nonce()?);
        atomic_json(
            &self.root.join("journal.json"),
            &Journal {
                stage: stage_name.clone(),
                repair: Some(id.clone()),
            },
        )?;
        let stage = ensure_chain(&self.root, &PathBuf::from("staging").join(stage_name))?;
        let cache = stage.join("cache");
        fs::create_dir(&cache).map_err(io_error)?;
        package.extract(&cache).map_err(package_error)?;
        self.verify_cache(&package, &cache)?;
        let destination = self.cache_for(entry);
        ensure_chain(
            &self.root,
            destination
                .parent()
                .and_then(|p| p.strip_prefix(&self.root).ok())
                .ok_or_else(|| invalid("Repair escaped profile"))?,
        )?;
        let backup = stage.join("previous-cache");
        if destination.exists() {
            let metadata = fs::symlink_metadata(&destination).map_err(io_error)?;
            if is_link(&metadata) || !metadata.is_dir() {
                return Err(PackageError::new("unsafe_path", "Unsafe repair target"));
            }
            fs::rename(&destination, &backup).map_err(io_error)?;
        }
        if let Err(error) = fs::rename(&cache, &destination) {
            if backup.exists() {
                let _ = fs::rename(&backup, &destination);
            }
            return Err(io_error(error));
        }
        self.recover_unlocked()
    }
    pub fn rollback_package(
        &self,
        id: &InstallationId,
        policy: EquipPolicy,
    ) -> Result<ActivationState, PackageError> {
        self.equip_package(id, policy)
    }
}

#[cfg(test)]
#[path = "package_install_tests.rs"]
mod tests;

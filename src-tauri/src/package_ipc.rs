//! Local installations belong to Maiden, never to the Studio filesystem writer.
use crate::{
    package_install::{EquipPolicy, InstallSource, PackageInstaller},
    package_registry::ProfileId,
};
use g_ann_package::local_ipc::{self, LocalInstall};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::BTreeMap,
    fs,
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex, OnceLock,
    },
};

static INSTALLER: OnceLock<PackageInstaller> = OnceLock::new();
static MATCH_BARRIER: OnceLock<Arc<AtomicBool>> = OnceLock::new();
#[cfg(not(test))]
static CACHE_PUBLICATION: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
#[cfg(test)]
thread_local! { static CACHE_PUBLICATION:std::cell::Cell<u64>=const{std::cell::Cell::new(0)}; }
pub(crate) fn cache_publication_epoch() -> u64 {
    #[cfg(not(test))]
    {
        CACHE_PUBLICATION.load(Ordering::Acquire)
    }
    #[cfg(test)]
    {
        CACHE_PUBLICATION.with(|epoch| epoch.get())
    }
}
pub(crate) fn note_cache_publication() -> u64 {
    #[cfg(not(test))]
    {
        CACHE_PUBLICATION
            .fetch_add(1, Ordering::AcqRel)
            .wrapping_add(1)
    }
    #[cfg(test)]
    {
        CACHE_PUBLICATION.with(|epoch| {
            let next = epoch.get().wrapping_add(1);
            epoch.set(next);
            next
        })
    }
}
pub fn note_lifecycle(lifecycle: Option<crate::runtime::MatchLifecycle>) {
    MATCH_BARRIER
        .get_or_init(|| Arc::new(AtomicBool::new(false)))
        .store(
            matches!(
                lifecycle,
                Some(
                    crate::runtime::MatchLifecycle::Draft
                        | crate::runtime::MatchLifecycle::Live
                        | crate::runtime::MatchLifecycle::Disconnected
                )
            ),
            Ordering::Release,
        );
}
pub fn installer() -> Option<&'static PackageInstaller> {
    INSTALLER.get()
}
pub(crate) fn matches_preview_identity(
    requested: &str,
    announcer: &str,
    installation: Option<&str>,
) -> bool {
    requested == installation.unwrap_or(announcer)
}
#[derive(Default)]
pub(crate) struct AdoptionTracker {
    published: Option<((Option<crate::package_registry::InstallationId>, u64), u64)>,
}
impl AdoptionTracker {
    pub(crate) fn poll(
        &mut self,
        installer: &PackageInstaller,
        match_active: bool,
        adopt: impl FnOnce() -> Result<u64, String>,
    ) -> Result<(), String> {
        installer
            .set_match_active(match_active)
            .map_err(|e| e.to_string())?;
        let key = installer.adoption_key().map_err(|e| e.to_string())?;
        if self.published.as_ref() != Some(&(key.clone(), cache_publication_epoch())) {
            let published_epoch = adopt()?;
            self.published = Some((key, published_epoch));
        }
        Ok(())
    }
}

#[derive(Clone, Serialize, Deserialize)]
struct CachedReply {
    fingerprint: String,
    response: Value,
}
pub struct InstallService {
    installer: PackageInstaller,
    profile: ProfileId,
    replies: Mutex<BTreeMap<String, CachedReply>>,
    match_active: Arc<dyn Fn() -> bool + Send + Sync>,
}
fn error(code: &str, operation: &str, detail: &str) -> Value {
    json!({"error":{"code":code,"operation_id":operation,"retryable":false,"safe_detail":detail}})
}
impl InstallService {
    fn persist_replies(&self, replies: &BTreeMap<String, CachedReply>) -> Result<(), String> {
        let bytes = serde_json::to_vec(replies).map_err(|e| e.to_string())?;
        if bytes.len() > 2 * 1024 * 1024 {
            return Err("reply_history_full".into());
        }
        let path = self.installer.profile_root().join("ipc-replies.json");
        let temp = self.installer.profile_root().join(".ipc-replies.tmp");
        fs::write(&temp, bytes)
            .and_then(|_| fs::rename(&temp, &path))
            .map_err(|_| "reply_storage_unavailable".into())
    }
    pub fn new(installer: PackageInstaller, profile: ProfileId) -> Self {
        let ledger = installer.profile_root().join("ipc-replies.json");
        let replies = fs::metadata(&ledger)
            .ok()
            .filter(|m| m.len() <= 2 * 1024 * 1024)
            .and_then(|_| fs::read(&ledger).ok())
            .and_then(|b| serde_json::from_slice(&b).ok())
            .unwrap_or_default();
        Self {
            installer,
            profile,
            replies: Mutex::new(replies),
            match_active: Arc::new(|| false),
        }
    }
    pub fn with_match_status(mut self, status: Arc<dyn Fn() -> bool + Send + Sync>) -> Self {
        self.match_active = status;
        self
    }
    pub fn handle(&self, value: Value) -> Value {
        let request: LocalInstall = match serde_json::from_value(value.clone()) {
            Ok(r) => r,
            Err(_) => {
                return error(
                    "invalid_request",
                    "unknown",
                    "Request does not match the local-install protocol",
                )
            }
        };
        let operation = &request.request_id;
        if let Err(reason) = request.validate() {
            return error(&reason, operation, "Invalid installation request");
        }
        if request.profile_id != self.profile.0 {
            return error(
                "wrong_profile",
                operation,
                "Choose the registered Maiden profile again",
            );
        }
        let fingerprint = g_ann_package::sha256(&serde_json::to_vec(&value).unwrap_or_default());
        let mut replies = match self.replies.lock() {
            Ok(r) => r,
            Err(_) => {
                return error(
                    "service_unavailable",
                    operation,
                    "Restart this Maiden instance",
                )
            }
        };
        if let Some(cached) = replies.get(operation) {
            return if cached.fingerprint == fingerprint {
                cached.response.clone()
            } else {
                error(
                    "request_id_reused",
                    operation,
                    "Use a new operation ID for changed input",
                )
            };
        }
        if replies.len() >= 2048 {
            return error(
                "reply_history_full",
                operation,
                "This profile's installation operation history is full",
            );
        }
        // Persist the operation identity before any installer side effect. If the
        // process dies before its final reply is durable, a retry stays uncertain
        // and cannot create a second Local lineage for the same operation.
        replies.insert(operation.clone(),CachedReply {fingerprint:fingerprint.clone(),response:error("operation_interrupted",operation,"The previous operation may have installed this digest; inspect Maiden inventory before starting a new operation")});
        if let Err(code) = self.persist_replies(&replies) {
            replies.remove(operation);
            return error(&code,operation,"Installation operation history could not be written; check disk space and permissions");
        }
        let response=(|| {
            self.installer.set_match_active((self.match_active)()).map_err(|e|error(&e.code,operation,&e.safe_detail))?;
            let mut result=self.installer.install_package(InstallSource::Local {path:request.source_path,expected_digest:request.expected_digest,project_binding:request.project_binding})
                .map_err(|e|error(&e.code,operation,&e.safe_detail))?;
            let policy=match request.equip_policy {
                local_ipc::EquipPolicy::Never=>None,
                local_ipc::EquipPolicy::NowIfIdle=>Some(EquipPolicy::NowIfIdle),
                local_ipc::EquipPolicy::AfterMatch=>Some(EquipPolicy::AfterMatch),
            };
            let mut activation_error=None;
            if let Some(policy)=policy {
                // Recheck after copy/validation; a match may have started during the import.
                let equipped=self.installer.set_match_active((self.match_active)()).and_then(|_|self.installer.equip_package(&result.installation_id,policy));
                match equipped {
                    Ok(activation)=>result.activation=activation,
                    Err(e)=>activation_error=Some(json!({"code":e.code,"safe_detail":e.safe_detail,"retryable":true,"operation_id":operation})),
                }
            }
            Ok::<_,Value>(json!({"result":result,"activation_error":activation_error}))
        })().unwrap_or_else(|e|e);
        // Keep retry results across process restarts. Failed requests are also stable;
        // a retry after fixing input gets a fresh operation ID.
        replies.insert(
            operation.clone(),
            CachedReply {
                fingerprint,
                response: response.clone(),
            },
        );
        if self.persist_replies(&replies).is_err() {
            eprintln!("[G-AnnInstall] reply ledger could not be persisted operation={operation}");
        }
        response
    }
}

fn match_active() -> bool {
    let session = crate::runtime::match_session_snapshot();
    crate::runtime::in_game()
        || matches!(
            session.session_lifecycle,
            Some(
                crate::runtime::MatchLifecycle::Draft
                    | crate::runtime::MatchLifecycle::Live
                    | crate::runtime::MatchLifecycle::Disconnected
            )
        )
}
pub fn start(app_local_data: PathBuf, development: bool) -> Result<(), String> {
    let profile = ProfileId(
        std::env::var("GMAIDEN_PROFILE_ID")
            .unwrap_or_else(|_| if development { "dev" } else { "installed" }.into()),
    );
    let root = std::env::var_os("GMAIDEN_PACKAGE_DATA_ROOT")
        .map(PathBuf::from)
        .unwrap_or(app_local_data);
    let package_installer =
        PackageInstaller::new(&root, profile.clone()).map_err(|e| e.to_string())?;
    let barrier = MATCH_BARRIER
        .get_or_init(|| Arc::new(AtomicBool::new(match_active())))
        .clone();
    package_installer
        .attach_match_barrier(barrier)
        .map_err(|e| e.to_string())?;
    package_installer
        .set_match_active(match_active())
        .map_err(|e| e.to_string())?;
    INSTALLER
        .set(package_installer.clone())
        .map_err(|_| "Package host already initialized")?;
    #[cfg(windows)]
    {
        let default_kind = if std::env::var_os("GMAIDEN_PACKAGE_DATA_ROOT").is_some() {
            "test"
        } else if development {
            "dev"
        } else {
            "installed"
        };
        let explicit_kind = std::env::var("GMAIDEN_INSTANCE_KIND").ok();
        let kind = explicit_kind
            .as_deref()
            .filter(|k| matches!(*k, "test" | "dev" | "installed"))
            .unwrap_or(default_kind);
        let registration = local_ipc::windows::new_registration(
            profile.0.clone(),
            format!("G-Maiden {kind}"),
            kind.into(),
            root,
        )?;
        let directory = local_ipc::registration_directory()?;
        let service = Arc::new(
            InstallService::new(package_installer.clone(), profile)
                .with_match_status(Arc::new(match_active)),
        );
        let handler = Arc::new(move |request| service.handle(request));
        tauri_spawn(async move {
            if let Err(e) = local_ipc::windows::serve(registration, directory, handler).await {
                eprintln!("[G-AnnInstall] local host unavailable: {e}");
            }
        });
    }
    std::thread::Builder::new()
        .name("g-package-adoption".into())
        .spawn(move || {
            let mut tracker = AdoptionTracker::default();
            loop {
                let _ = tracker.poll(&package_installer, match_active(), || {
                    crate::voice_api::adopt_registry_selection(&package_installer)
                });
                std::thread::sleep(std::time::Duration::from_millis(250));
            }
        })
        .map_err(|e| e.to_string())?;
    Ok(())
}
fn tauri_spawn(task: impl std::future::Future<Output = ()> + Send + 'static) {
    // The transport uses the current native host runtime; no WebView or HTTP endpoint.
    std::thread::spawn(move || {
        match tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
        {
            Ok(runtime) => runtime.block_on(task),
            Err(e) => eprintln!("[G-AnnInstall] runtime unavailable: {e}"),
        }
    });
}
#[cfg(test)]
#[path = "package_ipc_tests.rs"]
mod tests;

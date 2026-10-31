#![allow(dead_code)]
#[path="../../../src-tauri/src/package_registry.rs"]
pub mod package_registry;
#[path="../../../src-tauri/src/package_install.rs"]
pub mod package_install;
#[path="../../../src-tauri/src/package_ipc.rs"]
pub mod package_ipc;
mod runtime {
    pub enum MatchLifecycle { Draft, Live, Disconnected }
    pub struct Snapshot { pub session_lifecycle: Option<MatchLifecycle> }
    pub fn match_session_snapshot()->Snapshot { Snapshot {session_lifecycle:None} }
    pub fn in_game()->bool { false }
}
mod voice_api {
    pub fn adopt_registry_selection(_: &crate::package_install::PackageInstaller)->Result<u64,String> {Ok(crate::package_ipc::note_cache_publication())}
}
#[path="../../../src-tauri/src/vrzo_fence.rs"]
mod vrzo_fence;

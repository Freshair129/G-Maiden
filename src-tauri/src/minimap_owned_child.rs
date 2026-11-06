use std::process::Child;
use std::time::{Duration, Instant};

pub(crate) struct OwnedChild {
    pub process: Child,
}
impl OwnedChild {
    pub fn stop(&mut self) -> bool {
        if matches!(self.process.try_wait(), Ok(Some(_))) {
            return true;
        }
        let _ = self.process.kill();
        let limit = Instant::now() + Duration::from_millis(500);
        loop {
            if matches!(self.process.try_wait(), Ok(Some(_))) {
                return true;
            }
            if Instant::now() >= limit {
                return false;
            }
            std::thread::sleep(Duration::from_millis(5));
        }
    }
}
impl Drop for OwnedChild {
    fn drop(&mut self) {
        let _ = self.stop();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        path::PathBuf,
        process::{Command, Stdio},
        sync::atomic::{AtomicU64, Ordering},
    };

    #[test]
    fn wait_fixture() {
        let Some(path) = std::env::var_os("GM_MINIMAP_OWNERSHIP_FIXTURE") else {
            return;
        };
        std::fs::write(path, b"ready").unwrap();
        std::thread::sleep(Duration::from_secs(15));
    }
    struct Fixture {
        child: OwnedChild,
        marker: PathBuf,
    }
    impl Fixture {
        fn new() -> Self {
            static SEQUENCE: AtomicU64 = AtomicU64::new(0);
            let marker = std::env::temp_dir().join(format!(
                "gm-preview-owned-{}-{}-{}.ready",
                std::process::id(),
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_nanos(),
                SEQUENCE.fetch_add(1, Ordering::Relaxed)
            ));
            let module = module_path!().split_once("::").unwrap().1;
            let mut command = Command::new(std::env::current_exe().unwrap());
            command
                .args(["--exact", &format!("{module}::wait_fixture")])
                .env("GM_MINIMAP_OWNERSHIP_FIXTURE", &marker)
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null());
            #[cfg(windows)]
            {
                use std::os::windows::process::CommandExt;
                command.creation_flags(0x0800_0000);
            }
            let fixture = Self {
                child: OwnedChild {
                    process: command.spawn().unwrap(),
                },
                marker,
            };
            let limit = Instant::now() + Duration::from_secs(5);
            while !fixture.marker.exists() {
                assert!(Instant::now() < limit, "fixture did not start");
                std::thread::sleep(Duration::from_millis(5));
            }
            fixture
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = self.child.process.kill();
            let _ = self.child.process.wait();
            let _ = std::fs::remove_file(&self.marker);
        }
    }
    #[test]
    fn shutdown_reaps_only_the_owned_handle_and_leaves_same_executable_unrelated_child_alive() {
        let mut owned = Fixture::new();
        let mut unrelated = Fixture::new();
        assert_ne!(owned.child.process.id(), unrelated.child.process.id());
        assert!(owned.child.stop());
        assert!(owned.child.process.try_wait().unwrap().is_some());
        assert!(unrelated.child.process.try_wait().unwrap().is_none());
        assert!(owned.child.stop());
    }
}

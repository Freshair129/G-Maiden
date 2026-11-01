//! QPC keeps acquisition and response times comparable across the preview child.
#[cfg(windows)]
pub(crate) fn now_us() -> u64 {
    use std::sync::OnceLock;
    #[link(name = "kernel32")]
    unsafe extern "system" {
        fn QueryPerformanceCounter(value: *mut i64) -> i32;
        fn QueryPerformanceFrequency(value: *mut i64) -> i32;
    }
    static FREQUENCY: OnceLock<i64> = OnceLock::new();
    let frequency = *FREQUENCY.get_or_init(|| {
        let mut f = 0;
        unsafe {
            if QueryPerformanceFrequency(&mut f) == 0 {
                return 0;
            }
        }
        f
    });
    let mut counter = 0;
    if frequency <= 0 || unsafe { QueryPerformanceCounter(&mut counter) } == 0 || counter <= 0 {
        return 0;
    }
    ((counter as u128 * 1_000_000) / frequency as u128).min(u128::from(u64::MAX)) as u64
}
#[cfg(not(windows))]
pub(crate) fn now_us() -> u64 {
    0
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    use crate::minimap_owned_child::OwnedChild;
    use std::{
        path::PathBuf,
        process::{Command, Stdio},
        time::{Duration, Instant},
    };
    #[test]
    fn clock_fixture() {
        if let Some(path) = std::env::var_os("GM_PREVIEW_CLOCK_FIXTURE") {
            std::fs::write(path, now_us().to_string()).unwrap();
        }
    }
    struct Marker(PathBuf);
    impl Drop for Marker {
        fn drop(&mut self) {
            let _ = std::fs::remove_file(&self.0);
        }
    }
    #[test]
    fn parent_and_new_process_share_clock_origin() {
        use std::os::windows::process::CommandExt;
        let marker = Marker(std::env::temp_dir().join(format!(
            "gm-clock-{}-{}.txt",
            std::process::id(),
            now_us()
        )));
        let module = module_path!().split_once("::").unwrap().1;
        let before = now_us();
        assert!(before > 0);
        let mut child = OwnedChild {
            process: Command::new(std::env::current_exe().unwrap())
                .args(["--exact", &format!("{module}::clock_fixture")])
                .env("GM_PREVIEW_CLOCK_FIXTURE", &marker.0)
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .creation_flags(0x0800_0000)
                .spawn()
                .unwrap(),
        };
        let limit = Instant::now() + Duration::from_secs(5);
        loop {
            if child.process.try_wait().unwrap().is_some() {
                break;
            }
            assert!(Instant::now() < limit);
            std::thread::sleep(Duration::from_millis(5));
        }
        let from_child: u64 = std::fs::read_to_string(&marker.0).unwrap().parse().unwrap();
        let after = now_us();
        assert!(
            before <= from_child && from_child <= after,
            "different process clock origins"
        );
    }
}

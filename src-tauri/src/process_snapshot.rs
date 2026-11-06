//! G-Sensory read-only process-name discovery.

type ImageName = [u16; 260];

trait ProcessSnapshot {
    fn next_name(&mut self) -> Result<Option<ImageName>, ()>;
}

fn probe_image<S: ProcessSnapshot>(snapshot: Result<S, ()>, image: &str) -> Option<bool> {
    let mut snapshot = snapshot.ok()?;
    let mut found = false;
    while let Some(name) = snapshot.next_name().ok()? {
        found |= image_matches(&name, image)?;
    }
    Some(found)
}

fn image_matches(name: &[u16], image: &str) -> Option<bool> {
    let end = name.iter().position(|unit| *unit == 0)?;
    Some(
        String::from_utf16(&name[..end])
            .ok()?
            .eq_ignore_ascii_case(image),
    )
}

#[cfg(windows)]
struct NativeSnapshot {
    handle: std::os::windows::io::OwnedHandle,
    first: bool,
}

#[cfg(windows)]
impl NativeSnapshot {
    fn open() -> Result<Self, ()> {
        use std::os::windows::io::FromRawHandle;
        use windows::Win32::System::Diagnostics::ToolHelp::{
            CreateToolhelp32Snapshot, TH32CS_SNAPPROCESS,
        };
        let handle = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) }.map_err(|_| ())?;
        Ok(Self {
            handle: unsafe { std::os::windows::io::OwnedHandle::from_raw_handle(handle.0) },
            first: true,
        })
    }
}

#[cfg(windows)]
impl ProcessSnapshot for NativeSnapshot {
    fn next_name(&mut self) -> Result<Option<ImageName>, ()> {
        use std::os::windows::io::AsRawHandle;
        use windows::Win32::Foundation::{ERROR_NO_MORE_FILES, HANDLE};
        use windows::Win32::System::Diagnostics::ToolHelp::{
            Process32FirstW, Process32NextW, PROCESSENTRY32W,
        };
        let mut entry = PROCESSENTRY32W {
            dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32,
            ..Default::default()
        };
        let handle = HANDLE(self.handle.as_raw_handle());
        let result = if self.first {
            self.first = false;
            unsafe { Process32FirstW(handle, &mut entry) }
        } else {
            unsafe { Process32NextW(handle, &mut entry) }
        };
        match result {
            Ok(()) => Ok(Some(entry.szExeFile)),
            Err(error)
                if error.code() == windows::core::HRESULT::from_win32(ERROR_NO_MORE_FILES.0) =>
            {
                Ok(None)
            }
            Err(_) => Err(()),
        }
    }
}

#[cfg(windows)]
pub(super) fn image_running(image: &str) -> Option<bool> {
    probe_image(NativeSnapshot::open(), image)
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Fixture(std::vec::IntoIter<Result<ImageName, ()>>);
    impl ProcessSnapshot for Fixture {
        fn next_name(&mut self) -> Result<Option<ImageName>, ()> {
            self.0.next().transpose()
        }
    }

    fn name(value: &str) -> ImageName {
        let mut name = [0; 260];
        for (destination, unit) in name.iter_mut().zip(value.encode_utf16()) {
            *destination = unit;
        }
        name
    }

    fn fixture(rows: Vec<Result<ImageName, ()>>) -> Result<Fixture, ()> {
        Ok(Fixture(rows.into_iter()))
    }

    #[cfg(windows)]
    #[test]
    fn native_snapshot_finds_own_process_by_name_without_opening_it() {
        let executable = std::env::current_exe().unwrap();
        let image = executable.file_name().unwrap().to_str().unwrap();
        assert_eq!(image_running(image), Some(true));
    }

    #[test]
    fn exact_image_and_ascii_case_are_accepted() {
        assert_eq!(
            probe_image(fixture(vec![Ok(name("DoTa2.ExE"))]), "dota2.exe"),
            Some(true)
        );
    }

    #[test]
    fn substrings_paths_and_other_images_are_absent() {
        let rows = [
            "dota2.exe.bak",
            "notdota2.exe",
            r"C:\games\dota2.exe",
            "dota.exe",
            "explorer.exe",
        ];
        assert_eq!(
            probe_image(fixture(rows.map(|row| Ok(name(row))).to_vec()), "dota2.exe"),
            Some(false)
        );
    }

    #[test]
    fn clean_empty_snapshot_is_absent() {
        assert_eq!(probe_image(fixture(vec![]), "dota2.exe"), Some(false));
        assert_eq!(image_matches(&[0; 260], "dota2.exe"), Some(false));
    }

    #[test]
    fn utf16_is_bounded_by_first_nul() {
        let mut image = name("dota2.exe");
        image[10] = 0xd800;
        assert_eq!(image_matches(&image, "dota2.exe"), Some(true));
        assert_eq!(image_matches(&[65; 260], "dota2.exe"), None);
        assert_eq!(image_matches(&[0xd800, 0], "dota2.exe"), None);
        assert_eq!(image_matches(&name("英雄.exe"), "dota2.exe"), Some(false));
        let mut last_nul = [65; 260];
        last_nul[259] = 0;
        assert_eq!(image_matches(&last_nul, "dota2.exe"), Some(false));
    }

    #[test]
    fn snapshot_or_first_entry_failure_is_unknown() {
        assert_eq!(probe_image::<Fixture>(Err(()), "dota2.exe"), None);
        assert_eq!(probe_image(fixture(vec![Err(())]), "dota2.exe"), None);
    }

    #[test]
    fn late_iteration_failure_is_unknown_even_after_a_match() {
        assert_eq!(
            probe_image(
                fixture(vec![Ok(name("explorer.exe")), Err(())]),
                "dota2.exe"
            ),
            None
        );
        assert_eq!(
            probe_image(fixture(vec![Ok(name("dota2.exe")), Err(())]), "dota2.exe"),
            None
        );
    }

    #[test]
    fn malformed_name_makes_complete_scan_unknown() {
        assert_eq!(probe_image(fixture(vec![Ok([65; 260])]), "dota2.exe"), None);
    }
}

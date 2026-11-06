//! Local Steam login authority; provider metadata does not identify the player.

pub(crate) fn active_steam_id() -> Option<String> {
    #[cfg(windows)]
    {
        use std::ffi::c_void;
        #[link(name = "advapi32")]
        unsafe extern "system" {
            fn RegGetValueW(
                key: *mut c_void,
                subkey: *const u16,
                name: *const u16,
                flags: u32,
                value_type: *mut u32,
                data: *mut c_void,
                size: *mut u32,
            ) -> i32;
        }
        let key: Vec<u16> = "Software\\Valve\\Steam\\ActiveProcess\0"
            .encode_utf16()
            .collect();
        let name: Vec<u16> = "ActiveUser\0".encode_utf16().collect();
        let mut account = 0u32;
        let mut size = 4u32;
        // Read only a DWORD from the current Windows user's Steam session.
        // The predefined HKEY is borrowed; no owned handle or subprocess is created.
        let result = unsafe {
            RegGetValueW(
                (-2147483647isize) as *mut c_void,
                key.as_ptr(),
                name.as_ptr(),
                0x10,
                std::ptr::null_mut(),
                (&mut account as *mut u32).cast(),
                &mut size,
            )
        };
        if result != 0 || size != 4 {
            return None;
        }
        steam_id(account)
    }
    #[cfg(not(windows))]
    {
        None
    }
}

fn steam_id(active_account: u32) -> Option<String> {
    (active_account != 0)
        .then(|| (76_561_197_960_265_728u64 + u64::from(active_account)).to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_active_local_account_can_own_personal_events() {
        assert_eq!(steam_id(155097465).as_deref(), Some("76561198115363193"));
        assert_ne!(steam_id(155097465).as_deref(), Some("76561198115363194"));
        assert_eq!(steam_id(0), None);
    }
}

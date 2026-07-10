//! DPAPI-backed per-user secret storage for Windows.
//!
//! Ciphertext is tied to the current Windows user account. This protects
//! against file-copy, other-user, or cloud-sync exfiltration, but it does not
//! protect against malware already running as the same user.

use std::fs;
use std::io::{ErrorKind, Write};
use std::path::{Path, PathBuf};
use std::ptr;
use std::slice;
use std::sync::Mutex;

use tauri::Manager;
use windows::core::{Error as WindowsError, PCWSTR};
use windows::Win32::Foundation::{GetLastError, HLOCAL, LocalFree};
use windows::Win32::Security::Cryptography::{
    CryptProtectData, CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
};

static WRITE_LOCK: Mutex<()> = Mutex::new(());

fn validate_name(name: &str) -> Result<(), String> {
    if name.is_empty() {
        return Err("secret name must not be empty".to_string());
    }

    if name.contains('.') || name.contains('/') || name.contains('\\') || name.contains("..") {
        return Err("secret name must match [a-z0-9_-]+".to_string());
    }

    if !name
        .bytes()
        .all(|b| matches!(b, b'a'..=b'z' | b'0'..=b'9' | b'_' | b'-'))
    {
        return Err("secret name must match [a-z0-9_-]+".to_string());
    }

    Ok(())
}

fn secret_dir(base: &Path) -> PathBuf {
    base.join("secrets")
}

fn secret_path(base: &Path, name: &str) -> Result<PathBuf, String> {
    validate_name(name)?;
    Ok(secret_dir(base).join(format!("{name}.bin")))
}

fn checked_u32_len(len: usize, context: &str) -> Result<u32, String> {
    u32::try_from(len).map_err(|_| format!("{context} exceeds DPAPI size limits"))
}

fn format_windows_error(context: &str, err: WindowsError) -> String {
    let last_error = unsafe { GetLastError().0 };
    format!("{context} failed: {err} (GetLastError={last_error})")
}

fn take_blob_bytes(blob: &mut CRYPT_INTEGER_BLOB, context: &str) -> Result<Vec<u8>, String> {
    let bytes = if blob.cbData == 0 {
        Vec::new()
    } else if blob.pbData.is_null() {
        return Err(format!("{context} returned a null data pointer"));
    } else {
        unsafe { slice::from_raw_parts(blob.pbData, blob.cbData as usize).to_vec() }
    };

    if !blob.pbData.is_null() {
        let freed = unsafe { LocalFree(Some(HLOCAL(blob.pbData.cast()))) };
        blob.pbData = ptr::null_mut();
        blob.cbData = 0;

        if !freed.is_invalid() {
            let last_error = unsafe { GetLastError().0 };
            return Err(format!(
                "LocalFree failed after {context} (GetLastError={last_error})"
            ));
        }
    }

    Ok(bytes)
}

fn dpapi_encrypt(plain: &[u8]) -> Result<Vec<u8>, String> {
    let mut out_blob = CRYPT_INTEGER_BLOB::default();
    let in_blob = CRYPT_INTEGER_BLOB {
        cbData: checked_u32_len(plain.len(), "plaintext")?,
        pbData: plain.as_ptr().cast_mut(),
    };

    unsafe {
        CryptProtectData(
            &in_blob,
            PCWSTR::null(),
            None,
            None,
            None,
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut out_blob,
        )
        .map_err(|err| format_windows_error("CryptProtectData", err))?;
    }

    take_blob_bytes(&mut out_blob, "CryptProtectData")
}

fn dpapi_decrypt(cipher: &[u8]) -> Result<Vec<u8>, String> {
    let mut out_blob = CRYPT_INTEGER_BLOB::default();
    let in_blob = CRYPT_INTEGER_BLOB {
        cbData: checked_u32_len(cipher.len(), "ciphertext")?,
        pbData: cipher.as_ptr().cast_mut(),
    };

    unsafe {
        CryptUnprotectData(
            &in_blob,
            None,
            None,
            None,
            None,
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut out_blob,
        )
        .map_err(|err| format_windows_error("CryptUnprotectData", err))?;
    }

    take_blob_bytes(&mut out_blob, "CryptUnprotectData")
}

fn set_secret_in(base: &Path, name: &str, value: &str) -> Result<(), String> {
    validate_name(name)?;
    let _guard = WRITE_LOCK.lock().unwrap_or_else(|e| e.into_inner());

    let dir = secret_dir(base);
    fs::create_dir_all(&dir).map_err(|err| {
        format!(
            "failed to create secrets directory '{}': {err}",
            dir.display()
        )
    })?;

    let final_path = secret_path(base, name)?;
    let temp_path = dir.join(format!("{name}.bin.tmp"));
    let cipher = dpapi_encrypt(value.as_bytes())?;

    let write_result = (|| -> Result<(), String> {
        {
            let mut file = fs::File::create(&temp_path)
                .map_err(|err| format!("failed to create temp secret file '{}': {err}", temp_path.display()))?;
            file.write_all(&cipher)
                .map_err(|err| format!("failed to write temp secret file '{}': {err}", temp_path.display()))?;
            file.sync_all()
                .map_err(|err| format!("failed to sync temp secret file '{}': {err}", temp_path.display()))?;
        }

        fs::rename(&temp_path, &final_path).map_err(|err| {
            format!(
                "failed to atomically replace secret file '{}' with '{}': {err}",
                final_path.display(),
                temp_path.display()
            )
        })?;

        Ok(())
    })();

    if write_result.is_err() {
        let _ = fs::remove_file(&temp_path);
    }

    write_result
}

fn get_secret_in(base: &Path, name: &str) -> Result<Option<String>, String> {
    let path = secret_path(base, name)?;

    if !path.exists() {
        return Ok(None);
    }

    let cipher = fs::read(&path)
        .map_err(|err| format!("failed to read secret file '{}': {err}", path.display()))?;
    let plain = dpapi_decrypt(&cipher)?;
    let value = String::from_utf8(plain)
        .map_err(|err| format!("secret '{name}' is not valid UTF-8: {err}"))?;

    Ok(Some(value))
}

fn delete_secret_in(base: &Path, name: &str) -> Result<(), String> {
    let _guard = WRITE_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let path = secret_path(base, name)?;

    match fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(err) if err.kind() == ErrorKind::NotFound => Ok(()),
        Err(err) => Err(format!(
            "failed to delete secret file '{}': {err}",
            path.display()
        )),
    }
}

fn app_base_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_local_data_dir()
        .map_err(|err| format!("failed to resolve app local data directory: {err}"))
}

#[tauri::command]
pub fn secret_set(app: tauri::AppHandle, name: String, value: String) -> Result<(), String> {
    let base = app_base_dir(&app)?;
    set_secret_in(&base, &name, &value)
}

#[tauri::command]
pub fn secret_get(app: tauri::AppHandle, name: String) -> Result<Option<String>, String> {
    let base = app_base_dir(&app)?;
    get_secret_in(&base, &name)
}

#[tauri::command]
pub fn secret_delete(app: tauri::AppHandle, name: String) -> Result<(), String> {
    let base = app_base_dir(&app)?;
    delete_secret_in(&base, &name)
}

pub fn load_secret(app: &tauri::AppHandle, name: &str) -> Option<String> {
    let base = app_base_dir(app).ok()?;
    get_secret_in(&base, name).ok().flatten()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;
    use std::process;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};

    static TEST_COUNTER: AtomicU64 = AtomicU64::new(0);

    struct TestDir {
        path: PathBuf,
    }

    impl TestDir {
        fn new(test_name: &str) -> Self {
            let nonce = TEST_COUNTER.fetch_add(1, Ordering::Relaxed);
            let now = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos();

            let path = env::temp_dir()
                .join("g-maiden-secret-tests")
                .join(format!("{test_name}-{}-{nonce}-{now}", process::id()));

            let _ = fs::remove_dir_all(&path);
            fs::create_dir_all(&path).expect("failed to create test temp dir");

            Self { path }
        }

        fn path(&self) -> &Path {
            &self.path
        }
    }

    impl Drop for TestDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    #[test]
    fn validate_name_accepts_expected_values() {
        let accepted = [
            "anthropic_api_key",
            "sb-wsseitulmcgnolgsrxgh-auth-token",
            "sb-x-auth-token-code-verifier",
        ];

        for name in accepted {
            validate_name(name).expect("name should be accepted");
        }
    }

    #[test]
    fn validate_name_rejects_expected_values() {
        let rejected = ["", "..", "a/b", "a\\b", "a.b", "UPPER", "foo bar"];

        for name in rejected {
            assert!(validate_name(name).is_err(), "name should be rejected: {name}");
        }
    }

    #[test]
    fn roundtrip_secret() {
        let tmp = TestDir::new("roundtrip_secret");

        set_secret_in(tmp.path(), "anthropic_api_key", "sk-test-123").expect("set should succeed");

        let got = get_secret_in(tmp.path(), "anthropic_api_key").expect("get should succeed");
        assert_eq!(got, Some("sk-test-123".to_string()));
    }

    #[test]
    fn absent_secret_returns_none() {
        let tmp = TestDir::new("absent_secret_returns_none");

        let got = get_secret_in(tmp.path(), "never_set").expect("get should succeed");
        assert_eq!(got, None);
    }

    #[test]
    fn overwrite_secret_replaces_prior_value() {
        let tmp = TestDir::new("overwrite_secret_replaces_prior_value");

        set_secret_in(tmp.path(), "anthropic_api_key", "first").expect("first set should succeed");
        set_secret_in(tmp.path(), "anthropic_api_key", "second")
            .expect("second set should succeed");

        let got = get_secret_in(tmp.path(), "anthropic_api_key").expect("get should succeed");
        assert_eq!(got, Some("second".to_string()));
    }

    #[test]
    fn delete_secret_is_idempotent() {
        let tmp = TestDir::new("delete_secret_is_idempotent");

        set_secret_in(tmp.path(), "anthropic_api_key", "sk-test-123").expect("set should succeed");
        delete_secret_in(tmp.path(), "anthropic_api_key").expect("delete should succeed");

        let got = get_secret_in(tmp.path(), "anthropic_api_key").expect("get should succeed");
        assert_eq!(got, None);

        delete_secret_in(tmp.path(), "anthropic_api_key").expect("second delete should succeed");
    }

    #[test]
    fn dpapi_roundtrip() {
        let cipher = dpapi_encrypt(b"hello").expect("encrypt should succeed");
        let plain = dpapi_decrypt(&cipher).expect("decrypt should succeed");
        assert_eq!(plain, b"hello");
    }
}

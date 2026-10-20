//! DPAPI-backed per-user secret storage for Windows.
//!
//! Ciphertext is tied to the current Windows user account. This protects
//! against file-copy, other-user, or cloud-sync exfiltration, but it does not
//! protect against malware already running as the same user.

use std::env;
use std::ffi::{OsStr, OsString};
use std::fs;
use std::io::{ErrorKind, Write};
use std::path::{Component, Path, PathBuf};
use std::ptr;
use std::slice;
use std::sync::Mutex;

use tauri::Manager;
use windows::core::{Error as WindowsError, PCWSTR};
use windows::Win32::Foundation::{GetLastError, LocalFree, HLOCAL};
use windows::Win32::Security::Cryptography::{
    CryptProtectData, CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
};

static WRITE_LOCK: Mutex<()> = Mutex::new(());

const MVP009_ISOLATED_SMOKE_ARG: &str = "--mvp009-isolated-smoke";
const MVP009_ISOLATION_ROOT_ENV: &str = "MVP009_ISOLATION_ROOT";
const MVP009_TEMP_PARENT_ENV: &str = "MVP009_TEMP_PARENT";
const MVP009_NORMAL_PROFILE_ENV: &str = "MVP009_NORMAL_USER_PROFILE";
const MVP009_NORMAL_LOCAL_APP_DATA_ENV: &str = "MVP009_NORMAL_LOCALAPPDATA";

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
    ensure_regular_secret_file(&final_path)?;
    ensure_regular_secret_file(&temp_path)?;
    if temp_path.exists() {
        fs::remove_file(&temp_path).map_err(|err| {
            format!(
                "failed to remove stale temp secret file '{}': {err}",
                temp_path.display()
            )
        })?;
    }
    let cipher = dpapi_encrypt(value.as_bytes())?;

    let mut temp_created = false;
    let write_result = (|| -> Result<(), String> {
        {
            let mut file = fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&temp_path)
                .map_err(|err| format!("failed to create temp secret file '{}': {err}", temp_path.display()))?;
            temp_created = true;
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

    if write_result.is_err() && temp_created {
        let _ = fs::remove_file(&temp_path);
    }

    write_result
}

fn get_secret_in(base: &Path, name: &str) -> Result<Option<String>, String> {
    let path = secret_path(base, name)?;
    ensure_regular_secret_file(&path)?;

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
    ensure_regular_secret_file(&path)?;

    match fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(err) if err.kind() == ErrorKind::NotFound => Ok(()),
        Err(err) => Err(format!(
            "failed to delete secret file '{}': {err}",
            path.display()
        )),
    }
}

struct SmokeIsolationEnvironment<'a> {
    root: Option<&'a OsStr>,
    temp_parent: Option<&'a OsStr>,
    normal_profile: Option<&'a OsStr>,
    normal_local_app_data: Option<&'a OsStr>,
}

fn required_existing_directory(value: Option<&OsStr>, name: &str) -> Result<PathBuf, String> {
    let raw = value.ok_or_else(|| format!("{name} is required for isolated smoke mode"))?;
    let path = PathBuf::from(raw);
    if !path.is_absolute() {
        return Err(format!("{name} must be an absolute directory"));
    }

    let canonical = fs::canonicalize(&path)
        .map_err(|err| format!("failed to resolve {name} '{}': {err}", path.display()))?;
    if !canonical.is_dir() {
        return Err(format!("{name} must point to an existing directory"));
    }

    Ok(canonical)
}

fn is_mvp009_run_root_name(name: &OsStr) -> bool {
    let Some(name) = name.to_str() else {
        return false;
    };
    let Some(uuid) = name.strip_prefix("gmaiden-mvp009-") else {
        return false;
    };
    if uuid.len() != 36 {
        return false;
    }

    uuid.bytes().enumerate().all(|(index, byte)| {
        if matches!(index, 8 | 13 | 18 | 23) {
            byte == b'-'
        } else {
            byte.is_ascii_digit() || matches!(byte, b'a'..=b'f')
        }
    })
}

fn ensure_real_child_directory(path: &Path, parent: &Path) -> Result<(), String> {
    match fs::symlink_metadata(path) {
        Ok(metadata) => {
            if is_reparse_point(&metadata) || !metadata.is_dir() {
                return Err(format!(
                    "isolated storage path '{}' must be a real directory",
                    path.display()
                ));
            }
            let canonical = fs::canonicalize(path).map_err(|err| {
                format!(
                    "failed to resolve isolated storage path '{}': {err}",
                    path.display()
                )
            })?;
            if canonical.parent() != Some(parent) {
                return Err(format!(
                    "isolated storage path '{}' escapes its run root",
                    path.display()
                ));
            }
            Ok(())
        }
        Err(err) if err.kind() == ErrorKind::NotFound => Ok(()),
        Err(err) => Err(format!(
            "failed to inspect isolated storage path '{}': {err}",
            path.display()
        )),
    }
}

fn ensure_regular_secret_file(path: &Path) -> Result<(), String> {
    match fs::symlink_metadata(path) {
        Ok(metadata) => {
            if is_reparse_point(&metadata) || !metadata.is_file() {
                return Err(format!(
                    "secret storage path '{}' must be a regular file",
                    path.display()
                ));
            }
            Ok(())
        }
        Err(err) if err.kind() == ErrorKind::NotFound => Ok(()),
        Err(err) => Err(format!(
            "failed to inspect secret storage path '{}': {err}",
            path.display()
        )),
    }
}

fn is_reparse_point(metadata: &fs::Metadata) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x0400;
        metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0
    }
    #[cfg(not(windows))]
    {
        metadata.file_type().is_symlink()
    }
}

fn isolated_app_base_dir(
    args: &[OsString],
    environment: SmokeIsolationEnvironment<'_>,
    identifier: &str,
) -> Result<Option<PathBuf>, String> {
    if !args
        .iter()
        .any(|arg| arg.as_os_str() == OsStr::new(MVP009_ISOLATED_SMOKE_ARG))
    {
        return Ok(None);
    }

    let isolation_root = required_existing_directory(environment.root, MVP009_ISOLATION_ROOT_ENV)?;
    let temp_parent = required_existing_directory(environment.temp_parent, MVP009_TEMP_PARENT_ENV)?;
    let normal_profile =
        required_existing_directory(environment.normal_profile, MVP009_NORMAL_PROFILE_ENV)?;
    let normal_local_app_data = required_existing_directory(
        environment.normal_local_app_data,
        MVP009_NORMAL_LOCAL_APP_DATA_ENV,
    )?;
    let root_name = isolation_root
        .file_name()
        .ok_or_else(|| format!("{MVP009_ISOLATION_ROOT_ENV} has no directory name"))?;
    if isolation_root.parent() != Some(temp_parent.as_path()) || !is_mvp009_run_root_name(root_name)
    {
        return Err(format!(
            "{MVP009_ISOLATION_ROOT_ENV} must be a UUID run root directly inside {MVP009_TEMP_PARENT_ENV}"
        ));
    }
    if isolation_root.starts_with(&normal_profile)
        || normal_profile.starts_with(&isolation_root)
        || isolation_root.starts_with(&normal_local_app_data)
        || normal_local_app_data.starts_with(&isolation_root)
    {
        return Err("isolated smoke paths overlap a normal user data directory".to_string());
    }

    let identifier_path = Path::new(identifier);
    if identifier_path.components().count() != 1
        || !matches!(
            identifier_path.components().next(),
            Some(Component::Normal(_))
        )
    {
        return Err("application identifier must be a single path component".to_string());
    }

    let app_local_data = isolation_root.join("app-local-data");
    ensure_real_child_directory(&app_local_data, &isolation_root)?;
    let app_base = app_local_data.join(identifier_path);
    ensure_real_child_directory(&app_base, &app_local_data)?;
    let app_secrets = secret_dir(&app_base);
    ensure_real_child_directory(&app_secrets, &app_base)?;

    Ok(Some(app_base))
}

fn app_base_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let args: Vec<OsString> = env::args_os().collect();
    let isolation_root = env::var_os(MVP009_ISOLATION_ROOT_ENV);
    let temp_parent = env::var_os(MVP009_TEMP_PARENT_ENV);
    let normal_profile = env::var_os(MVP009_NORMAL_PROFILE_ENV);
    let normal_local_app_data = env::var_os(MVP009_NORMAL_LOCAL_APP_DATA_ENV);
    // Tauri resolves app_local_data_dir through Windows Known Folders, which ignores LOCALAPPDATA overrides.
    if let Some(path) = isolated_app_base_dir(
        &args,
        SmokeIsolationEnvironment {
            root: isolation_root.as_deref(),
            temp_parent: temp_parent.as_deref(),
            normal_profile: normal_profile.as_deref(),
            normal_local_app_data: normal_local_app_data.as_deref(),
        },
        app.config().identifier.as_str(),
    )? {
        return Ok(path);
    }

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

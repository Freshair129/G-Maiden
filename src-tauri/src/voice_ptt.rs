use serde::Serialize;
use std::str::FromStr;
use tauri_plugin_global_shortcut::Shortcut;

pub const DEFAULT_SHORTCUT: &str = "Ctrl+Alt+V";
pub const RESERVED_SHORTCUTS: [&str; 4] = ["Ctrl+Alt+S", "Alt+Up", "Alt+Down", "Alt+M"];

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PttError {
    InvalidAccelerator,
    ReservedConflict,
    RegistrationFailed,
    SettingsWriteFailed,
}

impl PttError {
    pub fn code(self) -> &'static str {
        match self {
            Self::InvalidAccelerator => "invalid_accelerator",
            Self::ReservedConflict => "reserved_conflict",
            Self::RegistrationFailed => "registration_failed",
            Self::SettingsWriteFailed => "settings_write_failed",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Accelerator {
    canonical: String,
    shortcut: Shortcut,
}

impl Accelerator {
    pub fn as_str(&self) -> &str {
        &self.canonical
    }

    pub fn shortcut(&self) -> Shortcut {
        self.shortcut
    }
}

pub fn validate_accelerator(raw: &str) -> Result<Accelerator, PttError> {
    let tokens = raw.split('+').map(str::trim).collect::<Vec<_>>();
    if !(2..=4).contains(&tokens.len()) || tokens.iter().any(|token| token.is_empty()) {
        return Err(PttError::InvalidAccelerator);
    }

    let mut ctrl = false;
    let mut alt = false;
    let mut shift = false;
    for modifier in &tokens[..tokens.len() - 1] {
        match modifier.to_ascii_lowercase().as_str() {
            "ctrl" | "control" if !ctrl => ctrl = true,
            "alt" if !alt => alt = true,
            "shift" if !shift => shift = true,
            _ => return Err(PttError::InvalidAccelerator),
        }
    }
    if !(ctrl || alt) {
        return Err(PttError::InvalidAccelerator);
    }

    let key = tokens[tokens.len() - 1];
    let normalized_key = key.to_ascii_uppercase();
    let reserved_key = match normalized_key.as_str() {
        "UP" => "Up",
        "DOWN" => "Down",
        _ => normalized_key.as_str(),
    };
    let mut candidate_parts = Vec::with_capacity(4);
    if ctrl {
        candidate_parts.push("Ctrl");
    }
    if alt {
        candidate_parts.push("Alt");
    }
    if shift {
        candidate_parts.push("Shift");
    }
    candidate_parts.push(reserved_key);
    let canonical = candidate_parts.join("+");
    if RESERVED_SHORTCUTS.contains(&canonical.as_str()) {
        return Err(PttError::ReservedConflict);
    }
    let valid_function_key = normalized_key
        .strip_prefix('F')
        .and_then(|number| number.parse::<u8>().ok())
        .is_some_and(|number| (1..=12).contains(&number) && normalized_key == format!("F{number}"));
    let valid_key =
        (key.len() == 1 && key.as_bytes()[0].is_ascii_alphanumeric()) || valid_function_key;
    if !valid_key {
        return Err(PttError::InvalidAccelerator);
    }

    let shortcut = Shortcut::from_str(&canonical).map_err(|_| PttError::InvalidAccelerator)?;
    Ok(Accelerator {
        canonical,
        shortcut,
    })
}

pub fn read_shortcut_from_settings(json: Option<&str>) -> Accelerator {
    json.and_then(stored_shortcut)
        .unwrap_or_else(default_accelerator)
}

pub fn preserve_shortcut_setting(
    existing: Option<&str>,
    incoming: &str,
) -> Result<String, PttError> {
    let Some(shortcut) = existing.and_then(stored_shortcut) else {
        return Ok(incoming.to_owned());
    };

    let incoming_value = serde_json::from_str::<serde_json::Value>(incoming)
        .map_err(|_| PttError::SettingsWriteFailed)?;
    let root = incoming_value
        .as_object()
        .ok_or(PttError::SettingsWriteFailed)?;
    let Some(voice) = root.get("voice") else {
        let trimmed = incoming.trim();
        let prefix = trimmed
            .strip_suffix('}')
            .ok_or(PttError::SettingsWriteFailed)?;
        let shortcut_json =
            serde_json::to_string(shortcut.as_str()).map_err(|_| PttError::SettingsWriteFailed)?;
        let comma = if root.is_empty() { "" } else { "," };
        let mut merged = String::with_capacity(trimmed.len() + shortcut_json.len() + 34);
        merged.push_str(prefix);
        merged.push_str(comma);
        merged.push_str("\"voice\":{\"pttShortcut\":");
        merged.push_str(&shortcut_json);
        merged.push_str("}}");
        serde_json::from_str::<serde_json::Value>(&merged)
            .map_err(|_| PttError::SettingsWriteFailed)?;
        return Ok(merged);
    };

    if voice
        .as_object()
        .and_then(|voice| voice.get("pttShortcut"))
        .and_then(serde_json::Value::as_str)
        == Some(shortcut.as_str())
    {
        return Ok(incoming.to_owned());
    }

    write_shortcut_to_settings(Some(incoming), &shortcut)
}

fn stored_shortcut(json: &str) -> Option<Accelerator> {
    serde_json::from_str::<serde_json::Value>(json)
        .ok()?
        .get("voice")?
        .get("pttShortcut")?
        .as_str()
        .and_then(|shortcut| validate_accelerator(shortcut).ok())
}

fn default_accelerator() -> Accelerator {
    validate_accelerator(DEFAULT_SHORTCUT).expect("the default PTT shortcut is valid")
}

pub fn write_shortcut_to_settings(
    existing: Option<&str>,
    shortcut: &Accelerator,
) -> Result<String, PttError> {
    let mut settings = match existing {
        Some(json) => serde_json::from_str::<serde_json::Value>(json)
            .map_err(|_| PttError::SettingsWriteFailed)?,
        None => serde_json::json!({}),
    };
    let root = settings
        .as_object_mut()
        .ok_or(PttError::SettingsWriteFailed)?;
    let voice = root
        .entry("voice")
        .or_insert_with(|| serde_json::json!({}))
        .as_object_mut()
        .ok_or(PttError::SettingsWriteFailed)?;
    voice.insert(
        "pttShortcut".to_owned(),
        serde_json::Value::String(shortcut.as_str().to_owned()),
    );
    serde_json::to_string(&settings).map_err(|_| PttError::SettingsWriteFailed)
}

pub trait ShortcutRegistrar {
    fn register(&mut self, shortcut: &Accelerator) -> Result<(), RegistrationError>;
    fn unregister(&mut self, shortcut: &Accelerator) -> Result<(), RegistrationError>;
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct RegistrationError;

pub struct PttBinding {
    pub accelerator: Accelerator,
    pub registered: bool,
    pub error_code: Option<PttError>,
}

#[derive(Serialize)]
pub struct PttStatus {
    pub accelerator: String,
    pub registered: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_code: Option<String>,
}

impl PttBinding {
    pub fn status(&self) -> PttStatus {
        PttStatus {
            accelerator: self.accelerator.as_str().to_owned(),
            registered: self.registered,
            error_code: self.error_code.map(|error| error.code().to_owned()),
        }
    }
}

pub fn register_startup<R: ShortcutRegistrar>(
    registrar: &mut R,
    configured: Option<&str>,
) -> PttBinding {
    let accelerator = configured
        .and_then(|raw| validate_accelerator(raw).ok())
        .unwrap_or_else(|| {
            validate_accelerator(DEFAULT_SHORTCUT).expect("the default PTT shortcut is valid")
        });
    match registrar.register(&accelerator) {
        Ok(()) => PttBinding {
            accelerator,
            registered: true,
            error_code: None,
        },
        Err(_) => PttBinding {
            accelerator,
            registered: false,
            error_code: Some(PttError::RegistrationFailed),
        },
    }
}

pub fn remap_with<R, W>(
    registrar: &mut R,
    binding: &mut PttBinding,
    raw: &str,
    persist: W,
) -> Result<String, PttError>
where
    R: ShortcutRegistrar,
    W: FnOnce(&str) -> Result<(), PttError>,
{
    let next = match validate_accelerator(raw) {
        Ok(next) => next,
        Err(error) => {
            binding.error_code = Some(error);
            return Err(error);
        }
    };
    let previous = binding.accelerator.clone();
    let was_registered = binding.registered;
    let same_shortcut = next == previous;

    if (!same_shortcut || !was_registered) && registrar.register(&next).is_err() {
        binding.error_code = Some(PttError::RegistrationFailed);
        return Err(PttError::RegistrationFailed);
    }
    if was_registered && !same_shortcut && registrar.unregister(&previous).is_err() {
        let _ = registrar.unregister(&next);
        binding.error_code = Some(PttError::RegistrationFailed);
        return Err(PttError::RegistrationFailed);
    }
    if let Err(error) = persist(next.as_str()) {
        if !same_shortcut || !was_registered {
            let _ = registrar.unregister(&next);
        }
        if was_registered && !same_shortcut && registrar.register(&previous).is_err() {
            binding.registered = false;
            binding.error_code = Some(PttError::RegistrationFailed);
        } else {
            binding.error_code = Some(error);
        }
        return Err(error);
    }

    binding.accelerator = next.clone();
    binding.registered = true;
    binding.error_code = None;
    Ok(next.as_str().to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    #[test]
    fn ptt_accepts_valid_accelerators() {
        for (input, expected) in [
            ("Ctrl+Alt+V", "Ctrl+Alt+V"),
            ("Ctrl+Shift+F9", "Ctrl+Shift+F9"),
        ] {
            assert_eq!(validate_accelerator(input).unwrap().as_str(), expected);
        }
    }

    #[test]
    fn ptt_rejects_invalid_and_reserved() {
        assert_eq!(
            validate_accelerator("V").unwrap_err().code(),
            "invalid_accelerator"
        );
        assert_eq!(
            validate_accelerator("Win+V").unwrap_err().code(),
            "invalid_accelerator"
        );
        assert_eq!(
            validate_accelerator("Alt+M").unwrap_err().code(),
            "reserved_conflict"
        );
        for reserved in ["Ctrl+Alt+S", "Alt+Up", "Alt+Down"] {
            assert_eq!(
                validate_accelerator(reserved).unwrap_err().code(),
                "reserved_conflict"
            );
        }
        assert_eq!(
            validate_accelerator("not a shortcut").unwrap_err().code(),
            "invalid_accelerator"
        );
    }

    #[test]
    fn ptt_settings_default_and_preserve_other_keys() {
        assert_eq!(read_shortcut_from_settings(None).as_str(), "Ctrl+Alt+V");
        assert_eq!(
            read_shortcut_from_settings(Some("{broken")).as_str(),
            "Ctrl+Alt+V"
        );
        assert_eq!(
            read_shortcut_from_settings(Some(r#"{"voice":{"pttShortcut":"Alt+M"}}"#)).as_str(),
            "Ctrl+Alt+V"
        );
        assert_eq!(
            read_shortcut_from_settings(Some(r#"{"voice":{"pttShortcut":"Ctrl+Shift+F9"}}"#))
                .as_str(),
            "Ctrl+Shift+F9"
        );

        let original = r#"{"volume":63,"voice":{"voiceName":"Aria"},"other":{"keep":true}}"#;
        let shortcut = validate_accelerator("Ctrl+Shift+F9").unwrap();
        let updated = write_shortcut_to_settings(Some(original), &shortcut).unwrap();
        let parsed: Value = serde_json::from_str(&updated).unwrap();
        assert_eq!(parsed["voice"]["pttShortcut"], "Ctrl+Shift+F9");
        assert_eq!(parsed["voice"]["voiceName"], "Aria");
        assert_eq!(parsed["volume"], 63);
        assert_eq!(parsed["other"]["keep"], true);
    }

    #[test]
    fn ptt_generic_settings_save_preserves_binding() {
        let existing = r#"{"voice":{"pttShortcut":"Ctrl+Shift+F9"}}"#;
        let incoming = r#"{"volume":41,"voiceName":"Aria"}"#;

        let merged = preserve_shortcut_setting(Some(existing), incoming).unwrap();
        let parsed: Value = serde_json::from_str(&merged).unwrap();

        assert_eq!(parsed["voice"]["pttShortcut"], "Ctrl+Shift+F9");
        assert_eq!(parsed["volume"], 41);
        assert_eq!(parsed["voiceName"], "Aria");
    }

    #[test]
    fn ptt_generic_settings_save_preserves_order_without_voice_object() {
        let existing = r#"{"voice":{"pttShortcut":"Ctrl+Shift+F9"}}"#;
        let incoming = r#"{"volume":41, "voiceName":"Aria"}"#;

        let merged = preserve_shortcut_setting(Some(existing), incoming).unwrap();

        assert_eq!(
            merged,
            r#"{"volume":41, "voiceName":"Aria","voice":{"pttShortcut":"Ctrl+Shift+F9"}}"#
        );
    }

    #[test]
    fn ptt_generic_settings_save_adds_voice_to_empty_object() {
        let existing = r#"{"voice":{"pttShortcut":"Ctrl+Shift+F9"}}"#;

        let merged = preserve_shortcut_setting(Some(existing), "{}").unwrap();

        assert_eq!(merged, r#"{"voice":{"pttShortcut":"Ctrl+Shift+F9"}}"#);
    }

    #[test]
    fn ptt_generic_settings_save_passes_through_identical_shortcut() {
        let existing = r#"{"voice":{"pttShortcut":"Ctrl+Shift+F9"}}"#;
        let incoming = r#"{"volume":41,"voice":{"pttShortcut":"Ctrl+Shift+F9"},"extra":true}"#;

        let merged = preserve_shortcut_setting(Some(existing), incoming).unwrap();

        assert_eq!(merged, incoming);
    }

    #[test]
    fn ptt_generic_settings_rewrites_different_voice_shortcut() {
        let existing = r#"{"voice":{"pttShortcut":"Ctrl+Shift+F9"}}"#;
        let incoming =
            r#"{"zeta":7,"voice":{"voiceName":"Aria","pttShortcut":"Ctrl+Alt+Q"},"alpha":1}"#;

        let merged = preserve_shortcut_setting(Some(existing), incoming).unwrap();

        assert_eq!(
            merged,
            r#"{"alpha":1,"voice":{"pttShortcut":"Ctrl+Shift+F9","voiceName":"Aria"},"zeta":7}"#
        );
    }

    #[test]
    fn ptt_generic_settings_save_returns_settings_write_error_for_non_object() {
        let existing = r#"{"voice":{"pttShortcut":"Ctrl+Shift+F9"}}"#;

        let error = preserve_shortcut_setting(Some(existing), "[]").unwrap_err();

        assert_eq!(error.code(), "settings_write_failed");
    }

    #[test]
    fn ptt_remap_registers_before_unregistering_and_persists() {
        let mut registrar = FakeRegistrar::default();
        let mut binding = register_startup(&mut registrar, None);
        let mut persisted = Some(r#"{"volume":63}"#.to_owned());

        let result = remap_with(&mut registrar, &mut binding, "Ctrl+Shift+F9", |shortcut| {
            let accelerator = validate_accelerator(shortcut)?;
            persisted = Some(write_shortcut_to_settings(
                persisted.as_deref(),
                &accelerator,
            )?);
            Ok(())
        });

        assert_eq!(result.unwrap(), "Ctrl+Shift+F9");
        assert_eq!(
            registrar.operations,
            vec![
                "register:Ctrl+Alt+V".to_owned(),
                "register:Ctrl+Shift+F9".to_owned(),
                "unregister:Ctrl+Alt+V".to_owned()
            ]
        );
        let persisted: Value = serde_json::from_str(persisted.as_deref().unwrap()).unwrap();
        assert_eq!(persisted["voice"]["pttShortcut"], "Ctrl+Shift+F9");
        assert_eq!(persisted["volume"], 63);
        assert_eq!(binding.accelerator.as_str(), "Ctrl+Shift+F9");
        assert!(binding.registered);
    }

    #[test]
    fn ptt_remap_is_atomic_on_registration_failure() {
        let mut registrar = FakeRegistrar::default();
        let mut binding = register_startup(&mut registrar, None);
        let mut writes = 0;
        registrar.fail_next_register = true;

        let result = remap_with(&mut registrar, &mut binding, "Ctrl+Shift+F9", |_| {
            writes += 1;
            Ok(())
        });

        assert_eq!(result.unwrap_err().code(), "registration_failed");
        assert_eq!(binding.accelerator.as_str(), "Ctrl+Alt+V");
        assert!(binding.registered);
        assert_eq!(registrar.registered, vec!["Ctrl+Alt+V".to_owned()]);
        assert_eq!(writes, 0);
    }

    #[test]
    fn ptt_startup_registration_failure_reports_status() {
        let mut registrar = FakeRegistrar {
            fail_next_register: true,
            ..FakeRegistrar::default()
        };

        let binding = register_startup(&mut registrar, None);

        assert_eq!(binding.accelerator.as_str(), "Ctrl+Alt+V");
        assert!(!binding.registered);
        assert_eq!(
            binding.error_code.as_ref().map(|error| error.code()),
            Some("registration_failed")
        );
        assert_eq!(
            serde_json::to_value(binding.status()).unwrap()["error_code"],
            "registration_failed"
        );
        assert!(registrar.registered.is_empty());
    }

    #[derive(Default)]
    struct FakeRegistrar {
        registered: Vec<String>,
        operations: Vec<String>,
        fail_next_register: bool,
    }

    impl ShortcutRegistrar for FakeRegistrar {
        fn register(&mut self, shortcut: &Accelerator) -> Result<(), RegistrationError> {
            self.operations
                .push(format!("register:{}", shortcut.as_str()));
            if self.fail_next_register {
                self.fail_next_register = false;
                return Err(RegistrationError);
            }
            if !self
                .registered
                .iter()
                .any(|value| value == shortcut.as_str())
            {
                self.registered.push(shortcut.as_str().to_owned());
            }
            Ok(())
        }

        fn unregister(&mut self, shortcut: &Accelerator) -> Result<(), RegistrationError> {
            self.operations
                .push(format!("unregister:{}", shortcut.as_str()));
            self.registered.retain(|value| value != shortcut.as_str());
            Ok(())
        }
    }
}

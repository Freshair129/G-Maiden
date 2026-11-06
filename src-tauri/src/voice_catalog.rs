//! Installed classic SAPI voice metadata. No voice engine or audio device is created.

use super::Voice;

const MAX_TOKENS: u32 = 256;
const MAX_ATTRIBUTE_UNITS: usize = 1024;

#[derive(Default)]
struct Attributes {
    name: Option<String>,
    default_name: Option<String>,
    language: Option<String>,
    gender: Option<String>,
    age: Option<String>,
}

trait Catalog {
    fn count(&mut self) -> Option<u32>;
    fn token(&mut self, index: u32) -> Option<Attributes>;
    fn locale_name(&self, lcid: u32) -> Option<String>;
}

fn language_lcid(value: &str) -> Option<u32> {
    if value.encode_utf16().count() > MAX_ATTRIBUTE_UNITS {
        return None;
    }
    let first = value.split(';').next()?.trim();
    if first.is_empty() || !first.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return None;
    }
    i32::from_str_radix(first, 16).ok().map(|lcid| lcid as u32)
}

fn gender_name(value: &str) -> &'static str {
    match value.to_ascii_lowercase().as_str() {
        "female" => "Female",
        "male" => "Male",
        "neutral" => "Neutral",
        _ => "NotSet",
    }
}

fn age_name(value: &str) -> &'static str {
    match value.to_ascii_lowercase().as_str() {
        "child" => "Child",
        "teen" | "teenager" => "Teen",
        "adult" => "Adult",
        "senior" | "elder" => "Senior",
        _ => match value.trim().parse::<i32>() {
            Ok(age) if age <= 12 => "Child",
            Ok(age) if age <= 22 => "Teen",
            Ok(age) if age <= 47 => "Adult",
            Ok(_) => "Senior",
            Err(_) => "NotSet",
        },
    }
}

fn collect(catalog: &mut impl Catalog) -> Vec<Voice> {
    let mut voices = Vec::new();
    for index in 0..catalog.count().unwrap_or(0).min(MAX_TOKENS) {
        let Some(attributes) = catalog.token(index) else {
            continue;
        };
        // VoiceInfo.TokenName uses the default token string only for missing or
        // empty Name, then the former pipe parser trimmed all returned fields.
        let Some(name) = attributes
            .name
            .filter(|name| !name.is_empty())
            .or(attributes.default_name)
        else {
            continue;
        };
        if name.encode_utf16().count() > MAX_ATTRIBUTE_UNITS || name.trim().is_empty() {
            continue;
        }
        let culture = attributes
            .language
            .as_deref()
            .and_then(language_lcid)
            .and_then(|lcid| catalog.locale_name(lcid))
            .unwrap_or_default();
        voices.push(Voice {
            name: name.trim().into(),
            culture: culture.trim().into(),
            gender: gender_name(attributes.gender.as_deref().unwrap_or("")).into(),
            age: age_name(attributes.age.as_deref().unwrap_or("")).into(),
        });
    }
    voices
}

pub(super) fn list_voices() -> Vec<Voice> {
    // Serialize only catalog readers; never take CURRENT or any audio lock.
    static ENUMERATION: std::sync::Mutex<()> = std::sync::Mutex::new(());
    let Ok(_enumeration) = ENUMERATION.lock() else {
        return Vec::new();
    };
    std::thread::Builder::new()
        .name("g-voice-catalog".into())
        .spawn(native::enumerate)
        .ok()
        .and_then(|worker| worker.join().ok())
        .unwrap_or_default()
}

#[cfg(windows)]
mod native {
    use super::*;
    use windows::core::{w, PCWSTR, PWSTR};
    use windows::Win32::Globalization::{LCIDToLocaleName, LOCALE_ALLOW_NEUTRAL_NAMES};
    use windows::Win32::Media::Speech::{
        IEnumSpObjectTokens, ISpDataKey, ISpObjectTokenCategory, SpObjectTokenCategory,
        SPCAT_VOICES,
    };
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, CLSCTX_INPROC_SERVER,
        COINIT_MULTITHREADED,
    };

    struct Apartment;
    impl Drop for Apartment {
        fn drop(&mut self) {
            unsafe {
                CoUninitialize();
            }
        }
    }

    struct ComString(PWSTR);
    impl Drop for ComString {
        fn drop(&mut self) {
            unsafe {
                CoTaskMemFree(Some(self.0.as_ptr().cast()));
            }
        }
    }

    fn read_string(key: &ISpDataKey, name: PCWSTR) -> Result<Option<String>, ()> {
        let value = match unsafe { key.GetStringValue(name) } {
            Ok(value) => ComString(value),
            Err(_) => return Ok(None),
        };
        if value.0.is_null() {
            return Ok(None);
        }
        let mut units = Vec::new();
        for index in 0..=MAX_ATTRIBUTE_UNITS {
            let unit = unsafe { *value.0.as_ptr().add(index) };
            if unit == 0 {
                return String::from_utf16(&units).map(Some).map_err(|_| ());
            }
            if index == MAX_ATTRIBUTE_UNITS {
                return Err(());
            }
            units.push(unit);
        }
        Err(())
    }

    struct Tokens(IEnumSpObjectTokens);
    impl Catalog for Tokens {
        fn count(&mut self) -> Option<u32> {
            let mut count = 0;
            unsafe {
                self.0.GetCount(&mut count).ok()?;
            }
            Some(count)
        }
        fn token(&mut self, index: u32) -> Option<Attributes> {
            let token = unsafe { self.0.Item(index).ok()? };
            let attributes = unsafe { token.OpenKey(w!("Attributes")).ok()? };
            let name = read_string(&attributes, w!("Name")).ok()?;
            let default_name = if name.as_deref().is_none_or(str::is_empty) {
                read_string(&token, PCWSTR::null()).ok()?
            } else {
                None
            };
            Some(Attributes {
                name,
                default_name,
                language: read_string(&attributes, w!("Language")).ok().flatten(),
                gender: read_string(&attributes, w!("Gender")).ok().flatten(),
                age: read_string(&attributes, w!("Age")).ok().flatten(),
            })
        }
        fn locale_name(&self, lcid: u32) -> Option<String> {
            let mut name = [0u16; 85];
            let written =
                unsafe { LCIDToLocaleName(lcid, Some(&mut name), LOCALE_ALLOW_NEUTRAL_NAMES) };
            if written <= 0 {
                return None;
            }
            String::from_utf16(&name[..written as usize - 1]).ok()
        }
    }

    pub(super) fn enumerate() -> Vec<Voice> {
        if unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) }.is_err() {
            return Vec::new();
        }
        let _apartment = Apartment;
        let category: ISpObjectTokenCategory =
            match unsafe { CoCreateInstance(&SpObjectTokenCategory, None, CLSCTX_INPROC_SERVER) } {
                Ok(category) => category,
                Err(_) => return Vec::new(),
            };
        // Match classic System.Speech's category enumeration. HKCU default-voice
        // preferences do not authorize a second/OneCore catalog union here.
        if unsafe { category.SetId(SPCAT_VOICES, false) }.is_err() {
            return Vec::new();
        }
        let Ok(tokens) = (unsafe { category.EnumTokens(PCWSTR::null(), PCWSTR::null()) }) else {
            return Vec::new();
        };
        // A tail-expression temporary can outlive locals in Rust 2021. Keep
        // every COM interface named so Release precedes CoUninitialize.
        let mut tokens = Tokens(tokens);
        collect(&mut tokens)
    }
}

#[cfg(not(windows))]
mod native {
    pub(super) fn enumerate() -> Vec<super::Voice> {
        Vec::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;

    struct FakeCatalog {
        count: Option<u32>,
        requested: Cell<u32>,
        fail_first: bool,
        attributes: fn() -> Attributes,
    }

    impl Catalog for FakeCatalog {
        fn count(&mut self) -> Option<u32> {
            self.count
        }
        fn token(&mut self, index: u32) -> Option<Attributes> {
            self.requested.set(self.requested.get() + 1);
            if index == 0 && self.fail_first {
                None
            } else {
                Some((self.attributes)())
            }
        }
        fn locale_name(&self, lcid: u32) -> Option<String> {
            match lcid {
                0x409 => Some("en-US".into()),
                0x41e => Some("th-TH".into()),
                _ => None,
            }
        }
    }

    fn installed() -> Attributes {
        Attributes {
            name: Some("Microsoft David Desktop".into()),
            default_name: Some("localized description".into()),
            language: Some("409".into()),
            gender: Some("Male".into()),
            age: Some("Adult".into()),
        }
    }

    fn fake(attributes: fn() -> Attributes) -> FakeCatalog {
        FakeCatalog {
            count: Some(1),
            requested: Cell::new(0),
            fail_first: false,
            attributes,
        }
    }

    fn fields(voice: &Voice) -> (&str, &str, &str, &str) {
        (&voice.name, &voice.culture, &voice.gender, &voice.age)
    }

    #[test]
    fn language_uses_only_first_trimmed_hex_lcid() {
        for (value, expected) in [
            ("409", Some(0x409)),
            (" 041E ;409", Some(0x41e)),
            (";409", None),
            ("invalid;409", None),
            ("0x409", None),
            ("", None),
            ("FFFFFFFF", None),
            ("80000000", None),
        ] {
            assert_eq!(language_lcid(value), expected, "{value:?}");
        }
    }

    #[test]
    fn gender_matches_dotnet_case_folding_without_trimming_unknowns() {
        for (value, expected) in [
            ("MALE", "Male"),
            ("female", "Female"),
            ("Neutral", "Neutral"),
            (" female ", "NotSet"),
            ("other", "NotSet"),
            ("", "NotSet"),
        ] {
            assert_eq!(gender_name(value), expected);
        }
    }

    #[test]
    fn age_preserves_dotnet_aliases_and_numeric_midpoint_buckets() {
        for (value, expected) in [
            ("child", "Child"),
            ("Teenager", "Teen"),
            ("TEEN", "Teen"),
            ("Adult", "Adult"),
            ("elder", "Senior"),
            ("Senior", "Senior"),
            ("12", "Child"),
            ("13", "Teen"),
            ("22", "Teen"),
            ("23", "Adult"),
            ("47", "Adult"),
            ("48", "Senior"),
            (" -1 ", "Child"),
            (" adult ", "NotSet"),
            ("unknown", "NotSet"),
            ("2147483648", "NotSet"),
        ] {
            assert_eq!(age_name(value), expected, "{value:?}");
        }
    }

    #[test]
    fn catalog_returns_ui_fields_without_description_substitution() {
        let voices = collect(&mut fake(installed));
        assert_eq!(voices.len(), 1);
        assert_eq!(
            fields(&voices[0]),
            ("Microsoft David Desktop", "en-US", "Male", "Adult")
        );
    }

    #[test]
    fn missing_or_empty_name_uses_default_token_string() {
        for maker in [
            || Attributes {
                name: None,
                default_name: Some(" fallback ".into()),
                ..Default::default()
            },
            || Attributes {
                name: Some(String::new()),
                default_name: Some(" fallback ".into()),
                ..Default::default()
            },
        ] {
            let voices = collect(&mut fake(maker));
            assert_eq!(voices.len(), 1);
            assert_eq!(fields(&voices[0]), ("fallback", "", "NotSet", "NotSet"));
        }
    }

    #[test]
    fn whitespace_name_is_omitted_instead_of_fabricating_description() {
        let voices = collect(&mut fake(|| Attributes {
            name: Some("  ".into()),
            default_name: Some("not selected".into()),
            ..Default::default()
        }));
        assert!(voices.is_empty());
    }

    #[test]
    fn unknown_locale_remains_empty_and_keeps_other_metadata() {
        let voices = collect(&mut fake(|| Attributes {
            language: Some("123456".into()),
            ..installed()
        }));
        assert_eq!(voices.len(), 1);
        assert_eq!(voices[0].culture, "");
    }

    #[test]
    fn unreadable_token_does_not_hide_other_installed_voices() {
        let mut catalog = fake(installed);
        catalog.count = Some(2);
        catalog.fail_first = true;
        let voices = collect(&mut catalog);
        assert_eq!(voices.len(), 1);
        assert_eq!(catalog.requested.get(), 2);
    }

    #[test]
    fn unavailable_catalog_is_empty_and_untrusted_count_is_bounded() {
        let mut catalog = fake(installed);
        catalog.count = None;
        assert!(collect(&mut catalog).is_empty());
        assert_eq!(catalog.requested.get(), 0);
        catalog.count = Some(u32::MAX);
        assert_eq!(collect(&mut catalog).len(), 256);
        assert_eq!(catalog.requested.get(), 256);
    }

    #[test]
    fn oversized_metadata_is_omitted_without_truncating_a_voice_name() {
        let voices = collect(&mut fake(|| Attributes {
            name: Some("x".repeat(1025)),
            ..installed()
        }));
        assert!(voices.is_empty());
    }
}

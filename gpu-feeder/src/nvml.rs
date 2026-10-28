//! Read-only G-Sensory GPU0 telemetry through the driver NVML ABI.
//! Signatures: NVIDIA NVML API reference (nvmlMemory_t v1, utilization, GPU sensor).
//! https://docs.nvidia.com/deploy/nvml-api/nvml-api-reference.html
use crate::feed_loop::SampleState;
use std::ffi::{c_char, c_int, c_void};
use std::time::Duration;

type Device = *mut c_void;
type Status = c_int;
type Init = unsafe extern "C" fn() -> Status;
type Shutdown = unsafe extern "C" fn() -> Status;
type GetDevice = unsafe extern "C" fn(u32, *mut Device) -> Status;
type GetName = unsafe extern "C" fn(Device, *mut c_char, u32) -> Status;
type GetUtilization = unsafe extern "C" fn(Device, *mut Utilization) -> Status;
type GetMemory = unsafe extern "C" fn(Device, *mut Memory) -> Status;
type GetTemperature = unsafe extern "C" fn(Device, c_int, *mut u32) -> Status;

#[repr(C)]
#[derive(Clone, Copy, Default)]
struct Utilization {
    gpu: u32,
    memory: u32,
}
#[repr(C)]
#[derive(Clone, Copy, Default)]
struct Memory {
    total: u64,
    free: u64,
    used: u64,
}

#[derive(Debug, PartialEq, Eq)]
enum Error {
    Loader(&'static str, u32),
    MissingExport(&'static str),
    Api(&'static str, Status),
    InvalidData(&'static str),
    RetryLater,
}

#[derive(Clone, Copy)]
struct Api {
    init: Init,
    shutdown: Shutdown,
    device: GetDevice,
    name: GetName,
    utilization: GetUtilization,
    memory: GetMemory,
    temperature: GetTemperature,
}
impl Api {
    fn resolve(
        mut resolve: impl FnMut(&'static [u8]) -> Option<*mut c_void>,
    ) -> Result<Self, Error> {
        macro_rules! symbol {
            ($name:literal, $ty:ty) => {{
                let address = resolve(concat!($name, "\0").as_bytes())
                    .filter(|address| !address.is_null())
                    .ok_or(Error::MissingExport($name))?;
                // Each symbol has the exact NVIDIA C signature declared above.
                unsafe { std::mem::transmute::<*mut c_void, $ty>(address) }
            }};
        }
        Ok(Self {
            init: symbol!("nvmlInit_v2", Init),
            shutdown: symbol!("nvmlShutdown", Shutdown),
            device: symbol!("nvmlDeviceGetHandleByIndex_v2", GetDevice),
            name: symbol!("nvmlDeviceGetName", GetName),
            utilization: symbol!("nvmlDeviceGetUtilizationRates", GetUtilization),
            memory: symbol!("nvmlDeviceGetMemoryInfo", GetMemory),
            temperature: symbol!("nvmlDeviceGetTemperature", GetTemperature),
        })
    }
}
struct Session<O> {
    api: Api,
    device: Device,
    _owner: O,
}
impl<O> Session<O> {
    fn connect(api: Api, owner: O) -> Result<Self, Error> {
        check("init", unsafe { (api.init)() })?;
        let mut session = Self {
            api,
            device: std::ptr::null_mut(),
            _owner: owner,
        };
        check("device0", unsafe { (api.device)(0, &mut session.device) })?;
        if session.device.is_null() {
            return Err(Error::InvalidData("null GPU0 handle"));
        }
        Ok(session)
    }
    fn sample_json(&mut self) -> Result<String, Error> {
        let mut name = [0xffu8; 96];
        let mut utilization = Utilization::default();
        let mut memory = Memory::default();
        let mut temperature = 0;
        check("name", unsafe {
            (self.api.name)(self.device, name.as_mut_ptr().cast(), name.len() as u32)
        })?;
        check("utilization", unsafe {
            (self.api.utilization)(self.device, &mut utilization)
        })?;
        check("memory", unsafe {
            (self.api.memory)(self.device, &mut memory)
        })?;
        check("temperature", unsafe {
            (self.api.temperature)(self.device, 0, &mut temperature)
        })?;
        let end = name
            .iter()
            .position(|byte| *byte == 0)
            .ok_or(Error::InvalidData("unterminated GPU name"))?;
        let name = std::str::from_utf8(&name[..end])
            .map_err(|_| Error::InvalidData("GPU name encoding"))?;
        // Preserve the previous name sanitization and exclude JSON control bytes.
        let name: String = name
            .chars()
            .filter(|ch| !ch.is_control() && !matches!(ch, '"' | '\\'))
            .collect();
        if name.is_empty()
            || utilization.gpu > 100
            || temperature > 255
            || memory.total == 0
            || memory.total == u64::MAX
            || memory.used > memory.total
            || memory.free > memory.total
        {
            return Err(Error::InvalidData("GPU metadata range"));
        }
        let load = utilization.gpu;
        let used = memory.used as f64 / 1_048_576.0;
        let total = memory.total as f64 / 1_048_576.0;
        Ok(format!("{{\"gpus\":[{{\"name\":\"{name}\",\"loadPercent\":{load},\"tempC\":{temperature},\"vramUsedMb\":{used},\"vramTotalMb\":{total}}}]}}"))
    }
}
impl<O> Drop for Session<O> {
    fn drop(&mut self) {
        // The driver must remain loaded until its matching shutdown completes.
        let _ = unsafe { (self.api.shutdown)() };
    }
}
fn check(stage: &'static str, status: Status) -> Result<(), Error> {
    if status == 0 {
        Ok(())
    } else {
        Err(Error::Api(stage, status))
    }
}

struct Persistent<S> {
    session: Option<S>,
    retry_at: Duration,
}
impl<S> Persistent<S> {
    fn new() -> Self {
        Self {
            session: None,
            retry_at: Duration::ZERO,
        }
    }
    fn sample(
        &mut self,
        now: Duration,
        connect: impl FnOnce() -> Result<S, Error>,
        read: impl FnOnce(&mut S) -> Result<String, Error>,
    ) -> Result<String, Error> {
        if now < self.retry_at {
            return Err(Error::RetryLater);
        }
        if self.session.is_none() {
            match connect() {
                Ok(session) => self.session = Some(session),
                Err(error) => {
                    self.retry_at = now.saturating_add(Duration::from_secs(30));
                    return Err(error);
                }
            }
        }
        let result = read(self.session.as_mut().expect("connected above"));
        if result.is_err() {
            self.session = None;
            self.retry_at = now.saturating_add(Duration::from_secs(30));
        }
        result
    }
}

fn trusted_library_path(directory: &[u16], length: u32) -> Result<Vec<u16>, Error> {
    let length = length as usize;
    if length == 0
        || length >= directory.len()
        || directory[length] != 0
        || directory[..length].contains(&0)
    {
        return Err(Error::InvalidData("system directory length"));
    }
    let directory = String::from_utf16(&directory[..length])
        .map_err(|_| Error::InvalidData("system directory encoding"))?;
    if !std::path::Path::new(&directory).is_absolute() {
        return Err(Error::InvalidData("system directory is not absolute"));
    }
    Ok(format!("{}\\nvml.dll\0", directory.trim_end_matches('\\'))
        .encode_utf16()
        .collect())
}

impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Loader(stage, code) => write!(f, "{stage}: Windows status {code}"),
            Self::MissingExport(name) => write!(f, "missing {name}"),
            Self::Api(stage, code) => write!(f, "{stage}: NVML status {code}"),
            Self::InvalidData(stage) => write!(f, "invalid {stage}"),
            Self::RetryLater => f.write_str("retry cooldown"),
        }
    }
}

#[link(name = "kernel32")]
extern "system" {
    fn GetSystemDirectoryW(buffer: *mut u16, size: u32) -> u32;
    fn LoadLibraryExW(path: *const u16, file: *mut c_void, flags: u32) -> *mut c_void;
    fn GetProcAddress(module: *mut c_void, name: *const u8) -> *mut c_void;
    fn FreeLibrary(module: *mut c_void) -> i32;
    fn GetLastError() -> u32;
}

struct Library(std::ptr::NonNull<c_void>);
impl Library {
    fn load() -> Result<Self, Error> {
        let mut directory = vec![0u16; 32_768];
        let length = unsafe { GetSystemDirectoryW(directory.as_mut_ptr(), directory.len() as u32) };
        if length == 0 {
            return Err(Error::Loader("GetSystemDirectoryW", unsafe {
                GetLastError()
            }));
        }
        let path = trusted_library_path(&directory, length)?;
        // The absolute driver DLL and its dependencies resolve in System32 only.
        const LOAD_LIBRARY_SEARCH_SYSTEM32: u32 = 0x0000_0800;
        let module = unsafe {
            LoadLibraryExW(
                path.as_ptr(),
                std::ptr::null_mut(),
                LOAD_LIBRARY_SEARCH_SYSTEM32,
            )
        };
        std::ptr::NonNull::new(module)
            .map(Self)
            .ok_or_else(|| Error::Loader("LoadLibraryExW", unsafe { GetLastError() }))
    }
    fn resolve(&self, symbol: &'static [u8]) -> Option<*mut c_void> {
        let address = unsafe { GetProcAddress(self.0.as_ptr(), symbol.as_ptr()) };
        if address.is_null() {
            None
        } else {
            Some(address)
        }
    }
}
impl Drop for Library {
    fn drop(&mut self) {
        let _ = unsafe { FreeLibrary(self.0.as_ptr()) };
    }
}
fn connect() -> Result<Session<Library>, Error> {
    let library = Library::load()?;
    let api = Api::resolve(|symbol| library.resolve(symbol))?;
    Session::connect(api, library)
}

pub struct Sampler {
    state: Persistent<Session<Library>>,
    started: std::time::Instant,
}
impl Sampler {
    pub fn new() -> Self {
        Self {
            state: Persistent::new(),
            started: std::time::Instant::now(),
        }
    }
    pub fn sample_json(&mut self) -> SampleState {
        match self
            .state
            .sample(self.started.elapsed(), connect, Session::sample_json)
        {
            Ok(json) => SampleState::Ready(json),
            Err(Error::RetryLater) => SampleState::RetryWaiting,
            Err(error) => {
                eprintln!("[G-Feeder] GPU metadata unavailable: {error}; retry in 30s");
                SampleState::ActualUnavailable
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;
    #[derive(Clone)]
    struct Fake {
        calls: Vec<&'static str>,
        fail: Option<&'static str>,
        name: Vec<u8>,
        memory: Memory,
        gpu: u32,
        temperature: u32,
        null_device: bool,
    }
    impl Default for Fake {
        fn default() -> Self {
            Self {
                calls: vec![],
                fail: None,
                name: b"Fixture GPU\0".to_vec(),
                memory: Memory {
                    total: 8 * 1048576,
                    free: 5 * 1048576,
                    used: 3 * 1048576,
                },
                gpu: 37,
                temperature: 62,
                null_device: false,
            }
        }
    }
    thread_local! { static FAKE: RefCell<Fake> = RefCell::new(Fake::default()); }
    fn reset() {
        FAKE.with(|f| *f.borrow_mut() = Fake::default());
    }
    fn call(stage: &'static str) -> Status {
        FAKE.with(|f| {
            let mut f = f.borrow_mut();
            f.calls.push(stage);
            if f.fail == Some(stage) {
                3
            } else {
                0
            }
        })
    }
    unsafe extern "C" fn init() -> Status {
        call("init")
    }
    unsafe extern "C" fn shutdown() -> Status {
        call("shutdown")
    }
    unsafe extern "C" fn device(index: u32, out: *mut Device) -> Status {
        assert_eq!(index, 0);
        let status = call("device0");
        if status == 0 {
            *out = FAKE.with(|f| {
                if f.borrow().null_device {
                    std::ptr::null_mut()
                } else {
                    std::ptr::dangling_mut::<c_void>()
                }
            });
        }
        status
    }
    unsafe extern "C" fn name(_: Device, out: *mut c_char, len: u32) -> Status {
        let status = call("name");
        if status == 0 {
            FAKE.with(|f| {
                let f = f.borrow();
                let n = f.name.len().min(len as usize);
                std::ptr::copy_nonoverlapping(f.name.as_ptr(), out.cast(), n);
            });
        }
        status
    }
    unsafe extern "C" fn utilization(_: Device, out: *mut Utilization) -> Status {
        let status = call("utilization");
        if status == 0 {
            (*out).gpu = FAKE.with(|f| f.borrow().gpu);
        }
        status
    }
    unsafe extern "C" fn memory(_: Device, out: *mut Memory) -> Status {
        let status = call("memory");
        if status == 0 {
            *out = FAKE.with(|f| f.borrow().memory);
        }
        status
    }
    unsafe extern "C" fn temperature(_: Device, sensor: c_int, out: *mut u32) -> Status {
        assert_eq!(sensor, 0);
        let status = call("temperature");
        if status == 0 {
            *out = FAKE.with(|f| f.borrow().temperature);
        }
        status
    }
    fn api() -> Api {
        Api {
            init,
            shutdown,
            device,
            name,
            utilization,
            memory,
            temperature,
        }
    }
    struct Owner;
    impl Drop for Owner {
        fn drop(&mut self) {
            call("free_library");
        }
    }
    fn calls() -> Vec<&'static str> {
        FAKE.with(|f| f.borrow().calls.clone())
    }

    #[test]
    fn gpu0_session_is_persistent_and_preserves_json_and_mib_units() {
        reset();
        let mut session = Session::connect(api(), Owner).unwrap();
        let expected="{\"gpus\":[{\"name\":\"Fixture GPU\",\"loadPercent\":37,\"tempC\":62,\"vramUsedMb\":3,\"vramTotalMb\":8}]}";
        assert_eq!(session.sample_json().unwrap(), expected);
        assert_eq!(session.sample_json().unwrap(), expected);
        assert_eq!(calls().iter().filter(|v| **v == "init").count(), 1);
        assert_eq!(calls().iter().filter(|v| **v == "device0").count(), 1);
        drop(session);
        let calls = calls();
        assert_eq!(&calls[calls.len() - 2..], ["shutdown", "free_library"]);
    }
    #[test]
    fn failed_init_frees_library_without_shutdown() {
        reset();
        FAKE.with(|f| f.borrow_mut().fail = Some("init"));
        assert!(Session::connect(api(), Owner).is_err());
        assert_eq!(calls(), ["init", "free_library"]);
    }
    #[test]
    fn failed_device_query_shuts_down_before_freeing() {
        reset();
        FAKE.with(|f| f.borrow_mut().fail = Some("device0"));
        assert!(Session::connect(api(), Owner).is_err());
        assert_eq!(calls(), ["init", "device0", "shutdown", "free_library"]);
    }
    #[test]
    fn null_device_is_unavailable() {
        reset();
        FAKE.with(|f| f.borrow_mut().null_device = true);
        assert!(Session::connect(api(), Owner).is_err());
        assert_eq!(calls(), ["init", "device0", "shutdown", "free_library"]);
    }
    #[test]
    fn every_unsupported_field_is_unavailable_instead_of_zero_json() {
        for field in ["name", "utilization", "memory", "temperature"] {
            reset();
            let mut session = Session::connect(api(), Owner).unwrap();
            FAKE.with(|f| f.borrow_mut().fail = Some(field));
            assert!(session.sample_json().is_err(), "{field}");
        }
    }
    #[test]
    fn invalid_and_unterminated_names_are_unavailable() {
        for invalid in [vec![b'x'; 96], vec![0xff, 0], vec![0]] {
            reset();
            let mut session = Session::connect(api(), Owner).unwrap();
            FAKE.with(|f| f.borrow_mut().name = invalid);
            assert!(session.sample_json().is_err());
        }
    }
    #[test]
    fn json_name_is_safe_and_fractional_mib_is_preserved() {
        reset();
        let mut session = Session::connect(api(), Owner).unwrap();
        FAKE.with(|f| {
            let mut f = f.borrow_mut();
            f.name = b"GPU\"\\\n\0".to_vec();
            f.memory.used = 1572864;
        });
        let json = session.sample_json().unwrap();
        assert!(json.contains("\"name\":\"GPU\""));
        assert!(json.contains("\"vramUsedMb\":1.5"));
        assert!(!json.contains('\n'));
    }
    #[test]
    fn sentinels_invalid_ranges_and_impossible_memory_are_unavailable() {
        for mode in 0..5 {
            reset();
            let mut session = Session::connect(api(), Owner).unwrap();
            FAKE.with(|f| {
                let mut f = f.borrow_mut();
                match mode {
                    0 => f.gpu = 101,
                    1 => f.memory.total = 0,
                    2 => f.memory.used = u64::MAX,
                    3 => f.memory.free = u64::MAX,
                    _ => f.temperature = u32::MAX,
                }
            });
            assert!(session.sample_json().is_err());
        }
    }
    #[test]
    fn legitimate_zero_load_and_used_memory_are_not_missing() {
        reset();
        let mut session = Session::connect(api(), Owner).unwrap();
        FAKE.with(|f| {
            let mut f = f.borrow_mut();
            f.gpu = 0;
            f.memory.used = 0;
        });
        let json = session.sample_json().unwrap();
        assert!(json.contains("\"loadPercent\":0"));
        assert!(json.contains("\"vramUsedMb\":0"));
    }
    #[test]
    fn missing_required_export_never_initializes() {
        reset();
        let result = Api::resolve(|symbol| {
            if symbol == b"nvmlDeviceGetMemoryInfo\0" {
                None
            } else {
                Some(init as *mut c_void)
            }
        });
        assert!(matches!(
            result,
            Err(Error::MissingExport("nvmlDeviceGetMemoryInfo"))
        ));
        assert!(calls().is_empty());
    }
    #[test]
    fn retry_is_bounded_and_success_keeps_session() {
        let attempts = std::cell::Cell::new(0);
        let mut sampler = Persistent::<u8>::new();
        let connect = || {
            attempts.set(attempts.get() + 1);
            Err(Error::Api("init", 3))
        };
        assert!(sampler
            .sample(Duration::ZERO, connect, |_| unreachable!())
            .is_err());
        assert_eq!(
            sampler.sample(Duration::from_secs(29), connect, |_| unreachable!()),
            Err(Error::RetryLater)
        );
        assert_eq!(attempts.get(), 1);
        assert_eq!(
            sampler.sample(Duration::from_secs(30), || Ok(7), |v| Ok(v.to_string())),
            Ok("7".into())
        );
        assert_eq!(
            sampler.sample(
                Duration::from_secs(31),
                || panic!("must retain session"),
                |v| Ok(v.to_string())
            ),
            Ok("7".into())
        );
    }
    #[test]
    fn failed_sample_drops_session_and_backs_off() {
        reset();
        let mut sampler = Persistent::new();
        assert!(sampler
            .sample(
                Duration::ZERO,
                || Session::connect(api(), Owner),
                |_| Err(Error::Api("memory", 3))
            )
            .is_err());
        assert!(sampler.session.is_none());
        assert_eq!(sampler.retry_at, Duration::from_secs(30));
        let calls = calls();
        assert_eq!(&calls[calls.len() - 2..], ["shutdown", "free_library"]);
    }
    #[test]
    fn loader_path_requires_complete_absolute_system_directory() {
        let directory: Vec<u16> = "C:\\Windows\\System32\0".encode_utf16().collect();
        let path = trusted_library_path(&directory, (directory.len() - 1) as u32).unwrap();
        assert_eq!(
            String::from_utf16(&path[..path.len() - 1]).unwrap(),
            "C:\\Windows\\System32\\nvml.dll"
        );
        assert!(trusted_library_path(&directory, 0).is_err());
        assert!(trusted_library_path(&directory, directory.len() as u32).is_err());
        assert!(trusted_library_path(&"relative\0".encode_utf16().collect::<Vec<_>>(), 8).is_err());
        assert!(trusted_library_path(&[67, 58, 92, 0, 88, 0], 5).is_err());
    }
    #[test]
    fn half_second_ticks_survive_one_nvml_error_and_recover_after_cooldown() {
        reset();
        FAKE.with(|f| f.borrow_mut().fail = Some("memory"));
        let mut gpu = Persistent::new();
        let mut budget = crate::feed_loop::FailureBudget::new();
        let posts = std::cell::Cell::new(0);
        for tick in 0..=60 {
            let now = Duration::from_millis(tick * 500);
            if tick == 60 {
                FAKE.with(|f| f.borrow_mut().fail = None);
            }
            let keep_running = budget.tick(
                true,
                || match gpu.sample(now, || Session::connect(api(), Owner), Session::sample_json) {
                    Ok(body) => SampleState::Ready(body),
                    Err(Error::RetryLater) => SampleState::RetryWaiting,
                    Err(_) => SampleState::ActualUnavailable,
                },
                |body| {
                    assert!(body.contains("Fixture GPU"));
                    posts.set(posts.get() + 1);
                    true
                },
            );
            assert!(
                keep_running,
                "feeder exited during cooldown at 500ms tick {tick}"
            );
        }
        assert_eq!(calls().iter().filter(|call| **call == "init").count(), 2);
        assert_eq!(posts.get(), 1);
        assert_eq!(budget.failures(), 0);
    }
    #[test]
    fn endpoint_loss_during_real_gpu_cooldown_still_exits_at_twenty_ticks() {
        reset();
        FAKE.with(|f| f.borrow_mut().fail = Some("memory"));
        let mut gpu = Persistent::new();
        assert!(gpu
            .sample(
                Duration::ZERO,
                || Session::connect(api(), Owner),
                Session::sample_json
            )
            .is_err());
        let mut budget = crate::feed_loop::FailureBudget::new();
        for tick in 1..=20 {
            let now = Duration::from_millis(tick * 500);
            assert!(now < gpu.retry_at);
            assert_eq!(
                budget.tick(
                    false,
                    || panic!("endpoint lost: must not query GPU"),
                    |_| panic!("endpoint lost: must not post")
                ),
                tick < 20
            );
        }
        assert_eq!(calls().iter().filter(|call| **call == "init").count(), 1);
    }
    #[test]
    fn c_abi_layout_is_fixed() {
        assert_eq!(std::mem::size_of::<Memory>(), 24);
        assert_eq!(std::mem::align_of::<Memory>(), 8);
        assert_eq!(std::mem::size_of::<Utilization>(), 8);
        assert_eq!(std::mem::size_of::<Device>(), std::mem::size_of::<usize>());
    }
}

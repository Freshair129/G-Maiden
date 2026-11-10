use axum::{
    body::{to_bytes, Body},
    extract::State,
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::post,
    Json, Router,
};
use http_body_util::LengthLimitError;
use hyper::server::conn::http1::Builder as Http1Builder;
use hyper_util::{
    rt::{TokioIo, TokioTimer},
    service::TowerToHyperService,
};
use ring::{
    digest::{Context, SHA256},
    rand::{SecureRandom, SystemRandom},
};
use serde::Serialize;
use std::{
    ffi::OsString,
    fs::File,
    io::{Read, Write},
    net::{Ipv4Addr, SocketAddrV4, TcpListener as StdTcpListener},
    path::Path,
    sync::{Arc, Mutex},
    time::Duration,
};
use subtle::ConstantTimeEq;
use tokio::{
    sync::{watch, Semaphore},
    task::JoinSet,
};

const REPLAY_FLAG: &str = "--gsi-replay-test";
const HASH_FLAG: &str = "--expected-binary-sha256";
const FIRST_SEQUENCE_FLAG: &str = "--first-sequence";
const RECORD_COUNT_FLAG: &str = "--expected-record-count";
const REPLAY_PATH: &str = "/__gtrace/replay";
const ELAPSED_MS_HEADER: &str = "x-gtrace-test-elapsed-ms";
const TIME_POLICY: &str = "caller_supplied_monotonic_elapsed_ms_non_decreasing_per_run";
const RESERVED_FAILURE_POLICY: &str =
    "post_reservation_failure_consumes_sequence_and_elapsed_ms; restart_with_new_run";
const MEDIA_SUPPRESSION_REASON: &str = "test_host_never_plays_audio";
const MAX_EXPECTED_RECORDS: u64 = 1_000_000;
const MAX_REPLAY_BODY_BYTES: usize = 64 * 1024;
#[cfg(test)]
const VALID_MENU_BODY: &str = r#"{"provider":{"appid":570,"name":"synthetic","version":1,"timestamp":1},"player":{"activity":"menu","team_name":"radiant","gold":0,"net_worth":0,"gpm":0,"xpm":0,"kills":0,"deaths":0,"assists":0,"last_hits":0,"denies":0}}"#;
#[cfg(test)]
const VALID_TERMINAL_ENVELOPE: &str =
    r#"{"player":{},"provider":{"appid":570,"name":"synthetic","timestamp":1,"version":1}}"#;
const REPLAY_BODY_READ_TIMEOUT: Duration = Duration::from_secs(2);
const MAX_ACTIVE_HTTP_CONNECTIONS: usize = 4;
const MAX_HTTP_HEADER_COUNT: usize = 64;
const MAX_HTTP_BUFFER_BYTES: usize = 16 * 1024;
const HTTP_HEADER_READ_TIMEOUT: Duration = Duration::from_secs(2);
const SHUTDOWN_DRAIN_TIMEOUT: Duration = Duration::from_secs(3);

#[derive(Serialize)]
struct IsolationFlags {
    debug_build: bool,
    test_host_mode: bool,
    loopback_only: bool,
    dota_config_sync_disabled: bool,
    dota_process_watchdog_disabled: bool,
    dxgi_capture_disabled: bool,
    external_side_effects_disabled: bool,
    production_persistence_disabled: bool,
}

impl IsolationFlags {
    const VERIFIED: Self = Self {
        debug_build: true,
        test_host_mode: true,
        loopback_only: true,
        dota_config_sync_disabled: true,
        dota_process_watchdog_disabled: true,
        dxgi_capture_disabled: true,
        external_side_effects_disabled: true,
        production_persistence_disabled: true,
    };
}

struct LaunchOptions {
    expected_binary_sha256: String,
    first_sequence: u64,
    expected_record_count: u64,
}

enum StartupDecision {
    Normal,
    ReleaseRejected,
    Invalid,
    Run(LaunchOptions),
}

#[derive(Debug, PartialEq, Eq)]
enum IsolationFailure {
    ReleaseBuild,
    StdoutNotPipe,
    StdinNotPipe,
    BinaryHashMismatch,
}

fn classify_startup(args: &[OsString], debug_assertions: bool) -> StartupDecision {
    if !crate::replay_test_arguments_present(args) {
        return StartupDecision::Normal;
    }
    if !debug_assertions {
        return StartupDecision::ReleaseRejected;
    }

    let mut flag_seen = false;
    let mut hash = None;
    let mut first_sequence = None;
    let mut expected_record_count = None;
    let mut index = 0;
    while index < args.len() {
        let Some(argument) = args[index].to_str() else {
            return StartupDecision::Invalid;
        };
        match argument {
            REPLAY_FLAG if !flag_seen => {
                flag_seen = true;
                index += 1;
            }
            HASH_FLAG if hash.is_none() => {
                let Some(value) = args.get(index + 1).and_then(|value| value.to_str()) else {
                    return StartupDecision::Invalid;
                };
                if !valid_sha256(value) {
                    return StartupDecision::Invalid;
                }
                hash = Some(value.to_ascii_lowercase());
                index += 2;
            }
            FIRST_SEQUENCE_FLAG if first_sequence.is_none() => {
                let Some(value) = args.get(index + 1).and_then(|value| value.to_str()) else {
                    return StartupDecision::Invalid;
                };
                let Some(value) = parse_decimal_u64(value) else {
                    return StartupDecision::Invalid;
                };
                first_sequence = Some(value);
                index += 2;
            }
            RECORD_COUNT_FLAG if expected_record_count.is_none() => {
                let Some(value) = args.get(index + 1).and_then(|value| value.to_str()) else {
                    return StartupDecision::Invalid;
                };
                let Some(value) = parse_decimal_u64(value)
                    .filter(|value| (1..=MAX_EXPECTED_RECORDS).contains(value))
                else {
                    return StartupDecision::Invalid;
                };
                expected_record_count = Some(value);
                index += 2;
            }
            _ => return StartupDecision::Invalid,
        }
    }

    let (Some(expected_binary_sha256), Some(first_sequence), Some(expected_record_count)) =
        (hash, first_sequence, expected_record_count)
    else {
        return StartupDecision::Invalid;
    };
    if !flag_seen || first_sequence.checked_add(expected_record_count).is_none() {
        return StartupDecision::Invalid;
    }
    StartupDecision::Run(LaunchOptions {
        expected_binary_sha256,
        first_sequence,
        expected_record_count,
    })
}

fn parse_decimal_u64(value: &str) -> Option<u64> {
    if value.is_empty()
        || !value.bytes().all(|byte| byte.is_ascii_digit())
        || (value.len() > 1 && value.starts_with('0'))
    {
        return None;
    }
    value.parse().ok()
}

fn valid_sha256(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn verify_binary_sha256(expected: &str, actual: &str) -> bool {
    valid_sha256(expected) && valid_sha256(actual) && expected.eq_ignore_ascii_case(actual)
}

fn capability_matches(provided: &[u8; 32], expected: &[u8; 32]) -> bool {
    bool::from(provided.ct_eq(expected))
}

fn exactly_one_header_value<'a>(headers: &'a HeaderMap, name: &str) -> Option<&'a str> {
    let mut values = headers.get_all(name).iter();
    let value = values.next()?;
    if values.next().is_some() {
        return None;
    }
    value.to_str().ok()
}

fn isolation_gate(
    debug_assertions: bool,
    stdin_is_pipe: bool,
    stdout_is_pipe: bool,
    binary_hash_matches: bool,
) -> Result<(), IsolationFailure> {
    if !debug_assertions {
        return Err(IsolationFailure::ReleaseBuild);
    }
    if !stdout_is_pipe {
        return Err(IsolationFailure::StdoutNotPipe);
    }
    if !stdin_is_pipe {
        return Err(IsolationFailure::StdinNotPipe);
    }
    if !binary_hash_matches {
        return Err(IsolationFailure::BinaryHashMismatch);
    }
    Ok(())
}

#[derive(Serialize)]
struct TestTargetDescriptor {
    endpoint: String,
    run_id: String,
    capability: String,
    first_sequence: u64,
    expected_record_count: u64,
    elapsed_ms_header: &'static str,
    time_policy: &'static str,
    reserved_request_failure_policy: &'static str,
    binary_sha256: String,
    binary_sha256_verified: bool,
    isolation_flags: IsolationFlags,
    test_identity: &'static str,
    real_identity: &'static str,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
struct ReplayOutcome {
    record_kind: &'static str,
    parsed_status: &'static str,
    run_id: String,
    raw_body_sha256: String,
    source_sequence: u64,
    elapsed_ms: u64,
    time_policy: &'static str,
    session_observation_status: crate::runtime::IsolatedMatchSessionObservationStatus,
    session_epoch: u64,
    lifecycle: &'static str,
    safety_event: Option<&'static str>,
    announcer_candidates: Vec<String>,
    selected_announcer: Option<String>,
    suppression_reason: &'static str,
    media_result: &'static str,
    test_identity: &'static str,
    real_identity: &'static str,
}

#[derive(Clone)]
struct ReplayState(Arc<Mutex<ReplayRuntime>>);

struct ReplayRuntime {
    run_uuid: String,
    capability: [u8; 32],
    next_sequence: u64,
    last_elapsed_ms: Option<u64>,
    expected_record_count: u64,
    consumed_record_count: u64,
    successfully_processed_record_count: u64,
    request_in_flight: bool,
    sessions: crate::runtime::IsolatedMatchSessionObserver,
    announcer: crate::announcer::IsolatedSessionDetector,
    safety: crate::safety_events::core::Detector,
    #[cfg(test)]
    downstream_detector_dispatch_count: usize,
}

impl ReplayState {
    fn new(
        run_uuid: String,
        capability: [u8; 32],
        first_sequence: u64,
        expected_record_count: u64,
    ) -> Self {
        Self(Arc::new(Mutex::new(ReplayRuntime {
            run_uuid,
            capability,
            next_sequence: first_sequence,
            last_elapsed_ms: None,
            expected_record_count,
            consumed_record_count: 0,
            successfully_processed_record_count: 0,
            request_in_flight: false,
            sessions: crate::runtime::IsolatedMatchSessionObserver::default(),
            announcer: crate::announcer::IsolatedSessionDetector::default(),
            safety: crate::safety_events::core::Detector::default(),
            #[cfg(test)]
            downstream_detector_dispatch_count: 0,
        })))
    }

    #[cfg(test)]
    fn new_for_test(
        run_uuid: &str,
        capability: &str,
        first_sequence: u64,
        expected_record_count: u64,
    ) -> Self {
        let capability = decode_hex_32(capability).expect("synthetic test capability");
        Self::new(
            run_uuid.to_string(),
            capability,
            first_sequence,
            expected_record_count,
        )
    }
}

impl ReplayRuntime {
    fn reserve_sequence(
        &mut self,
        run_uuid: &str,
        capability: &str,
        source_sequence: u64,
        elapsed_ms: u64,
    ) -> Result<(), StatusCode> {
        if run_uuid != self.run_uuid
            || decode_hex_32(capability)
                .is_none_or(|provided| !capability_matches(&provided, &self.capability))
        {
            return Err(StatusCode::UNAUTHORIZED);
        }
        if self.request_in_flight
            || self.consumed_record_count >= self.expected_record_count
            || source_sequence != self.next_sequence
        {
            return Err(StatusCode::CONFLICT);
        }
        if self
            .last_elapsed_ms
            .is_some_and(|last_elapsed_ms| elapsed_ms < last_elapsed_ms)
        {
            return Err(StatusCode::CONFLICT);
        }

        self.next_sequence = self
            .next_sequence
            .checked_add(1)
            .ok_or(StatusCode::CONFLICT)?;
        self.last_elapsed_ms = Some(elapsed_ms);
        self.consumed_record_count += 1;
        self.request_in_flight = true;
        Ok(())
    }

    fn process_body(
        &mut self,
        source_sequence: u64,
        elapsed_ms: u64,
        raw_body_sha256: String,
        body: &str,
    ) -> Result<ReplayOutcome, StatusCode> {
        let outcome = self.process_body_inner(source_sequence, elapsed_ms, raw_body_sha256, body);
        self.request_in_flight = false;
        if outcome.is_ok() {
            self.successfully_processed_record_count += 1;
        }
        outcome
    }

    fn process_body_inner(
        &mut self,
        source_sequence: u64,
        elapsed_ms: u64,
        raw_body_sha256: String,
        body: &str,
    ) -> Result<ReplayOutcome, StatusCode> {
        let (tick, source_match_id) =
            match crate::gsi::parse_gsi_payload_for_replay_with_match_id(body)
                .map_err(|_| StatusCode::UNPROCESSABLE_ENTITY)?
            {
                crate::gsi::ReplayGsiPayload::MatchState { tick, match_id } => (tick, match_id),
                crate::gsi::ReplayGsiPayload::NonMatchLifecycle(lifecycle) => {
                    if lifecycle == crate::gsi::ReplayNonMatchLifecycle::TerminalEmptyPlayerEnvelope
                        && !self.sessions.has_post_game_lifecycle()
                    {
                        return Err(StatusCode::UNPROCESSABLE_ENTITY);
                    }
                    let session = self.sessions.snapshot();
                    return Ok(ReplayOutcome {
                        record_kind: "non_match_lifecycle",
                        parsed_status: "skip",
                        run_id: self.run_uuid.clone(),
                        raw_body_sha256,
                        source_sequence,
                        elapsed_ms,
                        time_policy: TIME_POLICY,
                        session_observation_status:
                            crate::runtime::IsolatedMatchSessionObservationStatus::NotApplicable,
                        session_epoch: session.session_epoch,
                        lifecycle: match lifecycle {
                            crate::gsi::ReplayNonMatchLifecycle::Menu => "unknown",
                            crate::gsi::ReplayNonMatchLifecycle::TerminalEmptyPlayerEnvelope => {
                                lifecycle_name(session.session_lifecycle)
                            }
                        },
                        safety_event: None,
                        announcer_candidates: Vec::new(),
                        selected_announcer: None,
                        suppression_reason: MEDIA_SUPPRESSION_REASON,
                        media_result: "not_run",
                        test_identity: "synthetic",
                        real_identity: "not_run",
                    });
                }
            };
        if !tick.local_player_verified || tick.steamid != crate::gsi::SYNTHETIC_REPLAY_PLAYER_ID {
            return Err(StatusCode::UNPROCESSABLE_ENTITY);
        }
        let crate::runtime::IsolatedMatchSessionObservation {
            snapshot: session,
            status: session_observation_status,
        } = self.sessions.observe(
            crate::gsi::lifecycle_for_tick(&tick),
            source_match_id.map(|match_id| synthetic_match_id(&match_id)),
            tick.clock_time,
        );
        #[cfg(test)]
        {
            self.downstream_detector_dispatch_count += 1;
        }
        let safety_event = self.safety.observe(
            crate::safety_events::core::Observation {
                epoch: session.session_epoch,
                owner: &tick.steamid,
                live: tick.in_game
                    && session.session_lifecycle == Some(crate::runtime::MatchLifecycle::Live),
                verified: tick.local_player_verified,
                alive: tick.alive,
                hp: tick.hp_percent,
                kills: tick.kills,
            },
            crate::safety_events::core::Settings {
                enabled: true,
                voice_enabled: true,
                threshold: 25,
            },
            elapsed_ms,
        );
        let announcer_candidates =
            crate::announcer::observe_isolated_for_session(&mut self.announcer, &tick, &session);
        let selected_announcer = crate::announcer::most_important(&announcer_candidates);
        let outcome = ReplayOutcome {
            record_kind: "match_state",
            parsed_status: "pass",
            run_id: self.run_uuid.clone(),
            raw_body_sha256,
            source_sequence,
            elapsed_ms,
            time_policy: TIME_POLICY,
            session_observation_status,
            session_epoch: session.session_epoch,
            lifecycle: lifecycle_name(session.session_lifecycle),
            safety_event,
            announcer_candidates,
            selected_announcer,
            suppression_reason: MEDIA_SUPPRESSION_REASON,
            media_result: "not_run",
            test_identity: "synthetic",
            real_identity: "not_run",
        };
        Ok(outcome)
    }
}

fn synthetic_match_id(source_match_id: &str) -> String {
    let digest = ring::digest::digest(&SHA256, source_match_id.as_bytes());
    format!("gtrace-match-{}", encode_hex(digest.as_ref()))
}

fn lifecycle_name(lifecycle: Option<crate::runtime::MatchLifecycle>) -> &'static str {
    match lifecycle {
        Some(crate::runtime::MatchLifecycle::Draft) => "draft",
        Some(crate::runtime::MatchLifecycle::Live) => "live",
        Some(crate::runtime::MatchLifecycle::Disconnected) => "disconnected",
        Some(crate::runtime::MatchLifecycle::End) => "end",
        Some(crate::runtime::MatchLifecycle::Abandon) => "abandon",
        None => "unknown",
    }
}

fn router(state: ReplayState) -> Router {
    Router::new()
        .route(REPLAY_PATH, post(replay_post))
        .with_state(state)
}

async fn replay_post(State(state): State<ReplayState>, headers: HeaderMap, body: Body) -> Response {
    let Some(run_uuid) = exactly_one_header_value(&headers, "x-gtrace-test-run") else {
        return (StatusCode::UNAUTHORIZED, "rejected").into_response();
    };
    let Some(capability) = exactly_one_header_value(&headers, "x-gtrace-test-capability") else {
        return (StatusCode::UNAUTHORIZED, "rejected").into_response();
    };
    let Some(source_sequence) =
        exactly_one_header_value(&headers, "x-gtrace-test-sequence").and_then(parse_decimal_u64)
    else {
        return (StatusCode::CONFLICT, "rejected").into_response();
    };
    let Some(elapsed_ms) =
        exactly_one_header_value(&headers, ELAPSED_MS_HEADER).and_then(parse_decimal_u64)
    else {
        return (StatusCode::BAD_REQUEST, "rejected").into_response();
    };
    {
        let Ok(mut runtime) = state.0.lock() else {
            return (StatusCode::SERVICE_UNAVAILABLE, "rejected").into_response();
        };
        if let Err(status) =
            runtime.reserve_sequence(run_uuid, capability, source_sequence, elapsed_ms)
        {
            return (status, "rejected").into_response();
        }
    }
    if headers
        .get("content-length")
        .and_then(|value| value.to_str().ok())
        .and_then(parse_decimal_u64)
        .is_some_and(|length| length > MAX_REPLAY_BODY_BYTES as u64)
    {
        release_reserved_request(&state);
        return (StatusCode::PAYLOAD_TOO_LARGE, "rejected").into_response();
    }
    let body = match tokio::time::timeout(
        REPLAY_BODY_READ_TIMEOUT,
        to_bytes(body, MAX_REPLAY_BODY_BYTES),
    )
    .await
    {
        Err(_) => {
            release_reserved_request(&state);
            return (StatusCode::REQUEST_TIMEOUT, "rejected").into_response();
        }
        Ok(Err(error)) => {
            release_reserved_request(&state);
            return (body_read_error_status(&error), "rejected").into_response();
        }
        Ok(Ok(body)) => body,
    };
    let raw_body_sha256 = encode_hex(ring::digest::digest(&SHA256, body.as_ref()).as_ref());
    let body = match String::from_utf8(body.to_vec()) {
        Ok(body) => body,
        Err(_) => {
            release_reserved_request(&state);
            return (StatusCode::BAD_REQUEST, "rejected").into_response();
        }
    };
    let Ok(mut runtime) = state.0.lock() else {
        return (StatusCode::SERVICE_UNAVAILABLE, "rejected").into_response();
    };
    match runtime.process_body(source_sequence, elapsed_ms, raw_body_sha256, &body) {
        Ok(outcome) => (StatusCode::OK, Json(outcome)).into_response(),
        Err(status) => (status, "rejected").into_response(),
    }
}

fn release_reserved_request(state: &ReplayState) {
    if let Ok(mut runtime) = state.0.lock() {
        runtime.request_in_flight = false;
    }
}

fn body_read_error_status(error: &axum::Error) -> StatusCode {
    if std::error::Error::source(error).is_some_and(|source| source.is::<LengthLimitError>()) {
        StatusCode::PAYLOAD_TOO_LARGE
    } else {
        StatusCode::BAD_REQUEST
    }
}

fn bind_loopback_ephemeral() -> std::io::Result<StdTcpListener> {
    let listener = StdTcpListener::bind(SocketAddrV4::new(Ipv4Addr::LOCALHOST, 0))?;
    let address = listener.local_addr()?;
    if !address.is_ipv4() || address.port() == 3000 {
        return Err(std::io::Error::other("loopback endpoint gate failed"));
    }
    listener.set_nonblocking(true)?;
    Ok(listener)
}

fn hash_file(path: &Path) -> std::io::Result<String> {
    let mut file = File::open(path)?;
    let mut context = Context::new(&SHA256);
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = file.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        context.update(&buffer[..read]);
    }
    Ok(encode_hex(context.finish().as_ref()))
}

fn running_binary_sha256() -> std::io::Result<String> {
    let executable = std::env::current_exe()?;
    hash_file(&executable)
}

fn random_bytes<const N: usize>() -> Result<[u8; N], ()> {
    let mut bytes = [0_u8; N];
    SystemRandom::new().fill(&mut bytes).map_err(|_| ())?;
    Ok(bytes)
}

fn make_run_uuid() -> Result<String, ()> {
    let mut bytes = random_bytes::<16>()?;
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    let hex = encode_hex(&bytes);
    Ok(format!(
        "{}-{}-{}-{}-{}",
        &hex[0..8],
        &hex[8..12],
        &hex[12..16],
        &hex[16..20],
        &hex[20..32]
    ))
}

fn encode_hex(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        out.push(HEX[(byte >> 4) as usize] as char);
        out.push(HEX[(byte & 0x0f) as usize] as char);
    }
    out
}

fn decode_hex_32(value: &str) -> Option<[u8; 32]> {
    if value.len() != 64 || !value.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return None;
    }
    let mut decoded = [0_u8; 32];
    for (index, chunk) in value.as_bytes().chunks_exact(2).enumerate() {
        let high = hex_nibble(chunk[0])?;
        let low = hex_nibble(chunk[1])?;
        decoded[index] = high << 4 | low;
    }
    Some(decoded)
}

fn hex_nibble(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

#[cfg(windows)]
fn windows_handle_is_pipe(handle: *mut std::ffi::c_void) -> bool {
    #[link(name = "kernel32")]
    extern "system" {
        #[link_name = "GetFileType"]
        fn get_file_type(handle: *mut std::ffi::c_void) -> u32;
    }

    const FILE_TYPE_PIPE: u32 = 3;
    unsafe { get_file_type(handle) == FILE_TYPE_PIPE }
}

#[cfg(windows)]
fn stdout_is_pipe() -> bool {
    use std::os::windows::io::AsRawHandle;

    let stdout = std::io::stdout();
    windows_handle_is_pipe(stdout.as_raw_handle())
}

#[cfg(windows)]
fn stdin_is_pipe() -> bool {
    use std::os::windows::io::AsRawHandle;

    let stdin = std::io::stdin();
    windows_handle_is_pipe(stdin.as_raw_handle())
}

#[cfg(not(windows))]
fn stdout_is_pipe() -> bool {
    false
}

#[cfg(not(windows))]
fn stdin_is_pipe() -> bool {
    false
}

pub(crate) fn run_if_requested() -> Option<i32> {
    let args: Vec<OsString> = std::env::args_os().skip(1).collect();
    match classify_startup(&args, cfg!(debug_assertions)) {
        StartupDecision::Normal => None,
        StartupDecision::ReleaseRejected => {
            eprintln!("GSI replay test host is debug-build-only");
            Some(2)
        }
        StartupDecision::Invalid => {
            eprintln!("GSI replay test host arguments rejected");
            Some(2)
        }
        StartupDecision::Run(options) => Some(run_host(options)),
    }
}

fn run_host(options: LaunchOptions) -> i32 {
    let actual_binary_sha256 = match running_binary_sha256() {
        Ok(hash) => hash,
        Err(_) => {
            eprintln!("GSI replay test host binary verification failed");
            return 2;
        }
    };
    let binary_hash_matches =
        verify_binary_sha256(&options.expected_binary_sha256, &actual_binary_sha256);
    if isolation_gate(
        cfg!(debug_assertions),
        stdin_is_pipe(),
        stdout_is_pipe(),
        binary_hash_matches,
    )
    .is_err()
    {
        eprintln!("GSI replay test host isolation gate failed");
        return 2;
    }

    let run_uuid = match make_run_uuid() {
        Ok(run_uuid) => run_uuid,
        Err(_) => {
            eprintln!("GSI replay test host capability generation failed");
            return 2;
        }
    };
    let capability = match random_bytes::<32>() {
        Ok(capability) => capability,
        Err(_) => {
            eprintln!("GSI replay test host capability generation failed");
            return 2;
        }
    };
    let listener = match bind_loopback_ephemeral() {
        Ok(listener) => listener,
        Err(_) => {
            eprintln!("GSI replay test host loopback bind failed");
            return 2;
        }
    };
    let address = match listener.local_addr() {
        Ok(address) if address.is_ipv4() && address.port() != 3000 => address,
        _ => {
            eprintln!("GSI replay test host loopback bind failed");
            return 2;
        }
    };
    let descriptor = TestTargetDescriptor {
        endpoint: format!("http://{address}{REPLAY_PATH}"),
        run_id: run_uuid.clone(),
        capability: encode_hex(&capability),
        first_sequence: options.first_sequence,
        expected_record_count: options.expected_record_count,
        elapsed_ms_header: ELAPSED_MS_HEADER,
        time_policy: TIME_POLICY,
        reserved_request_failure_policy: RESERVED_FAILURE_POLICY,
        binary_sha256: actual_binary_sha256,
        binary_sha256_verified: true,
        isolation_flags: IsolationFlags::VERIFIED,
        test_identity: "synthetic",
        real_identity: "not_run",
    };
    let handshake = match serde_json::to_vec(&descriptor) {
        Ok(handshake) => handshake,
        Err(_) => {
            eprintln!("GSI replay test host descriptor failed");
            return 2;
        }
    };

    let runtime = match tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
    {
        Ok(runtime) => runtime,
        Err(_) => {
            eprintln!("GSI replay test host runtime failed");
            return 2;
        }
    };
    let state = ReplayState::new(
        run_uuid,
        capability,
        options.first_sequence,
        options.expected_record_count,
    );
    match runtime.block_on(serve_host(listener, state, handshake)) {
        Ok(()) => 0,
        Err(()) => {
            eprintln!("GSI replay test host stopped with an error");
            2
        }
    }
}

async fn serve_host(
    listener: StdTcpListener,
    state: ReplayState,
    handshake: Vec<u8>,
) -> Result<(), ()> {
    let listener = tokio::net::TcpListener::from_std(listener).map_err(|_| ())?;
    let (stop_tx, stop_rx) = watch::channel(None::<StdinStopReason>);
    std::thread::Builder::new()
        .name("gtrace-stdin-eof".to_string())
        .spawn(move || {
            let mut stdin = std::io::stdin().lock();
            let mut buffer = [0_u8; 256];
            let reason = loop {
                match stdin.read(&mut buffer) {
                    Ok(0) => break StdinStopReason::Eof,
                    Err(_) => break StdinStopReason::ReadError,
                    Ok(_) => {}
                }
            };
            let _ = stop_tx.send(Some(reason));
        })
        .map_err(|_| ())?;

    let mut stdout = std::io::stdout().lock();
    stdout.write_all(&handshake).map_err(|_| ())?;
    stdout.write_all(b"\n").map_err(|_| ())?;
    stdout.flush().map_err(|_| ())?;
    drop(stdout);

    let server = serve_bounded_http(
        listener,
        router(state.clone()),
        Arc::new(Semaphore::new(MAX_ACTIVE_HTTP_CONNECTIONS)),
        stop_rx.clone(),
    );
    tokio::pin!(server);
    let mut server_exit_stop = stop_rx.clone();
    let mut drain_stop = stop_rx;
    let reason = tokio::select! {
        result = &mut server => {
            let server_result = result.map_err(|_| ());
            let stop_reason = *server_exit_stop.borrow_and_update();
            return exit_after_server(server_result, stop_reason, &state);
        },
        reason = wait_for_stdin_stop(&mut drain_stop) => reason,
    };
    await_server_drain(server.as_mut(), SHUTDOWN_DRAIN_TIMEOUT).await?;
    exit_after_server(Ok(()), Some(reason), &state)
}

async fn serve_bounded_http(
    listener: tokio::net::TcpListener,
    app: Router,
    connection_slots: Arc<Semaphore>,
    mut stop_rx: watch::Receiver<Option<StdinStopReason>>,
) -> std::io::Result<()> {
    let mut connections = JoinSet::new();
    loop {
        tokio::select! {
            biased;
            reason = wait_for_stdin_stop(&mut stop_rx) => {
                let _ = reason;
                break;
            }
            Some(_) = connections.join_next(), if !connections.is_empty() => {}
            accepted = listener.accept() => {
                let (stream, _) = accepted?;
                let Ok(permit) = Arc::clone(&connection_slots).try_acquire_owned() else {
                    drop(stream);
                    continue;
                };
                let app = app.clone();
                let mut connection_stop = stop_rx.clone();
                connections.spawn(async move {
                    let _permit = permit;
                    let mut builder = Http1Builder::new();
                    builder
                        .timer(TokioTimer::new())
                        .header_read_timeout(HTTP_HEADER_READ_TIMEOUT)
                        .max_headers(MAX_HTTP_HEADER_COUNT)
                        .max_buf_size(MAX_HTTP_BUFFER_BYTES);
                    let service = TowerToHyperService::new(app);
                    let connection = builder.serve_connection(TokioIo::new(stream), service);
                    tokio::pin!(connection);
                    let mut shutdown_started = false;
                    loop {
                        tokio::select! {
                            result = &mut connection => {
                                let _ = result;
                                break;
                            }
                            _ = wait_for_stdin_stop(&mut connection_stop), if !shutdown_started => {
                                shutdown_started = true;
                                connection.as_mut().graceful_shutdown();
                            }
                        }
                    }
                });
            }
        }
    }

    while connections.join_next().await.is_some() {}
    Ok(())
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum StdinStopReason {
    Eof,
    ReadError,
}

async fn wait_for_stdin_stop(
    receiver: &mut watch::Receiver<Option<StdinStopReason>>,
) -> StdinStopReason {
    loop {
        if let Some(reason) = *receiver.borrow_and_update() {
            return reason;
        }
        if receiver.changed().await.is_err() {
            return StdinStopReason::ReadError;
        }
    }
}

async fn await_server_drain<F, E>(
    server: std::pin::Pin<&mut F>,
    timeout: Duration,
) -> Result<(), ()>
where
    F: std::future::Future<Output = Result<(), E>> + ?Sized,
{
    tokio::time::timeout(timeout, server)
        .await
        .map_err(|_| ())?
        .map_err(|_| ())
}

fn exit_after_server(
    server_result: Result<(), ()>,
    stop_reason: Option<StdinStopReason>,
    state: &ReplayState,
) -> Result<(), ()> {
    server_result?;
    if stop_reason != Some(StdinStopReason::Eof) {
        Err(())
    } else {
        let runtime = state.0.lock().map_err(|_| ())?;
        if runtime.successfully_processed_record_count == runtime.expected_record_count {
            Ok(())
        } else {
            Err(())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::SocketAddr;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    const RUN_ID: &str = "550e8400-e29b-41d4-a716-446655440000";
    const CAPABILITY: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

    fn replay_args() -> Vec<OsString> {
        [
            "--gsi-replay-test",
            "--expected-binary-sha256",
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
            "--first-sequence",
            "10",
            "--expected-record-count",
            "2",
        ]
        .into_iter()
        .map(OsString::from)
        .collect()
    }

    #[test]
    fn default_startup_does_not_select_the_replay_host() {
        assert!(matches!(
            classify_startup(&[], true),
            StartupDecision::Normal
        ));
    }

    #[test]
    fn release_build_fails_closed_when_replay_mode_is_requested() {
        assert!(matches!(
            classify_startup(&replay_args(), false),
            StartupDecision::ReleaseRejected
        ));
    }

    #[test]
    fn capability_comparison_accepts_only_the_exact_secret() {
        let expected = [0xaa; 32];
        let matching = [0xaa; 32];
        let different = [0xab; 32];

        assert!(capability_matches(&matching, &expected));
        assert!(!capability_matches(&different, &expected));
    }

    #[test]
    fn elapsed_milliseconds_use_canonical_non_overflowing_decimal_values() {
        assert_eq!(parse_decimal_u64("0"), Some(0));
        assert_eq!(parse_decimal_u64(&u64::MAX.to_string()), Some(u64::MAX));
        for invalid in ["", "00", "+1", "-1", " 1", "18446744073709551616"] {
            assert_eq!(
                parse_decimal_u64(invalid),
                None,
                "invalid value {invalid:?}"
            );
        }
    }

    #[test]
    fn replay_launch_requires_hash_and_bounded_source_sequence() {
        let decision = classify_startup(&replay_args(), true);
        let StartupDecision::Run(options) = decision else {
            panic!("valid debug replay args must select the isolated host");
        };
        assert_eq!(options.first_sequence, 10);
        assert_eq!(options.expected_record_count, 2);
        assert_eq!(
            options.expected_binary_sha256,
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
        );

        let mut missing_replay_flag = replay_args();
        missing_replay_flag.remove(0);
        assert!(matches!(
            classify_startup(&missing_replay_flag, true),
            StartupDecision::Invalid
        ));

        let mut missing = replay_args();
        missing.pop();
        assert!(matches!(
            classify_startup(&missing, true),
            StartupDecision::Invalid
        ));

        let mut duplicate = replay_args();
        duplicate.extend([OsString::from("--first-sequence"), OsString::from("11")]);
        assert!(matches!(
            classify_startup(&duplicate, true),
            StartupDecision::Invalid
        ));

        let mut zero_count = replay_args();
        *zero_count.last_mut().unwrap() = OsString::from("0");
        assert!(matches!(
            classify_startup(&zero_count, true),
            StartupDecision::Invalid
        ));

        let mut zero_sequence = replay_args();
        zero_sequence[4] = OsString::from("0");
        let StartupDecision::Run(options) = classify_startup(&zero_sequence, true) else {
            panic!("source sequence zero is valid");
        };
        assert_eq!(options.first_sequence, 0);

        let mut overflow = replay_args();
        overflow[4] = OsString::from(u64::MAX.to_string());
        *overflow.last_mut().unwrap() = OsString::from("1");
        assert!(matches!(
            classify_startup(&overflow, true),
            StartupDecision::Invalid
        ));
    }

    #[test]
    fn replay_option_namespace_fails_closed_for_exact_and_attached_forms() {
        for argument in [
            REPLAY_FLAG,
            "--gsi-replay-test=1",
            RECORD_COUNT_FLAG,
            "--expected-record-count=2",
        ] {
            let args = [OsString::from(argument)];
            assert!(matches!(
                classify_startup(&args, true),
                StartupDecision::Invalid
            ));
            assert!(matches!(
                classify_startup(&args, false),
                StartupDecision::ReleaseRejected
            ));
            assert!(crate::replay_test_arguments_present(&args));
        }

        assert!(crate::replay_test_arguments_present(&[OsString::from(
            "--gsi-replay-unknown-option"
        )]));
    }

    #[test]
    fn binary_hash_and_stdout_pipe_are_required_before_binding() {
        assert!(verify_binary_sha256(
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
        ));
        assert!(!verify_binary_sha256(
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
            "1123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
        ));
        assert_eq!(
            isolation_gate(true, true, false, true),
            Err(IsolationFailure::StdoutNotPipe)
        );
        assert_eq!(
            isolation_gate(true, false, true, true),
            Err(IsolationFailure::StdinNotPipe)
        );
        assert_eq!(
            isolation_gate(true, true, true, false),
            Err(IsolationFailure::BinaryHashMismatch)
        );
        assert_eq!(
            isolation_gate(false, true, true, true),
            Err(IsolationFailure::ReleaseBuild)
        );
        assert_eq!(isolation_gate(true, true, true, true), Ok(()));
    }

    #[tokio::test]
    async fn stdin_eof_and_read_error_have_distinct_stop_reasons() {
        for expected in [StdinStopReason::Eof, StdinStopReason::ReadError] {
            let (sender, mut receiver) = watch::channel(None::<StdinStopReason>);
            sender.send(Some(expected)).unwrap();
            assert_eq!(wait_for_stdin_stop(&mut receiver).await, expected);
        }
    }

    #[tokio::test]
    async fn graceful_shutdown_drain_has_a_finite_deadline() {
        let mut stalled = std::future::pending::<Result<(), ()>>();
        let result =
            await_server_drain(std::pin::Pin::new(&mut stalled), Duration::from_millis(1)).await;
        assert_eq!(result, Err(()));
    }

    #[test]
    fn completed_server_does_not_hide_a_stdin_read_error() {
        let incomplete = test_state(10, 2);
        let complete = test_state(10, 1);
        complete
            .0
            .lock()
            .unwrap()
            .successfully_processed_record_count = 1;
        assert_eq!(
            exit_after_server(Ok(()), Some(StdinStopReason::ReadError), &complete),
            Err(())
        );
        assert_eq!(
            exit_after_server(Ok(()), Some(StdinStopReason::Eof), &incomplete),
            Err(())
        );
        assert_eq!(
            exit_after_server(Ok(()), Some(StdinStopReason::Eof), &complete),
            Ok(())
        );
        assert_eq!(exit_after_server(Ok(()), None, &complete), Err(()));
    }

    #[test]
    fn early_eof_before_the_declared_successful_record_count_fails() {
        let state = test_state(10, 2);
        assert_eq!(
            exit_after_server(Ok(()), Some(StdinStopReason::Eof), &state),
            Err(())
        );
    }

    #[test]
    fn mapless_empty_gsi_before_terminal_consumes_sequence_but_does_not_satisfy_eof() {
        let state = test_state(10, 1);
        {
            let mut runtime = state.0.lock().unwrap();
            assert_eq!(runtime.sessions.snapshot().session_lifecycle, None);
            runtime
                .reserve_sequence(RUN_ID, CAPABILITY, 10, 0)
                .expect("first declared sequence is reserved");
            assert_eq!(
                runtime.process_body(
                    10,
                    0,
                    encode_hex(ring::digest::digest(&SHA256, b"{}").as_ref()),
                    "{}"
                ),
                Err(StatusCode::UNPROCESSABLE_ENTITY)
            );
            assert_eq!(runtime.consumed_record_count, 1);
            assert_eq!(runtime.successfully_processed_record_count, 0);
            assert_eq!(runtime.next_sequence, 11);
            assert_eq!(runtime.last_elapsed_ms, Some(0));
            assert_eq!(
                runtime.reserve_sequence(RUN_ID, CAPABILITY, 10, 0),
                Err(StatusCode::CONFLICT),
                "a reserved source sequence cannot be retried within the run"
            );
        }
        assert_eq!(
            exit_after_server(Ok(()), Some(StdinStopReason::Eof), &state),
            Err(())
        );
    }

    #[test]
    fn successfully_processed_payload_satisfies_exact_eof_count() {
        let state = test_state(10, 1);
        {
            let mut runtime = state.0.lock().unwrap();
            runtime
                .reserve_sequence(RUN_ID, CAPABILITY, 10, 0)
                .expect("first declared sequence is reserved");
            let body = synthetic_payload(0, 0, 80).to_string();
            runtime
                .process_body(
                    10,
                    0,
                    encode_hex(ring::digest::digest(&SHA256, body.as_bytes()).as_ref()),
                    &body,
                )
                .expect("valid replay payload is processed");
            assert_eq!(runtime.successfully_processed_record_count, 1);
        }
        assert_eq!(
            exit_after_server(Ok(()), Some(StdinStopReason::Eof), &state),
            Ok(())
        );
    }

    #[tokio::test]
    async fn replay_reports_ignored_terminal_observations_and_satisfies_eof_count() {
        let state = test_state(0, 4);
        let (address, server) = test_server(state.clone()).await;
        let live = synthetic_payload(0, 0, 80).to_string();
        let mut end_payload = synthetic_payload(0, 0, 80);
        end_payload["map"]["game_state"] = "DOTA_GAMERULES_STATE_POST_GAME".into();
        let ended = end_payload.to_string();
        let repeated_end = ended.clone();
        let stale_live = synthetic_payload(1, 1, 20).to_string();
        let records = [&live, &ended, &repeated_end, &stale_live];
        let mut outcomes = Vec::with_capacity(records.len());

        for (sequence, payload) in records.iter().enumerate() {
            let (status, body) = request_with_elapsed(
                RequestSpec::replay(address, sequence as u64),
                sequence as u64,
                payload.as_str(),
            )
            .await;
            assert_eq!(status, 200, "valid replay record {sequence} is accepted");
            outcomes.push(serde_json::from_str::<serde_json::Value>(&body).unwrap());
        }

        assert_eq!(outcomes.len(), 4);
        assert_eq!(
            outcomes
                .iter()
                .map(|outcome| outcome["session_observation_status"].as_str().unwrap())
                .collect::<Vec<_>>(),
            ["applied", "applied", "ignored_terminal", "ignored_terminal"]
        );
        assert_eq!(
            outcomes
                .iter()
                .map(|outcome| outcome["lifecycle"].as_str().unwrap())
                .collect::<Vec<_>>(),
            ["live", "end", "end", "end"]
        );
        let session_epoch = outcomes[0]["session_epoch"].as_u64().unwrap();
        assert!(session_epoch > 0);
        assert!(outcomes
            .iter()
            .all(|outcome| outcome["session_epoch"] == session_epoch));
        for outcome in &outcomes[2..] {
            assert!(outcome["safety_event"].is_null());
            assert_eq!(outcome["announcer_candidates"], serde_json::json!([]));
            assert!(outcome["selected_announcer"].is_null());
            assert_eq!(outcome["parsed_status"], "pass");
        }

        let runtime = state.0.lock().unwrap();
        assert_eq!(
            runtime.downstream_detector_dispatch_count, 4,
            "ignored terminal observations still pass through detector gates"
        );
        assert_eq!(runtime.successfully_processed_record_count, 4);
        assert_eq!(runtime.consumed_record_count, 4);
        assert_eq!(runtime.next_sequence, 4);
        assert_eq!(runtime.last_elapsed_ms, Some(3));
        drop(runtime);
        assert_eq!(
            exit_after_server(Ok(()), Some(StdinStopReason::Eof), &state),
            Ok(())
        );
        server.abort();
    }

    #[tokio::test]
    async fn trailing_empty_player_provider_envelope_is_a_non_match_lifecycle_skip() {
        let state = test_state(10, 2);
        let (address, server) = test_server(state.clone()).await;
        let mut post_game = synthetic_payload(0, 0, 80);
        post_game["map"]["game_state"] = "DOTA_GAMERULES_STATE_POST_GAME".into();
        let post_game_body = post_game.to_string();
        let (status, response_body) =
            request_with_elapsed(RequestSpec::replay(address, 10), 1000, &post_game_body).await;
        assert_eq!(status, 200);
        let post_game_outcome: serde_json::Value = serde_json::from_str(&response_body).unwrap();
        assert_eq!(post_game_outcome["lifecycle"], "end");

        let (terminal_snapshot, detector_dispatches_before_skip) = {
            let runtime = state.0.lock().unwrap();
            (
                runtime.sessions.snapshot(),
                runtime.downstream_detector_dispatch_count,
            )
        };
        assert_eq!(
            terminal_snapshot.session_lifecycle,
            Some(crate::runtime::MatchLifecycle::End)
        );

        let trailing_envelope = VALID_TERMINAL_ENVELOPE;
        let expected_hash =
            encode_hex(ring::digest::digest(&SHA256, trailing_envelope.as_bytes()).as_ref());
        let (status, response_body) =
            request_with_elapsed(RequestSpec::replay(address, 11), 1037, trailing_envelope).await;
        assert_eq!(status, 200, "terminal envelope is accepted as a skip");
        let outcome: serde_json::Value = serde_json::from_str(&response_body).unwrap();
        assert_eq!(outcome["record_kind"], "non_match_lifecycle");
        assert_eq!(outcome["parsed_status"], "skip");
        assert_eq!(outcome["session_observation_status"], "not_applicable");
        assert_eq!(outcome["raw_body_sha256"], expected_hash);
        assert_eq!(outcome["source_sequence"], 11);
        assert_eq!(outcome["elapsed_ms"], 1037);
        assert_eq!(outcome["session_epoch"], terminal_snapshot.session_epoch);
        assert_eq!(outcome["lifecycle"], "end");
        assert!(outcome["safety_event"].is_null());
        assert_eq!(outcome["announcer_candidates"], serde_json::json!([]));
        assert!(outcome["selected_announcer"].is_null());

        let runtime = state.0.lock().unwrap();
        assert_eq!(runtime.sessions.snapshot(), terminal_snapshot);
        assert_eq!(
            runtime.downstream_detector_dispatch_count, detector_dispatches_before_skip,
            "a lifecycle skip does not dispatch to safety or announcer detectors"
        );
        assert_eq!(runtime.consumed_record_count, 2);
        assert_eq!(runtime.successfully_processed_record_count, 2);
        assert_eq!(runtime.next_sequence, 12);
        assert_eq!(runtime.last_elapsed_ms, Some(1037));
        drop(runtime);
        assert_eq!(
            exit_after_server(Ok(()), Some(StdinStopReason::Eof), &state),
            Ok(())
        );
        server.abort();
    }

    #[tokio::test]
    async fn explicit_mapless_menu_activity_is_a_non_match_lifecycle_skip() {
        let state = test_state(4, 1);
        let (address, server) = test_server(state.clone()).await;
        let initial_session = state.0.lock().unwrap().sessions.snapshot();
        let body = VALID_MENU_BODY;
        let expected_hash = encode_hex(ring::digest::digest(&SHA256, body.as_bytes()).as_ref());
        let (status, response_body) =
            request_with_elapsed(RequestSpec::replay(address, 4), 5, body).await;
        assert_eq!(status, 200, "explicit menu activity is accepted as a skip");
        let outcome: serde_json::Value = serde_json::from_str(&response_body).unwrap();
        assert_eq!(outcome["record_kind"], "non_match_lifecycle");
        assert_eq!(outcome["parsed_status"], "skip");
        assert_eq!(outcome["session_observation_status"], "not_applicable");
        assert_eq!(outcome["raw_body_sha256"], expected_hash);
        assert_eq!(outcome["source_sequence"], 4);
        assert_eq!(outcome["elapsed_ms"], 5);
        assert_eq!(outcome["session_epoch"], 0);
        assert!(outcome["safety_event"].is_null());
        assert_eq!(outcome["announcer_candidates"], serde_json::json!([]));
        assert!(outcome["selected_announcer"].is_null());

        let runtime = state.0.lock().unwrap();
        assert_eq!(runtime.sessions.snapshot(), initial_session);
        assert_eq!(runtime.downstream_detector_dispatch_count, 0);
        assert_eq!(runtime.consumed_record_count, 1);
        assert_eq!(runtime.successfully_processed_record_count, 1);
        drop(runtime);
        assert_eq!(
            exit_after_server(Ok(()), Some(StdinStopReason::Eof), &state),
            Ok(())
        );
        server.abort();
    }

    #[tokio::test]
    async fn mapless_menu_skip_after_live_state_reports_unknown_without_mutation() {
        let state = test_state(30, 2);
        let (address, server) = test_server(state.clone()).await;
        let live_body = synthetic_payload(0, 0, 80).to_string();
        let (status, response_body) =
            request_with_elapsed(RequestSpec::replay(address, 30), 30, &live_body).await;
        assert_eq!(status, 200);
        let live_outcome: serde_json::Value = serde_json::from_str(&response_body).unwrap();
        assert_eq!(live_outcome["lifecycle"], "live");

        let (live_snapshot, detector_dispatches_before_skip) = {
            let runtime = state.0.lock().unwrap();
            (
                runtime.sessions.snapshot(),
                runtime.downstream_detector_dispatch_count,
            )
        };
        assert_eq!(
            live_snapshot.session_lifecycle,
            Some(crate::runtime::MatchLifecycle::Live)
        );

        let menu_body = VALID_MENU_BODY;
        let expected_hash =
            encode_hex(ring::digest::digest(&SHA256, menu_body.as_bytes()).as_ref());
        let (status, response_body) =
            request_with_elapsed(RequestSpec::replay(address, 31), 31, menu_body).await;
        assert_eq!(status, 200, "explicit menu activity is accepted as a skip");
        let outcome: serde_json::Value = serde_json::from_str(&response_body).unwrap();
        assert_eq!(outcome.as_object().unwrap().len(), 17);
        assert_eq!(outcome["record_kind"], "non_match_lifecycle");
        assert_eq!(outcome["parsed_status"], "skip");
        assert_eq!(outcome["session_observation_status"], "not_applicable");
        assert_eq!(outcome["raw_body_sha256"], expected_hash);
        assert_eq!(outcome["source_sequence"], 31);
        assert_eq!(outcome["elapsed_ms"], 31);
        assert_eq!(outcome["session_epoch"], live_snapshot.session_epoch);
        assert_eq!(outcome["lifecycle"], "unknown");
        assert!(outcome["safety_event"].is_null());
        assert_eq!(outcome["announcer_candidates"], serde_json::json!([]));
        assert!(outcome["selected_announcer"].is_null());

        let runtime = state.0.lock().unwrap();
        assert_eq!(runtime.sessions.snapshot(), live_snapshot);
        assert_eq!(
            runtime.downstream_detector_dispatch_count, detector_dispatches_before_skip,
            "the menu skip does not dispatch to safety or announcer detectors"
        );
        assert_eq!(runtime.consumed_record_count, 2);
        assert_eq!(runtime.successfully_processed_record_count, 2);
        drop(runtime);
        assert_eq!(
            exit_after_server(Ok(()), Some(StdinStopReason::Eof), &state),
            Ok(())
        );
        server.abort();
    }

    #[tokio::test]
    async fn terminal_envelope_rejects_provider_extensions_and_abandon_lifecycle() {
        let state = test_state(50, 4);
        let (address, server) = test_server(state.clone()).await;
        let mut post_game = synthetic_payload(0, 0, 80);
        post_game["map"]["game_state"] = "DOTA_GAMERULES_STATE_POST_GAME".into();
        let post_game_body = post_game.to_string();
        let (status, _) =
            request_with_elapsed(RequestSpec::replay(address, 50), 1000, &post_game_body).await;
        assert_eq!(status, 200);

        let extra_provider_field = r#"{"player":{},"provider":{"appid":570,"name":"synthetic","timestamp":1,"version":1,"steamid":"synthetic"}}"#;
        let (status, _) =
            request_with_elapsed(RequestSpec::replay(address, 51), 1001, extra_provider_field)
                .await;
        assert_eq!(
            status,
            StatusCode::UNPROCESSABLE_ENTITY,
            "terminal envelope provider keys must match the accepted shape exactly"
        );
        let extra_top_level_field = r#"{"player":{},"provider":{"appid":570,"name":"synthetic","timestamp":1,"version":1},"unexpected":true}"#;
        let (status, _) = request_with_elapsed(
            RequestSpec::replay(address, 52),
            1002,
            extra_top_level_field,
        )
        .await;
        assert_eq!(
            status,
            StatusCode::UNPROCESSABLE_ENTITY,
            "terminal envelope top-level keys must match the accepted shape exactly"
        );
        let duplicate_provider_appid = r#"{"player":{},"provider":{"appid":570,"appid":570,"name":"synthetic","timestamp":1,"version":1}}"#;
        let (status, _) = request_with_elapsed(
            RequestSpec::replay(address, 53),
            1003,
            duplicate_provider_appid,
        )
        .await;
        assert_eq!(
            status,
            StatusCode::UNPROCESSABLE_ENTITY,
            "duplicate terminal provider members are rejected from the raw body"
        );
        {
            let runtime = state.0.lock().unwrap();
            assert_eq!(runtime.consumed_record_count, 4);
            assert_eq!(runtime.successfully_processed_record_count, 1);
            assert_eq!(runtime.next_sequence, 54);
        }
        assert_eq!(
            exit_after_server(Ok(()), Some(StdinStopReason::Eof), &state),
            Err(()),
            "rejected terminal-envelope extensions fail exact EOF accounting"
        );
        server.abort();

        let abandon_state = test_state(70, 1);
        {
            let mut runtime = abandon_state.0.lock().unwrap();
            runtime
                .sessions
                .observe(crate::runtime::MatchLifecycle::Abandon, None, 0);
            runtime
                .reserve_sequence(RUN_ID, CAPABILITY, 70, 1)
                .expect("abandon fixture reserves its source sequence");
            assert_eq!(
                runtime.process_body(
                    70,
                    1,
                    encode_hex(
                        ring::digest::digest(&SHA256, VALID_TERMINAL_ENVELOPE.as_bytes()).as_ref(),
                    ),
                    VALID_TERMINAL_ENVELOPE,
                ),
                Err(StatusCode::UNPROCESSABLE_ENTITY),
                "abandon is not an observed POST_GAME/End lifecycle"
            );
            assert_eq!(runtime.consumed_record_count, 1);
            assert_eq!(runtime.successfully_processed_record_count, 0);
            assert_eq!(runtime.next_sequence, 71);
        }
        assert_eq!(
            exit_after_server(Ok(()), Some(StdinStopReason::Eof), &abandon_state),
            Err(()),
            "an envelope after abandon fails exact EOF accounting"
        );
    }

    #[test]
    fn ambiguous_mapless_and_partial_or_conflicting_map_payloads_are_rejected() {
        let mut conflicting = synthetic_payload(0, 0, 80);
        conflicting["player"]["activity"] = "menu".into();
        let conflicting = conflicting.to_string();
        let cases = [
            ("empty object", "{}"),
            (
                "empty player/provider before terminal state",
                VALID_TERMINAL_ENVELOPE,
            ),
            (
                "player without an explicit non-match activity",
                r#"{"player":{}}"#,
            ),
            (
                "mapless playing activity",
                r#"{"player":{"activity":"playing"}}"#,
            ),
            (
                "menu with an unknown top-level field",
                r#"{"player":{"activity":"menu"},"unexpected":true}"#,
            ),
            (
                "menu with an unknown player field",
                r#"{"player":{"activity":"menu","unexpected":1}}"#,
            ),
            (
                "menu with a malformed activity value",
                r#"{"player":{"activity":1}}"#,
            ),
            (
                "menu with duplicate player activity members",
                r#"{"player":{"activity":"playing","activ\u0069ty":"menu"}}"#,
            ),
            (
                "menu with a malformed numeric player value",
                r#"{"player":{"activity":"menu","kills":"0"}}"#,
            ),
            (
                "menu with an out-of-range numeric player value",
                r#"{"player":{"activity":"menu","kills":100001}}"#,
            ),
            (
                "menu with a malformed string player value",
                r#"{"player":{"activity":"menu","team_name":1}}"#,
            ),
            (
                "menu with an unknown provider field",
                r#"{"player":{"activity":"menu"},"provider":{"unexpected":true}}"#,
            ),
            (
                "menu with a malformed provider name",
                r#"{"player":{"activity":"menu"},"provider":{"name":1}}"#,
            ),
            (
                "menu with an invalid provider app id",
                r#"{"player":{"activity":"menu"},"provider":{"appid":1}}"#,
            ),
            (
                "menu with a malformed provider timestamp",
                r#"{"player":{"activity":"menu"},"provider":{"timestamp":"1"}}"#,
            ),
            (
                "null map with a menu marker",
                r#"{"map":null,"player":{"activity":"menu"}}"#,
            ),
            (
                "partial active-match snapshot",
                r#"{"map":{"game_state":"DOTA_GAMERULES_STATE_GAME_IN_PROGRESS"},"player":{"activity":"playing","team_name":"radiant"}}"#,
            ),
            (
                "conflicting menu marker and match map",
                conflicting.as_str(),
            ),
        ];

        for (index, (description, body)) in cases.iter().enumerate() {
            let sequence = 20 + index as u64;
            let state = test_state(sequence, 1);
            {
                let mut runtime = state.0.lock().unwrap();
                assert_eq!(runtime.sessions.snapshot().session_lifecycle, None);
                runtime
                    .reserve_sequence(RUN_ID, CAPABILITY, sequence, 0)
                    .expect("first record is reserved");
                assert_eq!(
                    runtime.process_body(
                        sequence,
                        0,
                        encode_hex(ring::digest::digest(&SHA256, body.as_bytes()).as_ref()),
                        body,
                    ),
                    Err(StatusCode::UNPROCESSABLE_ENTITY),
                    "{description} remains ambiguous or invalid"
                );
                assert_eq!(runtime.consumed_record_count, 1);
                assert_eq!(runtime.successfully_processed_record_count, 0);
                assert_eq!(runtime.next_sequence, sequence + 1);
            }
            assert_eq!(
                exit_after_server(Ok(()), Some(StdinStopReason::Eof), &state),
                Err(()),
                "rejected {description} must fail exact EOF accounting"
            );
        }
    }

    #[tokio::test]
    async fn source_match_identity_ignores_late_ticks_and_isolates_the_next_match() {
        const FIRST_MATCH_ID: &str = "1000000001";
        const NEXT_MATCH_ID: &str = "1000000002";

        let state = test_state(0, 4);
        let (address, server) = test_server(state.clone()).await;
        let mut live = synthetic_payload(0, 0, 80);
        live["map"]["clock_time"] = 900.into();
        live["map"]["matchid"] = FIRST_MATCH_ID.into();
        let mut ended = live.clone();
        ended["map"]["clock_time"] = 1200.into();
        ended["map"]["game_state"] = "DOTA_GAMERULES_STATE_POST_GAME".into();
        let mut late_tick = live.clone();
        late_tick["map"]["clock_time"] = 1200.into();
        let mut next_match = live.clone();
        next_match["map"]["clock_time"] = 0.into();
        next_match["map"]["matchid"] = NEXT_MATCH_ID.into();
        let records = [live, ended, late_tick, next_match].map(|payload| payload.to_string());

        let mut outcomes = Vec::with_capacity(records.len());
        for (sequence, payload) in records.iter().enumerate() {
            let (status, body) = request_with_elapsed(
                RequestSpec::replay(address, sequence as u64),
                sequence as u64,
                payload,
            )
            .await;
            assert_eq!(status, 200);
            outcomes.push(serde_json::from_str::<serde_json::Value>(&body).unwrap());
        }

        assert_eq!(
            outcomes
                .iter()
                .map(|outcome| outcome["session_observation_status"].as_str().unwrap())
                .collect::<Vec<_>>(),
            ["applied", "applied", "ignored_terminal", "applied"]
        );
        assert_eq!(
            outcomes[2]["session_epoch"], outcomes[0]["session_epoch"],
            "a late tick from the ended source match stays in its terminal epoch"
        );
        assert_eq!(
            outcomes[3]["session_epoch"],
            outcomes[0]["session_epoch"].as_u64().unwrap() + 1,
            "a new source match starts a fresh isolated epoch"
        );
        for outcome in &outcomes {
            let serialized = serde_json::to_string(outcome).unwrap();
            assert!(!serialized.contains(FIRST_MATCH_ID));
            assert!(!serialized.contains(NEXT_MATCH_ID));
        }

        server.abort();
    }

    #[tokio::test]
    async fn missing_source_match_id_uses_the_post_game_clock_reset_heuristic() {
        let state = test_state(0, 4);
        let (address, server) = test_server(state.clone()).await;
        let mut live = synthetic_payload(0, 0, 80);
        live["map"]["clock_time"] = 900.into();
        live.as_object_mut()
            .unwrap()
            .get_mut("map")
            .unwrap()
            .as_object_mut()
            .unwrap()
            .remove("matchid");
        let mut ended = live.clone();
        ended["map"]["clock_time"] = 1200.into();
        ended["map"]["game_state"] = "DOTA_GAMERULES_STATE_POST_GAME".into();
        let mut late_tick = live.clone();
        late_tick["map"]["clock_time"] = 1200.into();
        let mut next_match = live.clone();
        next_match["map"]["clock_time"] = 0.into();
        let records = [live, ended, late_tick, next_match].map(|payload| payload.to_string());

        let mut outcomes = Vec::with_capacity(records.len());
        for (sequence, payload) in records.iter().enumerate() {
            let (status, body) = request_with_elapsed(
                RequestSpec::replay(address, sequence as u64),
                sequence as u64,
                payload,
            )
            .await;
            assert_eq!(status, 200);
            outcomes.push(serde_json::from_str::<serde_json::Value>(&body).unwrap());
        }

        assert_eq!(
            outcomes
                .iter()
                .map(|outcome| outcome["session_observation_status"].as_str().unwrap())
                .collect::<Vec<_>>(),
            ["applied", "applied", "ignored_terminal", "applied"]
        );
        assert_eq!(outcomes[2]["session_epoch"], outcomes[0]["session_epoch"]);
        assert_eq!(
            outcomes[3]["session_epoch"],
            outcomes[0]["session_epoch"].as_u64().unwrap() + 1
        );

        server.abort();
    }

    #[test]
    fn identical_replay_state_input_and_elapsed_produce_identical_outcomes() {
        fn process_fixed_record() -> ReplayOutcome {
            let state = test_state(10, 1);
            let body = synthetic_payload(1, 1, 20).to_string();
            let mut runtime = state.0.lock().unwrap();
            runtime
                .reserve_sequence(RUN_ID, CAPABILITY, 10, 1_000)
                .expect("fixed source sequence is reserved");
            runtime
                .process_body(
                    10,
                    1_000,
                    encode_hex(ring::digest::digest(&SHA256, body.as_bytes()).as_ref()),
                    &body,
                )
                .expect("fixed replay record is processed")
        }

        assert_eq!(process_fixed_record(), process_fixed_record());
    }

    #[test]
    fn host_listener_is_ipv4_loopback_and_never_uses_gsi_port() {
        let listener = bind_loopback_ephemeral().unwrap();
        let address = listener.local_addr().unwrap();
        assert_eq!(
            address,
            SocketAddr::V4(SocketAddrV4::new(Ipv4Addr::LOCALHOST, address.port()))
        );
        assert_ne!(address.port(), 3000);
    }

    #[test]
    fn replay_parser_replaces_real_looking_source_identity_without_changing_body() {
        let mut payload = synthetic_payload(0, 0, 80);
        payload["map"]["matchid"] = "1000000001".into();
        payload["player"]["steamid"] = "76561199999999999".into();
        let body = serde_json::to_string(&payload).unwrap();
        let original_bytes = body.as_bytes().to_vec();
        let original_sha256 = encode_hex(ring::digest::digest(&SHA256, body.as_bytes()).as_ref());

        let (tick, source_match_id) =
            match crate::gsi::parse_gsi_payload_for_replay_with_match_id(&body).unwrap() {
                crate::gsi::ReplayGsiPayload::MatchState { tick, match_id } => (tick, match_id),
                crate::gsi::ReplayGsiPayload::NonMatchLifecycle(_) => {
                    panic!("map-bearing snapshot must parse as a match state")
                }
            };

        assert_eq!(tick.steamid, crate::gsi::SYNTHETIC_REPLAY_PLAYER_ID);
        assert!(tick.local_player_verified);
        assert_eq!(tick.team_name, "radiant");
        assert_eq!(source_match_id.as_deref(), Some("1000000001"));
        assert_eq!(body.as_bytes(), original_bytes);
        assert_eq!(
            encode_hex(ring::digest::digest(&SHA256, body.as_bytes()).as_ref()),
            original_sha256
        );

        payload["player"]
            .as_object_mut()
            .unwrap()
            .remove("activity");
        let absent_activity = serde_json::to_string(&payload).unwrap();
        let (tick, _) =
            match crate::gsi::parse_gsi_payload_for_replay_with_match_id(&absent_activity).unwrap()
            {
                crate::gsi::ReplayGsiPayload::MatchState { tick, match_id } => (tick, match_id),
                crate::gsi::ReplayGsiPayload::NonMatchLifecycle(_) => {
                    panic!("map-bearing snapshot must parse as a match state")
                }
            };
        assert_eq!(tick.steamid, crate::gsi::SYNTHETIC_REPLAY_PLAYER_ID);
        assert!(tick.local_player_verified);
    }

    #[test]
    fn descriptor_uses_the_frozen_snake_case_contract_and_all_isolation_flags() {
        let descriptor = TestTargetDescriptor {
            endpoint: "http://127.0.0.1:45678/__gtrace/replay".into(),
            run_id: RUN_ID.into(),
            capability: CAPABILITY.into(),
            first_sequence: 10,
            expected_record_count: 2,
            elapsed_ms_header: ELAPSED_MS_HEADER,
            time_policy: TIME_POLICY,
            reserved_request_failure_policy: RESERVED_FAILURE_POLICY,
            binary_sha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
                .into(),
            binary_sha256_verified: true,
            isolation_flags: IsolationFlags::VERIFIED,
            test_identity: "synthetic",
            real_identity: "not_run",
        };
        let json = serde_json::to_value(descriptor).unwrap();
        assert_eq!(json.as_object().unwrap().len(), 13);
        assert_eq!(json["run_id"], RUN_ID);
        assert_eq!(json["first_sequence"], 10);
        assert_eq!(json["expected_record_count"], 2);
        assert_eq!(json["elapsed_ms_header"], ELAPSED_MS_HEADER);
        assert_eq!(json["time_policy"], TIME_POLICY);
        assert_eq!(
            json["reserved_request_failure_policy"],
            RESERVED_FAILURE_POLICY
        );
        assert_eq!(json["binary_sha256_verified"], true);
        assert_eq!(json["test_identity"], "synthetic");
        assert_eq!(json["real_identity"], "not_run");
        assert_eq!(
            json["isolation_flags"],
            serde_json::json!({
                "debug_build": true,
                "test_host_mode": true,
                "loopback_only": true,
                "dota_config_sync_disabled": true,
                "dota_process_watchdog_disabled": true,
                "dxgi_capture_disabled": true,
                "external_side_effects_disabled": true,
                "production_persistence_disabled": true
            })
        );
        assert!(json.get("runUuid").is_none());
    }

    #[test]
    fn replay_time_reservation_rejects_backwards_time_without_consuming_sequence() {
        let state = test_state(10, 3);
        let mut runtime = state.0.lock().unwrap();

        assert_eq!(
            runtime.reserve_sequence(RUN_ID, CAPABILITY, 10, 700),
            Ok(())
        );
        runtime.request_in_flight = false;

        assert_eq!(
            runtime.reserve_sequence(RUN_ID, CAPABILITY, 11, 699),
            Err(StatusCode::CONFLICT)
        );
        assert_eq!(runtime.next_sequence, 11);
        assert_eq!(runtime.consumed_record_count, 1);
        assert_eq!(runtime.last_elapsed_ms, Some(700));

        assert_eq!(
            runtime.reserve_sequence(RUN_ID, CAPABILITY, 11, 700),
            Ok(()),
            "equal elapsed values are allowed by the nondecreasing policy"
        );
    }

    #[tokio::test]
    async fn replay_route_authenticates_and_accepts_only_the_exact_sequential_range() {
        let (address, server) = test_server(test_state(10, 2)).await;
        let payload = format!(" \r\n{}\n", synthetic_payload(0, 0, 80));

        let (status, _) = request(
            address,
            "POST",
            "/__gtrace/replay",
            RUN_ID,
            "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            10,
            &payload,
        )
        .await;
        assert_eq!(status, 401);

        let (status, _) = request(
            address,
            "POST",
            "/__gtrace/replay",
            "550e8400-e29b-41d4-a716-446655440001",
            CAPABILITY,
            10,
            &payload,
        )
        .await;
        assert_eq!(status, 401);

        let (status, _) = request(address, "POST", "/gsi", RUN_ID, CAPABILITY, 10, &payload).await;
        assert_eq!(status, 404);

        let (status, _) = request(
            address,
            "GET",
            "/__gtrace/replay",
            RUN_ID,
            CAPABILITY,
            10,
            &payload,
        )
        .await;
        assert_eq!(status, 405);

        let (status, body) = request(
            address,
            "POST",
            "/__gtrace/replay",
            RUN_ID,
            CAPABILITY,
            11,
            &payload,
        )
        .await;
        assert_eq!(status, 409, "out-of-order source sequence must fail");
        assert_eq!(body, "rejected");

        let (status, body) = request(
            address,
            "POST",
            "/__gtrace/replay",
            RUN_ID,
            CAPABILITY,
            10,
            &payload,
        )
        .await;
        assert_eq!(status, 200);
        let outcome: serde_json::Value = serde_json::from_str(&body).unwrap();
        assert_eq!(outcome.as_object().unwrap().len(), 17);
        for key in [
            "record_kind",
            "parsed_status",
            "run_id",
            "raw_body_sha256",
            "source_sequence",
            "elapsed_ms",
            "time_policy",
            "session_observation_status",
            "session_epoch",
            "lifecycle",
            "safety_event",
            "announcer_candidates",
            "selected_announcer",
            "suppression_reason",
            "media_result",
            "test_identity",
            "real_identity",
        ] {
            assert!(outcome.get(key).is_some(), "missing outcome key {key}");
        }
        assert_eq!(outcome["run_id"], RUN_ID);
        let expected_raw_body_sha256 =
            encode_hex(ring::digest::digest(&SHA256, payload.as_bytes()).as_ref());
        assert_eq!(
            outcome["raw_body_sha256"].as_str(),
            Some(expected_raw_body_sha256.as_str())
        );
        assert_eq!(outcome["elapsed_ms"], 10);
        assert_eq!(outcome["time_policy"], TIME_POLICY);
        assert_eq!(outcome["session_observation_status"], "applied");
        assert!(outcome["session_epoch"].as_u64().unwrap() > 0);
        assert_eq!(outcome["lifecycle"], "live");
        assert!(outcome["safety_event"].is_null());
        assert_eq!(outcome["suppression_reason"], "test_host_never_plays_audio");
        assert_eq!(outcome["media_result"], "not_run");
        assert!(body.contains("\"parsed_status\":\"pass\""));
        assert!(body.contains("\"source_sequence\":10"));
        assert!(body.contains("\"real_identity\":\"not_run\""));
        assert!(body.contains("\"test_identity\":\"synthetic\""));
        assert!(!body.contains(CAPABILITY));
        assert!(!body.contains("76561199999999999"));
        assert!(!body.contains("1000000001"));
        assert!(!body.contains("gtrace-synthetic-player"));
        assert!(!body.contains("Synthetic Replay Player"));
        assert!(!body.contains("npc_dota_hero"));
        assert!(!body.contains(&payload));

        let (status, _) = request(
            address,
            "POST",
            "/__gtrace/replay",
            RUN_ID,
            CAPABILITY,
            10,
            &payload,
        )
        .await;
        assert_eq!(status, 409, "a source sequence must not replay");

        let second = synthetic_payload(1, 1, 20).to_string();
        let (status, body) = request(
            address,
            "POST",
            "/__gtrace/replay",
            RUN_ID,
            CAPABILITY,
            11,
            &second,
        )
        .await;
        assert_eq!(status, 200);
        assert!(body.contains("\"parsed_status\":\"pass\""));
        assert!(body.contains("\"safety_event\":\"danger\""));
        assert!(body.contains("\"selected_announcer\":\"first_blood\""));

        let (status, _) = request(
            address,
            "POST",
            "/__gtrace/replay",
            RUN_ID,
            CAPABILITY,
            12,
            &payload,
        )
        .await;
        assert_eq!(status, 409, "the declared record count bounds replay input");
        server.abort();
    }

    #[tokio::test]
    async fn replay_requires_a_canonical_elapsed_header_before_reserving_sequence() {
        let (address, server) = test_server(test_state(5, 1)).await;
        let payload = synthetic_payload(0, 0, 80).to_string();

        let (status, response) =
            request_with_elapsed_header(RequestSpec::replay(address, 5), None, payload.as_bytes())
                .await;
        assert_eq!(status, 400);
        assert_eq!(response, "rejected");

        let (status, response) = request_with_elapsed_header(
            RequestSpec::replay(address, 5),
            Some("05"),
            payload.as_bytes(),
        )
        .await;
        assert_eq!(status, 400);
        assert_eq!(response, "rejected");

        let (status, response) = request_with_elapsed_header(
            RequestSpec::replay(address, 5),
            Some("18446744073709551616"),
            payload.as_bytes(),
        )
        .await;
        assert_eq!(status, 400);
        assert_eq!(response, "rejected");

        let (status, body) =
            request_with_elapsed(RequestSpec::replay(address, 5), 0, &payload).await;
        assert_eq!(status, 200);
        let outcome: serde_json::Value = serde_json::from_str(&body).unwrap();
        assert_eq!(outcome["elapsed_ms"], 0);
        server.abort();
    }

    #[tokio::test]
    async fn replay_rejects_duplicate_protocol_headers_before_reserving_sequence() {
        let (address, server) = test_server(test_state(5, 1)).await;
        let payload = synthetic_payload(0, 0, 80).to_string();
        let duplicate_headers = [
            ("x-gtrace-test-sequence", "6", StatusCode::CONFLICT),
            (ELAPSED_MS_HEADER, "1", StatusCode::BAD_REQUEST),
            (
                "x-gtrace-test-run",
                "550e8400-e29b-41d4-a716-446655440001",
                StatusCode::UNAUTHORIZED,
            ),
            (
                "x-gtrace-test-capability",
                "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
                StatusCode::UNAUTHORIZED,
            ),
        ];

        for (header, duplicate_value, expected_status) in duplicate_headers {
            let (status, response) = request_with_duplicate_header(
                RequestSpec::replay(address, 5),
                0,
                header,
                duplicate_value,
                &payload,
            )
            .await;
            assert_eq!(
                status,
                expected_status.as_u16(),
                "duplicate {header} header"
            );
            assert_eq!(response, "rejected");
        }

        let (status, body) =
            request_with_elapsed(RequestSpec::replay(address, 5), 0, &payload).await;
        assert_eq!(
            status, 200,
            "duplicate headers must not reserve sequence/time"
        );
        assert!(body.contains("\"source_sequence\":5"));
        server.abort();
    }

    #[tokio::test]
    async fn concurrent_duplicate_sequence_has_one_acceptance_and_one_conflict() {
        let state = test_state(5, 1);
        let (address, server) = test_server(state.clone()).await;
        let payload = synthetic_payload(0, 0, 80).to_string();

        let (first, second) = tokio::join!(
            request_with_elapsed(RequestSpec::replay(address, 5), 500, &payload,),
            request_with_elapsed(RequestSpec::replay(address, 5), 500, &payload,),
        );

        let mut statuses = [first.0, second.0];
        statuses.sort_unstable();
        assert_eq!(statuses, [200, 409]);
        let responses = [first, second];
        let accepted = responses.iter().find(|entry| entry.0 == 200).unwrap();
        let rejected = responses.iter().find(|entry| entry.0 == 409).unwrap();
        assert!(accepted.1.contains("\"source_sequence\":5"));
        assert_eq!(rejected.1.as_str(), "rejected");

        let runtime = state.0.lock().unwrap();
        assert_eq!(runtime.consumed_record_count, 1);
        assert_eq!(runtime.successfully_processed_record_count, 1);
        drop(runtime);
        server.abort();
    }

    #[tokio::test]
    async fn replay_safety_detector_uses_exact_nondecreasing_caller_elapsed_time() {
        let (address, server) = test_server(test_state(0, 4)).await;
        let low_health = synthetic_payload(0, 0, 20).to_string();
        let recovered = synthetic_payload(0, 0, 50).to_string();

        let (status, first) =
            request_with_elapsed(RequestSpec::replay(address, 0), 1_000, &low_health).await;
        assert_eq!(status, 200);
        assert!(first.contains("\"safety_event\":\"danger\""));

        let (status, second) =
            request_with_elapsed(RequestSpec::replay(address, 1), 2_000, &recovered).await;
        assert_eq!(status, 200);
        assert!(second.contains("\"safety_event\":\"revision\""));

        let (status, third) =
            request_with_elapsed(RequestSpec::replay(address, 2), 10_001, &low_health).await;
        assert_eq!(status, 200);
        let outcome: serde_json::Value = serde_json::from_str(&third).unwrap();
        assert_eq!(outcome["elapsed_ms"], 10_001);
        assert_eq!(outcome["safety_event"], "danger");

        let (status, response) =
            request_with_elapsed(RequestSpec::replay(address, 3), 10_000, &low_health).await;
        assert_eq!(status, 409, "elapsed time must never move backwards");
        assert_eq!(response, "rejected");

        let (status, body) =
            request_with_elapsed(RequestSpec::replay(address, 3), 10_001, &low_health).await;
        assert_eq!(
            status, 200,
            "rejected elapsed time must not consume its sequence"
        );
        let outcome: serde_json::Value = serde_json::from_str(&body).unwrap();
        assert_eq!(outcome["source_sequence"], 3);
        assert_eq!(outcome["elapsed_ms"], 10_001);
        server.abort();
    }

    #[tokio::test]
    async fn replay_accepts_sequence_zero_when_the_descriptor_starts_at_zero() {
        let (address, server) = test_server(test_state(0, 1)).await;
        let payload = synthetic_payload(0, 0, 80).to_string();
        let (status, body) = request(
            address,
            "POST",
            "/__gtrace/replay",
            RUN_ID,
            CAPABILITY,
            0,
            &payload,
        )
        .await;
        assert_eq!(status, 200);
        assert!(body.contains("\"parsed_status\":\"pass\""));
        assert!(body.contains("\"source_sequence\":0"));
        server.abort();
    }

    #[tokio::test]
    async fn replay_body_read_is_bounded_and_errors_are_sanitized() {
        let state = test_state(1, 4);
        let (address, server) = test_server(state.clone()).await;
        let (status, response) = request_declared_oversize(address, RUN_ID, CAPABILITY, 1).await;
        assert_eq!(status, 413);
        assert_eq!(response, "rejected");

        let oversized = vec![b'x'; MAX_REPLAY_BODY_BYTES + 1];
        let (status, response) = request_bytes(address, RUN_ID, CAPABILITY, 2, &oversized).await;
        assert_eq!(status, 413);
        assert_eq!(response, "rejected");

        let (status, response) = request_bytes(address, RUN_ID, CAPABILITY, 3, &[0xff]).await;
        assert_eq!(status, 400);
        assert_eq!(response, "rejected");

        let (status, response) = request_stalled_body(address, RUN_ID, CAPABILITY, 4).await;
        assert_eq!(status, 408);
        assert_eq!(response, "rejected");

        let valid_body = synthetic_payload(0, 0, 80).to_string();
        let (status, response) = request(
            address,
            "POST",
            REPLAY_PATH,
            RUN_ID,
            CAPABILITY,
            5,
            &valid_body,
        )
        .await;
        assert_eq!(status, 409, "bounded submissions include read failures");
        assert_eq!(response, "rejected");
        {
            let runtime = state.0.lock().unwrap();
            assert_eq!(runtime.next_sequence, 5);
            assert_eq!(runtime.last_elapsed_ms, Some(4));
            assert_eq!(runtime.successfully_processed_record_count, 0);
        }
        assert_eq!(
            exit_after_server(Ok(()), Some(StdinStopReason::Eof), &state),
            Err(()),
            "a post-reservation body failure poisons the run and requires a new run"
        );
        server.abort();
    }

    #[tokio::test]
    async fn bounded_host_closes_connections_with_incomplete_headers() {
        let (address, server) = test_server(test_state(1, 1)).await;
        let mut stream = tokio::net::TcpStream::connect(address).await.unwrap();
        stream
            .write_all(b"POST /__gtrace/replay HTTP/1.1\r\nHost: 127.0.0.1\r\n")
            .await
            .unwrap();

        let mut byte = [0_u8; 1];
        let read = tokio::time::timeout(
            Duration::from_secs(2) + Duration::from_millis(250),
            stream.read(&mut byte),
        )
        .await;
        assert!(
            matches!(read, Ok(Ok(0))),
            "incomplete request header should be closed within its deadline; got {read:?}"
        );
        server.abort();
    }

    #[tokio::test]
    async fn bounded_host_drops_connections_over_the_pre_handler_cap() {
        let (address, server, slots) = test_server_with_slots(test_state(1, 1)).await;
        let mut stalled = Vec::with_capacity(MAX_ACTIVE_HTTP_CONNECTIONS);
        for _ in 0..MAX_ACTIVE_HTTP_CONNECTIONS {
            let mut stream = tokio::net::TcpStream::connect(address).await.unwrap();
            stream
                .write_all(b"POST /__gtrace/replay HTTP/1.1\r\nHost: 127.0.0.1\r\n")
                .await
                .unwrap();
            stalled.push(stream);
        }
        tokio::time::timeout(Duration::from_secs(1), async {
            while slots.available_permits() != 0 {
                tokio::task::yield_now().await;
            }
        })
        .await
        .expect("incomplete headers should occupy all connection slots");

        let payload = synthetic_payload(0, 0, 80).to_string();
        let mut overflow = tokio::net::TcpStream::connect(address).await.unwrap();
        let request = format!(
            "POST {REPLAY_PATH} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\
             Content-Type: application/json\r\nContent-Length: {}\r\n\
             x-gtrace-test-run: {RUN_ID}\r\n\
             x-gtrace-test-capability: {CAPABILITY}\r\n\
             x-gtrace-test-sequence: 1\r\n\
             x-gtrace-test-elapsed-ms: 1\r\n\r\n{payload}",
            payload.len()
        );
        let _ = overflow.write_all(request.as_bytes()).await;
        let mut response_byte = [0_u8; 1];
        let close =
            tokio::time::timeout(Duration::from_secs(1), overflow.read(&mut response_byte)).await;
        assert!(
            matches!(close, Ok(Ok(0)))
                || matches!(close, Ok(Err(ref error)) if error.kind() == std::io::ErrorKind::ConnectionReset),
            "overflow connection should close before route entry; got {close:?}"
        );
        drop(stalled);
        server.abort();
    }

    #[tokio::test]
    async fn replay_router_has_no_product_routes_and_rejects_invalid_player_structure() {
        let (address, server) = test_server(test_state(1, 4)).await;
        for path in [
            "/",
            "/gsi",
            "/telemetry",
            "/health",
            "/auth/callback",
            "/announcer/install",
            "/overlay/layout",
        ] {
            let (status, _) = request(address, "POST", path, RUN_ID, CAPABILITY, 1, "{}").await;
            assert_eq!(status, 404, "unexpected route {path}");
        }

        let mut missing_team = synthetic_payload(0, 0, 80);
        missing_team["player"]
            .as_object_mut()
            .unwrap()
            .remove("team_name");
        let mut invalid_team = synthetic_payload(0, 0, 80);
        invalid_team["player"]["team_name"] = "spectator".into();
        let mut invalid_activity = synthetic_payload(0, 0, 80);
        invalid_activity["player"]["activity"] = "spectating".into();
        let mut missing_player = synthetic_payload(0, 0, 80);
        missing_player["player"] = serde_json::Value::Null;
        for (sequence, invalid_payload) in
            [missing_team, invalid_team, invalid_activity, missing_player]
                .into_iter()
                .enumerate()
        {
            let body = invalid_payload.to_string();
            let (status, response) = request(
                address,
                "POST",
                "/__gtrace/replay",
                RUN_ID,
                CAPABILITY,
                sequence as u64 + 1,
                &body,
            )
            .await;
            assert_eq!(status, 422);
            assert_eq!(response, "rejected");
            assert!(!response.contains("76561199999999999"));
        }
        let valid_body = synthetic_payload(0, 0, 80).to_string();
        let (status, _) = request(
            address,
            "POST",
            "/__gtrace/replay",
            RUN_ID,
            CAPABILITY,
            5,
            &valid_body,
        )
        .await;
        assert_eq!(status, 409, "the declared count bounds authorized requests");
        server.abort();
    }

    fn test_state(first_sequence: u64, expected_record_count: u64) -> ReplayState {
        ReplayState::new_for_test(RUN_ID, CAPABILITY, first_sequence, expected_record_count)
    }

    async fn test_server(state: ReplayState) -> (SocketAddr, tokio::task::JoinHandle<()>) {
        let (address, task, _slots) = test_server_with_slots(state).await;
        (address, task)
    }

    async fn test_server_with_slots(
        state: ReplayState,
    ) -> (SocketAddr, tokio::task::JoinHandle<()>, Arc<Semaphore>) {
        let listener = tokio::net::TcpListener::bind(SocketAddrV4::new(Ipv4Addr::LOCALHOST, 0))
            .await
            .unwrap();
        let address = listener.local_addr().unwrap();
        assert!(address.is_ipv4());
        assert_ne!(address.port(), 3000);
        let connection_slots = Arc::new(Semaphore::new(MAX_ACTIVE_HTTP_CONNECTIONS));
        let task_slots = Arc::clone(&connection_slots);
        let (stop_tx, stop_rx) = watch::channel(None::<StdinStopReason>);
        let task = tokio::spawn(async move {
            let _stop_tx = stop_tx;
            serve_bounded_http(listener, router(state), task_slots, stop_rx)
                .await
                .unwrap();
        });
        (address, task, connection_slots)
    }

    #[derive(Clone, Copy)]
    struct RequestSpec<'a> {
        address: SocketAddr,
        method: &'a str,
        path: &'a str,
        run_uuid: &'a str,
        capability: &'a str,
        sequence: u64,
    }

    impl<'a> RequestSpec<'a> {
        fn new(
            address: SocketAddr,
            method: &'a str,
            path: &'a str,
            run_uuid: &'a str,
            capability: &'a str,
            sequence: u64,
        ) -> Self {
            Self {
                address,
                method,
                path,
                run_uuid,
                capability,
                sequence,
            }
        }

        fn replay(address: SocketAddr, sequence: u64) -> Self {
            Self::new(address, "POST", REPLAY_PATH, RUN_ID, CAPABILITY, sequence)
        }
    }

    async fn request(
        address: SocketAddr,
        method: &str,
        path: &str,
        run_uuid: &str,
        capability: &str,
        sequence: u64,
        body: &str,
    ) -> (u16, String) {
        request_bytes_with_method(
            RequestSpec::new(address, method, path, run_uuid, capability, sequence),
            sequence,
            body.as_bytes(),
        )
        .await
    }

    async fn request_with_elapsed(
        spec: RequestSpec<'_>,
        elapsed_ms: u64,
        body: &str,
    ) -> (u16, String) {
        let elapsed_ms = elapsed_ms.to_string();
        request_with_elapsed_header(spec, Some(&elapsed_ms), body.as_bytes()).await
    }

    async fn request_with_elapsed_header(
        spec: RequestSpec<'_>,
        elapsed_ms: Option<&str>,
        body: &[u8],
    ) -> (u16, String) {
        let mut stream = tokio::net::TcpStream::connect(spec.address).await.unwrap();
        let elapsed_header = elapsed_ms
            .map(|value| format!("{ELAPSED_MS_HEADER}: {value}\r\n"))
            .unwrap_or_default();
        let request = format!(
            "{method} {path} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\
             Content-Type: application/json\r\nContent-Length: {}\r\n\
             x-gtrace-test-run: {run_uuid}\r\n\
             x-gtrace-test-capability: {capability}\r\n\
             x-gtrace-test-sequence: {sequence}\r\n\
             {elapsed_header}\r\n",
            body.len(),
            method = spec.method,
            path = spec.path,
            run_uuid = spec.run_uuid,
            capability = spec.capability,
            sequence = spec.sequence,
        );
        stream.write_all(request.as_bytes()).await.unwrap();
        stream.write_all(body).await.unwrap();
        let mut response = Vec::new();
        stream.read_to_end(&mut response).await.unwrap();
        parse_response(response)
    }

    async fn request_with_duplicate_header(
        spec: RequestSpec<'_>,
        elapsed_ms: u64,
        duplicate_header: &str,
        duplicate_value: &str,
        body: &str,
    ) -> (u16, String) {
        let mut stream = tokio::net::TcpStream::connect(spec.address).await.unwrap();
        let request = format!(
            "{method} {path} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\
             Content-Type: application/json\r\nContent-Length: {}\r\n\
             x-gtrace-test-run: {run_uuid}\r\n\
             x-gtrace-test-capability: {capability}\r\n\
             x-gtrace-test-sequence: {sequence}\r\n\
             {ELAPSED_MS_HEADER}: {elapsed_ms}\r\n\
             {duplicate_header}: {duplicate_value}\r\n\r\n{body}",
            body.len(),
            method = spec.method,
            path = spec.path,
            run_uuid = spec.run_uuid,
            capability = spec.capability,
            sequence = spec.sequence,
        );
        stream.write_all(request.as_bytes()).await.unwrap();
        let mut response = Vec::new();
        stream.read_to_end(&mut response).await.unwrap();
        parse_response(response)
    }

    async fn request_bytes(
        address: SocketAddr,
        run_uuid: &str,
        capability: &str,
        sequence: u64,
        body: &[u8],
    ) -> (u16, String) {
        request_bytes_with_method(
            RequestSpec::new(address, "POST", REPLAY_PATH, run_uuid, capability, sequence),
            sequence,
            body,
        )
        .await
    }

    async fn request_bytes_with_method(
        spec: RequestSpec<'_>,
        elapsed_ms: u64,
        body: &[u8],
    ) -> (u16, String) {
        let elapsed_ms = elapsed_ms.to_string();
        request_with_elapsed_header(spec, Some(&elapsed_ms), body).await
    }

    async fn request_stalled_body(
        address: SocketAddr,
        run_uuid: &str,
        capability: &str,
        sequence: u64,
    ) -> (u16, String) {
        let mut stream = tokio::net::TcpStream::connect(address).await.unwrap();
        let request = format!(
            "POST {REPLAY_PATH} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\
             Content-Type: application/json\r\nContent-Length: 128\r\n\
             x-gtrace-test-run: {run_uuid}\r\n\
             x-gtrace-test-capability: {capability}\r\n\
             x-gtrace-test-sequence: {sequence}\r\n\
             x-gtrace-test-elapsed-ms: {sequence}\r\n\r\n{{"
        );
        stream.write_all(request.as_bytes()).await.unwrap();
        let mut response = Vec::new();
        stream.read_to_end(&mut response).await.unwrap();
        parse_response(response)
    }

    async fn request_declared_oversize(
        address: SocketAddr,
        run_uuid: &str,
        capability: &str,
        sequence: u64,
    ) -> (u16, String) {
        let mut stream = tokio::net::TcpStream::connect(address).await.unwrap();
        let request = format!(
            "POST {REPLAY_PATH} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\
             Content-Type: application/json\r\nContent-Length: {}\r\n\
             x-gtrace-test-run: {run_uuid}\r\n\
             x-gtrace-test-capability: {capability}\r\n\
             x-gtrace-test-sequence: {sequence}\r\n\
             x-gtrace-test-elapsed-ms: {sequence}\r\n\r\n",
            MAX_REPLAY_BODY_BYTES + 1
        );
        stream.write_all(request.as_bytes()).await.unwrap();
        let mut response = Vec::new();
        stream.read_to_end(&mut response).await.unwrap();
        parse_response(response)
    }

    fn parse_response(response: Vec<u8>) -> (u16, String) {
        let response = String::from_utf8(response).unwrap();
        let mut parts = response.splitn(2, "\r\n\r\n");
        let head = parts.next().unwrap_or_default();
        let body = parts.next().unwrap_or_default().trim().to_string();
        let status = head
            .lines()
            .next()
            .and_then(|line| line.split_whitespace().nth(1))
            .and_then(|code| code.parse().ok())
            .unwrap_or_default();
        (status, body)
    }

    fn synthetic_payload(kills: i64, radiant_score: i64, hp_percent: i64) -> serde_json::Value {
        serde_json::json!({
            "provider": {"appid": 570},
            "map": {
                "game_state": "DOTA_GAMERULES_STATE_GAME_IN_PROGRESS",
                "clock_time": if kills == 0 { 0 } else { 1 },
                "daytime": true,
                "radiant_score": radiant_score,
                "dire_score": 0,
                "matchid": "1000000001"
            },
            "player": {
                "steamid": "76561199999999999",
                "team_name": "radiant",
                "activity": "playing",
                "name": "Synthetic Replay Player",
                "gold": 100,
                "gpm": 0,
                "xpm": 0,
                "kills": kills,
                "deaths": 0,
                "assists": 0,
                "last_hits": 0,
                "denies": 0
            },
            "hero": {
                "name": "npc_dota_hero_crystal_maiden",
                "level": 1,
                "alive": true,
                "health_percent": hp_percent,
                "mana_percent": 100,
                "health": hp_percent * 6,
                "max_health": 600,
                "buyback_cost": 0,
                "respawn_seconds": 0
            },
            "items": {}
        })
    }
}

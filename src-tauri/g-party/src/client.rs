use crate::protocol::{
    valid_hex, Membership, RoomSnapshot, MAX_RESPONSE_BYTES, MEMBER_IDLE_MS, ROOM_LIFETIME_MS,
    SOURCE_RETENTION_MS,
};
use crate::{
    display_name, valid_invite, validate_relay_url, LocalObservation, MemberState, MemberView,
    PartyStatus, PartyView, SyncRequest, FRESH_MS,
};
use reqwest::{Method, Url};
use serde::de::DeserializeOwned;
use serde_json::{json, Value};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex, MutexGuard,
};
use std::time::{Duration, Instant};
use tokio::sync::watch;

const POLL_INTERVAL: Duration = Duration::from_millis(500);
const MAX_SEQUENCE: u64 = 9_007_199_254_740_991;

pub struct ConnectOptions {
    pub relay_url: String,
    pub display_name: String,
    pub invite: Option<String>,
    pub consent: bool,
}

#[derive(Clone)]
struct Credentials {
    origin: Url,
    room_id: String,
    member_id: String,
    member_token: String,
    owner_id: String,
    room_generation: u64,
}

struct Observed {
    observation: LocalObservation,
    epoch: u64,
    received_ms: u64,
}

struct State {
    generation: u64,
    source_revision: u64,
    status: PartyStatus,
    credentials: Option<Credentials>,
    invite: Option<String>,
    expires_ms: u64,
    last_success_ms: u64,
    error: Option<String>,
    latest: Option<Observed>,
    members: Vec<MemberView>,
    snapshot_ms: u64,
    sequence: u64,
    sync_in_flight: bool,
    failures: u8,
    needs_probe: bool,
    admin_in_flight: bool,
    roster_revision: u64,
}

impl State {
    fn new() -> Self {
        Self {
            generation: 0,
            source_revision: 0,
            status: PartyStatus::Idle,
            credentials: None,
            invite: None,
            expires_ms: 0,
            last_success_ms: 0,
            error: None,
            latest: None,
            members: Vec::new(),
            snapshot_ms: 0,
            sequence: 0,
            sync_in_flight: false,
            failures: 0,
            needs_probe: false,
            admin_in_flight: false,
            roster_revision: 0,
        }
    }
    fn invalidate_source(&mut self) {
        if self.latest.take().is_some() {
            self.source_revision = self.source_revision.wrapping_add(1);
        }
        for member in &mut self.members {
            member.withhold();
        }
    }
    fn reset(&mut self, status: PartyStatus, error: Option<&str>) -> Option<Credentials> {
        let credentials = self.credentials.take();
        self.generation = self.generation.wrapping_add(1);
        self.status = status;
        self.invite = None;
        self.error = error.map(str::to_owned);
        self.members.clear();
        self.sequence = 0;
        self.sync_in_flight = false;
        self.failures = 0;
        self.needs_probe = false;
        self.admin_in_flight = false;
        self.roster_revision = self.roster_revision.wrapping_add(1);
        self.invalidate_source();
        credentials
    }
    fn source_is_fresh(&self, now: u64) -> bool {
        self.latest
            .as_ref()
            .is_some_and(|source| now.saturating_sub(source.received_ms) <= FRESH_MS)
    }
    fn expire(&mut self, now: u64) -> bool {
        if self
            .latest
            .as_ref()
            .is_some_and(|source| now.saturating_sub(source.received_ms) > SOURCE_RETENTION_MS)
        {
            self.invalidate_source();
        }
        if self.credentials.is_some()
            && (now >= self.expires_ms || now.saturating_sub(self.last_success_ms) > MEMBER_IDLE_MS)
        {
            self.reset(PartyStatus::Closed, Some("room_unavailable"));
            return true;
        }
        false
    }
    fn view(&self, now: u64) -> PartyView {
        let mut members = self.members.clone();
        let available = self.status == PartyStatus::Connected && self.source_is_fresh(now);
        for member in &mut members {
            member.age_by(now.saturating_sub(self.snapshot_ms));
            if !available {
                member.withhold();
            }
        }
        PartyView {
            status: self.status,
            room_id: self.credentials.as_ref().map(|c| c.room_id.clone()),
            relay_url: self.credentials.as_ref().map(|c| c.origin.to_string()),
            room_generation: self.credentials.as_ref().map(|c| c.room_generation),
            self_id: self.credentials.as_ref().map(|c| c.member_id.clone()),
            owner_id: self.credentials.as_ref().map(|c| c.owner_id.clone()),
            invite: self.invite.clone(),
            expires_in_ms: self
                .credentials
                .as_ref()
                .map(|_| self.expires_ms.saturating_sub(now)),
            error: self.error.clone(),
            members,
        }
    }
}

struct Inner {
    state: Mutex<State>,
    http: reqwest::Client,
    clock: Instant,
    cancelled: watch::Sender<u64>,
    invalidation_pending: AtomicBool,
    #[cfg(test)]
    allow_social_loopback: bool,
}

#[derive(Clone)]
pub struct PartyClient {
    inner: Arc<Inner>,
}

struct SyncWork {
    credentials: Credentials,
    generation: u64,
    source_revision: u64,
    request: SyncRequest,
    sent_ms: u64,
    probe: bool,
    roster_revision: u64,
    cancellation_revision: u64,
}

#[derive(Clone, Copy)]
struct Failure {
    code: &'static str,
    closed: bool,
    invalid: bool,
}

impl Failure {
    fn network() -> Self {
        Self {
            code: "network_unavailable",
            closed: false,
            invalid: false,
        }
    }
    fn invalid() -> Self {
        Self {
            code: "invalid_response",
            closed: false,
            invalid: true,
        }
    }
    fn status(status: u16, body: &[u8]) -> Self {
        #[derive(serde::Deserialize)]
        #[serde(deny_unknown_fields)]
        struct ErrorBody {
            error: String,
        }
        let parsed = serde_json::from_slice::<ErrorBody>(body).ok();
        let code = match (status, parsed.as_ref().map(|value| value.error.as_str())) {
            (400, Some("invalid_request")) => "invalid_request",
            (401, Some("unauthorized")) => "unauthorized",
            (403, Some("forbidden")) => "forbidden",
            (404 | 410, Some("room_unavailable")) => "room_unavailable",
            (409, Some("room_full")) => "room_full",
            (409, Some("replayed_sequence")) => "replayed_sequence",
            (429, Some("rate_limited")) => "rate_limited",
            (503, Some("capacity")) => "capacity",
            (503, Some("social_unavailable")) => "social_unavailable",
            (500, Some("unavailable")) => "relay_unavailable",
            _ => return Self::invalid(),
        };
        Self {
            code,
            closed: matches!(status, 401 | 404 | 410),
            invalid: status == 400,
        }
    }
}

impl PartyClient {
    pub fn new() -> Result<Self, &'static str> {
        let http = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .no_proxy()
            .connect_timeout(Duration::from_millis(1_500))
            .timeout(Duration::from_millis(1_500))
            .pool_max_idle_per_host(1)
            .build()
            .map_err(|_| "network_unavailable")?;
        let (cancelled, _) = watch::channel(0);
        Ok(Self {
            inner: Arc::new(Inner {
                state: Mutex::new(State::new()),
                http,
                clock: Instant::now(),
                cancelled,
                invalidation_pending: AtomicBool::new(false),
                #[cfg(test)]
                allow_social_loopback: false,
            }),
        })
    }
    fn now(&self) -> u64 {
        self.inner.clock.elapsed().as_millis().min(u64::MAX as u128) as u64
    }
    fn lock(&self) -> MutexGuard<'_, State> {
        self.inner
            .state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }
    fn signal_change(&self) {
        self.inner
            .cancelled
            .send_modify(|revision| *revision = revision.wrapping_add(1));
    }
    fn apply_pending_invalidation(&self, state: &mut State) {
        if self
            .inner
            .invalidation_pending
            .swap(false, Ordering::AcqRel)
        {
            state.invalidate_source();
        }
    }

    /// The GSI caller never waits for a network operation or a held state lock.
    pub fn observe_local(&self, observation: Option<LocalObservation>, epoch: u64) {
        let Ok(mut state) = self.inner.state.try_lock() else {
            self.inner
                .invalidation_pending
                .store(true, Ordering::Release);
            self.signal_change();
            return;
        };
        self.apply_pending_invalidation(&mut state);
        let Some(observation) = observation.filter(|_| epoch != 0) else {
            let revision = state.source_revision;
            state.invalidate_source();
            if revision != state.source_revision {
                self.signal_change();
            }
            return;
        };
        let changed = state.latest.as_ref().is_none_or(|source| {
            source.epoch != epoch
                || source.observation.owner != observation.owner
                || source.observation.match_id != observation.match_id
                || source.observation.team != observation.team
        });
        if changed {
            state.source_revision = state.source_revision.wrapping_add(1);
            state.members.clear();
            self.signal_change();
        }
        state.latest = Some(Observed {
            observation,
            epoch,
            received_ms: self.now(),
        });
    }
    pub fn validate_source_context(&self, owner: Option<&str>, epoch: u64, active: bool) {
        let mut state = self.lock();
        self.apply_pending_invalidation(&mut state);
        let matches = active
            && state.latest.as_ref().is_some_and(|source| {
                source.epoch == epoch && owner == Some(source.observation.owner.as_str())
            });
        if !matches {
            let revision = state.source_revision;
            state.invalidate_source();
            if revision != state.source_revision {
                self.signal_change();
            }
        }
    }
    pub fn view(&self) -> PartyView {
        let now = self.now();
        let mut state = self.lock();
        self.apply_pending_invalidation(&mut state);
        if state.expire(now) {
            self.signal_change();
        }
        state.view(now)
    }

    async fn bytes(
        &self,
        method: Method,
        origin: &Url,
        path: &str,
        token: Option<&str>,
        body: Option<&Value>,
        expected: u16,
    ) -> Result<Vec<u8>, Failure> {
        let url = origin.join(path).map_err(|_| Failure::invalid())?;
        let mut request = self.inner.http.request(method, url);
        if let Some(token) = token {
            request = request.bearer_auth(token);
        }
        if let Some(body) = body {
            let bytes = serde_json::to_vec(body).map_err(|_| Failure::invalid())?;
            if bytes.len() > 4_096 {
                return Err(Failure::invalid());
            }
            request = request
                .header(reqwest::header::CONTENT_TYPE, "application/json")
                .body(bytes);
        }
        let mut response = request.send().await.map_err(|_| Failure::network())?;
        let status = response.status().as_u16();
        if response
            .content_length()
            .is_some_and(|length| length > MAX_RESPONSE_BYTES as u64)
        {
            return Err(Failure::invalid());
        }
        let mut bytes = Vec::new();
        while let Some(chunk) = response.chunk().await.map_err(|_| Failure::network())? {
            if bytes.len().saturating_add(chunk.len()) > MAX_RESPONSE_BYTES {
                return Err(Failure::invalid());
            }
            bytes.extend_from_slice(&chunk);
        }
        if status != expected {
            return Err(Failure::status(status, &bytes));
        }
        Ok(bytes)
    }
    async fn json<T: DeserializeOwned>(
        &self,
        method: Method,
        origin: &Url,
        path: &str,
        token: Option<&str>,
        body: Option<&Value>,
        expected: u16,
    ) -> Result<T, Failure> {
        let bytes = self
            .bytes(method, origin, path, token, body, expected)
            .await?;
        serde_json::from_slice(&bytes).map_err(|_| Failure::invalid())
    }
    async fn delete_membership(&self, credentials: &Credentials) {
        let path = format!("/v1/rooms/{}/members/me", credentials.room_id);
        let _ = self
            .bytes(
                Method::DELETE,
                &credentials.origin,
                &path,
                Some(&credentials.member_token),
                None,
                204,
            )
            .await;
    }

    pub async fn connect(&self, options: ConnectOptions) -> Result<PartyView, &'static str> {
        if !options.consent {
            return Err("consent_required");
        }
        let origin = validate_relay_url(&options.relay_url)?;
        let name = display_name(&options.display_name)?;
        if options
            .invite
            .as_ref()
            .is_some_and(|invite| !valid_invite(invite))
        {
            return Err("invalid_invite");
        }
        let (generation, old) = {
            let mut state = self.lock();
            let old = state.reset(PartyStatus::Connecting, None);
            self.signal_change();
            (state.generation, old)
        };
        if let Some(old) = old {
            self.delete_membership(&old).await;
        }
        if self.lock().generation != generation {
            return Err("cancelled");
        }
        let (path, body) = match options.invite.as_ref() {
            Some(invite) => (
                "/v1/rooms/join",
                json!({"invite":invite,"displayName":name}),
            ),
            None => ("/v1/rooms", json!({"displayName":name})),
        };
        let sent = self.now();
        let result: Result<Membership, Failure> = self
            .json(Method::POST, &origin, path, None, Some(&body), 201)
            .await;
        let membership = match result {
            Ok(membership) => membership,
            Err(failure) => {
                let mut state = self.lock();
                if state.generation == generation {
                    state.reset(PartyStatus::Error, Some(failure.code));
                    self.signal_change();
                }
                return Err(failure.code);
            }
        };
        if !valid_membership(&membership, options.invite.as_deref()) {
            let mut state = self.lock();
            if state.generation == generation {
                state.reset(PartyStatus::Error, Some("invalid_response"));
                self.signal_change();
            }
            return Err("invalid_response");
        }
        let credentials = Credentials {
            origin,
            room_id: membership.room_id,
            member_id: membership.member_id,
            member_token: membership.member_token,
            owner_id: membership.owner_id,
            room_generation: membership.room_generation,
        };
        let accepted = {
            let mut state = self.lock();
            if state.generation != generation {
                false
            } else {
                let now = self.now();
                state.credentials = Some(credentials.clone());
                state.invite = membership.invite;
                state.expires_ms = now.saturating_add(
                    membership
                        .expires_in_ms
                        .saturating_sub(now.saturating_sub(sent)),
                );
                state.last_success_ms = now;
                state.status = PartyStatus::Connected;
                state.error = None;
                true
            }
        };
        if !accepted {
            self.delete_membership(&credentials).await;
            return Err("cancelled");
        }
        Ok(self.view())
    }

    #[cfg(test)]
    pub(crate) fn new_for_social_tests() -> Self {
        let mut client = Self::new().unwrap();
        Arc::get_mut(&mut client.inner)
            .unwrap()
            .allow_social_loopback = true;
        client
    }
    fn social_origin(&self, value: &str) -> Result<Url, String> {
        let url = validate_relay_url(value).map_err(str::to_owned)?;
        #[cfg(test)]
        if self.inner.allow_social_loopback {
            return Ok(url);
        }
        if url.scheme() != "https" {
            return Err("social_unavailable".into());
        }
        Ok(url)
    }
    pub async fn social_proof(
        &self,
        challenge: String,
        relay_url: String,
    ) -> Result<crate::SocialProof, String> {
        if !valid_hex(&challenge, 64) {
            return Err("invalid_request".into());
        }
        let origin = self.social_origin(&relay_url)?;
        let (generation, credentials) = {
            let mut state = self.lock();
            state.expire(self.now());
            if state.status != PartyStatus::Connected {
                return Err("room_unavailable".into());
            }
            let credentials = state.credentials.clone().ok_or("room_unavailable")?;
            if credentials.origin != origin {
                return Err("social_unavailable".into());
            }
            (state.generation, credentials)
        };
        let path = format!("/v1/rooms/{}/social-proof", credentials.room_id);
        let result: crate::SocialProof = self
            .json(
                Method::POST,
                &credentials.origin,
                &path,
                Some(&credentials.member_token),
                Some(&json!({"challenge":challenge})),
                200,
            )
            .await
            .map_err(|f| f.code.to_owned())?;
        let mut state = self.lock();
        state.expire(self.now());
        if state.generation != generation
            || state.status != PartyStatus::Connected
            || state
                .credentials
                .as_ref()
                .is_none_or(|c| c.room_generation != credentials.room_generation)
        {
            return Err("cancelled".into());
        }
        let Some((payload, signature)) = result.proof.split_once('.') else {
            return Err("invalid_response".into());
        };
        let canonical = |value: &str| {
            !value.is_empty()
                && value
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
        };
        if payload.len() > 2731
            || signature.len() != 43
            || !canonical(payload)
            || !canonical(signature)
        {
            return Err("invalid_response".into());
        }
        Ok(result)
    }
    pub async fn join_social(
        &self,
        options: crate::SocialJoinOptions,
    ) -> Result<PartyView, String> {
        if !options.consent {
            return Err("consent_required".into());
        }
        let origin = self.social_origin(&options.relay_url)?;
        let name = display_name(&options.display_name).map_err(str::to_owned)?;
        if !valid_hex(&options.ticket, 64) || !valid_hex(&options.room_id, 32) {
            return Err("invalid_request".into());
        }
        let generation = {
            let mut state = self.lock();
            if state.credentials.is_some()
                || !matches!(state.status, PartyStatus::Idle | PartyStatus::Closed)
                || state.sync_in_flight
                || state.admin_in_flight
            {
                return Err("already_in_room".into());
            }
            state.reset(PartyStatus::Connecting, None);
            self.signal_change();
            state.generation
        };
        let sent = self.now();
        let response: Result<Membership, Failure> = self
            .json(
                Method::POST,
                &origin,
                "/v1/rooms/social-join",
                None,
                Some(&json!({"ticket":options.ticket,"displayName":name})),
                201,
            )
            .await;
        let membership = match response {
            Ok(value) => value,
            Err(failure) => {
                let mut state = self.lock();
                if state.generation != generation {
                    return Err("cancelled".into());
                }
                state.reset(PartyStatus::Closed, Some(failure.code));
                self.signal_change();
                return Err(failure.code.into());
            }
        };
        // Even a semantically invalid response can have granted a real member.
        // Retain only the bounded native credential needed for best-effort cleanup.
        let cleanup = valid_hex(&membership.room_id, 32) && valid_hex(&membership.member_token, 64);
        let valid = valid_social_membership(&membership) && membership.room_id == options.room_id;
        let credentials = Credentials {
            origin,
            room_id: membership.room_id,
            member_id: membership.member_id,
            member_token: membership.member_token,
            owner_id: membership.owner_id,
            room_generation: membership.room_generation,
        };
        let outcome = {
            let mut state = self.lock();
            if state.generation != generation {
                Some("cancelled")
            } else if !valid {
                state.reset(PartyStatus::Closed, Some("invalid_response"));
                self.signal_change();
                Some("invalid_response")
            } else {
                let now = self.now();
                let remaining = membership
                    .expires_in_ms
                    .saturating_sub(now.saturating_sub(sent));
                if remaining == 0 {
                    state.reset(PartyStatus::Closed, Some("room_unavailable"));
                    self.signal_change();
                    Some("room_unavailable")
                } else {
                    state.credentials = Some(credentials.clone());
                    state.expires_ms = now.saturating_add(remaining);
                    state.last_success_ms = now;
                    state.status = PartyStatus::Connected;
                    state.error = None;
                    None
                }
            }
        };
        if let Some(error) = outcome {
            if cleanup {
                self.delete_membership(&credentials).await;
            }
            return Err(error.into());
        }
        Ok(self.view())
    }

    fn prepare_sync(&self) -> Option<SyncWork> {
        let now = self.now();
        let mut state = self.lock();
        self.apply_pending_invalidation(&mut state);
        if state.expire(now) {
            self.signal_change();
        }
        let credentials = state.credentials.clone()?;
        if state.sync_in_flight {
            return None;
        }
        if state.sequence >= MAX_SEQUENCE {
            state.reset(PartyStatus::Closed, Some("room_unavailable"));
            self.signal_change();
            return None;
        }
        let source = state.latest.as_ref().filter(|source| {
            now.saturating_sub(source.received_ms) <= FRESH_MS && !state.needs_probe
        });
        let scope = source.map(|source| source.observation.scope(&credentials.room_id));
        let sample = source.map(|source| {
            source
                .observation
                .shared_sample(now.saturating_sub(source.received_ms))
        });
        state.sequence += 1;
        state.sync_in_flight = true;
        Some(SyncWork {
            credentials,
            generation: state.generation,
            source_revision: state.source_revision,
            request: SyncRequest {
                sequence: state.sequence,
                scope,
                sample,
            },
            sent_ms: now,
            probe: state.needs_probe,
            roster_revision: state.roster_revision,
            cancellation_revision: *self.inner.cancelled.borrow(),
        })
    }
    pub async fn sync_once(&self) -> Duration {
        let Some(work) = self.prepare_sync() else {
            return POLL_INTERVAL;
        };
        let path = format!("/v1/rooms/{}/sync", work.credentials.room_id);
        let body = match serde_json::to_value(&work.request) {
            Ok(body) => body,
            Err(_) => return self.finish_sync(work, Err(Failure::invalid())),
        };
        let mut cancelled = self.inner.cancelled.subscribe();
        if *cancelled.borrow() != work.cancellation_revision {
            return self.cancel_sync(&work);
        }
        let result = tokio::select! {
            biased;
            _=cancelled.changed()=>return self.cancel_sync(&work),
            result=self.json::<RoomSnapshot>(Method::POST,&work.credentials.origin,&path,Some(&work.credentials.member_token),Some(&body),200)=>result,
        };
        self.finish_sync(work, result)
    }
    fn cancel_sync(&self, work: &SyncWork) -> Duration {
        let mut state = self.lock();
        self.apply_pending_invalidation(&mut state);
        if state.generation == work.generation {
            state.sync_in_flight = false;
            state.needs_probe = true;
            for member in &mut state.members {
                member.withhold();
            }
        }
        POLL_INTERVAL
    }
    fn finish_sync(&self, work: SyncWork, result: Result<RoomSnapshot, Failure>) -> Duration {
        let now = self.now();
        let elapsed = now.saturating_sub(work.sent_ms);
        let mut state = self.lock();
        self.apply_pending_invalidation(&mut state);
        if state.generation != work.generation {
            return POLL_INTERVAL;
        }
        state.sync_in_flight = false;
        if let Ok(snapshot) = &result {
            let overtaken = state.credentials.as_ref().is_some_and(|current| {
                current.room_generation > work.credentials.room_generation
                    && snapshot.room_generation < current.room_generation
                    && valid_snapshot(snapshot, &work.credentials, work.request.scope.is_some())
            });
            if overtaken {
                // A previously valid observation may arrive after a rotation reply.
                // Preserve current membership without publishing that old roster.
                state.needs_probe = true;
                for member in &mut state.members {
                    member.withhold();
                }
                return POLL_INTERVAL;
            }
        }
        let result = result.and_then(|snapshot| {
            if state.credentials.as_ref().is_some_and(|current| {
                valid_snapshot(&snapshot, current, work.request.scope.is_some())
            }) {
                Ok(snapshot)
            } else {
                Err(Failure::invalid())
            }
        });
        match result {
            Ok(mut snapshot) => {
                if let Some(current) = state.credentials.as_mut() {
                    current.room_generation = snapshot.room_generation;
                }
                state.last_success_ms = now;
                state.expires_ms = state
                    .expires_ms
                    .min(now.saturating_add(snapshot.expires_in_ms.saturating_sub(elapsed)));
                state.status = PartyStatus::Connected;
                state.error = None;
                state.failures = 0;
                if state.source_revision != work.source_revision {
                    state.members.clear();
                    state.needs_probe = true;
                    return POLL_INTERVAL;
                }
                if state.roster_revision != work.roster_revision {
                    return POLL_INTERVAL;
                }
                for member in &mut snapshot.members {
                    member.age_by(elapsed);
                }
                state.members = snapshot.members;
                state.snapshot_ms = now;
                state.needs_probe = false;
                if work.probe || !state.source_is_fresh(now) {
                    for member in &mut state.members {
                        member.withhold();
                    }
                }
                POLL_INTERVAL
            }
            Err(failure) => {
                if failure.closed || failure.invalid {
                    state.reset(
                        if failure.closed {
                            PartyStatus::Closed
                        } else {
                            PartyStatus::Error
                        },
                        Some(failure.code),
                    );
                    self.signal_change();
                    return POLL_INTERVAL;
                }
                state.status = PartyStatus::Reconnecting;
                state.error = Some(failure.code.into());
                state.needs_probe = true;
                for member in &mut state.members {
                    member.withhold();
                }
                let delay = 500u64
                    .saturating_mul(1u64 << state.failures.min(4))
                    .min(5_000);
                state.failures = state.failures.saturating_add(1).min(4);
                Duration::from_millis(delay)
            }
        }
    }
    pub async fn leave(&self) -> PartyView {
        let old = {
            let mut state = self.lock();
            let old = state.reset(PartyStatus::Idle, None);
            self.signal_change();
            old
        };
        if let Some(old) = old {
            self.delete_membership(&old).await;
        }
        self.view()
    }
    fn begin_owner_action(&self) -> Result<(u64, Credentials), &'static str> {
        let mut state = self.lock();
        let credentials = state.credentials.clone().ok_or("room_unavailable")?;
        if credentials.member_id != credentials.owner_id {
            return Err("forbidden");
        }
        if state.admin_in_flight {
            return Err("request_in_progress");
        }
        state.admin_in_flight = true;
        Ok((state.generation, credentials))
    }

    fn owner_failure(&self, generation: u64, failure: Failure) -> &'static str {
        let mut state = self.lock();
        if state.generation != generation {
            return "cancelled";
        }
        state.admin_in_flight = false;
        if failure.closed || failure.invalid {
            state.reset(
                if failure.closed {
                    PartyStatus::Closed
                } else {
                    PartyStatus::Error
                },
                Some(failure.code),
            );
            self.signal_change();
        } else {
            state.error = Some(failure.code.into());
            if failure.code != "forbidden" {
                state.status = PartyStatus::Reconnecting;
                state.needs_probe = true;
                for member in &mut state.members {
                    member.withhold();
                }
            }
        }
        failure.code
    }

    pub async fn kick(&self, member_id: &str) -> Result<PartyView, &'static str> {
        if !valid_hex(member_id, 32) {
            return Err("invalid_request");
        }
        {
            let state = self.lock();
            if state
                .credentials
                .as_ref()
                .is_some_and(|credentials| credentials.owner_id == member_id)
            {
                return Err("forbidden");
            }
        }
        let (generation, credentials) = self.begin_owner_action()?;
        let path = format!("/v1/rooms/{}/members/{member_id}", credentials.room_id);
        if let Err(failure) = self
            .bytes(
                Method::DELETE,
                &credentials.origin,
                &path,
                Some(&credentials.member_token),
                None,
                204,
            )
            .await
        {
            return Err(self.owner_failure(generation, failure));
        }
        {
            let mut state = self.lock();
            if state.generation != generation {
                return Err("cancelled");
            }
            state.admin_in_flight = false;
            state.roster_revision = state.roster_revision.wrapping_add(1);
            state.members.retain(|member| member.member_id != member_id);
            state.error = None;
        }
        Ok(self.view())
    }

    pub async fn rotate_invite(&self) -> Result<PartyView, &'static str> {
        #[derive(serde::Deserialize)]
        #[serde(rename_all = "camelCase", deny_unknown_fields)]
        struct Invitation {
            invite: String,
            room_generation: u64,
        }
        let (generation, credentials) = self.begin_owner_action()?;
        let path = format!("/v1/rooms/{}/invite", credentials.room_id);
        let response: Result<Invitation, Failure> = self
            .json(
                Method::POST,
                &credentials.origin,
                &path,
                Some(&credentials.member_token),
                Some(&json!({})),
                200,
            )
            .await;
        let invitation = match response {
            Ok(invitation) => invitation,
            Err(failure) => return Err(self.owner_failure(generation, failure)),
        };
        if !(1..=MAX_SEQUENCE).contains(&invitation.room_generation)
            || invitation.room_generation <= credentials.room_generation
            || !valid_invite(&invitation.invite)
            || invitation.invite.split('.').nth(1) != Some(credentials.room_id.as_str())
        {
            return Err(self.owner_failure(generation, Failure::invalid()));
        }
        {
            let mut state = self.lock();
            if state.generation != generation {
                return Err("cancelled");
            }
            state.admin_in_flight = false;
            if state
                .credentials
                .as_ref()
                .is_none_or(|current| invitation.room_generation < current.room_generation)
            {
                state.admin_in_flight = false;
                return Err("cancelled");
            }
            if let Some(current) = state.credentials.as_mut() {
                current.room_generation = invitation.room_generation;
            }
            state.invite = Some(invitation.invite);
            state.error = None;
        }
        Ok(self.view())
    }
}

fn valid_membership(membership: &Membership, invite: Option<&str>) -> bool {
    (1..=MAX_SEQUENCE).contains(&membership.room_generation)
        && valid_hex(&membership.room_id, 32)
        && valid_hex(&membership.member_id, 32)
        && valid_hex(&membership.owner_id, 32)
        && valid_hex(&membership.member_token, 64)
        && (1..=ROOM_LIFETIME_MS).contains(&membership.expires_in_ms)
        && match invite {
            Some(invite) => {
                invite.split('.').nth(1) == Some(membership.room_id.as_str())
                    && membership.invite.is_none()
                    && membership.owner_id != membership.member_id
            }
            None => {
                membership.owner_id == membership.member_id
                    && membership.invite.as_deref().is_some_and(|invite| {
                        valid_invite(invite)
                            && invite.split('.').nth(1) == Some(membership.room_id.as_str())
                    })
            }
        }
}

fn valid_snapshot(snapshot: &RoomSnapshot, credentials: &Credentials, scoped: bool) -> bool {
    if !(credentials.room_generation..=MAX_SEQUENCE).contains(&snapshot.room_generation)
        || snapshot.room_id != credentials.room_id
        || snapshot.self_id != credentials.member_id
        || snapshot.owner_id != credentials.owner_id
        || snapshot.members.is_empty()
        || snapshot.members.len() > 5
        || !(1..=ROOM_LIFETIME_MS).contains(&snapshot.expires_in_ms)
    {
        return false;
    }
    let mut ids = std::collections::HashSet::new();
    for member in &snapshot.members {
        if !valid_hex(&member.member_id, 32)
            || !ids.insert(member.member_id.as_str())
            || display_name(&member.display_name).as_deref() != Ok(member.display_name.as_str())
            || member.is_owner != (member.member_id == snapshot.owner_id)
            || member.age_ms.is_some_and(|age| age > MAX_SEQUENCE)
        {
            return false;
        }
        if !scoped
            && (member.sample.is_some()
                || member.age_ms.is_some()
                || member.state != MemberState::Waiting)
        {
            return false;
        }
        match member.state {
            MemberState::Live => {
                if !member.sample.as_ref().is_some_and(|sample| sample.valid())
                    || member.age_ms.is_none_or(|age| age > FRESH_MS)
                {
                    return false;
                }
            }
            MemberState::Stale => {
                if member.sample.is_some() {
                    return false;
                }
            }
            MemberState::Waiting | MemberState::DifferentMatch => {
                if member.sample.is_some() || member.age_ms.is_some() {
                    return false;
                }
            }
        }
    }
    ids.contains(snapshot.self_id.as_str()) && ids.contains(snapshot.owner_id.as_str())
}

fn valid_social_membership(value: &Membership) -> bool {
    valid_hex(&value.room_id, 32)
        && valid_hex(&value.member_id, 32)
        && valid_hex(&value.owner_id, 32)
        && valid_hex(&value.member_token, 64)
        && value.member_id != value.owner_id
        && value.invite.is_none()
        && (1..=MAX_SEQUENCE).contains(&value.room_generation)
        && (1..=ROOM_LIFETIME_MS).contains(&value.expires_in_ms)
}

#[cfg(test)]
mod contention_tests {
    use super::*;

    #[test]
    fn dropped_invalidation_during_lock_contention_cannot_publish_old_vitals() {
        let client = PartyClient::new().unwrap();
        client.observe_local(crate::project_local(&crate::tests::playing(), true), 7);
        let mut locked = client.lock();
        locked.credentials = Some(Credentials {
            origin: Url::parse("http://127.0.0.1:8787").unwrap(),
            room_id: "a".repeat(32),
            member_id: "b".repeat(32),
            member_token: "c".repeat(64),
            owner_id: "b".repeat(32),
            room_generation: 1,
        });
        locked.status = PartyStatus::Connected;
        locked.expires_ms = ROOM_LIFETIME_MS;
        let (tx, rx) = std::sync::mpsc::channel();
        let contender = client.clone();
        let thread = std::thread::spawn(move || {
            contender.observe_local(None, 7);
            tx.send(()).unwrap();
        });
        rx.recv_timeout(Duration::from_millis(100))
            .expect("GSI admission must not block behind the state lock");
        drop(locked);
        thread.join().unwrap();
        let work = client.prepare_sync().unwrap();
        assert!(
            work.request.scope.is_none(),
            "a dropped invalidation cannot preserve eligibility"
        );
        assert!(work.request.sample.is_none(), "old health must not be sent");
        assert!(client.view().members.iter().all(|m| m.sample.is_none()));
    }
}

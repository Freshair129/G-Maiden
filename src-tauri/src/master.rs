//! G-Master — local advice with an optional, explicitly consented cloud route.
//! Cloud requests use a purpose-built own-stat allowlist; local Ollama may use
//! the richer match context. Provider choice and manual Ask are not consent.
//!
//! Throttle to 30s/request and cache the last answer so a quick double-click
//! still feels responsive without burning the Plan budget.

use std::io::Read;
use std::process::{Command, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

/// Cheap, fast Anthropic model for short advice calls (1-2 sentence tips).
const ANTHROPIC_MODEL: &str = "claude-haiku-4-5";
const CLAUDE_REQUEST_TIMEOUT_MS: u64 = 12_000;
const AUTO_CLOUD_ATTEMPT_TIMEOUT_MS: u64 = 6_000;
const MAX_ADVICE_REQUEST_TIMEOUT_MS: u64 = 12_000;

use crate::counter_advice::counter_advice_text;
use crate::gsi::GameTick;

const PERSONA_PROMPT: &str = r#"คุณคือ "Maiden" — ที่ปรึกษา Dota 2 บุคลิก Crystal Maiden แคสเตอร์
สไตล์: สุภาพ ฉลาด มี humor เกี่ยวกับ Nerf CM. ตอบเป็นไทย สั้นกระชับ (1-2 ประโยค) เน้นคำแนะนำเชิงปฏิบัติทันที
สำหรับสถานการณ์ที่ให้. ห้ามทักทาย ห้ามสรุป — ตอบคำแนะนำตรง ๆ."#;

const THROTTLE: Duration = Duration::from_secs(30);

struct CachedAdvice {
    text: String,
    created_at: Instant,
    context_generation: u64,
    session_epoch: Option<u64>,
    backend: &'static str,
    elapsed_ms: u64,
    ollama_model: String,
    from_slm: bool,
}

#[derive(Default)]
struct AdviceCache {
    current_session_epoch: Option<u64>,
    response: Option<CachedAdvice>,
    next_request: u64,
    in_flight: Option<u64>,
    last_admission: Option<(u64, Option<u64>, Instant)>,
    observed_session: Option<(u64, bool)>,
}

static ADVICE_CACHE: Mutex<AdviceCache> = Mutex::new(AdviceCache {
    current_session_epoch: None,
    response: None,
    next_request: 0,
    in_flight: None,
    last_admission: None,
    observed_session: None,
});

struct AdviceFlight(u64);

impl Drop for AdviceFlight {
    fn drop(&mut self) {
        if let Ok(mut cache) = ADVICE_CACHE.lock() {
            if cache.in_flight == Some(self.0) {
                cache.in_flight = None;
            }
        }
    }
}
/// Which backend resolved the most recent *fresh* (non-cached) `advise()`
/// call — "claude" or "ollama". Recorded purely for the CR-011 §B utterance
/// ledger's `meta` field (main.rs::request_advice); `Advice` also exposes the
/// source and elapsed time to the control card.
static LAST_BACKEND: Mutex<Option<&'static str>> = Mutex::new(None);

#[cfg(test)]
#[derive(Copy, Clone, PartialEq, Eq)]
enum RequestStage {
    SnapshotCaptured,
    BeforeCloudDispatch,
    ProviderFinished,
    BeforeReturn,
}

#[cfg(test)]
type RequestHook = Box<dyn FnMut(RequestStage)>;
#[cfg(test)]
type CloudProvider = Box<dyn FnOnce() -> Result<String, String>>;

#[cfg(test)]
thread_local! {
    static REQUEST_HOOK: std::cell::RefCell<Option<RequestHook>> = const { std::cell::RefCell::new(None) };
    static CLOUD_PROVIDER: std::cell::RefCell<Option<CloudProvider>> = const { std::cell::RefCell::new(None) };
}

#[cfg(test)]
fn request_hook(stage: RequestStage) {
    REQUEST_HOOK.with(|hook| {
        if let Some(hook) = hook.borrow_mut().as_mut() {
            hook(stage);
        }
    });
}

#[derive(serde::Serialize, Clone)]
pub struct Advice {
    pub text: String,
    pub cached: bool,
    pub backend: String,
    pub elapsed_ms: u64,
    pub cached_age_ms: Option<u64>,
    pub context_generation: u64,
}

/// Async callers must repeat this bounded publication admission after awaiting
/// the worker and before emitting/voicing its result. No provider I/O belongs
/// in this closure; revocation remains able to complete during network waits.
pub(crate) fn with_advice_publication<T>(
    advice: &Advice,
    publish: impl FnOnce() -> Result<T, String>,
) -> Result<T, String> {
    crate::runtime::with_master_generation_admission(advice.context_generation, false, publish)
}

#[allow(dead_code)] // Constructed by backend_readiness before the lib.rs command is registered.
#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeCliReadiness {
    pub executable_detected: bool,
    pub authentication_verified: bool,
}

#[allow(dead_code)] // Constructed by backend_readiness before the lib.rs command is registered.
#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AnthropicApiReadiness {
    pub api_key_saved: bool,
    pub credential_verified: bool,
}

/// Configuration and loopback model-presence evidence only. Claude credentials,
/// network access, quota, and completion are deliberately not probed here.
#[allow(dead_code)] // Returned by the readiness command owned by the lib.rs integrator.
#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MasterReadiness {
    pub backend: crate::runtime::MasterBackend,
    pub cloud_context_opt_in: bool,
    pub route: &'static str,
    pub ollama: crate::slm::OllamaReadiness,
    pub claude_cli: ClaudeCliReadiness,
    pub anthropic_api: AnthropicApiReadiness,
    pub deterministic_local_fallback: bool,
    pub claude_request_timeout_ms: u64,
    pub auto_claude_attempt_timeout_ms: u64,
    pub ollama_request_timeout_ms: u64,
    pub max_advice_request_timeout_ms: u64,
    pub cost_note: &'static str,
}

/// Backend that produced the last fresh advice ("claude"/"ollama"), if known.
/// `None` before the first call, or if the mutex is poisoned.
pub fn last_backend() -> Option<&'static str> {
    LAST_BACKEND.lock().ok().and_then(|g| *g)
}

/// Consent changes must not leave a cloud-derived answer available through the
/// throttle cache, nor allow an older in-flight call to be reused as fresh.
pub(crate) fn invalidate_advice_cache() {
    if let Ok(mut cache) = ADVICE_CACHE.lock() {
        cache.response = None;
        cache.last_admission = None;
    }
    if let Ok(mut backend) = LAST_BACKEND.lock() {
        *backend = None;
    }
}

pub(crate) fn observe_advice_session(epoch: u64, live: bool) {
    if let Ok(mut cache) = ADVICE_CACHE.lock() {
        if cache.observed_session != Some((epoch, live)) {
            cache.observed_session = Some((epoch, live));
            cache.current_session_epoch = Some(epoch);
            cache.response = None;
            cache.last_admission = None;
        }
    }
}

fn session_admission(cache: &AdviceCache, requested: Option<u64>) -> Result<(), String> {
    if cache
        .observed_session
        .is_some_and(|(epoch, live)| !live || requested != Some(epoch))
    {
        return Err("Advice request does not belong to the current live session.".into());
    }
    Ok(())
}

/// Snapshot backend configuration and check whether the selected Ollama model
/// is listed by the loopback tags endpoint. Cloud auth/network/quota remain
/// unknown because this preflight sends no request to Anthropic or Claude CLI.
#[allow(dead_code)] // Registered as get_master_readiness by the lib.rs integration owner.
pub fn backend_readiness() -> MasterReadiness {
    let backend = crate::runtime::master_backend();
    let cloud_context_opt_in = crate::runtime::master_cloud_context_opt_in();
    let route = match advice_route(backend, cloud_context_opt_in) {
        Ok(AdviceRoute::LocalOnly) => "local-only",
        Ok(AdviceRoute::CloudOnly) => "cloud-only",
        Ok(AdviceRoute::CloudThenLocal) => "cloud-then-local",
        Err(_) => "cloud-blocked-by-opt-in",
    };
    let model = crate::runtime::master_ollama_model();
    MasterReadiness {
        backend,
        cloud_context_opt_in,
        route,
        ollama: crate::slm::readiness(&model),
        claude_cli: ClaudeCliReadiness {
            executable_detected: executable_on_path("claude"),
            authentication_verified: false,
        },
        anthropic_api: AnthropicApiReadiness {
            api_key_saved: crate::runtime::master_api_key_present(),
            credential_verified: false,
        },
        deterministic_local_fallback: true,
        claude_request_timeout_ms: CLAUDE_REQUEST_TIMEOUT_MS,
        auto_claude_attempt_timeout_ms: AUTO_CLOUD_ATTEMPT_TIMEOUT_MS,
        ollama_request_timeout_ms: crate::slm::OLLAMA_REQUEST_TIMEOUT_MS,
        max_advice_request_timeout_ms: MAX_ADVICE_REQUEST_TIMEOUT_MS,
        cost_note: "Ollama uses local device resources. Claude quota or API cost depends on the selected account; any UI estimate is not an exact charge.",
    }
}

#[allow(dead_code)] // Used by backend_readiness before the lib.rs command is registered.
fn executable_on_path(name: &str) -> bool {
    let Some(path) = std::env::var_os("PATH") else {
        return false;
    };
    let paths = std::env::split_paths(&path);
    #[cfg(windows)]
    let extensions: Vec<String> = std::env::var("PATHEXT")
        .unwrap_or_else(|_| ".COM;.EXE;.BAT;.CMD".into())
        .split(';')
        .filter(|extension| !extension.is_empty())
        .map(str::to_owned)
        .collect();
    paths.into_iter().any(|directory| {
        if directory.join(name).is_file() {
            return true;
        }
        #[cfg(windows)]
        {
            extensions
                .iter()
                .any(|extension| directory.join(format!("{name}{extension}")).is_file())
        }
        #[cfg(not(windows))]
        {
            false
        }
    })
}

fn hero_thai(raw: &str) -> String {
    raw.strip_prefix("npc_dota_hero_")
        .unwrap_or(raw)
        .replace('_', " ")
}

fn build_prompt(tick: &GameTick, enemies: &[String]) -> String {
    let phase = if tick.clock_time < 0 {
        "ก่อนเข้าเลน"
    } else if tick.clock_time < 600 {
        "early game"
    } else if tick.clock_time < 1800 {
        "mid game"
    } else {
        "late game"
    };

    // G5.2: inject counter-item advice from the dataset, grounded on the enemy
    // heroes the CV pipeline has identified this match (passed from the frontend
    // via request_advice). Empty list → empty advice string (best-effort: heroes
    // CV never spots simply don't contribute).
    let advice = counter_advice_text(enemies);

    // Ground the advice on the player's OWN single-combo burst (real hero + level
    // + items; skill build estimated). Empty when the hero isn't in the damage DB.
    // Own-data only — enemy defenses aren't observable, so this is "combo hits ~X
    // on a soft target", not a kill call.
    let burst_line = crate::damage::self_burst_with_loadout(
        &tick.hero,
        tick.level.max(1) as u32,
        &tick.combat_items,
    )
    .map(|b| {
        format!(
            "พลังคอมโบโดยประมาณ ~{:.0} dmg (คิดกับเป้าเปลือย เกราะ 0 / ต้านเวท 25%, สกิลบิลด์มาตรฐาน).",
            b.total_burst
        )
    })
    .unwrap_or_default();

    format!(
        "{persona}\n\nสถานการณ์ ({phase} · clock {clock}s): \
         ฮีโร่ {hero} เลเวล {lvl}, KDA {k}/{d}/{a}, net worth {nw}, gold {gold}, \
         HP {hp}%, mana {mana}%, score {rs}:{ds}.\n\
         คำแนะนำ: {advice}\n\
         {burst}\n\
         แนะนำสั้น ๆ ว่าควรทำอะไรต่อ (ซื้อของ/ขึ้นสกิล/positioning).",
        persona = PERSONA_PROMPT,
        phase = phase,
        clock = tick.clock_time,
        hero = hero_thai(&tick.hero),
        lvl = tick.level,
        k = tick.kills,
        d = tick.deaths,
        a = tick.assists,
        nw = tick.net_worth,
        gold = tick.gold,
        hp = tick.hp_percent,
        mana = tick.mana_percent,
        rs = tick.radiant_score,
        ds = tick.dire_score,
        advice = advice,
        burst = burst_line,
    )
}

/// The only live-match fields allowed into an external provider request.
/// Keep this purpose-built object separate from `GameTick` so adding a GSI
/// field cannot silently widen the cloud payload.
#[derive(Debug, PartialEq, Eq)]
struct CloudAdviceContext {
    phase: &'static str,
    own_hero: String,
    own_level: i64,
    own_kills: i64,
    own_deaths: i64,
    own_assists: i64,
    own_net_worth: i64,
    own_gold: i64,
    own_hp_percent: i64,
    own_mana_percent: i64,
    radiant_score: i64,
    dire_score: i64,
}

fn safe_own_hero(raw: &str) -> String {
    let name = raw.strip_prefix("npc_dota_hero_").unwrap_or(raw);
    if name.is_empty()
        || name.len() > 64
        || !name
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'_')
    {
        return "unknown".into();
    }
    name.replace('_', " ")
}

fn cloud_advice_context(tick: &GameTick) -> CloudAdviceContext {
    let phase = if tick.clock_time < 0 {
        "pre-game"
    } else if tick.clock_time < 600 {
        "early game"
    } else if tick.clock_time < 1800 {
        "mid game"
    } else {
        "late game"
    };
    CloudAdviceContext {
        phase,
        own_hero: safe_own_hero(&tick.hero),
        own_level: tick.level.clamp(0, 30),
        own_kills: tick.kills.max(0),
        own_deaths: tick.deaths.max(0),
        own_assists: tick.assists.max(0),
        own_net_worth: tick.net_worth.max(0),
        own_gold: tick.gold.max(0),
        own_hp_percent: tick.hp_percent.clamp(0, 100),
        own_mana_percent: tick.mana_percent.clamp(0, 100),
        radiant_score: tick.radiant_score.max(0),
        dire_score: tick.dire_score.max(0),
    }
}

fn build_cloud_prompt(tick: &GameTick) -> String {
    let context = cloud_advice_context(tick);
    format!(
        "{persona}\n\nสถานการณ์โดยสรุป ({phase}): ฮีโร่ของผู้เล่น {hero} เลเวล {level}, KDA {kills}/{deaths}/{assists}, net worth {net_worth}, gold {gold}, HP {hp}%, mana {mana}%, score {radiant}:{dire}.\nแนะนำสั้น ๆ ว่าควรทำอะไรต่อ โดยอ้างอิงเฉพาะข้อมูลที่ให้มา.",
        persona = PERSONA_PROMPT,
        phase = context.phase,
        hero = context.own_hero,
        level = context.own_level,
        kills = context.own_kills,
        deaths = context.own_deaths,
        assists = context.own_assists,
        net_worth = context.own_net_worth,
        gold = context.own_gold,
        hp = context.own_hp_percent,
        mana = context.own_mana_percent,
        radiant = context.radiant_score,
        dire = context.dire_score,
    )
}

#[derive(Copy, Clone, Debug, PartialEq, Eq)]
enum AdviceRoute {
    LocalOnly,
    CloudOnly,
    CloudThenLocal,
}

fn advice_route(
    backend: crate::runtime::MasterBackend,
    cloud_context_opt_in: bool,
) -> Result<AdviceRoute, &'static str> {
    use crate::runtime::MasterBackend::{Auto, Claude, Ollama};
    match (backend, cloud_context_opt_in) {
        (Ollama, _) | (Auto, false) => Ok(AdviceRoute::LocalOnly),
        (Claude, false) => {
            Err("Cloud game context is off. Enable the separate opt-in or choose Ollama.")
        }
        (Claude, true) => Ok(AdviceRoute::CloudOnly),
        (Auto, true) => Ok(AdviceRoute::CloudThenLocal),
    }
}

#[cfg(test)]
fn execute_advice_route<C, L>(
    route: AdviceRoute,
    cloud: C,
    local: L,
) -> Result<(String, bool), String>
where
    C: FnOnce() -> Result<String, String>,
    L: FnOnce() -> Result<String, String>,
{
    match route {
        AdviceRoute::LocalOnly => local()
            .map(|text| (text, true))
            .map_err(|error| format!("ollama: {error}")),
        AdviceRoute::CloudOnly => cloud()
            .map(|text| (text, false))
            .map_err(|error| format!("claude: {error}")),
        AdviceRoute::CloudThenLocal => match cloud() {
            Ok(text) => Ok((text, false)),
            Err(cloud_error) => {
                eprintln!("[G-Master] claude unavailable ({cloud_error}); trying local SLM…");
                local()
                    .map(|text| (text, true))
                    .map_err(|local_error| format!("claude: {cloud_error}; SLM: {local_error}"))
            }
        },
    }
}

fn cache_origin_allowed(route: AdviceRoute, from_slm: bool) -> bool {
    match route {
        AdviceRoute::LocalOnly => from_slm,
        AdviceRoute::CloudOnly => !from_slm,
        AdviceRoute::CloudThenLocal => true,
    }
}

/// Ask for advice within a match-session namespace. Callers should pass the
/// active session epoch so a late result from an ended match cannot hit or
/// overwrite the cache for the next one.
pub fn advise_with_epoch(
    tick: &GameTick,
    enemies: &[String],
    session_epoch: Option<u64>,
) -> Result<Advice, String> {
    let request_started = Instant::now();
    let context = crate::runtime::master_request_context()?;
    let route =
        advice_route(context.backend, context.cloud_context_opt_in).map_err(str::to_string)?;
    #[cfg(test)]
    request_hook(RequestStage::SnapshotCaptured);
    let context_generation = context.generation;
    let ollama_model = context.ollama_model.clone();

    // Record a new epoch before doing provider work. This prevents an older
    // in-flight request from writing after the next match has started.
    let (cached, flight) = crate::runtime::with_master_request_admission(&context, false, || {
        let mut cache = ADVICE_CACHE
            .lock()
            .map_err(|_| "G-Master advice cache is unavailable".to_string())?;
        session_admission(&cache, session_epoch)?;
        observe_session_epoch(&mut cache.current_session_epoch, session_epoch)?;
        if let Some(cached) = cache.response.as_ref() {
            if cached.session_epoch == session_epoch
                && cached.context_generation == context_generation
                && cached.ollama_model == ollama_model
                && cached.created_at.elapsed() < THROTTLE
                && cache_origin_allowed(route, cached.from_slm)
            {
                return Ok((
                    Some(Advice {
                        text: cached.text.clone(),
                        cached: true,
                        backend: cached.backend.into(),
                        elapsed_ms: cached.elapsed_ms,
                        cached_age_ms: Some(cached.created_at.elapsed().as_millis() as u64),
                        context_generation,
                    }),
                    None,
                ));
            }
        }
        let same_namespace = cache
            .last_admission
            .as_ref()
            .is_some_and(|(generation, epoch, _)| {
                *generation == context_generation && *epoch == session_epoch
            });
        if cache.in_flight.is_some()
            || (same_namespace
                && cache
                    .last_admission
                    .as_ref()
                    .is_some_and(|(_, _, at)| at.elapsed() < THROTTLE))
        {
            return Err(
                "G-Master advice is already in flight or throttled; try again later.".into(),
            );
        }
        cache.next_request = cache.next_request.wrapping_add(1);
        let id = cache.next_request;
        cache.in_flight = Some(id);
        cache.last_admission = Some((context_generation, session_epoch, Instant::now()));
        Ok((None, Some(AdviceFlight(id))))
    })?;
    if let Some(cached) = cached {
        return Ok(cached);
    }
    let _flight = flight;

    let local_prompt = build_prompt(tick, enemies);

    // Cloud receives a separately-built allowlisted prompt. Auto skips cloud
    // entirely while consent is off; a forced Claude route fails closed.
    let (text, from_slm) = execute_advice_route_with_budget(
        route,
        request_started,
        MAX_ADVICE_REQUEST_TIMEOUT_MS,
        AUTO_CLOUD_ATTEMPT_TIMEOUT_MS,
        |timeout_ms| {
            #[cfg(test)]
            request_hook(RequestStage::BeforeCloudDispatch);
            try_claude(&build_cloud_prompt(tick), timeout_ms, &context)
        },
        |timeout_ms| {
            crate::runtime::with_master_request_admission(&context, false, || Ok(()))?;
            crate::slm::advise_offline_with_timeout(&local_prompt, &ollama_model, timeout_ms)
        },
    )?;
    #[cfg(test)]
    request_hook(RequestStage::ProviderFinished);

    if request_started.elapsed() > Duration::from_millis(MAX_ADVICE_REQUEST_TIMEOUT_MS) {
        return Err(format!(
            "G-Master request exceeded its {} ms deadline; response discarded.",
            MAX_ADVICE_REQUEST_TIMEOUT_MS
        ));
    }
    let elapsed_ms = request_started.elapsed().as_millis() as u64;
    let resolved_backend = if from_slm { "ollama" } else { "claude" };
    crate::runtime::with_master_request_admission(&context, false, || {
        let mut cache = ADVICE_CACHE
            .lock()
            .map_err(|_| "G-Master advice cache is unavailable".to_string())?;
        session_admission(&cache, session_epoch)?;
        if !request_epoch_is_current(cache.current_session_epoch, session_epoch) {
            return Err(
                "Advice response belongs to an earlier match session and was discarded.".into(),
            );
        }
        cache.response = Some(CachedAdvice {
            text: text.clone(),
            created_at: Instant::now(),
            context_generation,
            session_epoch,
            backend: resolved_backend,
            elapsed_ms,
            ollama_model,
            from_slm,
        });
        if let Ok(mut g) = LAST_BACKEND.lock() {
            *g = Some(resolved_backend);
        }
        Ok(())
    })?;
    // Quota monitor — only Claude-served responses burn Plan/API quota.
    // Ollama answers are free, and cached hits returned before this point.
    // Unit-test providers must not append to the installed user's usage ledger.
    #[cfg(not(test))]
    if !from_slm {
        crate::usage::record_advice(
            build_cloud_prompt(tick).chars().count(),
            text.chars().count(),
        );
    }
    #[cfg(test)]
    request_hook(RequestStage::BeforeReturn);
    let advice = Advice {
        text,
        cached: false,
        backend: resolved_backend.into(),
        elapsed_ms,
        cached_age_ms: None,
        context_generation,
    };
    with_advice_publication(&advice, || Ok(advice.clone()))
}

fn observe_session_epoch(current: &mut Option<u64>, requested: Option<u64>) -> Result<(), String> {
    match (*current, requested) {
        (Some(current), Some(requested)) if requested < current => {
            Err("Advice request belongs to an earlier match session and was discarded.".into())
        }
        (Some(_), None) => Err(
            "Advice request is missing the active match session epoch and was discarded.".into(),
        ),
        (_, Some(requested)) => {
            if *current != Some(requested) {
                *current = Some(requested);
            }
            Ok(())
        }
        (None, None) => Ok(()),
    }
}

fn request_epoch_is_current(current: Option<u64>, requested: Option<u64>) -> bool {
    current == requested
}

fn remaining_budget_ms(total_budget_ms: u64, elapsed_ms: u64) -> u64 {
    total_budget_ms.saturating_sub(elapsed_ms)
}

fn bounded_provider_budget_ms(remaining_ms: u64, provider_cap_ms: u64) -> u64 {
    remaining_ms.min(provider_cap_ms)
}

fn auto_cloud_budget_ms(total_budget_ms: u64, elapsed_ms: u64, cloud_cap_ms: u64) -> u64 {
    bounded_provider_budget_ms(
        remaining_budget_ms(total_budget_ms, elapsed_ms),
        cloud_cap_ms,
    )
}

fn fallback_budget_ms(total_budget_ms: u64, elapsed_ms: u64, local_cap_ms: u64) -> u64 {
    bounded_provider_budget_ms(
        remaining_budget_ms(total_budget_ms, elapsed_ms),
        local_cap_ms,
    )
}

fn execute_advice_route_with_budget<C, L>(
    route: AdviceRoute,
    started: Instant,
    total_budget_ms: u64,
    auto_cloud_cap_ms: u64,
    cloud: C,
    local: L,
) -> Result<(String, bool), String>
where
    C: FnOnce(u64) -> Result<String, String>,
    L: FnOnce(u64) -> Result<String, String>,
{
    match route {
        AdviceRoute::LocalOnly => {
            let budget = fallback_budget_ms(
                total_budget_ms,
                started.elapsed().as_millis() as u64,
                crate::slm::OLLAMA_REQUEST_TIMEOUT_MS,
            );
            if budget == 0 {
                return Err("G-Master request deadline expired before Ollama started.".into());
            }
            local(budget)
                .map(|text| (text, true))
                .map_err(|error| format!("ollama: {error}"))
        }
        AdviceRoute::CloudOnly => {
            let budget = bounded_provider_budget_ms(
                remaining_budget_ms(total_budget_ms, started.elapsed().as_millis() as u64),
                CLAUDE_REQUEST_TIMEOUT_MS,
            );
            if budget == 0 {
                return Err("G-Master request deadline expired before Claude started.".into());
            }
            cloud(budget)
                .map(|text| (text, false))
                .map_err(|error| format!("claude: {error}"))
        }
        AdviceRoute::CloudThenLocal => {
            let cloud_budget = auto_cloud_budget_ms(
                total_budget_ms,
                started.elapsed().as_millis() as u64,
                auto_cloud_cap_ms,
            );
            let cloud_result = if cloud_budget == 0 {
                Err("request deadline expired before Claude started".to_string())
            } else {
                cloud(cloud_budget)
            };
            match cloud_result {
                Ok(text) => Ok((text, false)),
                Err(cloud_error) => {
                    let local_budget = fallback_budget_ms(
                        total_budget_ms,
                        started.elapsed().as_millis() as u64,
                        crate::slm::OLLAMA_REQUEST_TIMEOUT_MS,
                    );
                    if local_budget == 0 {
                        return Err(format!(
                            "claude: {cloud_error}; Ollama fallback skipped because the G-Master request deadline expired"
                        ));
                    }
                    local(local_budget)
                        .map(|text| (text, true))
                        .map_err(|local_error| format!("claude: {cloud_error}; SLM: {local_error}"))
                }
            }
        }
    }
}

/// Claude advice path. When the user has chosen API-key auth and entered a key,
/// call the Anthropic Messages API directly; otherwise shell out to the signed-in
/// `claude` CLI (Plan quota, no key).
fn try_claude(
    prompt: &str,
    timeout_ms: u64,
    context: &crate::runtime::MasterRequestContext,
) -> Result<String, String> {
    #[cfg(test)]
    if let Some(provider) = CLOUD_PROVIDER.with(|provider| provider.borrow_mut().take()) {
        let provider =
            crate::runtime::with_master_request_admission(context, true, || Ok(provider))?;
        return provider();
    }
    if let Some(key) = context.api_key.as_deref() {
        return try_anthropic_api_with_timeout(prompt, key, timeout_ms, context);
    }
    try_claude_cli(prompt, timeout_ms, context)
}

/// POST the prompt to the Anthropic Messages API via curl (same shell-out pattern
/// as the ollama path — no new Rust dependency). Parses `content[0].text`.
fn try_anthropic_api_with_timeout(
    prompt: &str,
    key: &str,
    timeout_ms: u64,
    context: &crate::runtime::MasterRequestContext,
) -> Result<String, String> {
    if timeout_ms == 0 {
        return Err("Anthropic API request timed out before it started".into());
    }
    let body = anthropic_request_body(prompt);
    let timeout_seconds = format!("{:.3}", timeout_ms.max(1) as f64 / 1000.0);
    let connect_timeout_seconds = format!("{:.3}", timeout_ms.clamp(1, 2_000) as f64 / 1000.0);

    let mut cmd = Command::new("curl");
    cmd.args([
        "-sS",
        "--connect-timeout",
        &connect_timeout_seconds,
        "--max-time",
        &timeout_seconds,
        "-X",
        "POST",
        "https://api.anthropic.com/v1/messages",
        "-H",
        &format!("x-api-key: {key}"),
        "-H",
        "anthropic-version: 2023-06-01",
        "-H",
        "content-type: application/json",
        "-d",
        &body,
    ])
    .stdin(Stdio::null())
    .stdout(Stdio::piped())
    .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW — no console flash
    }
    let child = crate::runtime::with_master_request_admission(context, true, || {
        cmd.spawn().map_err(|e| format!("เรียก curl ไม่ได้: {e}"))
    })?;
    let out = child
        .wait_with_output()
        .map_err(|e| format!("รอ curl ไม่ได้: {e}"))?;
    if !out.status.success() {
        if out.status.code() == Some(28) {
            return Err(format!("Anthropic API timed out after {timeout_ms} ms"));
        }
        let detail = String::from_utf8_lossy(&out.stderr).trim().to_string();
        return Err(if detail.is_empty() {
            format!("curl exit {:?}", out.status.code())
        } else {
            format!("curl exit {:?}: {detail}", out.status.code())
        });
    }
    let raw = String::from_utf8_lossy(&out.stdout);
    let v: serde_json::Value = serde_json::from_str(&raw).map_err(|e| {
        format!(
            "JSON parse: {e} — raw: {}",
            raw.chars().take(160).collect::<String>()
        )
    })?;
    // Surface API errors (bad key, rate limit) instead of a confusing empty parse.
    if let Some(err) = v.pointer("/error/message").and_then(|m| m.as_str()) {
        return Err(format!("Anthropic API: {err}"));
    }
    v.pointer("/content/0/text")
        .and_then(|t| t.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "Anthropic API คืนผลว่าง".into())
}

fn anthropic_request_body(prompt: &str) -> String {
    serde_json::json!({
        "model": ANTHROPIC_MODEL,
        "max_tokens": 300,
        "messages": [{ "role": "user", "content": prompt }],
    })
    .to_string()
}

fn claude_cli_args(prompt: &str) -> [&str; 2] {
    ["-p", prompt]
}

fn try_claude_cli(
    prompt: &str,
    timeout_ms: u64,
    context: &crate::runtime::MasterRequestContext,
) -> Result<String, String> {
    let mut cmd = Command::new("claude");
    cmd.args(claude_cli_args(prompt))
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
    let out = run_command_with_timeout(cmd, timeout_ms, "claude CLI", context)?;
    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr);
        return Err(format!("claude คืน error: {}", stderr.trim()));
    }
    let text = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if text.is_empty() {
        return Err("claude คืนผลว่าง".into());
    }
    Ok(text)
}

fn run_command_with_timeout(
    mut command: Command,
    timeout_ms: u64,
    label: &str,
    context: &crate::runtime::MasterRequestContext,
) -> Result<std::process::Output, String> {
    if timeout_ms == 0 {
        return Err(format!("{label} timed out before it started"));
    }
    let mut child = crate::runtime::with_master_request_admission(context, true, || {
        command
            .spawn()
            .map_err(|error| format!("could not start {label}: {error}"))
    })?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| format!("{label} stdout pipe unavailable"))?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| format!("{label} stderr pipe unavailable"))?;
    let stdout_reader = thread::spawn(move || read_pipe(stdout));
    let stderr_reader = thread::spawn(move || read_pipe(stderr));
    let deadline = Instant::now() + Duration::from_millis(timeout_ms);
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if Instant::now() < deadline => thread::sleep(Duration::from_millis(25)),
            Ok(None) => {
                let _ = child.kill();
                let _ = child.wait();
                let _ = stdout_reader.join();
                let _ = stderr_reader.join();
                return Err(format!("{label} timed out after {timeout_ms} ms"));
            }
            Err(error) => {
                let _ = child.kill();
                let _ = child.wait();
                let _ = stdout_reader.join();
                let _ = stderr_reader.join();
                return Err(format!("could not wait for {label}: {error}"));
            }
        }
    };
    let stdout = stdout_reader
        .join()
        .map_err(|_| format!("{label} stdout reader failed"))?
        .map_err(|error| format!("could not read {label} stdout: {error}"))?;
    let stderr = stderr_reader
        .join()
        .map_err(|_| format!("{label} stderr reader failed"))?
        .map_err(|error| format!("could not read {label} stderr: {error}"))?;
    Ok(std::process::Output {
        status,
        stdout,
        stderr,
    })
}

fn read_pipe<R: Read + Send + 'static>(mut pipe: R) -> std::io::Result<Vec<u8>> {
    let mut output = Vec::new();
    pipe.read_to_end(&mut output)?;
    Ok(output)
}

#[cfg(test)]
mod tests {
    use super::*;

    static MASTER_TEST_LOCK: Mutex<()> = Mutex::new(());

    fn consent_race_at(stage: RequestStage, epoch: u64) {
        let _serial = MASTER_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        crate::runtime::set_master_backend(crate::runtime::MasterBackend::Claude);
        crate::runtime::set_master_cloud_context_opt_in(true);
        *ADVICE_CACHE.lock().unwrap() = AdviceCache::default();
        let calls = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let provider_calls = calls.clone();
        CLOUD_PROVIDER.with(|provider| {
            *provider.borrow_mut() = Some(Box::new(move || {
                provider_calls.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                Ok("private cloud answer".into())
            }));
        });
        REQUEST_HOOK.with(|hook| {
            *hook.borrow_mut() = Some(Box::new(move |reached| {
                if reached == stage {
                    crate::runtime::set_master_cloud_context_opt_in(false);
                }
            }));
        });
        let result = advise_with_epoch(&fake_tick(), &[], Some(epoch));
        REQUEST_HOOK.with(|hook| *hook.borrow_mut() = None);
        CLOUD_PROVIDER.with(|provider| *provider.borrow_mut() = None);
        let calls = calls.load(std::sync::atomic::Ordering::SeqCst);
        let cached = ADVICE_CACHE.lock().unwrap().response.is_some();
        crate::runtime::set_master_backend(crate::runtime::MasterBackend::Auto);
        assert!(
            result.is_err(),
            "revoked request must not publish an answer"
        );
        assert!(!cached, "revoked request must not repopulate the cache");
        assert_eq!(
            calls,
            usize::from(matches!(
                stage,
                RequestStage::ProviderFinished | RequestStage::BeforeReturn
            ))
        );
    }

    #[test]
    fn consent_revoked_between_route_and_generation_cannot_launch_cloud() {
        consent_race_at(RequestStage::SnapshotCaptured, 10_001);
    }

    #[test]
    fn consent_revoked_before_dispatch_cannot_launch_cloud() {
        consent_race_at(RequestStage::BeforeCloudDispatch, 10_002);
    }

    #[test]
    fn consent_revoked_after_provider_discards_output_and_cache() {
        consent_race_at(RequestStage::ProviderFinished, 10_003);
    }

    #[test]
    fn consent_revoked_after_cache_publication_cannot_return_stale_output() {
        consent_race_at(RequestStage::BeforeReturn, 10_007);
    }

    #[test]
    fn consent_revoke_and_regrant_before_dispatch_does_not_restore_old_authority() {
        let _serial = MASTER_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        crate::runtime::set_master_backend(crate::runtime::MasterBackend::Claude);
        crate::runtime::set_master_cloud_context_opt_in(true);
        *ADVICE_CACHE.lock().unwrap() = AdviceCache::default();
        CLOUD_PROVIDER.with(|provider| {
            *provider.borrow_mut() = Some(Box::new(|| panic!("stale request launched cloud")));
        });
        REQUEST_HOOK.with(|hook| {
            *hook.borrow_mut() = Some(Box::new(|stage| {
                if stage == RequestStage::BeforeCloudDispatch {
                    crate::runtime::set_master_cloud_context_opt_in(false);
                    crate::runtime::set_master_cloud_context_opt_in(true);
                }
            }));
        });
        let result = advise_with_epoch(&fake_tick(), &[], Some(10_004));
        REQUEST_HOOK.with(|hook| *hook.borrow_mut() = None);
        CLOUD_PROVIDER.with(|provider| *provider.borrow_mut() = None);
        crate::runtime::set_master_cloud_context_opt_in(false);
        crate::runtime::set_master_backend(crate::runtime::MasterBackend::Auto);
        assert!(result.is_err());
        assert!(ADVICE_CACHE.lock().unwrap().response.is_none());
    }

    #[test]
    fn configuration_changes_before_dispatch_invalidate_old_requests() {
        let _serial = MASTER_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let changes: [fn(); 4] = [
            || crate::runtime::set_master_backend(crate::runtime::MasterBackend::Ollama),
            || crate::runtime::set_master_ollama_model("changed-local-model".into()),
            || crate::runtime::set_master_mode(true),
            || crate::runtime::set_master_api_key(Some("test-key-never-sent".into())),
        ];
        for change in changes {
            crate::runtime::set_master_backend(crate::runtime::MasterBackend::Claude);
            crate::runtime::set_master_cloud_context_opt_in(true);
            crate::runtime::set_master_ollama_model(String::new());
            crate::runtime::set_master_mode(false);
            crate::runtime::set_master_api_key(None);
            *ADVICE_CACHE.lock().unwrap() = AdviceCache::default();
            CLOUD_PROVIDER.with(|provider| {
                *provider.borrow_mut() =
                    Some(Box::new(|| panic!("stale configuration launched cloud")));
            });
            REQUEST_HOOK.with(|hook| {
                *hook.borrow_mut() = Some(Box::new(move |stage| {
                    if stage == RequestStage::BeforeCloudDispatch {
                        change();
                    }
                }));
            });
            let result = advise_with_epoch(&fake_tick(), &[], Some(10_006));
            REQUEST_HOOK.with(|hook| *hook.borrow_mut() = None);
            CLOUD_PROVIDER.with(|provider| *provider.borrow_mut() = None);
            assert!(result.is_err());
            assert!(ADVICE_CACHE.lock().unwrap().response.is_none());
        }
        crate::runtime::set_master_cloud_context_opt_in(false);
        crate::runtime::set_master_backend(crate::runtime::MasterBackend::Auto);
        crate::runtime::set_master_api_key(None);
    }

    #[test]
    fn consent_revocation_rejects_delayed_publication_and_cached_output() {
        let _serial = MASTER_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        crate::runtime::set_master_backend(crate::runtime::MasterBackend::Claude);
        crate::runtime::set_master_cloud_context_opt_in(true);
        *ADVICE_CACHE.lock().unwrap() = AdviceCache::default();
        CLOUD_PROVIDER.with(|provider| {
            *provider.borrow_mut() = Some(Box::new(|| Ok("authorized answer".into())));
        });
        let fresh = advise_with_epoch(&fake_tick(), &[], Some(10_008)).unwrap();
        CLOUD_PROVIDER.with(|provider| {
            *provider.borrow_mut() = Some(Box::new(|| panic!("cache hit launched a provider")));
        });
        let cached = advise_with_epoch(&fake_tick(), &[], Some(10_008)).unwrap();
        CLOUD_PROVIDER.with(|provider| *provider.borrow_mut() = None);
        assert!(cached.cached);
        crate::runtime::set_master_cloud_context_opt_in(false);
        let mut published = 0;
        for answer in [&fresh, &cached] {
            assert!(with_advice_publication(answer, || {
                published += 1;
                Ok(())
            })
            .is_err());
        }
        assert!(advise_with_epoch(&fake_tick(), &[], Some(10_008)).is_err());
        crate::runtime::set_master_backend(crate::runtime::MasterBackend::Auto);
        assert_eq!(published, 0);
        assert!(ADVICE_CACHE.lock().unwrap().response.is_none());
    }

    #[test]
    fn consent_opt_out_does_not_wait_for_in_flight_provider_io() {
        use std::sync::mpsc;
        let _serial = MASTER_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        crate::runtime::set_master_backend(crate::runtime::MasterBackend::Claude);
        crate::runtime::set_master_cloud_context_opt_in(true);
        *ADVICE_CACHE.lock().unwrap() = AdviceCache::default();
        let (launched_tx, launched_rx) = mpsc::channel();
        let (finish_tx, finish_rx) = mpsc::channel();
        let request = thread::spawn(move || {
            CLOUD_PROVIDER.with(|provider| {
                *provider.borrow_mut() = Some(Box::new(move || {
                    launched_tx.send(()).unwrap();
                    finish_rx.recv_timeout(Duration::from_secs(5)).unwrap();
                    Ok("already admitted cloud answer".into())
                }));
            });
            advise_with_epoch(&fake_tick(), &[], Some(10_005))
        });
        launched_rx.recv_timeout(Duration::from_secs(2)).unwrap();
        let (revoked_tx, revoked_rx) = mpsc::channel();
        let revoke = thread::spawn(move || {
            crate::runtime::set_master_cloud_context_opt_in(false);
            revoked_tx.send(()).unwrap();
        });
        let opt_out_completed = revoked_rx.recv_timeout(Duration::from_secs(2));
        // Release the fake provider even on failure, so a misplaced I/O lock
        // fails an assertion instead of leaving test threads permanently stuck.
        finish_tx.send(()).unwrap();
        revoke.join().unwrap();
        let result = request.join().unwrap();
        crate::runtime::set_master_backend(crate::runtime::MasterBackend::Auto);
        assert!(
            opt_out_completed.is_ok(),
            "opt-out was blocked on provider I/O"
        );
        assert!(result.is_err(), "an in-flight revoked answer was published");
        assert!(ADVICE_CACHE.lock().unwrap().response.is_none());
        assert_eq!(last_backend(), None);
    }

    #[test]
    fn concurrent_manual_and_auto_advice_admit_only_one_provider() {
        use std::sync::mpsc;
        let _serial = MASTER_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        crate::runtime::set_master_backend(crate::runtime::MasterBackend::Claude);
        crate::runtime::set_master_cloud_context_opt_in(true);
        *ADVICE_CACHE.lock().unwrap() = AdviceCache::default();
        let (entered_tx, entered_rx) = mpsc::channel();
        let (finish_tx, finish_rx) = mpsc::channel();
        let first = thread::spawn(move || {
            CLOUD_PROVIDER.with(|provider| {
                *provider.borrow_mut() = Some(Box::new(move || {
                    entered_tx.send(()).unwrap();
                    finish_rx.recv_timeout(Duration::from_secs(5)).unwrap();
                    Ok("first admitted".into())
                }))
            });
            advise_with_epoch(&fake_tick(), &[], Some(11_001))
        });
        entered_rx.recv_timeout(Duration::from_secs(2)).unwrap();
        CLOUD_PROVIDER
            .with(|provider| *provider.borrow_mut() = Some(Box::new(|| Ok("duplicate".into()))));
        let duplicate = advise_with_epoch(&fake_tick(), &[], Some(11_001));
        CLOUD_PROVIDER.with(|provider| *provider.borrow_mut() = None);
        finish_tx.send(()).unwrap();
        let accepted = first.join().unwrap().unwrap();
        assert!(
            duplicate.is_err(),
            "a concurrent caller launched another provider"
        );
        assert_eq!(accepted.text, "first admitted");
        let cached = advise_with_epoch(&fake_tick(), &[], Some(11_001)).unwrap();
        assert!(cached.cached);
        assert_eq!(cached.text, "first admitted");
        crate::runtime::set_master_cloud_context_opt_in(false);
        crate::runtime::set_master_backend(crate::runtime::MasterBackend::Auto);
    }

    #[test]
    fn failed_provider_releases_flight_but_admission_still_throttles() {
        let _serial = MASTER_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        crate::runtime::set_master_backend(crate::runtime::MasterBackend::Claude);
        crate::runtime::set_master_cloud_context_opt_in(true);
        *ADVICE_CACHE.lock().unwrap() = AdviceCache::default();
        CLOUD_PROVIDER
            .with(|provider| *provider.borrow_mut() = Some(Box::new(|| Err("offline".into()))));
        assert!(advise_with_epoch(&fake_tick(), &[], Some(11_002)).is_err());
        CLOUD_PROVIDER
            .with(|provider| *provider.borrow_mut() = Some(Box::new(|| Ok("too soon".into()))));
        let too_soon = advise_with_epoch(&fake_tick(), &[], Some(11_002));
        CLOUD_PROVIDER.with(|provider| *provider.borrow_mut() = None);
        assert!(ADVICE_CACHE.lock().unwrap().in_flight.is_none());
        ADVICE_CACHE
            .lock()
            .unwrap()
            .last_admission
            .as_mut()
            .unwrap()
            .2 = Instant::now() - THROTTLE;
        CLOUD_PROVIDER.with(|provider| {
            *provider.borrow_mut() = Some(Box::new(|| Ok("after throttle".into())))
        });
        assert_eq!(
            advise_with_epoch(&fake_tick(), &[], Some(11_002))
                .unwrap()
                .text,
            "after throttle"
        );
        crate::runtime::set_master_cloud_context_opt_in(false);
        crate::runtime::set_master_backend(crate::runtime::MasterBackend::Auto);
        assert!(
            too_soon.is_err(),
            "a failed provider bypassed the 30-second admission throttle"
        );
    }

    #[test]
    fn obsolete_flight_keeps_global_single_flight_without_consuming_new_namespace_throttle() {
        use std::sync::mpsc;
        let _serial = MASTER_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        crate::runtime::set_master_backend(crate::runtime::MasterBackend::Claude);
        crate::runtime::set_master_cloud_context_opt_in(true);
        *ADVICE_CACHE.lock().unwrap() = AdviceCache::default();
        let (entered_tx, entered_rx) = mpsc::channel();
        let (finish_tx, finish_rx) = mpsc::channel();
        let old = thread::spawn(move || {
            CLOUD_PROVIDER.with(|provider| {
                *provider.borrow_mut() = Some(Box::new(move || {
                    entered_tx.send(()).unwrap();
                    finish_rx.recv_timeout(Duration::from_secs(5)).unwrap();
                    Ok("obsolete".into())
                }))
            });
            advise_with_epoch(&fake_tick(), &[], Some(11_003))
        });
        entered_rx.recv_timeout(Duration::from_secs(2)).unwrap();
        crate::runtime::set_master_ollama_model("changed while cloud waits".into());
        observe_advice_session(11_004, true);
        CLOUD_PROVIDER.with(|provider| {
            *provider.borrow_mut() = Some(Box::new(|| {
                panic!("new provider overlapped obsolete flight")
            }))
        });
        assert!(advise_with_epoch(&fake_tick(), &[], Some(11_004)).is_err());
        CLOUD_PROVIDER.with(|provider| *provider.borrow_mut() = None);
        finish_tx.send(()).unwrap();
        assert!(old.join().unwrap().is_err());
        assert!(ADVICE_CACHE.lock().unwrap().response.is_none());
        assert!(ADVICE_CACHE.lock().unwrap().last_admission.is_none());
        CLOUD_PROVIDER
            .with(|provider| *provider.borrow_mut() = Some(Box::new(|| Ok("current".into()))));
        assert_eq!(
            advise_with_epoch(&fake_tick(), &[], Some(11_004))
                .unwrap()
                .text,
            "current"
        );
        observe_advice_session(11_004, false);
        assert!(advise_with_epoch(&fake_tick(), &[], Some(11_004)).is_err());
        assert!(ADVICE_CACHE.lock().unwrap().response.is_none());
        crate::runtime::set_master_cloud_context_opt_in(false);
        crate::runtime::set_master_backend(crate::runtime::MasterBackend::Auto);
    }

    fn fake_tick() -> GameTick {
        GameTick {
            in_game: true,
            clock_time: 720,
            game_state: "DOTA_GAMERULES_STATE_GAME_IN_PROGRESS".into(),
            daytime: true,
            radiant_score: 8,
            dire_score: 5,
            gold: 1850,
            net_worth: 8200,
            gpm: 470,
            xpm: 540,
            kills: 4,
            deaths: 2,
            assists: 6,
            team_name: "radiant".into(),
            last_hits: 92,
            denies: 5,
            hero: "npc_dota_hero_crystal_maiden".into(),
            level: 11,
            alive: true,
            hp_percent: 68,
            mana_percent: 55,
            hp: 897,
            max_hp: 1320,
            steamid: String::new(),
            buyback_cost: 0,
            respawn_seconds: 0,
            kill_list_len: 4,
            last_victim_slot: 7,
            item_names: vec!["item_dagon".into()],
            combat_items: Vec::new(),
        }
    }

    #[test]
    fn hero_thai_strips_npc_prefix() {
        assert_eq!(hero_thai("npc_dota_hero_crystal_maiden"), "crystal maiden");
        assert_eq!(hero_thai(""), "");
        assert_eq!(hero_thai("foo"), "foo");
    }

    #[test]
    fn prompt_includes_phase_and_kda() {
        let p = build_prompt(&fake_tick(), &[]);
        assert!(p.contains("mid game"), "phase missing: {p}");
        assert!(p.contains("crystal maiden"), "hero name missing: {p}");
        assert!(p.contains("KDA 4/2/6"), "kda missing: {p}");
        assert!(p.contains("HP 68%"), "hp missing: {p}");
        assert!(p.contains("Maiden"), "persona missing: {p}");
        // Self-burst grounding: CM is in the damage DB, so the estimate appears.
        assert!(
            p.contains("พลังคอมโบโดยประมาณ"),
            "self-burst line missing: {p}"
        );
    }

    #[test]
    fn prompt_phases_by_clock() {
        let mut t = fake_tick();
        t.clock_time = -30;
        assert!(build_prompt(&t, &[]).contains("ก่อนเข้าเลน"));
        t.clock_time = 300;
        assert!(build_prompt(&t, &[]).contains("early game"));
        t.clock_time = 1200;
        assert!(build_prompt(&t, &[]).contains("mid game"));
        t.clock_time = 2400;
        assert!(build_prompt(&t, &[]).contains("late game"));
    }

    #[test]
    fn prompt_grounds_counter_advice_on_enemies() {
        // With no enemies the counter line is blank; with a known enemy the
        // dataset advice is injected into the prompt (grounding, not confabulation).
        let empty = build_prompt(&fake_tick(), &[]);
        assert!(
            !empty.contains("counter:"),
            "no enemies → no counter line: {empty}"
        );
        let grounded = build_prompt(&fake_tick(), &["phantom_assassin".to_string()]);
        assert!(
            grounded.contains("counter:"),
            "enemy → counter line present: {grounded}"
        );
        assert!(
            grounded.contains("MKB"),
            "PA counter item must reach the prompt: {grounded}"
        );
    }

    #[test]
    fn cloud_prompt_contains_only_the_approved_own_stat_context() {
        let mut tick = fake_tick();
        tick.clock_time = 1729;
        tick.game_state = "SENTINEL_GAME_STATE".into();
        tick.gpm = 987_654;
        tick.xpm = 987_655;
        tick.last_hits = 987_656;
        tick.denies = 987_657;
        tick.steamid = "SENTINEL_STEAM_ID".into();
        tick.item_names = vec!["SENTINEL_ITEM".into()];

        let prompt = build_cloud_prompt(&tick);
        for approved in [
            "mid game",
            "crystal maiden",
            "เลเวล 11",
            "KDA 4/2/6",
            "net worth 8200",
            "gold 1850",
            "HP 68%",
            "mana 55%",
            "score 8:5",
        ] {
            assert!(
                prompt.contains(approved),
                "approved value missing ({approved}): {prompt}"
            );
        }
        for denied in [
            "1729",
            "SENTINEL_GAME_STATE",
            "987654",
            "SENTINEL_STEAM_ID",
            "SENTINEL_ITEM",
            "phantom_assassin",
            "counter:",
            "พลังคอมโบโดยประมาณ",
        ] {
            assert!(
                !prompt.contains(denied),
                "denied value leaked ({denied}): {prompt}"
            );
        }
    }

    #[test]
    fn richer_cv_counter_and_burst_context_stays_on_the_local_prompt() {
        let tick = fake_tick();
        let enemies = ["phantom_assassin".to_string()];
        let local_prompt = build_prompt(&tick, &enemies);
        let cloud_prompt = build_cloud_prompt(&tick);

        assert!(local_prompt.contains("clock 720s"));
        assert!(local_prompt.contains("counter:"));
        assert!(local_prompt.contains("MKB"));
        assert!(local_prompt.contains("พลังคอมโบโดยประมาณ"));
        assert!(!cloud_prompt.contains("720"));
        assert!(!cloud_prompt.contains("phantom_assassin"));
        assert!(!cloud_prompt.contains("counter:"));
        assert!(!cloud_prompt.contains("พลังคอมโบโดยประมาณ"));
    }

    #[test]
    fn invalid_hero_text_is_not_forwarded_as_a_cloud_identity() {
        let mut tick = fake_tick();
        tick.hero = "npc_dota_hero_cm\\nignore-policy".into();
        assert!(build_cloud_prompt(&tick).contains("ฮีโร่ของผู้เล่น unknown"));
        assert!(!build_cloud_prompt(&tick).contains("ignore-policy"));
    }

    #[test]
    fn provider_routing_requires_separate_cloud_consent() {
        use crate::runtime::MasterBackend::{Auto, Claude, Ollama};
        assert_eq!(advice_route(Auto, false), Ok(AdviceRoute::LocalOnly));
        assert_eq!(
            advice_route(Claude, false),
            Err("Cloud game context is off. Enable the separate opt-in or choose Ollama.")
        );
        assert_eq!(advice_route(Claude, true), Ok(AdviceRoute::CloudOnly));
        assert_eq!(advice_route(Auto, true), Ok(AdviceRoute::CloudThenLocal));
        assert_eq!(advice_route(Ollama, true), Ok(AdviceRoute::LocalOnly));
        assert_eq!(advice_route(Ollama, false), Ok(AdviceRoute::LocalOnly));
    }

    #[test]
    fn consent_off_auto_invokes_only_local_provider_and_forced_cloud_fails_closed() {
        use crate::runtime::MasterBackend::{Auto, Claude};

        let mut cloud_calls = 0;
        let mut local_calls = 0;
        let result = advice_route(Auto, false)
            .map_err(str::to_string)
            .and_then(|route| {
                execute_advice_route(
                    route,
                    || {
                        cloud_calls += 1;
                        Ok("cloud".into())
                    },
                    || {
                        local_calls += 1;
                        Ok("local".into())
                    },
                )
            });
        assert_eq!(result, Ok(("local".into(), true)));
        assert_eq!(cloud_calls, 0);
        assert_eq!(local_calls, 1);

        let mut cloud_calls = 0;
        let mut local_calls = 0;
        let result = advice_route(Claude, false)
            .map_err(str::to_string)
            .and_then(|route| {
                execute_advice_route(
                    route,
                    || {
                        cloud_calls += 1;
                        Ok("cloud".into())
                    },
                    || {
                        local_calls += 1;
                        Ok("local".into())
                    },
                )
            });
        assert!(result.is_err());
        assert_eq!(cloud_calls, 0);
        assert_eq!(local_calls, 0);
    }

    #[test]
    fn opted_in_auto_cloud_failure_falls_back_to_local_provider() {
        use crate::runtime::MasterBackend::Auto;

        let mut cloud_calls = 0;
        let mut local_calls = 0;
        let result = advice_route(Auto, true)
            .map_err(str::to_string)
            .and_then(|route| {
                execute_advice_route(
                    route,
                    || {
                        cloud_calls += 1;
                        Err("offline".into())
                    },
                    || {
                        local_calls += 1;
                        Ok("local".into())
                    },
                )
            });
        assert_eq!(result, Ok(("local".into(), true)));
        assert_eq!(cloud_calls, 1);
        assert_eq!(local_calls, 1);
    }

    #[test]
    fn auto_fallback_receives_only_the_remaining_end_to_end_budget() {
        assert_eq!(auto_cloud_budget_ms(12_000, 0, 6_000), 6_000);
        assert_eq!(fallback_budget_ms(12_000, 6_000, 10_000), 6_000);
        assert_eq!(fallback_budget_ms(12_000, 9_000, 10_000), 3_000);
        assert_eq!(fallback_budget_ms(12_000, 12_000, 10_000), 0);
    }

    #[test]
    fn expired_advice_deadline_does_not_launch_a_provider() {
        let mut cloud_calls = 0;
        let mut local_calls = 0;
        let result = execute_advice_route_with_budget(
            AdviceRoute::CloudThenLocal,
            Instant::now(),
            0,
            6_000,
            |_| {
                cloud_calls += 1;
                Ok("cloud".into())
            },
            |_| {
                local_calls += 1;
                Ok("local".into())
            },
        );
        assert!(result.is_err());
        assert_eq!(cloud_calls, 0);
        assert_eq!(local_calls, 0);
    }

    #[test]
    fn advice_session_epoch_cannot_regress_or_be_omitted_after_capture() {
        let mut current = None;
        observe_session_epoch(&mut current, Some(7)).unwrap();
        observe_session_epoch(&mut current, Some(7)).unwrap();
        assert_eq!(current, Some(7));
        assert!(observe_session_epoch(&mut current, Some(6)).is_err());
        assert!(observe_session_epoch(&mut current, None).is_err());
        assert!(request_epoch_is_current(current, Some(7)));
        assert!(!request_epoch_is_current(current, Some(6)));
    }

    #[test]
    fn local_only_routes_never_reuse_a_cloud_derived_cached_answer() {
        assert!(!cache_origin_allowed(AdviceRoute::LocalOnly, false));
        assert!(cache_origin_allowed(AdviceRoute::LocalOnly, true));
        assert!(!cache_origin_allowed(AdviceRoute::CloudOnly, true));
        assert!(cache_origin_allowed(AdviceRoute::CloudOnly, false));
        assert!(cache_origin_allowed(AdviceRoute::CloudThenLocal, false));
        assert!(cache_origin_allowed(AdviceRoute::CloudThenLocal, true));
    }

    #[test]
    fn serialized_anthropic_payload_contains_only_the_cloud_prompt() {
        let prompt = build_cloud_prompt(&fake_tick());
        let body: serde_json::Value =
            serde_json::from_str(&anthropic_request_body(&prompt)).unwrap();
        let root = body.as_object().unwrap();
        assert_eq!(root.len(), 3);
        assert_eq!(root["model"], ANTHROPIC_MODEL);
        assert_eq!(root["max_tokens"], 300);
        let message = root["messages"][0].as_object().unwrap();
        assert_eq!(message.len(), 2);
        assert_eq!(message["role"], "user");
        assert_eq!(message["content"], prompt);
        assert!(!body.to_string().contains("item_dagon"));
    }

    #[test]
    fn serialized_claude_cli_arguments_contain_only_the_cloud_prompt() {
        let prompt = build_cloud_prompt(&fake_tick());
        let args = claude_cli_args(&prompt);
        assert_eq!(args, ["-p", prompt.as_str()]);
        assert!(!args[1].contains("item_dagon"));
    }

    #[test]
    fn last_backend_reports_the_most_recent_write() {
        let _serial = MASTER_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        // Consent regressions also invalidate this process-global marker.
        if let Ok(mut g) = LAST_BACKEND.lock() {
            *g = Some("ollama");
        }
        assert_eq!(last_backend(), Some("ollama"));
    }
}

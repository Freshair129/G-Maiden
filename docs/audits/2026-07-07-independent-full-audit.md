# G-Maiden — Independent Full-System Audit
**Date:** 2026-07-07 · **Commit:** `main @ 72162e66` · **Scope:** product, UX, UI, IA, architecture, code, DB, performance, security, AI, DevOps, docs, DX, maintainability, OSS + commercial readiness.

Method: six+ parallel specialist passes (Rust backend ×2, frontend/UX ×2, AI architecture, DevOps/docs, product/strategy) plus direct verification of the highest-stakes claims (`:3000` bind, TTS injection surface, secrets, [[SEC-001-auth-identity-hardening|SEC-001]] RLS, CSP, CI gate). Findings are de-duplicated and ranked.

---

## 1. Executive Summary

G-Maiden is an unusually **well-engineered** solo project with a **genuinely sharp product wedge** (real-time voice + overlay is an empty competitive quadrant) sitting on top of **three problems severe enough to be existential**, plus a layer of **correctness and process gaps that mean the flagship feature does not reliably work today**.

The engineering craft is real: the Rust core has clean, clock-injected, well-tested state machines; the DXGI backend is FFI-correct; graceful degradation is a deliberate house style; the [[SEC-001-auth-identity-hardening|SEC-001]] identity hardening is a proper, complete fix; the live-data "honest sensor" layer is principled and tested. This is not a prototype pretending to be a product — most of it is a product pretending, in a few critical places, to work.

But:

- **The flagship feature is silently broken in ~50% of matches.** Enemy blip colour is hardcoded to Dire-red ([`cv/mod.rs`](file:///g:/G-Maiden/src-tauri/src/cv/mod.rs#L16)), so when the player is on Dire, no enemies are detected → Sentry tracks nothing → gank warnings never fire. This compounds a *second* silent-death path (CV/model init failure → candidate-only mode → same dead outcome) and a *third* (Lite mode fallback), all of which report "safe" while blind.
- **The headline latency SLA has never been measured end-to-end.** The "GATE P3" harness is a stub that sleeps for each hop's budget and prints `PASSED` by construction ([`tests/perf/src/main.rs`](file:///g:/G-Maiden/tests/perf/src/main.rs)). CI runs **zero** of the 134 Rust + 12 vitest tests. The release workflow ships signed auto-updates to users **with no test gate at all**.
- **The product may be illegal to run at scale.** Real-time screen-capture CV that reconstructs the fog-of-war positions of the other nine heroes — and G-Damage's proposed "you can kill them now" prompt — is exactly the class of external assistance Valve bans at its sole discretion. The team cites Valve's own 2023 ban wave in its ADRs, then builds precisely that surface as the flagship moat.
- **The privacy promise and the business model contradict each other**, and the data-flywheel moat is arithmetically unreachable at the stated scale anyway.
- **The team is building a wallet, closed-loop currency, marketplace, and cross-product identity before a single user has been shown to retain.**

**Verdict:** The right move is not "fix more features" — it is to **stop building outward, prove the core loop works and is loved (or legal), and make the thing you already built actually run.** The founder's own validation plan says exactly this; the roadmap isn't following it.

**Overall grade: C+ (6.0/10)** — high-ceiling engineering, unvalidated and mis-sequenced product, critical correctness + release-safety gaps. Grade rises to **B+/A-** quickly if the "make it actually work + actually gated" items land, and the legal/strategy questions are answered honestly.

---

## 2. Top 20 Highest-Priority Improvements

| # | Sev | Finding | Effort |
|---|-----|---------|--------|
| 1 | 🔴 Critical | **Dire-side blindness** — enemy ring colour hardcoded to Dire-red; gank detection dead in ~50% of matches. Parse `player.team_name` from GSI, pick ring colour. | Hours |
| 2 | 🔴 Critical | **Latency gate is a stub that can't fail.** Wire the six hops to real functions on a recorded fixture; assert real p50/p99. Until then, relabel `PASSED`→`SKIP`. | High |
| 3 | 🔴 Critical | **CI runs no tests.** Add `cargo test`, `vitest run`, supabase tests. 146 existing tests never execute. | Low |
| 4 | 🔴 Critical | **Release workflow has no test/lint/clippy gate** and no concurrency lock — unverified code auto-updates to all users. Gate on green CI of the tagged SHA. | Low-Med |
| 5 | 🔴 Critical | **Silent CV death reports "safe."** Model-missing / DXGI-fail / Lite-mode all leave G-Signal inert while the UI looks healthy. Promote capture health to a first-class loud state + in-game watchdog. | Low-Med |
| 6 | 🔴 Critical | **Grounded engines are unwired.** [`damage.rs`](file:///g:/G-Maiden/src-tauri/src/damage.rs) (lethality) and [`counter_advice`](file:///g:/G-Maiden/src-tauri/src/counter_advice.rs) (matchup) are complete, tested, and reach **no** user-facing output; [`counter_advice_text(&[])`](file:///g:/G-Maiden/src-tauri/src/counter_advice.rs#L11) is always called empty. G-Master gets zero enemy context → confabulates. Wire them in. | Medium |
| 7 | 🔴 Critical (legal) | **Live minimap-CV is Valve-ban-adjacent.** Get a written legal read *before* more investment; make all CV opt-in, disclosed, severable; drop/reframe G-Damage "can I kill." | Low to assess |
| 8 | 🔴 Critical (strategy) | **Kill the match-data flywheel** (contradicts the privacy promise, unreachable at scale, adds legal exposure). Use public replay priors instead. | Low |
| 9 | 🔴 Critical (focus) | **Freeze [[CR-003-account-phase1-wallet-billing|CR-003]] wallet/billing/marketplace** until retention (D7≥40%) is proven with a real beta. | Trivial to stop |
| 10 | 🟠 High | **CSP omits the Supabase origin** → Google sign-in + profile sync fail in packaged builds (works only in dev). Add `https://<project>.supabase.co` to `connect-src`. | Trivial |
| 11 | 🟠 High | **Onboarding + settings-sync are trapped in the Settings tab.** Welcome wizard, updater check, and the *only* settings→overlay broadcaster mount only when Settings is open, so first-run users get no GSI setup and the overlay ignores saved settings until Settings is visited. Lift to app root. | Medium |
| 12 | 🟠 High | **Voice audio has no priority arbitration** — a cosmetic "kill/levelup" clip stomps the gank warning (two threads, one single-slot sink). Add priority; critical clips win. | Low |
| 13 | 🟠 High | **Blocking TTS on the capture thread.** Piper `child.wait()` / SAPI 150-200ms cold start run inline in `process_frame`, freezing gank re-assessment. Move voicing to a worker. | Medium |
| 14 | 🟠 High | **ZIP pack import is broken** (`$args` empty under `powershell -Command`, verified) **and** missing `CREATE_NO_WINDOW` (console flash minimizes Dota) **and** no zip-slip guard. Use the `zip` crate in-process. | Hours |
| 15 | 🟠 High | **No offline AI eval / no G-Log feedback loop.** Every threshold (0.85, 12s, ×1.15) is an unmeasured magic number; the "learns next match" module doesn't consume its own logs. Build a replay/label harness. | Med-High |
| 16 | 🟠 High | **Offline fallback runs a Rust-coding model** (`Aroow-Rust-Coder-9B`) for Thai Dota advice, with no `keep_alive`. Switch to Typhoon2-3B / Llama-3.2-1B; add `keep_alive`. | Hours |
| 17 | 🟠 High | **Both lockfiles gitignored** → non-reproducible signed builds. Commit `Cargo.lock` + `pnpm-lock.yaml`; build `--locked`/`--frozen-lockfile`. | Low |
| 18 | 🟠 High | **No LICENSE, no root README/CONTRIBUTING.** Blocks the stated OSS + marketplace strategy; default copyright forbids contribution. | Low |
| 19 | 🟠 High | **Full-desktop GPU copy + 8MB alloc per frame** when only a ~170px minimap is needed. `CopySubresourceRegion` the rect into a reused buffer. | ~1 day |
| 20 | 🟠 High | **Forked color palette / 4 token systems / dead foreign CSS.** The deck and the settings/overlay render in visibly different blues; ~hundreds of dead G-Orchestra CSS lines still headline `styles.css`. Consolidate to one `tokens` source. | Med |

---

## 3-11. Scores (0-10)

| Dimension | Score | One-line rationale |
|---|---|---|
| **Architecture** | **6.0** | Clean Rust module boundaries + pure state machines; undercut by frontend God-file, no shared FE store, ~900 lines dead Rust modules, and premature platformization. |
| **UX** | **4.0** | Onboarding unreachable on first run, settings silently not applied, fabricated "live" data, decorative dead controls, Thai/English whiplash. |
| **UI** | **6.0** | Ambitious, coherent glass deck; undermined by two coexisting design languages and four color-token systems in one screen. |
| **Maintainability** | **5.0** | Exceptional doc-comments + tested pure cores vs. 1969-line [`App.tsx`](file:///g:/G-Maiden/src/src/App.tsx), 8× duplicated data hook, type drift, 5-Cargo/6-package multi-build sprawl. |
| **Scalability** | **5.5** | Per-user local app scales fine; real limits are cloud-LLM unit cost, total Valve platform dependency, and a niche/Thai strategy at odds with "millions." |
| **Security** | **6.0** | [[SEC-001-auth-identity-hardening|SEC-001]] RLS/identity fix is genuinely complete; no secret leakage; TTS injection neutralized by base64. Docked for CSP-breaks-auth, API key in localStorage + on curl argv, unauth `:3000`, unverified model downloads. |
| **Performance** | **4.5** | Budgets are stated and partly harnessed (rare!) but the headline latency number is **unmeasured E2E**, the measurement apparatus is itself the heaviest background load, and per-frame full-screen copies fight the CPU budget. |
| **AI System** | **4.5** | Latency-critical path correctly LLM-free and offline-resilient (good); but grounded engines unwired, enemy context empty, no eval, wrong offline model — live advice is a timer or a player-only-context LLM. |
| **Documentation** | **5.5** | Extensive and thoughtful, but authoritative specs are Thai-only, several load-bearing ADRs (01/07/13/15) are cited-but-missing, mid-reorg, no root README. |

**Overall Grade: C+ (6.0)**

---

## 12. Technical Debt Estimate

**~6-10 focused engineer-weeks** to clear the Critical + High tier (excluding the strategic/legal decisions, which are cheap to *decide* and expensive to *accept*):

- Make-it-work correctness (Dire blindness, silent-CV watchdog, audio priority, TTS off-thread, broken import): ~1.5 weeks.
- Make-it-gated (CI tests, real latency harness, release gating, lockfiles, versioning): ~1.5 weeks.
- Make-it-grounded (wire damage/counters, enemy context, offline model + keep_alive, eval harness v1): ~2 weeks.
- Frontend structural (shared store, lift onboarding/settings, token consolidation, CSP, dead-CSS purge, a11y baseline): ~2-3 weeks.

The **larger, hidden** debt is strategic: the wallet/marketplace/GID ecosystem is *net-negative* debt — work that should be reverted/frozen, not finished.

---

## 13. Biggest Hidden Risks

1. **False-safe failure.** Three independent paths (Dire colour, CV/model init, Lite mode) leave the safety tool blind while it reports "protected." A safety feature that silently stops warning is worse than none.
2. **Valve.** One policy statement or VAC signature ends the product and bricks everything built on top. The "hybrid ingestion" hedge *increases* this exposure, it doesn't reduce it.
3. **Unverified auto-update pipeline.** Signed installers reach every user with no test gate and floating (un-pinned) CI actions + gitignored lockfiles — a supply-chain and quality blast radius.
4. **Latency is folklore.** The core promise (warn before the kill) has never been measured end-to-end; TTS fallback paths almost certainly bust 300ms.
5. **Solo bus-factor across a dozen specialist domains** (Rust/CV/ML/Tauri/Thai-TTS/RLS/payments) — and a real privilege-escalation hole (F1) already shipped once.
6. **Human-actionability of *voice*.** Even at 0ms compute, a spoken Thai sentence + human reaction may be slower than a Dota gank resolves — the modality itself is unvalidated for the sub-second path.

---

## 14. Things That Are Surprisingly Well Designed

- **DXGI backend correctness** — `ReleaseFrame` paired 1:1 with every acquire incl. early-outs, `ACCESS_LOST` recreation, blank-first-frame skip, honest SAFETY comments.
- **Pure, clock-injected state machines** (`Signal` hysteresis, `Sentry` edge-triggering, `announcer::step`) — deterministic, I/O-free, textbook-testable.
- **[[SEC-001-auth-identity-hardening|SEC-001]] identity hardening** — column-level grants make GID/Founder/role forgery structurally impossible; `mint-gid` Edge Function is caller-scoped with a null-guarded single-mint. A proper fix, not a patch.
- **Graceful degradation as a house style** — the app essentially cannot fail to start.
- **The [`revive.rs`](file:///g:/G-Maiden/src-tauri/src/revive.rs) prompt pattern** — deterministic ground truth + explicit "don't invent unknowns." This is the model the rest of the AI layer should copy.
- **The live "honest sensor" layer** (`live/build*.ts`, `NO_SENSOR=-1`→"—", 9 test files) and forensics-first panic hook + local-only privacy-disciplined G-Log.
- **Belief Revision is real logic** (hysteresis + TTS interrupt), not prompt theater.

---

## 15. Missing Opportunities

- **Post-match persona coaching** and **streamer co-host** are the *safest, most differentiated, ToS-clean* products (public replay data, no live-advantage ban risk) — and they solve the admitted distribution weakness. They're deprioritized in favor of the riskiest surface. Promote them to first-class hedges.
- **Pre-verbal alerting** (audio sting / peripheral flash before the sentence) — faster than speech on the critical path, with voice as follow-up context.
- **Prompt caching** for the persona/system block on the API path (cost + latency).
- **The already-written [`damage.rs`](file:///g:/G-Maiden/src-tauri/src/damage.rs) lethality model** is the single biggest un-shipped credibility win.

---

## 16-20. Roadmap

**Quick Wins (<1 day):** CSP add Supabase+Steam origins (#10); commit lockfiles (#17); add `cargo test`/`vitest` to CI (#3); `CREATE_NO_WINDOW` on the archive spawn; fix version drift (Cargo/root `0.1.0`→`0.8.0`); add LICENSE + root README (#18); `keep_alive` on Ollama; audio priority flag (#12); relabel the stub gate `SKIP`; global `:focus-visible` + `prefers-reduced-motion`; remove/gate dead controls (Ctrl+K, TODO store URL); pin CI actions to SHAs.

**Medium (<1 week):** Fix Dire blindness (#1); silent-CV watchdog + loud Lite-mode banner (#5); gate the release workflow (#4); lift onboarding/updater/settings-sync to app root (#11); collapse [`useCompanionData`](file:///g:/G-Maiden/src/src/companion.ts#L927) to one provider (#11/H1); wire enemy context + [`counter_advice`](file:///g:/G-Maiden/src-tauri/src/counter_advice.rs) into G-Master (#6 partial); swap offline model (#16); overlay HUD no-go zones (#O1); consolidate color tokens + purge dead CSS (#20); error boundaries; move TTS off the capture thread (#13).

**Major Refactors (multi-week):** Wire [`damage.rs`](file:///g:/G-Maiden/src-tauri/src/damage.rs) lethality into G-Signal (#6); real end-to-end latency harness on recorded fixtures (#2); minimap-only GPU capture (#19); in-process Win32 resource metering (replace PowerShell polling) incl. WebView2; AI eval/replay harness + G-Log feedback loop (#15); split [`App.tsx`](file:///g:/G-Maiden/src/src/App.tsx) into modules + shared settings store; in-process HTTP (reqwest) replacing curl/`claude -p` shell-outs.

**Strategic decisions (do first, cost nothing to decide):** legal read on live CV (#7); kill the flywheel (#8); freeze [[CR-003-account-phase1-wallet-billing|CR-003]] (#9); pick niche-profitable **or** global-scale (not both); run the 15-30 person Thai beta before building anything else.

---

## Appendix A — Security Deep-Dive (live-DB verified)

The Supabase `gstore` project was queried read-only (schema, grants, RLS, trigger source, advisors) to prove state rather than infer it.

**[[SEC-001-auth-identity-hardening|SEC-001]] F1 — verified CLOSED on prod, no bypass.** `authenticated`'s UPDATE grant on `profiles` is exactly `{steamid64, display_name, account_id}`; `generation`/`gid_code`/`cohort_seq`/`role`/`email`/`id` are not client-writable. No client INSERT grant; RLS policies scope `auth.uid() = id` (USING+CHECK); `alloc_cohort_seq`/`handle_new_user` EXECUTE revoked + `search_path` pinned; `mint-gid` computes the GID only from server-authoritative columns for the caller's own row. GID is a display handle, never an authz boundary. **Build on this with confidence.**

Additional findings (not in the Top-20 above; fold in before any marketplace/economy launch):

- **🟠 High — Path traversal → arbitrary local file read via voice-pack manifest.** Attacker-controlled manifest paths (`banner_asset`, `cover_image`, `clips[]`) are `dir.join(rel)`'d with **no containment check** ([`voice_api.rs:437, 571-577, 379, 456`](file:///g:/G-Maiden/src-tauri/src/voice_api/banner.rs#L3)); [`read_banner_data_url`](file:///g:/G-Maiden/src-tauri/src/voice_api/banner.rs#L80) (`:461-469`) then reads *any* ≤3MB file and inlines it base64 into the renderer. Merely **opening Audio Settings** iterates every installed pack and triggers the read. Exfil off-box is currently blocked by the overlay CSP, so today it's local file-read surfaced as an image — but it becomes exfiltration the moment any HTML/text rendering is added. [`sanitize_file_name`](file:///g:/G-Maiden/src-tauri/src/voice_api/commands.rs#L13) exists but is applied only to *uploads*, not manifest paths. **Fix:** `canonicalize` base + resolved asset and require `starts_with(base)`, or strip to basenames inside `clips/`/`banners/`. **This is the #1 pre-marketplace security fix.**

- **🟠 High — Secrets in plaintext on disk.** The Supabase **refresh token** (`persistSession:true`, no encrypted storage adapter) and the **Anthropic API key** (part of the settings blob written to `localStorage`, [`App.tsx:1564`](file:///g:/G-Maiden/src/src/App.tsx)) both sit unencrypted in the WebView2 leveldb. Refresh token → full GID-account takeover; API key → billing theft. **Fix:** encrypted storage adapter (tauri-plugin-stronghold, or tauri-plugin-store + Windows DPAPI); never keep the key in localStorage.

- **🟡 Medium — Every signup is minted generation `'F'` (Founder).** Verified live: `handle_new_user` hardcodes `gen := 'F'` and `profiles.generation` defaults `'F'`. Not a forgery (server-set + column-locked) but *everyone* is a permanent, immutable "Founder," and [[CR-003-account-phase1-wallet-billing|CR-003]] wallet/role perks are being built on top — attach any perk to `generation='F'` and the whole user base inherits it forever. The **base schema + trigger are not committed** to `supabase/migrations/` (only the hardening migration is), so identity logic isn't version-controlled. **Fix:** phase-driven generation (default `'P'` unless an explicit Founder flag), and commit the base schema. Must precede the [[CR-003-account-phase1-wallet-billing|CR-003]] economy.

- **🟡 Medium — OAuth loopback callback has no `state`/nonce.** `/auth/callback` exchanges any `?code=` it receives ([`gsi.rs:189-199`](file:///g:/G-Maiden/src-tauri/src/gsi.rs#L189), [`auth.ts`](file:///g:/G-Maiden/src/src/auth.ts)); PKCE (verifier in the webview) blocks actual account-takeover login-CSRF, so this is defense-in-depth + nuisance/forced-exchange hardening. **Fix:** generate/echo/verify a single-use `state`.

- **🟡 Medium — OCR model download has no integrity check.** `tools/ocr-download/fetch.py` pulls three ONNX files from a third-party HF repo with no hash/signature; the native ONNX parser is a large attack surface. **Fix:** SHA-256 pin (or mirror + minisign like the updater already does). The bundled `minimap-detector.onnx` is trusted; the OCR models are the gap.

- **Confirmed safe (no action):** TTS PowerShell shell-out is injection-proof (all game/pack/voice strings base64-encoded before interpolation; `rate` clamped int, `volume` u8); `:3000` bound to `127.0.0.1` not `0.0.0.0`; no `service_role` key ships; `open_url` scheme-restricted to http(s); Steam vanity resolution can't be turned into SSRF; updater uses correct minisign + `latest.json`-over-HTTPS pattern.

**Security priority order:** pack path-traversal (H-1) and plaintext secrets (H-2) before any public/marketplace launch → the Founder-generation fix (M-5) before [[CR-003-account-phase1-wallet-billing|CR-003]] economy → OAuth state, model pinning, and the Lows as hardening.

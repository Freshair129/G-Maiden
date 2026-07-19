# RCA — 2026-07-10 v0.9.0 release blocked by three latent gate failures

- **Symptom:** Pushing tag `v0.9.0` to cut a release failed **three times in a row**
  before any signed installer was produced. Each failure surfaced a *different*
  gate: (1) Rust `clippy`, (2) frontend `eslint`, (3) the release workflow's own
  `verify` → `Tauri smoke build` step. None of the three was caused by the v0.9.0
  change set itself — all were pre-existing debt that only became visible when the
  first real release ran through the (newer) verify gate.

- **Evidence:**
  - Run `29113330479` (release) + `29113332433` (CI) — **clippy**:
    `redundant reference in format! argument` at [`master.rs:196`](file:///g:/G-Maiden/src-tauri/src/master.rs#L196)
    and [`slm.rs:83`](file:///g:/G-Maiden/src-tauri/src/slm.rs#L83) (`&raw.chars().take(N).collect::<String>()`),
    `error: could not compile g-maiden due to 2 previous errors`. The same
    docs-only commit [[ADR-16-credit-economy-and-mint-oracle|ADR-16]] (`29072770636`) had already failed CI for this,
    proving it predated the release.
  - Run `29113982663` (CI on main) — **eslint**:
    `CommandDeck.tsx:229:9 'safetyTimer' is never reassigned. Use 'const' — prefer-const`
    (1 error; 6 pre-existing `react-hooks/exhaustive-deps` warnings do not fail).
  - Run `29116567202` (release) — **verify / Tauri smoke build**:
    `Error A public key has been found, but no private key. Make sure to set
    TAURI_SIGNING_PRIVATE_KEY environment variable.` → `pnpm ["tauri","build"]`
    exit 1; the `release` job was `skipped` (gated on `verify`).
  - Local at the time: `cargo clippy --all-targets -- -D warnings` **passed**,
    `tsc --noEmit` **passed**, `vitest` **passed** — i.e. every local/gate check
    was green while CI was red.

- **Root Cause:** three independent gate-drift issues, unified by one theme —
  **CI runs checks that the local dev toolchain and the sub-agent review gate did
  not run (or ran with a different toolchain):**
  1. **clippy toolchain drift** — CI's runner floats on `stable`; a clippy release
     after 2026-07-03 (v0.8.0) promoted `redundant reference in format! argument`
     to fire under `-D warnings`. The local machine's older clippy never flagged
     it, so code that compiled clean at v0.8.0 silently became a CI error.
  2. **eslint never ran locally or at the review gate** — the Opus review gate for
     [[CR-007-frostline-deck-refresh|CR-007]] WP-4 ran `tsc` + `vitest` only. `pnpm -C src exec eslint .` (a CI step)
     was not part of the gate, so a trivial `prefer-const` shipped to `main`.
  3. **First release through a newer `verify` gate** — the `verify` job (with a
     full `Tauri smoke build`) was added 2026-07-08, *after* the v0.8.0 release.
     v0.9.0 was the first tag to pass through it. `tauri build` bundles the updater
     artifact, which requires signing; `tauri.conf.json` carries the updater
     **pubkey**, so the bundler demanded `TAURI_SIGNING_PRIVATE_KEY` — a secret
     intentionally scoped to the publishing `release` job only, never the `verify`
     job. So `verify` could never pass as written.

- **Why it escaped detection:**
  - The release-cutting path (tag → CI) is exercised rarely (once per release,
    ~weekly), so toolchain drift (#1) and a brand-new gate (#3) accumulate silently
    between releases and all surface at once on the next tag.
  - The multi-agent review gate's definition of "green" (`tsc` + `vitest` +
    `cargo test` + `cargo clippy`) did **not** match CI's definition (which also
    runs `eslint` and a `--bundle` tauri build) — a gate that is a strict subset of
    CI will pass changes CI rejects (#2).
  - Local clippy ≠ CI clippy because the toolchain is unpinned; "passes clippy
    locally" gave false confidence (#1).

- **Prevention:**
  1. **Fixed (this release):** removed the redundant `&` ([`master.rs`](file:///g:/G-Maiden/src-tauri/src/master.rs)/[`slm.rs`](file:///g:/G-Maiden/src-tauri/src/slm.rs));
     `let safetyTimer` → `const` ([`CommandDeck.tsx`](file:///g:/G-Maiden/src/src/CommandDeck.tsx)); release `verify` smoke build now
     runs `args: --no-bundle` so it compiles Rust + builds the frontend without
     needing signing secrets. All three committed to `main` and confirmed green on
     the CI-on-main run before re-tagging.
  2. **Review-gate parity (process):** the pre-lead review gate must run the **same
     command set as CI**, not a subset — specifically add `pnpm -C src exec eslint .`
     to the gate's verification, and treat "gate green" as meaning "every CI check
     was run locally", not "tsc + tests passed". Recorded in memory
     `[[ci-gate-clippy-not-test]]` (extended).
  3. **Pin the CI Rust toolchain** (e.g. a `rust-toolchain.toml` or an explicit
     `dtolnay/rust-toolchain@<version>` in the workflow) so a floating `stable`
     clippy release cannot turn previously-green code red between releases; bump the
     pin deliberately and run clippy at that version locally. *(Proposed — not yet
     applied; low urgency now that the two lints are fixed, but this is the durable
     fix for class #1.)*
  4. **Tag only after a green CI-on-main run** for the exact commit being tagged.
     This release proved the value: pushing fixes to `main` first and watching the
     CI workflow go green caught #1 and #2 without burning a release build; only the
     workflow-internal `verify` bug (#3, which the CI workflow doesn't run) still
     required a release attempt to surface.

## Note on re-tagging safety

Each failed `v0.9.0` attempt failed at `clippy` / `eslint` / `verify` — all
**before** the `release` job's `tauri-action` publish step. `gh release view v0.9.0`
returned `release not found` every time, so no GitHub Release, installer, or
`latest.json` was ever published. Deleting and recreating the `v0.9.0` tag at the
fixed HEAD was therefore safe (no user received a v0.9.0 artifact, no updater
pointer was ever moved) and avoided burning the version number to v0.9.1.

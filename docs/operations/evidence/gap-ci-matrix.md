---
title: "CI Matrix: Gap-Closure Evidence"
doc_id: gap-ci-matrix
status: draft
version: 0.1.0
updated: 2026-10-01
owner: RWANG
---

# CI Matrix: Gap-Closure Evidence

## Scope and evidence boundary

This matrix maps the source-pinned `origin/main` baseline at `2d969ac643533b4b8e24494356da2e818eac874f` to the checks visible in `.github/workflows/ci.yml`, the package scripts in `landing/package.json` and `orchestration/package.json`, and the tests under `supabase/functions/_shared/` and `supabase/tests/`. Workflow inventory was limited to filenames in `.github/workflows/`.

A command or test declaration proves that a check is defined or available; it does not prove that it ran or passed. This review did not execute repository test/build/lint/workflow commands, start services, inspect hosted Actions results, access Supabase, or use provider credentials. Every result below is `NOT_RUN` unless a future run artifact records the exact source SHA, command, exit status, and sanitized output.

| Evidence class | What it can establish | Current status |
| --- | --- | --- |
| Source / local entrypoint | A workflow step, package script, or SQL test comment exists at the pinned source. | `SOURCE_VERIFIED`; no result implied. |
| Hosted workflow | A named CI job completed for the exact source SHA, supported by its Actions run and step results. | `NOT_RUN / NOT_INSPECTED`. |
| Local test run | A named local command completed against the pinned tree and documented prerequisites. | `NOT_RUN`. |
| Isolated controlled database run | SQL/RLS tests ran against a disposable, known migration state with no production endpoint or user data. | `NOT_RUN`; harness is not wired into the inspected CI workflow. |

## Hosted CI defined in source

The inspected workflow is triggered by pushes and pull requests targeting `main` and has one `ci` job on `windows-latest`. It sets up Node 20, pnpm through the repository `packageManager` field, and Rust 1.96.0 with Clippy. The full step order and exact commands are in [`ci.yml`](../../../.github/workflows/ci.yml#L3-L75).

| Step / command as declared | Evidence the step targets | Limits in this matrix |
| --- | --- | --- |
| `pnpm install --frozen-lockfile`; `pnpm -C src install --frozen-lockfile` | Root and desktop dependency installation. | Does not declare an install in `landing/` or `orchestration/`. |
| `node tools/doc-graph/ci-gate.mjs` | Doc-graph unit suite, strict scan, checklist exception rule, and feature-ledger clean, as described in the workflow comments. | Documentation gate only; it is not a Deno, SQL/RLS, landing, or orchestration test. |
| `node src-tauri/scripts/stage-gpu-feeder.mjs` | Stages the gitignored sidecar required by the Tauri build configuration, per workflow comments. | Build prerequisite, not a product test. |
| `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --locked -- -D warnings` | Rust lint across targets. | Does not establish hosted runtime/provider behavior. |
| `pnpm -C src lint` | Desktop ESLint script. | No landing or orchestration lint invocation is declared. |
| `cargo test --manifest-path src-tauri/Cargo.toml --locked` | Rust test suite. | Scope is the Rust manifest shown; does not cover Supabase SQL or Edge Function behavior. |
| `pnpm -C src test` | Desktop Vitest suite. | No landing test invocation is declared. |
| Tauri action with `args: -- --locked` | Windows Tauri smoke build; optional signing secrets are passed by the workflow. | The source defines a build step, not a signed release, deploy, live-auth test, or production acceptance. |

The workflow file contains no Deno setup/test command, Supabase CLI or database setup, landing package command, or orchestration package command. It also contains no explicit TypeScript `tsc` command. These are coverage gaps in this workflow, not evidence that a separate workflow failed or passed. The workflow directory contains `candidate-release.yml`, `ci.yml`, `ledger-verify.yml`, `perf-gate.yml`, `pr-gate-agent.yml`, and `promote-release.yml`; this filename inventory does not establish their triggers, commands, or results.

## Landing package entrypoints

[`landing/package.json`](../../../landing/package.json#L12-L18) declares these scripts and pins `pnpm@10.34.5` at line 4:

| Package script | Exact package command | Meaning / prerequisite | CI status |
| --- | --- | --- | --- |
| `test: "vitest run"` | `pnpm -C landing test` | Landing Vitest suite; landing dependencies must be installed. | Not invoked by inspected `ci.yml`; local result `NOT_RUN`. |
| `typecheck: "tsc --noEmit"` | `pnpm -C landing typecheck` | Landing TypeScript check; landing dependencies must be installed. | Not invoked by inspected `ci.yml`; local result `NOT_RUN`. |
| `build: "tsc -b && vite build"` with `prebuild: "node scripts/verify-legal-mirrors.mjs"` | `pnpm -C landing build` | Legal mirror prebuild check, TypeScript build, and Vite build. | Not invoked by inspected `ci.yml`; local result `NOT_RUN`. |

The declared `dev` and `preview` scripts start or serve the landing application; they are not test evidence and were not run. A bounded CI addition should install the landing package from its own committed lock state, then run the existing `test`, `typecheck`, and `build` scripts in a separate job. This document does not assert dependency-lock availability beyond the package metadata inspected.

## Supabase shared-function unit tests

The inspected `_shared` directory contains four Deno test modules using `Deno.test` and `jsr:@std/assert`: [`iam_security.test.ts`](../../../supabase/functions/_shared/iam_security.test.ts) (4 test declarations), [`iam.test.ts`](../../../supabase/functions/_shared/iam.test.ts) (10), [`gmad.test.ts`](../../../supabase/functions/_shared/gmad.test.ts) (2), and [`entitlement.test.ts`](../../../supabase/functions/_shared/entitlement.test.ts) (8), for 24 declared test cases. Representative assertions exercise dependency-injected IAM rejection paths and redaction, G-Maiden normalization, and entitlement policy. See [`iam.test.ts`](../../../supabase/functions/_shared/iam.test.ts#L42-L65) and [`entitlement.test.ts`](../../../supabase/functions/_shared/entitlement.test.ts#L20-L94).

No inspected CI step invokes these files, and neither inspected package script provides their runner. Therefore the current evidence is `SOURCE_VERIFIED / NOT_RUN`; the matrix does not claim a local Deno pass. To create an automated entrypoint, add a separate unit-test job with a pinned Deno version, reproducible JSR dependency resolution/lock policy, and an explicit command covering all four test files. Keep this unit job independent of a live Supabase project and provider credentials; tests should use their existing pure functions and injected dependencies. The exact Deno command is not present in the inspected sources and remains to be added, not retroactively inferred as an existing check.

## SQL / RLS test inventory

Eight SQL files under [`supabase/tests/`](../../../supabase/tests/) declare pgTAP plans totaling 167 planned assertions. This is a source count, not a pass count. Three files explicitly comment `Run: supabase test db` (`sec001_identity_lock.sql`, `cr034_iam_phase1.sql`, `cr003_wallet_billing.sql`); `goe005_private_cloud_sync.sql` says to run with the migration suite against a local Supabase database. The other files declare plans but no runner command in their inspected headers.

| SQL file | Declared plan | Source note / bounded scope |
| --- | ---: | --- |
| [`sec001_identity_lock.sql`](../../../supabase/tests/sec001_identity_lock.sql) | 6 | Header identifies identity-column update restrictions; says `supabase test db`. |
| [`goe005_private_cloud_sync.sql`](../../../supabase/tests/goe005_private_cloud_sync.sql) | 24 | Header requires the migration suite against a local Supabase database. |
| [`gid_pipeline_distribution_policy.sql`](../../../supabase/tests/gid_pipeline_distribution_policy.sql) | 6 | Distribution-policy RLS assertion. |
| [`cr016_gmad_download_access.sql`](../../../supabase/tests/cr016_gmad_download_access.sql) | 9 | GMAD download-access database assertions. |
| [`cr005_closed_beta_registration.sql`](../../../supabase/tests/cr005_closed_beta_registration.sql) | 8 | Closed-beta registration database assertions. |
| [`cr034_iam_phase1.sql`](../../../supabase/tests/cr034_iam_phase1.sql) | 25 | IAM private-schema, privilege, hook, and append-only audit contract; says `supabase test db`. |
| [`cr034_iam_phase2.sql`](../../../supabase/tests/cr034_iam_phase2.sql) | 26 | Session/device projection and own-activity contract. |
| [`cr003_wallet_billing.sql`](../../../supabase/tests/cr003_wallet_billing.sql) | 63 | Header lists DB-01..DB-13 and prerequisites for the CR-003 schema/RLS/RPC migration; says `supabase test db`. |

The inspected `ci.yml` has no database service, Supabase CLI setup, migration application, or `supabase test db` step. None of these plans is therefore evidenced as passing in that workflow. The CR-003 header explicitly warns that its migration must be applied first; GOE-005 requires a migration-suite database. A safe future RLS harness must provision a disposable local database, apply a deterministic clean migration chain at a pinned CLI/database version, run the SQL suite there, capture TAP output, and tear the database down. It must not accept a production URL, use production identities, or call an external provider. Until that harness exists and produces a run artifact, SQL/RLS remains `NOT_RUN`.

## Orchestration package boundary

[`orchestration/package.json`](../../../orchestration/package.json#L7-L18) declares operational scripts (`ui`, `status`, `next`, `graph`, `run`, `reset`, `prewarm`, `vram`, and Tauri app commands), but no `test`, `lint`, or `typecheck` script. The inspected CI workflow invokes none of them. Do not treat these stateful/operator commands as tests, and do not run `run` or `reset` as part of this evidence task.

There is no current orchestration test command evidenced by the inspected package metadata or workflow. A future harness needs a deliberate test entrypoint and deterministic temporary state, with provider/model/network operations replaced by injected fakes; it must prove that test runs cannot dispatch real tasks, reset shared state, start the UI, or contact providers. Add the package script and a CI job only after the isolated harness boundary is specified. No orchestration test result is claimed here.

## Bounded coverage recommendations

1. Add a landing job that provisions its locked dependencies and runs the package's existing `test`, `typecheck`, and `build` scripts; preserve separate step results.
2. Add a Deno-only job for the four `_shared` test modules, after pinning Deno and the JSR lock/resolution boundary. Do not wire the unit suite to real Supabase or provider credentials.
3. Add an isolated SQL/RLS job only when a disposable database can start from a known migration baseline and be destroyed after `supabase test db`; emit per-file TAP evidence.
4. Define and test an orchestration fake-provider/temp-state harness before adding any test runner command. Keep `run`, `reset`, and UI startup out of ordinary unit CI.

## Review record

- Source baseline: `origin/main` at `2d969ac643533b4b8e24494356da2e818eac874f`.
- Workflow source: inspected; hosted run result: `NOT_RUN / NOT_INSPECTED`.
- Landing local scripts: source-declared; local results: `NOT_RUN`.
- Deno shared tests: source-declared; local result: `NOT_RUN`; no CI invocation in the inspected workflow.
- Supabase SQL/RLS tests: source-declared; local database result: `NOT_RUN`; no CI invocation in the inspected workflow.
- Orchestration validation: no package test/lint/typecheck entrypoint declared in inspected metadata; no CI invocation; `NOT_RUN`.
- No repository test/build/lint scripts, workflows, services, migrations, or provider operations were executed for this document.

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-10-01 | Added a source-grounded matrix separating hosted desktop CI, package-local entrypoints, and unautomated Deno, SQL/RLS, landing, and orchestration evidence. |

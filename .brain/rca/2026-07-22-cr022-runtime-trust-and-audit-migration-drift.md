---
version: "0.1.0b"
created_at: "2026-07-22T00:20:00+07:00,ATHER"
last_update: "2026-07-22T00:20:00+07:00,ATHER"
status: "beta"
superseded_by: null
attributes:
  doc_type: "root-cause-analysis"
  domain: "identity-entitlement"
  scope: "CR-022 native runtime gate and CR-021 audit migration"
---

# RCA — CR-022 UI-only unlock and audit migration drift

## Symptom

The first-run React gate could block the Command Deck, but Rust still started GSI/CV and the overlay
at process startup. Separately, the CR-021 production migration dry-run failed while replacing the
`gmad_download_audit_action_check` constraint.

## Evidence

- `src-tauri/src/lib.rs` started capture and configured a visible overlay before any entitlement
  decision; `gsi.rs` accepted `/gsi` posts without an entitlement guard.
- The production transaction dry-run failed with SQLSTATE `23514` because an existing audit row used
  `owner_bootstrapped`.
- A read-only query found one existing `owner_bootstrapped` audit row; CR-019's local migration also
  declares both `role_changed` and `owner_bootstrapped`.

## Root Cause

The initial implementation treated React navigation as the unlock boundary while the privileged
runtime lifecycle remained unconditional. The CR-021 audit migration was authored from the CR-016
action list and did not compose CR-019's later owner-role actions.

## Why the issue escaped detection

Pure frontend state tests verified screen decisions but not native service startup. The SQL was
type/read reviewed locally without first replaying it transactionally against production rows and
the current live constraint history.

## Proposed prevention and applied correction

- Rust now calls the JWT-protected entitlement Function directly, arms a process-local flag only for
  `eligible` plus server-derived GID/current Terms, hides overlay by default, rejects GSI while
  locked, and starts CV only after native authorization.
- The audit migration preserves CR-019 actions. A production `BEGIN ... ROLLBACK` dry-run now passes
  singleton, privilege, seed, and existing-row assertions.
- Keep native runtime-lock tests, migration transaction dry-runs, full CI-equivalent gates, and
  authenticated UAT mandatory before release.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
| --- | --- | --- | --- | --- | --- |
| 0.1.0b | 2026-07-22 | beta | Documented and corrected the UI-only trust boundary and CR-019 audit-action migration drift. | null | ATHER |

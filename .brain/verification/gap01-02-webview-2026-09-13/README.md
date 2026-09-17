---
version: "0.1.0"
created_at: "2026-09-13T01:30:13+07:00,RWANG,56f9fbd"
last_update: "2026-09-13T01:30:13+07:00,RWANG"
status: "active"
attributes:
  doc_type: "verification-record"
  scope: "local-release-smoke"
---

# GAP-01/02 — release WebView/native smoke

Tested implementation commit `56f9fbd`, application `0.13.2`, using the locally built `src-tauri/target/release/g-maiden.exe`. The executable was launched with a separate temporary WebView2 profile and a local CDP endpoint on port 9237. This is an unpackaged release-executable smoke on the development machine, not installer, clean-VM, hosted-CI or production acceptance.

## Results

| Check | Observed result |
| --- | --- |
| Cold start | Real WebView2 renders the Thai Google sign-in gate; [screenshot](01-cold-start.png) inspected visually. No account sign-in performed. |
| Native lock | `window.__TAURI_INTERNALS__.invoke("lock_gmad_runtime")` resolved. No public runtime-state readback command exists; this result alone does not independently inspect Rust memory. |
| DPAPI roundtrip | A previously absent, dedicated key `gmad_uat_gap01_20260913` stored and returned the synthetic value. Its ciphertext did not contain the fixture plaintext. Auth keys and other secrets were not overwritten. |
| Deletion failure | Holding the exact fixture file open with Python `Path.open("rb")` caused native `secret_delete` to reject; the file remained. Only the boolean rejection was recorded, not the native error path. |
| Retry and idempotence | After closing the handle, `secret_delete` resolved, `secret_get` returned null, a repeated deletion resolved, and the file was absent. |
| CodeDoc | Actual Python process returned 2: required default model absent from Ollama. Verdict remains INDETERMINATE. |

Machine-readable records: [native smoke](native-smoke.json), [CodeDoc preflight](codedoc-preflight.json).

## Method and limits

Agent Browser attached to the actual control WebView with `--session gmad-native-uat --cdp 9237`. The snapshot and screenshot were read before native calls. IPC used the app's real immutable Tauri bridge, with `secret_get`, `secret_set` and `secret_delete` arguments matching [native commands](../../../src-tauri/src/secret.rs). The file-held rejection exercises a Windows sharing failure, not a simulated ACL denial.

The planned synthetic-session/entitlement fixture was not injected: Tauri's `invoke`, its parent and transport properties are non-writable/non-configurable in this release. No production request was sent by the test to compensate for that limitation. Neither an actual sign-out transaction nor a WebView expired-grace transition is claimed here. Those remain acceptance work; SDK/React composition and Rust timing tests are separate evidence in the [approved remediation record](../../../docs/operations/auth-failure-remediation-proposal.md).

The fixture was removed through native IPC. The app exited through its existing `quit_application` IPC after ordinary window-close hid it to the tray. A separate command then stopped only the verified test feeder, checking its executable path and original parent PID. The temporary WebView profile `C:/Users/pc/AppData/Local/Temp/gmad-webview-uat-9tpmf1az` is retained: automatic approval review rejected a combined process-stop/recursive-profile-cleanup command with only `blocked by policy`, so that deletion was not retried.

Out-of-scope environment observation: port 3000 was owned by Docker Desktop (`com.docker.backend.exe`), not this app. The feeder stayed alive after app exit because its existing loop treats a successful socket write as success without validating the HTTP status. No GSI/OAuth callback acceptance is claimed; no Docker process, port configuration or feeder source was changed.

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-09-13 | Record bounded native IPC/DPAPI and release WebView cold-start evidence, missing-model verdict and remaining session UAT. |

---
title: "G-Party own-GSI sharing implementation plan"
doc_id: "2026-11-01-g-party-gsi-sharing"
status: "active"
version: "0.1.0"
updated: "2026-11-01"
owner: "G-Maiden"
related_docs: ["FEAT-G-PARTY", "CR-037-party-gsi-own-stat-sharing", "mvp-decisions", "mvp-backlog", "G-SERIES-DATA-LINEAGE"]
---

# G-Party Own-GSI Sharing Implementation Plan

## เป้าหมายและ authority

พัฒนาต้นทาง GSI → native sender → running relay → native receiver → peer status ให้ผู้เข้าร่วมดู HP/MP/alive/respawn โดยไม่ camera-select. Owner อนุญาต scope และ repo docs ตาม [[CR-037-party-gsi-own-stat-sharing]]. รายละเอียด protocol เป็น assistant implementation decision ตาม [[FEAT-G-PARTY]]; ไม่มี deployment/release หรือ native/live acceptance จากคำสั่งนี้.

**Phase: 3** ของส่วนขยาย G-Party หมายถึง source/transport/consumer integration. ไม่เปลี่ยน priority และ 62 parent tasks ของ MVP. Task IDs `GP-*` เป็นชุดแยก; ไม่เขียนทับ execution DAG เดิม.

## สถาปัตยกรรมและเจ้าของงาน

- Root: `services/g-party-relay/server.mjs` และ socket integration tests, integration review, generated doc-graph outputs, final verification.
- Backend lane: Rust party module/portable tests และ narrow production GSI/IPC hooks. Native reqwest เป็น transport owner; ไม่ await ใน GSI path.
- Frontend lane: consent/create/join/leave/owner controls, real PartyView lifecycle และ peer status integration ด้วยการจัดรูปแบบใหม่.
- Docs lane: FEAT/CR/plan, canonical policy/product/index/manifest/lineage addenda; ไม่แก้ generated doc outputs หรือ code ของ lane อื่น.

Relay ใช้ Node ≥22 built-ins และ memory-only; native sync ปกติ 500 ms, timeout 1500 ms, response ≤32 KiB, no redirects; remote HTTPS/loopback-only HTTP test. รายละเอียด wire fields, limits และ acceptance มี SSOT ใน FEAT ไม่สร้าง protocol อีกชุดในแผนนี้.

## ข้อจำกัดร่วม

1. ใช้ branch `wip/g-party-gsi-sharing` ใน checkout แยก; preserve งานขนานและใช้ explicit paths. ไม่มี commit, tag, deploy หรือ release ในขั้น authoring นี้.
2. Create/join ต้อง checked sharing consent+activation; native reject ก่อน network เมื่อไม่ยินยอม. ไม่มี view-only mode/auto-join/persisted credentials และไม่ผูก Google account.
3. Source ต้อง admitted own GSI: app570, explicit playing, verified local Steam owner, real canonical match ID, exact team, PRE_GAME/GAME_IN_PROGRESS, ทุก field valid. ไม่ส่ง rawGSI/rawMatchID/SteamID.
4. AI denylist เดิมไม่เปลี่ยน; peer data ไม่มีทางไป cloud AI/Voice/Memory/Log/CV/public profile/analytics โดยปริยาย.
5. รักษา source/session/generation/freshness fences, sequential one in-flight request, bounded cache และ no global locks across await. Relay รวม publisherUploadBound จาก previous admission/sync response (admin requests ไม่ refresh), receiver รวม whole RTT/UI elapsed; หลัง transport failure await null scope/sample probe ก่อนส่ง samples ใหม่. Conservative expiry ยอมรับได้; no mock live data.
6. Room/match/team isolation เป็น equality filter ไม่ใช่ official party/game attestation. Relay อ่าน shared stats ได้; ไม่กล่าวอ้าง E2EE.
7. งาน GSI recovery PR88 ไม่ถูกรวม/แก้กว้างใน slice นี้. คง G-Signal critical path และ 900 MB aggregate RAM/CPU/FPS constraints.

## Tasks และเกณฑ์ปิด

| ID | งาน | สถานะเริ่มต้น | เกณฑ์ปิด |
| --- | --- | --- | --- |
| GP-001 | Spec/consent/threat cases/field contract และ canonical docs | IMPLEMENTED; doc gate PASS | FEAT/CR/policy/lineage ตรง protocol; AI denylist และ 62 MVP rows เดิมคงอยู่ |
| GP-002 | Running Node relay และ limits/auth/room lifecycle | IMPLEMENTED; 11 HTTP tests PASS | Real socket tests และ independent race probes ครอบ auth/isolation/replay/freshness/owner lifecycle/input bounds |
| GP-003 | Native admitted-GSI publisher, receiver/transport, IPC และ generation fencing | IMPLEMENTED; portable 27 tests + clippy PASS | Production crate ทดสอบจริง; native wiring reviewed; Windows build/handler runtime ยังเป็น GP-006 |
| GP-004 | UI consent/status/owner controls และ peer vitals | IMPLEMENTED; 52 Party tests PASS | รวมอยู่ใน frontend 597 tests PASS; TypeScript/lint/build และ isolated component layout ตรวจแล้ว |
| GP-005 | Integration/fault/privacy review | IMPLEMENTED; synthetic integration/review PASS | Rust sender→Node relay→Rust receiver จริง; 3 confirmed P2 findings แก้แล้ว; ไม่มี unresolved confirmed blocker จาก review |
| GP-006 | Platform/live/resource qualification และ handoff | PENDING platform/live/NFR | Linux full-native attempt ติด pkg-config/gobject dependency; Windows CI, live Dota/สองจอ และ NFR ยังรอหลักฐาน |

## Verification matrix

| ชั้นหลักฐาน | สิ่งที่พิสูจน์ | สถานะ ณ สร้างแผน |
| --- | --- | --- |
| Contract/doc graph | Metadata, links, registration และ policy coherence | PASS: 215 tooling tests; 14 existing strict findings checklist-covered, 0 uncovered; final artifacts regenerated with this change |
| Relay HTTP/socket | Running relay, authorization, filters, bounds, TTL และ owner lifecycle | PASS: 11 tracked tests; 3 independent delayed-body race probes |
| Portable production Rust | Projection, allowlist, protocol/transport, cancellation และ freshness | PASS: 27 tests, 0 failed/ignored; clippy -D warnings PASS |
| Frontend | Consent/action lifecycle, aging, unavailable และ accessibility | PASS: 597 tests/64 files รวม Party 52; tsc/lint/build PASS; existing unrelated test warnings retained |
| End-to-end synthetic | Production sender/receiver กับ real HTTP relay โดย fixture GSI | PASS ใน portable suite; ไม่ใช่ live Dota/native GSI handler |
| Windows native build | Platform compile และ IPC/native startup | PENDING Windows CI; full-native test attempt บน Linux exit101 เพราะ pkg-config/gobject toolchain ไม่มี |
| Live Dota/สองเครื่อง/สองจอ | Own-stat updates โดยไม่ camera-select, reconnect และ source identity จริง | PENDING |
| NFR/privacy runtime | No forbidden egress, RAM/CPU/FPS และ G-Signal non-interference | PENDING |

รัน suite ของพื้นที่ที่แก้ภายใต้ timeout และ gates ตาม AGENTS เมื่อ environment รองรับ. เก็บ initial failures, command, exit code, exact source และ environment ตามจริง; ไม่ใช้ syntax/source/unit checks แทน native/game acceptance. Root เป็นผู้เพิ่มผลที่เกิดขึ้นแล้วและ regenerate artifacts ผ่าน `node tools/doc-graph/ci-gate.mjs`.

## Execution ledger

- 2026-11-01: อ่าน AGENTS/CLAUDE และ functional docs; ไม่ใช้ prior design-system/visual references. เลือก CR-037 เพราะ baseline มีถึง CR-036.
- 2026-11-01: เผยแพร่ FEAT/CR/plan เป็น reviewable implementation anchor ก่อนปิดงาน code. สถานะ task เป็นเริ่มพัฒนา ไม่ใช่ completion.
- 2026-11-01: ณ เริ่ม authoring ยังไม่ได้รับ test/native/live evidence; จึงสร้าง matrix เป็น pending. Detailed transport/protocol เป็น assistant-selected design ในขอบเขต Owner instruction.
- 2026-11-01: Root รายงาน implementation `services/g-party-relay/server.mjs` และ 10 real HTTP tests ใน `services/g-party-relay/server.test.mjs` ผ่าน. นี่เป็น bounded relay evidence ที่ส่งมาจาก root ไม่ใช่ Windows/live Dota/สองจอหรือ NFR acceptance; final integrated command/source/environment receipt ยังต้องบันทึกแยก.
- 2026-11-01: ปรับสัญญาอายุให้รวม publisher upload bound จาก previous admission/sync response และ null sync probe หลัง transport failure; ไม่ให้ poll หรือ administrative action ทำ source เก่ากลับมาสด.

## Implementation verification receipt — 2026-11-01

Source: base `005f67b7b87b12a189c7671048cbe4c8790b3dfa` plus the accompanying G-Party changes on `wip/g-party-gsi-sharing`. Environment: Linux x86_64, Node 24.22.1, Rust 1.96.0; frontend dependencies from the existing lockfile. No application version, release channel or deployment was changed.

| Command / check | Observed result |
| --- | --- |
| `node --test services/g-party-relay/server.test.mjs` | 11 passed; real HTTP sockets and synthetic data |
| `cargo test --manifest-path src-tauri/g-party/Cargo.toml --locked` | 27 passed, 0 failed, 0 ignored; includes real Node relay and production Rust clients |
| `cargo clippy --manifest-path src-tauri/g-party/Cargo.toml --all-targets --locked -- -D warnings` | exit0, no diagnostics |
| `node node_modules/vitest/vitest.mjs run` from `src` | 597 passed / 64 files; Party contributes 52 tests |
| `node node_modules/typescript/bin/tsc --noEmit` from `src` | exit0 |
| `node node_modules/eslint/bin/eslint.js src --max-warnings=0` from `src` | exit0 |
| `node node_modules/vite/bin/vite.js build` from `src`, with bundled runtime assets present | exit0, 183 modules transformed; browser frontend bundle only |
| `node tools/doc-graph/ci-gate.mjs` | PASS: 215 tests, encoding clean, 14 existing checklist-covered strict findings / 0 uncovered; ledger/orphans pass |
| `cargo test --manifest-path src-tauri/Cargo.toml --locked` | BLOCKED on Linux: exit101 in system-library build scripts because `pkg-config` is unavailable for gobject/GTK; not a Windows result |
| Parent `cargo metadata --locked --offline --no-deps` | resolves the new local `g-party` dependency with the minimal parent lockfile change |
| `git diff --check` | PASS |

Full-native clippy and a Tauri native smoke build remain pending with Windows CI; the failed Linux dependency step cannot establish native correctness. Existing `authRemediation` tests emit multiple-Supabase-client notices and existing VRZO tests emit React act warnings; all assertions pass. These warnings are outside the changed Party modules and were not suppressed.

### Independent review and corrections

Two independent reviews inspected the implementation and contracts. Three confirmed P2 findings were reproduced or established at the source integration boundary and corrected:

1. Relay accepted lone UTF-16 surrogate nicknames, which could poison typed Rust snapshots. Relay and UI now reject ill-formed names; Thai and valid non-BMP emoji remain accepted. Regression went RED then GREEN.
2. A failed room admission left the UI's retry form hidden. An authoritative error/no-room snapshot now restores unchecked consent and the form; an IPC exception retains Stop because native membership is unknown. Regression went RED then GREEN.
3. Production GSI rejection returned before invalidating the Party source. Both invalid-JSON and invalid-schema branches now invalidate the bounded source; the portable valid→invalid-input regression verifies null publication and cleared peer health. Native branches were reviewed at source level, not exercised in a Windows handler run.

Final independent checks: portable Rust 27/27, Party UI 52/52, and real HTTP delayed-body probes for kick-during-sync, rotate-during-join and leave-during-rotate all pass. No unresolved confirmed blocker was reported. Review is engineering evidence, not Owner acceptance or live-game qualification.

### Isolated new-component layout checks

Only the new Party components were rendered, with visibly labeled synthetic data and a fixture-only Thai font. At 1920×1080 all five compact cards fit in one 1896px-wide row; the strip is 259.08px high without vertical clipping. At 940×600 the 916px-wide strip can scroll its 1132px content, and the connection form has a bounded 558px viewport with 787px content; consent and submit remain reachable. The status strip is placed as a full-width sibling after the minimap grid, preserving the map. These component measurements do not prove the full native application's layout, focus, or physical two-monitor behavior.

### Remaining acceptance

- Windows app build/tests/clippy/smoke on the final PR head.
- Two consenting clients with real Dota GSI, valid local Steam ownership, same match/team, death/respawn, pauses, reconnect, party leave and invalid source transitions without camera selection.
- Remote HTTPS deployment and real network latency; no hosted relay was deployed by this change.
- Two-monitor readability/focus behavior and aggregate CPU/RAM/FPS/G-Signal timing. Include a locally hosted relay process in resource measurements if it runs on the gaming PC.

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-11-01 | เพิ่มแผน G-Party แยกจาก 62 MVP tasks พร้อม ownership, task gates และ pending evidence matrix. |

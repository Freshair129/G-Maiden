---
title: "RCA: Sign-out cleanup and entitlement failure-state gaps"
doc_id: "2026-09-12-auth-failure-state-gaps"
status: "historical"
version: "0.4.0"
updated: "2026-09-12"
owner: "Boss"
---

# RCA: Auth failure-state gaps

Baseline: `a4a75542c857beaac68267b90e16707ad3263a45`, application `0.13.2`.
ผู้วิเคราะห์: RWANG. ขอบเขต: source inspection และ isolated source probes; ไม่มี production mutation หรือการแก้ application code.
ความเสี่ยงของการแก้ที่เสนอ: **C-3 / HIGH** เนื่องจากเกี่ยวกับ session, native entitlement และ credential cleanup.

## Case A — Sign-out ไม่ถึง local cleanup เมื่อ security service ล้มเหลว

### Symptom

เมื่อผู้ใช้ sign out แล้ว `requestSessionAction("current")` reject โค้ดล็อก native runtime ก่อน แต่ไม่เรียก `supabase.auth.signOut({ scope: "local" })` และไม่เรียก `setSession(null)` ใน flow นี้ จึงไม่มีหลักฐานว่าล้าง session/credential ฝั่งเครื่องสำเร็จ ผู้ใช้ได้รับข้อความ sign-out was stopped.

ข้อนี้ไม่ได้อ้างว่าเกิดกับผู้ใช้ production แล้ว หรือว่า runtime ยังคงปลดล็อกหลัง sign-out; probe ยืนยันว่าล็อก runtime ถูกเรียกก่อน.

### Evidence

- [auth.ts:L124](https://github.com/Freshair129/G-Maiden/blob/a4a75542c857beaac68267b90e16707ad3263a45/src/src/auth.ts#L124), `useAuth` / callback `signOut`: วาง security request ก่อน client sign-out ภายใน try เดียว.
- [securitySession.ts:L8](https://github.com/Freshair129/G-Maiden/blob/a4a75542c857beaac68267b90e16707ad3263a45/src/src/securitySession.ts#L8), `signOutWithRuntimeLock`: current scope ต้องล็อก native สำเร็จก่อนเรียก provider callback.
- [securitySession.test.ts](../../src/src/__tests__/securitySession.test.ts): ตรวจลำดับ lock/provider และ lock failure แต่ไม่ได้ใช้ callback ที่ประกอบจริงใน auth.ts.

Probe วันที่ 2026-09-12 ใช้ Node 24.19.0 import helper จาก TypeScript source แล้ว execute callback `signOut` ที่ตัดจาก auth.ts ผ่าน `vm.runInNewContext`; mock เฉพาะ dependencies (`useCallback`, native invoke, service, Supabase และ React setters). ทำให้ security request throw โดยไม่มี network call.

```text
Observed calls:
  lock_gmad_runtime
  security-request
  error:Security service unavailable; sign-out was stopped.

provider-local-signout: not called
clear-session: not called
```

### Root Cause

Remote security-service success เป็น dependency ของ local credential/session cleanup ใน callback เดียว หาก request แรก throw การล้าง local จะถูกข้าม แล้ว helper ส่ง failure กลับขึ้นไป ทำให้ outer callback return ก่อน `setSession(null)`.

### Why the issue escaped detection

ชุดทดสอบที่ตรวจอยู่ครอบคลุม helper ด้วย callback จำลอง จึงไม่ครอบคลุมความสัมพันธ์ระหว่าง security service กับ local cleanup ใน auth.ts จริง นี่คือช่องว่างของ test scope ที่ยืนยันได้ ไม่ใช่ข้อสรุปถึงเหตุการณ์ CI หรือการตัดสินใจของผู้พัฒนาในอดีต.

### Proposed prevention

ออกแบบ contract แยก **native lock**, **local credential cleanup**, **remote revocation**, และ **audit outcome** ให้แสดงผลแต่ละขั้นตรงจริง การล้าง local สำเร็จห้ามอ้างว่า revoke remote สำเร็จ และห้ามใช้การ bypass authorization เป็นวิธีแก้.

เพิ่ม integration test ที่ใช้ sign-out flow จริงกับ security timeout/503, provider error, DPAPI cleanup failure และ native-lock failure. เกณฑ์ปิด: ผู้ใช้ทราบชัดว่าขั้นใดสำเร็จหรือยังค้าง; behavior การล้าง local ขณะ remote ล้มเหลวต้องตรงกับ contract ที่อนุมัติ. เชื่อมกับ EXEC-PLAN CR-034 task T10; ไม่สร้างงาน IAM ซ้ำ.

### Additional evidence — Credential deletion failure is swallowed

ตรวจต่อวันที่ 2026-09-12 เพื่อเตรียม remediation พบ [secureStorage.ts](../../src/src/secureStorage.ts) `removeItem` catch ทุก rejection จาก `secret_delete` แล้ว resolve ต่อ. [secret.rs](../../src-tauri/src/secret.rs) แยก absent file เป็น success อยู่แล้ว; native I/O error จึงไม่ควรถูกเหมารวมว่าเป็น absent key.

Isolated source probe execute method จริง (ลบเฉพาะ TypeScript signature เพื่อใช้ VM) โดย mock native delete ให้ reject `access denied` และใช้ synthetic key: ผลคือ `resolved despite native deletion failure`; legacy deletion ยังถูกพยายาม. ไม่มีการอ่านหรือลบ secret จริง.

**Symptom:** caller อาจได้รับ cleanup success แม้ native deletion ล้มเหลว. **Root cause:** storage adapter ไม่ส่ง error กลับ caller. **Why escaped:** native idempotent-delete test ไม่ครอบคลุม error propagation ผ่าน frontend adapter; การผ่าน native delete test อย่างเดียวจึงไม่ยืนยัน composite sign-out cleanup. **Prevention:** ส่งต่อ deletion failures, พยายาม cleanup keys อื่นให้ครบ, แยก local cleanup กับ remote revocation และทดสอบ provider/DPAPI/legacy failures ตาม [remediation proposal](../../docs/operations/auth-failure-remediation-proposal.md).

## Case B — UI เก็บ eligible เดิมเมื่อ backend ล็อกหลัง grace หมด

### Symptom

เงื่อนไข: session เคย eligible, background token refresh เรียกตรวจสิทธิ์, network request ล้มเหลว และ native grace ไม่มีผลแล้ว. Rust ล็อก runtime/ซ่อน overlay แล้วคืน error แต่ UI สามารถคง state/decision เดิมเป็น eligible.

ผลกระทบที่ยืนยันจากโค้ดคือสถานะ UI กับ native อาจไม่ตรงกัน ไม่ใช่การ bypass native entitlement หรือหลักฐานว่า credential ใช้ข้ามบัญชีได้.

### Evidence

- [lib.rs:L160](https://github.com/Freshair129/G-Maiden/blob/a4a75542c857beaac68267b90e16707ad3263a45/src-tauri/src/lib.rs#L160), `verify_gmad_entitlement`: Err branch พยายามคืน stale decision ก่อน; ถ้าไม่มี usable grace จึง `set_gmad_entitled(false)`, hide overlay และคืน Err.
- [runtime.rs:L196](https://github.com/Freshair129/G-Maiden/blob/a4a75542c857beaac68267b90e16707ad3263a45/src-tauri/src/runtime.rs#L196), `ENTITLEMENT_GRACE_MS`; tests `grace_window_expiry_is_a_hard_boundary` ยืนยัน boundary ใน source.
- [gmadEntitlement.ts](../../src/src/gmadEntitlement.ts), `refresh` catch: return โดยไม่เปลี่ยน state เมื่อ `shouldSurfaceRefreshFailure(background, everEligible)` เป็น false.
- [gmadFirstRun.ts](../../src/src/gmadFirstRun.ts), `shouldSurfaceRefreshFailure`: `!(background && everEligible)` ไม่มีข้อมูล native lock หรือ grace state.
- [gmadFirstRun.test.ts:L51](https://github.com/Freshair129/G-Maiden/blob/a4a75542c857beaac68267b90e16707ad3263a45/src/src/__tests__/gmadFirstRun.test.ts#L51): ทดสอบให้ background+everEligible กลืน error โดยไม่แยก expired grace.

Probe import pure function จาก source จริง:

```text
shouldSurfaceRefreshFailure(true, true) -> false
```

Probe นี้ยืนยัน predicate; เส้นทาง native expiry -> UI mismatch เป็นข้อสรุปจาก call-site inspection ไม่ใช่การรัน native app ข้ามเวลา 24 ชั่วโมง.

### Root Cause

Frontend ใช้คำว่า “เคย eligible” แทนข้อเท็จจริงว่า backend ยังอนุญาตอยู่ และสมมติว่า background error หมายถึง runtime ยัง armed เสมอ แต่ Rust คืน `Ok(stale)` เมื่อ grace ยังใช้ได้ และคืน `Err` หลังล็อกเมื่อ grace ใช้ไม่ได้แล้ว. สัญญาของ error ระหว่างสองชั้นจึงไม่ตรงกัน.

### Why the issue escaped detection

มี unit tests แยกสองฝั่ง: Rust ทดสอบ hard expiry และ frontend ทดสอบการไม่รบกวน eligible UI แต่ไม่พบ test ในชุดที่ตรวจซึ่งเชื่อม backend lock-after-expiry เข้ากับ rendered gate state. การทดสอบแยกอาจผ่านพร้อมกับ integration mismatch ได้.

### Proposed prevention

กำหนด native response/error contract ที่แยก fresh eligible, stale-but-allowed, confirmed denial และ unavailable-with-runtime-locked. UI ต้องแสดง permission state ตาม native authority พร้อมรักษาการไม่กระพริบระหว่าง stale-but-allowed refresh.

เกณฑ์ปิด: contract/integration tests ครอบคลุม cold start, within-grace outage, expired-grace outage, explicit denial, sign-out และ token rotation; native locked ต้องไม่ถูก UI อธิบายว่าใช้งานได้ปกติ. เสนอเพิ่มขอบเขตนี้เข้า CR-034/CR-022 หลังอนุมัติ ไม่แก้ policy ในงานวิเคราะห์นี้.

## Case C — In-flight native verification can rearm after sign-out

**Symptom / Evidence:** `lib.rs::verify_gmad_entitlement` awaits the server then unconditionally calls `set_gmad_entitled(true)` and `cache_entitlement` for an eligible result. `lock_gmad_runtime` clears both values but does not invalidate the pending call. The source permits the sequence verify starts → sign-out locks → older eligible response returns → runtime rearmed. This is a source-confirmed ordering defect, not a production incident claim.

**Root Cause:** No transaction generation or shared commit/lock critical section across the asynchronous verification boundary. A frontend-only cancelled flag cannot prevent Rust from applying the old decision.

**Why escaped:** Existing cache tests cover sequential sign-out/denial/expiry, not a response that commits after invalidation. **Prevention:** Capture an incrementing request generation before await; commit and explicit lock share a mutex, and lock invalidates all older generations. Test old success and old failure after lock/newer request; test current completion. This is the conditional native scope already approved in the remediation proposal; preserve the 24-hour cache duration.

## Initial audit verification and limitations (before implementation)

Source probes ผ่าน assertions ทั้งสองกรณีตามผลด้านบน. ไม่ได้รัน Rust/Vitest application suites, ไม่ได้อ่าน token จริง, ไม่ได้ใช้ Supabase production และไม่ได้เปลี่ยน source/tests. ต้องทดสอบ integrated native/WebView อีกครั้งเมื่อมีการแก้จริง.

## Remediation record — 2026-09-12

Boss approved the local GAP-01/02 contract and process-local grace amendment. Cases A/B/C are addressed in the working tree with tests; see [implementation evidence](../../docs/operations/auth-failure-remediation-proposal.md). The red run reproduced four frontend/SDK assertions before fixes; native test suite now includes request invalidation across sign-out. This is not a claim that production or packaged native/WebView acceptance was run.

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-09-12 | Source-based RCA และ isolated evidence ของ sign-out cleanup กับ expired-grace UI/native mismatch; ยังไม่มี implementation change. |
| 0.2.0 | 2026-09-12 | เพิ่ม source probe ของ storage adapter ที่กลืน native deletion error และเชื่อม candidate remediation; ไม่มี application code change. |
| 0.3.0 | 2026-09-12 | Add source-confirmed native verification/sign-out race and generation-guard prevention before native implementation. |
| 0.4.0 | 2026-09-12 | Add local remediation record and distinguish initial source probes from later test/build evidence. |

---
title: "CR-047 — Pro tier and entitlement contract (G-Arena gating)"
doc_id: "CR-047-pro-tier-entitlement-contract"
status: "accepted"
approved_by: "Claude orchestrator under explicit Boss delegation (2026-11-08) — agent decision, not human sign-off"
approved_date: "2026-11-08"
version: "0.3.0"
updated: "2026-11-08"
owner: "Boss"
complexity: "C-3"
risk: "HIGH"
related_docs: ["mvp-decisions", "ADR-14-gid-account-identity", "ADR-16-credit-economy-and-mint-oracle", "CR-003-account-phase1-wallet-billing", "oauth-jwt-client-authorization-flows", "mvp-delivery-plan", "software-requirements-specification"]
---

# CR-047: Pro tier และ entitlement contract (เพื่อให้ G-Arena เป็น Pro-only)

> **สถานะ:** accepted (2026-11-08) — มติ D-1 โดย Boss (§11.1) และ D-2 โดย Claude orchestrator ภายใต้การมอบอำนาจของ Boss (§11.2).
> D-2 เป็นการตัดสินใจของ agent ไม่ใช่การลงนามของมนุษย์.
> **Implementation ยังถูก block** จนกว่า ADR ตาม §12 accepted **และ** M6 ปิด (F2).
> **มติ Owner D-1 (2026-11-08, §11.1):** Command Deck เดียวทุก tier; ทุกคนได้ base Arena; Pro ปลดล็อกฟีเจอร์ภายใน UI เดียวกัน.
> มตินี้แทน §7.3 และ §8 เดิม และแก้ความหมายของ "Pro-only" ใน §1–§3. อ่าน §11.1 ก่อนส่วนอื่น.
> **Risk: HIGH / C-3** — เพิ่มแนวคิด entitlement ใหม่, กุญแจเซ็น server-side, และ network path ใหม่ของ account.
> เอกสารนี้เป็น doc-first เท่านั้น: ไม่มี code, migration, Edge Function, provider หรือราคาใด ๆ ถูกสร้างหรือ deploy.
> ห้ามเริ่ม implementation จนกว่า ADR ตาม §12 accepted **และ** M6 ปิด (D-2 Q1 = F2).

## 1. เหตุผลและที่มา

Boss ตัดสินใจ (2026-11-08, comment บน [PR #165](https://github.com/Freshair129/G-Maiden/pull/165)) ว่า **G-Arena เป็น Pro only**.
สเปก G-Arena ใน #165 (FEAT-G-ARENA v0.1.1, branch `docs/g-arena-hero-inspector-20261108`) ให้ Arena เป็น body ของ Live > สด สำหรับผู้ใช้ทุกคน.
ปัจจุบันไม่มี Pro tier, entitlement authority หรือราคาใน accepted docs ใด:

| เอกสาร | สิ่งที่กำหนดไว้ | ผลต่อ CR นี้ |
| --- | --- | --- |
| [[mvp-decisions]] MVP-004 | Local core เริ่มได้โดยไม่มี account, Google session, **entitlement** หรือ network; account-only operations ตรวจสิทธิ์บน server; revoke/mismatch ห้าม lock local gameplay | Pro ต้องเป็น account-only feature แบบ additive; ห้ามแตะ startup/local core |
| [[ADR-14-gid-account-identity]] | Google OAuth เป็น primary sign-in เดียว; deck ทำงานเต็มเมื่อ signed-out; GID payload ห้าม encode tier/payment | Pro ผูกกับ account UUID ไม่ใช่ GID; ไม่เพิ่มวิธี login ใหม่ |
| [[ADR-16-credit-economy-and-mint-oracle]] | กล่าวถึง "จ่ายเงิน (subscription)" เป็น faucet multiplier เท่านั้น | ไม่ได้นิยาม Pro tier หรือ feature gating |
| [[CR-003-account-phase1-wallet-billing]] | Out of scope: **subscription**; `inventory` = entitlement ของ catalog item; Omise live mode ยัง blocked | การขาย Pro ต้องมีมติใหม่ (§4) |
| [[mvp-delivery-plan]] §มติ 2 | Freeze owner extensions จนถึง M6; ข้อยกเว้นต้องได้อนุมัติทีละรายการ | G-Arena และ CR นี้ต้องได้มติ §10 |

ตัวอย่างที่ใช้ซ้ำได้ในโค้ดปัจจุบัน: Store install verification ใช้ Ed25519 (`ring`) กับ public key ที่ compile-in
(`STORE_INSTALL_PUBLIC_KEY`, `src-tauri/src/voice_api/pack_io.rs`) และ [[gann-event-media-contract]] / `gann-store-release-v1.schema.json`
ใช้ `algorithm: Ed25519`, `key_id`, `issuer: gstore`. CR นี้เสนอให้ entitlement ใช้รูปแบบเดียวกัน.

## 2. ขอบเขต

**In scope (contract เท่านั้น):** นิยาม Pro tier, ผู้ออก entitlement, วิธี client ตรวจ, key handling, threat model, offline/grace,
revocation/expiry, พฤติกรรมเมื่อหมดสิทธิ์กลางแมตช์, ประสบการณ์ non-Pro ของ G-Arena, hard boundary ของ local core, ทางเลือก freeze.

**Out of scope:** ราคา, payment provider, subscription billing, Terms/refund wording (ต้องผ่าน legal review แยก),
UI layout ของ Arena (เป็นของ #165), ฟีเจอร์ Pro อื่นนอกจาก G-Arena, การเปลี่ยน GID codec, การ sync match data ใด ๆ.

## 3. นิยาม

| คำ | ความหมาย |
| --- | --- |
| **Pro entitlement** | สิทธิ์ฝั่ง server ที่ผูกกับ account UUID (`auth.users.id`) พร้อม `starts_at`, `ends_at`, `status` (`active`/`revoked`) และ `features` |
| **Feature key** | ชื่อฟีเจอร์ที่ entitlement เปิด. รุ่นแรกมีเพียง `g-arena`. ฟีเจอร์ Pro อื่นต้องผ่าน CR ของตัวเอง |
| **Entitlement lease** | claim ที่ server เซ็น อายุสั้น ใช้ตรวจ offline ในเครื่อง (§5) |
| **ProGate state** | ผลการตรวจที่ native ส่งให้ WebView: `absent` · `active` · `grace` · `lapsed` · `revoked` · `unverifiable` |
| **Install ID** | ค่าสุ่ม 128-bit ที่แอปสร้างครั้งแรกและเก็บในเครื่อง ไม่ใช่ hardware fingerprint |

## 4. ผู้ออก entitlement (issuer)

1. **Authority = `gstore` backend เท่านั้น** (Supabase เดิมของ ADR-14). Client, WebView, landing และ G-AnnStudio ไม่มีสิทธิ์สร้างหรือแก้ entitlement.
2. Entitlement เก็บใน table แบบ private schema (ชื่อและ RLS กำหนดใน ADR ตาม §12): ผู้ใช้อ่านได้เฉพาะแถวตัวเอง; เขียนได้เฉพาะ service role
   ผ่าน path ที่ audit ได้ (payment webhook, admin grant, refund/revoke). ทุกการเปลี่ยนแปลงมี ledger row: `actor`, `reason`, `at`.
3. ไม่ใช้ `catalog_items`/`inventory` ของ CR-003 แทน entitlement ตรง ๆ เพราะ inventory เป็นสิทธิ์ถาวรของ item ส่วน Pro มีวันหมดอายุและ revoke ได้.
   ถ้า Boss เลือกขาย Pro เป็น catalog item (ทางเลือก B ด้านล่าง) ให้การซื้อ **สร้าง** entitlement row ใน transaction เดียวกัน.
4. วิธีได้ Pro เป็นมติของ Boss (§11 Q2):

| ทางเลือก | อธิบาย | ผลกระทบ |
| --- | --- | --- |
| **A. Grant โดย Owner/admin เท่านั้น** (แนะนำสำหรับรุ่นแรก) | Boss ให้สิทธิ์ tester/founder แบบมีวันหมดอายุ | ไม่ต้องมี payment ใหม่; ทดสอบ contract ได้ก่อนเปิดขาย; ไม่ชนกับ CR-003 |
| B. Pro pass ซื้อด้วย G-Coins (wallet) | ใช้ wallet/Omise flow ของ CR-003; pass มีระยะเวลา | ต้องรอ Omise live mode (blocked); ต้องแก้ CR-003 และ catalog; ยังไม่ใช่ subscription |
| C. Subscription รายเดือน | ตัดเงินอัตโนมัติ | CR-003 ระบุไว้ว่า out of scope; ต้องมี gateway/terms/refund ใหม่ทั้งหมด; ใหญ่ที่สุด |

## 5. วิธีตรวจในเครื่อง: signed lease (แนะนำ) เทียบกับ server check

### 5.1 ทางเลือก

| | **S1. Signed lease (แนะนำ)** | S2. Server check ทุกครั้ง |
| --- | --- | --- |
| กลไก | Server เซ็น lease อายุสั้น; native Rust ตรวจลายเซ็นด้วย public key ที่ compile-in | แอปถาม server ทุกครั้งที่เปิด Arena |
| Offline | ใช้ได้จนกว่า lease หมดอายุ | ใช้ไม่ได้เลยเมื่อ offline |
| Network | refresh เป็นช่วง ๆ, ไม่อยู่บน path ของเกม | request ทุกครั้งที่เปิดหน้า |
| Revocation latency | สูงสุดเท่าอายุ lease | ทันที (เมื่อ online) |
| ความซับซ้อน | ต้องมี key management + rotation | ง่ายกว่า แต่ UX แย่เมื่อเน็ตหลุด |

ข้อแนะนำ: **S1**. เหตุผลคือสอดคล้องกับ MVP-004 (network loss ต้องไม่ทำให้แอปพัง) และใช้รูปแบบ Ed25519 ที่โค้ดมีอยู่แล้ว.

### 5.2 รูปแบบ lease (S1)

Lease เป็น JSON canonical + Ed25519 signature (รูปแบบเดียวกับ `gann-store-release`) ไม่ใช่ Supabase JWT.
ห้ามใช้ Supabase access token เป็นหลักฐาน Pro เพราะ token นั้นพิสูจน์ identity ไม่ใช่สิทธิ์ และหมดอายุเร็ว.

| Field | ค่า / กฎ |
| --- | --- |
| `format`, `version` | `g-entitlement-lease`, `1` |
| `algorithm`, `key_id` | `Ed25519`; `key_id` ต้องอยู่ใน key set ที่ compile-in ของ build นั้น |
| `issuer`, `audience` | `gstore`; `g-maiden-desktop` (lease ของแอปอื่นใน G-series ใช้ไม่ได้) |
| `subject` | account UUID; native ต้องตรงกับ account ที่ sign-in อยู่ |
| `install` | SHA-256 ของ Install ID (ผูกเครื่อง; server ไม่ได้ค่าเดิม) |
| `tier`, `features` | `pro`; `["g-arena"]` |
| `lease_id` | UUID ต่อ lease (สำหรับ audit/replay) |
| `issued_at`, `not_before`, `expires_at` | UTC วินาที; `expires_at = min(entitlement.ends_at, issued_at + LEASE_TTL)` |
| `entitlement_ends_at` | วันหมดสิทธิ์จริง ใช้แสดงผลเท่านั้น |

### 5.3 ขั้นตอน

1. Signed-in client เรียก Edge Function `entitlement-lease` (ชื่อชั่วคราว) ด้วย user JWT + `install` hash + app version เท่านั้น.
2. Server ตรวจ JWT ตาม [[oauth-jwt-client-authorization-flows]] (signature, `iss`, `aud`, `exp`), อ่าน entitlement, ตรวจ device limit (§11 Q6), แล้วเซ็น lease.
   ไม่มี entitlement → ตอบ `absent` (ไม่เซ็นอะไร). Revoked → ตอบ `revoked`.
3. Native Rust ตรวจ: signature, `key_id`, `issuer`, `audience`, `subject`, `install`, ช่วงเวลา, และ `issued_at` ไม่ต่ำกว่า lease ล่าสุดที่เคยรับ.
   ผ่านแล้วจึงเก็บ lease ไว้ใน app data ของผู้ใช้ (ไฟล์เดียว, เขียนแบบ atomic).
4. WebView ได้เฉพาะ `ProGate { state, features, until }` ผ่าน Tauri command. **WebView ไม่ได้รับ lease, signature หรือ key** และ set state เองไม่ได้.
5. Refresh เมื่อ deck เปิดแล้ว (ไม่ใช่ตอน startup), ทุก ~24 ชม. เมื่อ online, หลัง sign-in และเมื่อผู้ใช้กด "ตรวจสิทธิ์อีกครั้ง". Request มี timeout และ backoff.

## 6. Key handling และ threat model (C-3)

### 6.1 Key handling

- Private signing key อยู่ฝั่ง server เท่านั้น (Supabase Edge secret หรือ KMS ตามที่ ADR ตาม §12 เลือก). ห้ามอยู่ใน repo, client, landing, CI log หรือ `.tauri/`.
- แยก key จาก Store install key และ Tauri updater (minisign) key. Key หนึ่งใช้เพื่องานเดียว.
- Client compile-in key set แบบ `{key_id → public key}` ไม่เกิน 2 ตัว (current + next) เพื่อ rotate โดยไม่ต้องรอ release พร้อมกัน.
- Rotation: เพิ่ม `next` ใน release ก่อน → server เปลี่ยนไปเซ็นด้วย `next` → release ถัดไปลบ key เก่า.
- Key รั่ว: server หยุดเซ็นด้วย `key_id` นั้นทันที; ออก release ที่ลบ `key_id` นั้น; lease เดิมหมดอายุเองภายใน `LEASE_TTL`.
  Runbook การ rotate/รั่ว ต้องอยู่ใน ADR ก่อน implementation.

### 6.2 Threat model

| ภัย | ตัวอย่าง | การป้องกัน | ความเสี่ยงที่เหลือ |
| --- | --- | --- | --- |
| ปลอม lease | แก้ไฟล์ให้ `tier=pro` | Ed25519 verify ใน native; key ที่ไม่รู้จัก → `unverifiable` | ไม่มี ถ้า private key ไม่รั่ว |
| Replay ข้ามเครื่อง | copy ไฟล์ lease ไปให้เพื่อน | `install` hash + `subject` ต้องตรง account ที่ sign-in | Install ID copy ได้ถ้าเข้าถึงไฟล์ทั้งชุด; จำกัดด้วยอายุ lease + device limit |
| Replay ข้าม account | ใช้ lease ของ account A ตอน sign-in เป็น B | `subject` mismatch → ลบ lease, `absent` | – |
| Downgrade / rollback | วาง lease เก่าที่ยังไม่หมดอายุกลับ หลังถูก revoke | เก็บ `issued_at` สูงสุดที่รับแล้ว; lease ที่เก่ากว่าถูกปฏิเสธ | ถ้าลบ state ทั้งหมด ยังติดเพดาน `LEASE_TTL` |
| ย้อนนาฬิกาเครื่อง | ตั้งเวลา Windows ย้อนเพื่อยืดอายุ | เก็บเวลาล่าสุดที่เคยเห็น; ถ้านาฬิกาถอยเกิน tolerance → `unverifiable` (non-Pro) | ป้องกันได้ไม่สมบูรณ์เมื่อ offline; เพดานคือ `LEASE_TTL` |
| แก้ binary | patch ให้ gate ผ่านเสมอ | ยอมรับ: client-side gating ป้องกัน binary patch ไม่ได้ | Arena ใช้เฉพาะข้อมูล local จึงไม่เสีย resource ฝั่ง server; ไม่ทำ anti-tamper |
| WebView injection | script ใน WebView สั่ง gate=active | gate อยู่ใน Rust; WebView อ่านได้อย่างเดียว | – |
| Server impersonation | DNS/proxy ปลอม | HTTPS + ลายเซ็น lease ไม่ขึ้นกับ transport | – |
| Privacy leak ผ่าน lease request | ส่ง match/GSI ไปกับ request | request body ถูก allowlist: JWT, install hash, app version | ต้องมี test ตรวจ payload (§8) |
| Endpoint ล่ม / DoS | `entitlement-lease` ใช้ไม่ได้ | local core ไม่กระทบ; Pro ใช้ lease เดิมจนหมดอายุ | Pro user เสีย Arena หลัง lease หมด |
| Insider / admin ผิดพลาด | grant/revoke ผิดคน | service-role only + audit ledger + เหตุผลบังคับ | ต้องมี admin procedure ใน ADR |

## 7. Offline, grace, revocation, expiry และกลางแมตช์

### 7.1 ตาราง state

| สถานการณ์ | ProGate | G-Arena | Local core |
| --- | --- | --- | --- |
| Signed-out / ไม่มี lease | `absent` | non-Pro (§8) | ทำงานเต็ม |
| Lease ถูกต้องและยังไม่หมดอายุ | `active` | เปิด | ทำงานเต็ม |
| Offline, lease ยังไม่หมดอายุ | `active` | เปิด | ทำงานเต็ม |
| Offline, เหลือ < 24 ชม. | `grace` | เปิด + แจ้งแบบเงียบว่าต้อง online เพื่อต่ออายุ | ทำงานเต็ม |
| Lease หมดอายุ / entitlement หมด | `lapsed` | non-Pro (ตาม §7.3 เมื่ออยู่กลางแมตช์) | ทำงานเต็ม |
| Server ตอบ revoked | `revoked` | ลบ lease, non-Pro (ตาม §7.3) | ทำงานเต็ม |
| Sign-out / account switch / subject mismatch | `absent` | ลบ lease ทันที, non-Pro | ทำงานเต็ม |
| ลายเซ็นผิด / key ไม่รู้จัก / นาฬิกาถอย | `unverifiable` | non-Pro + เหตุผลที่อ่านได้ | ทำงานเต็ม |

**Grace period:** ไม่มี grace เพิ่มหลัง `expires_at`. ช่วง offline ที่ใช้ได้ = อายุ lease ที่เหลือเท่านั้น
(ถ้าต้องการ grace หลังหมดอายุ ต้องเพิ่ม `LEASE_TTL` แทน เพื่อให้มีเพดานเดียวที่ตรวจได้).
ค่าที่เสนอ: `LEASE_TTL = 7 วัน`, refresh ทุก 24 ชม. — Boss เลือกค่าได้ใน §11 Q4 (3 / 7 / 14 วัน).

### 7.2 Revocation และ expiry

- Revoke ฝั่ง server (refund, chargeback, abuse, admin) มีผลกับ client ภายในการ refresh ครั้งถัดไปเมื่อ online และไม่เกิน `LEASE_TTL` เมื่อ offline.
- Entitlement หมดอายุตาม `ends_at`: lease ไม่เคยยาวเกิน `ends_at`, จึงหมดพร้อมกันแม้ offline.
- Sign-out, account switch และ revoke ของ Google session ตาม MVP-004 ลบ lease ทันที. ห้ามใช้ lease เพื่อเปิด protected account operation อื่น (ไม่มี blanket runtime-unlock).

### 7.3 หมดสิทธิ์กลางแมตช์

> **ถูกแทนด้วยมติ D-1 (§11.1 ข้อ 6):** ลดเป็น base Arena ทันที ไม่มีหน้าว่างหรือค้าง. ข้อความด้านล่างเก็บไว้เป็นประวัติของข้อเสนอเดิม.

ข้อเสนอ (แนะนำ): **ไม่ตัด Arena กลางแมตช์.**
- Gate ประเมินใหม่เฉพาะที่ match boundary: เมื่อ GSI ไม่ได้อยู่ในสถานะ in-game (`is_in_game()` เป็น false), เปลี่ยน session/match, หรือเปิดแอปใหม่.
- ถ้า lease หมด/ถูก revoke ระหว่างแมตช์ Arena ทำงานต่อจนจบแมตช์ แล้วจึงเปลี่ยนเป็น non-Pro. ไม่มีเสียง, toast หรือ modal ระหว่างแมตช์.
- ข้อยกเว้น: ผู้ใช้ sign-out หรือสลับ account เอง → เปลี่ยนทันที (เป็นการกระทำของผู้ใช้).
- การหมดสิทธิ์ไม่มีผลกับ overlay, เสียง, G-Signal หรือ announcer ไม่ว่าจะเวลาใด.

ทางเลือกอื่น (Q5): ตัดทันทีเมื่อหมดอายุ — แม่นยำกว่าแต่เปลี่ยนหน้าจอกลางเกม ซึ่งขัดกับหลัก "ไม่รบกวนสมาธิผู้เล่น".

## 8. ประสบการณ์ non-Pro ของ G-Arena

> **ข้อ 1 ถูกแทนด้วยมติ D-1 (§11.1 ข้อ 2 และ 7):** non-Pro เห็น base Arena เป็น body ของ Live > สด ไม่ใช่หน้าเดิม.
> ข้อ 2–4 ยังใช้กับ teaser ของฟีเจอร์ Pro แต่ละตัวภายใน Arena.

1. **Live > สด ไม่เปลี่ยน**: non-Pro (รวม `absent`/`lapsed`/`revoked`/`unverifiable`) เห็น body เดิมของ Live > สด ทุก tab และ shortcut ทำงานเหมือนปัจจุบัน.
2. **Teaser ตรงไปตรงมา**: entry point เดียว (เช่น tab หรือ card "G-Arena · Pro" — ตำแหน่งให้ #165 กำหนด) แสดงเฉพาะ:
   - ข้อความอธิบายฟีเจอร์และภาพประกอบนิ่งที่ติดป้าย "ภาพตัวอย่าง" ชัดเจน
   - **ไม่ render Arena จริงแบบเบลอ, ไม่ใช้ข้อมูลสด, ไม่แสดง fixture roster/timer ว่าเป็นข้อมูลจริง**
   - สถานะตามจริง: "ต้องเข้าสู่ระบบ" / "ยังไม่มี Pro" / "สิทธิ์หมดอายุ" / "ตรวจสิทธิ์ไม่ได้ — ลองใหม่เมื่อ online"
   - CTA ซื้อ/อัปเกรดแสดงเฉพาะเมื่อมีช่องทางได้ Pro จริง (§4); รุ่นแรก (ทางเลือก A) แสดงแค่สถานะ
3. Fixture/demo entrypoint ของ FEAT-G-ARENA ต้องเปิดได้เฉพาะ dev build และต้องไม่เป็นทางเลี่ยง gate ใน release.
4. ไม่มีการ nag: teaser ไม่ popup, ไม่แทรก overlay, ไม่ส่งเสียง.

## 9. Hard boundary (ไม่ต่อรอง)

1. **Startup และ local core ไม่ขึ้นกับ Pro**: ไม่มี Pro check ใน startup path (`lib.rs` setup, Job Object/governor), GSI server, capture/CV, G-Sentry, G-Motion,
   G-Signal, audio owner, overlay window, announcer/GANN, G-Voice/G-Memory, G-Party/G-Friends, updater และ hotkeys.
2. Pro check อยู่ที่จุดเดียว: การเลือก body ของ Live > สด ใน Control window. ห้ามกระจาย check ไปที่อื่น.
3. Lease refresh เป็น async, timeout จำกัด, ไม่อยู่บน G-Signal hot path, ไม่ block การ render deck; ล้มเหลวแล้วเงียบ.
4. **ไม่มี egress ใหม่ของ match data**: request ของ lease มีเฉพาะ JWT, install hash, app version. ห้ามมี GSI/GameTick, match ID, SteamID, CV, G-Log,
   history, Memory, audio, transcript หรือ diagnostics. Entitlement table ไม่เก็บข้อมูลเกม.
5. G-Arena เองใช้เฉพาะ admitted local sources ตาม FEAT-G-ARENA §4; การเป็น Pro ไม่ขยายสิทธิ์ข้อมูล, ไม่เปิด cloud context และไม่ใช่ consent ใด ๆ.
6. NFR เดิมคงที่: ≤300 ms G-Signal, ≤10% CPU, ≤900,000,000 bytes, FPS ≤3%. การ verify Ed25519 ทำเฉพาะที่ boundary.

### 9.1 Acceptance ที่ต้องมีก่อนรับ implementation

| ID | ตรวจ | ผลที่ต้องได้ |
| --- | --- | --- |
| PRO-AC-001 | cold start offline, signed-out | local core + Live > สด เดิมทำงาน; ไม่มี network call ของ entitlement |
| PRO-AC-002 | lease ปลอม / key ไม่รู้จัก / subject ผิด / install ผิด | `unverifiable` หรือ `absent`; non-Pro |
| PRO-AC-003 | วาง lease เก่ากลับหลัง revoke | ถูกปฏิเสธ |
| PRO-AC-004 | หมดอายุกลางแมตช์ (injected GSI) | Arena อยู่จนจบแมตช์; ไม่มีเสียง/toast; overlay/G-Signal ไม่กระทบ |
| PRO-AC-005 | sign-out / switch account | lease ถูกลบทันที |
| PRO-AC-006 | ตรวจ payload ของ lease request | มีเฉพาะ allowlist |
| PRO-AC-007 | endpoint ล่ม/ช้า | deck ไม่ค้าง; G-Signal latency ไม่เปลี่ยน |
| PRO-AC-008 | WebView พยายาม set gate | ทำไม่ได้ |
| PRO-AC-009 | release build เปิด fixture entrypoint | ถูกปฏิเสธ |

## 10. MVP freeze — ทางเลือกให้ Boss

| | **ทางเลือก F1: ข้อยกเว้นที่ Owner อนุมัติ** | **ทางเลือก F2: เลื่อนไปหลัง M6** |
| --- | --- | --- |
| อะไรเกิดขึ้น | G-Arena + CR-047 entitlement เริ่มก่อน M6 | สเปกค้างเป็น draft จน M6 ปิด |
| ผลกับแผน | ต้องปรับวันที่ใน [[mvp-delivery-plan]] ตามสัดส่วนงานที่แทรก (backend + key mgmt + Arena UI) | วันที่ MVP คงเดิม |
| ความเสี่ยง | แย่ง capacity จาก M6 (MVP-044 Google session/revocation, MVP-048 NFR) ซึ่ง entitlement พึ่งพาอยู่แล้ว | G-Arena ออกช้า |
| เงื่อนไข | Boss อนุมัติเป็นรายการ, บันทึกในแผน, ADR ตาม §12 accepted ก่อน code | – |

ไม่มีข้อแนะนำแบบผูกมัด: เป็นการตัดสินใจด้านธุรกิจของ Boss. ข้อสังเกตทางเทคนิค: entitlement ต้องใช้พฤติกรรม Google session/revocation
ของ MVP-044 ที่ยังไม่ผ่าน acceptance — ถ้าเลือก F1 ควรทำหลัง MVP-044 อย่างน้อย.

## 11. คำถามที่ Boss ต้องตัดสิน

| # | คำถาม | ข้อเสนอ |
| --- | --- | --- |
| Q1 | Freeze: F1 ข้อยกเว้น หรือ F2 หลัง M6 (§10) | **ตอบแล้ว (D-2, §11.2):** F2 |
| Q2 | ได้ Pro อย่างไร: A grant, B G-Coins pass, C subscription (§4) | **ตอบแล้ว (D-2):** A |
| Q3 | วิธีตรวจ: S1 signed lease หรือ S2 server check (§5) | **ตอบแล้ว (D-2):** S1 |
| Q4 | `LEASE_TTL` / ช่วง offline: 3, 7 หรือ 14 วัน (§7.1) | **ตอบแล้ว (D-2):** 7 วัน, refresh ทุก 24 ชม. |
| Q5 | หมดสิทธิ์กลางแมตช์: รอจบแมตช์ หรือ ตัดทันที (§7.3) | **ตอบแล้ว (D-1, §11.1):** ลดเป็น base Arena ทันที |
| Q6 | จำนวนเครื่องต่อ account | **ตอบแล้ว (D-2):** ไม่เกิน 2 เครื่อง |
| Q7 | Pro ในรุ่นแรกมีเฉพาะ `g-arena` ใช่หรือไม่ | **ตอบแล้ว (D-1, §11.1):** ไม่ใช่ — Arena base ให้ทุกคน; Pro เปิด 4 ฟีเจอร์เสริม |
| Q8 | Pro มี UI แยกหรือใช้ deck เดียวกัน | **ตอบแล้ว (D-1, §11.1):** Command Deck เดียวทุก tier |

ทุกคำถามใน §11 ตอบแล้ว: Q5/Q7/Q8 โดย D-1 (§11.1) และ Q1–Q4/Q6 โดย D-2 (§11.2).

### 11.1 มติ Owner D-1 (2026-11-08)

Boss ตอบว่า "approve" ต่อข้อเสนอนี้เมื่อ 2026-11-08 (ส่งต่อผ่าน orchestrator session; อ้างอิง
[UX review comment บน #165](https://github.com/Freshair129/G-Maiden/pull/165#issuecomment-6719354977)).
มตินี้ตอบ Q5, Q7 และ Q8 เท่านั้น. **ไม่ใช่การอนุมัติ CR ทั้งฉบับ**: `approved_by` ยังว่าง และ status ยังเป็น draft.

1. **Command Deck เดียวทุก tier.** ไม่มี Pro UI แยก. Pro ปลดล็อกฟีเจอร์ภายใน UI เดียวกัน.
2. **ทุกคนได้ Arena layout (จาก #165) เป็น body ของ Live > สด** พร้อมข้อมูล base: แผนที่กลาง, สถานะ seen/missing ของศัตรู
   พร้อมอายุ last-seen และ hero ของตัวเอง.
3. **Pro เพิ่ม:**
   - hero inspector เต็มรูปแบบ (รายละเอียด skill และ item)
   - cooldown timers (G-Cooldown, #154)
   - รายละเอียดเพื่อนร่วมทีมจาก G-Party
   - G-Review integration

   ชื่อ feature key ของแต่ละรายการกำหนดใน ADR ตาม §12. Feature ที่เป็น Pro ยังต้องผ่านสเปกของตัวเองเรื่องแหล่งข้อมูลและ consent;
   การเป็น Pro ไม่ขยายสิทธิ์ข้อมูล (§9.5).
4. **Gating เป็น presentation เท่านั้น.** Authority อยู่ที่ server หรือ signed entitlement ตาม CR นี้ (§4, §5).
5. **G-Signal, voice alert, overlay, GSI และ local core ไม่ถูก gate ตาม tier เลย** (ย้ำ §9.1).
6. **หมดสิทธิ์หรือ offline กลางแมตช์ → ลดเป็น base Arena ทันที** โดยไม่มีหน้าว่างหรือสถานะค้าง. แทน §7.3 เดิม.
7. **มตินี้แทนกรอบเดิมที่ให้ non-Pro เห็นหน้า Live > สด แบบเก่า** (§1, §8 เดิม).

**ผลต่อส่วนอื่นของ CR (อ่านคู่กับ D-1):**

- §1 / §2 / §3: "G-Arena Pro only" ถูกแทนด้วย "Arena base สำหรับทุกคน + ฟีเจอร์ Pro ภายใน Arena". Feature key รุ่นแรกไม่ได้มีแค่ `g-arena` อีกต่อไป.
- §7.1: แถวที่เขียนว่า "non-Pro (§8)" หมายถึง base Arena.
- §7.3: ถูกแทนด้วยข้อ 6. ไม่มีการรอ match boundary อีก. ยังคงห้ามเสียง, toast และ modal ระหว่างแมตช์.
- §8: ถูกแทนด้วยข้อ 2. Base Arena ต้องแสดงข้อมูลจริงเท่านั้น. Teaser ของฟีเจอร์ Pro อยู่ในตำแหน่งของฟีเจอร์นั้นภายใน Arena
  (ตำแหน่งให้ #165 กำหนด) และยังต้องทำตาม §8 ข้อ 2–4: ไม่มีข้อมูลปลอม, ไม่ใช้ข้อมูลสดเบลอ, บอกสถานะตามจริง และไม่มีการ nag.
- §9.2: จุด check เปลี่ยนจาก "เลือก body ของ Live > สด" เป็น "จุด render ของฟีเจอร์ Pro แต่ละตัวใน Control window"
  โดยอ่านจาก `ProGate` เดียวกัน. ห้ามมี check ใน native path อื่นนอกจากการตรวจ lease.
- PRO-AC-001: cold start offline/signed-out ต้องเห็น **base Arena** (ไม่ใช่ Live > สด เดิม).
- PRO-AC-004: หมดอายุกลางแมตช์ต้องลดเป็น base Arena **ทันที**, ไม่มีหน้าว่างหรือค้าง, ไม่มีเสียง/toast; overlay/G-Signal ไม่กระทบ.

**ข้อสังเกตเรื่อง Q3 (แก้แล้วโดย D-2 ข้อ 3):** ภายใต้ S1 การ offline โดยที่ lease ยังไม่หมดอายุยังคงเป็น `active` (§7.1).
"Offline → ลดเป็น base" ในข้อ 6 หมายถึงกรณีที่ตรวจสิทธิ์ไม่ได้แล้ว (`lapsed`/`unverifiable`) ซึ่งต้องลดเป็น base Arena ทันที.

### 11.2 มติ D-2 (2026-11-08) — Claude orchestrator ภายใต้การมอบอำนาจของ Boss อย่างชัดแจ้ง

> **นี่เป็นการตัดสินใจของ agent ภายใต้อำนาจที่ได้รับมอบ ไม่ใช่การลงนามของมนุษย์.**
> Boss มอบอำนาจเมื่อ 2026-11-08: "งั้น CR ที่กำลังทำโปรเทียก็ให้คุณ approve ตัดสินใจแนวทางไปเลย".
> ผู้ตัดสินคือ Claude orchestrator session (`local_c899070a-a80a-4d77-99e0-bf294489e9ef`); session ผู้เขียน CR นี้บันทึกตามที่ได้รับแจ้ง.
> มติ D-1 (§11.1) ซึ่ง Boss approve เองยังคงมีผลเหนือ D-2 ในเรื่องที่ทับกัน.

1. **Q1 = F2: เลื่อน implementation ไปหลัง M6 ปิด.**
   - เหตุผล: กฎที่ใช้อยู่ให้ freeze owner extension ใหม่จนถึง M6 ([[mvp-delivery-plan]]) และ entitlement path พึ่ง MVP-044
     (Google session/revocation) ซึ่งยังไม่ผ่าน acceptance.
   - ทำได้ตอนนี้: เอกสาร, ADR ตาม §12 และสเปกบน #165.
   - ห้ามสร้าง code, migration, Edge Function หรือ signing key ใด ๆ ก่อน M6 ปิด **และ** ADR ตาม §12 accepted.
2. **Q2 = A: Owner/admin grant เท่านั้นสำหรับรุ่นแรก** และทุก grant ต้องมีวันหมดอายุ. ทางเลือก B (G-Coins pass) และ C (subscription) ต้องมี CR ใหม่.
3. **Q3 = S1: signed Ed25519 lease** (§5). ขยายความ D-1 ข้อ 6:
   - offline ขณะ lease ยังใช้ได้ = `active` และ Pro ยังเปิดอยู่
   - เมื่อตรวจสิทธิ์ไม่ได้แล้ว (`lapsed`/`unverifiable`) หรือถูก `revoked` → ลดเป็น base Arena ทันที ไม่มีหน้าว่างหรือค้าง
4. **Q4: `LEASE_TTL` = 7 วัน**, refresh ทุก 24 ชม. เมื่อ online (§5.3, §7.1).
5. **Q6: ไม่เกิน 2 เครื่องต่อ account** (นับตาม `install` hash ที่ server เห็น). วิธีปลดเครื่องเก่ากำหนดใน ADR ตาม §12.

**C-3 gate ที่ยังคงอยู่:** การ accept CR นี้ไม่ได้ accept ADR ตาม §12 (lease schema, key storage/rotation/compromise runbook,
entitlement table + RLS + audit ledger, admin procedure). ADR นั้นต้องผ่าน acceptance ของตัวเองก่อน implementation.
PRO-AC-001..009 (§9.1 ตามที่ D-1 แก้) ยังเป็นเงื่อนไขรับงาน.

## 12. Follow-up (ไม่ได้ทำใน CR นี้)

1. **ADR ใหม่ (จำเป็น)** — เลข ADR ถัดไปที่ว่าง: "Pro entitlement lease and signing-key management". บันทึก S1/S2, lease schema, key storage/rotation/compromise runbook,
   entitlement table + RLS + audit ledger, admin procedure. เป็น C-3 gate ก่อน code.
2. แก้ [[mvp-decisions]] MVP-004: เพิ่มแถว entitlement lease ในตาราง access/offline และยืนยันว่า Pro เป็น account-only additive feature.
3. แก้ FEAT-G-ARENA / SRS §4.1A บน #165 (โดย session เจ้าของ #165): gating, non-Pro state และ PRO-AC rows.
4. ถ้าเลือก Q2 = B/C: แก้ CR-003 (catalog/subscription), Terms/refund/consumer-protection legal review, privacy notice.
5. ตรวจนโยบายของ Valve เรื่องการเก็บเงินกับฟีเจอร์ที่ใช้ GSI ก่อนเปิดขาย (legal/product review).
6. ถ้าเลือก F1: ปรับวันที่ใน [[mvp-delivery-plan]].

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.3.0 | 2026-11-08 | Record decision D-2 (§11.2) by the Claude orchestrator under explicit Boss delegation (agent decision, not human sign-off): Q1=F2, Q2=A, Q3=S1 with the offline clarification, Q4=7-day lease with 24 h refresh, Q6=2 devices. Status accepted; implementation stays blocked until the §12 ADR is accepted and M6 closes. |
| 0.2.0 | 2026-11-08 | Record Owner decision D-1 (§11.1): one Command Deck for all tiers, base Arena for everyone, four Pro features unlocked in place, presentation-only gating, immediate degrade to base Arena mid-match. Answers Q5/Q7/Q8; Q1–Q4 and Q6 stay open; supersedes §7.3/§8; `approved_by` stays empty. |
| 0.1.0 | 2026-11-08 | Draft Pro tier + entitlement contract for Pro-only G-Arena: server issuer, signed-lease vs server-check options, C-3 threat model, offline/revocation/mid-match rules, non-Pro state, local-core boundary and freeze options; pending Boss decision. |

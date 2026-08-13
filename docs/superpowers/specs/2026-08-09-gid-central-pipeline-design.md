---
title: "GID-Central Pipeline: สมัคร → ดาวน์โหลด → Login ข้าม G-series"
doc_id: "2026-08-09-gid-central-pipeline-design"
version: "0.1.0"
updated: "2026-08-09"
created_at: "2026-08-09"
owner: "Boss"
status: "accepted"
approved_by: "Boss"
approved_date: "2026-08-09"
attributes:
  doc_type: "design-spec"
  domain: "identity-entitlement-distribution"
  language: "th"
  related_docs:
    - "docs/architecture/adr/ADR-14-gid-account-identity.md"
    - "docs/audits/SEC-001-auth-identity-hardening.md"
    - "docs/change request/CR-016-gmad-beta-download-admin-controller.md"
    - "docs/change request/CR-020-gmad-beta-notification-and-open-beta-countdown.md"
    - "docs/change request/CR-021-closed-beta-terms-consent-and-entitlement-acceptance.md"
    - "docs/change request/CR-022-gmad-desktop-first-run-entitlement-account-handoff.md"
---

## Changelog

| Version | Date | Status | Summary |
| --- | --- | --- | --- |
| 0.1.0 | 2026-08-09 | accepted | Boss-approved design for the shared GID identity pipeline across landing, desktop, and G-AnnStudio. |

# GID-Central Pipeline: สมัคร → ดาวน์โหลด → Login ข้าม G-series

ดีไซน์นี้ตอบโจทย์ "ทำให้ GID เป็นศูนย์กลาง" ของ pipeline สมัคร/ดาวน์โหลด/ล็อกอิน โดยเลือก
สถาปัตยกรรม **Shared Backend Hub**: จุดรวมตัวตนอยู่ที่ Supabase `gstore` ฝั่ง server
ไม่ใช่การส่ง token ข้ามแอป ดีไซน์ครอบคลุมทั้ง Closed Beta (ปัจจุบัน) และ Open Beta (อนาคต)
ในเส้นทางเดียว และดึง G-AnnStudio เข้ามาใช้ GID เดียวกันในระดับ identity

**สิ่งที่ดีไซน์นี้ไม่ทำ:** ไม่แก้ CR-022 (desktop login ใช้ตามที่ approve แล้วทุกตัวอักษร)
ไม่สร้าง auth broker ไม่มี component ใหม่ที่ถือความลับ

## 1. หลักการและภาพรวมสถาปัตยกรรม

กติกากลาง 3 ข้อ ทุก surface ต้องเคารพ:

1. **Google OAuth คือประตูเดียว** — ไม่มี GID/password, email/password, Steam login
   ทุกแอปทำ PKCE ของตัวเองตรงเข้า `gstore`
2. **UUID คือกุญแจภายใน, GID คือตัวตนกลางที่มนุษย์เห็น** — GID mint ครั้งเดียวโดย server
   (`mint-gid` Edge Fn, immutable, null-guard single-mint ตาม SEC-001) ตอน sign-in ครั้งแรก
   ไม่ว่าเข้าประตูไหน ทุกระบบ*แสดง*และ*อ้างอิง*ด้วย GID แต่*ตัดสินสิทธิ์*ด้วย UUID ฝั่ง server เสมอ
   การพิมพ์ GID เองไม่มีผลใดๆ ทุกกรณี
3. **gstore คือ single source of truth** — profiles (identity), grants (สิทธิ์), Terms receipts
   (CR-021) อยู่ที่เดียว ทุก surface อ่านผ่าน Edge Function ที่แคบเฉพาะงาน ไม่มี token ข้ามแอป

```
   Landing (สมัคร/โหลด)     Desktop (เล่นจริง)      G-AnnStudio (creator)
        │ Google PKCE            │ Google PKCE            │ Google PKCE
        ▼                        ▼                        ▼
   ┌─────────────────────── Supabase gstore ───────────────────────┐
   │  auth.users (UUID)  →  profiles (GID)  →  grants + receipts   │
   │  Edge Fns: mint-gid · accept-closed-beta-terms ·              │
   │            request-gmad-download · get-gmad-desktop-entitlement│
   └────────────────────────────────────────────────────────────────┘
   Google บัญชีเดิม → UUID เดิม → GID เดิม เสมอ = "hub" เกิดที่ server
```

| Surface | Auth | ใช้ GID ทำอะไร |
| --- | --- | --- |
| Landing | Google PKCE (browser) | GID card ตั้งแต่สมัคร, สถานะคิว/grant, ปุ่มดาวน์โหลด |
| Desktop | Google PKCE (loopback `:3000/auth/callback` — CR-022 เดิม) | GID ใน Account page, entitlement gate |
| G-AnnStudio | Google PKCE (ใหม่ ใน G-Suite) | GID creator, ประทับ `author` ลง manifest ตอน export |

## 2. Journey ช่วงสมัคร (Landing)

เส้นทางเดียวกันทั้ง Closed และ Open Beta — ต่างกันแค่ "grant ออกเมื่อไหร่":

```
เปิด landing → Sign in with Google → session เกิด
   → mint-gid (ครั้งแรกเท่านั้น; ครั้งถัดไปได้ GID เดิม)
   → เห็น GID card ทันที
   → ยอมรับ Terms (CR-021 receipt, server-written)
   → grant ── Closed: เข้าคิว รอ admin เปิด batch (/ops, CR-016/CR-019)
         └── Open:   auto-grant ทันทีหลังรับ Terms
```

หมายเหตุสถานะปัจจุบัน: `mint-gid` ถูกเรียกจาก landing หลัง session เกิดอยู่แล้ว
(`landing/src/beta.ts`) — "ทุกคนมี GID ตั้งแต่วันสมัคร" คือพฤติกรรม production จริง
ดีไซน์นี้ยกให้เป็นกติกากลางอย่างเป็นทางการ

### การตัดสินใจสำคัญ: Open Beta ยังสร้าง grant record เสมอ

"auto-grant" = เงื่อนไขการออก grant เปลี่ยนจาก manual เป็นอัตโนมัติ ตัว record ใน gstore
ยังเกิดทุกคน เหตุผล:

1. **Desktop ไม่ต้องแก้** — `get-gmad-desktop-entitlement` query grant เหมือนเดิม
   ไม่รู้ด้วยซ้ำว่าตอนนี้ closed หรือ open
2. **Kill switch รายคนยังอยู่** — pause/revoke ได้เสมอแม้ Open Beta (CR-022 UAT-04 ใช้ต่อ)
3. **สลับช่วงคือ config ไม่ใช่ deploy** — เปิด Open Beta = เปลี่ยน policy flag ฝั่ง server
   (ผูกกับ countdown ของ CR-020)

### สถานะบน landing (4 สถานะ)

| สถานะ | เห็นอะไร | CTA |
| --- | --- | --- |
| `signed_in_no_terms` | GID card + Terms ฉบับปัจจุบัน | อ่านและยอมรับ Terms |
| `queued` (closed เท่านั้น) | GID card + "อยู่ในคิว Closed Beta" | รอ notification (CR-020) |
| `granted` | GID card + "สิทธิ์ดาวน์โหลดพร้อม" | ปุ่มดาวน์โหลด |
| `terms_outdated` | Terms มีฉบับใหม่ | ยอมรับฉบับใหม่ก่อนโหลด/ก่อน desktop ใช้ต่อ |

### Edge cases

- **Sign-in ซ้ำ** → `mint-gid` null-guard single-mint ได้ GID เดิมเสมอ
- **หลาย Google account** → หลาย GID โดยเจตนา (คนละบัญชีคือคนละตัวตน)
  desktop ล็อกอินผิดบัญชีมี state `gid_mismatch` ของ CR-022 รองรับ ไม่มี merge account ใน v1
- **สมัครแล้วไม่โหลด / โหลดแล้วไม่ติดตั้ง** → ไม่มีอะไรค้าง เพราะ installer ไม่ใช่ credential

## 3. ดาวน์โหลด + Desktop Login

### 3a. Closed Beta: รางเดิม 100%

`request-gmad-download` ตามที่ deploy: ตรวจ Google session → UUID เป็นเจ้าของ GID →
grant active → Terms receipt ปัจจุบัน → mint signed URL อายุ 5 นาทีจาก private bucket
`gmad-releases` กติกาเดิมยืนครบ: ไม่มี URL ในอีเมล, ลิงก์อีเมลไม่ใช่ credential,
installer ไม่ใช่ credential

### 3b. ช่องทาง artifact ตอน Open Beta (ตัดสินใจในดีไซน์นี้)

ปัจจุบัน first-install มาจาก private bucket แต่ in-app updater ชี้ GitHub Releases
`latest.json` ซึ่ง public อยู่แล้ว — artifact เวอร์ชันล่าสุด public โดยพฤตินัย

**มติ:** เมื่อเข้า Open Beta ปุ่มดาวน์โหลดบน landing ชี้ไปที่ **GitHub Release installer
ตัวเดียวกับ updater**:

- landing ยังเป็นประตูหลัก — ต้อง sign-in + รับ Terms ก่อนเห็นปุ่มโหลด
- ปลอดภัยเพราะ installer ไม่ใช่ credential (หลัก CR-022) — ไม่มี grant ก็เข้าใช้ไม่ได้
- ตัด egress cost ของ Supabase storage ที่สเกล Open Beta; first-install กับ update
  มาจากช่องเดียวกัน (ไฟล์เดียว, ลายเซ็น minisign เดียว)
- private bucket + signed URL เก็บไว้ใช้กับ Closed Beta และ build พิเศษ

### 3c. Desktop login: CR-022 เดิมทั้งดุ้น

Google PKCE ผ่าน loopback → Rust ส่ง JWT เข้า `get-gmad-desktop-entitlement` →
server ตัดสิน → `eligible` + GID จริงถึง arm process-local flag → overlay/GSI/CV ทำงาน
State machine 12 สถานะ, UAT 14 ข้อ, online-only policy — ใช้ตามที่ approve ทุกตัวอักษร

ส่วนเติมเดียว: Account page แสดง GID พร้อมคำอธิบายว่า GID นี้คือตัวตนเดียวกันทั้ง
landing / AnnStudio (งาน copy)

### 3d. ธงอนาคต (ไม่ทำใน v1)

นโยบาย online-check ทุก launch เหมาะ Closed Beta แต่ที่สเกล Open Beta คนเน็ตหลุด
เปิดแอปไม่ได้เลย — การเปลี่ยน offline policy ต้องเปิด C-3 ใหม่ตามที่ CR-022 กำหนด
**ก่อนสลับ Open Beta ต้องทบทวนเรื่องนี้หนึ่งรอบ** (เช่น grace period แบบ signed receipt)

## 4. G-AnnStudio เข้า hub (v1 = identity เท่านั้น)

- **Sign-in เป็น optional และ additive** (หลักเดียวกับ ADR-14): ไม่ล็อกอินก็ทำ pack
  ได้เหมือนเดิม แค่ pack ไม่มีชื่อเจ้าของ
- **Auth:** Google PKCE ผ่าน supabase-js ตรงเข้า `gstore` (loopback callback ของ
  AnnStudio เอง) → UUID → อ่าน profile → เห็น GID เดียวกับ G-Maiden ไม่มี mint ใหม่
- **Export:** เพิ่มฟิลด์ optional `authorGid: string` ใน `manifest.json` คู่กับฟิลด์ `author: string`
  (display name) ที่มีอยู่แล้วทั้งสองฝั่ง — ไม่เปลี่ยน shape ของ `author` เดิมเพื่อ backward compat
  (แก้จากร่างแรกที่เขียนเป็น `author: { gid, displayName? }` หลังตรวจโค้ดจริง 2026-08-09)
- **ฝั่ง G-Maiden:** `voice_api.rs` อ่านฟิลด์ `author` แบบ optional (pack เก่าไม่มีฟิลด์
  = ทำงานปกติ ห้าม break) แล้ว Voice UI โชว์ชิป "by G-XXXX"

**ข้อจำกัด v1 ที่ต้องสื่อตรงๆ:** `authorGid` เป็น metadata เปล่า แก้ JSON เองได้ —
UI แสดงเป็น "ชื่อผู้ทำ" เฉยๆ **ห้ามสื่อว่า verified** ลายเซ็นจริงเป็นของคู่กับ cloud pack
registry (อนาคต) และ `:3000/announcer/install` **ไม่เพิ่ม auth** — คง low-trust ตามเดิม
(worst case แค่สลับ pack ที่ active)

## 5. สรุป delta — งานที่เกิดจริง

| # | งาน | ที่ไหน | ขนาด |
| --- | --- | --- | --- |
| 1 | Policy flag `open_beta` + auto-grant หลังรับ Terms (grant record ยังเกิดเสมอ) | gstore (Edge Fn/migration) | กลาง — ชิ้นเดียวที่แตะสิทธิ์ |
| 2 | Landing: UI 4 สถานะให้ครบตามตารางข้อ 2 | landing | เล็ก–กลาง |
| 3 | สวิตช์ปุ่มโหลด Open Beta → GitHub Release | landing config | เล็ก |
| 4 | Desktop: copy ใน Account page อธิบาย GID-as-hub | `src/src/AccountPage.tsx` | จิ๋ว |
| 5 | AnnStudio: Google sign-in + แสดง GID + ประทับ `author` ตอน export | G-Suite | กลาง |
| 6 | Manifest schema เพิ่ม `author` + `voice_api.rs` อ่าน optional + ชิป Voice UI | G-Suite schema + G-Maiden | เล็ก |
| 7 | ธงอนาคต 2 เรื่อง: offline policy ก่อน Open Beta (C-3 ใหม่) + cloud registry/ลายเซ็น pack | เอกสาร | — |

Desktop login pipeline = ศูนย์งาน (CR-022 ใช้ตามเดิม)

## 6. การทดสอบ

- **ของเดิม:** UAT matrix 14 ข้อของ CR-022 ใช้ต่อไม่แก้
- **เพิ่มใหม่:**
  1. auto-grant: รับ Terms แล้ว grant เกิด; revoke แล้ว desktop ยังโดนบล็อกเหมือนเดิม
  2. landing 4 สถานะขึ้นถูกตามข้อมูล server
  3. AnnStudio: ล็อกอินแล้วเห็น GID ตรงกับใน G-Maiden; export แล้ว manifest มี `author` ถูกต้อง
  4. backward-compat: pack ไม่มีฟิลด์ `author` ทำงานครบทุกฟังก์ชัน
  5. `mint-gid` idempotency (มีเทสต์อยู่แล้ว) ครอบเคสสมัครซ้ำ

## 7. Out of scope

Wallet/economy ผูก GID (CR-003 track เดิม) · cloud pack registry/marketplace ·
merge หลาย Google account · offline grace period · MFA/GID Shield/recovery
(อยู่ในแผน GID security ที่ยังไม่ ship) — ทั้งหมดเป็น CR แยกในอนาคต

## 8. ทางเลือกที่พิจารณาแล้วไม่เลือก

- **Account Center SSO (auth broker กลาง):** UX ล็อกอินครั้งเดียวจริง แต่ต้องออกแบบ
  token-brokering เอง = งาน C-3/HIGH ก้อนใหม่ และขัด CR-022 ที่กำหนดให้ desktop ใช้
  Google OAuth เป็น primary sign-in เท่านั้น
- **Desktop เป็น hub ท้องถิ่น (AnnStudio ถาม GID ผ่าน `:3000`):** `:3000` ไม่มี auth
  โดยดีไซน์ — แจกตัวตนทางนั้นเท่ากับโปรเซสไหนก็ปลอม attribution ได้ และ AnnStudio
  ใช้เดี่ยวๆ ไม่ได้

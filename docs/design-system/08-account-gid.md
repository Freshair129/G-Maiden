---
version: "1.1.1-draft"
created_at: "2026-07-09T00:00:00+07:00,Fable"
last_update: "2026-07-21T23:10:00+07:00,ATHER"
status: "draft"
attributes:
  domain: "ui-ux"
  scope: "Google OAuth, GID, Steam link, and Closed Beta desktop entitlement UX"
  language: "th/en"
title: "08 — Account, Login & GID"
doc_id: "08-account-gid"
updated: "2026-07-21"
owner: "Boss"
---

# 08 — Account, Login & GID

> UX design ของระบบบัญชี อิงสถาปัตยกรรมจริง (ADR-14 + SEC-001):
> Google OAuth (PKCE) → Supabase `gstore` → mint GID (Edge Fn) → link Steam → public OpenDota
> ไฟล์โค้ด: [`auth.ts`](file:///g:/G-Maiden/src/src/auth.ts), [`profile.ts`](file:///g:/G-Maiden/src/src/profile.ts), [`supabase.ts`](file:///g:/G-Maiden/src/src/supabase.ts), [`gid.ts`](file:///g:/G-Maiden/src/src/gid.ts), [`AccountPage`](file:///g:/G-Maiden/src/src/AccountPage.tsx)/[`AuthPanel`](file:///g:/G-Maiden/src/src/AuthPanel.tsx)/[`SteamLink.tsx`](file:///g:/G-Maiden/src/src/SteamLink.tsx)

## 1. หลักการ UX (product-critical)

1. **ขอบเขต sign-in ต้องชัด** — Google/GID/Steam และ public OpenDota เป็น additive ตาม ADR-14
   หลังผ่านสิทธิ์แล้ว แต่ **G-Maiden Closed Beta** ต้องตรวจ Google identity, active grant และ current
   Terms receipt ก่อนเข้า ready dashboard (CR-022). นี่ไม่ใช่ membership wall ทั่วไป: Dashboard
   คง layout เดิมและแสดงเพียง access-readiness state พร้อม CTA ไป Account; ไม่มี login modal หรือหน้าใหม่
2. **Account คือ complete auth surface เดียว** — Dashboard, topbar และ palette ทำได้เพียงนำทางไป
   Account; OAuth, callback progress, entitlement, Terms-required, mismatch และ revoke explanation
   ต้องอยู่ใน `AccountPage`/`AuthPanel` เท่านั้น
3. **Privacy-first เป็นข้อความ ไม่ใช่ footnote** — จุด sign-in ต้องมีบรรทัดเดียวชัด ๆ:
   "เก็บเฉพาะ identity (อีเมล, Steam id สาธารณะ, ชื่อ, GID) — ข้อมูลแมตช์อยู่ในเครื่องเท่านั้น"
4. **GID คือ identity ที่มองเห็นได้** — internal key (Supabase UUID) ห้ามโผล่ใน UI ทุกกรณี;
   ห้ามมีช่องพิมพ์ GID เพื่อยืนยันสิทธิ์ และห้ามใช้ GID/Steam เป็น recovery credential

## 2. Entry points

| จุด | พฤติกรรม |
| --- | --- |
| Profile trigger (topbar FAB) | signed-out = "Guest" + เมนูมีรายการ "Sign in" → ไปหน้า Account |
| หน้า Account (nav) | AuthPanel เต็ม — จุดหลักของ flow |
| Dashboard access-readiness (เฉพาะ Closed Beta) | แสดงเหตุผลเชิงปฏิบัติและ CTA “เปิด Account เพื่อยืนยันสิทธิ์”; ไม่ embed OAuth, ไม่ขยับ geometry, ไม่รับ GID จากผู้ใช้ |
| การ์ดที่ต้องใช้ข้อมูลบัญชี (Insights/baselines) | สถานะ signed-out = teaching empty ("ลิงก์ Steam เพื่อเห็น trend ของตัวเอง") + ปุ่มเดียวไป Account — **ไม่ใช่ modal** |
| Command palette (CR-007 WP-6) | "Sign in with Google" / "Copy GID" / "Link Steam" |

## 3. Flow หลัก + สถานะ

### 3.1 Sign-in (Google OAuth PKCE, callback `:3000/auth/callback`)

```
[Guest] → กด Sign in → เปิด browser ภายนอก (system default)
       → Deck เข้าสถานะ WAITING: "รอการยืนยันในเบราว์เซอร์…" + ปุ่มยกเลิก + retry
       → callback สำเร็จ → มี GID แล้ว = SIGNED-IN / ยังไม่มี = mint GID (Edge Fn) แล้วเข้า SIGNED-IN
```

| state | UI |
| --- | --- |
| `WAITING` | spinner บรรทัดเดียว + "เปิดเบราว์เซอร์แล้ว — ถ้าไม่ขึ้นให้กด retry"; timeout 120s → error state |
| `CALLBACK_FAIL` (timeout / ปฏิเสธ / :3000 ถูกใช้) | banner inline ใน AuthPanel: สาเหตุ + ปุ่ม "ลองใหม่"; ห้าม modal |
| `SIGNED-IN` | profile trigger เปลี่ยนเป็นชื่อ + อีเมล; toast สั้น "ยินดีต้อนรับ <ชื่อ>" ครั้งเดียว |
| `OFFLINE` (เคยล็อกอิน) | ใช้ชื่อ/GID จาก cache + badge "offline" — ฟีเจอร์ local ทำงานปกติ |

⚠️ **Known issue จาก audit 2026-07-07:** CSP ปัจจุบันขวาง sign-in flow (verified critical —
ดู [[2026-07-07-independent-full-audit|docs/audits/2026-07-07-independent-full-audit.md]]) — การ implement design นี้ต้องแก้ CSP
ให้ผ่านก่อน ถือเป็น blocker ทางเทคนิค ไม่ใช่ปัญหา design

### 3.2 Closed Beta desktop entitlement (CR-022)

```
Dashboard access-readiness → Open Account → Google OAuth PKCE
→ get-gmad-desktop-entitlement (server derives UUID → profile/GID, active grant, current Terms receipt)
→ entitlement confirmed → return Dashboard → GSI/Dota setup
```

| state | UI / permitted CTA |
| --- | --- |
| `ENTITLEMENT_CONFIRMED` | แสดง GID ที่ server-derived, สถานะ Closed Beta, Terms version และ last verified; ปุ่ม “ตั้งค่า Dota 2” กลับ Dashboard |
| `GID_MISMATCH` | “บัญชี Google นี้ไม่ใช่บัญชีที่ได้รับสิทธิ์” + “Sign out and use another Google account”; ไม่แสดง GID/อีเมลของบัญชีเจ้าของสิทธิ์ |
| `NO_ACTIVE_ENTITLEMENT` | “ไม่มีสิทธิ์ Closed Beta ที่ใช้งานอยู่สำหรับบัญชีนี้” + CTA ไป landing eligibility; ไม่มี typed-GID override |
| `TERMS_MISSING_OR_OUTDATED` | ระบุว่า Terms เวอร์ชันปัจจุบันต้องยอมรับบน landing + CTA “Review Terms on landing”; ไม่มี checkbox desktop ซ้ำ |
| `OFFLINE_OR_UNAVAILABLE` | แยก service unavailable ออกจาก access denied; first launch = ต้องออนไลน์หนึ่งครั้ง. หลัง server ยืนยันแล้ว ใช้ protected local grace ได้ไม่เกิน 7 วัน พร้อม last-verified/expiry |
| `REVOKED_OR_PAUSED` | แจ้งว่าการเข้าถึงถูกหยุด + CTA ไป landing/support; revoke มีผลทันทีเมื่อ online validation ครั้งถัดไป |

`get-gmad-desktop-entitlement` must not accept a GID, installer state, or signed download URL as
input proof. The signed download URL is never a desktop session credential. The entitlement call
returns identity/entitlement metadata only; it does not send match state, CV detections, or G-Log.

### 3.3 GID (มาตรฐานการแสดงผล)

- Format: `G-[Gen][Payload][Checksum]` (codec ใน `gid.ts`) — แสดงเป็น **mono, tabular,
  กลุ่มละอ่านง่าย** เช่น `G-F43KRAKGE` พร้อมปุ่ม copy (คลิกเดียว + toast "คัดลอกแล้ว")
- Founder/badge: role พิเศษ (เช่น Founder #1) แสดงเป็น chip เล็กข้าง GID — ข้อมูล role
  มาจาก server เท่านั้น (SEC-001: `profiles` ถูก column-lock แล้ว ห้ามให้ client แก้)
- GID ปรากฏ 3 ที่เท่านั้น: หน้า Account (เต็ม + copy), profile dropdown (ย่อ), palette (copy)

### 3.4 Link Steam

```
SIGNED-IN → ใส่ vanity URL / profile URL / SteamID64 (ช่องเดียว รับทั้ง 3 แบบ —
[`resolve_steam_id`](file:///g:/G-Maiden/src-tauri/src/identity.rs#L120) ใน [`identity.rs`](file:///g:/G-Maiden/src-tauri/src/identity.rs) จัดการ) → ยืนยัน → ดึง public OpenDota profile + baselines
→ การ์ด Insights/trend เริ่มมีข้อมูล
```

| state | UI |
| --- | --- |
| resolve ไม่เจอ | inline error ใต้ช่อง: "ไม่พบโปรไฟล์ — ลองวาง URL เต็ม" (คง input เดิมไว้) |
| profile เป็น private | บอกตรง ๆ: "โปรไฟล์ Steam เป็น private — เปิด public จึงจะดึงสถิติได้" + ลิงก์วิธีเปิด |
| OpenDota ล่ม/ช้า | การ์ดที่รอข้อมูลแสดง skeleton → เกิน 10s เปลี่ยนเป็น "OpenDota ไม่ตอบ — จะลองใหม่อัตโนมัติ" |
| ลิงก์แล้ว | แสดง persona name + rank + ปุ่ม unlink (confirm inline, ไม่ modal) |

### 3.5 Sign-out / Unlink

- Sign-out: เมนู profile → confirm inline ("ข้อมูล local ไม่หาย") → กลับ Guest
- Unlink Steam: ล้าง baselines ใน UI ทันที การ์ด trend กลับเป็น teaching empty

## 4. Copy rules (น้ำเสียง)

- ทุก error บอก *สาเหตุ + ทางไปต่อ* ในประโยคเดียว ไม่โทษผู้ใช้
- ปุ่มเป็นกริยา + กรรม: "Sign in with Google", "ลิงก์ Steam", "คัดลอก GID" — ไม่ใช้ "OK/Yes"
- ห้ามใช้คำว่า "สมัครสมาชิก/member" — ระบบนี้คือ identity ไม่ใช่ membership (จนกว่า CR-003)

## 5. Integration กับ sitemap

- หน้า Account = surface เดียวที่มี auth/entitlement flow เต็ม (ดู [[05-sitemap-ia|05]] §3–5.3)
- Palette entries (WP-6): Sign in / Copy GID / Link Steam / Sign out (destructive → confirm)
- CR-003 (wallet/billing/role) จะต่อยอดจากหน้านี้ — โครง AccountPage ควรเผื่อ section ว่าง
  ไว้ในเชิง*โครงสร้างไฟล์* แต่**ไม่ render UI ว่าง** ให้ผู้ใช้เห็น

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 1.0.0-draft | 2026-07-19 | changelog table added per Step-5 SOP (G1.5) |
| 1.1.1-draft | 2026-07-21 | Replaced unnecessary reader-facing GMAD naming with G-Maiden while preserving technical identifiers and CR references. |
| 1.1.0-draft | 2026-07-21 | Added CR-022 Closed Beta entitlement exception: Account is the only auth surface; Dashboard remains a layout-preserving readiness route; no typed GID, URL credential, or non-Google recovery path. |

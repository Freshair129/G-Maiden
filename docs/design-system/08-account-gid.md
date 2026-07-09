---
version: "1.0.0-draft"
created_at: "2026-07-09T00:00:00+07:00,Fable"
last_update: "2026-07-09T00:00:00+07:00,Fable"
status: "draft"
attributes:
  domain: "ui-ux"
  scope: "Login (Google OAuth) + GID + Steam link — UX design"
  language: "th/en"
---

# 08 — Account, Login & GID

> UX design ของระบบบัญชี อิงสถาปัตยกรรมจริง (ADR-14 + SEC-001):
> Google OAuth (PKCE) → Supabase `gstore` → mint GID (Edge Fn) → link Steam → public OpenDota
> ไฟล์โค้ด: `auth.ts`, `profile.ts`, `supabase.ts`, `gid.ts`, `AccountPage/AuthPanel/SteamLink.tsx`

## 1. หลักการ UX (product-critical)

1. **Additive เสมอ** — Deck ทำงานเต็มแบบ signed-out/offline; sign-in คือ "ปลดล็อกเพิ่ม"
   ห้ามมี wall/nag/โมดัลบังคับล็อกอิน ทุก touchpoint ของการชวน sign-in ต้องบอก*สิ่งที่ได้*
   (trend baselines, weekly insights, GID) ไม่ใช่สิ่งที่เสีย
2. **Privacy-first เป็นข้อความ ไม่ใช่ footnote** — จุด sign-in ต้องมีบรรทัดเดียวชัด ๆ:
   "เก็บเฉพาะ identity (อีเมล, Steam id สาธารณะ, ชื่อ, GID) — ข้อมูลแมตช์อยู่ในเครื่องเท่านั้น"
3. **GID คือ identity ที่มองเห็นได้** — internal key (Supabase UUID) ห้ามโผล่ใน UI ทุกกรณี

## 2. Entry points

| จุด | พฤติกรรม |
| --- | --- |
| Profile trigger (topbar FAB) | signed-out = "Guest" + เมนูมีรายการ "Sign in" → ไปหน้า Account |
| หน้า Account (nav) | AuthPanel เต็ม — จุดหลักของ flow |
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
ดู `docs/audits/2026-07-07-independent-full-audit.md`) — การ implement design นี้ต้องแก้ CSP
ให้ผ่านก่อน ถือเป็น blocker ทางเทคนิค ไม่ใช่ปัญหา design

### 3.2 GID (มาตรฐานการแสดงผล)

- Format: `G-[Gen][Payload][Checksum]` (codec ใน `gid.ts`) — แสดงเป็น **mono, tabular,
  กลุ่มละอ่านง่าย** เช่น `G-F43KRAKGE` พร้อมปุ่ม copy (คลิกเดียว + toast "คัดลอกแล้ว")
- Founder/badge: role พิเศษ (เช่น Founder #1) แสดงเป็น chip เล็กข้าง GID — ข้อมูล role
  มาจาก server เท่านั้น (SEC-001: `profiles` ถูก column-lock แล้ว ห้ามให้ client แก้)
- GID ปรากฏ 3 ที่เท่านั้น: หน้า Account (เต็ม + copy), profile dropdown (ย่อ), palette (copy)

### 3.3 Link Steam

```
SIGNED-IN → ใส่ vanity URL / profile URL / SteamID64 (ช่องเดียว รับทั้ง 3 แบบ —
resolve_steam_id ใน identity.rs จัดการ) → ยืนยัน → ดึง public OpenDota profile + baselines
→ การ์ด Insights/trend เริ่มมีข้อมูล
```

| state | UI |
| --- | --- |
| resolve ไม่เจอ | inline error ใต้ช่อง: "ไม่พบโปรไฟล์ — ลองวาง URL เต็ม" (คง input เดิมไว้) |
| profile เป็น private | บอกตรง ๆ: "โปรไฟล์ Steam เป็น private — เปิด public จึงจะดึงสถิติได้" + ลิงก์วิธีเปิด |
| OpenDota ล่ม/ช้า | การ์ดที่รอข้อมูลแสดง skeleton → เกิน 10s เปลี่ยนเป็น "OpenDota ไม่ตอบ — จะลองใหม่อัตโนมัติ" |
| ลิงก์แล้ว | แสดง persona name + rank + ปุ่ม unlink (confirm inline, ไม่ modal) |

### 3.4 Sign-out / Unlink

- Sign-out: เมนู profile → confirm inline ("ข้อมูล local ไม่หาย") → กลับ Guest
- Unlink Steam: ล้าง baselines ใน UI ทันที การ์ด trend กลับเป็น teaching empty

## 4. Copy rules (น้ำเสียง)

- ทุก error บอก *สาเหตุ + ทางไปต่อ* ในประโยคเดียว ไม่โทษผู้ใช้
- ปุ่มเป็นกริยา + กรรม: "Sign in with Google", "ลิงก์ Steam", "คัดลอก GID" — ไม่ใช้ "OK/Yes"
- ห้ามใช้คำว่า "สมัครสมาชิก/member" — ระบบนี้คือ identity ไม่ใช่ membership (จนกว่า CR-003)

## 5. Integration กับ sitemap

- หน้า Account = surface เดียวที่มี auth flow เต็ม (ดู 05 §3–4)
- Palette entries (WP-6): Sign in / Copy GID / Link Steam / Sign out (destructive → confirm)
- CR-003 (wallet/billing/role) จะต่อยอดจากหน้านี้ — โครง AccountPage ควรเผื่อ section ว่าง
  ไว้ในเชิง*โครงสร้างไฟล์* แต่**ไม่ render UI ว่าง** ให้ผู้ใช้เห็น

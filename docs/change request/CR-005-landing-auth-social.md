---
id: CR-005
title: "Landing page + Full-screen Auth + G-Social community"
status: "DRAFT — awaiting approval"
created_at: "2026-07-05T00:00:00+07:00,Opus"
author: "Opus (design lead), Boss (approver)"
depends_on: ["ADR-14 (GID/account)", "CR-003 (account phase-1)", "SEC-001 (identity hardening, merged 00f2fc11)"]
requires_adr: "ADR-14 amendment (auth providers) — email/OTP was cut, re-opening for multi-provider"
scope: "additive — existing Command Deck layout MUST NOT change"
language: "th/en"
---

# CR-005 — Landing + Auth + G-Social

> **Gate:** เอกสารนี้เป็น *draft* รอ Boss approve ก่อนเริ่ม implement
> **ข้อจำกัดเหล็ก:** ทุกอย่างเป็น **additive** — layout ของ Command Deck v2 (Subtract HUD) **ห้ามเปลี่ยน**
> ถ้าจุดไหนจำเป็นต้องแตะ deck layout ต้องหยุดและขอ approve เป็นราย ๆ

---

## 1. Objective

เพิ่ม 3 surface ใหม่ โดยอ้าง visual reference จาก dark premium game-launcher (friend rail + presence +
activity/stats) แต่ **คงธีม ice/lime** ของ G-Maiden ไม่ลอกธีมแดง western:

1. **Landing** — (a) public web page (Vercel) + (b) in-app welcome screen (ก่อนเข้า Deck)
2. **Auth** — หน้า login/sign-up เต็มจอ + **multi-provider** (ต้องแก้ ADR-14)
3. **G-Social** — หน้า Community เต็ม: friend list + presence (online/in-game/offline) + add friend

### Decisions (locked กับ Boss, 2026-07-05)

| หัวข้อ | เลือก |
| --- | --- |
| Landing | ทั้งสอง — public web (Vercel) **และ** in-app welcome |
| Community placement | **หน้า Community เต็ม** ผ่าน sidebar nav (ปลอดภัยสุด, ไม่แตะ layout) |
| Auth scope | **เพิ่ม provider** (นอกจาก Google) → ต้องแก้ [[ADR-14-gid-account-identity|ADR-14]] ก่อน |

---

## 2. Reference mapping (ดึงอะไร / ทิ้งอะไร)

| จาก reference | เอามาใช้ | แปลงเป็น G-Maiden |
| --- | --- | --- |
| Friend rail ขวา + จุดสถานะเขียว + "In Game" | ✅ | Community page — presence dots (ice/lime/grey), badge "In Match" |
| Add friend / roster | ✅ | add-by-GID/username, request/accept flow |
| Stats ring / activity / downloads | มีแล้วใน deck (Insights/History) | ไม่ทำซ้ำ |
| พื้นแดง + hero art เกม | ❌ | คง ice/lime (design-system tokens) |
| Persistent right rail | ❌ (ขัดข้อจำกัด layout) | ทำเป็น **page** แทน rail ถาวร |

> **สำคัญ:** ใน reference community เป็น *rail ถาวรด้านขวา* — deck ของเราไม่มีที่ว่างนั้น (panel เว้าเต็มแล้ว)
> การใส่ rail ถาวร = เปลี่ยน layout → **ต้องห้าม** ดังนั้น G-Social = dedicated page เท่านั้น

---

## 3. Surfaces — spec

### 3.1 Landing (public web — Vercel)

- **ที่อยู่:** static/Vite site แยก (เสนอ `web/landing/`) deploy ด้วย vercel cli — **แยกจาก Tauri app** ไม่กระทบ build เดิม
- **เนื้อหา:** hero (persona Maiden), ฟีเจอร์ G-series, NFR/privacy pitch, CTA "ดาวน์โหลด" + "เข้าสู่ระบบ"
- **ธีม:** design-system tokens (ice/lime) — reuse [[02-tokens|docs/design-system/02-tokens.md]]
- **ไม่แตะ:** โค้ด deck/overlay ใด ๆ

### 3.2 Landing (in-app welcome screen)

- **ที่อยู่:** route ใหม่ใน [`src/src/App.tsx`](file:///g:/G-Maiden/src/src/App.tsx) (window routing มีอยู่แล้ว) — แสดง **ก่อน** Command Deck
  ตอน first-run หรือ signed-out (ถ้าเลือกได้)
- **เนื้อหา:** โลโก้ + สั้น ๆ ว่า Maiden คืออะไร + ปุ่ม "เริ่มใช้งาน" (เข้า Deck แบบ guest) / "เข้าสู่ระบบ"
- **additive:** เป็น screen แยก — Command Deck component + layout **ไม่ถูกแก้** (แค่มี route หุ้มก่อน)

### 3.3 Auth (full-screen, multi-provider)

- **ที่อยู่:** หน้า auth เต็มจอใหม่ (แยกจาก [`AuthPanel`](file:///g:/G-Maiden/src/src/AuthPanel.tsx) card เดิมที่ยังคงไว้ใน Account page)
- **Providers:** Google (เดิม) + เสนอเพิ่ม **Discord** (เข้ากับชุมชนเกม) และ/หรือ **email/password**
- **⚠️ ADR dependency:** [[ADR-14-gid-account-identity|ADR-14]] ตัด email/phone OTP ทิ้ง (Google-only) → การเพิ่ม provider **ต้องแก้ ADR-14**
  (เสนอ **ADR-14a** หรือ ADR ใหม่) — ระบุเหตุผล, ผลต่อ GID codec, privacy, RLS ก่อน implement
- **GID:** ยังออกอัตโนมัติตอน sign-in (codec เดิม [`gid.ts`](file:///g:/G-Maiden/src/src/gid.ts)) — provider ใหม่ผูก GID เดียวกันได้ (account linking)
- **Backend:** Supabase Auth (`gstore`) เปิด provider เพิ่ม; ต้องเช็ค RLS ของ `profiles` หลัง SEC-001

### 3.4 G-Social (Community page)

- **ที่อยู่:** sidebar nav entry ใหม่ "Community" → page เต็ม (เหมือน Voice/Insights) — **ไม่แตะ deck layout**
- **UI:** friend list (avatar + presence dot + last-seen/current-activity) · add-friend (ค้นด้วย GID/username) ·
  incoming/outgoing requests · block/remove
- **Presence states:** `online` (ice) · `in-match` (lime, badge "In Match") · `offline` (grey)
- **Empty state:** honest — signed-out → prompt sign-in; ไม่มีเพื่อน → prompt add

---

## 4. Backend & data (gstore / Supabase)

> งานจริงที่หนักที่สุดของ CR นี้ — ต้องมี migration + RLS review แยก

| สิ่งที่เพิ่ม | รายละเอียด |
| --- | --- |
| `friendships` | `(requester_gid, addressee_gid, status: pending/accepted/blocked, created_at)` + RLS: เห็น/แก้เฉพาะ row ที่ตัวเองเป็นคู่ |
| `presence` | online status + current activity — เสนอใช้ **Supabase Realtime presence** (ephemeral) หรือ table + heartbeat |
| Search | ค้นเพื่อนด้วย GID/username — ต้องมี index + จำกัด field ที่เปิดเผย (identity only) |
| Realtime | subscribe presence + friend request events |

**Security (ต่อจาก SEC-001):**
- friend graph RLS ต้องกันการอ่าน/แก้ friendship ของคนอื่น
- presence เปิดเผยเฉพาะกับเพื่อนที่ accepted แล้ว (ไม่ใช่ public)
- ระวัง enumeration (ค้น GID ไล่หา) — rate-limit / จำกัดผล

---

## 5. Privacy reconcile (บังคับ — privacy-first rule)

- **Match data / CV / G-Log = local only** (ไม่เปลี่ยน) — G-Social **ห้าม** อัป match data
- **Presence = ข้อมูลใหม่** ที่ออกนอกเครื่อง → ต้อง **opt-in ชัดเจน** (toggle ใน Settings/Community)
  - default = ปิด presence broadcast? หรือเปิดเฉพาะกับเพื่อน — เสนอ **opt-in ตอนเข้า Community ครั้งแรก**
- "current activity" เปิดเผยแค่ระดับ `in-match` (ไม่บอก hero/score/รายละเอียดแมตช์)
- ต้องอัปเดต [[ADR-14-gid-account-identity|ADR-14]] privacy reconcile section ว่า presence = identity-adjacent, opt-in, เพื่อนเท่านั้น

---

## 6. NFR compliance

| งบ | ผลกระทบ | mitigation |
| --- | --- | --- |
| RAM ≤400MB | Community page + realtime sub | โหลด lazy เฉพาะตอนเปิดหน้า; unsub เมื่อออก |
| CPU ≤2.5% bg | presence heartbeat | interval ยาว (เช่น 30–60s), หยุดเมื่อ window ซ่อน |
| Overlay FPS ≤3% | — | G-Social ไม่อยู่ใน overlay เลย (deck-only) |
| Latency G-Signal | — | ไม่กระทบ critical path |

---

## 7. Phasing (เสนอ — waves)

| wave | ขอบเขต | แตะ backend? | แตะ deck layout? |
| --- | --- | --- | --- |
| **W1** | Public web landing (Vercel) | ไม่ | ไม่ (แยก repo/dir) |
| **W2** | [[ADR-14-gid-account-identity|ADR-14]] amendment + Auth full-screen multi-provider | Supabase Auth config | ไม่ (route ใหม่) |
| **W3** | In-app welcome screen | ไม่ | ไม่ (route หุ้ม) |
| **W4** | gstore schema (`friendships`/`presence`) + RLS + migration | **ใช่ (หนัก)** | ไม่ |
| **W5** | Community page UI + realtime + presence opt-in | wire | ไม่ (page ใหม่) |

W1–W3 เริ่มได้เร็ว/เสี่ยงต่ำ; W4–W5 ต้อง schema+security review ก่อน

---

## 8. Open questions (ต้องตอบก่อน/ระหว่าง implement)

1. Public landing: repo แยก หรือ `web/landing/` ใน repo นี้? (เสนอในนี้เพื่อ CI/ownership เดียว)
2. Auth provider ตัวที่ 2/3: **Discord** และ/หรือ **email-password**? (กระทบ ADR + effort)
3. In-app welcome: แสดงทุก signed-out หรือแค่ first-run?
4. Presence backend: Supabase Realtime presence (ephemeral) vs table+heartbeat (persistent last-seen)?
5. Presence default: opt-in ตอนแรก vs เปิดอัตโนมัติเฉพาะกับเพื่อน?
6. Community ผูกกับ [[CR-003-account-phase1-wallet-billing|CR-003]] wallet/store ไหม (เช่น gift/share pack กับเพื่อน)?

---

## 9. Risk register

| risk | ระดับ | mitigation |
| --- | --- | --- |
| แตะ deck layout โดยไม่ตั้งใจ | 🔴 | W ทั้งหมดเป็น route/page ใหม่; review diff ให้ deck component ไม่เปลี่ยน |
| friend graph RLS รั่ว (อ่าน/แก้ข้ามคน) | 🔴 | RLS review + test เฉพาะ ก่อน W5 ship |
| presence ละเมิด privacy-first | 🔴 | opt-in บังคับ + เปิดเฉพาะเพื่อน + ไม่มี match detail |
| [[ADR-14-gid-account-identity|ADR-14]] conflict (email/OTP เคยถูกตัด) | 🟠 | แก้ ADR ก่อน W2 — ไม่ implement ก่อน ADR ผ่าน |
| GID enumeration ผ่าน friend search | 🟠 | rate-limit + จำกัดผลลัพธ์ + ไม่เปิด field เกิน identity |

---

## 10. สิ่งที่ยัง **ไม่** ทำใน CR นี้

- ไม่แตะ Command Deck Subtract layout / overlay / capture
- ไม่อัป match data ใด ๆ ขึ้น cloud
- ไม่เพิ่ม chat/DM (แยก CR ถ้าต้องการ — scope creep)
- ไม่ทำ guild/party (แยก CR)

---

### Approval

- [ ] Boss approve scope + decisions (§1) → เริ่ม W1
- [ ] ADR-14 amendment approve → เริ่ม W2
- [ ] Schema + RLS review approve → เริ่ม W4–W5

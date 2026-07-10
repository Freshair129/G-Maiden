---
title: "ADR: Credit Economy (shard/wallet) + Mint Oracle + match_ref Storage"
doc_id: "ADR-16-credit-economy-and-mint-oracle"
status: "Accepted"
version: "1.0.0"
updated: "2026-07-10"
owner: "Boss"
source_of_truth: true
amends: ["ADR-11 §2 (anonymize → pseudonymous)", "ADR-11 §3 (match_id → match_ref)"]
related_docs: ["ADR-11", "ADR-12", "ADR-14", "CR-003"]
language: "th/en"
---

# ADR-16 — Credit Economy, Mint Oracle, and match_ref Storage

## Status

Accepted · 2026-07-10 · **amends ADR-11 §2/§3** · **constrains CR-003 (wallet/billing) schema**

---

## Context

**ADR-11** (opt-in data contribution → credit) และ **ADR-12** (community AI marketplace,
revenue share) ถูก accept ไปแล้วตั้งแต่ 2026-06-23 แต่:

1. **ไม่มีที่ไหนนิยาม "credit" ว่าคืออะไร** — มีกี่สกุล, mint จากไหน, ใช้ซื้ออะไรได้,
   โอนกันได้ไหม, แปลงเป็นเงินได้ไหม CR-003 (wallet/billing, 51 atoms, ยังไม่ implement)
   กำลังจะเขียน schema โดยไม่มีคำตอบเหล่านี้
2. **`CLAUDE.md` ขัดกับ ADR-11 โดยตรง** — เขียนว่า match data "local only, never upload"
   และ "the opt-in account layer (ADR-14) is the **only** exception" โดยไม่เคยอ้าง ADR-11 เลย
   ผลคือทุก agent/ทุกคนที่อ่าน repo จะบังคับใช้กฎ absolute แล้วกลยุทธ์ flywheel ก็ถูกลืมซ้ำ ๆ
   **นี่คือสาเหตุที่ไอเดียนี้ "หายไป" หลายรอบ — เป็น doc-consistency bug ไม่ใช่ไอเดียที่หาย**
3. **ADR-11 §2 ขัดแย้งในตัวเอง** — สั่ง "anonymize, ไม่เก็บ account id" แต่ §2 เองก็บอกให้
   จ่าย credit (จ่ายให้คนนิรนามไม่ได้) และ §3 ต้องใช้ match_id (stitching) ที่จริงคือ
   **pseudonymous ไม่ใช่ anonymous**
4. **ไม่มีใครถามว่า mint อย่างไรให้ปลอมไม่ได้** — G-Log เป็น JSONL ในเครื่องผู้ใช้
   ถ้า mint จาก log = ปลอมได้ฟรี ต่างจาก Valve ที่ mint จากเซิร์ฟเวอร์ตัวเอง

Boss กำหนดทิศทางไว้ (session 2026-07-10) โดยอิงระบบเศรษฐกิจของ Dota 2:
shard (ได้จากการเล่น, ซื้อของ exclusive ที่เงินซื้อไม่ได้) แยกจาก wallet (เงินจริง),
tip ได้, เฟ้อเมื่อไหร่ก็จุดอีเวนต์เผา

---

## Decision

### 1. สองสกุล แยกขาดจากกัน

| | **Shard** (earned) | **Wallet** (purchased) |
| --- | --- | --- |
| ที่มา | แชร์แมตช์ที่ verify แล้ว · เควส · tip ที่ได้รับ | ซื้อด้วยเงินจริง |
| ซื้อของ **first-party** ของเรา | ✅ | ✅ |
| ซื้อของ **creator** (มี revshare) | ❌ **ห้าม** | ✅ |
| Tip ให้คนอื่น | ตาม §4 | ✅ |
| แปลงเป็นเงินสด | ❌ **ไม่มีทาง** | ผ่าน ADR-12 §3 เท่านั้น |
| หมดอายุ | ✅ มีวันหมดอายุ | ตามกฎหมาย |
| โอน / ขอคืน | ❌ / ❌ | ตาม terms |

### 2. Invariant (non-negotiable)

> **สิ่งที่ได้มาโดยไม่จ่ายเงิน (shard) ต้องไม่มีทางแปลงเป็นเงินได้ ไม่ว่าเส้นทางใด**
> **เงินสดที่จ่ายให้ creator ต้องมาจากรายได้เงินสดจริงเท่านั้น** (take-rate — ADR-12 §3)

ADR-12 §3 กำหนดไว้แล้วว่า payout เงินสดจ่ายเฉพาะ top-rank รายซีซัน และ prize pool
self-fund จาก take-rate — ข้อนี้จึง**สอดคล้องกับสิ่งที่ตัดสินไปแล้ว** ADR-16 แค่ทำให้เป็น
กฎที่บังคับได้ในระดับ schema

**ผลที่ตามมา:** วงจร `ปั๊มข้อมูลปลอม → shard → tip กรวยเข้าบัญชีเดียว → ซื้อ pack ตัวเอง →
รับ revshare เป็นเงิน` **ขาดตรงกลาง** เพราะ shard ซื้อของ creator ไม่ได้

### 3. Faucet (ที่มาของ shard) — ต้อง verify ได้จากภายนอกเสมอ

**ห้าม mint จาก `G-Log` ในเครื่องผู้ใช้** (ผู้ใช้แก้ไฟล์เองได้)

| ผู้ใช้ | Faucet |
| --- | --- |
| **ไม่จ่ายเงิน** | แชร์แมตช์ที่ **verify ผ่าน OpenDota** แล้วเท่านั้น · เพดานต่อวันต่ำ |
| **จ่ายเงิน (subscription)** | เควสรายวันเพิ่ม + **ตัวคูณ** บนแมตช์ที่แชร์ |

**Mint oracle = OpenDota** (ข้อมูลจากเซิร์ฟเวอร์ Valve เราแค่อ่าน public data):
1. ผู้ใช้ส่ง `match_id` เข้าระบบ (การกระทำเดียวกับการยินยอมแชร์ข้อมูล)
2. server ตรวจกับ OpenDota: แมตช์มีจริง · `account_id` อยู่ในแมตช์จริง · สถิติตรง
3. คำนวณผลงาน (MVP/แต้ม) **ฝั่ง server** จากข้อมูลสาธารณะ → mint shard
4. verify ไม่ได้ (profile private / ยังไม่ parse / ไม่พบ) → **ไม่ได้ shard** (honest state)
5. `match_ref` เดิม mint ซ้ำไม่ได้ (§5)

> **ทรัพยากรที่หายากไม่ใช่ shard แต่คือ "แมตช์ Dota จริงที่เล่นจบ"**
> การฟาร์มบังคับให้ต้องเล่นเกมจริงบนบัญชีจริง — ช้า, แพงด้วยเวลา, และ Valve มองเห็นเอง
> นี่คือกลไกเดียวกับที่ทำให้เควสของ Valve ปลอดภัย

**ผลพลอยได้ที่สำคัญ:** "รับ shard" กับ "ส่งข้อมูลเข้า flywheel (ADR-11)" เป็น**การกระทำ
เดียวกัน** — ไม่ต้องสร้างสองระบบ ผู้ใช้ไม่ต้องเข้าใจสองเรื่อง

### 4. Tip

**ห้าม tip เป็น faucet** — ไม่มี shard เกิดใหม่จากคนที่ไม่ได้จ่ายเงิน

- **ผู้ใช้ที่ไม่จ่ายเงิน tip ได้** แต่เป็น **reputation/คำขอบคุณ** (ไม่ใช่ shard)
- **tip ที่โอน shard จริง** = สิทธิ์ของผู้ใช้ที่จ่ายเงิน และ **หักจากยอดของผู้ส่ง** (zero-sum)
- ผู้รับ shard จาก tip: shard นั้นยังเป็น `earned` (ซื้อของ creator ไม่ได้) ตาม §1
- เพดาน **"shard ที่รับได้ต่อวัน"** (ไม่ใช่ decay ต่อคู่ — decay แพ้การหมุนบัญชี และเก็บภาษี
  จากคนสุจริตมากกว่าคนโกง)

**หมายเหตุ:** Valve ปลอดภัยเพราะ (ก) shard ไม่มีทางออกสู่เงิน (ข) เลือกไม่ได้ว่าจะเจอใคร
(matchmaking สุ่ม) — เรามีเกราะ (ก) แต่ไม่มี (ข) จึงต้องมีเพดาน "รับต่อวัน" แทน

### 5. match_ref — เก็บอย่างไร

**เก็บเฉพาะแมตช์ที่ผู้ใช้ส่งเข้าระบบเอง** — แมตช์ที่ไม่ส่ง ต้องไม่มี record ใด ๆ บน server

```
match_ref = HMAC(server_key, match_id)
เก็บ: { gid, match_ref, submitted_at, verified, shard_minted, receipt_sig }
```

- `match_id` ดิบใช้ verify กับ OpenDota ตอน submit **แล้วทิ้ง** ไม่เก็บลง DB
- **dedup / กัน mint ซ้ำ**: hash เดียวกัน = แมตช์เดียวกัน ✅
- **ADR-11 §3 match_id stitching ยังทำงาน**: user สองคนในแมตช์เดียวกันได้ `match_ref`
  เดียวกัน → join ได้ปกติ ✅
- **ระงับข้อพิพาทเฉพาะเจาะจงได้**: ใครยกมาว่า "แมตช์ 123456" → คำนวณ HMAC เทียบได้ ✅
- **dump DB แล้วไล่รายชื่อแมตช์ไม่ได้** ❌ ← เจตนา

**เหตุผล:** `match_id` + `account_id` = ระบุตัวบุคคลได้ทันที (OpenDota เปิดสาธารณะ)
ข้อมูลที่ ledger ของเราเพิ่มเข้าไปในโลกมีข้อเดียว: *"บัญชีนี้รันโปรแกรมบุคคลที่สามในแมตช์เหล่านี้"*
ตราบใดที่สถานะทางกฎหมายกับ Valve ยังไม่ชัด (ADR-11 §5 บันทึกว่า Valve เคยแบน 40k บัญชี +
ฆ่า Overwolf จากการป้อนตำแหน่งสด) การถือรายการนั้นในรูปที่ **enumerate ได้** คือการเตรียม
หลักฐานไว้ให้ฝ่ายที่จะลงโทษผู้ใช้ของเราเอง

**Signed receipt:** ทุก submission ที่รับ server เซ็น `{gid, match_ref, ts, shard}` ส่งกลับให้
ผู้ใช้เก็บ → non-repudiation สองทางโดยไม่ต้องมีใครถือ ledger พฤติกรรมของใคร

**Retention:** เก็บเท่าที่ shard ยังใช้ได้ + อายุความ แล้วลบ · ผู้ใช้ขอลบย้อนหลังได้

### 6. Sink & inflation

- **Prestige sink** — ของ exclusive ที่ **เงินซื้อไม่ได้** (ซื้อด้วย shard เท่านั้น)
  ความหายากคือตัวสินค้า ราคาสูงคือ *เจตนา* ไม่ใช่กำแพงกันโกง
- **แยก catalog เด็ดขาด**: ของ shard-only กับของ wallet-only **ห้ามทับกัน**
  (ถ้าซื้อได้ทั้งสองทาง ทุกคนจะปั๊ม shard ไม่มีใครจ่ายเงิน)
- **Burn event** เมื่อเฟ้อ — ต้องมี **มิเตอร์วัด shard supply รวม** ตั้งแต่วันแรก
  ไม่งั้นจะไม่รู้ว่าเมื่อไหร่ควรจุด

### 7. Schema constraint (บังคับ CR-003)

> **`provenance` แยก `earned | purchased` ต้องมีตั้งแต่ migration แรก**

ใส่ทีหลังไม่ได้: ถ้าเปิดเป็นยอดก้อนเดียวไปก่อน จะมี balance ที่ไม่รู้ที่มา แล้วต้องเลือกระหว่าง
"ถือว่า earned ทั้งหมด" (ลูกค้าที่จ่ายเงินเสียหาย) หรือ "purchased ทั้งหมด" (เปิดวงจรแปลง
ข้อมูลปลอมเป็นเงินย้อนหลัง) — **CR-003 ยังไม่ implement จึงยังทันแก้**

จะทำเป็น `shard_balance` / `wallet_balance` แยกคอลัมน์ หรือ ledger เดียวที่มี `provenance`
ก็ได้ แต่ต้องแยกได้เสมอ และ **การใช้จ่ายต้องบังคับกฎ §1 ที่ระดับ DB/RLS ไม่ใช่แค่ใน UI**

---

## Amendments to ADR-11

| ข้อ | เดิม | แก้เป็น |
| --- | --- | --- |
| §2 | "anonymize — ไม่เก็บ account id" | **pseudonymous**: ผูกกับ GID เสมอ (ต้องรู้ว่าจ่าย shard ให้ใคร) แต่ payload ไม่มีข้อมูลผู้เล่นอื่น |
| §3 | เก็บ/เทียบ `match_id` | เก็บ **`match_ref = HMAC(match_id)`**; ตัวดิบใช้ verify แล้วทิ้ง (stitching ยังทำงาน) |
| §2 | (ไม่ได้ระบุ oracle) | **เพิ่ม**: mint ต้อง verify กับ OpenDota เสมอ — ห้าม mint จาก `G-Log` ในเครื่อง |

ส่วนที่ **ไม่แก้** และยังบังคับใช้เต็ม:
- ADR-11 §1 local-first เป็น default (ไม่ opt-in = อยู่ในเครื่อง 100%)
- ADR-11 §5 🔴 ใช้ข้อมูลได้เฉพาะ **post-match / aggregate prior** — ห้ามป้อนตำแหน่งศัตรู
  *สด* กลับเข้าแมตช์เดิม (= maphack)
- ADR-11 §6 cloud collector แยกจาก live path
- ADR-12 §4 bot รันได้เฉพาะ sandbox · §5 anti-gaming วัด distinct-active-user

**ยืนยัน:** ground truth ของ ADR-11 §3 มาจาก **GSI ของผู้เล่นแต่ละคนเอง** (ตำแหน่งตัวเอง)
ไม่ใช่ CV → payload ไม่มีข้อมูลของผู้เล่นที่ไม่ได้ยินยอม **ห้ามส่ง CV detection ออกจากเครื่อง**
ในทุกกรณี (ทั้งเรื่องความยินยอมของบุคคลที่สาม และเพราะ CV คือส่วนที่เสี่ยงต่อ Valve ที่สุด)

---

## Consequences

### Positive
- flywheel ข้อมูล (ADR-11) กับ faucet ของสกุลเงิน = กลไกเดียว ไม่ต้องสร้างสองระบบ
- ฟาร์มไม่ได้: mint ผูกกับแมตช์จริงที่ verify ผ่าน server ของ Valve
- ไม่มีทางออกสู่เงินจาก shard → ไม่มี laundering loop, ไม่แตะ e-money regulation
- ผู้ใช้ที่ไม่จ่ายเงินก็มีส่วนร่วมได้ (แชร์แมตช์) → moat ไม่ตายเพราะ paywall
- DB dump ไม่เปิดเผยรายการแมตช์ของใคร

### Negative
- ต้องมี OpenDota verification pipeline + จัดการ latency/failure (ไม่ทุกแมตช์ถูก parse ทันที)
- ต้องมี shard-supply telemetry + ทีมตัดสินใจว่าเมื่อไหร่จะเผา
- catalog ต้องแยกสองกอง → งานออกแบบ store เพิ่ม
- `provenance` ทำให้ CR-003 schema ซับซ้อนขึ้นตั้งแต่วันแรก

### Neutral / Trade-offs
- tip แบบ reputation สำหรับผู้ใช้ฟรี "จืด" กว่า tip ที่ให้ shard — แลกกับความปลอดภัยของ faucet
- ADR-11 §3 stitching ต้องการ penetration² จึง kick in ช้า (บันทึกไว้แล้วใน ADR-11)

---

## Alternatives Considered

| Alternative | Reason Rejected |
| --- | --- |
| สกุลเดียว (credit ก้อนเดียว) | earned แปลงเป็นเงินได้ผ่าน creator revshare → laundering loop + e-money risk |
| ใช้ **ราคาสูง** เป็นกำแพงกันฟาร์ม (เช่น 600,000) | ราคาไม่ใช่กำแพง **catalog ต่างหากที่เป็นกำแพง**; ถ้าไม่แยก catalog ราคาสูงก็แค่ทำให้สกุลเงินตายและ flywheel ตายตาม |
| **Pairwise tip decay** (ได้ครึ่ง / จ่ายเพิ่ม 50% เมื่อเจอคู่เดิม) | แพ้การหมุนบัญชี (10 บอท = 45 คู่); เก็บภาษีจากคนสุจริตหนักกว่าคนโกง; และถ้าเป้าหมาย tip คือ **creator** มันจะลงโทษแฟนที่ภักดี ซึ่งคือพฤติกรรมที่เราต้องการ |
| Mint จาก `G-Log` ในเครื่อง | ผู้ใช้แก้ไฟล์เองได้ → ปลอม MVP ได้ฟรี → faucet รั่วที่ oracle ต่อให้กติกาอื่นรัดกุม |
| เก็บ `match_id` ดิบทุกแมตช์ที่รันแอป (เพื่อระงับข้อพิพาท) | สร้าง ledger ที่ **enumerate ได้** ว่า "ใครใช้ tool บุคคลที่สามในแมตช์ไหน" — รับใช้ฝ่ายที่จะแบนผู้ใช้เรามากกว่ารับใช้เรา; ความต้องการจริง (dedup + ตรวจข้อกล่าวอ้าง) ทำได้ครบด้วย HMAC + receipt |
| Anonymous contribution (ตาม ADR-11 §2 เดิม) | จ่าย shard ให้คนนิรนามไม่ได้ และ stitching ต้องมี join key — จริง ๆ คือ pseudonymous |
| tip เป็น faucet (mint ให้ผู้รับ) | ผู้ใช้ฟรี 5 เกม/วัน × 150 = 750 shard/วัน เทียบผู้จ่ายเงิน 90/วัน → พังทั้งเศรษฐกิจ และขัดหลัก "ไม่จ่ายเงินไม่เสก shard" |

---

## Prerequisites / Open

1. 🔴 **สถานะทางกฎหมายกับ Valve ยังไม่ชัด** (การอ่าน minimap ด้วย CV) — ADR-11 §5 บันทึก
   ไว้แล้วว่า Valve เคยแบน 40k บัญชีและฆ่า Overwolf จากการป้อนตำแหน่งสด
   **ต้องเคลียร์ก่อนเปิด ingestion เชิงพาณิชย์** ไม่ใช่หลังจากมีข้อมูลผู้ใช้อยู่ในมือแล้ว
2. Terms & consent copy: shard **โอนไม่ได้ · ถอนไม่ได้ · ขอคืนไม่ได้ · มีวันหมดอายุ ·
   แลกได้เฉพาะสินค้าดิจิทัล first-party**
3. Consent สำหรับ data ingestion ต้อง **แยกจาก sign-in** (ADR-14 sign-in เป็น additive)
   และปิด/ลบย้อนหลังได้
4. ต้องแก้ **`CLAUDE.md`** ให้อ้าง ADR-11/12/16 — กฎ absolute ปัจจุบันคือสาเหตุที่กลยุทธ์นี้
   ถูกลืมซ้ำ ๆ (ทำใน commit เดียวกับ ADR นี้)
5. ลำดับการทำ: **silent-arm efficacy study แบบ local ล้วน** ก่อน (ไม่แตะ privacy rule,
   ตอบคำถาม "G-Maiden ช่วยจริงไหม" ได้โดยไม่ต้องอัปโหลด และเป็นฟีเจอร์ในตัวเอง) →
   ingestion → shard → marketplace payout

---

## Related Documents

ADR-11 (opt-in contribution) · ADR-12 (marketplace) · ADR-14 (GID identity) ·
CR-003 (wallet/billing — schema ถูกบังคับโดย §7)

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 1.0.0 | 2026-07-10 | Accepted — two-currency (shard/wallet), no-money-exit invariant, OpenDota mint oracle, match_ref HMAC + signed receipt, catalog separation, `provenance` schema constraint; amends ADR-11 §2/§3 |

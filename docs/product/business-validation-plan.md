# Business Validation Plan — G-Maiden

> **เป้าหมาย:** พิสูจน์สมมติฐานเชิงธุรกิจที่เสี่ยงสุด *ก่อน*ลงแรง/ลงเงิน — แบบ lean (solo dev, งบ~0, ใช้ช่องทางไทย)
> **วันที่:** 2026-06-23 · อ้างอิง [[business-requirements|BRD]] §3,§8,§9,§12
> **หลักการ:** validate ตามลำดับความเสี่ยง — *core value → retention → ราคา → distribution → marketplace*. อย่าตั้งราคาของที่ยังไม่รู้ว่าคนต้องการ

---

## 1. สมมติฐานที่เสี่ยงสุด (เรียงตามถ้าผิดแล้วเจ็บสุด)

| # | สมมติฐาน | ถ้าผิด = ? |
| --- | --- | --- |
| **A1** 🔴 | G-Signal เตือน gank **เชื่อถือได้ + ไม่รำคาญ** จนผู้ใช้รู้สึก "ขาดไม่ได้" | core value พัง → ทุกอย่างจบ |
| **A2** 🔴 | ผู้ใช้ **กลับมาใช้** (D7/D30) — persona/memory ทำให้ติด | ไม่มี retention = ไม่มีธุรกิจ (ชะตา MS Copilot) |
| **A3** | ผู้เล่นไทย **ยอมจ่าย ฿99–199** + tier/ช่องทางไหน | โมเดลรายได้พัง → ต้อง rethink (ad? ถูกลง?) |
| **A4** | ผ่าน onboarding ได้ (ติดตั้ง + ตั้ง GSI สำเร็จ → ใช้จริง 1 แมตช์) | technical friction ฆ่า activation เงียบๆ |
| **A5** | หาผู้ใช้ได้จริง — Overwolf vs web ช่องไหนดีกว่า | distribution คือจุดที่ brief บอกว่าเราแพ้ |
| **A6** | (post-v1.0) มีคนอยากเทรน/ใช้ community style | สร้าง marketplace เปล่าถ้าไม่มี demand |

---

## 2. การทดลอง (cheap → expensive)

### E1 — Closed Beta Cohort 🔴 *(validate A1, A2, A4)*
- recruit **15–30 ผู้เล่นไทย** จาก FB (Dota2 Thailand, Lakoi), Discord, คนรู้จัก
- ปล่อย beta ฟรี · instrument ผ่าน G-Log (local) + **ขอ opt-in แชร์ metric** (ใช้กลไก [[ADR-11-optin-data-contribution-flywheel|ADR-11]] จริง)
- วัด: activation %, **D7/D30 retention**, G-Signal **false-positive rate**, "ปิดเสียงไหม", NPS, สัมภาษณ์สั้นหลังใช้
- **gate:** D7 ≥40% · ผู้ปิดเสียงเพราะ FP <15% · NPS เป็นบวก
- งบ ~0 · 2–4 สัปดาห์

### E2 — Problem/Solution Interviews *(validate A1, A3 เชิงคุณภาพ)*
- 8–12 สัมภาษณ์ (~30 นาที) กับกลุ่มเป้าหมาย
- ถาม: ทุกวันนี้พัฒนาฝีมือยังไง, เจ็บสุดเรื่องอะไร (ตายเพราะแกงค์?), เสียงเตือนช่วยไหม, จ่ายไหม/เท่าไหร่, จ่ายเกมยังไง (TrueMoney/PromptPay?)
- งบ ~0 · 1–2 สัปดาห์

### E3 — Van Westendorp Pricing Survey *(validate A3)*
- แบบสอบถามใน FB/Discord (n≥100) · 4 คำถาม PSM (แพงไป/แพง/ถูก/ถูกไป) เป็น ฿
- ได้: ช่วงราคาที่ยอมรับ + จุดราคาที่เหมาะสม · ถามช่องทางจ่ายที่ชอบ (sub vs one-time/top-up)
- งบ ~0 · 1 สัปดาห์

### E4 — Fake-door Landing Page *(validate A3 intent + A5)*
- หน้า Vercel: hero + pricing tier (฿99/฿199 + one-time) + ปุ่ม "เริ่มใช้/จ่าย" → waitlist/"เร็วๆ นี้"
- วัด: visit→click intent, **tier ไหนคนกดมากกว่า**, ช่องจ่ายที่เลือก
- ดึง traffic จาก FB/Discord/โพสต์แคสเตอร์
- งบต่ำ · ต่อเนื่อง

### E5 — Distribution Test *(validate A5)*
- ปล่อยบน **Overwolf store** (soft) + ลิงก์ web → เทียบ install funnel, organic reach, friction
- trade-off: Overwolf = ฐานผู้ใช้พร้อม แต่โดนหัก %/คุมน้อย · web = คุมเต็มแต่ cold
- งบกลาง · หลัง beta ผ่าน

### E6 — Marketplace Smoke Test *(validate A6, post-v1.0)*
- Wizard-of-Oz: ปล่อย "trainer style" ไม่กี่ตัว (ผู้ก่อตั้ง + แคสเตอร์ 1–2 คน) เป็น preset → วัดการใช้ + signal "อยากสร้างเองไหม"
- ทำ*ก่อน*สร้าง Pillar C จริง

---

## 3. ลำดับ & Decision Gates

```
สัปดาห์ 1–2:  E2 สัมภาษณ์ + E3 pricing survey (ขนานกัน, ถูก)  → ตั้ง hypothesis ราคา
สัปดาห์ 1–4:  E1 BETA COHORT  ← GATE หลัก (core value + retention)
ระหว่าง beta: E4 fake-door (WTP intent)
หลัง beta ผ่าน: E5 distribution
post-v1.0:    E6 marketplace smoke test
```

| Gate | เกณฑ์ผ่าน | ถ้าไม่ผ่าน |
| --- | --- | --- |
| **G1 — core value** (E1) | D7 ≥40% · FP-disable <15% | **หยุด — ซ่อม G-Signal ก่อน** อย่าเพิ่งคิดราคา |
| **G2 — WTP** (E3+E4) | PSM optimal ≥฿99 · fake-door intent ถึงเป้า | rethink โมเดล (ad-supported / ถูกลง / one-time) |
| **G3 — distribution** (E5) | ช่องที่ install funnel ดีสุด | โฟกัสช่องนั้น |
| **G4 — marketplace** (E6) | demand signal ชัด | เลื่อน/ลด scope Pillar C |

---

## 4. เช็คความสมเหตุสมผลกับ financial model
Base case ต้องการ **~125 paid** → ที่ conversion 5% = ~2,500 active → ที่ activation 60% = **~4,200 installs**. validation ต้องตอบ: funnel rate เหล่านี้จริงไหมในตลาดไทย (E1 ให้ activation/retention จริง, E3/E4 ให้ conversion/ราคาจริง)

## 5. หมายเหตุ
- **ใช้ช่องทางไทยเป็นหลัก** (FB groups, Discord, แคสเตอร์) — CAC ~0 ช่วงพิสูจน์
- metric sharing ใน beta = ใช้ **opt-in ([[ADR-11-optin-data-contribution-flywheel|ADR-11]])** จริง → validate กลไก privacy ไปในตัว
- เริ่มได้**ทันที**ด้วย E2+E3 (ไม่ต้องรออะไร) ขนานกับเตรียม E1 beta build

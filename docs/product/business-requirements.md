# Business Requirements Document (BRD) — G-Maiden

> **เอกสารระดับ:** Business (อยู่เหนือ [[product-requirements|PRD]]/[[software-requirements-specification|SRS]]) — *ทำไม*ต้องทำและ*ต้องได้อะไรเชิงธุรกิจ* ไม่ใช่*ทำอย่างไร*
> **วันที่:** 2026-06-23 · **เวอร์ชัน:** 0.2.0 (draft) · **เจ้าของ:** Boss (solo founder)
> **อ้างอิง:** [[product-requirements|PRD]] · [[software-requirements-specification|SRS]] · [[competitive-brief|Competitive Brief]] · [[roadmap|ROADMAP]]
> **สถานะโปรเจกต์:** shipping v0.7.x · Phase 0–2 (GSI + CV gank detection + voice) ✅ · มุ่ง v1.0

---

## 1. Executive Summary

**G-Maiden** คือ AI companion เสียงสด + overlay โปร่งใสสำหรับ Dota 2 ที่ "เห็นอันตรายก่อนผู้เล่นและพูดเตือนทันก่อนตาย" ผ่าน persona "Maiden" (สไตล์นักพากย์ไทย แรงบันดาลใจจาก Crystal Maiden)

เอกสารนี้นิยาม**ความต้องการเชิงธุรกิจ**ที่ผลิตภัณฑ์ต้องตอบให้ได้เพื่อสร้างคุณค่าและความได้เปรียบที่ยั่งยืน ภายใต้ข้อจำกัดจริง: **solo dev, ไม่มีทุน, ไม่มีทีม** กลยุทธ์ทั้งหมดจึงถูกออกแบบให้ *lean* — เปลี่ยนข้อจำกัดเป็นจุดแข็ง (crowdsource ข้อมูล, self-fund รายจ่าย, ยึด niche ไทยก่อนขยายสากล)

**โอกาส:** ช่อง "voice + real-time + Dota 2" ว่างทั้งตลาด คู่แข่งที่ตายไป (GOSU.AI ~$5.12M, Backseat AI) พิสูจน์ว่า "AI tips บนจอ" ไม่ใช่ moat — สิ่งที่ขาดคือ **ความได้เปรียบที่ลอกยาก + engagement**

---

## 2. Business Context & Problem Statement

| | |
| --- | --- |
| **ปัญหาผู้เล่น** | ตัดสินใจช้า/โดนแกงค์ตาย; เครื่องมือที่มีล้วนเป็น "ข้อความบนจอ" ที่ดึงสายตาออกจากเกม และไม่มีตัวไหนเตือนอันตราย*เชิงรุก*ทันเวลา |
| **ช่องว่างตลาด** | ไม่มี real-time voice companion ที่เตือน gank แบบ interrupt + ทำนายเส้นทางจาก heatmap (ดู [[competitive-brief|Competitive Brief]] §1, §5) |
| **ปัญหาเชิงธุรกิจ** | คู่แข่งรุ่นก่อนตายเพราะ (ก) ไม่มี moat, (ข) adoption/engagement พัง, (ค) ต้นทุน/ความแม่น — ไม่ใช่เพราะเทคโนโลยี |
| **ข้อจำกัดผู้ก่อตั้ง** | solo dev / no funding / no team → ต้องไม่พึ่งการเทรนโมเดลแพงหรือซื้อ dataset |

---

## 3. Vision & Business Objectives

**Vision:** เป็น co-pilot เสียงอันดับหนึ่งของผู้เล่น Dota 2 — เริ่มจากตลาดไทย แล้วขยายสากล โดยมี moat จาก persona + ข้อมูล community ที่ลอกไม่ได้

**Business Objectives (เป็นสมมติฐาน pre-launch ต้อง validate):**

| # | วัตถุประสงค์ | ตัวชี้วัด (ดู §9) |
| --- | --- | --- |
| BO-1 | ยึดช่อง "voice + real-time Dota 2" เป็นเจ้าแรกในไทย | mindshare ในชุมชน Dota ไทย, ผู้ใช้ active |
| BO-2 | พิสูจน์คุณค่าหลัก (G-Signal เชื่อถือได้) จน "ขาดไม่ได้" | retention D30, false-positive rate ต่ำ |
| BO-3 | สร้าง moat ที่ลอกยาก (persona + data flywheel + marketplace) | flywheel coverage, จำนวน trainer/style |
| BO-4 | โมเดลรายได้ที่ยั่งยืน เหมาะตลาดไทย แล้วต่อยอดสากล | conversion free→paid, ARPU, marketplace GMV |
| BO-5 | อยู่รอดภายใต้ความเสี่ยงเชิงนโยบาย (Valve/GSI) | survive GSI-block test (hybrid ingestion) |

---

## 4. Stakeholders & Users

| กลุ่ม | บทบาท | ความสนใจ |
| --- | --- | --- |
| **ผู้เล่น Dota 2 (ผู้ใช้หลัก)** | ลูกค้า | เล่นดีขึ้น/ไม่ตายโง่, ไม่โดนแบน, ไม่กินทรัพยากร, ราคาเหมาะ |
| **Trainers (creator)** | ผู้สร้างสไตล์ AI ใน marketplace | รายได้/ชื่อเสียง, เครื่องมือเทรนที่ใช้ง่าย |
| **ผู้ก่อตั้ง (solo)** | dev + business owner | lean, ยั่งยืน, ไม่เผาทุน |
| **แคสเตอร์/คอมมูนิตี้ไทย** | ช่องจัดจำหน่าย/seed trainer | คอนเทนต์, การมีส่วนร่วม |
| **Valve** | platform owner (+คู่แข่งทางอ้อม) | competitive integrity, นโยบาย GSI/overlay |
| **Overwolf** | ช่องจัดจำหน่ายทางเลือก | ฐานผู้ใช้ Dota |

### 4.1 User Personas (ย่อ)
- **1. "แมว" — Ladder grinder (core / ผู้จ่ายเงิน)** · 18–28, Archon–Ancient, อยากขึ้น MMR, กลัวโดนแกงค์เสียเกม, เล่นจริงจังหลังเรียน/งาน · *ต้องการ:* เตือน gank ทันเวลา + รู้ว่า "ฆ่าได้ไหม" · *จ่าย:* ฿99–199 ผ่าน TrueMoney ถ้าช่วยรอด/ชนะจริง
- **2. "โค้ชเงา" — Trainer / creator** · ผู้เล่นเก่ง/แคสเตอร์/สายคอนเทนต์ · *ต้องการ:* แบ่งปันสไตล์ + รายได้เสริม + ชื่อเสียง · *คุณค่าต่อธุรกิจ:* ฟันเฟืองของ marketplace + flywheel (seed ด้วยกลุ่มนี้)
- **3. "สายสนุก" — Casual / returning** · เล่นเอามัน ชอบ persona/มีม CM · *ต้องการ:* เพื่อนเล่นที่ฮา ไม่กดดัน · *คุณค่าต่อธุรกิจ:* word-of-mouth/viral + free-tier data contributor (opt-in) แม้ไม่จ่าย

---

## 5. Scope

### 5.1 In-scope (ถึง v1.0)
G-Series 12 โมดูล (G-Sentry/Motion/Signal/Master/Sensory/Log + G-Voice/Memory/Coach/Mind/Persona/Stream) · gank warning เสียง · damage-calc/lethality (G-Damage) · overlay · GSI + minimap CV · local SLM fallback · privacy-first (local-only)

### 5.2 Out-of-scope (ตอนนี้)
Post-game analytics เชิงลึก (Stratz/OpenDota ครองขาด) · draft/hero-pick suggestion เป็นหัวหอก (Valve/DotaPlus ครอง) · รองรับหลายเกม (ยึด "แคบแต่ลึกใน Dota")

### 5.3 Future (post-v1.0)
**Community AI marketplace** + data flywheel + creator economy · ขยาย persona หลายภาษา/ตลาดสากล

---

## 6. Market & Competitive Context (สรุป — รายละเอียดใน [[competitive-brief|Competitive Brief]])

- 3 ค่ายคู่แข่ง: ครู/คำแนะนำ (Dota Coach), ข้อมูล/ดราฟต์ (DotaPlus, Dota Plus), สตรีมเมอร์ (Dotabod) — **มุม voice+real-time ว่าง**
- Incumbent risk: **Valve = platform + คู่แข่ง** (Dota Plus Assistant ในตัวเกม)
- บทเรียน: GOSU.AI/Backseat ตาย → moat + engagement สำคัญกว่าฟีเจอร์
- ตลาดไทย: niche เหนียวแต่จำกัด (หลักหมื่น active), จ่ายเงินในเกมเก่งแต่ผ่าน wallet/QR, วัฒนธรรมเรียนฟรี → ราคาต้องต่ำ (฿99–199) + micro-payment

---

## 7. Business Requirements (BR)

ระดับธุรกิจ (อ้าง [[software-requirements-specification|SRS]]/[[product-requirements|PRD]] สำหรับ how) — เรียงตามความสำคัญ:

| ID | ความต้องการเชิงธุรกิจ | เหตุผล | โยงโมดูล/ADR |
| --- | --- | --- | --- |
| **BR-01** | เตือนภัย gank ทันเวลา (ก่อนตาย) ด้วย**เสียง** + ความแม่นที่เชื่อถือได้ | คุณค่าหลักที่ผู้ใช้ยอมจ่าย; เงื่อนไขแพ้/ชนะ | G-Signal/Motion/Sentry · NFR ≤300ms |
| **BR-02** | ไม่ทำลายประสบการณ์เกม: ไม่บังจอ, ไม่กิน FPS เกิน, **ไม่ทำให้โดนแบน** | ban-safety เป็น blocker การซื้อ | G-Sensory · ADR-03 · governor |
| **BR-03** | อยู่รอดเมื่อ Valve เปลี่ยน/บล็อก GSI | ความเสี่ยงเชิงดำรงอยู่ → hybrid | Pillar A · [[ADR-10-hybrid-ingestion-resilience|ADR-10]] |
| **BR-04** | ความเป็นส่วนตัว = **local-first by default** | จุดขาย + ข้อบังคับ; แชร์ = opt-in + credit | ADR-06 · [[ADR-11-optin-data-contribution-flywheel|ADR-11]] · no-egress test |
| **BR-05** | สร้าง moat ที่ลอกยาก | หนีชะตา GOSU/Backseat | persona + flywheel + marketplace |
| **BR-06** | โมเดลรายได้ที่เหมาะตลาดไทยแล้วต่อยอดสากล | WTP ต่ำ + wallet/QR | §8 |
| **BR-07** | สร้าง engagement/retention ระยะยาว | adoption คือความเสี่ยงสูงสุด | G-Persona/Memory + creator economy |
| **BR-08** | ทำงานบนเครื่อง mid-range ภายใน resource budget | กลุ่มเป้าหมายเครื่องไม่แรงทุกคน | SRS NFR |
| **BR-09** | รองรับการเติบโต niche ไทย → สากล | scalability | i18n persona, TTS หลายภาษา |
| **BR-10** | marketplace ต้องมี quality control + anti-gaming + bot guardrail | เงินสด + UGC ล่อให้โกง/ผิดกฎ | Pillar C · [[ADR-12-community-ai-marketplace|ADR-12]] |

---

## 8. Business Model & Monetization

**หลักการ:** lean + เหมาะตลาดไทย + หลายสายรายได้ ไม่พึ่ง subscription อย่างเดียว

| สาย | รายละเอียด | หมายเหตุ |
| --- | --- | --- |
| **Subscription / unlock** | freemium; tier จ่าย **฿99–199/เดือน** + **one-time/top-up** | price band ตลาด = $2–6/mo |
| **ช่องจ่ายเงิน** | TrueMoney, PromptPay, ShopeePay, 7-Eleven, top-up (Codashop/UniPin) | บัตรเครดิตเจาะตลาดต่ำ |
| **Marketplace take-rate** | แพลตฟอร์มหัก % จากการใช้สไตล์ของ trainer | สายรายได้ใหม่ (post-v1.0) |
| **Seasonal payout** | **เงินสดราย season เฉพาะ top-rank**; ที่เหลือ credit/privilege | pool **self-fund จาก take-rate** |

**กลไกป้องกัน:** ranking ต้องวัด **distinct active-users + retention** (ไม่ใช่โหวต/ดาวน์โหลดดิบ) เพื่อกัน manipulation (เงินสดล่อให้โกง)

### 8.1 Unit Economics & Financial Model (สมมติฐาน — pre-launch, ต้อง validate)
> ตัวเลขทั้งหมดเป็น**สมมติฐานเพื่อวางแผน** ไม่ใช่ค่าจริง · ฐานตลาด: Dota PC ไทย active core ~30,000–80,000 ([[competitive-brief|Competitive Brief]])

**สมมติฐานหลัก:** ARPU ผู้จ่ายเงิน (เฉลี่ย ฿99 basic / ฿199 pro + one-time) ≈ **฿120/เดือน** · activation ~60% · free→paid: cons 3% / base 5% / opt 8% · opex (solo, ไม่มีเงินเดือน): cloud Gemini (throttled+redacted) + collector + TTS + hosting ≈ **฿10–40k/เดือน** (local SLM ช่วยกดต่ำ)

**สถานการณ์ปีที่ 1:**

| | Conservative | Base | Optimistic |
| --- | --- | --- | --- |
| installs (ปี 1) | 2,000 | 5,000 | 12,000 |
| paid users | 60 (3%) | 250 (5%) | 960 (8%) |
| ARPU/เดือน | ฿120 | ฿120 | ฿120 |
| **MRR** | **~฿7,200** | **~฿30,000** | **~฿115,000** |
| annualized | ~฿86k | ~฿360k | ~฿1.38M |

**Break-even:** ที่ opex ~฿15k/เดือน → ต้องการ **~125 paid users** (≈ base) · **local SLM + privacy-first = opex ต่ำ = break-even ต่ำ** (ข้อได้เปรียบเชิงโครงสร้าง)

**Marketplace (post-v1.0, สายรายได้ที่ 2):** take-rate ~25% ของ GMV · seasonal pool ~30–50% ของ take-rate → top-rank (self-fund ไม่กระทบ runway) · ช่วงแรกคุณค่าหลัก = engagement มากกว่ารายได้ตรง

**นัยเชิงกลยุทธ์:** opex ต่ำ (no salary + local processing) → break-even ต่ำมาก (~ร้อยคน) → solo dev อยู่รอดด้วย niche ไทยก่อนขยายสากล · **ความเสี่ยงจริงคือ conversion/retention ไม่ใช่ scale**

---

## 9. Success Metrics / KPIs

| หมวด | ตัวชี้วัด | เป้า (สมมติฐาน — ต้อง validate) |
| --- | --- | --- |
| **Activation** | % ผู้ติดตั้งที่ใช้จริง ≥1 แมตช์ | สูง |
| **Core value** | G-Signal false-positive rate (ผู้ใช้ไม่ปิดเสียง) | ต่ำมาก = ตัวชี้ขาด |
| **Retention** | D7 / D30 | D30 คือ moat ของ persona/memory |
| **Monetization** | conversion free→paid, ARPU | ภายใต้ ฿99–199 |
| **Flywheel health** | % แมตช์ที่มี coverage 2 ฝั่ง (match_id) | โตตามฐานผู้ใช้ |
| **Marketplace** | # trainers, # styles, GMV, % rev จาก marketplace | post-v1.0 |
| **Persona affinity** | NPS / การถูกพูดถึง-แชร์ | สูง = viral loop |
| **Resilience** | ผ่าน GSI-block test | ต้องผ่าน |

---

## 10. Strategic Pillars (ดู [[competitive-brief|Competitive Brief]] §10)

1. **Pillar A — Hybrid ingestion:** GSI + vision (CV own-state fallback) + pro-replay priors → resilience เป็นจุดขาย ([[ADR-10-hybrid-ingestion-resilience|ADR-10]])
2. **Pillar B — Data flywheel (match_id):** เย็บ GSI 2 ฝั่ง → ground-truth dataset = network-effect moat · 🔴 post-match/aggregate เท่านั้น ([[ADR-11-optin-data-contribution-flywheel|ADR-11]])
3. **Pillar C — Community AI marketplace:** UGC (persona + advice-logic + bot practice-only) + creator economy = moat + engagement ([[ADR-12-community-ai-marketplace|ADR-12]])

---

## 11. Constraints & Assumptions

**Constraints:** solo dev/no funding/no team → ห้ามพึ่งโมเดลแพง/ซื้อ dataset · resource budget เข้ม (CPU ≤2.5%, RAM ≤400MB, FPS ≤3%, G-Signal ≤300ms) · privacy NFR (local-only default, ADR-06 + no-egress) · พึ่ง Valve platform · คุณภาพ Thai TTS

**Assumptions:** ผู้เล่นไทยยอมจ่าย ฿99–199 ถ้า "ช่วยรอด/ฆ่าได้จริง" · มี community ยอมเป็น trainer (seed ด้วยแคสเตอร์ไทย) · GSI+vision+overlay external = อยู่ในโซนที่ Valve ยอมรับ

---

## 12. Risks & Mitigations

| ความเสี่ยง | ระดับ | การรับมือ |
| --- | --- | --- |
| Valve เปลี่ยน/บล็อก GSI | สูง | Pillar A hybrid + read-only/no-inject/ไม่โชว์ข้อมูลที่ผู้เล่นไม่เห็น |
| Adoption/engagement พัง | สูง | wedge แคบ + persona/memory + creator economy |
| G-Signal latency/false-positive | สูง | latency พิสูจน์แล้ว (p50=21.6ms) + จูน "เชื่อถือได้ก่อนฉลาด" |
| เสียง interrupt น่ารำคาญ | กลาง | คุม false-positive + verbosity presets |
| Distribution (Overwolf ได้เปรียบ) | กลาง | พิจารณา publish Overwolf + leverage แคสเตอร์ไทย |
| Free-rider/piracy (PC TH) | กลาง | tier ฟรีคุ้ม + คุณค่าผูก cloud/community account |
| Marketplace cold-start | กลาง | seed ด้วย style ผู้ก่อตั้ง + แคสเตอร์ไทย |
| Ranking manipulation | กลาง | anti-gaming ranking (active-users+retention) |
| Privacy promise vs data moat | กลาง | local-first default + opt-in/credit ([[ADR-11-optin-data-contribution-flywheel|ADR-11]]) |

---

## 13. High-level Roadmap / Phasing

| เฟส | ขอบเขตธุรกิจ | สถานะ |
| --- | --- | --- |
| **v0.5** | core loop: GSI + CV gank detection + voice | ✅ done |
| **v0.6–0.9** | persona/voice, cloud brain, offline SLM, feedback/memory | กำลังทำ (v0.7.x) |
| **v1.0** | ครบ 12 โมดูล, ผ่าน NFR, พร้อมขาย | เป้าหมาย |
| **post-v1.0** | Community marketplace + data flywheel + seasonal payout | future (Pillar C) |
| **ขยาย** | สากล (persona หลายภาษา) | หลัง PMF ในไทย |

---

## 14. Open Decisions (รอเคาะ)

1. ~~เขียน ADR-10/11/12 ที่ไหน~~ → ทำแล้ว: `docs/ADR-10..12-*.md` (status Proposed) + แถวใน ROADMAP
2. **amend ADR-06** — re-scope no-egress เป็น "ข้อมูลที่ไม่ opt-in ห้ามรั่ว" ([[ADR-11-optin-data-contribution-flywheel|ADR-11]] เสนอไว้ — รอ accept)
3. **ราคาจริง + tier structure** (validate ฿99–199 กับผู้ใช้ไทย)
4. **Distribution**: web/Vercel เท่านั้น หรือ publish Overwolf ด้วย

---

## 15. Related Documents
- [[product-requirements|PRD]] · [[software-requirements-specification|SRS]]
- [[competitive-brief|Competitive Brief]] (§10 = strategic pillars)
- [[roadmap|ROADMAP]] · ADR-10/11/12 ใน `docs/`

## Changelog
| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-06-23 | BRD ฉบับแรก |
| 0.2.0 | 2026-06-23 | + §4.1 User Personas, + §8.1 Financial Model; ผูก ADR-10/11/12 |

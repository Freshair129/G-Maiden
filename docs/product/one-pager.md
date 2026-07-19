# G-Maiden — One-Pager

> **เพื่อนแคสเตอร์ AI ที่เห็นอันตรายก่อนคุณ และพูดเตือนทันก่อนตาย**
> AI voice co-pilot สำหรับ Dota 2 · 2026-06-23 · solo-founded, shipping v0.7.x

---

**ปัญหา**
ผู้เล่น Dota 2 ตัดสินใจช้า/โดนแกงค์ตายเพราะข้อมูลล้นและสายตาไม่ทัน เครื่องมือที่มีล้วนเป็น *ข้อความบนจอ* ที่ดึงสายตาออกจากเกม — ไม่มีตัวไหนเตือนอันตราย *เชิงรุก* ทันเวลา

**ทางออก — G-Maiden**
AI companion **เสียงสด + overlay โปร่งใส** อ่านเกมผ่าน GSI:
- 🔔 **เตือน gank ด้วยเสียง** ภายใน <300ms (ทำนายเส้นทางจาก heatmap)
- ⚔️ **คำนวณ "ฆ่าได้ไหม"** สด (G-Damage lethality) — ไม่มีใครทำ
- 🎙️ **persona "Maiden"** นักพากย์ไทย รู้มีม "Nerf CM" + แก้คำกลางประโยคเมื่อทำนายพลาด (belief revision)

**ทำไมตอนนี้ / ทำไมเรา**
มุม **voice + real-time + Dota 2 ว่างทั้งตลาด** · คู่แข่งทุนหนา (Blitz/Mobalytics) ทิ้ง Dota 2 · เจ้าที่ตาย (GOSU.AI ~$5.12M, Backseat AI) พิสูจน์ว่า "AI tips บนจอ" ไม่ใช่ moat — เราต่างตรงนั้น

**ตลาด** — เริ่ม niche Dota PC ไทย (active core ~30–80k) แล้วขยายสากล · ESL One Bangkok 2024 = สัญญาณตลาดฟื้น

**Moat (ลอกยาก 4 ชั้น)**
1. **Persona ไทย + belief revision** — emotional hook ที่ analytics ให้ไม่ได้
2. **Hybrid ingestion** (GSI + vision + replay) — รอดแม้ Valve ตัด GSI
3. **Data flywheel** — match_id เย็บ GSI 2 ฝั่ง = ground-truth dataset ที่โตตามผู้ใช้
4. **Community marketplace** — UGC AI styles + creator economy = network effect

**โมเดลรายได้** — freemium **฿99–199/เดือน** (TrueMoney/PromptPay) + marketplace take-rate + seasonal payout · opex ต่ำ (local SLM, no salary) → **break-even ~125 paid users**

**Traction / สถานะ**
- ✅ shipping **v0.7.x** · Phase 0–2 เสร็จ (GSI + CV gank detection + voice ครบ loop)
- ✅ **latency พิสูจน์แล้ว** G-Signal p50=21.6ms / p99=67.4ms (budget 300ms)
- ✅ ONNX minimap detector (128 ฮีโร่), local SLM fallback, in-app updater
- ✅ **ban-safe + privacy-first** (read-only GSI/CV, no memory inject, local-only by default)

**คู่แข่ง** — Dota Plus (Valve, ไม่มีเสียง/เตือนเชิงรุก) · Dota Coach (เสียง+timer แต่ reactive, EN) · Questie (generic, vision ช้า 3–4s) → **G-Maiden = Dota-native + voice + predictive + ไทย**

**ถัดไป** — มุ่ง v1.0 (ครบ 12 โมดูล) → เปิด marketplace (post-v1.0) · validate ราคา + distribution (web/Vercel + พิจารณา Overwolf)

---
*อ้างอิง: [[business-requirements|BRD]] · [[competitive-brief|Competitive Brief]] · [[product-requirements|PRD]] · [[roadmap|ROADMAP]]*

# SPEC — Runtime Repair Governance (scope · handoff · anti-misuse)

> **Status:** Draft (2026-07-19, จากทิศทางที่ Boss กำหนด) — ยังไม่ implement
> **Scope:** G-Orchestra ในบทบาท **runtime self-debug governor** ที่ ship ไปกับ production G-Maiden
> — ไม่ใช่บทบาท dev orchestrator (งาน dev ใช้ RWANG `G:\Rwang` ซึ่งเป็น builder ของทั้งสองโปรดักต์)
> **อ้างอิง:** [SPEC--VERIFY-GATE](SPEC--VERIFY-GATE.md) · [SPEC--LOCAL-MODEL-ANTI-ERROR-LOOP](SPEC--LOCAL-MODEL-ANTI-ERROR-LOOP.md) ·
> [ADR-O-001](ADR-O-001--verify-gate.md) · `docs/README.md` §ขอบเขต SSOT (ฝั่ง G-Maiden)

---

## 1. ปัญหา (ทำไมต้องมี)

G-Maiden ออก production แล้วจะเจอปัญหา**เฉพาะเครื่อง** (install-specific) ที่การ push release
กลางแก้ไม่ได้ — เช่น GSI cfg หาย, voice-cache พัง, DXGI เริ่มไม่ได้เพราะ driver/monitor setup,
port :3000 โดน firewall. ทางเดียวที่ scale คือให้ **local LLM บนเครื่องผู้ใช้วางแผนแก้เอง** —
แต่ **ollama ที่ทำงานโดยไม่มี governance คืออันตราย**: LLM ที่แก้เครื่องคนอื่นแบบ unattended
มี failure mode ระดับ install พัง / ช่องโหว่ security / ความเสี่ยง anti-cheat.
G-Orchestra จึงต้องเป็น **governor** ของ loop นี้ — และ spec นี้กำหนดว่า govern แค่ไหน อย่างไร.

## 2. กฎออกแบบสูงสุด: Narrow Rails (ไม่ให้โมเดลคิดเยอะ)

> **โมเดลไม่ใช่ planner อิสระ — โมเดลเป็นตัว classify + เติมช่อง ใน runbook ที่ล็อกขั้น 1-2-3-4 ไว้แล้ว**

1. ทุกการซ่อมต้องเป็น **runbook ที่ประกาศล่วงหน้า** (ขั้นตอน deterministic เป็นลำดับ 1-2-3-4)
   — LLM มีหน้าที่แค่ (ก) วินิจฉัยว่าอาการเข้า runbook ไหน (ข) เติมพารามิเตอร์ที่ประกาศ slot ไว้
2. **ห้ามมี free-form action**: ไม่มีขั้นตอนไหนที่ LLM แต่งคำสั่ง shell/โค้ดเองได้ —
   ทุก action คือฟังก์ชัน Rust ที่เขียน/ตรวจไว้ก่อนแล้ว (LLM เลือกจากเมนู ไม่ได้ทำอาหารเอง)
3. **Diagnosis กว้าง — Repair แคบ**: อ่าน log/สถานะได้กว้าง แต่ลงมือได้เฉพาะ action ใน §3
4. ทุก runbook จบด้วย **machine-checkable verify** (สืบทอดหลัก [SPEC--VERIFY-GATE](SPEC--VERIFY-GATE.md):
   "done ≠ ผ่าน — ผ่านต้องพิสูจน์ได้") — LLM ห้ามเป็นผู้ตัดสินว่างานตัวเองสำเร็จ

## 3. Repair Scope — สิ่งที่แก้ได้ (action whitelist)

| หมวด | ตัวอย่าง action (Rust fn ที่ประกาศไว้) | เงื่อนไข |
| --- | --- | --- |
| Config ของแอปเอง | เขียน `gamestate_integration_gmaiden.cfg` ใหม่, reset settings ที่ corrupt | เฉพาะไฟล์ใน scope ของ G-Maiden |
| Cache / asset | ล้าง+re-extract voice-cache, ลบ pack ที่ manifest พัง | มี snapshot ก่อนลบ |
| Service ตัวเอง | restart GSI server, สลับ capture backend (DXGI→GDI→Lite) | ไม่แตะ process อื่น |
| Re-install component | ดึง component ที่ ship มากับ installer กลับมาวางใหม่ | ตรวจ signature ก่อนวาง |
| วินิจฉัยระบบ (read-only) | อ่าน error.log, เช็ค port :3000, เช็ค WebView2/driver version | ห้ามส่งออกนอกเครื่อง |

## 4. จุดอันตราย — บังคับ handoff (ห้าม auto-repair เด็ดขาด)

เจอเงื่อนไขต่อไปนี้ → **หยุด, รายงานผู้ใช้, เสนอช่องทาง support** — ไม่มีข้อยกเว้น:

1. การแก้ที่ต้องแตะ **binary ของแอป / self-modify โค้ดตัวเอง**
2. **Driver, OS setting, registry นอก key ของแอป, firewall rule** — ระดับระบบทั้งหมด
3. อะไรก็ตามที่แตะ **ผิว anti-cheat ของ Valve** (inject, hook, memory ของ Dota)
4. **Signature verify fail** ของ component ที่จะวาง — ห้ามวางต่อ, ห้าม retry แบบข้าม check
5. Runbook เดิม **fail ครบ N ครั้ง** (default 2) — ห้ามลูปแก้ต่อ (สืบทอด anti-error-loop)
6. การวินิจฉัยที่ **ไม่ match runbook ไหนเลย** — ไม่มีเมนู = ไม่มี action, handoff เท่านั้น

## 5. Anti-misuse — กันเอา G-Orchestra ไปใช้ผิดจุดประสงค์

G-Orchestra runtime **ไม่ใช่ general autonomous agent** และต้องบังคับไม่ให้กลายเป็น:

1. **Capability manifest ที่ sign แล้ว** ต่อโปรดักต์: runbook + action ทั้งหมดประกาศใน manifest
   ที่ ship มากับ installer และตรวจ signature ตอนโหลด — เพิ่ม runbook เองไม่ได้โดยไม่ผ่าน release
2. **ไม่มี arbitrary target**: governor ทำงานกับ install ของโปรดักต์ที่ประกาศใน manifest เท่านั้น
   — ชี้ไป path/repo/แอปอื่นไม่ได้
3. **Opt-in + kill switch**: ปิดเป็น default, ผู้ใช้เปิดเอง และปิดได้ตลอด
4. **Audit log local-only**: ทุก decision + action + verify result จดไว้บนเครื่อง (privacy-first
   ตามธรรมนูญ G-Maiden — ไม่มี egress)

## 6. Executor-agnostic pipeline (RWANG เป็นแค่ตัวหนึ่ง)

G-Orchestra คือ **governance หลัก** — ตัว executor ที่วิ่งใน pipeline เป็นอะไรก็ได้:

- **RWANG** (`G:\Rwang`) = reference executor ฝั่ง dev + สนามพิสูจน์ pattern (verify gate,
  plan→act→verify, escalation) ก่อน port เข้า runtime
- คนอื่นอาจใช้ **LangGraph / Graphiti / orchestrator อื่น** เป็น executor ของเขาเอง
- ดังนั้น interface ที่ G-Orchestra ต้อง expose คือ **contract, ไม่ใช่ implementation**:
  1. `capabilities(codebase) -> allowed feature set` — governor ตัดสินว่า codebase นั้นเปิด
     feature ไหนได้โดยไม่ทำลายระบบเดิม (เช่น เจอ CI ของเขาอยู่แล้ว → ไม่ inject ของเรา)
  2. `submit(plan) -> approved steps | handoff` — executor เสนอแผน, governor ตัดเหลือ
     เฉพาะขั้นที่อยู่ใน whitelist
  3. `verify(step) -> pass | fail` — gate กลางที่ executor ข้ามไม่ได้
- **กติกา SSOT เดิมคงอยู่**: executor ฝั่งไหน own พฤติกรรมไหน spec อยู่ฝั่งนั้น — governor
  ไม่ absorb executor เข้ามาเป็นส่วนของตัวเอง (บทเรียนจากการไม่ยุบ RWANG เข้า G-Orchestra)

## 7. งานถัดไป (ยังไม่เริ่ม)

- [ ] นิยาม schema ของ runbook manifest (id, trigger signature, steps, slots, verify, max_retry)
- [ ] ร่าง runbook ชุดแรกจากปัญหา install จริงที่เจอแล้ว: GSI cfg หาย · voice-cache พัง ·
      DXGI fail→Lite · port :3000 โดนบล็อก
- [ ] ผูก verify layer เข้ากับ engine เดิม ([ADR-O-001](ADR-O-001--verify-gate.md))
- [ ] ตัดสินใจ ADR: local model ตัวไหนเป็น diagnostic classifier (โยง G-Maiden slm.rs picks)

## Changelog
| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-07-19 | ร่างแรกจากทิศทาง Boss: Narrow Rails, repair whitelist, handoff triggers, anti-misuse manifest, executor-agnostic contract (RWANG/LangGraph/อื่น) |

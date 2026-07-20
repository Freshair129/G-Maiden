---
version: "0.3.0b"
title: "CR-005 W1B — Landing ภาษาไทย, G-Maiden Features และซ่อมเอกสาร Mojibake"
doc_id: "CR-005-W1B-thai-features-and-doc-encoding"
created_at: "2026-07-20T18:50:03+07:00,ATHER"
last_update: "2026-07-20T21:20:00+07:00,ATHER"
updated: "2026-07-20"
owner: "Boss"
status: "active"
superseded_by: null
attributes:
  doc_type: "change-request"
  domain: "landing-content-documentation-encoding"
  scope: "CR-005 W1B"
  language: "th"
  parent: "CR-005-landing-auth-social"
  related_docs:
    - "landing/DESIGN-SYSTEM.md"
    - ".brain/rca/2026-07-20-github-docs-mojibake.md"
    - "docs/product/product-requirements.md"
    - "docs/product/software-requirements-specification.md"
---

# CR-005 W1B — Landing ภาษาไทย, G-Maiden Features และซ่อมเอกสาร Mojibake

> **Approval:** Boss อนุมัติ implementation เมื่อ 2026-07-20 และกำชับให้ใช้ positioning แบบ
> `watch your back`/เก็บตกสิ่งที่อาจพลาด โดยไม่กล่าวอ้างการเห็นเกมล่วงหน้าหรือข้อมูลที่ผู้เล่นทั่วไปไม่เห็น

## 1. Task classification

| หัวข้อ | การจัดประเภท |
| --- | --- |
| Complexity | **C-2 — Documentation-Driven Implementation** |
| Change risk | **MEDIUM** |
| เหตุผล | เปลี่ยน information architecture/copy ของ public landing และซ่อมข้อความหลายเอกสารที่เผยแพร่บน GitHub |

ลำดับเมื่ออนุมัติ: **Doc approval → Feature-section concept → Encoding repair → Landing code → Tests → Alignment → Deploy → GitHub verification**

## 2. เป้าหมาย

1. ให้ Landing Page ใช้ภาษาไทยเป็นภาษาหลัก โดยคงชื่อผลิตภัณฑ์ ชื่อโมดูล และค่าทางเทคนิคที่จำเป็นเป็นอังกฤษ
2. เพิ่ม section อธิบายฟีเจอร์ที่ทำงานแล้วของ G-Maiden โดยยึด repo truth ไม่ใช้ roadmap claim ที่ยังไม่ ship
3. ซ่อมเอกสารที่แสดงเป็นตัวอักษรเอเลี่ยนบน GitHub ตาม RCA ที่แนบ
4. เพิ่ม encoding guard เพื่อไม่ให้อาการเดิมกลับมา

## 3. Parent/peer alignment

- Parent truth: `docs/product/product-requirements.md` และ
  `docs/product/software-requirements-specification.md`
- Runtime truth: `CLAUDE.md`, `AGENTS.md` และ implementation status ปัจจุบัน
- Landing peer: `landing/DESIGN-SYSTEM.md`, `landing/src/App.tsx`, `landing/src/index.css`
- ห้ามกล่าวว่า G-Motion มี heatmap/path model ที่ ship แล้ว; copy ต้องใช้คำว่า
  “ประเมินความเสี่ยงจากเวลาที่ศัตรูหายและตำแหน่งล่าสุด” ตาม implementation ปัจจุบัน
- ห้ามกล่าวว่า Gemini wired แล้ว; G-Master ที่ ship ใช้ Claude CLI/Anthropic API และ Ollama fallback

## 4. Thai-first content contract

### 4.1 Navigation

| Current | Proposed | Target |
| --- | --- | --- |
| Features | ฟีเจอร์ | `#features` |
| How it works | วิธีทำงาน | Technical Design Document |
| Privacy | ความเป็นส่วนตัว | SRS privacy section/document |
| FAQ | คำถามที่พบบ่อย | GitHub Issues |

Mobile menu, aria-label และสถานะ loading/error ต้องเป็นภาษาไทยด้วย ชื่อ `G-Maiden`, `GID`,
`Closed Beta`, `Dota 2` และชื่อ G-Series คงรูปเดิม

### 4.2 Hero copy

- Label: `AI Companion แบบเรียลไทม์สำหรับ Dota 2`
- Headline:
  - `โฟกัสกับเกม`
  - `ให้ Maiden`
  - `คอยระวังหลัง`
- Supporting copy:
  `Maiden คอยเก็บสัญญาณที่อาจหลุดสายตาระหว่างไฟต์ แจ้งเตือนด้วยเสียง และช่วยให้คุณจดจ่อกับการเล่นตรงหน้า`
- Metrics:
  - `≤300MS` / `ความหน่วงของสัญญาณ`
  - `≤2.5%` / `CPU เบื้องหลัง`
  - `LOCAL` / `ข้อมูลแมตช์อยู่ในเครื่อง`
- Primary CTA: `รับ GID สำหรับ Closed Beta`
- Secondary CTA: `ดูวิธีการทำงาน`

### 4.3 Feature section concept

ก่อนเขียน code ให้สร้าง concept เฉพาะ section แล้วตรวจด้วยภาพจริงตาม frontend skill
ส่วนนี้ต่อจาก fullscreen hero เป็น full-bleed cold booth surface ไม่ใช้ generic card grid:

- Heading: `บัดดี้ที่คอยระวังหลังให้คุณ`
- Supporting copy: `ระหว่างที่คุณโฟกัสกับไฟต์ Maiden ช่วยติดตามสัญญาณจากเกมและเตือนสิ่งที่อาจพลาดไป โดยไม่เล่นแทนคุณ`
- Layout: numbered signal rails 4 แถว สลับ alignment ระหว่าง copy กับ diagnostic visual ขนาดเล็ก
- Mobile: เรียงหนึ่งคอลัมน์ อ่านจากชื่อ → ประโยชน์ → proof โดยไม่มี horizontal overflow

| Rail | Feature | Thai-first copy | Evidence/proof |
| --- | --- | --- | --- |
| 01 | G-Sentry + G-Motion | `ติดตามฮีโร่ศัตรูที่หายจากวิสัยทัศน์ และเตือนเมื่อหายจากตำแหน่งล่าสุดนานผิดปกติ` | missing >5s; local 5-minute last-seen history/risk heuristic |
| 02 | G-Signal | `เตือนด้วยเสียงเมื่อสัญญาณความเสี่ยงถึงระดับที่ตั้งไว้ พร้อมแก้คำแนะนำเมื่อสถานการณ์เปลี่ยน` | target p50 ≤250ms; hard ceiling 300ms; belief revision |
| 03 | G-Master | `แนะนำจังหวะเล่นและไอเทมจากบริบทของแมตช์ โดยมีสมอง Local สำรอง` | Claude/Anthropic path + Ollama fallback |
| 04 | G-Sensory + G-Log | `Overlay โปร่งใสที่ไม่บดบังเกม และบันทึกแมตช์ไว้ในเครื่องเป็นหลัก` | CPU ≤2.5%; RAM ≤400MB; raw match/CV local-only |

ข้อความ privacy ต้องแยก identity enrollment ออกจาก match data อย่างชัดเจน: Closed Beta เก็บสถานะบัญชี/GID
บน `gstore`; raw match state, CV detections และ G-Log ไม่ถูกอัปโหลดจาก landing

### 4.4 Positioning guardrail

- ห้ามใช้คำว่า `เห็นเกมก่อน`, `เห็นสิ่งที่ผู้เล่นทั่วไปไม่เห็น`, `รู้ล่วงหน้า` หรือคำที่สื่อว่าเข้าถึงข้อมูลลับ
- ห้ามใช้ prediction percentage, enemy-intent score หรือ path projection เป็น marketing proof
- ใช้กรอบ `watch your back`, `เก็บตกสิ่งที่อาจพลาด`, `เตือนจากสัญญาณที่ตรวจพบ` และ `ไม่เล่นแทนคุณ`
- Diagnostic visual ต้องเป็น missing timer, signal threshold, advice context และ local log—not future prediction

## 5. Encoding repair scope and method

### 5.1 Scope

- ซ่อม Markdown 10 ไฟล์ที่ RCA ระบุ
- Regenerate `docs/atomic_index.jsonl` จาก Markdown ที่ซ่อมแล้ว
- เพิ่ม `.editorconfig` และ encoding-marker check ที่เล็กที่สุดซึ่งเข้ากับ validation workflow เดิม
- ไม่เปลี่ยนใจความของเอกสาร ไม่ rewrite สำนวน และไม่แตะไฟล์นอกผลสแกน

### 5.2 Safe repair algorithm

1. สร้าง dry-run report แสดง corrupted runs, ตำแหน่ง และผล decode ที่เสนอ
2. ใช้ inverse Windows-1252/Latin-1 mapping เฉพาะ run ที่ round-trip กลับ byte pattern เดิมได้
3. ช่วงที่เป็น mixed encoding หรือมี undefined control bytes ให้เทียบ revision/canonical peer แล้วแก้ด้วยการ review รายบรรทัด
4. ตรวจ structural invariants ก่อน/หลัง: frontmatter keys, headings, code fences, URLs, wikilinks และ table delimiters
5. Regenerate index หลัง source scan เป็นศูนย์เท่านั้น

ห้ามใช้ whole-file `encode/decode` แบบ blind เพราะ `engineering-spec.md` และไฟล์อื่นมีข้อความไทยที่ถูกต้องปะปนอยู่แล้ว

## 6. Implementation plan and verification

1. **Feature concept** → verify: visual inspection เทียบ cold booth system และ responsive reading order
2. **Encoding repair** → verify: zero-marker scan, UTF-8 decode, structural invariant diff
3. **Landing implementation** → verify: TypeScript/build, keyboard navigation, reduced motion, internal anchor
4. **Browser QA** → verify: `320×568`, `390×844`, `768×1024`, `1366×768`, `1440×900`; console 0 errors
5. **Doc alignment** → verify: `codedoc-aligner` exit 0; exit 2 = INDETERMINATE/ไม่ผ่าน
6. **Deployment** → verify: Vercel production URL, Thai hero/features, OAuth callback, no horizontal overflow
7. **GitHub verification** → verify: หลัง commit/push ให้เปิดอย่างน้อย 3 เอกสารบน GitHub และตรวจภาษาไทยจริง

## 7. Acceptance, success, and exit criteria

### Acceptance criteria

- Hero, navigation, metrics, feature descriptions และ UI state ใช้ภาษาไทยเป็นหลัก
- Feature section มี 4 rails ตาม §4.3 และทุก claim ตรงกับ shipped implementation
- ไม่มีการกล่าวอ้าง heatmap/path prediction หรือ Gemini ว่าพร้อมใช้แล้ว
- เอกสาร 10 ไฟล์และ generated index ไม่มี mojibake marker โดยไม่มีคำอธิบาย
- Encoding guard ป้องกัน regression ได้ด้วย non-zero exit

### Success criteria

- Landing build/TypeScript ผ่านและ browser console ไม่มี error
- ไม่มี overflow หรือข้อความถูกตัดใน viewport ที่กำหนด
- CTA Closed Beta/GID เดิมยังทำงานและ Thai copy ไม่ทำให้ state layout แตก
- Link, frontmatter, code fence และ doc graph ไม่เสียจากการ repair

### Exit criteria

- Concept และ documentation ได้รับอนุมัติก่อนแก้ code
- `codedoc-aligner` ผ่านหลัง implementation
- Vercel production และ GitHub rendering ถูกตรวจด้วย URL จริง
- แสดง version diff และรายการไฟล์ที่เปลี่ยนใน handoff

## 8. Out of scope

- เปลี่ยน desktop Command Deck, overlay หรือ Rust backend
- เพิ่มฟีเจอร์ใหม่ที่ยังไม่ ship ให้ G-Maiden
- เปลี่ยน Supabase schema/RLS เพิ่มจาก W1A
- Version bump, desktop release หรือ Git tag
- แก้สำนวน/โครงสร้างเอกสารที่ไม่เกี่ยวกับ encoding

## 9. Version diff

| Artifact | Before | Proposed |
| --- | --- | --- |
| CR-005 W1B | ไม่มี | `0.3.0b` active |
| Landing language | English-led hero + Thai CTA | Thai-first hero, nav, metrics, states and features |
| Landing IA | Hero only | Hero + shipped-feature section |
| Docs encoding gate | ไม่มี | UTF-8 editor setting + mojibake marker validation |

## 10. Implementation evidence

- Thai-first Hero/navigation/metrics และ feature rails 01–04 implement ใน `landing/src/App.tsx`
  และ `landing/src/index.css`
- Positioning ใช้ `watch your back`/เก็บตกสิ่งที่อาจพลาด และไม่มี see-ahead, hidden-information,
  intent percentage หรือ future-path claim
- ซ่อม mojibake Markdown 10 ไฟล์โดยคง heading, code fence, URL, wikilink และ Markdown link counts
- Regenerate `docs/atomic_index.jsonl`; `encoding-check.mjs` รายงาน 0 findings
- Doc CI gate: 193 tests ผ่าน; strict debt เดิม 14 รายการถูก checklist ครบ; gate exit 0
- Landing typecheck/build ผ่าน; browser QA ที่ 320/390/1440 ไม่มี horizontal overflow,
  mobile menu + Escape ผ่าน และ console 0 errors/0 warnings
- `codedoc-aligner` App↔README: exit 0, 2/2 chunks aligned; App↔CR ฉบับยาวมีผล advisory
  INDETERMINATE จาก model JSON formatting จึงไม่ถูกนับเป็น aligned
- Rust: 242 passed, 5 hardware-only ignored; clippy ผ่าน. Frontend: 220 Vitest ผ่าน,
  TypeScript ผ่าน, ESLint 0 errors (18 pre-existing warnings)
- Tauri smoke build ถูก block โดย `gpu-feeder.exe` ของ G-Maiden instance ที่กำลังรันล็อก target release;
  ไม่ได้หยุด app ของผู้ใช้และไม่พบ compile regression
- Vercel production deployment `dpl_9XuHcYRr2AeyQ1q5SNanKWu28MfA` status `READY`,
  alias `https://g-maiden-landing.vercel.app` ตอบ HTTP 200

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
| --- | --- | --- | --- | --- | --- |
| 0.1.0b | 2026-07-20 | candidate | Thai-first landing, shipped-feature rails and evidence-based encoding repair proposal | — | ATHER |
| 0.2.0b | 2026-07-20 | candidate | Reframed positioning to watch-your-back assistance; removed see-ahead and prediction overclaims | — | ATHER |
| 0.3.0b | 2026-07-20 | active | Implemented, verified and deployed Thai-first features plus GitHub documentation encoding repair | — | ATHER |

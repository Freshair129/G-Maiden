---
title: "Wireframe Package — Design QA"
doc_id: "design-qa"
status: "draft"
version: "1.1.2"
updated: 2026-10-19
owner: "Boss"
related_docs: ["10-wireframes", "11-wireflows", "12-user-flows", "05-sitemap-ia", "mvp-decisions"]
---

# Wireframe Package — Design QA

final result: passed

ผลนี้รับรอง **ชุดแบบและ viewer สำหรับตรวจงาน** เท่านั้น ไม่ใช่การรับรอง app runtime, release readiness หรือ native E2E.
ไม่พบ P0/P1/P2 คงค้างในขอบเขตการคงกริดและกรอบโค้งเดิม พร้อมการเชื่อม 7 หน้าใน viewer.

## 1. หลักฐานและขอบเขตเปรียบเทียบ

- Source visual truth: `D:/G-Maiden/.codex-artifacts/grid-discussion/g-maiden-layout-grid.html` — กริด A–J ที่ผู้ใช้เลือกเป็นฐาน.
- Rendered implementation: `http://127.0.0.1:8784/assets/wireframes/index.html#dashboard/main/live`.
- Artifact project root: `docs/design-system/assets/wireframes/`; รายงานนี้แยกจาก QA ของ production app ที่ repo root.
- Evidence directory: `C:/Users/suanr/.codex/visualizations/2026/10/12/01a12ea5-3bc5-7022-b121-9fe99c445480/g-maiden-wireframes/`.

| Evidence | สิ่งที่ตรวจ |
| --- | --- |
| `grid-source-full.png` | กริดต้นฉบับใน browser |
| `P01-live-full.png` | Dashboard live wireframe ใน browser |
| `grid-comparison.png` | Source/target รวมในภาพเดียว; normalize แต่ละ stage เป็น 1420×760 |
| `audio-shell-comparison.png` | เทียบเฉพาะโซน A และขอบ shell; label/volume/ANN/Signal อยู่ในกรอบ |
| `P01-default.png` ถึง `P07-default.png` | ทุกหน้าที่ viewport 1536×1024; ภาพ full-page รวม viewer chrome |
| `F02-wireflow-full.png` | ลำดับก่อนเกม → live → รายละเอียด → debrief → history พร้อม recovery |
| `seven-pages-overview.png` | Contact sheet จาก browser screenshots ทั้ง 7 หน้าและ F02 |
| `browser-checks.json`, `compact-check.json` | ผล DOM geometry, route interactions, flow coverage และ console |

Source capture เป็น 1265×841 px; source SVG 1233×672.36 CSS px มีแกน/ขอบซึ่งตัดออก 34/26/10/10 px.
Stage ใน source หลังตัดขอบประมาณ 1189×636.36 px ถูกย่อ/ขยายเป็น 1420×760 เพื่อเทียบ target stage ซึ่งเป็น 1420×760 CSS px ที่ 1:1.
Target full-page capture เป็น 1521×1141 px จาก viewport 1536×1024 (พื้นที่ scrollbar ไม่อยู่ในภาพ).
ไม่มีการเทียบความต่างจาก viewer chrome, image density หรือภาพย่อ flow เป็นความคลาดเคลื่อนของ layout.
Source มีเพียงป้ายโซน; target เพิ่ม wireframe content โดยตั้งใจ จึงเทียบ **geometry/silhouette** โดยตรง และตรวจ content ใหม่แยก.

## 2. Fidelity surfaces

| Surface | ผลตรวจและความต่างที่ยอมรับ |
| --- | --- |
| Fonts / typography | Segoe UI / Tahoma fallback; ป้ายหน้า/โซนเด่นกว่าคำอธิบาย; Thai wrapping อยู่ในกรอบ; source ไม่กำหนด product type scale จึงใช้ตัวอักษรของแบบร่าง ไม่อ้างว่าเป็น typography ของแอปสุดท้าย |
| Spacing / layout | Stage 1420×760, shell offset (12,12), A–J ตรงกริดฐาน; exact path ทั้ง 2 รูปแบบเทียบกับ `deck/prefs.ts`; Dashboard มี signal notch และหน้าอื่นใช้ base shell ตาม runtime |
| Colors / tokens | Graphite/ice สำหรับแบบร่าง; contrast แยก shell, region และ CTA; สีกริดต้นฉบับเป็นกลาง ส่วน target เพิ่มลำดับสีตาม Graphite Clarity โดยตั้งใจ |
| Image quality / assets | Source เป็นแผนผังเวกเตอร์ ไม่มีภาพฮีโร่/ภาพแพ็กให้จำลอง; กล่อง map, hero rows และ banner เป็น wireframe placeholders ที่ระบุชื่อชัด ไม่อ้างว่าเป็น asset สำเร็จของแอป |
| Copy / content | ใช้ชื่อเมนูไทยครบ 7 หน้าและโซน A–J; ค่าไม่มีแหล่งข้อมูลเป็น `—`; actions ที่แทน side effect มีคำว่า “จำลอง”; ข้อกำหนดเชิงเทคนิคเป็น annotation ของเอกสารออกแบบ ไม่ใช่ final product copy |

## 3. การตรวจ viewer

- เปิดครบ **7 หน้า / 23 แท็บและหมวด** ผ่าน UI; ทุก frame มีข้อความอยู่ใน stage bounds.
- เปิดครบ **8 wireflows**; 39 step thumbnails และ 18 recovery links มีปลายทางที่ระบุ.
- ตรวจ CTA: Dashboard → Live → Back, ตั้งค่า GSI → pending → success → Home, Voice → activate → editor error → cancel → Store, Profile → Account → loading → success → sign-out/error → local.
- ตรวจเมนู H/J, Escape, ปุ่มปิด, grid toggle, `Ctrl+7`, SVG link ผ่าน Enter, flow thumbnail และ recovery ไป partial history.
- Console ของ viewer: ไม่มี error/warning ในรอบที่ตรวจ.
- Desktop viewport 1536×1024: ตรวจภาพเต็มและภาพ focus; viewer มี page scroll สำหรับเอกสาร ส่วน stage ไม่มีส่วนประกอบทะลุกรอบ.
- Desktop 1200×780: stage ย่อเป็น 1129×604.25 CSS px; DOM text bounds ไม่ล้น stage. เป็นการตรวจ geometry ของ viewer ไม่ใช่การทดสอบ Tauri window sizing. ภาพ `P01-1200x780.png` มีข้อจำกัดการจับส่วนล่างหลัง resize; ไม่ใช้ภาพนี้อ้างว่าเห็นทุกส่วนใน viewport เดียว.
- ที่หน้าจอแคบกว่า 800px viewer อนุญาต pan แผนผัง; mobile/native/200% text zoom ไม่ได้เป็น acceptance ของชุด desktop wireframe นี้.

## 4. Comparison history

ก่อนเปรียบเทียบภาพ ปรับ semantics ของ SVG จาก `img` เป็น `group` เพื่อเปิดเผยลิงก์ใน accessibility tree และซ่อน anatomy ตัวอย่างใน empty/loading/error/signedout/expired.
การเปรียบเทียบภาพเต็ม source/target และภาพเฉพาะ audio/shell รอบแรกหลังแก้สองจุดนี้ไม่พบ P0/P1/P2; ไม่ได้เปลี่ยน geometry หลังการเปรียบเทียบ.
ไม่มี raster artwork จาก source ถูกแทนด้วยภาพวาดโค้ด; ผู้ใช้เลือก schematic grid เป็นฐานของ wireframe โดยตรง.

## 5. Source review — ผลแยกจาก visual QA

| Finding | Triage จาก source จริง |
| --- | --- |
| Economy tabs ยังมี code แต่ target เป็นหลัง MVP | คง 4 tabs จริงตาม `CommandDeck.tsx`; มี purchase/top-up call path ใน Store และ `TopupModal`; การมี path ไม่ยืนยัน live catalog, provider acceptance หรือ settlement. Wireframe ระบุ target deferred; implementation/policy disposition เป็นงานแยก, อย่าลบ code จาก nav evidence อย่างเดียว |
| Optional account ต่างจาก target local-first | ใน source baseline `origin/main` `621c83d6`, `App.tsx` mount `CommandDeck` ตรง; ไม่พบ `GmadFirstRunGate` component หรือ mount ใน source tree. [[05-sitemap-ia]] และ [[10-wireframes]] เป็น target/current reference; การแก้เอกสารไม่ใช่การเปลี่ยน runtime หรืออนุมัติ security migration |

หลัง triage วันที่ 2026-10-19 แก้ข้อความใน [[05-sitemap-ia]] และ [[12-user-flows]] ให้ตรงกับ mount state ที่ตรวจใน source และระบุ provider acceptance เป็น unverified.

## 6. Checklist และข้อจำกัด

- [x] คงกริดและ shell paths; ครบ 7 pages / 23 frames / 8 flows.
- [x] Generator ตรวจ 88 route/state combinations และ 369 active destinations; ไม่ใช่ 88 designs อิสระ.
- [x] Browser review พร้อม screenshot, focused comparison, routes และ console evidence.
- [x] แยก target, current implementation และ deferred scope ในเอกสาร.
- [ ] นำ cross-page CTAs, editor unsaved guard, local-first entrance และ history detail ไป implement ในงานแอปถัดไป.
- [ ] Native game/audio/auth/update/payment behavior และ resource budget ไม่อยู่ใน wireframe QA.

## 7. User Flow extension — 2026-10-12

ผลรอบนี้: **passed** สำหรับโหมด User Flow เพิ่มเติมตาม [[12-user-flows]].
Source คือชุด viewer/grid เดิมร่วมกับ flow contracts F01–F08; ไม่ออกแบบ product shell ใหม่.
ปลายทางเปิดตรง `index.html#user-flow/UF01`; Wireflow รองรับ `#wireflow/F01` และ reload คงมุมมองตาม URL.

- หลักฐาน browser อยู่ใน `user-flow/` ใต้ evidence directory §1: `UF01.png` ถึง `UF08.png`, `P01-after-user-flow.png`, `browser-checks.json`.
- Viewport 1280×720, CSS diagram กว้าง 1209px เทียบ viewBox 1420; browser capture scale 1. Full-page screenshots รวม viewer chrome และการเลื่อนอ่าน diagram เป็นสิ่งที่ตั้งใจ.
- **[P2 resolved]** รอบแรกเส้นที่ข้ามหลายขั้นพาด node ที่ไม่ใช่ปลายทาง ทำให้อ่านลำดับผิดได้ (`UF01-initial.png`). แก้ orthogonal routing ให้อ้อมกรอบ และเรียงทางหลัก UF01 ตรงกลาง; เมื่อข้าม node ใช้ side entry แยกจาก retry. ภาพเทียบก่อน/หลังรวมใน `routing-comparison.png`; generator ตรวจว่า connector ไม่ตัดผ่านกรอบอื่น.
- ตรวจภาพรวมและบริเวณลูกศรเข้า/ออกขั้นตั้งค่าและรอข้อมูล; ข้อความทุกผังไม่ออกนอก SVG. ยังใช้ Segoe UI/Tahoma, graphite/ice; สีอ่อนแยก decision/recovery/outcome และมีรูปทรง/ข้อความกำกับ ไม่ใช้สีอย่างเดียว.
- ภาพเป็น flow diagram เวกเตอร์โดยตรง ไม่ใช้ภาพ placeholder แทน artwork. ภาษาเป็น annotation สำหรับตรวจแบบ; หน้าแอปและรูปทรงเดิมยังอยู่ในโหมด Wireframe.
- เปิดครบ 8 เป้าหมาย / 61 screen links; ทดสอบ User Flow → F08, reload, Enter บน error outcome → P07/general/error, กลับ P01/live และเปิด UF01 ผ่าน URL.
- Console ไม่มี error/warning. Generator ตรวจ 430 valid destinations รวม wireframes/wireflows/user flows, node reachability, labeled decisions และเส้นไม่ผ่าน node อื่น; baseline 369 ใน §6 คือก่อนเพิ่ม User Flow.

ข้อจำกัดเดิมยังใช้: เป็นแบบเป้าหมาย; ไม่มี OAuth/audio/payment/update execution และยังไม่ได้ทดสอบ usability กับผู้เล่นจริง.

## Changelog
| Version | Date | Summary |
| --- | --- | --- |
| 1.0.0 | 2026-10-12 | Visual and browser QA for the seven-page grid wireframe package; source comparison, route checks. |
| 1.1.0 | 2026-10-12 | Added User Flow browser QA, connector fixes/comparison, deep-link checks for the new flow contract. |
| 1.1.1 | 2026-10-16 | Remove retired local review integration and related dependencies. |
| 1.1.2 | 2026-10-19 | แก้ source triage ของ optional account gate และ commerce call path; แยก code presence ออกจาก runtime/provider acceptance |

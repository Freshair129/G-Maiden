---
title: "13 — UI Technical Drawing Atlas"
doc_id: "13-ui-technical-drawing-atlas"
status: active
version: "0.1.0"
updated: "2026-10-30"
owner: "G-Maiden"
related_docs: ["03-layout", "04-components", "05-sitemap-ia", "07-combat-hud", "10-wireframes", "mvp-decisions"]
---

# UI Technical Drawing Atlas

[เปิดแบบ technical drawing ทั้ง 36 แผ่น](assets/ui-drawing-atlas-20261030/ui-technical-drawings.html)
· [ดาวน์โหลด SVG แยกแผ่น](assets/ui-drawing-atlas-20261030/ui-drawings-svg.zip)
· [ดูภาพรวม](assets/ui-drawing-atlas-20261030/atlas-overview.png)

แบบขาวดำจาก source snapshot `e8bd6695c57fe842569dfe9d419528d13adda06e` วันที่ 2026-10-30
ใช้สกิล dimensional-drawing วัด DOM และ CSS ที่เรนเดอร์ใน browser แล้วแทนข้อความ รูปเกม
โลโก้ และ icon artwork ด้วย slot เพื่อแสดงโครงสร้าง ขนาด ระยะห่าง มุมโค้ง และชั้นการซ้อน
ตัว HTML รวม drawing และ measurement data ไว้ในไฟล์เดียว เปิด offline ได้โดยไม่ใช้ server หรือ account

เอกสารนี้บันทึก **implementation snapshot** สำหรับเทียบกับ [[03-layout]], [[04-components]],
[[05-sitemap-ia]] และ [[07-combat-hud]]; ไม่เปลี่ยน design contract หรือ target wireframes ใน [[10-wireframes]]
และไม่รวม source ที่ Studio กำลังแก้แยกอยู่ซึ่งยังไม่ merge

## ขอบเขตของชุดแบบ

| แผ่น | Surface / state |
| --- | --- |
| 01 | Shared shell และ viewport scaling |
| 02 | Dashboard |
| 03–05 | Live: match, build, CV heroes |
| 06–07 | Voice: backend unavailable และ owned items |
| 08–11 | Store: catalog, wallet, inventory, ledger |
| 12–13 | Insights: overview และ history |
| 14–17 | Account: profile, wallet, ledger, security |
| 18–24 | Settings: general, overlay, voice, AI, modules/CV, privacy, system |
| 25 | Overlay editor แบบเต็มจอ |
| 26–29 | Command palette, shortcut sheet, profile menu, power menu |
| 30 | Voice inventory ที่มี pack — layout-only fixture |
| 31 | First-run setup dialog — layout-only fixture |
| 32 | In-game overlay: 19 modules และ 11 HUD keep-outs จาก source |
| 33 | Payment / purchase confirmation / receipt — source schematic |
| 34 | Owned inventory แบบมีรายการ — source schematic |
| 35 | Window presets และ scaling rules |
| 36 | Shared controls และ shadow envelope |

Measured states 30 ชุดครอบคลุมปลายทาง page/sub-tab/category ทั้ง 23 แห่งจากเมนูหลัก
รวมเมนู หน้าต่างย่อย และ fixture สำหรับโครงสร้างที่ต้องพึ่ง backend
แผ่น supplement แยกค่าจาก source ออกจากค่าที่วัดใน browser

## วิธีอ่านและใช้งาน

- เลือกแผ่นจากเมนูด้านบน หรือกด **Show all**; **Print** ใช้ print stylesheet สำหรับทั้งชุด
- คลิกกรอบ component เพื่อดู source class, x/y, width/height, padding, gap และ radius
  หรือเปิด component register ใต้แผ่น
- `Cxx` เป็น component identifier; รหัสมิติ `W/H`, `S`, `R`, `B` อ้างตารางของแผ่นนั้น
  แต่ละแผ่นมี scope ของรหัสแยกกัน
- หน่วยเป็น CSS px ที่ device scale 1; authored stage คือ 1420×760 และ panel คือ 1280×720
  plan ใช้ scale 0.665:1; ส่วน component detail ที่เป็น schematic ระบุว่า not to scale
- `HUG` = ตามเนื้อหา, `FLEX` = พื้นที่ที่เหลือ, `FILL` = เต็ม parent;
  ค่าที่ source ไม่กำหนดหรือไม่ได้วัดใช้ `[TBD]` และไม่กำหนดความกว้างจากข้อความ
- Overlay ใช้ reference 1920×1080, centre-anchored x/y เป็นเปอร์เซ็นต์
  footprint = reserved box × scale; `M1–M19` อ้าง module registry และ `K1–K11` คือ HUD keep-outs
  ตาม `layoutGeometry.ts` ไม่ใช่พื้นที่ CV detection
- Shadow envelope เป็น conventional geometric envelope จาก blur/spread/offset;
  Gaussian fade ไม่มีขอบพิกเซลตายตัว

## หลักฐานและข้อจำกัด

| หลักฐาน | สิ่งที่ยืนยัน |
| --- | --- |
| [Source manifest](assets/ui-drawing-atlas-20261030/source-manifest.json) | SHA-256 ของ source files ที่ใช้ใน snapshot |
| [Coverage](assets/ui-drawing-atlas-20261030/coverage.json) | รายการ measured states, source paths และข้อจำกัด |
| [Static validation](assets/ui-drawing-atlas-20261030/validation-static.json) | atlas script สร้าง 36 sheets และ SVG โดยไม่มี runtime script error |
| [Browser validation](assets/ui-drawing-atlas-20261030/validation-browser.json) | เรนเดอร์ที่ 1800×1300, label bounds, component inspection, dimension toggle และ all-sheets view |
| [Dashboard drawing](assets/ui-drawing-atlas-20261030/dashboard-drawing.png) | ภาพผลเรนเดอร์ของแผ่น Dashboard |

การสำรวจใช้ browser profile แยก ไม่มี credentials และบล็อก request ไปภายนอก
Account/Store เป็น signed-out หรือ unavailable state; Voice inventory ใช้ synthetic pack slots
กับ layout-only native bridge mock; first-run setup ใช้ mock เดียวกัน
ไม่มีการ activate pack, ซื้อสินค้า, ลงชื่อเข้าใช้ หรือ inject match state จริง
ข้อมูล geometry ฝังอยู่ใน HTML; ไม่รวม live GSI, CV detections, เสียง หรือ G-Log

Payment/receipt และ populated inventory เป็น source schematic โดย content height ยังเป็น HUG / `[TBD]`
ผลนี้เป็น browser/source architecture evidence เท่านั้น ไม่รับรอง native WebView2, authenticated flow,
gameplay, CV, audio, DPI compatibility หรือ performance ตาม [[mvp-decisions]]
ค่าที่ขึ้นกับ font/content อาจต่างจาก native Windows; acceptance ของ Studio candidate เป็นอีกชุดหลักฐาน

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-10-30 | บันทึก UI dimensional drawing 36 แผ่น พร้อม source hashes, coverage, SVG exports และผลตรวจ browser/static โดยแยก source schematic จาก measured states |

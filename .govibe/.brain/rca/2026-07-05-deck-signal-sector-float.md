# RCA — G-Signal sector "ลอย" (แก้ผิดจุด 2 รอบก่อนเจอ root cause)

- **วันที่:** 2026-07-05 (C)
- **Branch:** `feat/deck-glass-redesign-ds`
- **Component:** Command Deck HUD v2 — G-Signal sector (`Dashboard.tsx`, `CommandDeck.tsx`, `styles.css`)
- **Severity:** low (visual/layout) · **Process cost:** สูง (แก้ผิด 2 รอบ, ผู้ใช้ต้องเตือน "เช็คก่อนส่ง" 2 ครั้ง + RCA ถูกก่อนตัวแก้เอง)
- **สถานะ:** แก้จบใน commit `b77445f4`

## 1. อาการ (symptom)
ผู้ใช้แจ้ง "sector ขวาล่างมันลอย" (การ์ด G-Signal D/E/F/G ที่มุมขวาล่างของ deck ดูลอย ไม่ติดกับ layout) ต่อมาเพิ่ม "มันจางขึ้นแต่ขนาดไม่เปลี่ยน" หลังการแก้รอบที่ 2

## 2. Root cause — เทคนิค
การ์ด G-Signal ถูก render เป็น **FAB วางแบบ `position:absolute` ขนาดตายตัว (360×184px) อยู่นอก grid** โดยวางทับช่อง `gsignal` ที่ deck grid จองไว้แล้ว (`.board-bento` grid-area `gsignal` = col3 / row2-3, นิยามที่ `styles.css:3385`) → ขนาด/ตำแหน่งของ FAB ไม่มีทาง match กับ grid cell ของ sector อื่น = ดู "ลอย" และ "ขนาดไม่เปลี่ยน" เพราะมันไม่ได้ถูก grid คุม

**ต้นตอลึก:** session ก่อนย้าย signals ออกจาก bento grid ไปเป็น FAB เพื่อให้เข้ากับดีไซน์ "Subtract notch" (FAB ลอยในรูเว้า) → ดีไซน์ notch กับ grid system **ขัดกันตั้งแต่ต้น**. หลักฐานที่บ่งชี้เจตนาเดิม: โค้ดยังมี `.gsignal-bento` grid-area จองไว้ + `.gsignal-layout` CSS เก่าค้าง (dead code) = smoking gun ว่าเดิมตั้งใจให้อยู่ใน grid

## 3. Root cause — กระบวนการ (สำคัญกว่า)

| รอบ | สมมติฐาน | สิ่งที่ทำ | ทำไมพลาด |
|-----|----------|----------|----------|
| 1 | "ลอย" = การ์ดอยู่ในรู เห็น void ทะลุหลัง | ลบ bottom-right notch ให้ frost อยู่หลังการ์ด (`33ae6603`) | frost (`rgba(14,19,33,.6)`) กับ void (`#08090c`) เข้มพอ ๆ กัน → เปลี่ยนจริงแต่ตามองไม่เห็น |
| 2 | "ลอย" = เงา FAB (`--g-shadow-fab` 0 12px 34px) ยกตัวขึ้น | เปลี่ยนเป็น flat card, ตัดเงา/blur (`eb52bf21`) | จางลงจริง แต่ไม่แตะ misalignment เชิงโครงสร้าง |
| 3 ✅ | (ผู้ใช้ชี้) signals ไม่ได้อยู่ใน grid | ย้าย render เป็น `.gsignal-bento` grid cell + ลบ FAB (`b77445f4`) | ถูก |

**ทำไมไม่เจอตั้งแต่แรก:**
1. **วินิจฉัยจากคำว่า "ลอย" แล้วกระโดดแก้ cosmetic (notch, shadow) โดยไม่ตรวจโครงสร้างก่อน** — ไม่ตั้งคำถาม "ทำไม sector นี้เป็นอันเดียวที่ไม่อยู่ใน grid?"
2. **ไม่อ่าน layout system ที่คุม element ให้ครบก่อนแก้** — grid มี override ซ้อน 3 ชั้น (`styles.css:2239` → `:2248` → `:3385`); ชั้นที่ active จริงคือ `:3385` แต่ผมไปเจอช้า
3. **Confirmation bias จาก screenshot** — เห็น "เปลี่ยนนิดหน่อย" แล้วด่วนสรุปว่าสำเร็จ แทนที่จะ *วัด* geometry เทียบ sibling
4. **รายงานก่อน verify จริง** — ผู้ใช้ต้องเตือน "เช็คก่อนส่ง" 2 ครั้ง

## 4. Corrective actions
1. **โครงสร้างก่อน cosmetic:** element ที่ดู "ผิดที่/ลอย/ไม่ align" → เช็คก่อนว่ามันอยู่ใน layout system (grid/flow) หรือหลุดออกมา (`position:absolute`) *ก่อน* จูน CSS สี/เงา/ขอบ
2. **อ่าน layout ที่คุม element ให้ครบก่อนแตะ:** grep `grid-template*` / `grid-area` / `grid-column` ทั้งไฟล์ หา override ชั้นสุดท้ายที่ active จริง (ระวัง `!important` cascade)
3. **มองหา dead code / reserved slot:** class ที่นิยามไว้แต่ไม่ถูก render (`.gsignal-bento`, `.gsignal-layout`) = เผยเจตนาดีไซน์เดิม → มักคือทางแก้ที่ถูก
4. **Verify เชิงปริมาณ:** วัด `getBoundingClientRect`/`offset*` ของ element ที่มีปัญหา **เทียบ box ของ sibling** — misalignment เห็นเป็นตัวเลข ไม่ใช่ "ดูต่างนิดหน่อย"
5. **ยืนยันตรงกับ complaint จริงก่อนรายงาน** — โดยเฉพาะงาน visual: อย่ารายงานจนเห็นชัดว่าหาย (ทั้ง screenshot + geometry)

## 5. บทเรียนหลัก
คำบ่นของผู้ใช้ ("ลอย") เป็น **symptom** — ผมรักษา symptom (สี/เงา/รู) 2 รอบ ทั้งที่ควร trace ไป **diagnosis** (อยู่นอก grid) ตั้งแต่แรก. เมื่อ UI element ดูไม่เข้าพวก ให้สงสัย "โครงสร้าง/layout ownership" ก่อน "การตกแต่ง" เสมอ.

## 6. อ้างอิง
- commits: `33ae6603` (ลบ notch — รอบ 1), `eb52bf21` (flat card — รอบ 2), `b77445f4` (ย้ายเข้า grid — รอบ 3, ถูก)
- grid ที่ active: `styles.css:3380-3395` (`.board-bento` grid-template-areas: `minimap/agent/gsignal/warning/status`)
- auto-memory ที่เกี่ยว: [[design-system-ssot-v2]]

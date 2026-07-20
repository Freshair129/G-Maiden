# Audit: GSI Setup + Overlay Settings

- Date: 2026-06-23
- Scope: `GSI setup` และ `overlay settings`
- Source of evidence: เอกสารและโค้ดใน repo เท่านั้น
- Save target: local
- Language: Thai

## วิธีอ่านรายงานนี้

รายงานนี้เป็น `repo-based audit` ไม่ใช่การกดใช้งานจริงบนแอปที่รันอยู่ ดังนั้นหลักฐานหลักมาจาก flow ในโค้ดและเอกสารอ้างอิง โดยเฉพาะ:

- [`src/src/App.tsx`](file:///g:/G-Maiden/src/src/App.tsx)
- [`src-tauri/src/main.rs`](file:///g:/G-Maiden/src-tauri/src/main.rs)
- [`src-tauri/src/setup.rs`](file:///g:/G-Maiden/src-tauri/src/setup.rs)
- [`src-tauri/src/gsi.rs`](file:///g:/G-Maiden/src-tauri/src/gsi.rs)
- [[engineering-spec]] (`docs/architecture/engineering-spec.md`)
- [[technical-design-document]] (`docs/architecture/technical-design-document.md`)
- [[software-requirements-specification]] (`docs/product/software-requirements-specification.md`)

จุดที่ต้องอาศัย runtime, screenshot, หรือ interaction จริง จะถูกระบุเป็น `ข้อจำกัดของหลักฐาน`

---

## สรุปสั้น

ภาพรวมของสอง flow นี้ถือว่า `โครงสร้างดีและแยกหน้าที่ชัด`

- `GSI setup` แข็งแรงในเชิงเทคนิค เพราะใช้ Rust เป็นตัวตรวจ Steam, หา Dota library, เขียน config, และรับ GSI ผ่าน `127.0.0.1:3000/gsi`
- `overlay settings` ออกแบบ data flow ดีมาก เพราะ control state, persistence, และ overlay sync เดินเป็นเส้นตรง `localStorage -> React state -> emit('settings') -> overlay`

แต่มี 2 จุดเสี่ยงสำคัญในมุม UX:

1. ผู้ใช้สามารถเห็นสถานะว่า `ติดตั้งแล้ว` ทั้งที่ยังไม่ยืนยันว่า Dota ส่ง GSI จริง
2. ระบบตรวจ GSI config เช็กแค่ `มีไฟล์อยู่` ไม่ได้ยืนยันว่าเนื้อไฟล์ยังถูกต้อง

---

## User Flow Audit

### Flow A: GSI setup

#### Step list

1. แอปเปิดขึ้นมาและตรวจสถานะ GSI setup อัตโนมัติ
   - Health: ดี
   - Evidence: `invoke('detect_gsi_setup')` ถูกเรียกทั้งใน `SetupCard` และ welcome flow ที่ [`App.tsx`](file:///g:/G-Maiden/src/src/App.tsx) และ [`App.tsx`](file:///g:/G-Maiden/src/src/App.tsx)

2. ถ้ายังไม่พร้อม ผู้ใช้เห็นปุ่ม `ติดตั้ง GSI config`
   - Health: ดี
   - Evidence: ปุ่มติดตั้งถูกแสดงเมื่อพบ `dota_cfg_dir` ที่ [`App.tsx`](file:///g:/G-Maiden/src/src/App.tsx) และ [`App.tsx`](file:///g:/G-Maiden/src/src/App.tsx)

3. ระบบเขียนไฟล์ `gamestate_integration_gmaiden.cfg` ลงในโฟลเดอร์ Dota
   - Health: ดี
   - Evidence: `setup::install()` สร้างโฟลเดอร์และเขียนไฟล์ที่ [`setup.rs`](file:///g:/G-Maiden/src-tauri/src/setup.rs#L178)

4. ผู้ใช้ถูกบอกให้เปิดหรือรีสตาร์ท Dota 2 เพื่อให้ GSI โหลด
   - Health: พอใช้
   - Evidence: copy ใน welcome flow ระบุชัดที่ [`App.tsx`](file:///g:/G-Maiden/src/src/App.tsx) และ setup card ระบุคำใบ้ที่ [`App.tsx`](file:///g:/G-Maiden/src/src/App.tsx)

5. เมื่อ Dota ส่งข้อมูลจริง UI header และ live panel จึงสะท้อนสถานะ runtime
   - Health: ดี
   - Evidence: `gsi-status` ถูก emit จาก watchdog ที่ [`gsi.rs`](file:///g:/G-Maiden/src-tauri/src/gsi.rs#L119) และถูกใช้ใน chip สถานะที่ [`App.tsx`](file:///g:/G-Maiden/src/src/App.tsx)

#### Strengths

- onboarding สั้นและตรงประเด็น ไม่ยัดตัวเลือกเยอะเกินจำเป็น
- ปุ่มติดตั้งเป็น action เดียวที่ชัดเจน ไม่ทำให้ผู้ใช้ต้องหา path เอง
- สถานะ runtime แยกเป็น `Dota running` กับ `GSI active` ทำให้ UI ไม่โกหกเมื่อเกมปิดหรือ GSI เงียบ

#### UX findings

1. สถานะ `ติดตั้งแล้ว` ยังไม่เท่ากับ `ใช้งานได้จริง`
   - Severity: สูง
   - Evidence: `detect()` ถือว่า `installed = present` ทันทีถ้ามีไฟล์ cfg อยู่ที่ [`setup.rs`](file:///g:/G-Maiden/src-tauri/src/setup.rs#L159), แต่สถานะรับข้อมูลจริงจะเกิดภายหลังผ่าน watchdog และ `last_post_ms` ที่ [`gsi.rs`](file:///g:/G-Maiden/src-tauri/src/gsi.rs#L128)
   - Impact: ผู้ใช้อาจกด `พร้อมแล้ว!` แล้วเข้าใจว่า setup จบ ทั้งที่ยังไม่ได้เปิดหรือรีสตาร์ท Dota เลย
   - Recommendation: แยกสถานะใน UI ให้ชัดเป็น `ติดตั้ง config แล้ว` กับ `รับข้อมูลจากเกมแล้ว`

2. flow welcome ปล่อยให้ข้ามได้ แม้ยังไม่ติดตั้ง GSI
   - Severity: กลาง
   - Evidence: มีปุ่ม `ข้าม (ตั้งค่าเองภายหลัง)` ที่ [`App.tsx`](file:///g:/G-Maiden/src/src/App.tsx)
   - Impact: ลดแรงเสียดทานระยะสั้น แต่เพิ่มโอกาสที่ผู้ใช้ไปถึงหน้าหลักแล้วงงว่าทำไมไม่มีข้อมูลสด
   - Recommendation: ถ้าข้าม ควรมี banner หรือ checklist ค้างไว้ในหน้าหลักจนกว่าจะรับ GSI ได้จริง

3. เมื่อหา Dota path ไม่เจอ ระบบมีข้อความ error แต่ไม่มี next action ที่เป็นขั้นตอน
   - Severity: กลาง
   - Evidence: `detect()` ส่งกลับข้อความแบบ state-based เช่นไม่พบ Steam หรือไม่พบ Dota ที่ [`setup.rs`](file:///g:/G-Maiden/src-tauri/src/setup.rs#L136) และ [`setup.rs`](file:///g:/G-Maiden/src-tauri/src/setup.rs#L148)
   - Impact: คนที่ติดตั้ง Steam หลาย library หรือ registry แปลกอาจรู้ว่า fail แต่ไม่รู้ควรทำอะไรต่อ
   - Recommendation: เพิ่ม recovery copy แบบสั้น เช่น `เปิด Steam หนึ่งครั้ง`, `ตรวจว่า Dota 2 อยู่ใน library นี้`, `กดติดตั้งซ้ำ`

#### Accessibility / usability risks

- onboarding ใช้การพึ่งพา color + status dot ค่อนข้างมาก ถ้าคอนทราสต์ต่ำหรือผู้ใช้รีบดู อาจแยก `พร้อม` กับ `ไม่พร้อม` ได้ยาก
- step 2 ถูกลด opacity เมื่อ step 1 ยังไม่เสร็จที่ [`App.tsx`](file:///g:/G-Maiden/src/src/App.tsx) ซึ่งสื่อ hierarchy ดี แต่ก็ทำให้ข้อความสำคัญเรื่อง restart เกมดูด้อยลง

---

### Flow B: Overlay settings

#### Step list

1. โหลดค่าเริ่มต้นจาก `gm-settings`
   - Health: ดี
   - Evidence: `loadSettings()` ที่ [`App.tsx`](file:///g:/G-Maiden/src/src/App.tsx)

2. ผู้ใช้แก้ค่าการแสดง overlay เช่น visibility, position, opacity, stats panel
   - Health: ดีมาก
   - Evidence: settings controls อยู่ที่ [`App.tsx`](file:///g:/G-Maiden/src/src/App.tsx)

3. ทุกครั้งที่ค่าเปลี่ยน ระบบ persist ลง localStorage, broadcast ไป overlay, และ sync visibility ไป Rust
   - Health: ดีมาก
   - Evidence: effect กลางที่ [`App.tsx`](file:///g:/G-Maiden/src/src/App.tsx)

4. overlay window รับค่า settings ล่าสุดเมื่อพร้อมใช้งาน
   - Health: ดี
   - Evidence: handshake `overlay-ready -> emit('settings', current)` ที่ [`App.tsx`](file:///g:/G-Maiden/src/src/App.tsx)

5. ผู้ใช้สามารถ preview overlay โดยไม่ทำให้ GSI status เพี้ยน
   - Health: ดีมาก
   - Evidence: preview ส่ง fake `game-tick` แต่ไม่ส่ง fake `gsi-status` ที่ [`App.tsx`](file:///g:/G-Maiden/src/src/App.tsx)

#### Strengths

- data flow สะอาดและอ่านง่ายมาก ไม่มี state management ซ้อนหลายชั้น
- การแยก `preview-mode` ออกจาก `gsi-status` เป็นการออกแบบที่ละเอียดและถูกต้อง
- profile save/load ช่วยให้ overlay tuning ใช้งานจริงระหว่าง role หรือจอหลายแบบได้

#### UX findings

1. การบันทึก profile ใช้ `prompt()` แบบดิบ
   - Severity: กลาง
   - Evidence: `prompt('ชื่อโปรไฟล์:')` ที่ [`App.tsx`](file:///g:/G-Maiden/src/src/App.tsx)
   - Impact: UX สะดุดจาก visual language หลักของแอป, ไม่มี validation, และดูไม่ premium เท่าพื้นที่อื่น
   - Recommendation: เปลี่ยนเป็น inline input หรือ modal เล็กในสไตล์เดียวกับแอป

2. การ overwrite profile ชื่อซ้ำเกิดแบบเงียบ
   - Severity: กลาง
   - Evidence: `saveProfile()` กรองชื่อเดิมออกแล้วแทนที่ทันทีที่ [`App.tsx`](file:///g:/G-Maiden/src/src/App.tsx)
   - Impact: ผู้ใช้อาจเผลอทับ preset เดิมโดยไม่รู้ตัว
   - Recommendation: ถ้าชื่อซ้ำ ควรถามยืนยันหรือแสดงคำว่า `อัปเดตโปรไฟล์เดิม`

3. settings ไม่มี schema version ชัดเจน
   - Severity: ต่ำ
   - Evidence: มี migration เฉพาะ `showStats` เก่าใน `loadSettings()` ที่ [`App.tsx`](file:///g:/G-Maiden/src/src/App.tsx)
   - Impact: ตอนนี้ยังโอเค แต่ถ้า settings โตขึ้น risk เรื่อง backward cleanup จะเริ่มสูง
   - Recommendation: เพิ่ม `settingsVersion` เมื่อโครงสร้างเริ่มซับซ้อนกว่านี้

#### Accessibility / usability risks

- checkbox stats หลายตัวอยู่ในแถวเดียวกัน ถ้าหน้าจอแคบหรือ localization ยาวขึ้น readability จะลดลง
- slider `X/Y` และ `opacity` แสดงค่าเป็นตัวเลขดีแล้ว แต่ยังไม่มี live hint ว่า overlay จะไปซ้อนกับ UI เกมส่วนไหน

---

## Data Flow Audit

### Data flow A: GSI setup -> live GSI ingestion

1. Control UI เรียก `detect_gsi_setup`
   - Health: ดี
   - Path: `App.tsx -> invoke('detect_gsi_setup') -> main.rs -> setup::detect()`

2. Rust อ่าน Steam path จาก registry และหา Dota library จาก `libraryfolders.vdf`
   - Health: ดี
   - Evidence: [`setup.rs`](file:///g:/G-Maiden/src-tauri/src/setup.rs#L65), [`setup.rs`](file:///g:/G-Maiden/src-tauri/src/setup.rs#L117)

3. ถ้าผู้ใช้กดติดตั้ง ระบบเขียน `gamestate_integration_gmaiden.cfg`
   - Health: ดี
   - Evidence: [`setup.rs`](file:///g:/G-Maiden/src-tauri/src/setup.rs#L178)

4. Dota ส่ง JSON มาที่ `http://127.0.0.1:3000/gsi`
   - Health: ดี
   - Evidence: cfg body ที่ [`setup.rs`](file:///g:/G-Maiden/src-tauri/src/setup.rs#L19) และ spec ที่ [[engineering-spec|engineering-spec.md:82]]

5. `gsi.rs` parse body เป็น `GameTick`, mark post time, set in-game, log tick, emit `game-tick`
   - Health: ดีมาก
   - Evidence: [`gsi.rs`](file:///g:/G-Maiden/src-tauri/src/gsi.rs#L64), [`gsi.rs`](file:///g:/G-Maiden/src-tauri/src/gsi.rs#L89)

6. watchdog คำนวณ `gsi_active` จาก `last_post_ms` และ emit `gsi-status`
   - Health: ดีมาก
   - Evidence: [`gsi.rs`](file:///g:/G-Maiden/src-tauri/src/gsi.rs#L119)

#### Data findings

1. การ detect config ยังเป็น `existence check` ไม่ใช่ `integrity check`
   - Severity: สูง
   - Impact: ถ้าไฟล์มีอยู่แต่ uri ผิด, content เก่า, หรือถูกแก้มือ ระบบยังรายงานว่า installed
   - Recommendation: อ่านไฟล์กลับและ validate อย่างน้อย `uri`, `heartbeat`, `data fields`

2. separation ระหว่าง `setup status` กับ `runtime status` ทำถูกแล้ว แต่ยังไม่ถูกอธิบายในภาษาที่เข้าใจง่ายพอ
   - Severity: กลาง
   - Impact: logic ภายในดี แต่ perception ผู้ใช้อาจยังสับสน

---

### Data flow B: Overlay settings -> overlay runtime

1. โหลดค่า persisted จาก `gm-settings`
   - Health: ดี
   - Evidence: [`App.tsx`](file:///g:/G-Maiden/src/src/App.tsx)

2. UI เปลี่ยน state `s`
   - Health: ดี
   - Evidence: setter กลางที่ [`App.tsx`](file:///g:/G-Maiden/src/src/App.tsx)

3. effect เดียวทำ 3 อย่างพร้อมกัน
   - persist -> `localStorage.setItem`
   - broadcast -> `emit('settings', s)`
   - visibility sync -> `invoke('set_overlay_visible', { visible })`
   - Health: ดีมาก
   - Evidence: [`App.tsx`](file:///g:/G-Maiden/src/src/App.tsx)

4. overlay window รับค่าตั้งต้นผ่าน `overlay-ready`
   - Health: ดี
   - Evidence: [`App.tsx`](file:///g:/G-Maiden/src/src/App.tsx)

5. Rust คุมเฉพาะ visibility ของ native window ส่วนรายละเอียด layout อยู่ใน React
   - Health: ดีมาก
   - Evidence: [`main.rs`](file:///g:/G-Maiden/src-tauri/src/main.rs)

#### Data findings

1. flow นี้มี coupling ต่ำและ traceable สูง
   - Severity: บวก
   - Why it matters: debug ง่าย, regression surface เล็ก, และไม่เอา WebView logic ไปปน hot path ฝั่ง GSI

2. preview mode แยกจากสถานะจริงได้ดี
   - Severity: บวก
   - Why it matters: ป้องกันการ audit หรือ debug ผิดจาก synthetic state

---

## ข้อจำกัดของหลักฐาน

สิ่งที่รายงานนี้ `ยังยืนยันไม่ได้` จาก repo อย่างเดียว:

- visual polish จริงของ onboarding และ settings panel ระหว่างใช้งาน
- keyboard accessibility, focus order, screen-reader semantics
- runtime behavior บนหลาย resolution / multi-monitor
- ว่าการ restart Dota หลังติดตั้ง GSI ถูกเข้าใจง่ายแค่ไหนสำหรับผู้ใช้ใหม่
- ว่า overlay ไปบัง minimap, skill bar, หรือ panel เกมจริงหรือไม่

ถ้าจะ audit รอบถัดไปให้แน่นขึ้น ควรเพิ่ม:

- screenshot run จริงของ welcome flow และ settings panel
- capture ก่อน/หลังติดตั้ง GSI
- interaction audit ตอนเปิด preview, save profile, apply profile, Alt+S

---

## ข้อเสนอแนะที่คุ้มที่สุดถ้าจะปรับต่อ

1. แยก label ให้ชัด: `Config installed` กับ `Live data connected`
2. เพิ่ม validation ของเนื้อไฟล์ cfg ไม่ใช่เช็กแค่ไฟล์มีอยู่
3. เปลี่ยน save profile จาก `prompt()` เป็น UI ในธีมเดียวกับแอป
4. ถ้าผู้ใช้กดข้าม onboarding ให้มี reminder ถาวรจนกว่า GSI จะ active จริง

---

## บทสรุป

ถ้ามองจาก repo อย่างเดียว:

- `GSI setup` = โครงสร้างเทคนิคดี แต่ UX messaging ยังมีช่องว่างระหว่าง `ติดตั้งแล้ว` กับ `ใช้งานจริงแล้ว`
- `overlay settings` = เป็น flow ที่แข็งแรงกว่า ชัดกว่า และออกแบบ data flow ได้สะอาดมาก

ดังนั้นถ้าต้องเลือกแก้อย่างเดียวก่อน ผมแนะนำให้แก้ `GSI setup state model และ copy` ก่อน เพราะนี่คือจุดที่กระทบ activation ของผู้ใช้ใหม่โดยตรง






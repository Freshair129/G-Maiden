---
title: "แบบพรีวิวมินิแมปสด 60 FPS"
doc_id: 2026-10-29-minimap-live-preview-60fps-design
status: active
version: 0.2.0
updated: 2026-10-29
owner: G-Maiden
---

# แบบพรีวิวมินิแมปสด 60 FPS

## สถานะและเป้าหมาย

เจ้าของอนุมัติเป้าหมายและแบบพรีวิว 60 FPS วันที่ 2026-10-29 โดยคงงบ RAM 900,000,000 bytes และ VRZO เดิม พร้อมวัดผลในเกมก่อนรับรอง

คงตำแหน่งและขนาดการ์ดมินิแมปเดิม ให้ Dashboard และหน้าที่ใช้ภาพมินิแมปใช้ stream เดียวกัน แยกความถี่ของ **ภาพที่มองเห็น** ออกจาก **ผล CV/คำเตือน**; ภาพ 60 FPS ไม่ใช่หลักฐานว่าอ่านตำแหน่งหรือสถานะฮีโร่ได้ 60 ครั้งต่อวินาที

## ข้อเท็จจริงปัจจุบัน

- `src/src/companion.ts` ตั้ง `MINIMAP_IMG_MS = 500`: UI รับรูปได้ไม่เกินประมาณ 2 FPS
- `src-tauri/src/capture.rs` ตั้ง `MINIMAP_FRAME_INTERVAL_MS = 150`: backend ส่งภาพได้ไม่เกินประมาณ 6.7 FPS และสร้าง PNG/base64 หลัง `process_frame` ทำ CV
- `MinimapMirror` ใช้ `<img>` และ data URL; เปลี่ยนตัวเลข throttle อย่างเดียวจึงยังพึ่งรอบ CV และงานเข้ารหัสภาพ
- DXGI มีการ copy ROI จาก GPU ลง staging buffer อยู่แล้ว และรองรับ frame/session/display metadata; รูปพรีวิวเดิมใช้ crop เพิ่มภายใน ROI เดียวกับ CV
- เครื่องที่ตรวจมีสองจอ 1920×1080; ยังไม่มีหลักฐาน 60 FPS ในเกมหรือหลักฐานผ่านงบทรัพยากรสำหรับเส้นทางใหม่

## Approaches

1. **เร่ง PNG/base64 เดิม:** เปลี่ยนน้อย แต่ยังผูกกับ CV และเพิ่ม encode/IPC/decode ไม่เหมาะเป็นทางหลักสำหรับเป้าหมายนี้
2. **DXGI preview worker + binary IPC + Canvas:** ข้อเสนอสำหรับ MVP 60 FPS ใช้ API/dependency ที่มีอยู่ เตรียมเฉพาะ ROI และแยกการแสดงภาพจาก React snapshot/CV; ยังมี GPU readback และ CPU copy จึงต้องวัดจริง
3. **GPU texture ไป native compositor:** เป็นทางประเมินต่อหากข้อ 2 ผ่าน 60 FPS/งบไม่ได้ ต้องพิสูจน์การฝัง surface และ lifecycle ร่วมกับ Tauri/WebView2 ก่อน ไม่ถือว่ามี zero-copy integration สำเร็จแล้ว

เจ้าของอนุมัติข้อ 2 และเป้าหมาย 60 FPS; การแยก child process และ physical display fencing เป็น technical correction ภายในขอบเขตเดิม

## แบบที่เสนอ

### การจับภาพ

- มี headless child mode ของ EXE เดิมเป็นเจ้าของ DXGI preview แยก process จาก CV โดยใช้ bounded pipes, shared Windows QPC, lease และ inherited Job; หยุดเมื่อไม่มีผู้ชมหรือ resource pressure
- ใช้ monitor, ROI, crop และ geometry generation จากแหล่งนิยามเดียวกับ CV; งาน publish metadata ต้องไม่เพิ่ม blocking wait ใน G-Signal
- รอบ acquisition ตั้งเป้า 60 FPS ด้วย monotonic deadlines; เมื่อพลาดรอบให้ทิ้งรอบเก่า ไม่ยิง burst เพื่อไล่ตามเวลา
- ไม่ย้าย CV inference ไปทำ 60 ครั้งต่อวินาที และไม่ใช้เฟรม preview ไปเปลี่ยน roster, missing state, observation readiness หรือจุดเริ่มวัด latency ของคำเตือน
- Preview frame id แยก namespace ด้วย stream id/generation พร้อม session epoch, display id, acquisition timestamp และ ROI; ห้ามสับสนกับ frame id ของ CV instance
- ใช้พื้นที่ภาพเฉพาะมินิแมป ส่งออกไม่เกิน 320×320 RGBA8 ต่อเฟรม รักษา aspect ratio และ crop mapping เดิม

### การส่งและแสดงภาพ

- ใช้ Tauri binary response (`ipc::Response`) ไปเป็น ArrayBuffer; ไม่ส่งรายการตัวเลข JSON หรือ PNG/base64 ทุกเฟรม
- หนึ่งคำขอที่ยังไม่เสร็จต่อ stream; backend เก็บภาพล่าสุดใน bounded slots และ frontend เก็บเพียงเฟรมที่พร้อมวาด ไม่ต่อคิวภาพย้อนหลัง
- packet ระบุ protocol version, stream/generation, session epoch, frame id, acquisition timestamp, ขนาด/stride และ pixel format; ตรวจความยาวจริงและ hard limits ก่อนสร้าง ImageData/วาด
- Native command จำกัดกับ trusted Control surfaces ตาม bootstrap เดิม ไม่เพิ่ม HTTP endpoint หรือเปิดให้เว็บภายนอกดึงภาพ
- ใช้ Canvas และ requestAnimationFrame วาดภาพล่าสุดโดยตรง ไม่เรียก React state/Companion builders ทุกเฟรม
- ทุก consumer ใช้ store/lease เดียวกัน รองรับ mount/unmount/StrictMode โดยไม่เพิ่ม worker ซ้ำ
- client acknowledgement ใช้ generation/sequence fencing; คำขอตอบกลับหลัง unsubscribe, เปลี่ยนแมตช์ หรือเปลี่ยนจอ ต้องถูกทิ้ง
- หยุด preview เมื่อไม่มีผู้ชม/หน้าต่างซ่อนหรือย่อ และปล่อย buffers/duplication ตาม lifecycle; TTL ของ lease กันกรณี UI ตายโดยไม่ unsubscribe

### ขอบเขตภาพและ failure states

- ทำงานกับ Dota แบบ borderless-fullscreen ตาม ADR-13; ยังคงเป็น desktop/ROI capture จึงไม่สัญญาว่าจะเห็นเกมที่ถูกหน้าต่างอื่นบังหรือย่อเหมือน graphics-hook Game Capture
- เมื่อเกม/active session/geometry ใช้ไม่ได้ เปลี่ยน source, เฟรมค้าง หรือ worker ล้ม ให้ล้างภาพสดและแสดงสถานะ unavailable/stale อย่างตรงไปตรงมา
- เมื่อ DXGI preview ใช้ไม่ได้หรือระบบลดระดับเป็น GDI ไม่อ้างว่าได้ 60 FPS; พักหรือลด preview พร้อมสถานะจริง โดยไม่เปลี่ยนสถานะ capture/CV ที่ยังทำงานได้
- การใช้ duplication instance เพิ่มอาจชนข้อจำกัดของระบบหรือโปรแกรมจับภาพอื่น; preview ต้อง fail independently และไม่แย่ง retry/restart ของ critical capture
- ไม่แทรกโค้ด/อ่าน memory เกม ไม่บันทึกภาพลงดิสก์ และไม่ส่งภาพหรือข้อมูลผู้เล่นออกจากเครื่อง

## ทรัพยากรและสิ่งที่คงเดิม

- คงข้อกำหนดจาก `docs/product/mvp-decisions.md`: RAM รวม full Working Set ทุกโปรเซส ≤900,000,000 bytes, CPU ≤10% ต่อ sample 1 วินาที พร้อม operating hard cap เดิม, FPS เกมลด ≤3%, G-Signal p50≤250 ms และทุก measured sample≤300 ms
- Preview เป็นงานที่ลด/หยุดก่อน CV/เสียงเตือนเมื่อมี resource pressure; packet/buffer จำนวนจำกัดและไม่เพิ่ม dependency/encoder/network service เพื่อทางนี้
- ตัวเลข raw RGBA สูงสุดประมาณ 24.6 MB/s ที่ 320×320×4×60 เป็น bandwidth โดยประมาณ ไม่ใช่การวัด RAM/CPU หรือการรับรอง 60 FPS
- ใช้ RAM ตอนพัก 354.8 MB ณ snapshot วันที่ 2026-10-29 เป็นข้อมูลประกอบเท่านั้น พีค 108.2 MB เป็นของ main executable ไม่ใช่พีครวม และไม่ยกผลนี้เป็น acceptance ในเกม
- คง VRZO 0.2.0 เป็นเสียงที่เลือกเดิม แพ็กน้าค่อม/Signal, audio diagnostics, GSI และ consent/account/provider behavior ไม่เปลี่ยน

## เกณฑ์ตรวจและหลักฐานก่อนเรียกว่าเสร็จ

- Regression tests: bounded queue/packet parsing, subscription expiry, ไม่วาดข้าม generation/session/display, UI ซ่อนแล้วหยุด, fallback/stale states, ไม่มี per-frame React fan-out
- Timing tests: deadline pacing และการทิ้งรอบเก่า ไม่มี duplicate frame id ถูกนับเป็นภาพใหม่; ข้อมูลภาพ preview ไม่กลายเป็น CV observation
- Native transport qualification ก่อนรับรองเส้นทางนี้: วัด acquisition, binary IPC, frame age และการวาดจริงที่ขนาด ROI; requestAnimationFrame callbacks เพียงอย่างเดียวไม่ใช่ผล 60 FPS
- **เกณฑ์ยอมรับที่เสนอให้เจ้าของอนุมัติพร้อมแบบนี้:** ทดสอบบนจอ ≥60 Hz และเกมที่ baseline render ได้ ≥60 FPS ให้ warm-up 15 วินาที แล้ววัดต่อเนื่อง 60 วินาทีในฉากที่มีการเคลื่อนไหว ภาพสดต้องแสดงเฟรมใหม่เฉลี่ย ≥59.0 FPS (รองรับจอ 59.94 Hz), p95 ของช่วงระหว่างเฟรมใหม่ ≤25 ms, ไม่มีช่วงขาดเฟรมใหม่ >100 ms และ p95 อายุเฟรมจาก acquisition ถึงการแสดง ≤100 ms
- ต้องมีหลักฐานการนำเสนอภาพจริงประกอบการนับ frame id; นับเพียง invoke/rAF/คำสั่งวาดไม่ได้พิสูจน์ว่า compositor แสดง 60 FPS และเฟรมซ้ำไม่นับเป็นเฟรมใหม่
- วัดอายุเฟรมด้วย clock alignment ระหว่าง native monotonic clock กับ frontend พร้อมรายงาน uncertainty; ห้ามลบ timestamp คนละ clock origin โดยตรง และหากวัด presentation/clock uncertainty ไม่พอ ให้ระบุ unqualified แทนการสรุปผ่าน
- วัดก่อน/หลังในเกมและสถานะ UI เดียวกัน พร้อมเงื่อนไขรวมโปรเซสเดิม; กรณี idle, synthetic, native startup และ in-match acceptance แยกกัน
- Regression suite, Clippy, frontend TypeScript/ESLint/Vitest, doc gate และ native smoke build ต้องผ่าน; การเปิดโปรแกรมได้ไม่แทนหลักฐาน FPS/RAM/เสียงจริง
- หาก binary transport ไปไม่ถึงเป้าหมายในงบ ให้รายงานผลและทบทวนแบบ GPU compositor; ไม่เพิ่มเพดาน 900 MB หรือแก้ตัวเลข FPS เพื่ออ้างว่าผ่าน

## การกู้ซอร์สและแก้เฟรมค้าง

- Worktree เดิมสูญหาย; กู้ 30 ไฟล์จากประวัติและยืนยัน SHA-256 ตรงซอร์สที่ใช้ build ก่อนแก้ทุกไฟล์ สำเนาแยกเก็บที่ `D:/gm-recovery-backend` และ `D:/gm-recovery-frontend`
- GMMP v2 ใช้ source/session/lease/geometry และ physical display fingerprint+origin; frame เก่าที่ payload ถูกต้องต้องอ่านให้ครบและทิ้ง ห้ามแสดง ห้ามทำ worker restart เพียงเพราะอายุเกิน 250 ms
- บันทึกเวลาจับ/แปลง/ส่งภาพและเหตุผล worker หยุดแบบรวมช่วง ไม่มีภาพหรือข้อมูลผู้เล่นออกนอกเครื่อง; ลดงานซ้ำโดยคงค่า pixel และ input CV เดิม
- เกณฑ์รับรอง physical 60 FPS, CPU/RAM/FPS เกมและ latency ในเกมยังต้องวัดจริง การทดสอบ synthetic และ publication count ไม่ใช่หลักฐาน presentation

## References

- [Microsoft Desktop Duplication API](https://learn.microsoft.com/en-us/windows/win32/direct3ddxgi/desktop-dup-api): รับ desktop updates เป็น DXGI surface; การนำเสนอพรีวิวและต้นทุน readback เป็นหน้าที่แอป
- [Tauri: Calling Rust from the frontend](https://v2.tauri.app/develop/calling-rust/): binary response เป็น ArrayBuffer ได้; ไม่ใช่คำรับรอง throughput/zero-copy ของแอปนี้
- [OBS Game Capture Source](https://obsproject.com/kb/game-capture-source): graphics Game Capture เป็นวิธีต่างจาก desktop ROI; ไม่ใช้เป็นเหตุให้เพิ่ม hook/injection

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-10-29 | ร่างเป้าหมาย 60 FPS และเส้นทาง preview แยกจาก CV พร้อมขอบเขตทรัพยากรและหลักฐานที่ต้องวัด |
| 0.2.0 | 2026-10-29 | บันทึกการอนุมัติ ขอบเขต child preview และการกู้ซอร์ส/แก้เฟรมเก่าโดยคงเกณฑ์เดิม |

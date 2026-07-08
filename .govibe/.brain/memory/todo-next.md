# TODO / self-note - next session

อัปเดตล่าสุด: **2026-07-08** · ปิด CR-006 backend handoff batch + ไล่ CPU จริงจาก Task Manager จนแยกได้ว่าเหลืองาน frontend runtime/WebView2
รายงาน session ล่าสุด → `.govibe/.brain/session/2026-07-08-B-control-window-cpu-throttle.md`

## Highest-leverage next work - ล่าสุด
1. **Frontend CPU pass on real app path** - รับช่วงจาก `e87e20b3` และ session `2026-07-08-B-control-window-cpu-throttle.md`; เป้าคือ Task Manager-aligned grouped peak `<= 2.5%` ตอน Dota 2 เปิดจริง, ไม่ใช่แค่ average ต่ำ
2. **Profile visible control window/WebView2** - root cause ตอนนี้เหลือ compositor/render path; เริ่มที่ `src/src/companion.ts` consumer fan-out และ surface ที่อ่าน `useCompanionData()` ทั้งก้อน
3. **ตัดสินใจ policy ผลิตภัณฑ์** - ถ้ายังผ่าน peak ไม่ได้ ต้องเลือกว่าจะบังคับ “ซ่อน dashboard ระหว่างเล่น” เป็น UX/policy ชั่วคราว หรือจะลงทุนรื้อ visible control runtime ต่อ

## DONE ใน session 2026-07-08 B
- [DONE 2026-07-08] Level-up milestone logic ใช้ชุด `6,12,18,25` ทั้ง announcer และ persona path พร้อม skip-level tests
- [DONE 2026-07-08] Dire blindness fix - ส่ง `team_name` จาก GSI ไประบุ enemy ring color ใน CV
- [DONE 2026-07-08] Audio priority - `danger/gank/revision` ไม่โดน announcer ทับ
- [DONE 2026-07-08] Release verify gate - workflow มี `cargo test` + `clippy` + `vitest` + `tsc`
- [DONE 2026-07-08] Latency harness จริงจาก `GSI parse -> team-side routing -> signal -> audio enqueue`
- [DONE 2026-07-08] Governor CPU/RAM sampling บน Windows ย้ายไป Win32 native path ก่อน fallback PowerShell
- [DONE 2026-07-08] เพิ่ม `tests/perf/src/bin/perf_cpu_tree.rs` วัด root + child processes แบบใกล้ Task Manager
- [DONE 2026-07-08] แก้ control-window event churn: `useCompanionData()` เป็น singleton store + batch updates + inactive gate ใน `App.tsx`

## Hard-won facts / อย่าพลาดซ้ำ
- `useCompanionData()` เคยถูกเรียกหลายที่ในหน้าเดียว (`CommandDeck`, `Dashboard`, `CompanionPages`) จน subscribe Tauri events ซ้ำจริง - ถ้าจะ optimize deck ต่อ ให้เช็ก fan-out นี้ก่อนแตะ layout
- Task Manager ที่เห็น “มีวงเล็บหลาย task” คือ child `msedgewebview2.exe` จริง ไม่ใช่ DXGI thread ใน process เดียว
- หลังตัด governor noise แล้ว ถ้ายังหลุด CPU peak ให้คิดเรื่อง **WebView2 visible surface/compositing** ก่อน backend capture/audio
- เป้าชนะรอบถัดไปคือ grouped peak `<= 2.5%`; อย่าอ้างแค่ mean ต่ำแล้วถือว่าผ่าน spec
- ห้ามแตะ `src/src/CommandDeck.tsx`, `src/src/command-deck-shell-2026-07-08.css`, `docs/design-system/assets/cr-006-*` ถ้า user ยังไม่สั่งตรง ๆ

## Ranked next checks
1. วัด CPU แบบเดิมซ้ำหลังปิด animation / large transparent layers ทีละจุด และบันทึกผลเทียบ `perf_cpu_tree`
2. ตรวจว่ามี consumer ไหนยังอ่าน `data` ทั้ง object ทั้งที่ใช้เพียง slice เดียว
3. ถ้าจะทำ policy ชั่วคราว ให้เขียน UX copy/behavior ชัดว่าซ่อน dashboard แล้ว perf อยู่ในงบ แต่ visible control ยังไม่ผ่าน hard peak budget

---

## Trail เก่า - เก็บไว้เป็นบริบท

อัปเดตล่าสุด: **2026-07-08** · จบ full independent audit ทั้งระบบ + วางแผน level-up scoping.
รายงานเต็ม → `docs/audits/2026-07-07-independent-full-audit.md`. ด้านล่าง = thread ก่อนหน้า
(2026-07-05 deck HUD v2 / design-system · 2026-07-04 account/security · turn-15 trail 2026-06-21).

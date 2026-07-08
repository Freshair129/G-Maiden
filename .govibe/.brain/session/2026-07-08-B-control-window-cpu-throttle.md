# Session 2026-07-08 B - CR-006 backend handoff + control-window CPU follow-up

## Entry point
ผู้ใช้ให้ทำต่อบน `main` แตก branch ใน repo หลัก, ปิดงาน backend handoff CR-006 ที่ค้าง (`milestones 6/12/18/25`, Dire blindness, audio priority, CI gate, latency harness) แล้วตามด้วยการไล่ root cause CPU จาก **Windows Task Manager** ระหว่างเปิด Dota 2 จริง ก่อนสั่ง “ทำ 1+2 แล้ว note req to frontend agent ด้วย แล้ว commit”.

## Arc - เกิดอะไรขึ้น ทำไม
- ช่วงแรกงานเป็น backend handoff ตาม audit: เก็บ milestone logic ให้ announcer กับ persona path ใช้ชุดเดียวกัน, ทำ skip-level test, ส่ง `team_name` จาก GSI ไปเลือก enemy ring color ใน CV, ทำ audio priority ให้ `danger/gank/revision` ไม่โดน announcer ทับ, เติม release CI verify gate, และเขียน latency harness จริงจาก `GSI parse -> team-side routing -> signal -> audio enqueue`.
- จากนั้นผู้ใช้ชี้เพิ่มว่า **CPU peak 20%+ ที่เห็นมาจาก Task Manager โดยตรง** และตั้งคำถามว่าถ้าใช้ DXGI capture แล้วทำไมยังสูง. จุดนี้เลยเปลี่ยนจาก “เดา governor/capture” เป็น “วัด process tree แบบเดียวกับ Task Manager ก่อน”.
- เพิ่ม harness `tests/perf/src/bin/perf_cpu_tree.rs` เพื่อรวม `g-maiden.exe` + child processes ทั้ง WebView2/utility/feeder. ผลรอบแรกยืนยันว่าตัวกินจริงคือ `msedgewebview2.exe` ไม่ใช่ DXGI/Rust hot path.
- ชุดแก้รอบแรกตัด CV event ที่ไม่จำเป็นต่อ overlay/deck และเปลี่ยน governor ไปใช้ Win32 API แทน PowerShell เพื่อลบ measurement noise. ตัวเลขดีขึ้นมาก แต่ยังไม่ผ่าน spec peak.
- ระหว่างไล่ต่อพบ root cause ฝั่ง control window เอง: `useCompanionData()` ถูกเรียกหลายที่ในหน้าเดียว (`CommandDeck`, `Dashboard`, `CompanionPages`) ทำให้ subscribe Tauri events ซ้ำหลายชุดจริง. นี่อธิบายได้ว่าทำไมเปิด dashboard ค้างแล้ว WebView2 ยังคอมโพส/อัปเดตหนัก.
- รอบนี้เลยแก้ 2 แกนตามที่ผู้ใช้สั่ง:
  1. control-window inactive gate - ฝั่ง `App.tsx` หยุดรับ `game-tick` / `gsi-status` / `resource-stats` / `capture-mode` เมื่อ document/window ไม่ active
  2. deck subscription dedupe + coalesce - ย้าย `companion.ts` จาก per-hook listeners ไปเป็น singleton external store, batch live updates ~250ms, downsample `minimap-cv`, และไม่ notify ระหว่างหน้าต่างไม่ active
- ผลที่ได้: visible control window ยังไม่ผ่าน hard spec (`peak 7.46%`, `p95 3.03%`, `mean 0.65%`) แต่ดีขึ้นจากรอบก่อนที่เห็น peak ~`9-12%` หลังตัด noise แล้ว. สรุปเชิงสาเหตุชัดเจนว่า **เหลืองาน frontend runtime/compositing ต่อ**, ไม่ใช่ backend critical path แล้ว.
- ผู้ใช้ขอ `end-session` note ด้วย จึงต้องเขียน request ชัด ๆ ฝากให้ frontend agent รับช่วงต่อเรื่อง WebView2 render/compositing โดยอ้างอิงตัวเลขจริง ไม่ใช่สมมติฐาน.

## สิ่งที่ทำ
- `src-tauri/` + `tests/perf/` + `src/src/personaMilestones.ts` + docs/RCA - commit `e87e20b3`
  - milestone 6/12/18/25 ทั้ง announcer + persona path พร้อม skip-level tests
  - Dire blindness fix ผ่าน `team_name` จาก GSI -> runtime -> CV ring selection
  - audio priority / enqueue policy สำหรับ critical speech
  - release workflow verify gate
  - latency harness จริง และ CPU tree harness
  - governor native Win32 CPU/RAM sampling
  - overlay/deck event throttling + blur reduction
  - companion singleton store + control inactive gate
- `.govibe/.brain/session/2026-07-08-B-control-window-cpu-throttle.md` - uncommitted ระหว่างเขียนบันทึกนี้ (จะเข้า closeout commit)
- `.govibe/.brain/memory/todo-next.md` - uncommitted ระหว่างอัปเดต rolling note (จะเข้า closeout commit)
- `C:\Users\freshair\.claude\projects\G--G-Maiden\memory\command-deck-webview2-cpu-budget.md` + `MEMORY.md` pointer - uncommitted ระหว่างอัปเดต cross-session memory (จะเข้า closeout commit)

## Verify
| Gate | Result | Notes |
|---|---|---|
| `pnpm -C src exec tsc --noEmit` | PASS | หลัง refactor `companion.ts` singleton store + control inactive gate |
| `pnpm -C src test` | PASS | 13 files / 112 tests |
| `pnpm -C src build` | PASS | Vite production build ผ่าน; ยังมี chunk-size warnings เดิม |
| `cargo test --manifest-path src-tauri/Cargo.toml` | PASS | 136 passed / 4 ignored |
| `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` | PASS | เต็มตาม repo gate |
| `cargo test --manifest-path tests/perf/Cargo.toml` | PASS | harness crate |
| `cargo run --release --manifest-path tests/perf/Cargo.toml --bin perf_cpu_tree -- --pid 6168 --secs 30 --interval-ms 1000` | FAIL spec | mean `0.65%`, p50 `0.00%`, p95 `3.03%`, peak `7.46%` |
| `cargo run --release --manifest-path tests/perf/Cargo.toml --bin perf_cpu_tree -- --pid 6168 --secs 20 --interval-ms 1000` หลังซ่อน control | FAIL spec | mean `0.68%`, p50 `0.00%`, p95 `3.08%`, peak `7.58%`; ยังเป็น `msedgewebview2.exe` |

## Key numbers / results
- CPU tree harness ก่อน isolate ฝั่ง UI เคยเห็น `mean 107.90% / p95 126.15% / peak 127.28%` โดยตัวหนักคือ `msedgewebview2.exe`
- หลังตัด event flood + governor native measurement แต่ก่อน singleton store: visible app เหลือประมาณ `mean 0.39-0.46%`, peak ยัง `9.23-12.31%`
- หลัง singleton store + inactive gate รอบล่าสุด: visible control = `mean 0.65%`, `p95 3.03%`, `peak 7.46%`
- สถานะปัจจุบัน: backend hot path และ process-measurement noise ถูกกดลงแล้ว แต่ **visible WebView2 surface ยังเป็นตัวทำให้หลุด hard peak budget**

## Artifacts
- RCA:
  - `.brain/rca/2026-07-08-backend-cr006-handoff-milestones-dire-audio-latency.md`
  - `.brain/rca/2026-07-08-dire-blindness-audio-priority-make-it-gated.md`
  - `.brain/rca/2026-07-08-cpu-budget-overrun-observation.md`
- Perf harness:
  - `tests/perf/src/bin/perf_cpu_tree.rs`
  - `tests/perf/Cargo.toml`
- Frontend runtime files:
  - `src/src/companion.ts`
  - `src/src/App.tsx`
- Docs:
  - `docs/features/FEAT-G-SENSORY.md`
  - `docs/architecture/engineering-spec.md`
  - `docs/product/roadmap.md`
- Live actions:
  - รัน `G:\G-Maiden\src-tauri\target\release\g-maiden.exe` กับ Dota 2 จริง
  - วัด CPU หลายรอบด้วย `perf_cpu_tree`
  - ไม่มี release / ไม่มี tag / ไม่มี live DB mutation

## Request ต่อให้ frontend agent
1. Treat the remaining CPU issue as **frontend runtime / WebView2 compositing work**, not backend capture/audio work.
2. Start from `src/src/companion.ts` and remove any remaining whole-shell rerender fan-out; verify how many deck surfaces still subscribe/read the whole `data` object each frame.
3. Profile visible control window with WebView2 tools or render counters if available; prioritize compositor-heavy layers, animated gradients, and large transparent regions over backend logic.
4. Keep `CommandDeck.tsx`, `src/src/command-deck-shell-2026-07-08.css`, and `docs/design-system/assets/cr-006-*` untouched unless explicitly asked; prefer behavior/runtime fixes around them first.
5. Success criterion is not “average looks low” - it is **Task Manager-aligned grouped peak <= 2.5%** on the real app path while Dota 2 is open.

## State ปลาย turn
- Branch: `codex/backend-cr006-handoff-main-20260708`
- Product-work commit already created: `e87e20b3`
- Working tree ณ ตอนเขียนบันทึกนี้: dirty เฉพาะ closeout artifacts (`.govibe/.brain/*`, cross-session memory, และ `run-ui.bat` ที่ไม่ได้แตะ)
- Pending / deferred:
  1. ให้ frontend agent รับช่วง WebView2/control-window CPU path ต่อจากตัวเลขใน session นี้
  2. ตัดสินใจว่าจะไล่ perf ให้ผ่านตอน control visible ตลอดหรือยอม policy “เล่นเกมให้ซ่อน dashboard”
  3. `run-ui.bat` ยัง untracked และไม่เกี่ยวกับ session นี้

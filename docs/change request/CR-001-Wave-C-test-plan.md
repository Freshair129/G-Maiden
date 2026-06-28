---
title: "CR-001 Wave C — In-Game Validation Test Plan (DXGI Migration)"
doc_id: "CR-001-Wave-C-test-plan"
status: "ready to execute"
version: "1.0.0"
updated: "2026-06-29"
owner: "Boss"
related_docs: ["CR-001-REVIEW-execution-plan", "ADR-13-dxgi-capture-migration", "IMPL-PLAN-DXGI-migration"]
---

# CR-001 Wave C — In-Game Validation Test Plan

> ทดสอบด้วย **release build** `src-tauri\target\release\g-maiden.exe` (หรือติดตั้งจาก
> `bundle\nsis\G-Maiden_0.7.9_x64-setup.exe`). Dota 2 ต้องตั้ง launch options
> **`-window -noborder`** (borderless). error.log อยู่ที่
> `%LOCALAPPDATA%\G-Maiden\logs\error.log`.
>
> **AC** = Acceptance Criteria (ต้องผ่านทุกข้อ = gate). **SC** = Success Criteria
> (ควรผ่าน = คุณภาพ/รอง; fail ได้แต่ต้องบันทึก).

## Definition of Done (Wave C)
```
[_] AC ของ T1–T9 ผ่านครบทุกข้อ
[_] SC รีวิวครบ — ข้อที่ไม่ผ่านบันทึกเหตุผล
[_] เก็บ error.log ของแมตช์ทดสอบไว้ 1 ไฟล์
[_] สรุปผล → ตัดสิน: ปล่อย release (tag vX.Y.Z) หรือ แก้ก่อน
```

---

## T1 — DXGI capture active (functional)
**ทำ:** เปิด release exe → ดู System card + เปิด error.log
```
■ AC
  [_] badge = "DXGI" (เขียว) — ไม่ใช่ "Lite"
  [_] error.log มี "[capture] DXGI active — WxH, minimap …"
  [_] ไม่มี "DXGI unavailable" / ไม่ตกไป Lite
■ SC
  [_] minimap region ตรงความละเอียดจอ (เช่น 1080p → 168px @ (0,912))
  [_] UI render ครบ ไม่ขาว/ไม่ค้าง
```

## T2 — CPU budget (หัวใจของงานนี้)
**ทำ:** อยู่ในแมตช์จริง (borderless) ≥5 นาที → ดู CPU ของ g-maiden.exe (resource card + Task Manager)
```
■ AC
  [_] CPU เฉลี่ย ≤ 2.5% ต่อเนื่อง (SRS hard limit; เดิม ~8%)
■ SC
  [_] CPU ≤ 1.5% (เป้า ADR-13)
  [_] CPU ไม่พุ่งตอน Sentry suspicious (8 Hz) เกิน budget
```

## T3 — Frame health / no stalls (หัวใจของงานนี้)
**ทำ:** เล่นจบ 1 แมตช์ → ตรวจ error.log
```
■ AC
  [_] "SLOW frame" = 0 รายการ ตลอดแมตช์ (เดิม 1,294)
■ SC
  [_] ไม่มี "AcquireNextFrame error" รัวๆ
  [_] ภาพ/overlay ลื่น ไม่มีอาการค้างเป็นวินาที
```

## T4 — RAM budget
**ทำ:** ดู RAM ของ g-maiden.exe ตลอดแมตช์
```
■ AC
  [_] RAM ≤ 400 MB ขณะเปิดทุกโมดูล (SRS)
■ SC
  [_] RAM นิ่ง ไม่ไต่ขึ้นเรื่อยๆ (ไม่มี leak)
```

## T5 — Minimap CV / gank detection (no regression)
**ทำ:** ในแมตช์ ปล่อยให้ศัตรูหายจาก minimap (อยู่ในป่า/หมอก)
```
■ AC
  [_] G-Sentry ขึ้น enemy-missing (overlay/ log) เมื่อศัตรูหาย >5s
  [_] G-Signal เตือน gank (เสียง + gank-alert) ภายใน ~3s ของ threshold
  [_] G-Meter ขยับ — ไม่ค้าง "ปลอดภัย" ตลอด
■ SC
  [_] Belief Revision พูดแก้ ("เอ๊ะ! เดี๋ยวก่อน…") เมื่ออันตรายหาย
  [_] ตำแหน่ง detection ตรง minimap จริง (เช็กด้วย calibration mode)
```

## T6 — OBS coexistence (streamer-ready — เป้าหมายเชิงกลยุทธ์)
**ทำ:** เปิด OBS (capture/stream) + G-Maiden + Dota borderless พร้อมกัน
```
■ AC
  [_] ไม่มี capture conflict — ทั้ง OBS และ G-Maiden ได้ภาพพร้อมกัน
  [_] Dota FPS ตก ≤ 3% เทียบ baseline (ไม่มี G-Maiden)
  [_] G-Maiden ยังได้ frame (badge ยัง DXGI, detection ทำงาน)
■ SC
  [_] OBS stream ลื่น ไม่กระตุกจาก G-Maiden
  [_] CPU รวม (Dota+OBS+G-Maiden) รับได้
```

## T7 — Lite-mode fallback (graceful degradation)
**ทำ:** ตั้ง Dota เป็น **exclusive fullscreen** แล้วเปิด G-Maiden ขณะนั้น
```
■ AC
  [_] badge = "Lite" (เหลือง) — ไม่ crash
  [_] announcer / overlay / G-Master / kill-banner ยังทำงาน
  [_] error.log มี "DXGI unavailable … Lite mode"
■ SC
  [_] tooltip Lite อธิบายให้ใช้ borderless
  [_] กลับเป็น borderless + เปิดใหม่ → badge เป็น DXGI อีกครั้ง
```

## T8 — ACCESS_LOST recovery (robustness)
**ทำ:** ระหว่าง capture → alt-tab / เปลี่ยนความละเอียด / lock-unlock จอ
```
■ AC
  [_] capture ฟื้นเอง — ไม่ crash, ไม่ค้างถาวร
■ SC
  [_] error.log อาจขึ้น "access lost — recreating duplication" แล้ว resume
  [_] detection กลับมาทำงานภายใน ~2s
```

## T9 — Non-CV features regression
**ทำ:** ใช้งานฟีเจอร์ที่ไม่เกี่ยว capture ตามปกติ
```
■ AC
  [_] announcer packs ดังตาม event
  [_] kill banner + streak ladder ถูกต้อง
  [_] overlay HUD + G-Master advice ทำงาน
  [_] hotkeys: Ctrl+Alt+S, Alt+↑, Alt+↓, Alt+M
■ SC
  [_] ไม่มี error ใหม่ใน error.log ที่ไม่เกี่ยว capture
```

---

## (ออปชัน) Automated perf check
```
cd tests/perf
cargo run --release --bin perf_p7      # ขณะ G-Maiden + Dota รันอยู่
```
gate: RAM ≤ 400 MB + FPS-drop ≤ 3% (CPU% ดูแยกจาก resource card)

## ผลทดสอบ (กรอก)
| Topic | AC | SC | หมายเหตุ / ค่าที่วัดได้ |
|---|---|---|---|
| T1 DXGI active | ☐ | ☐ | badge=… |
| T2 CPU | ☐ | ☐ | CPU=…% |
| T3 frame/SLOW | ☐ | ☐ | SLOW=… |
| T4 RAM | ☐ | ☐ | RAM=…MB |
| T5 gank CV | ☐ | ☐ | |
| T6 OBS | ☐ | ☐ | FPS drop=…% |
| T7 Lite | ☐ | ☐ | |
| T8 recovery | ☐ | ☐ | |
| T9 regression | ☐ | ☐ | |

**Verdict:** ☐ ผ่าน → cut release (bump version + CHANGELOG + tag) ☐ ต้องแก้: …

# Session — 2026-06-21 (turn 12) · G-Master auto-advice (proactive advisor)

ต่อจาก `2026-06-21-voice-and-master.md` ที่ทำ G-Master ปุ่มขอ. turn นี้เปลี่ยนเป็น
proactive: Maiden ตื่นเองเมื่อ key moments — Crystal Maiden caster ที่ comment
สถานการณ์ระหว่างเล่น เหมือน mentor นั่งดูข้าง ๆ.

## สิ่งที่ทำ (commit `5ee9286`, frontend only)

### Triggers (เข้มงวด — กัน Plan quota spam)

| Trigger | เหตุผล |
|---------|--------|
| **Level milestone 6/11/16** | ulti unlock + 2 upgrades — จุดเปลี่ยนกำลังหลัก |
| **Death streak**: ตาย 2 รอบในเวลาเกม <5 นาที | โดน gank รัว → ต้องปรับแผน |

### Throttle layers (สามชั้น)

1. **Per-trigger cooldown 10 clock-min** — เลเวล 6 จะ trigger ครั้งเดียวต่อ
   แมตช์ (ไม่มีทาง level up จาก 6 → 6 อีก แต่ถ้าจะ deathStreak ที่ 5 นาที 12
   นาที 19 นาที ก็จะ trigger สามครั้งห่างกัน)
2. **Server-side throttle 30s wallclock** ของ `master::advise` — ถ้า level 6 + death
   streak ใกล้กัน, ครั้งที่ 2 ได้ cached
3. **Plan quota** ของ Claude เอง — ตัวสุดท้าย

### State refs (ใหม่ใน Overlay)

```ts
const recentDeathClock = useRef<number | null>(null)
const advisedAt = useRef<Record<string, number>>({})  // key → last_clock
```

### Flow

```
prev tick + new tick
  → detect triggers (level transition / death streak)
  → filter by cooldown (advisedAt[key])
  → request_advice(tick)         // 30s throttle on Rust side
  → speak_event('advice', text)  // try WAV → fall back SAPI
```

`silent fail บน catch` (ไม่ขึ้น error toast) — auto mode ไม่ควรทำให้ user
เสียสมาธิ ถ้า `claude` CLI ตอนนั้นไม่พร้อม.

### Settings + UI

- `Settings.autoAdvice` (default **false** — opt-in: เสียงยาว + ใช้ quota แม้ cache)
- MasterCard เพิ่ม Toggle ในแถวบน + คำอธิบาย "พูดอัตโนมัติเมื่อเลเวล 6/11/16
  หรือตาย 2 รอบติด"

## Verify (4-layer)

| Layer | ผ่าน |
|-------|------|
| `tsc --noEmit` | clean |
| `pnpm tauri build` | bundles ออก |
| Pattern Settings→event→Overlay-effect→invoke | ทดสอบแล้วใน turn 5/6 (persona lines) |
| request_advice + speak_event | smoke + cargo test ใน turn 11 |

โค้ดใหม่เป็น plain JS trigger detection — straightforward path-through ไม่มี
side-effect ใหม่ที่ต้อง integration test เพิ่ม.

## บทเรียน

1. **3-layer throttle ดีกว่า 1-layer แน่นกว่า** — UI cooldown (per-trigger) +
   server cooldown (per-call) + provider quota (Plan) → กัน spam แต่ไม่ block
   legitimate triggers ที่อยู่นอก window.
2. **`advisedAt: Record<string, number>` pattern** ใน `useRef` — สะดวกกว่า
   Map สำหรับ key dynamic. ทุก trigger key (เช่น `lvl6`, `lvl11`, `deathStreak`)
   มี cooldown แยก, ไม่ปนกัน.
3. **silent fail ของ auto-mode** เป็น UX correct — manual click ที่ปุ่มต้องเห็น
   error เพื่อรู้ว่าเกิดอะไร, auto-trigger เกิดเอง user ไม่ทันคาดหวัง — fail
   เงียบดีกว่าโผล่ error สีแดง.
4. **opt-in default** ถูกต้องสำหรับ feature ที่ "พูดเองได้" — user ต้องเป็นคน
   ตัดสินว่ายอมให้ Maiden พูดเองหรือไม่ (อาจรบกวน communication ในทีม).
5. **Trigger เลือก discriminating** สำคัญกว่าจำนวน — 2 triggers (lvl milestone +
   death streak) ก็พอ; ถ้าเพิ่มเช่น "เก็บเงินทันที 500 gold" จะกลายเป็น spam.

## State ปลาย turn

- Branch `main` ahead of origin by 23 commits.
- งานต่อ: WAV asset generation (user), G-Sentry minimap CV (เกมจริง),
  Control GUI polish (theme/hotkey custom), CLAUDE.md update (ขอ confirm).

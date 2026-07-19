# FEAT-G-REVIVE — Death Analysis & Buyback Advisor

> **Module:** G-Revive · **Priority:** P1 · **Phase:** 5–6
> **SRS:** [[software-requirements-specification|SRS]] §3.4 (advisor family) · related: [[FEAT-G-MASTER]], [[FEAT-G-SIGNAL]]

---

## 1. Purpose

วิเคราะห์ช่วง **ตาย → รอเกิด (respawn window)** — เวลาที่ผู้เล่นกดอะไรไม่ได้นอกจาก "ซื้อเกิด" (buyback)
จึงเป็น latency budget ที่ใจป้ำที่สุดในแอป G-Revive ตอบ 2 อย่าง:

1. **ทำไมตาย** (root cause) — โดนจับเพราะ positioning / ไม่มี escape / no vision
2. **ควรซื้อเกิดไหม** — คำนวณว่าเกิดเองทันป้องบ้านหรือไม่ ("บ้านแตกแน่ → ซื้อเกิด")

> หลักการ: **verdict ซื้อเกิดเป็น math (deterministic) ไม่ใช่ LLM** เพราะเดิมพันสูง ห้าม hallucinate.
> local SLM แปลง verdict เป็นเสียง persona + เล่า root cause (ดู §5).

## 2. Input

| Source | Data |
| --- | --- |
| GSI tick | `hero.alive`, `hero.level`, `player.gold`, `hero.buyback_cost`, `hero.respawn_seconds` |
| CV | enemies pushing high-ground, building HP, allies-alive count |
| respawn config | [`data/respawn.json`](file:///g:/G-Maiden/src-tauri/data/respawn.json) → respawn table + buyback penalty (via [`src/respawn.rs`](file:///g:/G-Maiden/src-tauri/src/respawn.rs)) |
| Combat log (CV) | last ~10s before death (root-cause narrative — SLM layer) |

> GSI ให้ `hero.respawn_seconds` (live countdown) และ `hero.buyback_cost` ตรงเมื่อ subscribe hero details —
> ใช้ค่านี้ก่อน; [`respawn.rs`](file:///g:/G-Maiden/src-tauri/src/respawn.rs) (table) เป็น fallback/predictor เมื่อ field หาย หรือเพื่อทำนาย "ถ้าตายตอนนี้".

## 3. Logic

```
on GSI tick where hero.alive == false:    // เข้า respawn-window mode
  natural = hero.respawn_seconds           // GSI live ถ้ามี
          ?? respawn::respawn_seconds(level, turbo) - elapsed_since_death   // fallback (table)
          (× 0.9 ถ้ามี Wraith King Reincarnation ในทีม)

  affordable      = gold >= buyback_cost
  too_late        = seconds_to_base_fall < natural        // เกิดเองไม่ทันป้องบ้าน
  recommend       = base_under_threat AND affordable AND too_late
  urgency         = Strong  if recommend AND allies_alive == 0   // เราคือความหวังเดียว
                  | Consider if recommend
                  | None
  penalty_warning = respawn::next_respawn_after_buyback(level, turbo)  // +25s ตายซ้ำ

  emit ReviveAdvice { recommend, urgency, natural, affordable, penalty, reason }
```

decision inequality หลัก:

```
ซื้อเกิด ⟺  base_under_threat  ∧  gold ≥ buyback_cost  ∧  time_to_base_fall < natural_respawn
```

## 4. Output

```rust
ReviveAdvice {
    recommend_buyback: bool,
    urgency: Urgency,                 // None | Consider | Strong
    natural_respawn_remaining: f64,   // เกิดเองอีกกี่วิ
    affordable: Option<bool>,         // None = ไม่รู้ buyback_cost
    next_death_penalty: f64,          // +25s ถ้าซื้อเกิดแล้วตายซ้ำ
    reason: String,                   // เหตุผลไทยแบบ template (deterministic)
}
```

→ verdict ส่งให้ **local SLM** → เสียง persona: *"บ้านแตกแน่ค่ะ ซื้อเกิดเลย! รอบนี้โดน SF จับเพราะดันเลนเกิน คราวหน้าพก TP นะ"*
→ ส่ง **G-Sensory** (overlay) + **Audio Engine** (narration)

## 5. Persona Behavior (SLM layer)

- verdict (Rust) → SLM เล่า root cause + อ่าน verdict ในน้ำเสียง Maiden
- อ่อนโยน ไม่ judge: *"ไม่เป็นไรนะ รอบนี้โดนจับเพราะไม่มี ward — คราวหน้าระวังนิดนึง"*
- Nerf CM humor ในจังหวะปลอดภัย: *"รอเกิดแป๊บนึงนะ ช้าเหมือน move speed ฉันเลย..."*

## 6. Constraints

- **Deterministic verdict:** การตัดสินซื้อเกิดต้องเป็น math ล้วน (testable) — SLM ทำแค่ narrative/voice
- **Generous latency:** ผู้เล่นตายอยู่ = idle → 3B SLM คิดได้สบาย (ไม่กระทบ FPS เพราะไม่ได้คุมฮีโร่)
- **Graceful unknowns:** ถ้าไม่รู้ `buyback_cost`/threat → degrade เป็นคำแนะนำกว้าง ไม่เดา
- **Privacy:** root-cause analysis อยู่ local เท่านั้น (combat log = raw data, ห้าม upload)

## 7. Dependencies

| ต้องการจาก | Module |
| --- | --- |
| Game state (alive/level/gold/buyback_cost) | GSI Server |
| Threat (base push, allies-alive, building HP) | G-Sentry / CV |
| Respawn timing + buyback penalty | **[`src/respawn.rs`](file:///g:/G-Maiden/src-tauri/src/respawn.rs)** (config: [`data/respawn.json`](file:///g:/G-Maiden/src-tauri/data/respawn.json)) |
| Root-cause narrative + voice | Local SLM (Brain Router) |
| → แสดงผล | **G-Sensory** (overlay) |
| → เสียง | Audio Engine |

## 8. Acceptance Criteria

- [x] buyback verdict เป็น pure function ทดสอบได้ ([`revive::advise_buyback`](file:///g:/G-Maiden/src-tauri/src/revive.rs#L105))
- [x] ใช้ [`respawn.rs`](file:///g:/G-Maiden/src-tauri/src/respawn.rs) config จริง (respawn table + +25 penalty + WK aura)
- [x] parse `hero.buyback_cost` + `hero.respawn_seconds` จาก GSI ([`DeathContext::from_tick`](file:///g:/G-Maiden/src-tauri/src/revive.rs#L50))
- [x] live wiring: [`request_buyback_advice`](file:///g:/G-Maiden/src-tauri/src/main.rs) command → emit `buyback-advice` + SLM `buyback-narrative`
- [x] SLM narrative: persona voice ([`narrate_prompt`](file:///g:/G-Maiden/src-tauri/src/revive.rs#L170) → [`slm::advise_offline`](file:///g:/G-Maiden/src-tauri/src/slm.rs#L22), async best-effort)
- [ ] threat estimate (base-fall time, allies-alive) จาก CV — verdict ยัง conservative จนกว่าจะ wire
- [ ] root-cause "ทำไมตาย" จาก combat-log CV (ตอนนี้ narrate ห้ามแต่งเหตุการณ์)
- [ ] verdict ถูกต้อง ≥90% เทียบ scenario เดิมพันบ้าน (manual eval)

## Changelog
| Version | Date | Summary |
| --- | --- | --- |
| — | 2026-07-19 | link/metadata sweep (G1.5): wikilink/symbol-link fixes only — no content change |

---
title: "FEAT-G-REVIVE — Death Analysis & Buyback Advisor"
doc_id: "FEAT-G-REVIVE"
status: active
version: "0.2.1"
updated: "2026-10-12"
owner: "Boss"
source_of_truth: true
---

# FEAT-G-REVIVE — Death Analysis & Buyback Advisor

> **Module:** G-Revive · **Priority:** P1 · **Phase:** 5–6
> **SRS:** [[software-requirements-specification|SRS]] §3.4 (advisor family) · related: [[FEAT-G-MASTER]], [[FEAT-G-SIGNAL]]

---

## 1. Purpose

ประเมินช่วง **ตาย → รอเกิด (respawn window)** จากข้อมูลที่มีจริง G-Revive แสดง timer,
buyback cost และ affordability เมื่อ GSI ส่งค่า ส่วน verdict เชิงกลยุทธ์ต้องรอข้อมูล threat ที่เชื่อถือได้:

1. **ทำไมตาย** (root cause) — ยังไม่ทำจนกว่าจะมี combat evidence ที่ใช้ระบุเหตุได้
2. **ควรซื้อเกิดไหม** — สรุปได้เมื่อรู้ภัยฐาน, เวลาเกิด, affordability และจำนวนเพื่อนที่ยังป้องกันได้

> หลักการ: **verdict ซื้อเกิดเป็น math (deterministic) ไม่ใช่ LLM** เพราะเดิมพันสูง ห้าม hallucinate.
> เมื่อ verdict ยังเป็น unknown ให้แสดงเฉพาะ facts ที่ทราบและไม่ส่ง prompt ไปยัง SLM.

## 2. Input

| Source | Data |
| --- | --- |
| GSI tick | `hero.alive`, `hero.level`, `player.gold`, `hero.buyback_cost`, `hero.respawn_seconds`; current ingestion does not expose a trusted game-mode value |
| CV | enemies pushing high-ground, building HP, allies-alive count — not wired to G-Revive yet |
| respawn config | [`data/respawn.json`](../../src-tauri/data/respawn.json) → respawn table + buyback penalty (via [`src/respawn.rs`](../../src-tauri/src/respawn.rs)) |
| Combat log (CV) | last ~10s before death (root-cause narrative — SLM layer) |

`hero.respawn_seconds` และ `hero.buyback_cost` เป็น facts เมื่อ GSI ส่งค่าบวกมาเท่านั้น; ค่า absent/zero
เป็น unknown. Respawn table ใช้ได้เมื่อระบุ game mode, level, elapsed time และสถานะ Wraith King aura ครบ
จาก source ที่เชื่อถือได้; live path ปัจจุบันยังไม่มี facts เหล่านี้ครบ จึงไม่ใช้ table เป็น fallback.

## 3. Logic

```
on GSI tick where hero.alive == false:
  natural    = positive hero.respawn_seconds, otherwise unknown
  cost       = positive hero.buyback_cost, otherwise unknown
  affordable = gold >= cost only when cost is known

  if base-under-threat is unknown:
    verdict = Unknown
  else if base is confirmed safe:
    verdict = no-buyback-needed
  else if natural, time-to-base-fall, affordability, or allies-alive is unknown:
    verdict = Unknown
  else:
    apply the deterministic timing/affordability rule

  emit ReviveAdvice { optional verdict, urgency, optional timer, cost, affordability, reason }
```

decision inequality หลัก:

```
ซื้อเกิด ⟺  confirmed base_under_threat
          ∧  gold ≥ known buyback_cost
          ∧  known time_to_base_fall < known natural_respawn
          ∧  known allies_alive
```

Unknown values stay `None`; they never become `false`, four surviving allies, or a normal-mode guess.
With the current GSI-only call site, the strategic verdict is therefore `Unknown` while the card can
still report its fresh timer, gold, cost and affordability.

## 4. Output

```rust
ReviveAdvice {
    recommend_buyback: Option<bool>,  // None = evidence does not support a verdict
    urgency: Urgency,                 // Unknown | None | Consider | Strong
    natural_respawn_remaining: Option<f64>,
    gold: u32,
    buyback_cost: Option<u32>,
    affordable: Option<bool>,
    next_respawn_if_buyback: Option<f64>,
    reason: String,                   // เหตุผลไทยแบบ template (deterministic)
}
```

→ verdict ที่รู้แน่แล้วจึงส่งให้ **local SLM** เพื่อเรียบเรียงเสียง persona; unknown แสดงเฉพาะ facts จาก GSI
→ ส่ง **G-Sensory** (overlay) + **Audio Engine** (narration)

## 5. Persona Behavior (SLM layer)

- verdict ที่มีหลักฐานครบ (Rust) → SLM เรียบเรียงคำแนะนำในน้ำเสียง Maiden
- อ่อนโยน ไม่ judge: *"ไม่เป็นไรนะ รอบนี้โดนจับเพราะไม่มี ward — คราวหน้าระวังนิดนึง"*
- Nerf CM humor ในจังหวะปลอดภัย: *"รอเกิดแป๊บนึงนะ ช้าเหมือน move speed ฉันเลย..."*
- unknown verdict → ไม่เรียก SLM และไม่สร้างคำแนะนำจากช่องข้อมูลที่หาย

## 6. Constraints

- **Deterministic verdict:** การตัดสินซื้อเกิดต้องเป็น math ล้วน (testable) — SLM ทำแค่ narrative/voice
- **Generous latency:** ผู้เล่นตายอยู่ = idle → 3B SLM คิดได้สบาย (ไม่กระทบ FPS เพราะไม่ได้คุมฮีโร่)
- **Graceful unknowns:** เมื่อไม่รู้ mode/threat/allies/timer/cost ให้แสดงเฉพาะ timer/cost/affordability ที่มีจริง; ไม่มีข้อความว่า safe หรือให้เก็บเงินจากข้อมูลที่หาย
- **Expiry:** buyback card และ narrative ต้องถูกล้างเมื่อ GSI ยืนยันว่า player กลับมามีชีวิต หรือ session สิ้นสุด/ข้อมูลหมดอายุ
- **Privacy:** root-cause analysis อยู่ local เท่านั้น (combat log = raw data, ห้าม upload)

## 7. Dependencies

| ต้องการจาก | Module |
| --- | --- |
| Game state (alive/level/gold/buyback_cost) | GSI Server |
| Threat (base push, allies-alive, building HP) | G-Sentry / CV |
| Respawn timing + buyback penalty | **[`src/respawn.rs`](../../src-tauri/src/respawn.rs)** (config: [`data/respawn.json`](../../src-tauri/data/respawn.json)) |
| Root-cause narrative + voice | Local SLM (Brain Router) |
| → แสดงผล | **G-Sensory** (overlay) |
| → เสียง | Audio Engine |

## 8. Acceptance Criteria

- [x] buyback verdict เป็น pure function ทดสอบได้ ([`revive::advise_buyback`](../../src-tauri/src/revive.rs))
- [x] ใช้ [`respawn.rs`](../../src-tauri/src/respawn.rs) config เมื่อ mode, level, elapsed time และ aura ถูกระบุครบ; ไม่ตั้ง mode/aura เป็นค่า default
- [x] parse `hero.buyback_cost` + `hero.respawn_seconds` จาก GSI ([`DeathContext::from_tick`](../../src-tauri/src/revive.rs))
- [x] live wiring: [`request_buyback_advice`](../../src-tauri/src/lib.rs) command → emit `buyback-advice`; emit SLM `buyback-narrative` only when a verdict is known
- [x] unknown threat/mode stays `Unknown`; card reports known GSI timer/gold/cost/affordability without a safe default
- [x] card clears on respawn; advice and narrative responses carry a per-death request ID and are ignored after respawn or a newer death
- [ ] SLM narrative quality against the grounded verdict
- [ ] threat estimate (base-fall time, allies-alive) จาก CV — verdict ยังคง Unknown จนกว่าจะ wire source ที่เชื่อถือได้
- [ ] root-cause "ทำไมตาย" จาก combat-log CV (ตอนนี้ยังไม่มี producer และไม่ส่งสาเหตุให้ SLM)
- [ ] verdict ถูกต้อง ≥90% เทียบ scenario เดิมพันบ้าน (manual eval)

## Changelog
| Version | Date | Summary |
| --- | --- | --- |
| — | 2026-07-19 | link/metadata sweep (G1.5): wikilink/symbol-link fixes only — no content change |
| 0.2.0 | 2026-10-12 | Keep unknown buyback inputs explicit, avoid safe defaults and mode guesses, and limit the live card/SLM to evidence-backed facts |
| 0.2.1 | 2026-10-12 | Correlate buyback advice and narrative with the active death so late same-session responses cannot replace a newer card |

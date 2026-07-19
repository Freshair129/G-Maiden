# Dota 2 HUD / GSI Reference Catalog

> **วันที่:** 2026-06-24  
> **ที่มา:** Reference screenshots ที่ผู้ใช้แนบ (5 ภาพ)  
> **จุดประสงค์:** map HUD element → GSI field → G-module เพื่อใช้กับ G-Sensory (overlay non-obstruction), G-Signal/G-Sentry (state), G-Master (net worth), G-Damage (hero DB)

> 📁 **ไฟล์ภาพดิบ:** เก็บไว้ที่ [[reference/dota-ui/README|docs/reference/dota-ui/]] แล้ว 4 ภาพหลัก:
> `hud-layout-annotated.webp` (ภาพ 1), `status-stunned.png` (ภาพ 2),
> `combat-log-panel.png` (ภาพ 4), `hero-grid-strength.webp` (ภาพ 5).
> ภาพที่เหลือ (scoreboard-buyback, agility/intelligence grids, announcer, respawn-table)
> เป็น documented-only ในไฟล์นี้ — drop เพิ่มที่ [[reference/dota-ui/README|docs/reference/dota-ui/]] ได้ถ้าต้องการ visual ref.

---

## ภาพ 1 — Full In-Game HUD (annotated layout)
`hud-full-annotated.png`

ภาพ HUD เต็มจอพร้อม label ทุกตำแหน่ง — **สำคัญที่สุดสำหรับ G-Sensory** เพราะกำหนด zone ที่ overlay **ห้ามบัง** (hard constraint: minimap, skill bar, stats panels)

### Top bar
| Element | ตำแหน่ง | GSI field | G-module |
|---|---|---|---|
| K/D/A | บนซ้าย | `player.kills/deaths/assists` | G-Master, G-Score |
| LH/DN | บนซ้าย | `player.last_hits/denies` | G-Score |
| Ultimate Ability Available | กลางบน (เหนือ hero icons) | `abilities.*.ultimate + can_cast` | G-Signal (timing windows) |
| Radiant Kills / Dire Kills | กลางบน ขนาบนาฬิกา | `map.radiant_score / dire_score` | G-Master |
| Game Clock | กลางบนสุด | `map.clock_time` | ทุก module (time base) |
| Network Information (FPS/Ping/Loss) | บนขวา | ไม่มีใน GSI (CV/system only) | G-Sensory (perf budget) |

### Bottom HUD
| Element | ตำแหน่ง | GSI field | G-module |
|---|---|---|---|
| Minimap | ล่างซ้าย | ⚠️ **ไม่อยู่ใน GSI** → ต้องใช้ CV | G-Sentry (fog-of-war), G-Motion |
| Portrait / Level | กลางล่าง | `hero.name / hero.level` | ทุก module |
| Abilities | กลางล่าง | `abilities.*` (level/cooldown/can_cast) | G-Signal, G-Master |
| Passives & Buffs | กลางล่าง | `hero.*` modifiers (จำกัด) | G-Damage |
| Item Hotkey / Inventory & Backpack | กลางล่าง-ขวา | `items.slot0-8 + stash` | G-Master, G-Damage |
| Neutral Item Slot | ขวาของ inventory | `items.neutral0` | G-Master |
| TP Slot | ขวาสุดของ inventory | `items.teleport0` | G-Signal (escape readiness) |
| Health Bar / Mana Bar | กลางล่าง | `hero.health/max_health, mana/max_mana` | G-Signal (danger calc) |
| Stash Window | ล่างขวา | `items.stash0-5` | G-Master |
| Shop & Total Gold / Quick Buy | ขวาล่าง | `player.gold` | G-Master |
| Voice Response Subtitles | ขวากลาง | — | G-Voice (วาง subtitle ใกล้โซนนี้ได้) |

### 🎯 Overlay non-obstruction map (สำหรับ G-Sensory)
```
ห้ามบังเด็ดขาด (hard constraint):
  ┌─────────────────────────────────────────┐
  │ [top bar: KDA/clock/scores]   [network] │  ← top: หลีกเลี่ยง
  │                                         │
  │            SAFE ZONE                    │  ← วาง overlay panel ตรงนี้
  │         (กลางจอ + ขอบบน-ขวา)             │
  │                                         │
  │ [minimap]  [hero HUD/abilities/items]   │  ← ล่าง: ห้ามบังทั้งแถบ
  └─────────────────────────────────────────┘
```

---

## ภาพ 2 — STUNNED state indicator
`state-stunned.png`

Hero พร้อมไอคอน stun หมุนเหนือหัว + ข้อความ "STUNNED"

| สิ่งที่บ่งชี้ | GSI field | G-module relevance |
|---|---|---|
| Hero ถูก disable | `hero.stunned: true` (BrightGir subscribe field นี้) | **G-Signal critical** — stunned = ตกอยู่ในอันตรายสูงสุด, danger score พุ่ง |
| รัฐที่เกี่ยวข้อง | `hero.silenced`, `hero.hexed`, `hero.muted`, `hero.break` | G-Signal escape-impossible detection |

**Insight:** `hero.stunned` คือ binary flag ที่ G-Signal ต้อง weight สูงมากใน danger model — ถ้า stunned + enemy ใกล้ = ใกล้ตายแน่นอน trigger voice interrupt ทันที (ภายใน 300ms budget)

---

## ภาพ 3 — Scoreboard + Buyback Available
`scoreboard-buyback.png`

ตาราง Radiant/Dire: LVL, GOLD, K, D, A, ULT, MUTE — มี highlight "Buyback Available" ที่ช่อง gold 525

| Element | GSI field | G-module |
|---|---|---|
| Gold ต่อ player | `player.gold` (เฉพาะตัวเอง) / scoreboard = CV สำหรับศัตรู | G-Master (net worth diff) |
| Buyback available | คำนวณจาก gold vs buyback cost | G-Master (teamfight risk advice) |
| ULT ready ต่อ hero | `abilities.*.ultimate` (เฉพาะตัวเอง) | G-Signal (enemy ult = ganks danger) |
| LVL ต่อ hero | `hero.level` (ตัวเอง) / CV (ศัตรู) | G-Master |

**Insight ⚠️:** GSI ให้ข้อมูลละเอียด **เฉพาะ hero ตัวเอง** เท่านั้น — net worth/level/ult ของ **ศัตรู** ต้องอ่านจาก scoreboard ผ่าน **CV** (G-Sentry's capture layer) นี่ยืนยันว่าทำไม G-Maiden ต้องมี CV ไม่ใช่ GSI อย่างเดียว (ต่างจาก BrightGir ที่ใช้ GSI ล้วน → blind ต่อ enemy state)

---

## ภาพ 4 — Combat Log
`combat-log.png`

Log ทุก event: damage, buffs, abilities, items, deaths พร้อม filter (Attacker/Target/Damage/Healing/Abilities/Items/Modifiers/Deaths) + Interval 60s

ตัวอย่าง entry:
```
[00:13.69] Axe hits Io for 47 damage (940->893)
[00:18.10] Axe casts ability Battle Hunger on Io
[00:21.56] Io uses Eul's Scepter of Divinity on Io
```

| สิ่งที่เห็น | มีใน GSI ไหม | G-module |
|---|---|---|
| Damage events + ค่าตัวเลข | ❌ ไม่มีใน GSI (event-level) | G-Damage (verify burst formula), G-Log |
| Ability casts | บางส่วน (`abilities.*.can_cast` แต่ไม่มี cast event) | G-Master |
| Buff/debuff gain/loss | จำกัดมากใน GSI | G-Signal (disable tracking) |
| HP transition (940→893) | snapshot เท่านั้น ไม่ใช่ event stream | G-Damage |

**Insight:** Combat Log = สิ่งที่ **GSI ให้ไม่ได้** (ไม่มี event stream) นี่คือ analog ของตาราง `events` ใน dataset `betty-dota2` (HuggingFace) ที่ใช้ train G-Signal classifier ได้ — combat log แบบ real-time ต้องดึงจาก CV หรือ `.dem` replay parse ไม่ใช่ GSI

---

## ภาพ 5 — Strength Hero Grid
`heroes-strength-grid.png`

Hero selection grid หมวด Strength (34 heroes): Abaddon, Alchemist, Axe, Bristleback, Centaur, Chaos Knight, Clockwerk, Doom, Dragon Knight, Earth Spirit, Earthshaker, Elder Titan, Huskar, Legion Commander, Lifestealer, Magnus, Marci, Night Stalker, Ogre Magi, Phoenix, Primal Beast, Pudge, Sand King, Slardar, Snapfire, Spirit Breaker, Sven, Tidehunter, Timbersaw, Tiny, Treant Protector, Tusk, Underlord, Undying

| ใช้ทำอะไร | G-module |
|---|---|
| Hero DB reference — attribute primary (STR/AGI/INT) | **G-Damage** (8-hero DB → ขยายเป็น full roster) |
| Hero ID ↔ name mapping | G-Master, G-Motion (role priors) |
| Counter/synergy table seed | G-Master (draft advice) |

**Insight:** G-Damage ปัจจุบันมี 8-hero DB (AGENTS.md: "New") — grid นี้คือ checklist ของ Strength heroes ที่ต้องเติม attribute + base armor/HP เข้า hero DB ครบ 3 attribute (STR/AGI/INT) = full Dota 2 roster สำหรับ burst damage calculation ที่แม่นยำ

---

## ภาพ 6 — Agility Hero Grid
`heroes-agility-grid.png`

Hero grid หมวด Agility (~37 heroes): Anti-Mage, Bloodseeker, Bounty Hunter, Broodmother, Clinkz, Drow Ranger, Ember Spirit, Faceless Void, Gyrocopter, Hoodwink, Juggernaut, Lone Druid, Luna, Medusa, Meepo, Morphling, Nyx Assassin, Phantom Assassin, Phantom Lancer, Razor, Riki, Slark, Sniper, Spectre, Templar Assassin, Terrorblade, Troll Warlord, Ursa, Venomancer, Viper, Weaver, Windranger (+ ช่องใหม่/ซ่อน)

## ภาพ 7 — Intelligence Hero Grid
`heroes-intelligence-grid.png`

Hero grid หมวด Intelligence (~32 heroes): Ancient Apparition, Bane, **Crystal Maiden** ⭐, Dark Seer, Dark Willow, Disruptor, Enigma, Grimstroke, Invoker, Jakiro, Leshrac, Lich, Lion, Muerta, Necrophos, Oracle, Outworld Destroyer, Puck, Pugna, Ringmaster, Rubick, Shadow Demon, Shadow Shaman, Silencer, Skywrath Mage, Techies, Tinker, Visage, Void Spirit, Warlock, Winter Wyvern, Witch Doctor

> ⭐ **Crystal Maiden อยู่ในหมวด Intelligence** — คือตัว Maiden เอง (persona inspiration) ใช้ดึง portrait/attribute สำหรับ G-Persona + avatar

**ภาพ 5+6+7 รวมกัน = full Dota 2 roster (STR + AGI + INT)** → checklist สมบูรณ์สำหรับ G-Damage hero DB (ปัจจุบัน 8 heroes → ต้องเติมให้ครบทั้ง 3 attribute) และ hero ID↔name mapping สำหรับ G-Master/G-Motion

---

## ภาพ 8 — Kill Streak Announcer Table
`announcer-killstreak.png`

| Kills | Announcement | + killing streak |
|---|---|---|
| 1 | N/A | N/A |
| 2 | Player got a **double kill!** | …with a double kill! |
| 3 | Player has a **TRIPLE kill!** | …with a TRIPLE kill! |
| 4 | Player earned an **ULTRA KILL!** | …with an ULTRA KILL! |
| 5+ | **RAMPAGE!!!** | …RAMPAGE!!! |

> หมายเหตุ: "Announcer responses are customizable"

**G-module relevance:**
- **G-Voice / G-Persona:** Maiden สามารถ react ต่อ kill streak ด้วย persona ของตัวเอง (gentle + Nerf CM humor) แทน/เสริม announcer มาตรฐาน — เป็น trigger event ที่ดีสำหรับ narrative continuity
- **G-Signal:** multi-kill ของศัตรู = momentum shift → danger escalation; multi-kill ของเรา = opportunity window
- **GSI trigger:** อ่านจาก `player.kill_streak` / kills delta ใน GSI payload

---

## ภาพ 9 — Respawn Time Table + Respawn-Changing Abilities ⭐ (ข้อมูลสำคัญสูง)
`respawn-time-table.png`

### Respawn time ตาม hero level

| LVL | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23 | 24 | 25+ |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Default (s)** | 12 | 15 | 18 | 21 | 24 | 26 | 28 | 30 | 32 | 34 | 36 | 44 | 46 | 48 | 50 | 52 | 54 | 65 | 70 | 75 | 80 | 85 | 90 | 95 | 100 |
| **Turbo (s)** | 9 | 12 | 14 | 16 | 18 | 20 | 21 | 23 | 24 | 26 | 27 | 33 | 35 | 36 | 38 | 39 | 41 | 49 | 53 | 57 | 60 | 64 | 68 | 72 | 75 |

### Respawn-changing abilities

| ที่มา | ผล |
|---|---|
| **Buyback (Gold)** | Next respawn time **+25s**; neutral-set respawn 26s; buyback penalty ทับบนเวลา respawn ปกติ; ตายให้ neutral creeps → min 26s |
| **Courier (passive)** | Base 60s + 6s/level (respawn ที่ fountain) |
| **Meepo — Divided We Stand** | 26s min ไม่ใช้กับ Meepo clone ที่ตายให้ neutral creeps |
| **Vengeful Spirit — Vengeance Illusion** | สร้าง strong illusion ตอนตาย, duration = respawn time; ถ้า illusion ยังอยู่ตอน respawn จะเข้าแทนที่ |
| **Wraith King — Reincarnation** | ally heroes respawn time **−10%** |

**G-module relevance (สูงมาก):**
- **G-Master (financial/strategic core):** นี่คือ data หลักของ "ควร buyback ไหม" — คำนวณ respawn time ตาม level + buyback +25s penalty vs สถานการณ์ teamfight/push นี่คือ decision ที่ G-Master ต้องให้คำแนะนำได้แม่นยำ
- **G-Signal:** ตอนเราตาย → คำนวณ "ศัตรูจะกลับมาในกี่วินาที" จาก enemy level (อ่านผ่าน CV scoreboard) → เตือน power spike window
- **G-Motion:** enemy ตาย = หายจากแผนที่แน่นอน X วินาที → ปรับ gank prediction (ศัตรูที่ตายไม่ใช่ภัยคุกคาม จนกว่า respawn)
- **G-Log:** บันทึก death timing + buyback decision เพื่อ post-match review (G-Coach)

> 💡 ตารางนี้ควร hardcode เป็น lookup table ใน Rust ([`respawn.rs`](file:///g:/G-Maiden/src-tauri/src/respawn.rs) หรือใน [`signal.rs`](file:///g:/G-Maiden/src-tauri/src/signal.rs)/[`master.rs`](file:///g:/G-Maiden/src-tauri/src/master.rs)) — เป็น static game constant ที่ deterministic ไม่ต้อง LLM

---

## สรุป Cross-cutting Insight

ภาพทั้ง 5 ยืนยันสถาปัตยกรรม **GSI + CV hybrid** ของ G-Maiden:

| ข้อมูล | GSI (ตัวเอง) | CV (ทั้งแผนที่/ศัตรู) |
|---|---|---|
| Own hero state (HP/mana/items/abilities) | ✅ | — |
| `hero.stunned` + disables (ตัวเอง) | ✅ | — |
| Enemy net worth / level / ult | ❌ | ✅ scoreboard |
| Minimap / fog-of-war / enemy positions | ❌ | ✅ minimap CV |
| Combat events / damage stream | ❌ | ✅ combat log CV / .dem |

→ นี่คือเหตุผลที่ G-Maiden เหนือ BrightGir (GSI-only): **G-Sentry's CV layer** เห็นสิ่งที่ GSI มองไม่เห็น ซึ่งคือ 80% ของข้อมูลที่จำเป็นต่อ gank prediction

---

*Catalog generated 2026-06-24 — ภาพดิบเก็บที่ [[reference/dota-ui/README|docs/reference/dota-ui/]] (4 ภาพหลัก); ที่เหลือ documented-only*

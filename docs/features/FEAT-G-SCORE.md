# FEAT-G-SCORE — Dynamic GSI-driven Soundtrack

> **สถานะ (2026-07): ยังไม่ได้ทำ (spec ล่วงหน้า) — ไม่มีโมดูลนี้ในโค้ด (`src-tauri/src/`)**
> ไม่มี `mod score` ใน `main.rs` และไม่มีไฟล์ `score.rs` — เอกสารนี้เป็น design vision ล่วงหน้า ยังไม่ได้ implement.

> **Module:** G-Score (โมดูลที่ 13, proposed) · **Priority:** Delighter / Differentiator · **Phase:** post-v1.0
> **PRD/SRS:** new (proposed) · **Synergy:** G-Motion, G-Stream, G-Persona, Marketplace ([[ADR-12-community-ai-marketplace|ADR-12]])

---

## 1. Purpose

แทน "เพลงพื้นหลังเกม Dota 2" (ชั้นเสียงที่ผู้เล่นมักปิด เพราะคุณภาพแค่พอใช้) ด้วย **soundtrack แบบ adaptive ที่ขับด้วย game state** (GSI + G-Motion) — เพลงเปลี่ยนอารมณ์ตามจังหวะเกมและโมเมนต์พิเศษ (Roshan = boss music, clutch = epic sting) ใช้ **เพลง AI ปลอดลิขสิทธิ์** → DMCA-safe สำหรับสตรีมเมอร์

> ไม่ใช่ "music player ทั่วไป" — เป็นชั้น game-feel ที่ต่อยอด engine GSI/G-Motion ที่มีอยู่แล้ว

## 2. Features

### 2a. Event → Music trigger map

| Game state (จาก GSI/G-Motion) | Music mood |
| --- | --- |
| Laning / farming | ambient / calm |
| Gank probability สูง (G-Motion) | tension / build-up |
| Teamfight detected | combat / intense |
| **Roshan fight** | **BOSS music** (signature moment) |
| Clutch / multi-kill / rampage | epic sting (one-shot, ทับชั่วคราว) |
| Highground / tower push สำคัญ | escalation |
| Victory / Defeat | outro |

### 2b. Audio hierarchy (ทำไมไม่ต้อง duck ก้าวร้าว)

```
Tier 1 (บนสุด):  G-Signal voice alerts  → always preempt (มีกฎอยู่แล้ว)
Tier 2:          เสียง SFX เกมสำคัญ (footstep/สกิล) → player volume
Tier 3 (ล่างสุด): G-Score soundtrack → แทนเพลงเกม (ที่ปิดได้)
```
เพราะ soundtrack อยู่ชั้นล่างสุดและมาแทนเพลงเกม (ไม่สำคัญ) จึง**ไม่ต้อง duck ก้าวร้าว** — แค่ mix ให้ voice/SFX อยู่เหนือเสมอ

### 2c. Music sources
- **Built-in packs** — AI-generated / licensed, royalty-clean
- **AI music label collab** (partnership) → variation ไม่จำกัด, ปลอดลิขสิทธิ์, personalize ได้ → **แก้ปัญหา licensing ตั้งแต่ราก**
- **User playlist** (optional, local) — แต่ default = ระบบ adaptive
- Crossfade / stem transition ระหว่าง mood

### 2d. Persona DJ
- Maiden cue เพลง: *"ได้เวลาโรชาน... เปิดเพลงบอสกัน 🎵"* (ผูก G-Persona verbosity)

## 3. Strategic Synergies (ทำไมเป็นโมดูลจริง ไม่ใช่ของเล่น)

| Synergy | คุณค่า |
| --- | --- |
| **G-Stream** | เพลง AI ปลอดลิขสิทธิ์ + reactive = สิ่งที่สตรีมเมอร์อยากได้ (หนี DMCA strike) |
| **Marketplace ([[ADR-12-community-ai-marketplace|ADR-12]])** | community "soundtrack pack" / boss-music style = หมวด UGC ใหม่ + AI-music collab |
| **G-Motion (reuse)** | ใช้ gank probability / teamfight signal ที่มีอยู่แล้วขับเพลง — ต้นทุนเพิ่มต่ำ |
| **Persona** | Maiden เป็น DJ/co-host → engagement/viral (โมเมนต์ Roshan boss music แคปไปแชร์) |

## 4. Configuration

```json
{
  "g_score": {
    "enabled": false,
    "pack": "default",            // default | <community-pack-id> | user-playlist
    "boss_music_on_roshan": true,
    "epic_sting_on_clutch": true,
    "music_volume": 0.4,
    "ducking": "off",             // off (default) | light — voice/SFX อยู่เหนืออยู่แล้ว
    "persona_dj_cues": true
  }
}
```

## 5. Logic (pseudocode)

```
on game_state_update(gsi, motion):
  mood = classify(gsi, motion)          // calm | tension | combat | boss | ...
  if mood != current_mood:
    crossfade_to(track_for(mood, pack))
on event(roshan_fight):  play boss_track (override mood ชั่วคราว)
on event(rampage|clutch): play one_shot_sting (ทับ current)
// soundtrack mix ที่ music_volume; G-Signal voice ดังเหนือเสมอ (preempt)
```

## 6. Dependencies

| ต้องการจาก | Module |
| --- | --- |
| Game state (gank prob, teamfight) | **G-Motion** + GSI events |
| Audio output | Audio Engine (rodio) — reuse |
| Persona DJ cues | **G-Persona** |
| Stream redaction (เมื่อสตรีม) | **G-Stream** |
| Community packs | **Marketplace** ([[ADR-12-community-ai-marketplace|ADR-12]]) |

## 7. Constraints
- เล่นเฉพาะ **stem ที่ pre-generated** (ไม่ generate สด) → เบา, ภายใน budget (CPU ≤2.5%, RAM ≤400MB)
- ห้ามกระทบ **G-Signal latency / preempt**
- default volume ต่ำ + ผู้เล่นปรับได้ → ไม่กลบ SFX สำคัญ (footstep/สกิล)
- ❗ **ban-safe:** เป็น audio output อย่างเดียว ไม่ยุ่งกับเกม

## 8. Open Questions
- GSI ให้ Roshan state / teamfight ครบไหม หรือต้องอนุมานจาก event/G-Motion?
- AI music: สร้าง pack เอง vs partner ค่ายไหน? license/รายได้แบ่งยังไง?
- ผูกเข้า tier ไหน — Pro? add-on? หรือ **ปล่อยฟรีเพื่อ viral**?
- เป็นโมดูลแยก (G-Score) หรือ sub-feature ของ G-Sensory/G-Stream?

## 9. Acceptance Criteria
- [ ] เพลงเปลี่ยน mood ตาม game state จริง (laning/teamfight/...)
- [ ] Roshan fight → boss music
- [ ] clutch/rampage → epic sting
- [ ] **G-Signal voice ดังเหนือเพลงเสมอ** (ทดสอบไม่โดนกลบ)
- [ ] CPU/RAM ภายใน budget
- [ ] toggle / เปลี่ยน pack ได้ real-time ไม่ crash
- [ ] (stream mode) เพลงปลอด DMCA

## Status
**Delighter, post-v1.0** — ไม่อยู่ใน 12 โมดูล core ของ v1.0 · เปิดเป็นโมดูลที่ 13 (proposed) จัดคู่กับ G-Persona / G-Stream / Marketplace · อย่าให้ดีเลย์ core wedge (gank warning)

## Changelog
| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-06-24 | Proposed — dynamic GSI-driven soundtrack; AI-music/DMCA-safe; G-Stream + marketplace synergy |

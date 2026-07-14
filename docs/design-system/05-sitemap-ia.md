---
version: "2.2.0-draft"
created_at: "2026-07-05T00:00:00+07:00,Opus"
last_update: "2026-07-15T00:00:00+07:00,Claude"
status: "draft"
attributes:
  domain: "ui-ux"
  scope: "information architecture, navigation, flows"
  language: "th/en"
---

# 05 — Sitemap & Information Architecture

> ระดับ product-boundary/flow เดิมอยู่ที่ `docs/architecture/g-maiden-ui-sitemap-flow-board.md`
> ไฟล์นี้ลง IA ของ **UI จริง** (Command Deck v2) ให้ตรงกับ layout ไฟล์ 03

## 1. Window model

G-Maiden มี **2 หน้าต่าง** (routing ใน `src/src/App.tsx`):

| window | คือ | design surface |
| --- | --- | --- |
| **Control** | Command Deck (หน้าต่างหลัก) | glass Subtract panel + FAB |
| **Overlay** | Combat HUD (โปร่ง, click-through, บนเกม) | widget เบา เฉพาะที่จำเป็น |

Overlay ไม่ใช้ chrome ของ Deck — แชร์แค่ token (สี/type/สถานะ) เพื่อความต่อเนื่องทางสายตา
Design contract ของ overlay อยู่ที่ [`07-combat-hud.md`](07-combat-hud.md)

## 2. Navigation model

**สามแกน อย่าปนกัน:**

1. **Sidebar FAB (I)** = navigation จริง → สลับ *page* ใน Command Deck
2. **Audio rail** (แทน P1–P5 anchor rail เดิม — ดู 03-layout §5.6) = ไม่ใช่ nav →
   master volume + ANN/SIGNAL toggle บนหน้า dashboard
3. **แกนเฟส (CR-011 §D/§E, shipped waves P1–P3)** = ไม่ใช่ nav และไม่ขยับ layout —
   เนื้อหาใน sector เดิมของ dashboard สลับตามสถานะแมตช์
   `standby → prep → live → debrief` (อัตโนมัติจาก GSI) — ดู §2.1 ด้านล่าง

**Command palette ("Maiden Line", CR-011 §L/§M, shipped CR011-P4a):** `Ctrl+K`
ลอยเหนือ stage (window space, ไม่ใช่ scaled stage) — ทางลัดครอบทุกแกนโดยไม่แตะ
geometry; `Ctrl+/` หรือ `?` เปิด shortcut sheet คู่กัน (รายละเอียด anatomy:
`04-components.md` §10a/§10b)

### 2.1 Phase axis (CR-011 §D/§E — `src/src/live/phase.ts`)

Match phase คือ derived state จาก GSI signal ที่มีอยู่แล้ว (ไม่มี concept ใหม่ฝั่ง
backend) — คำนวณด้วย `stepPhase(prev, input)` ทุกครั้งที่มี GSI tick ใหม่ ผลลัพธ์คือ
`MatchPhase = "standby" | "prep" | "live" | "debrief"`:

```
standby ──(draft/hero-select/loading state)──▶ prep
   ▲                                              │
   │                                    (live state / inGame)
   │                                              ▼
   └────(GSI offline, no prior debrief)──── live ─┐
                                                   │ (post-game state, or
                                                   │  live→disconnect w/o
   debrief ◀─────────────────────────────────────┘   explicit POST_GAME)
      │
      └── sticky: stays "debrief" across GSI going offline (Dota closing) or
          any unrecognized state, until the next real prep/live tick
```

**Geometry-frozen, content-swap only** — the sectors that swap content per phase
never move or resize; only what renders *inside* the frozen box changes:

| phase | `.gm-battle-grid` content (was: hero columns + minimap) | `.gm-agent-card` content |
| --- | --- | --- |
| `standby` / `prep` | **Readiness rundown** (`ReadinessRundown`, 04-components §9d) — honest checklist of what's actually ready (GSI, voice pack, G-Signal, ANN, volume); optional "กำลังดราฟต์" note during `prep` | ON AIR console (04-components §9b) — unaffected by phase, always the utterance ledger |
| `live` | hero columns + minimap (unchanged, pre-CR-011 content) | ON AIR console |
| `debrief` | **Debrief timeline** (`DebriefTimeline`, 04-components §9e) — most-recently-archived match's event log, sticky (survives GSI dropping) until the user goes "back to live" or a new prep/live tick arrives | ON AIR console |

The score header's **phase chip** (`.gm-phase-chip`, 04-components §6b) is the one
persistent on-screen indicator of the current phase across all four states —
absolutely positioned at the header's right edge, never shifting the centered
clock/score.

## 3. Sitemap (Command Deck pages)

```mermaid
flowchart TD
  Deck["Command Deck (Control window)"]
  Deck --> Dash["Dashboard — สรุปสด (default)"]
  Deck --> Live["Live Match — battlefield + logs"]
  Deck --> Voice["Voice Packs — announcer packs"]
  Deck --> Build["Build Advisor — item/skill path"]
  Deck --> Insights["Insights — posture, tempo, weekly"]
  Deck --> History["History — past sessions (G-Log)"]
  Deck --> Account["Account — GID + Steam link"]
  Deck --> Settings["Settings — window/privacy/system"]

  Overlay["Combat HUD (Overlay window) — ดู 07-combat-hud.md"]
  Overlay --> Sig["Signal: gank banner + belief-revision echo + G-Meter + enemy missing"]
  Overlay --> Banner["Announcer: kill/streak card + pack banner + voice toast"]
  Overlay --> Comp["Companion: Maiden presence + advice (G-Master)"]
  Overlay --> Stats["Stat modules: clock/KDA/gold/GPM/XPM/NW/score/HP-mana (Full tier)"]
```

## 4. Page inventory

| page | โมดูล/ไฟล์ | เนื้อหาหลัก | สถานะ |
| --- | --- | --- | --- |
| **Dashboard** | `Dashboard.tsx` | scoreboard, G-Signal pulse, companion state, 5 bento | live-wired |
| **Live Match** | `CompanionPages.tsx` `LiveMatchPage` | objective board, enemy visibility, activity/event feed | live |
| **Voice Packs** | `VoicePacksPage.tsx` / `VoiceInventory.tsx` | announcer pack inventory + active | live |
| **Build Advisor** | `CompanionPages.tsx` `BuildAdvisorPage` | item path, advisor notes | scaffold |
| **Insights** | `CompanionPages.tsx` `InsightsPage` | power/win/objective/ward + weekly report | scaffold (OpenDota) |
| **History** | `CompanionPages.tsx` `HistoryPage` | recent sessions (local G-Log) | scaffold |
| **Account** | `AccountPage.tsx` / `AuthPanel.tsx` / `SteamLink.tsx` | GID, Google OAuth, Steam link — UX spec: [`08-account-gid.md`](08-account-gid.md) | live (ADR-14) |
| **Settings** | `CompanionPages.tsx` `SettingsPage` | window preset, privacy, system health | live |
| **Companion** | `CompanionPages.tsx` `CompanionPage` | overlay/voice/alert behavior, hotkeys | live |

## 5. Core flows

### 5.1 First run → GSI ready (onboarding)
```
launch → Deck (Dashboard, GSI Offline) → Settings/Onboarding: install GSI cfg
→ start Dota 2 → GSI live (dot lime) → scoreboard/stats เดิน
```

### 5.2 In-match (peripheral)
```
GSI tick → Dashboard/HUD update → G-Signal คำนวณ → ถ้า gank ≥85%:
persona voice interrupt + overlay banner + signal card E (lime) escalate
```

### 5.3 Sign-in (optional, additive)
```
Account → Google OAuth (PKCE, callback :3000/auth/callback) → GID ออก
→ link Steam → ดึง public OpenDota profile + baselines (Insights/weekly)
```
Deck ใช้งานได้เต็มแบบ signed-out/offline — sign-in เป็น additive (ADR-14)

### 5.4 Voice pack activate
```
Voice Packs → เลือก pack → active → POST /announcer/install (:3000)
→ in-game event fired → play mapped clip + overlay banner
```

## 6. Hotkeys (global — ทำงานแม้ Dota focus)

| hotkey | action |
| --- | --- |
| Ctrl+Alt+S | ซ่อน/แสดง overlay |
| Alt+↑ / Alt+↓ | เสียง +10% / −10% |
| Alt+M | mute toggle |

(นิยามใน `src-tauri/src/main.rs` — ดู CLAUDE.md; CR-004 เสนอเพิ่ม Alt+V/G/N/P สำหรับ voice command)

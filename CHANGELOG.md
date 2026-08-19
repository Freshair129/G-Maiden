# Changelog

## [Unreleased]
### Fixed
- **เลิกบอกว่า "ปลอดภัย" ตอนที่ตาไม่ทำงาน** — เดิมถ้าไม่มีศัตรูหายจากแมพ G-Meter บน overlay
  จะขึ้นไฟเขียว "ปลอดภัย" เสมอ ซึ่งหน้าตาเหมือนกันเป๊ะทั้งกรณี "เห็นครบทุกตัวจริง ๆ" และกรณี
  "ไม่มีอะไรมองอยู่เลย" (Lite mode / ไม่มีโมเดล ONNX / capture ค้างกลางเกม) ตอนนี้ backend
  ส่ง event ใหม่ `sensor-health` บอกสถานะจริงของเซ็นเซอร์มินิแมพ — overlay ขึ้น
  **"ไม่มีสัญญาณ"** (ไฟดับทั้งแถบ) และการ์ด G-Signal บนเด็คขึ้น `—` แทนที่จะโกหกว่าปลอดภัย
  ถ้ามีเตือนแก๊งค์จริงยังขึ้นตามปกติ — เราหยุด "การรับประกันความปลอดภัย" ไม่ใช่หยุดคำเตือน
- **เห็นตอนที่ capture ตกไปใช้ GDI แล้ว** — `sensor-health.backend` รายงาน `dxgi` / `gdi` /
  `lite` ตามจริง เดิมการสลับไป GDI (ซึ่งเป็นสิ่งที่เกิดขึ้นจริงเมื่อ Dota รันแบบ
  borderless-fullscreen) ไม่ถูกรายงานออกมาเลย ทุกหน้าจอจึงยังอ้างว่าใช้ DXGI อยู่
- **รีเซ็ต G-Sentry / G-Motion / G-Signal เมื่อจบ-เริ่มแมตช์** — เดิม state ทั้งสามตัวอยู่ใน
  thread ของ capture และไม่เคยถูกล้างเลยตลอดอายุโปรเซส ฮีโร่ที่ยืนยันตัวตนไว้ในแมตช์ก่อน
  จึงค้างอยู่ในลิสต์ "หายจากแมพ" ตลอดไป → ดันค่าความเสี่ยงพื้นฐานขึ้นเรื่อย ๆ จนข้ามเส้น
  danger ของระดับ High ได้ในแมตช์ที่สอง และตรึง capture loop ไว้ที่ 8 Hz ทั้ง session

## [0.13.2] — 2026-08-02
### Fixed
- Retired the competing tag publisher so candidate artifacts are built and signed by one release path before same-artifact promotion.

## [0.13.1] — 2026-08-01
### Changed
- Finalized signed candidate, channel manifest, same-artifact promotion, and Closed Beta evidence gates.

## [0.13.0] — 2026-07-19
### Changed
- **Overlay เหลือแบบเดียว — ปรับตำแหน่งเองได้ทุกชิ้น** — เดิมมีให้เลือก 2 โหมด
  (Lite ตำแหน่งตายตัว / Full ขยับได้แต่ฟีเจอร์ไม่ครบ) ต้องเลือกอย่างใดอย่างหนึ่ง
  ตอนนี้รวมเป็น overlay เดียว: ทุกชิ้น (การ์ดฆ่า/มัลติคิล + แบนเนอร์แพ็กเสียง + คลื่นเสียง,
  เตือนเลือดต่ำ, แถบปรับเสียง, ชิป standby, สถิติทั้งหมด) เป็น **โมดูลอิสระ** ที่เปิด/ปิด,
  ย่อ-ขยาย และลากวางตำแหน่งเองได้ผ่าน Layout Editor (Settings → Overlay UI). เอาสวิตช์
  Lite/Full ออก
- **ยืนยันเสียงประกาศครบทุกจังหวะในเกม** — first_blood, ดับเบิล/ทริปเปิล/อัลตร้า/แรมเพจ
  และ streak ครบ 8 ขั้น (killing spree → beyond godlike) เล่นเสียงจริงครบทุก tier

## [0.12.0] — 2026-07-18
### Added
- **เสียง default ครบทุก event แล้ว (24/24)** — เดิมแพ็กเสียงที่ติดตั้งมากับแอปมีแค่ 9 events
  (`match_start`, `first_blood`, มัลติคิลทั้ง 4, streak ทั้ง 8 ขั้น, `hpLow` ไม่มีเสียงเลย
  ตกไป TTS ของ Windows) — ตอนนี้ทุก event มีเสียงไทยตาม persona ของ Maiden จริง
  (มีมุกโดนเนิร์ฟมูฟสปีดใน `rampage` ด้วย)
- **แพ็ก "Maiden Default (ไทย)" โผล่ในคลังเสียงแล้ว** — เป็นการ์ดจริงแบบ default kit
  ของเกมดัง: ปักหมุดอันแรก มี badge "ติดมากับแอป", กด Equip/Preview ได้, อ่านอย่างเดียว
  (ตัวแก้ไขจะชี้ไปที่ Template Generator แทน) — แพ็กที่พากย์อยู่จริงไม่ล่องหนอีกต่อไป
### Changed
- **สถานะรายอีเวนต์บอกความจริง** — เลิกขึ้น "missing" ทั้งที่มีเสียงสำรอง: ชิปแสดงเชนจริง
  `N คลิป` (เสียงของแพ็ก) / `เสียงกลาง` (fallback ไปแพ็ก default) / `TTS` และปุ่ม ▶
  เล่นเสียงที่จะได้ยินจริงในเกม
- สคริปต์สร้างแพ็ก default (`gen_default_pack.py`) เป็น idempotent + มี unit test
  บังคับว่า event ใหม่ทุกตัวต้องมีเสียง default เสมอ

## [0.11.1] — 2026-07-18
### Fixed
- **ชิป "G-Maiden / GSI Signal" ลอยค้างบน desktop** — overlay เป็นเลเยอร์เต็มจอ
  always-on-top และวาด standby chip ตลอดเวลาแม้ไม่ได้เปิดเกม ตอนนี้ชิปโชว์เฉพาะตอนมี
  GSI feed จริง (ในเมนู/เกม Dota) หรือตอนกด "ทดสอบ overlay" — บน desktop เปล่า
  overlay ไม่วาดอะไรอีกแล้ว (แจ้งเตือนในเกมทำงานเหมือนเดิม)

## [0.11.0] — 2026-07-18
### Added
- **G-Store มีของจริงแล้ว** — economy backend (CR-003 schema) ขึ้น live: แพ็กฟรี
  "Maiden — Community Pack" (claim ได้ทันที), โค้ด redeem `MAIDENFREE` (รับแพ็กฟรี) และ
  `WELCOME250` (รับ 250 coins), พร้อมแพ็กเสียงชุดใหม่ (Frost / Meme) แบบ coming-soon.
  การเติมเงิน/ shard faucet ยังไม่เปิด (รอ legal/payment ตามแผน)
- **G-Motion ฉลาดขึ้น** — คำนวณทิศทางศัตรูก่อนหายจากแมป (มุ่งเข้ากลาง = เสี่ยงแก๊งค์สูงขึ้น,
  เดินออก = ฟาร์ม) จากประวัติ 5 นาทีที่เก็บอยู่แล้ว — แจ้งเตือนแม่นขึ้นโดยไม่กระทบ latency
- **Resource stats แสดง session peak** — CPU/RAM สูงสุดตั้งแต่เปิดแอป โชว์ได้ใน deck
  (พิสูจน์ budget ≤2.5% CPU / ≤400MB ได้ทั้งแมตช์); วัดจริงบน release: core 0.12% CPU / 66MB RAM
- `GameTick` เก็บ HP จริง (`hp`/`max_hp`) เพิ่มจากเปอร์เซ็นต์ — groundwork ระบบเตือน lethal-HP

### Fixed
- **Settings "กรอบทะลุ"** — กฎ R1 (ห้าม scroll ระดับหน้า) ของ settings split view แพ้กฎเก่า
  `!important` เงียบๆ มาตลอด; บังคับให้ชนะจริงแล้ว content ไม่ไหลลอดใต้ notch/ขอบกรอบอีก
  (ผู้ใช้ v0.9.1 ที่เจอหน้า settings แบบเก่าทะลุกรอบ — อัปเดตรุ่นนี้แล้วหาย)

## [0.10.0] — 2026-07-17
### Changed
- **ONE CANVAS sitemap (CR-013)** — the deck consolidates to 7 nav pages (`Ctrl+1..7`):
  Dashboard, Live, Voice, G-Store, Insights, Account, Settings. Build folds into Live as a
  tab (`[สด | บิลด์]`) and History folds into Insights (`[ภาพรวม | ประวัติ]`) via a reusable
  tab strip — no more orphaned top-level pages.
- **Settings is now an iOS-style split view** — a category rail (ทั่วไป / Overlay /
  เสียง & เตือน / AI (G-Master) / โมดูล & CV / ความเป็นส่วนตัว / ระบบ) renders one category
  at a time, replacing the old single long settings page.
### Added
- **G-Store** — the shard/wallet economy (CR-003) gets its own nav seat with a 4-tab home
  (`[ร้านค้า | กระเป๋า | คลัง | บันทึก]`), history pagination, and a "coming soon" store
  empty-state.
### Fixed
- **No page-level scroll (laws R1/R2)** — the deck surface never scrolls; only bounded
  regions do, and overflow folds into a tab or paginates. Deck fits to canvas cleanly.

## [0.9.1] — 2026-07-16
### Added
- **Command Deck redesign (CR-011, COLD BOOTH)** — the deck becomes a broadcast booth:
  phase-aware layout (standby / prep / live / debrief), ON AIR utterance ledger with
  Maiden's mid-sentence belief-revision strikethrough, Maiden Line command palette
  (Ctrl+K), glance mode, quality tiers (cinematic / balanced / eco) and density presets
  in a new Deck prefs card.
- **Big mode** — opt-in snap-up scale steps (1.15×–2.0×) so the deck can grow past 100%
  on large windows while keeping the 1420×760 aspect; small windows are unaffected.
- **Announcer pack `pack_mrijgajn`** ships pre-activated.

### Fixed
- **CV capture on multi-monitor setups (CR-012)** — G-Maiden now auto-detects which
  monitor Dota 2 is on (and follows it if the game moves), logs per-5s capture
  diagnostics, and falls back to GDI capture when DXGI duplication keeps losing access
  (MPO / independent-flip fullscreen-borderless). Minimap region retuned; fewer phantom
  hero detections (higher confidence + confirmation thresholds).
- **Settings page layout** — flow pages (Settings / Voice / Account / Insights / History /
  Build / Live) regained their interior inset; content no longer jams into the panel
  corner or slides under the topbar notch.
- **Minimap mirror fills its frame** (no letterboxing) and **hero slots no longer
  overlap** in the deck grid.

## [0.9.0] — 2026-07-10
### Changed
- **Command Deck shell refresh (CR-007, FROSTLINE)** — the control window keeps its
  subtract-glass silhouette but everything inside is sharper and calmer: the panel now
  renders 1:1 (no upscaling past authored size, so rims and text stay crisp), the
  bottom-right signal notch is a real cutout, the power controls became a corner FAB
  under the sidebar, and every shell piece shares one soft ambient-shadow family so the
  stack reads as one floating composition instead of stacked cards.
- **Window is fully transparent again** — dropped the acrylic window effect that painted a
  milky plate outside the shell and made dragging lag; the L1 support plate is clamped to
  the panel footprint, and heavy effects are suppressed while dragging.

### Added
- **Honest deck data** — hero slots show real hero names (or "—" when unknown, never fake
  0/0/0), the signal cards (Enemy Missing / Gank Risk / Risk Level / Gank ETA) read from
  real events instead of an in-UI formula, the Alert Deck shows a live event feed, and the
  Companion State tiles reflect the real active pack / signal state / CPU / RAM.
- **Audio rail wired to the backend** — the deck's volume slider and the SIGNAL / ANN
  toggles now drive the app for real and stay in sync with the global hotkeys (previously
  they only wrote to localStorage). ANN is a new announcer-pack mute that leaves Maiden's
  voice and gank warnings untouched.
- **G-AnnStudio install actually activates** — `POST /announcer/install` now auto-activates
  the installed pack and returns real per-event clip counts from its manifest (plus
  unmapped-event and missing-clip lists), so a pack authored in G-AnnStudio is voiced
  in-game immediately instead of only after a manual Activate.

### Fixed
- **Google sign-in works in packaged builds** — the content-security policy now allows the
  Supabase and Steam-CDN origins it needs (previously sign-in and the kill-banner hero
  image only worked in dev).
- **Voice-pack security** — a crafted or corrupted pack manifest could point a clip or
  banner at any file on disk (played, or inlined into the overlay just by opening Audio
  Settings); manifest paths are now contained to the pack folder, and archive import
  validates every entry against zip-slip.

## [0.8.0] — 2026-07-04
### Added
- **Command deck fully live-wired** — the telemetry footer, weekly report, match
  insights, history, and agent-sector status now use real data (`resource-stats`,
  OpenDota, local G-Log match files, live GSI) instead of MOCK; sourceless metrics
  render "—" rather than fabricated numbers.
- **Announcer packs are now bundles** — a pack's banner **image** and its sound
  fire together in-game. Activating a pack changes what's voiced (active-pack clip
  resolution), a new `announcer-banner` event shows the pack banner on the overlay
  (replacing the built-in kill card), and a **"Show on overlay"** button previews a
  pack's banner+sound without a match.
- **GPU / VRAM / temperature telemetry** in the deck footer via a bundled headless
  `gpu-feeder` sidecar (`nvidia-smi` → `POST /telemetry`) — the main app never runs
  nvidia-smi itself, keeping the NFR budgets about its own work.
- **Selectable telemetry source** (auto / feeder / G-Telemetry / off) — the sibling
  G-Telemetry app can feed a richer stream (CPU temperature, ~200 ms) which the deck
  prefers in `auto`; falls back to the light feeder or "—".

### Changed
- Documentation reconciled with the shipped codebase (SQLite→JSONL, cloud brain =
  Claude CLI/Ollama not Gemini, governor 10 s not 1 Hz, module tree, etc.); unbuilt
  feature specs now carry a dated "not implemented" banner.
- Version files bumped to 0.8.0 (tauri.conf / package.json / App.tsx).

## [0.7.5] — 2026-06-27
### Added
- **Announcer event pack system** — Maiden voices the full in-game event taxonomy
  derived from GSI: `match_start`, `first_blood`, `kill`, multi-kills
  (`double_kill`…`rampage`), the streak ladder (`killing_spree`/`dominating`/
  `mega_kill`/`unstoppable`/`wicked_sick`/`monster_kill`/`godlike`/`beyond_godlike`),
  and `death`/`respawn`/`levelUp`/`hpLow`/`manaLow`. The streak ladder matches the
  overlay kill banner exactly so audio and visuals stay in sync. Clips live in
  `voice-cache/{event}/`.
- **`POST /announcer/install` endpoint** — lets the G-AnnStudio pack editor install
  an announcer pack into voice-cache and read back per-event clip counts.
- **Master volume control** — slider + global hotkeys (Ctrl+Alt+S overlay,
  Alt+↑/↓ volume ±10, Alt+M mute), applied to both WAV clips and SAPI TTS.
- **G-Master backend picker** — choose auto / Claude / Ollama for advice, with
  per-event voice preview.
- **Maiden SVG portrait** on the overlay.

### Fixed
- WGC capture failing to start on Windows 10 (danger meter stuck on "ปลอดภัย").

### Changed
- Version files re-synced to 0.7.5 (tauri.conf / package.json / App.tsx).

## [0.6.0] — 2026-06-22
### Added
- **Individual stat toggles** — overlay stats (timer, score, HP/Mana bar, K/D/A, gold/NW) are now separately toggleable via checkboxes instead of one on/off switch
- **Custom overlay positioning** — new "กำหนดเอง" position mode with X/Y sliders; save/load named profiles
- **G-Damage engine** — Dota 2 burst damage calculator with hero database (8 heroes), armor/magic resistance formulas, ability-level estimation, and lethal threshold detection

### Changed
- Overlay preview no longer changes Dota/GSI status chips — status reflects real state only
- Settings migration: `showStats` boolean auto-converts to individual toggles on first load

---

## [0.5.0] — 2026-06-22
### Added
- **rodio audio backend** — WAV clips play in-process (no PowerShell spawn), cancel latency <1ms
- **Changelog viewer** in control panel — see what's new in each version

### Changed
- Audio playback uses dedicated `g-audio` thread via channel (was: PowerShell `SoundPlayer`)
- No more cmd/PowerShell window flash on clip playback

---

## [0.4.1] — 2026-06-21
### Fixed
- HP danger alert now re-fires after HP recovers (preview cycles 18%↔80%)

## [0.4.0] — 2026-06-21
### Changed
- Stat HUD (timer, score, HP/mana bar, K/D/A, gold) **off by default** — Dota UI already shows these
- Stats can be toggled on in settings if desired

## [0.3.0] — 2026-06-21
### Added
- **Overlay preview** — simulate in-game overlay without opening Dota
- **Bilingual voice test** — test button speaks Thai + English to diagnose TTS
- Danger banner + voice alert preview in control panel

## [0.2.0] — 2026-06-20
### Fixed
- CMD window no longer flashes every 4 seconds (watchdog `tasklist` with `CREATE_NO_WINDOW`)

## [0.1.0] — 2026-06-20
### Added
- Initial release: GSI server, overlay, control panel
- Minimap CV pipeline (WGC capture → prefilter → ONNX detect → G-Sentry → G-Motion → G-Signal)
- SAPI TTS voice (PowerShell), pre-recorded WAV clip support
- In-app auto-updater via GitHub Releases
- System tray icon + hide-to-tray
- G-Log local-only match logging (JSONL)
- GSI auto-install + watchdog (Dota process detection)

# Changelog

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

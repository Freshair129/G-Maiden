# Dota 2 UI reference

Screenshots of the **game's own UI** kept as reference for the CV / OCR / overlay /
calibration work — i.e. *where* each piece of information lives on screen, so the
overlay never blocks it and the capture/OCR pipelines crop the right regions.

> These are reference of Valve's Dota 2 client UI (third-party screenshots), used
> only as a development reference. Not G-Maiden's own design — for that see
> [`docs/architecture/assets/design-references/`](../../architecture/assets/design-references/).

| File | What it shows | Used for |
| --- | --- | --- |
| `hud-layout-annotated.webp` | Full in-game HUD with every element labelled (minimap, scoreboard, total gold, abilities, inventory, …) | Overlay positioning (avoid occlusion), capture-region geometry |
| `combat-log-panel.png` | The Combat Log panel | Future event-source reference (damage/kill parsing) |
| `status-stunned.png` | An in-world status indicator ("STUNNED") | CV/event reference |
| `hero-grid-strength.webp` | Hero-stats grid (Strength column) | Hero-icon reference for the minimap detector / OCR |

Related: scoreboard / net-worth notes live with the OCR work in
`tools/telemetry/ocr-test/` (run artifacts are gitignored as they may contain
player names).

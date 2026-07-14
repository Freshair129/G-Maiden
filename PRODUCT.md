# Product

## Register

product

## Users

- **Primary — the player (Boss archetype):** a competitive Thai Dota 2 player on Windows.
  During a match they are *inside Dota*, not in this app; the Command Deck is minimized to
  tray or glanced at on a second monitor from ~1–2m. They interact with the deck in three
  moments: pre-match readiness (seconds), mid-match peripheral glance (sub-second), and
  between-match debrief/management (minutes). Language: Thai-first, comfortable with
  English data labels.
- **Secondary — the streamer:** same player, broadcasting; needs sensitive data masked
  (Stream mode) and a deck that looks intentional on camera.
- **Tertiary — the pack author:** power user building announcer voice packs (G-AnnStudio
  pipeline); uses the deck's Voice editor and install endpoint.

## Product Purpose

G-Maiden is a real-time AI companion for Dota 2 — a live shoutcaster + co-pilot persona
("Maiden", inspired by Crystal Maiden) that narrates and warns via voice and a transparent
in-game overlay, reading Valve GSI + minimap CV within a hard latency budget (G-Signal
≤300ms). Two windows: the **Command Deck** (control, this design's main surface) and the
**Combat HUD** (in-game overlay — passive, click-through, own design contract in
`docs/design-system/07-combat-hud.md`). Success = the player trusts the voice, never
notices the overlay's cost, and returns to the deck between matches on purpose.

## Brand Personality

Quiet-luxury esport instrument. Three words: **calm, credible, cold** (ice palette,
arcane-tactical mood). The persona carries the warmth and humor (gentle + intelligent,
Nerf-CM self-deprecation, audible belief revision); the *surface* stays disciplined and
statistically credible. Calm by default, loud only on danger.

## Anti-references

- The project's own early AI mood board (`docs/architecture/assets/screen-directions/`):
  left sidebar + card grid + oversized anime-character hero panel — retired as a reference.
- Overwolf-style gamer overlays: RGB noise, badges everywhere, ad-shaped panels.
- Generic AI-chat companions: message bubbles, avatar-typing indicators.
- SaaS dashboard grammar: hero metrics with gradient accents, fake-chart bento, purple/blue
  AI gradients, marketing hero sections.
- Decorative glassmorphism: blur on every element without a depth meaning.

## Design Principles

1. **Peripheral-first.** Vital state must read from the corner of an eye: fixed positions,
   shape + color before text, no reflow between matches.
2. **Calm by default, loud on danger.** Cold quiet ground; lime/hot colors are reserved for
   "needs attention now" (G-Signal). Silence is what makes the alarm loud.
3. **Honest state.** No data = `—`, never a fake 0. Confidence and staleness are shown, not
   hidden. (This includes belief revision — being visibly wrong-then-corrected is a feature.)
4. **Glass = depth, not decoration.** Translucency means "floats above the game"; it belongs
   to the shell, not to every card. NFR budgets (CPU ≤2.5%, RAM ≤400MB, overlay FPS ≤3%)
   gate every visual decision.
5. **Persona in voice and copy, not in effects.** Maiden's character shows up as what she
   says and how she corrects herself — the chrome stays credible.

## Accessibility & Inclusion

- Contrast ≥4.5:1 for primary/secondary text measured on the real glass/tier backgrounds.
- Visible 2px focus ring (ice) on every tabbable control; full keyboard reachability.
- Never color-only meaning: signal states pair color + label + bar level.
- `prefers-reduced-motion`: ambient drift, slides, and bar transitions collapse to
  instant/crossfade.
- Minimum click target ~28–32px; Thai text needs looser leading (loops/ascenders).

# CR-010 — Exact slain hero for the kill banner (overlay ← backend)

- **Status:** Overlay side ready; needs one backend field.
- **Date:** 2026-07-13
- **Author:** Claude (overlay session)
- **For:** the concurrent G-Maiden backend session (owns `gsi.rs` / `runtime.rs` / `cv/`).

## Ask (small)
The overlay kill banner (`src/src/App.tsx`) now pops the **slain hero's portrait**, draws a red X over it stroke-by-stroke, then fades it to grayscale. It needs the **exact** victim hero.

Today the overlay only receives `last_victim_slot` (0-9) in the game-tick — it can't map slot → hero (no roster in the overlay window), so it **guesses** the victim from the set of heroes G-Sentry flagged missing. That's often wrong.

**Please resolve the victim backend-side and add one field to the game-tick payload:**

```
last_victim_hero: string   // npc name, e.g. "npc_dota_hero_antimage" or "antimage"
```

Resolve it from the `last_victim_slot` you already compute (`hero.kill_list` last entry's `victimid`) + the slot→hero roster the backend already holds (GSI/CV identities). Empty string when unknown (own-team victim, pre-resolution) is fine.

## Overlay is already wired for it
`Tick.last_victim_hero?: string` is added, and the kill banner uses it with the missing-set guess as fallback:
```ts
const victim = tick.last_victim_hero || missing.find(...) || missing[0] || null
```
So the moment the backend populates the field, the banner shows the exact victim — **no further overlay change needed**. Until then it keeps guessing; nothing breaks.

## Format note
The overlay builds the portrait URL as `dota_react/heroes/<short>.png` after stripping a leading `npc_dota_hero_` and (for its display name) title-casing the short via `prettyHeroName`. So either `npc_dota_hero_antimage` or `antimage` works — just be consistent with the npc **short** (not the localized "Anti-Mage").

## References
- Overlay: `src/src/App.tsx` (Tick interface + the kill `useEffect`), `src/src/index.css` (`gm-kill*`).
- Portrait helper (deck): `src/src/heroPortrait.ts`.

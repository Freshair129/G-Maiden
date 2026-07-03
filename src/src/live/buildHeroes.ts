// Phase 2a partial: only the local player slot is live; full 10-hero GSI = 2b.
//
// game-tick only exposes the LOCAL player (~30s heartbeat), so this builder can
// only refresh a single ally slot with real stats. The remaining nine hero slots
// stay on MOCK data until a GSI players block exists (Phase 2b). Enemy-missing
// overlays are layered on top by matching npc hero names against base.hero.

import type { GameTick, MinimapCv } from "./events";
import { prettyHeroName } from "./events";
import type { CompanionData } from "../companion";

export function buildHeroes(
  tick: GameTick | null,
  missing: Map<string, number>,
  _cv: MinimapCv | null,
  base: CompanionData["heroes"]
): CompanionData["heroes"] {
  // cv is reserved for Phase 2b (position-only use lives in buildMarkers).
  void _cv;

  if (!tick && missing.size === 0) return base;

  return base.map((hero, index) => {
    let next = hero;

    if (tick && index === 0) {
      next = {
        ...next,
        hero: prettyHeroName(tick.hero) || next.hero, // your REAL hero, not the scaffold name
        level: tick.level,
        kills: tick.kills,
        deaths: tick.deaths,
        assists: tick.assists,
        nw: tick.net_worth,
        gpm: tick.gpm,
        xpm: tick.xpm,
        lastHits: tick.last_hits,
        denies: tick.denies,
        hpPercent: tick.hp_percent,
        state: tick.alive ? "visible" : "dead",
        timer: tick.alive ? 0 : Math.round(tick.respawn_seconds),
      };
    }

    if (missing.size > 0) {
      for (const [npcName, missingForMs] of missing) {
        if (prettyHeroName(npcName).toLowerCase() === next.hero.toLowerCase()) {
          next = {
            ...next,
            state: "missing",
            timer: Math.round(missingForMs / 1000),
          };
          break;
        }
      }
    }

    return next;
  });
}

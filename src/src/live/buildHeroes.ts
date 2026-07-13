// Phase 2a partial + CR-007 WP-4 (honest content): only the local player slot
// (ally #1 / index 0) is backed by real GSI data — game-tick only exposes the
// LOCAL player, so ally slots 1-4 stay honestly "—" forever (GSI never
// reveals teammates' identities). Enemy slots (index 5-9) get filled in from
// two identity sources, both enemy-only:
//
//   1. the `missing` map (G-Sentry "enemy-missing" events) — fog-of-war only
//      ever tracks the *other* team.
//   2. MinimapCv detections — also enemy-only: the CV pipeline pre-filters
//      candidates to the enemy color ring (`enemy_team_ring()` in
//      capture.rs/runtime.rs), so a detection's hero identity is always an
//      enemy, never an ally.
//
// CR-007 WP-4 Fix 3 (gate regression): slot order used to be RE-DERIVED every
// tick (missing-map insertion order, then CV-only names alphabetically), so a
// newly-seen name that sorted earlier could push already-placed heroes into a
// different slot mid-match (tick1: CV sees Zeus -> e1; tick2: CV sees Axe +
// Zeus -> Axe takes e1 (alphabetically first), Zeus bumped to e2). Enemy
// identity -> slot is now assigned ONCE, permanently, in `enemySlots`
// (Map<npcHeroName, slotIndex 0-4>, owned + persisted by the live store in
// companion.ts, reset only on a new match — see companion.ts's game-tick
// handler). buildHeroes() stays pure: it only *reads* enemySlots to place an
// already-assigned identity into its permanent slot; it never assigns or
// reorders one itself. See `assignEnemySlot` below for the one place new
// names actually claim a slot.

import type { GameTick, MinimapCv, DraftRoster } from "./events";
import { prettyHeroName } from "./events";
import type { CompanionData } from "../companion";

export const ENEMY_SLOT_COUNT = 5;

/**
 * Claim the first free enemy slot (0-4) for `npcName` if it doesn't already
 * have one. Pure/immutable: returns a NEW Map when it assigns a slot, or the
 * SAME Map reference when there's nothing to do (already known, empty name,
 * or all 5 slots already claimed) — callers can cheaply skip work by
 * reference-comparing the result, matching the rest of live/companion.ts's
 * "return same reference = no-op" convention.
 *
 * Once a name claims a slot here it keeps it for the rest of the match; nothing
 * in this module ever removes or reassigns an entry (see companion.ts for the
 * one place that resets the whole table on a new match).
 */
export function assignEnemySlot(assignments: Map<string, number>, npcName: string): Map<string, number> {
  if (!npcName || assignments.has(npcName) || assignments.size >= ENEMY_SLOT_COUNT) return assignments;
  const used = new Set(assignments.values());
  for (let slot = 0; slot < ENEMY_SLOT_COUNT; slot++) {
    if (!used.has(slot)) {
      const next = new Map(assignments);
      next.set(npcName, slot);
      return next;
    }
  }
  return assignments;
}

export function buildHeroes(
  tick: GameTick | null,
  missing: Map<string, number>,
  cv: MinimapCv | null,
  base: CompanionData["heroes"],
  enemySlots: Map<string, number>,
  roster: DraftRoster | null = null,
  teamName = ""
): CompanionData["heroes"] {
  const cvNames = cv?.detections?.length ? cv.detections.map((d) => d.name).filter(Boolean) : [];
  if (!tick && missing.size === 0 && cvNames.length === 0 && enemySlots.size === 0 && !roster) return base;

  // Reverse index: slot -> npc name, so each enemy hero slot in `base` can be
  // filled straight from its permanent assignment (no re-derivation).
  const slotToName = new Map<number, string>();
  for (const [name, slot] of enemySlots.entries()) slotToName.set(slot, name);

  // Draft-CV: the full roster (all 10 identities) split by the LOCAL player's
  // team — this is what fills ally slots 1-4 (which GSI never reveals) and
  // pre-seeds enemy identities before CV ever sights them. Short label form.
  let allyOthers: string[] = [];
  let enemyRoster: string[] = [];
  if (roster && teamName) {
    const mine = teamName === "radiant" ? roster.radiant : roster.dire;
    const theirs = teamName === "radiant" ? roster.dire : roster.radiant;
    const localShort = tick ? tick.hero.replace(/^npc_dota_hero_/, "") : "";
    allyOthers = mine.filter((n) => n !== localShort); // the 4 teammates
    enemyRoster = theirs;
  }

  let allyIndex = 0;
  let enemyIndex = 0;

  return base.map((hero, index) => {
    let next = hero;

    if (hero.team === "ally") {
      const a = allyIndex;
      allyIndex += 1;
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
      } else if (a >= 1 && allyOthers[a - 1]) {
        // Ally slots 1-4: identity ONLY (GSI never exposes teammate KDA/economy,
        // so those stay "—"). This is the honest gain Draft-CV unlocks.
        next = { ...next, hero: prettyHeroName(allyOthers[a - 1]) || next.hero };
      }
    }

    if (hero.team === "enemy") {
      const e = enemyIndex;
      enemyIndex += 1;
      // Identity: prefer the pre-known draft roster; else the CV/missing slot map.
      const npcName = enemyRoster[e] ?? slotToName.get(e);
      if (npcName) {
        const missingMs = missing.get(npcName);
        next = {
          ...next,
          hero: prettyHeroName(npcName) || next.hero,
          state: missingMs !== undefined ? "missing" : "visible",
          timer: missingMs !== undefined ? Math.round(missingMs / 1000) : 0,
        };
      }
    }

    return next;
  });
}

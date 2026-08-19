// Pure builder for the Live page's "บิลด์" (Build) tab — CompanionData['buildAdvisor'].
// No side effects, no Tauri/React imports — inputs in, new object out.
//
// This tab had NO producer at all. It rendered whatever FALLBACK held, which
// was `{ hero: "Maiden", lane: "Support", itemPath: [], nextItem: "", notes: [] }`
// — two hardcoded strings presented as the player's actual hero and lane, above
// two permanently-empty cards. Meanwhile G-Master's real advice reached only the
// Overlay toast and the Settings card, never the deck.
//
// Everything below comes from data already on the wire:
//   • hero      — `tick.hero`, the real hero.
//   • itemPath  — `tick.item_names`. GSI has always sent the player's real
//                 inventory and Rust has always forwarded it; the frontend
//                 simply never typed the field.
//   • notes     — the actual `advice-update` text from G-Master.
//
// And what is NOT derivable stays "—" rather than being invented:
//   • lane      — GSI exposes no lane assignment. "Support" was a guess.
//   • nextItem  — G-Master answers in 1-2 sentences of Thai prose; there is no
//                 structured "next item" to parse out of it without the LLM
//                 inventing one, which is the failure mode this whole audit is
//                 about. The advice text goes in `notes` verbatim instead.

import type { GameTick } from "./events";
import { prettyHeroName } from "./events";
import type { CompanionData } from "../companion";

/** Sentinel for a field the game genuinely does not expose. */
const NO_DATA = "—";

export function buildAdvisor(
  tick: GameTick | null,
  advice: string | null,
  base: CompanionData["buildAdvisor"]
): CompanionData["buildAdvisor"] {
  if (!tick && !advice) return base;

  const hero = tick?.hero ? prettyHeroName(tick.hero) : NO_DATA;

  return {
    hero: hero || NO_DATA,
    // Honest: not observable from GSI. See the header note.
    lane: NO_DATA,
    // The player's REAL current inventory, not a recommended path. The card
    // that renders this is titled "Current item path", which is what it is.
    itemPath: tick?.item_names?.filter((i) => i.length > 0) ?? [],
    nextItem: NO_DATA,
    notes: advice ? [advice] : []
  };
}

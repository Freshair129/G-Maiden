// Phase 2b-A: pure OpenDota enrichment builder for the self hero's profile card.
//
// Overlays a normalized OpenDotaProfile onto the base (MOCK/Phase-2a) profile
// slice. `od === null` means offline/no account/fetch failure — keep base
// untouched. `od.public === false` means reachable-but-private — lock the
// card while keeping base's other fields. Behavior/role/hours aren't in
// OpenDota, so they always fall back to base.

import type { OpenDotaProfile } from "./opendota";
import type { CompanionData } from "../companion";

type HeroProfile = CompanionData["heroes"][number]["profile"];

export function buildProfile(od: OpenDotaProfile | null, base: HeroProfile): HeroProfile {
  if (od === null) return base;

  if (!od.public) {
    return { ...base, public: false };
  }

  return {
    ...base,
    public: true,
    winRate: od.winRate,
    games: od.games,
    kda: od.kda,
    mainHero: {
      name: od.mainHero.name,
      games: od.mainHero.games,
      winRate: od.mainHero.winRate
    },
    hours: od.hours !== undefined ? od.hours : base.hours
  };
}

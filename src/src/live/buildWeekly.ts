// Wire the "Weekly report" card (InsightsPage) to the player's REAL OpenDota
// profile instead of MOCK. OpenDota's normalized profile carries lifetime
// win/loss, an overall KDA ratio, and a single most-played hero — so we surface
// those honestly. It does NOT split K/D or give a true 7-day window, so `kd` is
// the overall ratio and topHeroes holds just the main hero (no fabricated pool).
//
// Pure, null-safe: `od === null` (offline / no account / fetch failed) or a
// private profile (`public === false`, all-zero) fall through to the MOCK demo.
import type { OpenDotaProfile } from "./opendota";
import type { CompanionData } from "../companion";

type Weekly = CompanionData["weeklyReport"];

export function buildWeekly(od: OpenDotaProfile | null, fallback: Weekly): Weekly {
  if (od === null || !od.public) return fallback;
  const round1 = (n: number) => Math.round(n * 10) / 10;
  const topHeroes = od.mainHero.name
    ? [{
        rank: 1,
        hero: od.mainHero.name,
        games: od.mainHero.games,
        winRate: Math.round(od.mainHero.winRate),
        kd: od.kda.toFixed(2)
      }]
    : fallback.topHeroes;
  return {
    winRate: round1(od.winRate),
    kd: round1(od.kda),
    topHeroes
  };
}

// Phase 2b-A: override the trend-baseline (*Avg) fields of the player stat
// block with the player's REAL historical averages from OpenDota, so the
// stat-bar arrows compare live values against the player's own norm instead
// of the flat Phase 2a placeholder (where *Avg == the live value).
//
// Pure, null-safe, no mutation. `od === null` (fetch failed / offline / no
// account configured / not under Tauri) or `od.baselines === null` (no recent
// matches to average) both fall through to the unchanged `base` player.
import type { OpenDotaProfile } from "./opendota";
import type { CompanionData } from "../companion";

type Player = CompanionData["match"]["player"];

export function buildBaselines(base: Player, od: OpenDotaProfile | null): Player {
  if (od === null || od.baselines === null) return base;

  const { gpmAvg, xpmAvg, kAvg, dAvg, aAvg, csAvg, deniesAvg } = od.baselines;

  return {
    ...base,
    // nwAvg intentionally left unchanged: OpenDota's recentMatches payload
    // carries no net-worth figure, so we have nothing to baseline it with.
    gpmAvg,
    xpmAvg,
    kAvg,
    dAvg,
    aAvg,
    csAvg,
    deniesAvg
  };
}

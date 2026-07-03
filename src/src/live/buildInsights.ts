// Wire the Match-Insights stat cards to real data where a source exists:
//   powerScore     ← OpenDota MMR estimate (a genuine "power" number)
//   winRate        ← OpenDota lifetime win rate
//   objectiveControl / wardEfficiency ← NO SOURCE (GSI exposes only the local
//     player; OpenDota has no per-match objective/ward split) → NO_SENSOR, the
//     page renders "—" rather than a fabricated percentage.
//   learnedMatches ← set separately from the local G-Log file count (buildHistory
//     path), so it is left on the fallback here.
//
// Pure, null-safe: `od === null` / private profile falls through to MOCK.
import type { OpenDotaProfile } from "./opendota";
import type { CompanionData } from "../companion";
import { NO_SENSOR } from "./buildTelemetry";

type Insights = CompanionData["insights"];

export function buildInsights(od: OpenDotaProfile | null, fallback: Insights): Insights {
  if (od === null || !od.public) return fallback;
  return {
    powerScore: od.mmr > 0 ? od.mmr : NO_SENSOR,
    winRate: Math.round(od.winRate * 10) / 10,
    objectiveControl: NO_SENSOR,
    wardEfficiency: NO_SENSOR,
    learnedMatches: fallback.learnedMatches // real count folded in from match logs
  };
}

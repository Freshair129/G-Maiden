// Wire the History page to the REAL local G-Log match files (`list_match_logs`,
// log.rs) instead of MOCK. Privacy-first: these logs live on-device and store a
// per-second tick stream — they do NOT record win/loss or a final KDA, so we
// surface what the files actually give us (recording time + size) and label the
// rest honestly rather than inventing a result.
//
// Pure, null-safe: `logs === null` (not under Tauri / command failed) or an
// empty list falls through to the MOCK demo so the standalone deck stays full.
import type { CompanionData } from "../companion";

type HistoryRow = CompanionData["history"][number];

/** Return shape of the `list_match_logs` Tauri command (log.rs MatchLog). */
export interface MatchLog {
  name: string;
  size: number;
  modified_ms: number;
}

export function buildHistory(logs: MatchLog[] | null, fallback: HistoryRow[]): HistoryRow[] {
  if (logs === null || logs.length === 0) return fallback;
  return logs.slice(0, 12).map((m) => {
    const when = new Date(m.modified_ms).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
    const kb = Math.max(1, Math.round(m.size / 1024));
    return {
      id: m.name,
      result: "Recorded",
      hero: when,
      kda: `${kb} KB`,
      note: "Local match log — replay to tune predictions (no win/loss stored)."
    };
  });
}

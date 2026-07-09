// Pure ring-buffer builder for the Alert Deck feed (CompanionData['activity']).
// CR-007 WP-4 replaces the old Dashboard.tsx "Alert Deck" tabbed-count stub
// with a real, most-recent-first event feed built from events the deck
// already listens to
// (gank-alert / gank-clear / enemy-missing — see live/events.ts).
//
// A ring buffer has no single "current value" to re-derive on every publish
// (unlike buildMatch/buildHeroes/buildSignals), so companion.ts owns the
// persisted log in LiveState.activityLog (same pattern as the `missing` /
// `missingPos` maps) and calls this once per discrete domain event to append
// + cap it. No Tauri/React imports — inputs in, new array out.

import type { EnemyMissing, SignalAlert } from "./events";
import { prettyHeroName } from "./events";
import type { CompanionData, CompanionTone } from "../companion";

export type ActivityEvent =
  | { kind: "gank-alert"; payload: SignalAlert }
  | { kind: "gank-clear" }
  | { kind: "enemy-missing"; payload: EnemyMissing };

/** Cap on the feed length — "most recent ~12 entries" per CR-007 WP-4 §6. */
export const MAX_ACTIVITY = 12;

function clockLabel(atMs: number): string {
  const d = new Date(atMs);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function describe(event: ActivityEvent): { text: string; tone: CompanionTone } {
  switch (event.kind) {
    case "gank-alert": {
      const pct = Math.round(event.payload.probability * 100);
      const heroes = event.payload.missing_heroes.map(prettyHeroName).filter(Boolean).join(", ");
      return {
        text: heroes ? `Gank risk ${pct}% — ${heroes} off map` : `Gank risk ${pct}%`,
        tone: pct >= 65 ? "danger" : "warn"
      };
    }
    case "gank-clear":
      return { text: "Gank risk cleared", tone: "good" };
    case "enemy-missing":
      return { text: `${prettyHeroName(event.payload.hero)} missing from vision`, tone: "warn" };
  }
}

/**
 * Pure append: given the previous log (most-recent-first) and one new event
 * that is already known to have happened at `atMs`, tagged with a
 * caller-supplied monotonic `seq` (so ids stay deterministic — no
 * Math.random/Date.now() inside a "pure" builder), returns the next log
 * capped at MAX_ACTIVITY. Returns `prev` unchanged (same reference) when
 * `event` is null, so callers can skip a re-render when nothing happened.
 */
export function buildActivity(
  event: ActivityEvent | null,
  atMs: number,
  seq: number,
  prev: CompanionData["activity"]
): CompanionData["activity"] {
  if (!event) return prev;
  const { text, tone } = describe(event);
  const entry = { id: `act-${seq}`, at: clockLabel(atMs), text, tone };
  return [entry, ...prev].slice(0, MAX_ACTIVITY);
}

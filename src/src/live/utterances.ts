// Pure ring-buffer builder for the ON AIR console (CompanionData['utterances']).
// CR-011 §B: Maiden's presence rendered as an utterance ledger — most-recent-first,
// capped, each entry stamped with source/kind, plus (for G-Signal belief-revision)
// the retracted words the caller renders struck through ahead of the correction.
// Same house pattern as buildActivity.ts: no Tauri/React imports, inputs in, new
// array out — companion.ts owns the persisted ledger and calls this once per
// `utterance` Tauri event to append + cap it.

import type { UtteranceEvent } from "./events";

export type Utterance = {
  id: string;
  atMs: number;
  timeLabel: string;
  source: "signal" | "master" | "announcer";
  kind: "line" | "revision";
  text: string;
  retracted: string | null;
  meta: string | null;
};

/** Cap on the ledger length — mirrors buildActivity's MAX_ACTIVITY convention. */
export const MAX_UTTERANCES = 30;

/** Human labels for announcer event ids (Opus gate, CR011-P2): the backend emits
 *  the raw enum id ("double_kill") because that IS the canonical event; the ledger
 *  renders a human label. Combat/streak labels stay EN-caps to mirror the overlay
 *  kill banner exactly (kill-banner sync rule in CLAUDE.md); status events read
 *  better in Thai. Unknown ids fall back to prettified caps, never raw snake_case. */
const ANNOUNCER_LABELS: Record<string, string> = {
  match_start: "เริ่มแมตช์",
  first_blood: "FIRST BLOOD",
  kill: "KILL",
  double_kill: "DOUBLE KILL",
  triple_kill: "TRIPLE KILL",
  ultra_kill: "ULTRA KILL",
  rampage: "RAMPAGE",
  killing_spree: "KILLING SPREE",
  dominating: "DOMINATING",
  mega_kill: "MEGA KILL",
  unstoppable: "UNSTOPPABLE",
  wicked_sick: "WICKED SICK",
  monster_kill: "MONSTER KILL",
  godlike: "GODLIKE",
  beyond_godlike: "BEYOND GODLIKE",
  death: "โดนสังหาร",
  respawn: "เกิดใหม่",
  levelUp: "เลเวลอัพ",
  hpLow: "HP ต่ำ",
  manaLow: "มานาต่ำ"
};

export function announcerLabel(eventId: string): string {
  return ANNOUNCER_LABELS[eventId] ?? eventId.replace(/_/g, " ").toUpperCase();
}

function timeLabel(atMs: number): string {
  const d = new Date(atMs);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/**
 * Pure prepend: given the previous ledger (most-recent-first) and one new
 * `utterance` Tauri event, returns the next ledger capped at MAX_UTTERANCES.
 *
 * `nowMs` is an optional caller-supplied "now" — the same reason buildActivity
 * takes its `atMs`/`seq` arguments instead of calling Date.now() itself, so this
 * stays a pure function. It is only consulted to break an id collision on the
 * rare case where two events share the same `atMs` + `source` (e.g. two
 * announcer lines land in the same tick); it defaults to `ev.atMs` so the
 * function stays fully deterministic when the caller omits it.
 */
export function buildUtterances(
  prev: Utterance[],
  ev: UtteranceEvent,
  nowMs?: number
): Utterance[] {
  const now = nowMs ?? ev.atMs;
  const baseId = `utt-${ev.atMs}-${ev.source}`;
  const id = prev.some((u) => u.id === baseId) ? `${baseId}-${now}` : baseId;

  const entry: Utterance = {
    id,
    atMs: ev.atMs,
    timeLabel: timeLabel(ev.atMs),
    source: ev.source,
    kind: ev.kind,
    // Announcer events arrive as canonical enum ids ("double_kill") — the ledger
    // shows the human label the kill banner uses (Opus gate, CR011-P2).
    text: ev.source === "announcer" ? announcerLabel(ev.text) : ev.text,
    retracted: ev.retracted ?? null,
    meta: ev.meta ?? null
  };

  return [entry, ...prev].slice(0, MAX_UTTERANCES);
}

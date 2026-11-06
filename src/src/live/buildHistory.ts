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

const HISTORY_DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
};
type HistoryFormatter = {
  languageKey: string;
  formatter: Intl.DateTimeFormat;
  labels: Map<number, string>;
};
let cachedFormatter: HistoryFormatter | null = null;

function historyFormatter(): HistoryFormatter {
  const languageKey = typeof navigator === "undefined"
    ? ""
    : [navigator.language, ...navigator.languages].join("\0");
  if (!cachedFormatter || cachedFormatter.languageKey !== languageKey) {
    cachedFormatter = {
      languageKey,
      formatter: new Intl.DateTimeFormat([], { ...HISTORY_DATE_OPTIONS, timeZone: "UTC" }),
      labels: new Map()
    };
  }
  return cachedFormatter;
}

function historyDateLabel(date: Date, cache: HistoryFormatter): string {
  if (!Number.isFinite(date.getTime())) return date.toLocaleString([], HISTORY_DATE_OPTIONS);
  // The label contains no zone name. Project current local civil fields into
  // UTC so a cached formatter cannot retain an obsolete host time zone.
  const civil = new Date(0);
  civil.setUTCFullYear(date.getFullYear(), date.getMonth(), date.getDate());
  civil.setUTCHours(date.getHours(), date.getMinutes(), 0, 0);
  // A valid timestamp near Date's limits can project outside the valid range.
  const key = civil.getTime();
  if (!Number.isFinite(key)) return date.toLocaleString([], HISTORY_DATE_OPTIONS);
  const previous = cache.labels.get(key);
  if (previous !== undefined) return previous;
  const label = cache.formatter.format(civil);
  cache.labels.set(key, label);
  if (cache.labels.size > 64) {
    const oldest = cache.labels.keys().next().value;
    if (oldest !== undefined) cache.labels.delete(oldest);
  }
  return label;
}

export function buildHistory(logs: MatchLog[] | null, fallback: HistoryRow[]): HistoryRow[] {
  if (logs === null || logs.length === 0) return fallback;
  const formatter = historyFormatter();
  return logs.slice(0, 12).map((m) => {
    const when = historyDateLabel(new Date(m.modified_ms), formatter);
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

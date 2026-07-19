import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

/** Return shape of `list_match_logs` (log.rs MatchLog) — same fields buildHistory.ts
 *  already consumes; redeclared locally rather than importing a private helper type. */
type DebriefLogMeta = { name: string; size: number; modified_ms: number };

/** Return shape of `read_match_log` (log.rs TimelineEntry, camelCase per the
 *  CR011-P3 contract — see live/events.ts's comment on the `utterance` payload
 *  for why this one Rust struct breaks the snake_case wire convention). */
type DebriefEntry = { atMs: number; kind: string; text: string };

const DEBRIEF_KIND_LABEL: Record<string, string> = {
  gank_signal: "GANK",
  gank_revision: "แก้คำทำนาย",
  enemy_missing: "หาย",
  match_start: "เริ่ม"
};

function debriefKindLabel(kind: string): string {
  return DEBRIEF_KIND_LABEL[kind] ?? kind.replace(/_/g, " ").toUpperCase();
}

/** Modifier suffix for `.gm-debrief-row-chip-*` — a small fixed set of tone
 *  classes instead of interpolating the raw `kind` string directly into a
 *  class name (keeps the CSS surface finite and predictable). */
function debriefKindTone(kind: string): string {
  switch (kind) {
    case "gank_signal":
      return "gank";
    case "gank_revision":
      return "revision";
    case "enemy_missing":
      return "missing";
    case "match_start":
      return "start";
    default:
      return "other";
  }
}

function debriefTimeLabel(atMs: number): string {
  const d = new Date(atMs);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** Cap on rows actually rendered (Opus/Rust already caps the parsed timeline
 *  at 500 — see log.rs TIMELINE_MAX_ENTRIES); the seat itself is a fixed box
 *  with `overflow:hidden`, so this is a data-size guard, not a scroll promise. */
const DEBRIEF_ROW_CAP = 200;

/** CR-011 §E debrief seat content: the timeline of the MOST RECENT archived
 *  match log (`list_match_logs` -> newest by modified time -> `read_match_log`).
 *  Renders inside the frozen `.gm-battle-grid` box in place of the hero
 *  columns + minimap. Every invoke is guarded — a failed/missing command
 *  renders an honest Thai notice, never a blank or fake row (house rule: every
 *  Tauri invoke in this codebase degrades to a stated fallback, never silence). */
export function DebriefTimeline({ onBackToLive }: { onBackToLive: () => void }) {
  const [state, setState] = useState<{ status: "loading" | "ready" | "error"; entries: DebriefEntry[] }>({
    status: "loading",
    entries: []
  });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading", entries: [] });
    (async () => {
      try {
        const logs = await invoke<DebriefLogMeta[]>("list_match_logs");
        if (cancelled) return;
        if (!logs || logs.length === 0) {
          setState({ status: "error", entries: [] });
          return;
        }
        const newest = logs.slice().sort((a, b) => b.modified_ms - a.modified_ms)[0];
        const entries = await invoke<DebriefEntry[]>("read_match_log", { name: newest.name });
        if (cancelled) return;
        // Most-recent-first, matching the ON AIR ledger's convention — the
        // seat is a fixed box (overflow:hidden, no scroll), so keeping the
        // newest events at the top is what actually stays visible.
        setState({ status: "ready", entries: entries.slice(-DEBRIEF_ROW_CAP).reverse() });
      } catch {
        if (!cancelled) setState({ status: "error", entries: [] });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="gm-battle-alt gm-debrief">
      <div className="gm-debrief-head">
        <span className="gm-debrief-title">สรุปแมตช์ล่าสุด</span>
        <button type="button" className="gm-debrief-back" onClick={onBackToLive}>
          กลับไปดูสด
        </button>
      </div>
      {state.status === "loading" ? (
        <div className="gm-debrief-empty">กำลังโหลดสรุปแมตช์…</div>
      ) : state.status === "error" ? (
        <div className="gm-debrief-empty">ยังอ่านสรุปแมตช์ไม่ได้ — ดูที่หน้า History</div>
      ) : (
        <div className="gm-debrief-list">
          {state.entries.map((entry, i) => (
            <div key={`${entry.atMs}-${i}`} className="gm-debrief-row">
              <span className="gm-debrief-row-time">{debriefTimeLabel(entry.atMs)}</span>
              <span className={`gm-debrief-row-chip gm-debrief-row-chip-${debriefKindTone(entry.kind)}`}>
                {debriefKindLabel(entry.kind)}
              </span>
              <span className="gm-debrief-row-text">{entry.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

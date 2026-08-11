import { useEffect, useState } from "react";
import { toneClass, useMinimapImage, type CompanionData } from "../companion";
import type { MatchPhase } from "../live/phase";
import type { ContextMenuController, ContextMenuEntry } from "../ContextMenu";

/** Honest replacement for the old permanent "—" ping readout: GSI has no ping
 *  field at all, so instead of faking one we show how stale the last data tick
 *  is. Ticks its own 1s interval locally (not from useCompanionData) so this
 *  is the only thing in the topbar re-rendering every second, not the whole
 *  deck. See CR-011 §B for the feed-age rationale. */
export function FeedAgePill({ updatedAt, online }: { updatedAt: number; online: boolean }) {
  const [, forceTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => forceTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  let value = "—";
  if (online && updatedAt > 0) {
    const age = Date.now() - updatedAt;
    value = age < 1000 ? "<1s" : `${Math.min(99, Math.round(age / 1000))}s`;
  }

  return (
    // No text label: the topbar is a fixed 446px contain:paint box — a "FEED" span
    // (~40px) risks clipping the profile trigger (Opus gate, CR011-P1). Icon + value
    // only, like the old ping pill. Tooltip says "sync" not "GSI tick": updatedAt is
    // stamped on ANY snapshot rebuild (incl. resource-stats), not GSI ticks alone.
    <div className="g-ping-pill" title="เวลาตั้งแต่ sync ข้อมูลล่าสุดจาก backend (GSI ไม่มีค่า ping จริง)">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 18h2" />
        <path d="M9 14h2" />
        <path d="M13 10h2" />
        <path d="M17 6h2" />
      </svg>
      <strong>{value}</strong>
    </div>
  );
}

/** Game-momentum meter + laning/mid/late phase chip. Signed bar grows right
 *  (green, we're ahead) or left (red, behind) from centre; value is the proxy
 *  from companion.momentum (kill lead + teamfight swing). See buildMomentum.ts. */
/** Boss feedback (2026-07-14): the old standalone .gm-momentum section had NO
 *  position rule since its very first commit — it flowed as a full-width block
 *  over the score-header zone ("สเกลผิด"). Momentum now lives INSIDE the score
 *  header as a slim broadcast-style win-bar under the scoreline (teams/clock
 *  row), where a momentum readout belongs. */
export function MomentumInline({ momentum }: { momentum: CompanionData["momentum"] }) {
  const v = Math.max(-100, Math.min(100, momentum.value));
  const mag = Math.min(50, Math.abs(v) / 2); // % of the half-track
  const fill = v >= 0 ? { left: "50%", width: `${mag}%` } : { left: `${50 - mag}%`, width: `${mag}%` };
  return (
    <div className="gm-mom-inline" title={`MOMENTUM ${v >= 0 ? "+" : ""}${v} — ${momentum.label}`}>
      <span className="gm-mom-inline-phase">{momentum.phaseLabel}</span>
      <div className="gm-mom-inline-track">
        <span className="gm-mom-center" />
        <span className={`gm-mom-fill ${v >= 0 ? "pos" : "neg"}`} style={fill} />
      </div>
      <span className={`gm-mom-inline-label ${toneClass(momentum.tone)}`}>{momentum.label}</span>
    </div>
  );
}

/** Live mirror of the real in-game minimap (captured + downscaled by the DXGI CV
 *  pipeline, arrives as a base64 PNG on `minimap-frame`). Falls back to the
 *  decorative grid before the first frame / when capture is in Lite mode. Its own
 *  hook keeps the ≈2 Hz image refresh from re-rendering the rest of the deck. */
export function MinimapMirror() {
  const image = useMinimapImage();
  if (image) {
    return (
      <div className="gm-minimap gm-minimap-live">
        <img className="gm-minimap-img" src={image} alt="In-game minimap" draggable={false} />
      </div>
    );
  }
  // No CV frame yet — before the match, or in Lite mode where capture never
  // starts. The decorative grid that used to sit here read as "the map is
  // empty" rather than "we cannot see it". A real Dota map is the honest
  // placeholder for the shape of the thing, but it is a STATIC REFERENCE, not
  // a mirror: it carries no hero positions and must never be mistaken for one.
  // Hence the dimming and the explicit badge — CR-007's rule that unknown state
  // renders as unknown, never as a plausible-looking zero.
  return (
    <div className="gm-minimap gm-minimap-ref">
      <img className="gm-minimap-img" src="/dota-minimap-reference.webp" alt="" draggable={false} />
      <span className="gm-minimap-ref-badge">ยังไม่เห็นแมพ · ภาพอ้างอิง</span>
    </div>
  );
}

const UTT_SOURCE_LABEL: Record<"signal" | "master" | "announcer", string> = {
  signal: "SIGNAL",
  master: "MASTER",
  announcer: "ANN"
};

/** Text copied by the utterance row's "คัดลอกข้อความ" context-menu item —
 *  includes the retracted prefix when the line is a belief-revision, so the
 *  copy reflects what was actually said (both the retraction and the
 *  correction), not just the final text (CR011-P4b-01). */
function utteranceCopyText(u: CompanionData["utterances"][number]): string {
  if (u.kind === "revision" && u.retracted) return `${u.retracted} → ${u.text}`;
  return u.text;
}

function utteranceMenuItems(u: CompanionData["utterances"][number]): ContextMenuEntry[] {
  return [
    {
      id: "utt-copy",
      label: "คัดลอกข้อความ",
      run: () => {
        void navigator.clipboard?.writeText(utteranceCopyText(u)).catch(() => {});
      }
    }
  ];
}

/** CR-011 §B: the agent sector reborn as an utterance ledger — Maiden's
 *  presence as what she said, when, and where she corrected herself, instead
 *  of a static art block. Renders inside the frozen `.gm-agent-card` box
 *  (440x354, geometry untouched) via new `gm-onair-*` classes only. */
export function OnAirConsole({ data, menu }: { data: CompanionData; menu: ContextMenuController }) {
  const list = data.utterances;
  const newest = list[0] ?? null;
  const rest = list.slice(1);
  // Backend chip: the newest MASTER-sourced line tells us which engine answered
  // ("ollama" = the local-SLM fallback, anything else = the cloud path).
  const latestMaster = list.find((u) => u.source === "master");
  const isLocalSlm = latestMaster?.meta === "ollama";
  const tallyOn = data.match.gsiOnline;

  return (
    <div className="gm-onair">
      <div className="gm-onair-head">
        <span className={`gm-tally${tallyOn ? " gm-tally-onair" : ""}`} />
        <b className="gm-onair-title">ON AIR — MAIDEN</b>
        <span className="gm-onair-end">
          <span className={`gm-onair-chip ${isLocalSlm ? "gm-onair-chip-local" : "gm-onair-chip-cloud"}`}>
            {isLocalSlm ? "LOCAL SLM" : "CLOUD"}
          </span>
          <span className="gm-onair-agent">{data.agentSector.name}</span>
        </span>
      </div>

      {newest ? (
        <div
          className="gm-onair-now"
          tabIndex={0}
          onContextMenu={(e) => menu.openFromMouseEvent(e, utteranceMenuItems(newest))}
          onKeyDown={(e) => menu.openFromKeyboard(e, utteranceMenuItems(newest))}
        >
          <span className="gm-onair-now-meta">{newest.timeLabel} · {UTT_SOURCE_LABEL[newest.source]}</span>
          <p className="gm-onair-now-text">
            {/* Belief revision is the headline signature — the strikethrough must
                show at the most prominent slot too, not only in the log rows
                (Opus gate, CR011-P2). */}
            {newest.kind === "revision" && newest.retracted ? (
              <>
                <s className="gm-onair-retract">{newest.retracted}</s> <b>{newest.text}</b>
              </>
            ) : (
              newest.text
            )}
            {newest.source === "announcer" && newest.meta ? (
              <span className="gm-onair-pack"> — แพ็ก {newest.meta}</span>
            ) : null}
          </p>
        </div>
      ) : (
        <div className="gm-onair-empty">
          ยังไม่มีเสียงพูดในเซสชันนี้ — เข้าเกมแล้ว Maiden จะเริ่มรายงานที่นี่
        </div>
      )}

      <div className="gm-onair-log">
        {rest.map((u) => (
          <div
            key={u.id}
            className="gm-onair-row"
            tabIndex={0}
            onContextMenu={(e) => menu.openFromMouseEvent(e, utteranceMenuItems(u))}
            onKeyDown={(e) => menu.openFromKeyboard(e, utteranceMenuItems(u))}
          >
            <span className="gm-onair-row-time">{u.timeLabel}</span>
            <span className={`gm-onair-row-chip gm-onair-row-chip-${u.source}`}>{UTT_SOURCE_LABEL[u.source]}</span>
            <p className="gm-onair-row-text">
              {u.kind === "revision" && u.retracted ? (
                <>
                  <s className="gm-onair-retract">{u.retracted}</s> <b>{u.text}</b>
                </>
              ) : (
                u.text
              )}
              {u.source === "announcer" && u.meta ? (
                <span className="gm-onair-pack"> — แพ็ก {u.meta}</span>
              ) : null}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

const PHASE_LABEL: Record<MatchPhase, string> = {
  standby: "STANDBY",
  prep: "PREP",
  live: "LIVE",
  debrief: "DEBRIEF"
};

/** CR-011 §D/§E: the score header's phase axis chip — STANDBY/PREP/LIVE/DEBRIEF.
 *  `.gm-score-header` is a fixed 640x48 box laid out as a 3-column grid (left
 *  score / clock / right score) with almost no horizontal slack between the
 *  clock and the right-side score text, so this renders absolutely positioned
 *  (the header is itself `position:absolute`, i.e. already a containing block
 *  for this) along the header's bottom edge — clear of the horizontally-
 *  centered score/clock text above it, never shifting or wrapping them. */
export function PhaseChip({ phase }: { phase: MatchPhase }) {
  return <span className={`gm-phase-chip gm-phase-chip-${phase}`}>{PHASE_LABEL[phase]}</span>;
}

/** CR-013 W1-01: a thin segmented control that lets a single rail page host
 *  two-or-three in-page views (Live: สด/บิลด์; Insights: ภาพรวม/รายสัปดาห์/
 *  ประวัติ) — this is presentational only, the caller owns which key is
 *  active and swaps the mounted content underneath. */
export function DeckTabs({
  tabs,
  active,
  onChange
}: {
  tabs: { key: string; label: string }[];
  active: string;
  onChange: (k: string) => void;
}) {
  return (
    <div className="deck-tabs" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.key}
          role="tab"
          aria-selected={active === t.key}
          className={`deck-tab${active === t.key ? " on" : ""}`}
          onClick={() => onChange(t.key)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** CR-011 §E standby/prep seat content — replaces the hero columns + minimap
 *  with a readiness rundown built ONLY from data the deck genuinely has today
 *  (no fake "Dota detected" checks). Ready rows get an ice check glyph;
 *  not-ready rows render an honest "—" mute, never a fake pass. */
export function ReadinessRundown({
  gsiOnline,
  voicePackName,
  signalEnabled,
  annEnabled,
  masterVolume,
  draftNote,
  onPreviewLive
}: {
  gsiOnline: boolean;
  voicePackName: string | null;
  signalEnabled: boolean;
  annEnabled: boolean;
  masterVolume: number;
  draftNote: boolean;
  onPreviewLive: () => void;
}) {
  // "ปิด"/"ปิดเสียง" for deliberately-toggled-off features — a user choice is not
  // the same state as a genuinely-absent capability ("—") (Opus gate, CR011-P3).
  const rows: Array<{ label: string; ready: boolean; value: string }> = [
    { label: "เชื่อมต่อ GSI", ready: gsiOnline, value: gsiOnline ? "ออนไลน์" : "—" },
    { label: "แพ็กเสียง", ready: voicePackName != null, value: voicePackName ?? "—" },
    { label: "G-Signal", ready: signalEnabled, value: signalEnabled ? "พร้อม" : "ปิด" },
    { label: "เสียงประกาศ ANN", ready: annEnabled, value: annEnabled ? "พร้อม" : "ปิด" },
    { label: "ระดับเสียง", ready: masterVolume > 0, value: masterVolume > 0 ? `${masterVolume}%` : "ปิดเสียง" }
  ];

  return (
    <div className="gm-battle-alt gm-rundown">
      {draftNote ? <div className="gm-rundown-note">กำลังดราฟต์ — รอเข้าเกม</div> : null}
      <div className="gm-rundown-list">
        {rows.map((row) => (
          <div key={row.label} className={`gm-rundown-row${row.ready ? " ready" : ""}`}>
            <span className="gm-rundown-glyph">{row.ready ? "✓" : "—"}</span>
            <span className="gm-rundown-label">{row.label}</span>
            <span className="gm-rundown-value">{row.value}</span>
          </div>
        ))}
      </div>
      {/* Same escape debrief has ("กลับไปดูสด"): preview the live seat layout
          (hero grid + minimap mirror) without waiting for a match — resets on
          the next real phase change like the debrief one (Boss request). */}
      <button type="button" className="gm-debrief-back gm-rundown-preview" onClick={onPreviewLive}>
        ดูหน้าจอสด (hero grid + minimap)
      </button>
    </div>
  );
}

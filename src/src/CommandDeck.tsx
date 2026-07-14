import { useState, useRef, useEffect, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import VoicePacksPage from "./VoicePacksPage";
import QuotaCard from "./QuotaCard";
import {
  BuildAdvisorPage,
  CompanionPage,
  HistoryPage,
  InsightsPage,
  LiveMatchPage,
  SettingsPage
} from "./CompanionPages";
import { useCompanionData, useMinimapImage, toneClass, formatKda, type CompanionData } from "./companion";
import { heroPortraitUrl } from "./heroPortrait";
import AccountPage from "./AccountPage";
import { useProfile } from "./profile";
import type { VoiceState } from "./voice-types";
import {
  IconDashboard,
  IconLive,
  IconVoice,
  IconBuild,
  IconInsights,
  IconSettings,
  IconAccount
} from "./DeckIcons";
import "./styles.css";

const FUNG_PANEL_PATH =
  "M 40,12 H 800 A 20 20 0 0 1 820,32 V 54 A 20 20 0 0 0 840,74 H 1248 A 20 20 0 0 1 1268,94 V 688 A 20 20 0 0 1 1248,708 H 112 A 20 20 0 0 1 92,688 V 350 A 20 20 0 0 0 72,330 H 32 A 20 20 0 0 1 12,310 V 40 A 28 28 0 0 1 40,12 Z";

// dashboard-only variant — CR-007 WP-1: adds the bottom-right subtract notch so the
// G-Signal cluster (D/E/F/G) sits in a real void instead of floating on solid glass.
// Same 12px-margin rhythm as the top-right topbar notch; 20px fillets throughout.
// Only used while tab === "dashboard" (the only tab that renders the signal cluster) —
// every other tab keeps the plain FUNG_PANEL_PATH so no stray hole appears.
const FUNG_PANEL_PATH_SIGNALS =
  "M 40,12 H 800 A 20 20 0 0 1 820,32 V 54 A 20 20 0 0 0 840,74 H 1248 A 20 20 0 0 1 1268,94 V 488 A 20 20 0 0 1 1248,508 H 836 A 20 20 0 0 0 816,528 V 688 A 20 20 0 0 1 796,708 H 112 A 20 20 0 0 1 92,688 V 350 A 20 20 0 0 0 72,330 H 32 A 20 20 0 0 1 12,310 V 40 A 28 28 0 0 1 40,12 Z";

// companion + history have no codex glyph — tiny inline fallbacks
function IconCompanion({ size = 20 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="7" width="16" height="11" rx="3" /><path d="M12 4v3M9 12h.01M15 12h.01" />
    </svg>
  );
}
function IconHistory({ size = 20 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1M3.5 5v3.5H7" /><path d="M12 8v4l2.5 1.5" />
    </svg>
  );
}

const NAV: Array<{ key: string; label: string; Icon: (p: { size?: number }) => ReactNode }> = [
  { key: "dashboard", label: "Dashboard", Icon: IconDashboard },
  { key: "live", label: "Live", Icon: IconLive },
  { key: "companion", label: "Companion", Icon: IconCompanion },
  { key: "voice", label: "Voice", Icon: IconVoice },
  { key: "build", label: "Build", Icon: IconBuild },
  { key: "insights", label: "Insights", Icon: IconInsights },
  { key: "history", label: "History", Icon: IconHistory },
  { key: "settings", label: "Settings", Icon: IconSettings }
];

export default function CommandDeck({ settingsPanel }: { settingsPanel?: ReactNode } = {}) {
  const [tab, setTab] = useState("dashboard");
  const [profileOpen, setProfileOpen] = useState(false);
  const [powerOpen, setPowerOpen] = useState(false);
  const [masterVolume, setMasterVolume] = useState(78);
  const [annEnabled, setAnnEnabled] = useState(true);
  const [signalEnabled, setSignalEnabled] = useState(true);
  const [voicePackName, setVoicePackName] = useState<string | null>(null);
  const volumeDebounceRef = useRef<number | null>(null);
  const { data } = useCompanionData();
  const { displayName, email } = useProfile();
  const gName = displayName || (email ? email.split("@")[0] : "Guest");
  const gSub = email || data.agentSector.title;

  // fixed 1420×760 stage (SSOT 03-layout.md) scaled to fill any window + rounded-fillet Subtract clip
  const stageRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const apply = () => {
      const stage = stageRef.current;
      if (stage) {
        // CR-007 follow-up: never upscale past authored 1420×760 size — a >1.0
        // scale factor blows up 1px rims/text into fat blurry lines ("chunky"
        // feedback). Downscale for small windows still applies via the min().
        const s = Math.min(window.innerWidth / 1420, window.innerHeight / 760, 1.0);
        stage.style.transform = `translate(-50%, -50%) scale(${s})`;
      }
    };
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, []);

  // CR-007 WP-4 Fix 1: the deck's audio rail is the SINGLE owner of volume,
  // signalEnabled, and announcerEnabled. It persists all three under one
  // localStorage key and pushes all three to the backend once on mount — the
  // persisted value is the seed (no `get_volume` round-trip needed, and it
  // fixes a real bug: a saved volume never used to reach the backend on a
  // cold start unless the user opened Settings, since Control's set_volume
  // effect only fired if/when its component mounted).
  useEffect(() => {
    let volume = 78;
    let ann = true;
    let signal = true;
    try {
      const raw = localStorage.getItem("gm-deck-audio-rail");
      if (raw) {
        const parsed = JSON.parse(raw) as { volume?: number; master?: number; annEnabled?: boolean; signalEnabled?: boolean };
        // `master` is the pre-WP-4 key name — read it so an upgrading user keeps their volume.
        const saved = typeof parsed.volume === "number" ? parsed.volume : parsed.master;
        if (typeof saved === "number") volume = saved;
        if (typeof parsed.annEnabled === "boolean") ann = parsed.annEnabled;
        if (typeof parsed.signalEnabled === "boolean") signal = parsed.signalEnabled;
      }
    } catch {
      /* noop */
    }
    setMasterVolume(volume);
    setAnnEnabled(ann);
    setSignalEnabled(signal);
    // Push the persisted values to the backend once on mount — the backend
    // has no way to recall a prior session's choice on its own (volume aside,
    // there is no get_announcer_enabled / get_cv_signal_enabled query command).
    void invoke("set_volume", { vol: volume }).catch(() => {});
    void invoke("set_announcer_enabled", { enabled: ann }).catch(() => {});
    void invoke("set_cv_signal_enabled", { enabled: signal }).catch(() => {});
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("gm-deck-audio-rail", JSON.stringify({ volume: masterVolume, annEnabled, signalEnabled }));
    } catch {
      /* noop */
    }
  }, [masterVolume, annEnabled, signalEnabled]);

  // Stay in sync when any OTHER surface (e.g. the legacy Control panel under
  // Settings, or the Alt+↑/↓/M global hotkeys) changes one of these three —
  // the backend emits *-change events for all three (main.rs) precisely so
  // no single owner can be silently desynced by another writer.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<number>("volume-change", (e) => setMasterVolume(e.payload))
      .then((fn) => { unlisten = fn; })
      .catch(() => {
        /* not running under Tauri — ignore */
      });
    return () => unlisten?.();
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<boolean>("signal-change", (e) => setSignalEnabled(e.payload))
      .then((fn) => { unlisten = fn; })
      .catch(() => {
        /* not running under Tauri — ignore */
      });
    return () => unlisten?.();
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<boolean>("announcer-change", (e) => setAnnEnabled(e.payload))
      .then((fn) => { unlisten = fn; })
      .catch(() => {
        /* not running under Tauri — ignore */
      });
    return () => unlisten?.();
  }, []);

  // CR-007 WP-4 Fix 5: clear any in-flight volume debounce on unmount so a
  // stale timer never fires `set_volume` against an unmounted deck.
  useEffect(() => {
    return () => {
      if (volumeDebounceRef.current !== null) window.clearTimeout(volumeDebounceRef.current);
    };
  }, []);

  // Companion State "Voice" tile — active announcer pack name, fetched once.
  useEffect(() => {
    invoke<VoiceState>("voice_api_state")
      .then((s) => setVoicePackName(s.activePack?.name ?? null))
      .catch(() => setVoicePackName(null));
  }, []);

  const handleVolumeChange = (value: number) => {
    setMasterVolume(value);
    if (volumeDebounceRef.current !== null) window.clearTimeout(volumeDebounceRef.current);
    volumeDebounceRef.current = window.setTimeout(() => {
      void invoke("set_volume", { vol: value }).catch(() => {});
    }, 80);
  };

  const handleAnnToggle = () => {
    setAnnEnabled((prev) => {
      const next = !prev;
      void invoke("set_announcer_enabled", { enabled: next }).catch(() => {});
      return next;
    });
  };

  const handleSignalToggle = () => {
    setSignalEnabled((prev) => {
      const next = !prev;
      void invoke("set_cv_signal_enabled", { enabled: next }).catch(() => {});
      return next;
    });
  };

  const error: string | null = null;
  const trayWindow = () => { try { void getCurrentWindow().hide(); } catch { /* noop */ } };
  const quitWindow = () => { void invoke("quit_application").catch(() => {}); };
  // CR-007 WP-2: suppress backdrop-filter/box-shadow while the native drag is in
  // flight (see .is-dragging in styles.css) — WebView2 recomposites those large
  // translucent/shadowed layers on every window-move tick, which is the drag lag.
  // Native window-drag swallows the mouse, so `mouseup` frequently never reaches
  // the webview; blur->focus and an 8s safety timeout are both needed as backstops
  // so the class can never get stuck on.
  const startWindowDrag = () => {
    const root = document.documentElement;
    root.classList.add("is-dragging");

    let cleaned = false;

    const onFocusAfterBlur = () => {
      window.removeEventListener("focus", onFocusAfterBlur);
      cleanup();
    };
    const onBlur = () => {
      window.addEventListener("focus", onFocusAfterBlur);
    };
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      root.classList.remove("is-dragging");
      window.removeEventListener("mouseup", cleanup);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocusAfterBlur);
      window.clearTimeout(safetyTimer);
    };

    window.addEventListener("mouseup", cleanup);
    window.addEventListener("blur", onBlur);
    const safetyTimer = window.setTimeout(cleanup, 8000);

    try {
      void getCurrentWindow().startDragging();
    } catch {
      cleanup();
    }
  };
  const dragFromSurface = (event: React.MouseEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest("button, input, select, textarea, a, [data-no-drag='true']")) return;
    startWindowDrag();
  };

  return (
    <div className="app deck-v3 g-deck">
      <div className="g-deck-bg" />

      <div className="g-deck-stage" ref={stageRef}>
      <div className="g-l1-white-glass" aria-hidden="true" />
      <svg className="g-clip-defs" width="0" height="0" viewBox="0 0 1280 720" aria-hidden="true" focusable="false">
        <defs>
          <path id="gSubtractPanelPath" d={tab === "dashboard" ? FUNG_PANEL_PATH_SIGNALS : FUNG_PANEL_PATH} />
          <clipPath id="gPanelClip" clipPathUnits="userSpaceOnUse">
            <use href="#gSubtractPanelPath" />
          </clipPath>
        </defs>
      </svg>
      {/* sidebar FAB — icon nav */}
      <aside className="g-sidebar-fab" onMouseDown={dragFromSurface}>
        <div className="g-brand" title="G-Maiden">G</div>
        <nav>
          {NAV.map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              className={`g-nav-item${tab === key ? " active" : ""}`}
              title={label}
              aria-label={label}
              onClick={() => setTab(key)}
            >
              <Icon size={20} />
            </button>
          ))}
        </nav>
      </aside>

      <div className={`g-power-radial${powerOpen ? " open" : ""}`}>
        <button
          type="button"
          className="g-power-main"
          aria-label="Power menu"
          title="Power menu"
          onClick={() => setPowerOpen((open) => !open)}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M12 3v8" />
            <path d="M6.3 7.8a8 8 0 1 0 11.4 0" />
          </svg>
        </button>
        <div className="g-power-menu" aria-hidden={!powerOpen}>
          <button type="button" className="g-power-action tray" title="Tray mode" aria-label="Tray mode" onClick={trayWindow}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 7.5h14v7H5z" />
              <path d="M9 11h6" />
              <path d="M8 17h8" />
            </svg>
          </button>
          <button type="button" className="g-power-action quit" title="Quit application" aria-label="Quit application" onClick={quitWindow}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
          <button
            type="button"
            className="g-power-action drag"
            title="Hold and drag window"
            aria-label="Hold and drag window"
            onMouseDown={(event) => {
              event.preventDefault();
              if (event.button !== 0) return;
              startWindowDrag();
            }}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 4v16M16 4v16" />
              <path d="M4 8h16M4 16h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* topbar FAB — brand + telemetry + profile + window controls */}
      <header className="g-topbar-fab" data-tauri-drag-region="" onMouseDown={dragFromSurface}>
        <span className="g-logo">G-MAIDEN</span>

        <div className="g-topbar-status">
          <div className={`g-status-pill${data.match.gsiOnline ? " online" : ""}`}>
            <span className="dot" />
            <strong>{data.match.gsiOnline ? "GSI Online" : "GSI Offline"}</strong>
          </div>
          <FeedAgePill updatedAt={data.updatedAt} online={data.match.gsiOnline} />
        </div>

        <div className={`profile-wrap${profileOpen ? " open" : ""}`}>
          <button className="profile-trigger" type="button" onClick={() => setProfileOpen((o) => !o)}>
            <span className="profile-core">{gName.charAt(0).toUpperCase()}</span>
            <span className="profile-copy">
              <strong>{gName}</strong>
              <small>{gSub}</small>
            </span>
            <span className="profile-caret">▾</span>
          </button>
          {profileOpen ? (
            <div className="profile-dropdown">
              <button type="button" onClick={() => { setTab("account"); setProfileOpen(false); }}><span className="dd-icon"><IconAccount size={14} /></span>Account &amp; Steam</button>
              <button type="button" onClick={() => { setTab("voice"); setProfileOpen(false); }}><span className="dd-icon"><IconVoice size={14} /></span>Voice Packs</button>
              <div className="dd-sep" />
              <button type="button" onClick={() => { setTab("settings"); setProfileOpen(false); }}><span className="dd-icon"><IconSettings size={14} /></span>Settings</button>
            </div>
          ) : null}
        </div>

      </header>

      {/* Audio rail replaces the old P-section */}
      {tab === "dashboard" && (
        <div className="g-audio-rail" onMouseDown={dragFromSurface}>
          <VolumeRail
            value={masterVolume}
            annEnabled={annEnabled}
            signalEnabled={signalEnabled}
            onVolumeChange={handleVolumeChange}
            onAnnToggle={handleAnnToggle}
            onSignalToggle={handleSignalToggle}
          />
        </div>
      )}

      {/* glass panel — hosts the active tab (rich, live-wired content preserved) */}
      <main className="g-deck-panel">
        {error ? <div className="banner err">engine offline ({error})</div> : null}
        <div className={`surface page-${tab}`}>
          {tab === "dashboard" && (
            <GMaidenFungDashboard data={data} voicePackName={voicePackName} signalEnabled={signalEnabled} />
          )}
          {tab === "live" && <LiveMatchPage />}
          {tab === "companion" && <CompanionPage />}
          {tab === "build" && <BuildAdvisorPage />}
          {tab === "insights" && <InsightsPage />}
          {tab === "voice" && <VoicePacksPage />}
          {tab === "history" && <HistoryPage />}
          {tab === "settings" && (
            settingsPanel ?? (
              <div style={{ display: "grid", gap: 16 }}>
                <SettingsPage />
                <QuotaCard />
              </div>
            )
          )}
          {tab === "account" && <AccountPage />}
        </div>
      </main>

      {/* Panel rim — g-deck-stage sibling of g-deck-panel, NOT a child. .g-deck-panel has
          overflow:hidden + contain:paint + clip-path, so a filter/drop-shadow on a child
          of it is clipped to the panel silhouette and never reaches the background. As a
          stage sibling positioned to exactly overlay the panel (same box, same shared
          #gSubtractPanelPath def above), its drop-shadow feathers outward past the
          notches instead of being clipped away with the panel. Same escape pattern as
          SignalGrid below. */}
      <svg className="g-panel-rim" viewBox="0 0 1280 720" aria-hidden="true" focusable="false">
        <use href="#gSubtractPanelPath" />
      </svg>

      {/* G-Signal cluster (D/E/F/G) — stage-level sibling of g-deck-panel, NOT a child.
          It must live outside the clipped panel so it renders inside the bottom-right
          subtract notch (FUNG_PANEL_PATH_SIGNALS) instead of being clipped away with it. */}
      {tab === "dashboard" && <SignalGrid signals={data.signals} />}
      </div>{/* /g-deck-stage */}
    </div>
  );
}

/** Honest replacement for the old permanent "—" ping readout: GSI has no ping
 *  field at all, so instead of faking one we show how stale the last data tick
 *  is. Ticks its own 1s interval locally (not from useCompanionData) so this
 *  is the only thing in the topbar re-rendering every second, not the whole
 *  deck. See CR-011 §B for the feed-age rationale. */
function FeedAgePill({ updatedAt, online }: { updatedAt: number; online: boolean }) {
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
function MomentumMeter({ momentum }: { momentum: CompanionData["momentum"] }) {
  const v = Math.max(-100, Math.min(100, momentum.value));
  const mag = Math.min(50, Math.abs(v) / 2); // % of the half-track
  const fill = v >= 0 ? { left: "50%", width: `${mag}%` } : { left: `${50 - mag}%`, width: `${mag}%` };
  return (
    <section className="gm-momentum">
      <div className="gm-mom-head">
        <span className="gm-mom-phase">{momentum.phaseLabel}</span>
        <span className="gm-mom-title">MOMENTUM</span>
        <span className={`gm-mom-label ${toneClass(momentum.tone)}`}>{momentum.label}</span>
      </div>
      <div className="gm-mom-track">
        <span className="gm-mom-center" />
        <span className={`gm-mom-fill ${v >= 0 ? "pos" : "neg"}`} style={fill} />
      </div>
    </section>
  );
}

/** Live mirror of the real in-game minimap (captured + downscaled by the DXGI CV
 *  pipeline, arrives as a base64 PNG on `minimap-frame`). Falls back to the
 *  decorative grid before the first frame / when capture is in Lite mode. Its own
 *  hook keeps the ≈2 Hz image refresh from re-rendering the rest of the deck. */
function MinimapMirror() {
  const image = useMinimapImage();
  return (
    <div className={`gm-minimap${image ? " gm-minimap-live" : ""}`}>
      {image ? (
        <img className="gm-minimap-img" src={image} alt="In-game minimap" draggable={false} />
      ) : (
        <>
          <div className="gm-map-grid" />
          <div className="gm-river" />
          <span className="gm-orb orb-a" />
          <span className="gm-orb orb-b" />
          <span className="gm-orb orb-c" />
        </>
      )}
    </div>
  );
}

const UTT_SOURCE_LABEL: Record<"signal" | "master" | "announcer", string> = {
  signal: "SIGNAL",
  master: "MASTER",
  announcer: "ANN"
};

/** CR-011 §B: the agent sector reborn as an utterance ledger — Maiden's
 *  presence as what she said, when, and where she corrected herself, instead
 *  of a static art block. Renders inside the frozen `.gm-agent-card` box
 *  (440x354, geometry untouched) via new `gm-onair-*` classes only. */
function OnAirConsole({ data }: { data: CompanionData }) {
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
        <div className="gm-onair-now">
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
          <div key={u.id} className="gm-onair-row">
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

function GMaidenFungDashboard({
  data,
  voicePackName,
  signalEnabled
}: {
  data: CompanionData;
  voicePackName: string | null;
  signalEnabled: boolean;
}) {
  const allyHeroes = data.heroes.filter((hero) => hero.team === "ally");
  const enemyHeroes = data.heroes.filter((hero) => hero.team === "enemy");

  // CR-007 WP-4: real governor readings — NO_SENSOR (-1, see buildTelemetry.ts)
  // renders "—" instead of a fake 0.
  const cpuValue = data.telemetry.cpuLoad >= 0 ? `${data.telemetry.cpuLoad}%` : "—";
  const ramValue = data.telemetry.ramUsedGb >= 0 ? `${Math.round(data.telemetry.ramUsedGb * 1024)} MB` : "—";

  return (
    <div className="gm-fung-layout">
      <section className="gm-score-header">
        <strong>{data.match.leftTeamName} {data.match.leftScore}</strong>
        <span className="gm-clock">{data.match.clock}</span>
        <strong>{data.match.rightScore} {data.match.rightTeamName}</strong>
      </section>

      <section className="gm-stats-bar">
        <MiniStat label="NW" value={String(data.match.player.nw)} sub="Local" />
        <MiniStat label="GPM" value={String(data.match.player.gpm)} sub="Farm" />
        <MiniStat label="XPM" value={String(data.match.player.xpm)} sub="Tempo" />
      </section>

      <MomentumMeter momentum={data.momentum} />

      <section className="gm-battle-grid">
        <div className="gm-slot-column">
          {[0, 1, 2, 3, 4].map((idx) => <HeroSlot key={`a-${idx}`} id={idx + 1} hero={allyHeroes[idx]} />)}
        </div>
        <MinimapMirror />
        <div className="gm-slot-column">
          {[0, 1, 2, 3, 4].map((idx) => <HeroSlot key={`e-${idx}`} id={idx + 6} hero={enemyHeroes[idx]} />)}
        </div>
      </section>

      <section className="gm-agent-card">
        <OnAirConsole data={data} />
      </section>

      <section className="gm-sector-log">
        <div>
          <h3><span className={`gm-tally${data.match.gsiOnline ? " gm-tally-onair" : ""}`} />Alert Deck</h3>
          <div className="log-list">
            {data.activity.length === 0 ? (
              <div className="log-row">
                <span className="log-time">--:--:--</span>
                <span className="log-text">No alerts yet</span>
              </div>
            ) : (
              data.activity.map((item) => (
                <div key={item.id} className={`log-row ${toneClass(item.tone)}`}>
                  <span className="log-time">{item.at}</span>
                  <span className="log-text">{item.text}</span>
                </div>
              ))
            )}
          </div>
        </div>
        <div>
          <h3><span className={`gm-tally${data.match.gsiOnline ? " gm-tally-onair" : ""}`} />Companion State</h3>
          <div className="gm-state-grid">
            <MiniStat label="Voice" value={voicePackName ?? "—"} sub="Active pack" />
            <MiniStat label="Signal" value={signalEnabled ? "ON" : "OFF"} sub="G-Signal" />
            <MiniStat label="CPU" value={cpuValue} sub="Governor" />
            <MiniStat label="RAM" value={ramValue} sub="Governor" />
          </div>
        </div>
      </section>
    </div>
  );
}

function MiniStat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="gm-mini-stat">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{sub}</small>
    </div>
  );
}

function VolumeRail({
  value,
  annEnabled,
  signalEnabled,
  onVolumeChange,
  onAnnToggle,
  onSignalToggle
}: {
  value: number;
  annEnabled: boolean;
  signalEnabled: boolean;
  onVolumeChange: (value: number) => void;
  onAnnToggle: () => void;
  onSignalToggle: () => void;
}) {
  return (
    <div className="g-volume-rail" data-no-drag="true">
      <div className="g-volume-copy">
        <strong>VOLUME</strong>
        <span>{value}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={value}
        onChange={(event) => onVolumeChange(Number(event.target.value))}
        aria-label="Master volume"
      />
      <div className="g-volume-toggles">
        <button
          type="button"
          className={`g-volume-toggle${annEnabled ? " on" : ""}`}
          onClick={onAnnToggle}
          title="Mutes G-AnnStudio announcer-pack events only (kill/streak/death lines). Maiden's persona voice and G-Signal gank warnings are separate and stay on."
        >
          ANN
        </button>
        <button type="button" className={`g-volume-toggle signal${signalEnabled ? " on" : ""}`} onClick={onSignalToggle}>
          SIGNAL
        </button>
      </div>
    </div>
  );
}

function HeroSlot({ id, hero }: { id: number; hero?: CompanionData["heroes"][number] }) {
  const heroName = hero && hero.hero !== "—" ? hero.hero : "—";
  const stateLabel = !hero || hero.state === "empty" ? "Waiting" : hero.state;
  const kda = hero ? formatKda(hero) : "—";
  // portrait art behind the card (CDN, dimmed); dead = fainter, missing = grey.
  const portrait = heroPortraitUrl(hero?.hero);
  const overlay = { position: "relative", zIndex: 1 } as const;
  return (
    <div
      className={`gm-hero-slot ${hero?.state ?? "empty"}`}
      style={portrait ? { position: "relative", overflow: "hidden" } : undefined}
      aria-label={`Hero slot ${id}`}
    >
      {portrait && (
        <img
          src={portrait}
          alt=""
          draggable={false}
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            opacity: hero?.state === "dead" ? 0.12 : 0.3,
            filter: hero?.state === "missing" ? "grayscale(0.7)" : undefined,
            pointerEvents: "none",
            zIndex: 0,
          }}
        />
      )}
      <strong style={portrait ? overlay : undefined}>{heroName}</strong>
      <span style={portrait ? overlay : undefined}>{stateLabel}</span>
      <em style={portrait ? overlay : undefined}>{kda}</em>
    </div>
  );
}

function SignalGrid({ signals }: { signals: CompanionData["signals"] }) {
  const tags = ["D", "E", "F", "G"];
  const fillClass = ["sg-fill-ice", "", "sg-fill-safe", "sg-fill-warn"];
  return (
    <div className="g-signals-fab">
      {signals.map((sig, i) => (
        <div key={sig.label} className={`g-sig${i === 1 ? " hero" : ""}`}>
          <span className="sg-tag">{tags[i]}</span>
          <span className="sg-label">{sig.label}</span>
          <span className="sg-val">{sig.value}</span>
          <div className="sg-bar">
            <div
              className={`sg-fill${fillClass[i] ? ` ${fillClass[i]}` : ""}`}
              style={{ width: `${sig.barPct}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}



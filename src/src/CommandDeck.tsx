import { useState, useRef, useEffect, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
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
import { useCompanionData, type CompanionData } from "./companion";
import AccountPage from "./AccountPage";
import { useProfile } from "./profile";
import {
  IconDashboard,
  IconLive,
  IconVoice,
  IconBuild,
  IconInsights,
  IconSettings
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
  const { data } = useCompanionData();
  const { displayName, email } = useProfile();
  const gName = displayName || (email ? email.split("@")[0] : "Guest");
  const gSub = email || data.agentSector.title;

  // G-Signal values for the bottom-right notch FABs (dashboard tab)
  const isPregame = data.match.minimapState === "empty";
  const enemyMissing = isPregame ? 0 : data.heroes.filter((h) => h.team === "enemy" && h.state === "missing").length;
  const gankRisk = isPregame ? 0 : Math.min(100, 26 + enemyMissing * 24 + data.match.activeAlerts * 8);
  const safePush = isPregame ? 0 : Math.max(0, 88 - enemyMissing * 18 - data.match.activeAlerts * 10);
  const vision = data.signals.find((s) => s.label.toLowerCase().startsWith("vision"))?.value ?? "—";

  // fixed 1280×800 stage scaled to fill any window (1280 → 1920) + rounded-fillet Subtract clip
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

  useEffect(() => {
    try {
      const raw = localStorage.getItem("gm-deck-audio-rail");
      if (!raw) return;
      const parsed = JSON.parse(raw) as { master?: number; annEnabled?: boolean; signalEnabled?: boolean };
      if (typeof parsed.master === "number") setMasterVolume(parsed.master);
      if (typeof parsed.annEnabled === "boolean") setAnnEnabled(parsed.annEnabled);
      if (typeof parsed.signalEnabled === "boolean") setSignalEnabled(parsed.signalEnabled);
    } catch {
      /* noop */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("gm-deck-audio-rail", JSON.stringify({
        master: masterVolume,
        annEnabled,
        signalEnabled
      }));
    } catch {
      /* noop */
    }
  }, [masterVolume, annEnabled, signalEnabled]);

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
    let safetyTimer: number | undefined;

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
      if (safetyTimer !== undefined) window.clearTimeout(safetyTimer);
    };

    window.addEventListener("mouseup", cleanup);
    window.addEventListener("blur", onBlur);
    safetyTimer = window.setTimeout(cleanup, 8000);

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
          <div className="g-ping-pill" title={`Ping ${data.match.player.ping}ms`}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 18h2" />
              <path d="M9 14h2" />
              <path d="M13 10h2" />
              <path d="M17 6h2" />
            </svg>
            <strong>{data.match.player.ping}ms</strong>
          </div>
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
              <button type="button" onClick={() => { setTab("account"); setProfileOpen(false); }}><span className="dd-icon">👤</span>Account &amp; Steam</button>
              <button type="button" onClick={() => { setTab("voice"); setProfileOpen(false); }}><span className="dd-icon">🎙</span>Voice Packs</button>
              <div className="dd-sep" />
              <button type="button" onClick={() => { setTab("settings"); setProfileOpen(false); }}><span className="dd-icon">⚙</span>Settings</button>
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
            onVolumeChange={setMasterVolume}
            onAnnToggle={() => setAnnEnabled((value) => !value)}
            onSignalToggle={() => setSignalEnabled((value) => !value)}
          />
        </div>
      )}

      {/* glass panel — hosts the active tab (rich, live-wired content preserved) */}
      <main className="g-deck-panel">
        {error ? <div className="banner err">engine offline ({error})</div> : null}
        <div className={`surface page-${tab}`}>
          {tab === "dashboard" && <GMaidenFungDashboard data={data} />}
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
      {tab === "dashboard" && (
        <SignalGrid enemyMissing={enemyMissing} gankRisk={gankRisk} safePush={safePush} vision={vision} />
      )}
      </div>{/* /g-deck-stage */}
    </div>
  );
}

function GMaidenFungDashboard({ data }: { data: CompanionData }) {
  const allyHeroes = data.heroes.filter((hero) => hero.team === "ally");
  const enemyHeroes = data.heroes.filter((hero) => hero.team === "enemy");

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

      <section className="gm-battle-grid">
        <div className="gm-slot-column">
          {[0, 1, 2, 3, 4].map((idx) => <HeroSlot key={`a-${idx}`} id={idx + 1} hero={allyHeroes[idx]} />)}
        </div>
        <div className="gm-minimap">
          <div className="gm-map-grid" />
          <div className="gm-river" />
          <span className="gm-orb orb-a" />
          <span className="gm-orb orb-b" />
          <span className="gm-orb orb-c" />
        </div>
        <div className="gm-slot-column">
          {[0, 1, 2, 3, 4].map((idx) => <HeroSlot key={`e-${idx}`} id={idx + 6} hero={enemyHeroes[idx]} />)}
        </div>
      </section>

      <section className="gm-agent-card">
        <div className="gm-card-head">
          <div><span>Agent sector</span><strong>{data.agentSector.name}</strong></div>
          <em>{data.agentSector.status}</em>
        </div>
        <div className="gm-agent-art">
          <strong>{data.agentSector.title}</strong>
        </div>
      </section>

      <section className="gm-sector-log">
        <div>
          <h3>Alert Deck</h3>
          <p>Threat tabs</p>
        </div>
        <div>
          <h3>Companion State</h3>
          <div className="gm-state-grid">
            <MiniStat label="Voice" value={data.match.voicePack} sub="Current pack" />
            <MiniStat label="Overlay" value={data.match.overlayMode} sub="Mirror mode" />
            <MiniStat label="Server" value={data.match.server} sub={`${data.match.latencyMs}ms`} />
            <MiniStat label="Perf" value={data.match.performance} sub="Companion mode" />
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
        <strong>VOLUM</strong>
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
        <button type="button" className={`g-volume-toggle${annEnabled ? " on" : ""}`} onClick={onAnnToggle}>
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
  return (
    <div className={`gm-hero-slot ${hero?.state ?? "empty"}`}>
      <strong>Slot ID {id}</strong>
      <span>{hero?.state ?? "Waiting"}</span>
      <em>{hero ? `${hero.kills}/${hero.deaths}/${hero.assists}` : "0 / 0 / 0"}</em>
    </div>
  );
}

function SignalGrid({
  enemyMissing,
  gankRisk,
  safePush,
  vision
}: {
  enemyMissing: number;
  gankRisk: number;
  safePush: number;
  vision: string;
}) {
  return (
    <div className="g-signals-fab">
      <div className="g-sig">
        <span className="sg-tag">D</span>
        <span className="sg-label">Enemy Missing</span>
        <span className="sg-val">{enemyMissing}</span>
        <div className="sg-bar"><div className="sg-fill sg-fill-ice" style={{ width: `${Math.min(100, enemyMissing * 20)}%` }} /></div>
      </div>
      <div className="g-sig hero">
        <span className="sg-tag">E</span>
        <span className="sg-label">Gank Risk</span>
        <span className="sg-val">{gankRisk}%</span>
        <div className="sg-bar"><div className="sg-fill" style={{ width: `${gankRisk}%` }} /></div>
      </div>
      <div className="g-sig">
        <span className="sg-tag">F</span>
        <span className="sg-label">Safe Push</span>
        <span className="sg-val">{safePush}%</span>
        <div className="sg-bar"><div className="sg-fill sg-fill-safe" style={{ width: `${safePush}%` }} /></div>
      </div>
      <div className="g-sig">
        <span className="sg-tag">G</span>
        <span className="sg-label">Vision</span>
        <span className="sg-val">{vision}</span>
        <div className="sg-bar"><div className="sg-fill sg-fill-warn" style={{ width: "40%" }} /></div>
      </div>
    </div>
  );
}



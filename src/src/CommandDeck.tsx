import { useState, useRef, useEffect, type ReactNode } from "react";
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
import { useCompanionData } from "./companion";
import Dashboard from "./Dashboard";
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
  const panelRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const apply = () => {
      const stage = stageRef.current;
      if (stage) {
        const s = Math.min(window.innerWidth / 1280, window.innerHeight / 800);
        stage.style.transform = `translate(-50%, -50%) scale(${s})`;
      }
      const p = panelRef.current;
      if (p) p.style.clipPath = `path('${buildPanelPath(p.offsetWidth, p.offsetHeight)}')`;
    };
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, [tab]);

  const error: string | null = null;

  return (
    <div className="app deck-v3 g-deck">
      <div className="g-deck-bg" />

      <div className="g-deck-stage" ref={stageRef}>
      {/* sidebar FAB — icon nav */}
      <aside className="g-sidebar-fab">
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

      {/* topbar FAB — brand + telemetry + profile + window controls */}
      <header className="g-topbar-fab" data-tauri-drag-region="">
        <span className="g-logo">G-MAIDEN</span>

        <div className="g-telemetry">
          <div className="g-telchip"><span>CPU</span><strong>{pct(data.telemetry.cpuLoad)}</strong></div>
          <div className="g-telchip"><span>RAM</span><strong>{mem(data.telemetry.ramUsedGb)}</strong></div>
          <div className="g-telchip"><span>GPU</span><strong>{pct(data.telemetry.gpuLoad)}</strong></div>
          <div className="g-telchip"><span>VRAM</span><strong>{mem(data.telemetry.vramUsedGb)}</strong></div>
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

      {/* P1–P5 agent anchor rail (dashboard) — spatial anchors for agent comms, not nav */}
      {tab === "dashboard" && (
        <div className="g-anchor-rail">
          {["P1", "P2", "P3", "P4", "P5"].map((p, i) => (
            <div key={p} className={`g-anchor${i === 0 ? " active" : ""}`} title={`Anchor ${p}`}>{p}</div>
          ))}
        </div>
      )}

      {/* glass panel — hosts the active tab (rich, live-wired content preserved) */}
      <main ref={panelRef} className={`g-deck-panel${tab === "dashboard" ? " has-signals" : ""}`}>
        {error ? <div className="banner err">engine offline ({error})</div> : null}
        <div className={`surface page-${tab}`}>
          {tab === "dashboard" && <Dashboard />}
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

      {/* G-Signal FABs (D/E/F/G) — float in the bottom-right Subtract notch */}
      {tab === "dashboard" && (
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
      )}

      {/* power FAB (bottom-left) — single block; click opens a radial menu with
          minimize / maximize / close (window controls live here, not the topbar) */}
      {powerOpen && <div className="g-power-scrim" onClick={() => setPowerOpen(false)} />}
      <div className={`g-power${powerOpen ? " open" : ""}`}>
        <button type="button" className="g-power-item pi-min" title="ย่อ (Minimize)" aria-label="Minimize" onClick={() => { winOp("min"); setPowerOpen(false); }}>─</button>
        <button type="button" className="g-power-item pi-max" title="ขยาย/พับ (Maximize)" aria-label="Maximize" onClick={() => { winOp("max"); setPowerOpen(false); }}>□</button>
        <button type="button" className="g-power-item pi-close" title="ปิด (Close)" aria-label="Close" onClick={() => { winOp("close"); setPowerOpen(false); }}>✕</button>
        <button type="button" className="g-power-btn" title="Window" aria-label="Window controls" onClick={() => setPowerOpen((o) => !o)}>
          <IconPower size={22} />
        </button>
      </div>
      </div>{/* /g-deck-stage */}
    </div>
  );
}

function winOp(op: "min" | "max" | "close") {
  try {
    const w = getCurrentWindow();
    if (op === "min") void w.minimize();
    else if (op === "max") void w.toggleMaximize();
    else void w.close();
  } catch { /* noop (browser preview has no Tauri window) */ }
}

function IconPower({ size = 22 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3.5v8" />
      <path d="M6.6 6.6a8 8 0 1 0 10.8 0" />
    </svg>
  );
}

// build a rounded-corner (fillet) SVG path for the concave Subtract panel.
// Two notches: top-right (topbar FAB) and bottom-left (sidebar + power FABs).
// The G-Signal cards (D–G) sit ON the panel's bottom-right (grounded on the
// frosted glass), NOT in a cutout — a hole there made them float over the void.
function buildPanelPath(w: number, h: number): string {
  const ntw = 364, nth = 58;   // top-right notch (topbar FAB)
  const nlw = 72, nlt = 216;   // bottom-left notch (sidebar + power FABs)
  const pts: Array<[number, number]> = [[0, 0], [w - ntw, 0], [w - ntw, nth], [w, nth], [w, h], [nlw, h], [nlw, nlt], [0, nlt]];
  return roundedPath(pts, 16);
}
function roundedPath(pts: Array<[number, number]>, r: number): string {
  const n = pts.length;
  let d = "";
  for (let i = 0; i < n; i++) {
    const [x0, y0] = pts[(i - 1 + n) % n];
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % n];
    const d1 = Math.hypot(x0 - x1, y0 - y1) || 1;
    const d2 = Math.hypot(x2 - x1, y2 - y1) || 1;
    const rr = Math.min(r, d1 / 2, d2 / 2);
    const ax = x1 + ((x0 - x1) / d1) * rr, ay = y1 + ((y0 - y1) / d1) * rr;
    const bx = x1 + ((x2 - x1) / d2) * rr, by = y1 + ((y2 - y1) / d2) * rr;
    d += (i === 0 ? `M ${ax} ${ay} ` : `L ${ax} ${ay} `) + `Q ${x1} ${y1} ${bx} ${by} `;
  }
  return d + "Z";
}

function pct(v: number): string {
  return v < 0 ? "—" : `${v}%`;
}
function mem(gb: number): string {
  if (gb < 0) return "—";
  return gb < 1 ? `${Math.round(gb * 1024)}M` : `${gb.toFixed(1)}G`;
}

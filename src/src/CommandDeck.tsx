import { useEffect, useMemo, useState, type ReactNode } from "react";
import { listen } from "@tauri-apps/api/event";
import AudioSettings from "./AudioSettings";
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
import "./styles.css";

const NAV: Array<{ key: string; label: string; group: string; icon: string }> = [
  { key: "dashboard", label: "Dashboard", group: "Real-Time", icon: "DB" },
  { key: "live", label: "Live Match", group: "Real-Time", icon: "LV" },
  { key: "companion", label: "Companion", group: "Assistant", icon: "AI" },
  { key: "voice", label: "Voice Packs", group: "Assistant", icon: "VO" },
  { key: "build", label: "Build Advisor", group: "Analysis", icon: "BD" },
  { key: "insights", label: "Match Insights", group: "Analysis", icon: "IN" },
  { key: "history", label: "History", group: "Analysis", icon: "HS" },
  { key: "settings", label: "Settings", group: "System", icon: "ST" }
];

// Monochrome line icons (inherit currentColor) — replace the DB/LV letter tags.
const NAV_ICONS: Record<string, ReactNode> = {
  dashboard: (<><rect x="3" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" /></>),
  live: (<><circle cx="12" cy="12" r="8.5" /><path d="M10 8.5l6 3.5-6 3.5z" fill="currentColor" stroke="none" /></>),
  companion: (<path d="M12 2.5l2.2 6.3 6.3 2.2-6.3 2.2L12 19.5l-2.2-6.3L3.5 11l6.3-2.2z" fill="currentColor" stroke="none" />),
  voice: (<><path d="M4 9.5h3l4.5-3.5v12L7 14.5H4z" /><path d="M16 9a4.5 4.5 0 0 1 0 6" /></>),
  build: (<><path d="M12 2.6l8.4 4.7v9.4L12 21.4l-8.4-4.7V7.3z" /><path d="M12 12l8.4-4.7M12 12v9.4M12 12L3.6 7.3" /></>),
  insights: (<path d="M5 20V11M12 20V4M19 20v-6" />),
  history: (<><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>),
  settings: (<><path d="M4 7h9M4 12h16M11 17h9" /><circle cx="16" cy="7" r="2.3" fill="currentColor" stroke="none" /><circle cx="8" cy="17" r="2.3" fill="currentColor" stroke="none" /></>)
};

function NavIcon({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {NAV_ICONS[name] ?? null}
    </svg>
  );
}

// Phase 1 (CR-002): the command deck runs standalone with mock data. The old
// G-Orchestra store (startPolling/useStore) is gone; loading/error are static
// and the sidebar count derives from companion data.
export default function CommandDeck() {
  const [tab, setTab] = useState("dashboard");
  const [profileOpen, setProfileOpen] = useState(false);
  const [captureMode, setCaptureMode] = useState<string>("");
  const { data } = useCompanionData();
  const { displayName, email } = useProfile();
  // Topbar identity: GID display name → email local-part → signed-out placeholder.
  const gName = displayName || (email ? email.split("@")[0] : "Guest");
  const gSub = email || data.agentSector.title;

  const loading = false;
  const error: string | null = null;
  const activeAlerts = data.match.activeAlerts || 0;

  // Re-add the capture-mode badge (DXGI / Lite) driven by the Rust backend.
  // Guarded so it no-ops when Tauri isn't present (e.g. plain browser build).
  useEffect(() => {
    if (typeof window === "undefined") return;
    let unlisten: (() => void) | undefined;
    try {
      listen<string>("capture-mode", (e) => setCaptureMode(e.payload))
        .then((fn) => { unlisten = fn; })
        .catch(() => {});
    } catch {
      /* Tauri event API unavailable */
    }
    return () => { if (unlisten) unlisten(); };
  }, []);

  const captureBadge = captureMode === "dxgi"
    ? { cls: "online", label: "DXGI" }
    : captureMode === "lite"
      ? { cls: "warn", label: "Lite" }
      : { cls: "idle", label: "…" };

  const grouped = useMemo(() => NAV.reduce<Record<string, typeof NAV>>((acc, item) => {
    if (!acc[item.group]) acc[item.group] = [];
    acc[item.group].push(item);
    return acc;
  }, {}), []);

  return (
    <div className="app shell-v2">
      <div className="live-background" />

      <aside className="floating-sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark">G</div>
          <div className="sidebar-brand-copy">
            <div className="brand">G-Maiden</div>
            <div className="brand-sub">Command Deck</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {Object.entries(grouped).map(([group, items]) => (
            <div key={group} className="sidebar-group">
              <div className="nav-group-label">{group}</div>
              {items.map(({ key, label }) => (
                <button key={key} className={`nav-item${tab === key ? " active" : ""}`} onClick={() => setTab(key)} title={label}>
                  <span className="nav-icon"><NavIcon name={key} /></span>
                  <span className="nav-copy">{label}</span>
                  {key === "dashboard" ? <small>{activeAlerts}</small> : null}
                </button>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      <div className="main-shell shell-main-v2">
        <header className="floating-topbar">
          <div className="topbar-left">
            <div className={`gsi-pill ${captureBadge.cls}`} title="Screen capture mode (DXGI / Lite)">
              <span className="gsi-dot" />
              <span>{captureBadge.label}</span>
            </div>

            <button className="topbar-search" type="button">
              <span className="search-icon">⌕</span>
              <span className="search-copy">Command palette / search modules</span>
              <span className="search-hotkey">Ctrl K</span>
            </button>
          </div>

          <div className="topbar-right">
            <span className="utility-chip">Alerts {activeAlerts}</span>
            <span className="utility-chip">{data.match.overlayMode}</span>
            <div className={`profile-wrap${profileOpen ? " open" : ""}`}>
              <button className="profile-trigger" type="button" onClick={() => setProfileOpen((open) => !open)}>
                <span className="profile-core">{gName.charAt(0).toUpperCase()}</span>
                <span className="profile-copy">
                  <strong>{gName}</strong>
                  <small>{gSub}</small>
                </span>
                <span className="profile-caret">▾</span>
              </button>
              {profileOpen ? (
                <div className="profile-dropdown">
                  <button type="button" onClick={() => { setTab("account"); setProfileOpen(false); }}>Account &amp; Steam</button>
                  <button type="button" onClick={() => { setTab("voice"); setProfileOpen(false); }}>Voice Packs</button>
                  <button type="button" onClick={() => { setTab("settings"); setProfileOpen(false); }}>Settings</button>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        {error ? (
          <div className="banner err">engine offline ({error})</div>
        ) : null}

        {loading ? <div className="loading">loading tactical dashboard...</div> : (
          <main className={`surface page-${tab}`}>
            {tab === "dashboard" && <Dashboard />}
            {tab === "live" && <LiveMatchPage />}
            {tab === "companion" && <CompanionPage />}
            {tab === "build" && <BuildAdvisorPage />}
            {tab === "insights" && <InsightsPage />}
            {tab === "voice" && <AudioSettings />}
            {tab === "history" && <HistoryPage />}
            {tab === "settings" && (
              <div style={{ display: "grid", gap: 16 }}>
                <SettingsPage />
                <QuotaCard />
              </div>
            )}
            {tab === "account" && <AccountPage />}
          </main>
        )}

        <footer className="telemetry-footer card-shell">
          <TelemetryMetric label="CPU Load" value={`${data.telemetry.cpuLoad}%`} sub={`${data.telemetry.cpuTemp}°C`} />
          <TelemetryMetric label="RAM Temp" value={`${data.telemetry.ramLoad}%`} sub={`${data.telemetry.ramTemp}°C`} />
          <TelemetryMetric label="GPU Load" value={`${data.telemetry.gpuLoad}%`} sub={`${data.telemetry.gpuTemp}°C`} />
          <TelemetryMetric label="VRAM Temp" value={`${data.telemetry.vramLoad}%`} sub={`${data.telemetry.vramTemp}°C`} />
          <div className="telemetry-sync">Last sync {new Date(data.updatedAt).toLocaleTimeString()}</div>
        </footer>
      </div>
    </div>
  );
}

function TelemetryMetric({ label, value, sub }: { label: string; value: string; sub: string }) {
  const isMemoryMetric = label === "RAM Temp" || label === "VRAM Temp";
  const displayLabel = label === "RAM Temp" ? "RAM Used" : label === "VRAM Temp" ? "VRAM Used" : label;
  const displayValue = isMemoryMetric ? value.replace("%", "GB") : value;
  const displaySub = isMemoryMetric ? `/ ${sub.replace("Â°C", "GB").replace("°C", "GB")}` : sub;
  return (
    <div className="telemetry-metric">
      <span>{displayLabel}</span>
      <strong>{displayValue}</strong>
      <small>{displaySub}</small>
    </div>
  );
}

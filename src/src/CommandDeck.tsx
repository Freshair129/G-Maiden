import { useEffect, useMemo, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import AudioSettings from "./AudioSettings";
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

// Phase 1 (CR-002): the command deck runs standalone with mock data. The old
// G-Orchestra store (startPolling/useStore) is gone; loading/error are static
// and the sidebar count derives from companion data.
export default function CommandDeck() {
  const [tab, setTab] = useState("dashboard");
  const [profileOpen, setProfileOpen] = useState(false);
  const [captureMode, setCaptureMode] = useState<string>("");
  const { data } = useCompanionData();

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
      : { cls: "offline", label: "…" };

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
              {items.map(({ key, label, icon }) => (
                <button key={key} className={`nav-item${tab === key ? " active" : ""}`} onClick={() => setTab(key)} title={label}>
                  <span className="nav-icon">{icon}</span>
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
            <div className={`gsi-pill ${data.match.gsiOnline ? "online" : "offline"}`}>
              <span className="gsi-dot" />
              <span>GSI {data.match.gsiOnline ? "Online" : "Offline"}</span>
            </div>

            <div className={`gsi-pill ${captureBadge.cls}`} title="Screen capture mode">
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
                <span className="profile-core">N</span>
                <span className="profile-copy">
                  <strong>Nikitin</strong>
                  <small>{data.agentSector.title}</small>
                </span>
                <span className="profile-caret">▾</span>
              </button>
              {profileOpen ? (
                <div className="profile-dropdown">
                  <button type="button">Profile</button>
                  <button type="button">Voice Packs</button>
                  <button type="button">Privacy</button>
                  <button type="button">System Logs</button>
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
            {tab === "settings" && <SettingsPage />}
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

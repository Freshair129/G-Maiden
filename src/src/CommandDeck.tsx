import { useState, type ReactNode } from "react";
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
import "./styles.css";

const NAV: Array<{ key: string; label: string }> = [
  { key: "dashboard", label: "Dashboard" },
  { key: "live", label: "Live" },
  { key: "companion", label: "Companion" },
  { key: "voice", label: "Voice" },
  { key: "build", label: "Build" },
  { key: "insights", label: "Insights" },
  { key: "history", label: "History" },
  { key: "settings", label: "Settings" }
];

export default function CommandDeck({ settingsPanel }: { settingsPanel?: ReactNode } = {}) {
  const [tab, setTab] = useState("dashboard");
  const [profileOpen, setProfileOpen] = useState(false);
  const { data } = useCompanionData();
  const { displayName, email } = useProfile();
  const gName = displayName || (email ? email.split("@")[0] : "Guest");
  const gSub = email || data.agentSector.title;

  const loading = false;
  const error: string | null = null;

  return (
    <div className="app deck-v3">
      <div className="live-background" />

      <header className="deck-topbar" data-tauri-drag-region="">
        <div className="deck-topbar-brand">G</div>

        <nav className="deck-nav">
          {NAV.map(({ key, label }) => (
            <button
              key={key}
              className={`deck-tab${tab === key ? " active" : ""}`}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="deck-topbar-right">
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
          <div className="window-controls">
            <button type="button" className="win-btn" onClick={() => { try { void getCurrentWindow().minimize() } catch {} }}>─</button>
            <button type="button" className="win-btn" onClick={() => { try { void getCurrentWindow().toggleMaximize() } catch {} }}>□</button>
            <button type="button" className="win-btn win-close" onClick={() => { try { void getCurrentWindow().close() } catch {} }}>✕</button>
          </div>
        </div>
      </header>

      <div className="deck-body">
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
          </main>
        )}

        <footer className="telemetry-footer card-shell">
          <TelemetryMetric label="CPU Load" value={pct(data.telemetry.cpuLoad)} sub={temp(data.telemetry.cpuTemp)} />
          <TelemetryMetric label="RAM Used" value={mem(data.telemetry.ramUsedGb)} sub={memTotal(data.telemetry.ramTotalGb)} />
          <TelemetryMetric label="GPU Load" value={pct(data.telemetry.gpuLoad)} sub={temp(data.telemetry.gpuTemp)} />
          <TelemetryMetric label="VRAM Used" value={mem(data.telemetry.vramUsedGb)} sub={memTotal(data.telemetry.vramTotalGb)} />
          <div className="telemetry-sync">Last sync {new Date(data.updatedAt).toLocaleTimeString()}</div>
        </footer>
      </div>
    </div>
  );
}

function pct(v: number): string {
  return v < 0 ? "—" : `${v}%`;
}
function temp(v: number): string {
  return v < 0 ? "—" : `${v}°C`;
}
function mem(gb: number): string {
  if (gb < 0) return "—";
  return gb < 1 ? `${Math.round(gb * 1024)} MB` : `${gb.toFixed(1)} GB`;
}
function memTotal(gb: number): string {
  if (gb < 0) return "";
  return gb < 1 ? `/ ${Math.round(gb * 1024)} MB` : `/ ${gb.toFixed(1)} GB`;
}

function TelemetryMetric({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="telemetry-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{sub}</small>
    </div>
  );
}

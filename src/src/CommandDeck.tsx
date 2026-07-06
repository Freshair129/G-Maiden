import { useState, useRef, useEffect, type ReactNode } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getVersion } from "@tauri-apps/api/app";
import { check } from "@tauri-apps/plugin-updater";
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
  const [notifOpen, setNotifOpen] = useState(false);
  const [version, setVersion] = useState("0.8.0");
  const [updText, setUpdText] = useState<string | null>(null);

  useEffect(() => { getVersion().then(setVersion).catch(() => { /* browser preview */ }); }, []);

  const checkUpdate = async () => {
    if (updText === "กำลังตรวจ…") return;
    setUpdText("กำลังตรวจ…");
    try {
      const up = await check();
      if (up) { setUpdText(`มีอัปเดต v${up.version}`); setTab("settings"); }
      else setUpdText("ล่าสุดแล้ว ✓");
    } catch { setUpdText("ตรวจไม่ได้"); }
    window.setTimeout(() => setUpdText(null), 4000);
  };

  // sample notifications — TODO: wire to a real feed (alerts / update / GSI status)
  const notifs = [
    { id: "gsi", title: "GSI พร้อมทำงาน", body: "ฟัง game-tick ที่พอร์ต :3000", time: "เมื่อสักครู่" },
    { id: "welcome", title: "ยินดีต้อนรับสู่ G-Maiden", body: "เปิด Dota 2 เพื่อเริ่มการวิเคราะห์สด", time: "วันนี้" },
  ];
  const { data } = useCompanionData();
  const { displayName, email } = useProfile();
  const gName = displayName || (email ? email.split("@")[0] : "Guest");
  const gSub = email || data.agentSector.title;

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

      <div className="g-deck-stage" ref={stageRef}>
      <div className="g-deck-glass-bg" />
      {/* sidebar FAB — icon nav (brand moved to the P1 logo tile) */}
      <aside className="g-sidebar-fab">
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

      {/* topbar FAB — brand + version + update + notifications + profile.
          onMouseDown drags the frameless window (data-tauri-drag-region is
          unreliable inside the scaled stage). */}
      <header className="g-topbar-fab" data-tauri-drag-region="" onMouseDown={startWindowDrag}>
        <div className="g-brandcol">
          <span className="g-logo">G-MAIDEN</span>
          <span className="g-ver">v{version}</span>
        </div>

        <button type="button" className="g-tb-btn g-upd-btn" title="ตรวจหาอัปเดต" onClick={checkUpdate}>
          <IconUpdate size={16} />
          {updText ? <span className="g-upd-text">{updText}</span> : null}
        </button>

        <div className={`g-notif-wrap${notifOpen ? " open" : ""}`}>
          <button type="button" className="g-tb-btn" title="การแจ้งเตือน" aria-label="Notifications" onClick={() => setNotifOpen((o) => !o)}>
            <IconBell size={17} />
            {notifs.length > 0 ? <span className="g-notif-dot" /> : null}
          </button>
          {notifOpen ? (
            <>
              <div className="g-notif-scrim" onMouseDown={(e) => { e.stopPropagation(); setNotifOpen(false); }} />
              <div className="g-notif-drop">
                <div className="g-notif-head">การแจ้งเตือน<span>{notifs.length}</span></div>
                {notifs.length ? notifs.map((n) => (
                  <div key={n.id} className="g-notif-item">
                    <strong>{n.title}</strong>
                    <p>{n.body}</p>
                    <small>{n.time}</small>
                  </div>
                )) : <div className="g-notif-empty">ไม่มีการแจ้งเตือน</div>}
              </div>
            </>
          ) : null}
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

      {/* left rail — P1 = brand logo, P2–P5 = telemetry (moved off the topbar) */}
      <div className="g-anchor-rail">
        <div className="g-anchor g-logo-tile" title="G-Maiden"><LogoMark /></div>
        <div className="g-tele" title="CPU load / temp">
          <span className="gt-k">CPU</span>
          <span className="gt-v">{pct(data.telemetry.cpuLoad)}<em>{deg(data.telemetry.cpuTemp)}</em></span>
        </div>
        <div className="g-tele" title="RAM in use">
          <span className="gt-k">RAM</span>
          <span className="gt-v">{mem(data.telemetry.ramUsedGb)}</span>
        </div>
        <div className="g-tele" title="GPU load / temp">
          <span className="gt-k">GPU</span>
          <span className="gt-v">{pct(data.telemetry.gpuLoad)}<em>{deg(data.telemetry.gpuTemp)}</em></span>
        </div>
        <div className="g-tele" title="VRAM in use">
          <span className="gt-k">VRAM</span>
          <span className="gt-v">{mem(data.telemetry.vramUsedGb)}</span>
        </div>
      </div>

      {/* glass panel — hosts the active tab (rich, live-wired content preserved) */}
      <main ref={panelRef} className="g-deck-panel">
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

// Drag the frameless window from the topbar's empty space. data-tauri-drag-region
// is unreliable inside the CSS-scaled stage, so start the drag imperatively.
function startWindowDrag(e: { target: EventTarget | null; button: number }) {
  const el = e.target as HTMLElement | null;
  if (e.button !== 0) return;
  if (el?.closest("button, .g-notif-drop, .profile-dropdown")) return;
  try { void getCurrentWindow().startDragging(); } catch { /* browser preview */ }
}

function IconBell({ size = 17 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </svg>
  );
}
function IconUpdate({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 1 1-2.6-6.4" /><path d="M21 4v5h-5" />
    </svg>
  );
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
  const ntw = 324, nth = 58;   // top-right notch — wraps the topbar (brand+ver+update+bell+profile)
  const nlw = 72, nlt = 286;   // bottom-left notch (sidebar + power); top area extended down for the rail
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
function deg(v: number): string {
  return v < 0 ? "" : `${Math.round(v)}°`;
}

// G-Maiden brand mark (Crystal-Maiden ice motif) — designed via codex, inlined
// so it can be tinted/scaled in the P1 tile. viewBox-only so it scales to fit.
function LogoMark() {
  return (
    <svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="gmark-ice" x1="24" y1="6" x2="24" y2="42" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#BEEBFF" />
          <stop offset="1" stopColor="#5DBCF6" />
        </linearGradient>
      </defs>
      <path d="M24 6L27.2 12.8L34 14.2L29 19.1L29.9 26L24 22.9L18.1 26L19 19.1L14 14.2L20.8 12.8L24 6Z" fill="url(#gmark-ice)" />
      <path d="M24 9C15.7 9 9 15.7 9 24C9 32.3 15.7 39 24 39C30.1 39 35.4 35.4 37.8 30H30.8L27.8 33H22.2L19 29.8V18.2L22.2 15H34L31 18H23V30H31L34 27H26V22H40V24C40 32.8 32.8 40 24 40C15.2 40 8 32.8 8 24C8 15.2 15.2 8 24 8C30.6 8 36.2 12 38.6 17.7H35.5C33.3 13.6 29 11 24 11V9Z" fill="url(#gmark-ice)" />
      <path d="M35 16L38.5 12.5L40 14L36.5 17.5L35 16Z" fill="#A3E635" />
    </svg>
  );
}

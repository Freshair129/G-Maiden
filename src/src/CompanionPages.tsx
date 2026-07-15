import { memo, useState, type ReactNode } from "react";
import { formatKda, formatTimer, toneClass, useCompanionData } from "./companion";

export const LiveMatchPage = memo(function LiveMatchPage() {
  const { data } = useCompanionData();
  // CR-011 §E/Q: no source exposes objective timing (GSI is local-player-only,
  // OpenDota has no live objective feed) — honest "—" placeholders, not the
  // old hardcoded Roshan/T2/Smoke demo strings, until this is really wired.
  const objectives = [
    { label: "Roshan", value: "—" },
    { label: "Top T2", value: "—" },
    { label: "Smoke Risk", value: "—" }
  ];

  return (
    <div className="domain-page">
      <section className="card-shell page-hero">
        <div>
          <div className="eyebrow">Live Match</div>
          <h2>Tactical command surface</h2>
          <p>Read the current battlefield with score states, objective timing, and synchronized activity/event feeds.</p>
        </div>
        <div className="page-pill-row">
          <span className="metric-chip live">LIVE • {data.match.clock}</span>
          <span className="metric-chip">{data.match.activeAlerts} active alerts</span>
        </div>
      </section>

      <div className="domain-grid two-up">
        <section className="card-shell domain-card">
          <div className="panel-head compact">
            <div>
              <div className="eyebrow">Objective board</div>
              <h3>Current macro priorities</h3>
            </div>
          </div>
          <div className="stats-grid compact">
            {objectives.map((item) => (
              <div key={item.label} className="stat-box">
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
          <div className="feed-head">Enemy visibility</div>
          <div className="scoreboard-list">
            {data.heroes.filter((hero) => hero.team === "enemy").map((hero) => (
              <div key={hero.id} className={`score-row ${hero.state}`}>
                <div className={`hero-portrait ${hero.team} ${hero.state}`}>{hero.hero.slice(0, 2)}</div>
                <div className="hero-copy">
                  <div className="hero-line">
                    <strong>{hero.hero}</strong>
                    <span>{hero.lane}</span>
                  </div>
                  <div className="hero-meta">
                    <span>{hero.player}</span>
                    <span>{formatKda(hero, "/")}</span>
                  </div>
                </div>
                <div className={`hero-state ${hero.state}`}>
                  {hero.state}
                  {hero.state !== "visible" ? <strong>{formatTimer(hero.timer)}</strong> : null}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="card-shell domain-card">
          <div className="panel-head compact">
            <div>
              <div className="eyebrow">Synchronized logs</div>
              <h3>Activity + event feed</h3>
            </div>
          </div>
          <div className="split-logs">
            <div className="log-box">
              <div className="feed-head">Activity</div>
              <div className="log-list">
                {data.activity.map((item) => (
                  <div key={item.id} className={`log-row ${toneClass(item.tone)}`}>
                    <span className="log-time">{item.at}</span>
                    <span className="log-text">{item.text}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="log-box">
              <div className="feed-head">Events</div>
              <div className="log-list">
                {data.events.map((item) => (
                  <div key={item.id} className={`log-row ${toneClass(item.tone)}`}>
                    <span className="log-time">{item.at}</span>
                    <span className="log-text">{item.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
});

// CR011-P5-01: CompanionPage dissolved (CR-011 §C) — its hotkey grid is
// superseded by the Ctrl+/ shortcut sheet (shortcuts.ts/ShortcutSheet in
// CommandDeck.tsx) and its overlay/voice toggle cards duplicated the legacy
// Control panel already embedded in SettingsPage below. Grepped for
// `CompanionPage` before deleting: the only importer was CommandDeck.tsx
// (now removed), so no other surface depended on this export.

export const BuildAdvisorPage = memo(function BuildAdvisorPage() {
  const { data } = useCompanionData();
  return (
    <div className="domain-page">
      <section className="card-shell page-hero">
        <div>
          <div className="eyebrow">Build Advisor</div>
          <h2>{data.buildAdvisor.hero} recommendation path</h2>
          <p>{data.buildAdvisor.lane} • next major item: {data.buildAdvisor.nextItem}</p>
        </div>
      </section>
      <div className="domain-grid two-up">
        <Card title="Current item path" kicker="Build">
          <div className="chip-cloud">
            {data.buildAdvisor.itemPath.map((item) => <span key={item} className="metric-chip">{item}</span>)}
          </div>
        </Card>
        <Card title="Advisor notes" kicker="Guidance">
          <ul className="simple-list">
            {data.buildAdvisor.notes.map((note) => <li key={note}>{note}</li>)}
          </ul>
        </Card>
      </div>
    </div>
  );
});

export const InsightsPage = memo(function InsightsPage() {
  const { data } = useCompanionData();
  return (
    <div className="domain-page">
      <section className="card-shell page-hero">
        <div>
          <div className="eyebrow">Match Insights</div>
          <h2>Posture, tempo, and learned patterns</h2>
          <p>High-level performance metrics that can later map to real match history and error patterns.</p>
        </div>
      </section>
      <div className="stats-grid large">
        <StatCard label="Power Score" value={statValue(data.insights.powerScore)} />
        <StatCard label="Win Rate" value={statValue(data.insights.winRate, "%")} />
        <StatCard label="Objective Control" value={statValue(data.insights.objectiveControl, "%")} />
        <StatCard label="Ward Efficiency" value={statValue(data.insights.wardEfficiency, "%")} />
      </div>

      <section className="card-shell domain-card">
        <div className="panel-head compact">
          <div>
            <div className="eyebrow">Weekly report</div>
            <h3>Win rate and hero pool</h3>
          </div>
        </div>
        <div className="stats-grid compact">
          <div className="stat-box"><span>Win rate</span><strong>{statValue(data.weeklyReport.winRate, "%")}</strong></div>
          <div className="stat-box"><span>KD</span><strong>{statValue(data.weeklyReport.kd)}</strong></div>
        </div>
        <div className="history-list">
          {data.weeklyReport.topHeroes.length ? data.weeklyReport.topHeroes.map((hero) => (
            <div key={`${hero.rank}-${hero.hero}`} className="history-row">
              <div><strong>{hero.hero}</strong><span>Top {hero.rank}</span></div>
              <div>{hero.kd}</div>
              <p>{hero.games} games · {hero.winRate}% WR</p>
            </div>
          )) : <p className="empty">ลิงก์ Steam ในหน้า Account เพื่อดึงสถิติจาก OpenDota</p>}
        </div>
      </section>
    </div>
  );
});

export const HistoryPage = memo(function HistoryPage() {
  const { data } = useCompanionData();
  return (
    <div className="domain-page">
      <section className="card-shell page-hero">
        <div>
          <div className="eyebrow">History</div>
          <h2>Recent companion sessions</h2>
          <p>Quick readback of the latest matches with result, hero, and learned note.</p>
        </div>
      </section>
      <section className="card-shell domain-card">
        <div className="history-list">
          {data.history.length ? data.history.map((row) => (
            <div key={row.id} className="history-row">
              <div>
                <strong>{row.result}</strong>
                <span>{row.hero}</span>
              </div>
              <div>{row.kda}</div>
              <p>{row.note}</p>
            </div>
          )) : <p className="empty">ยังไม่มีประวัติแมตช์ — เล่นจบ 1 เกม (G-Log จะบันทึกไว้ในเครื่อง)</p>}
        </div>
      </section>
    </div>
  );
});

const WINDOW_PRESETS: { label: string; w: number; h: number }[] = [
  { label: "1200 × 780", w: 1200, h: 780 },
  { label: "1280 × 800", w: 1280, h: 800 },
  { label: "1440 × 900", w: 1440, h: 900 },
  { label: "1600 × 1000", w: 1600, h: 1000 },
  { label: "1920 × 1080", w: 1920, h: 1080 },
];

export const SettingsPage = memo(function SettingsPage() {
  const { data } = useCompanionData();
  const [activeSize, setActiveSize] = useState("1200 × 780");

  const applySize = async (preset: typeof WINDOW_PRESETS[number]) => {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const { LogicalSize } = await import("@tauri-apps/api/dpi");
      await getCurrentWindow().setSize(new LogicalSize(preset.w, preset.h));
      setActiveSize(preset.label);
    } catch { /* noop */ }
  };

  return (
    <div className="domain-page">
      <section className="card-shell page-hero">
        <div>
          <div className="eyebrow">Settings</div>
          <h2>System, privacy, and device controls</h2>
          <p>Release-facing defaults for local-first play, overlay mirroring, and dashboard delivery.</p>
        </div>
      </section>
      <div className="domain-grid three-up">
        <Card title="Privacy" kicker="Policy">
          <div className="toggle-row"><span>Mode</span><strong>{data.match.privacy}</strong></div>
          <div className="toggle-row"><span>Data path</span><strong>On-device only</strong></div>
        </Card>
        <Card title="System" kicker="Health">
          <div className="toggle-row"><span>GSI score</span><strong>{data.match.gsiScore}/100</strong></div>
          <div className="toggle-row"><span>Latency</span><strong>{data.match.latencyMs}ms</strong></div>
        </Card>
        <Card title="Window" kicker="Display">
          <div className="window-presets">
            {WINDOW_PRESETS.map((p) => (
              <button key={p.label} className={`preset-btn${activeSize === p.label ? " active" : ""}`} onClick={() => applySize(p)}>
                {p.label}
              </button>
            ))}
          </div>
          <div className="toggle-row"><span>Overlay state</span><strong>{data.match.overlayMode}</strong></div>
        </Card>
      </div>
    </div>
  );
});

function Card({ title, kicker, children }: { title: string; kicker: string; children: ReactNode }) {
  return (
    <section className="card-shell domain-card">
      <div className="panel-head compact">
        <div>
          <div className="eyebrow">{kicker}</div>
          <h3>{title}</h3>
        </div>
      </div>
      {children}
    </section>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="card-shell stat-large">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

// A negative insight value is the NO_SENSOR sentinel (buildInsights) — the metric
// has no backend source yet, so render "—" instead of a fabricated number.
function statValue(v: number, suffix = ""): string {
  return v < 0 ? "—" : `${v.toLocaleString()}${suffix}`;
}

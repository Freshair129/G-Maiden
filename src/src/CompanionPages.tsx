import type { ReactNode } from "react";
import { formatTimer, toneClass, useCompanionData } from "./companion";

export function LiveMatchPage() {
  const { data } = useCompanionData();
  const objectives = [
    { label: "Roshan", value: "Likely contest in 00:38" },
    { label: "Top T2", value: "Pressure window open" },
    { label: "Smoke Risk", value: "High near river" }
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
                    <span>{hero.kills}/{hero.deaths}/{hero.assists}</span>
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
}

export function CompanionPage() {
  const { data } = useCompanionData();
  return (
    <div className="domain-page">
      <section className="card-shell page-hero">
        <div>
          <div className="eyebrow">Companion</div>
          <h2>Behavior and presence tuning</h2>
          <p>Adjust how G-Maiden speaks, moves, warns, and mirrors overlay data onto the second-screen dashboard.</p>
        </div>
      </section>

      <div className="domain-grid three-up">
        <Card title="Overlay mode" kicker="Delivery">
          <div className="toggle-row"><span>Overlay</span><strong>{data.companion.overlayEnabled ? "Enabled" : "Disabled"}</strong></div>
          <div className="toggle-row"><span>Dashboard mirror</span><strong>Always on</strong></div>
          <p className="domain-copy">Even with overlay disabled, the dashboard still shows every G-Signal and warning rail.</p>
        </Card>
        <Card title="Voice pack" kicker="Audio">
          <div className="toggle-row"><span>Current pack</span><strong>{data.match.voicePack}</strong></div>
          <div className="toggle-row"><span>Voice state</span><strong>{data.companion.voiceEnabled ? "Listening" : "Muted"}</strong></div>
          <p className="domain-copy">Voice delivery stays calm by default and escalates only for danger-tier alerts.</p>
        </Card>
        <Card title="Alert behavior" kicker="Signal policy">
          <div className="toggle-row"><span>Danger threshold</span><strong>{data.companion.dangerThreshold}%</strong></div>
          <div className="toggle-row"><span>Motion intensity</span><strong>{data.companion.motionIntensity}%</strong></div>
          <p className="domain-copy">Use these as companion presets before wiring per-hero or per-role personalities.</p>
        </Card>
      </div>

      <section className="card-shell domain-card">
        <div className="panel-head compact">
          <div>
            <div className="eyebrow">Hotkeys</div>
            <h3>Quick triggers</h3>
          </div>
        </div>
        <div className="stats-grid compact">
          {data.companion.hotkeys.map((key) => (
            <div key={key.label} className="stat-box">
              <span>{key.label}</span>
              <strong>{key.combo}</strong>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export function BuildAdvisorPage() {
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
}

export function InsightsPage() {
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
          <div className="stat-box"><span>Win rate</span><strong>{data.weeklyReport.winRate}%</strong></div>
          <div className="stat-box"><span>KD</span><strong>{data.weeklyReport.kd}</strong></div>
        </div>
        <div className="history-list">
          {data.weeklyReport.topHeroes.map((hero) => (
            <div key={`${hero.rank}-${hero.hero}`} className="history-row">
              <div><strong>{hero.hero}</strong><span>Top {hero.rank}</span></div>
              <div>{hero.kd}</div>
              <p>{hero.games} games · {hero.winRate}% WR</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export function HistoryPage() {
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
          {data.history.map((row) => (
            <div key={row.id} className="history-row">
              <div>
                <strong>{row.result}</strong>
                <span>{row.hero}</span>
              </div>
              <div>{row.kda}</div>
              <p>{row.note}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export function SettingsPage() {
  const { data } = useCompanionData();
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
        <Card title="Display" kicker="Delivery">
          <div className="toggle-row"><span>Second-screen</span><strong>Primary mode</strong></div>
          <div className="toggle-row"><span>Overlay state</span><strong>{data.match.overlayMode}</strong></div>
        </Card>
      </div>
    </div>
  );
}

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

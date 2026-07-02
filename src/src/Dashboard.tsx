import { formatTimer, toneClass, useCompanionData } from "./companion";
import agentBackground from "./assets/agent-layers/maiden-agent-bg-generated.png";
import agentCharacter from "./assets/agent-layers/maiden-agent-character.png";
import agentHairGlow from "./assets/agent-layers/maiden-agent-hair-glow.png";

export default function Dashboard() {
  const { data } = useCompanionData();
  const isPregame = data.match.minimapState === "empty";
  const allyHeroes = data.heroes.filter((hero) => hero.team === "ally");
  const enemyHeroes = data.heroes.filter((hero) => hero.team === "enemy");
  const visibleMarkers = isPregame ? [] : data.markers;
  const visibleEnemyIds = new Set(
    visibleMarkers
      .filter((marker) => marker.kind === "enemy" && marker.heroId)
      .map((marker) => marker.heroId as string)
  );
  const hiddenMissingEnemies = enemyHeroes.filter((hero) => hero.state === "missing" && !visibleEnemyIds.has(hero.id));
  const missingRotation = hiddenMissingEnemies.length ? Math.floor(data.updatedAt / 2000) % hiddenMissingEnemies.length : 0;
  const missingCycle = hiddenMissingEnemies.length
    ? Array.from({ length: Math.min(3, hiddenMissingEnemies.length) }, (_, index) => hiddenMissingEnemies[(missingRotation + index) % hiddenMissingEnemies.length])
    : [];
  const gankRisk = isPregame ? 10 : Math.min(100, 26 + hiddenMissingEnemies.length * 24 + data.match.activeAlerts * 8);
  const safePush = isPregame ? 18 : Math.max(0, 88 - hiddenMissingEnemies.length * 18 - data.match.activeAlerts * 10);

  return (
    <div className="dashboard-v2">
      <div className="board-bento">
        <section className="bento-card minimap-bento tilt-card">
          <div className="bento-head">
            <div>
              <div className="eyebrow">GSI panel</div>
              <h3 className="gsi-panel-title">
                <span className={`gsi-status-dot ${data.match.gsiOnline ? "online" : "offline"}`} />
                GSI {data.match.gsiOnline ? "Online" : "Offline"}
              </h3>
            </div>
            {!isPregame ? <span className="state-pill live">Live</span> : null}
          </div>

          <div className={`minimap-spectator ${isPregame ? "is-pregame" : "is-live"}`}>
            <div className="minimap-user-strip">
              <MiniStat label="Net" value={data.match.playerStats.net} />
              <MiniStat label="Ward" value={data.match.playerStats.ward} />
              <MiniStat label="GPM" value={String(data.match.playerStats.gpm)} />
              <MiniStat label="XPM" value={String(data.match.playerStats.xpm)} />
            </div>
            <div className={`minimap-scoreline ${isPregame ? "is-pregame" : ""}`}>
              <div className="score-team score-team-left">
                <span>{data.match.leftTeamName}</span>
                <strong>{data.match.leftScore}</strong>
              </div>
              <div className="score-center">
                <span>{data.match.centerLabel}</span>
                {!isPregame ? <strong>{data.match.centerSubLabel}</strong> : null}
              </div>
              <div className="score-team score-team-right">
                <strong>{data.match.rightScore}</strong>
                <span>{data.match.rightTeamName}</span>
              </div>
            </div>

            <div className="spectator-stage live-match-stage">
              <div className="team-column team-column-left slot-rail">
                {[0, 1, 2, 3, 4].map((idx) => (
                  <LiveSlotRow key={`ally-${idx}`} slotId={idx + 1} hero={allyHeroes[idx]} placeholder={isPregame} side="ally" />
                ))}
              </div>
              <div className="minimap-frame live-map-stack">
                <div className={`map-canvas spectator-map ${isPregame ? "empty" : ""}`}>
                  <div className="map-grid" />
                  <div className="river-line" />
                  <div className="map-terrain map-terrain-radiant" />
                  <div className="map-terrain map-terrain-dire" />
                  <div className="map-terrain map-terrain-mid" />
                  {visibleMarkers.map((marker) => (
                    <div
                      key={marker.id}
                      className={`map-marker ${marker.kind} ${marker.state || ""}`}
                      style={{ left: `${marker.x}%`, top: `${marker.y}%` }}
                      title={marker.heroId || marker.label || marker.kind}
                    >
                      {marker.label || marker.heroId?.slice(0, 1) || marker.kind.slice(0, 1).toUpperCase()}
                    </div>
                  ))}
                </div>
              </div>
              <div className="team-column team-column-right slot-rail">
                {[0, 1, 2, 3, 4].map((idx) => (
                  <LiveSlotRow key={`enemy-${idx}`} slotId={idx + 6} hero={enemyHeroes[idx]} placeholder={isPregame} side="enemy" />
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="bento-card agent-bento tilt-card">
          <div className="bento-head">
            <div>
              <div className="eyebrow">Agent sector</div>
              <h3>{data.agentSector.name}</h3>
            </div>
            <span className="state-pill">{data.agentSector.status}</span>
          </div>
          <div className="agent-sector">
            <div className="agent-layer-stack">
              <div className="agent-bg-layer" />
              <img className="agent-bg-art" src={agentBackground} alt="" />
              <div className="agent-back-layer" />
              <div className="agent-wave agent-wave-a" />
              <div className="agent-wave agent-wave-b" />
              <img className="agent-art" src={agentCharacter} alt="" />
              <img className="agent-hair-layer hair-layer-a" src={agentHairGlow} alt="" />
              <img className="agent-hair-layer hair-layer-b" src={agentHairGlow} alt="" />
              <div className="agent-front-fragments">
                <span />
                <span />
                <span />
              </div>
            </div>
            <div className="agent-copy">
              <strong>{data.agentSector.title}</strong>
              {data.agentSector.summary.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          </div>
        </section>

        <section className="bento-card gsignal-bento tilt-card">
          <div className="bento-head compact">
            <div>
              <div className="eyebrow">G-Signal</div>
              <h3>Threat pulse</h3>
            </div>
          </div>
          <div className="gsignal-layout">
            <div className="missing-rail">
              <div className="signal-section-head">
                <span>Enemy Missing</span>
                <strong>{hiddenMissingEnemies.length}</strong>
              </div>
              <div className="missing-rail-list">
                {missingCycle.length ? (
                  missingCycle.map((hero) => (
                    <div key={hero.id} className="missing-hero-card">
                      <div className={`missing-hero-icon ${hero.team}`}>{hero.hero.slice(0, 2)}</div>
                      <div className="missing-hero-copy">
                        <strong>{hero.hero}</strong>
                        <span>{hero.player}</span>
                      </div>
                      <div className="missing-hero-timer">{formatTimer(hero.timer)}</div>
                    </div>
                  ))
                ) : (
                  <div className="missing-rail-empty">No hidden enemy right now</div>
                )}
              </div>
            </div>
            <div className="signal-bar-stack">
              <SignalBar label="Gank Risk" value={gankRisk} tone="danger" />
              <SignalBar label="Safe Push" value={safePush} tone="good" />
            </div>
            <div className="signal-list signal-list-compact">
              {data.signals
                .filter((signal) => signal.label !== "Enemy Missing" && signal.label !== "Gank Risk" && signal.label !== "Safe Push")
                .map((signal) => (
                  <div key={signal.label} className={`signal-chip ${signal.tone}`}>
                    <span>{signal.label}</span>
                    <strong>{signal.value}</strong>
                  </div>
                ))}
            </div>
          </div>
        </section>

        <section className="bento-card status-bento tilt-card">
          <div className="bento-head compact">
            <div>
              <div className="eyebrow">Status</div>
              <h3>Companion state</h3>
            </div>
          </div>
          <div className="status-matrix">
            <StatusCard label="Voice" value={data.match.voicePack} text="Current pack" />
            <StatusCard label="Overlay" value={data.match.overlayMode} text="Mirror mode" />
            <StatusCard label="Server" value={data.match.server} text={`${data.match.latencyMs}ms`} />
            <StatusCard label="Perf" value={data.match.performance} text={data.match.systemStatus} />
          </div>
        </section>

        <section className="bento-card warning-bento tilt-card">
          <div className="bento-head compact">
            <div>
              <div className="eyebrow">Alert deck</div>
              <h3>Threat tabs</h3>
            </div>
          </div>
          <div className="warning-tabs warning-tabs-dense">
            {data.warningTabs.map((tab) => (
              <div key={tab.key} className={`warning-tab ${warningClass(tab.key)}`}>
                <span>{tab.label}</span>
                <strong>{tab.count}</strong>
                <small>{tab.text}</small>
              </div>
            ))}
          </div>
        </section>

        <section className="bento-card activity-bento tilt-card">
          <div className="bento-head compact">
            <div>
              <div className="eyebrow">Activity log</div>
              <h3>Map movement</h3>
            </div>
          </div>
          <div className="log-list">
            {data.activity.map((item) => (
              <div key={item.id} className={`log-row ${toneClass(item.tone)}`}>
                <span className="log-time">{item.at}</span>
                <span className="log-text">{item.text}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="bento-card event-bento tilt-card">
          <div className="bento-head compact">
            <div>
              <div className="eyebrow">Event log</div>
              <h3>Major outcomes</h3>
            </div>
          </div>
          <div className="log-list">
            {data.events.map((item) => (
              <div key={item.id} className={`log-row ${toneClass(item.tone)}`}>
                <span className="log-time">{item.at}</span>
                <span className="log-text">{item.text}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="bento-card weekly-bento tilt-card">
          <div className="bento-head compact">
            <div>
              <div className="eyebrow">Weekly report</div>
              <h3>Win rate and hero pool</h3>
            </div>
          </div>
          <div className="weekly-summary">
            <div className="weekly-hero-metrics">
              <div className="weekly-metric">
                <span>Win rate</span>
                <strong>{data.weeklyReport.winRate}%</strong>
              </div>
              <div className="weekly-metric">
                <span>KD</span>
                <strong>{data.weeklyReport.kd}</strong>
              </div>
            </div>
            <div className="weekly-hero-list">
              {data.weeklyReport.topHeroes.map((hero) => (
                <div key={`${hero.rank}-${hero.hero}`} className="weekly-hero-row">
                  <div className="weekly-rank">Top {hero.rank}</div>
                  <div className="weekly-hero-copy">
                    <strong>{hero.hero}</strong>
                    <span>{hero.games} games · {hero.winRate}% WR</span>
                  </div>
                  <div className="weekly-hero-kd">{hero.kd}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function SignalBar({ label, value, tone }: { label: string; value: number; tone: "danger" | "good" | "warn" | "info" }) {
  return (
    <div className={`signal-bar-card ${tone}`}>
      <div className="signal-bar-head">
        <span>{label}</span>
        <strong>{value}%</strong>
      </div>
      <div className="signal-bar-track">
        <div className="signal-bar-fill" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function StatusCard({ label, value, text }: { label: string; value: string; text: string }) {
  return (
    <div className="status-card">
      <span className="status-kicker">{label}</span>
      <strong>{value}</strong>
      <span>{text}</span>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="minimap-mini-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function LiveSlotRow({ slotId, hero, placeholder, side }: { slotId: number; hero?: { id: string; hero: string; player: string; level: number; kills: number; deaths: number; assists: number; state: string; team: string; timer: number; lane: string; items: string[]; pingMs: number; connection: "online" | "lagging" | "offline" }; placeholder: boolean; side: "ally" | "enemy" }) {
  const empty = placeholder || !hero;
  const items = empty ? Array(6).fill("") : [...hero.items, "", "", "", "", "", ""].slice(0, 6);
  return (
    <div className={`live-slot-row ${side} ${hero?.state || "waiting"} ${empty ? "is-empty" : ""}`}>
      <div className={`slot-avatar ${side} ${hero?.state || "waiting"}`}>{empty ? "--" : hero.hero.slice(0, 2)}</div>
      <div className="slot-copy">
        <div className="slot-title">
          <strong>{empty ? `Slot ID ${slotId}` : hero.player}</strong>
          <span className="slot-rank-icon">{empty ? "R-" : `Lv ${hero.level}`}</span>
        </div>
          <span className="slot-hero-name">{empty ? "" : hero.hero}</span>
        <div className="slot-items">
          {items.map((item, idx) => (
            <span key={`${slotId}-${idx}`} className={`slot-item ${item ? "filled" : ""}`}>{item}</span>
          ))}
        </div>
        <div className="slot-footer">
          <span className="slot-kda">{empty ? "0 / 0 / 0" : `${hero.kills} / ${hero.deaths} / ${hero.assists}`}</span>
          <div className={`slot-connection ${hero?.connection || "offline"}`}>
            <span />
            {empty ? "-- ms" : `${hero.pingMs} ms`}
          </div>
        </div>
      </div>
      <div className="slot-state">
        {empty ? "" : hero.state}
        {!empty && hero.state !== "visible" ? <strong>{formatTimer(hero.timer)}</strong> : null}
      </div>
    </div>
  );
}

function warningClass(key: string) {
  if (key === "danger") return "danger";
  if (key === "objectives") return "warn";
  if (key === "vision") return "info";
  return "good";
}

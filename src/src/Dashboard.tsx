import { useState } from "react";
import { formatTimer, toneClass, useCompanionData } from "./companion";
import type { CompanionData } from "./companion";

type Hero = CompanionData["heroes"][number];
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
          <div className="bento-head deck-head">
            <div className={`live-badge ${data.match.gsiOnline ? "online" : "offline"}`}>
              <span className="live-dot" />
              {data.match.gsiOnline ? "GSI Online" : "GSI Offline"}
            </div>
            <div className="deck-clock-cluster">
              <div className="deck-clock-team">
                <span>{data.match.leftTeamName}</span>
                <strong>{data.match.leftScore}</strong>
              </div>
              <div className="deck-clock-core">
                <strong>{data.match.clock}</strong>
                <span>{data.match.mode || data.match.centerLabel}</span>
              </div>
              <div className="deck-clock-team">
                <strong>{data.match.rightScore}</strong>
                <span>{data.match.rightTeamName}</span>
              </div>
            </div>
            <div className="deck-viewers-chip">
              <span className="deck-eye" />
              {data.match.viewers}
            </div>
          </div>

          <div className={`minimap-spectator ${isPregame ? "is-pregame" : "is-live"}`}>
            <div className="deck-statbar">
              <TrendChip label="NW" value={data.match.player.nw} avg={data.match.player.nwAvg} format={fmtK} />
              <TrendChip label="GPM" value={data.match.player.gpm} avg={data.match.player.gpmAvg} />
              <TrendChip label="XPM" value={data.match.player.xpm} avg={data.match.player.xpmAvg} />
              <div className="deck-stat-chip deck-stat-group">
                <span className="deck-stat-glabel">K / D / A</span>
                <div className="deck-stat-gvals">
                  <TrendVal label="K" value={data.match.player.k} avg={data.match.player.kAvg} />
                  <TrendVal label="D" value={data.match.player.d} avg={data.match.player.dAvg} higherIsBetter={false} />
                  <TrendVal label="A" value={data.match.player.a} avg={data.match.player.aAvg} />
                </div>
              </div>
              <div className="deck-stat-chip deck-stat-group">
                <span className="deck-stat-glabel">CS / DN</span>
                <div className="deck-stat-gvals">
                  <TrendVal label="CS" value={data.match.player.cs} avg={data.match.player.csAvg} />
                  <TrendVal label="DN" value={data.match.player.denies} avg={data.match.player.deniesAvg} />
                </div>
              </div>
              <div className={`deck-stat-chip deck-ping ${pingClass(data.match.player.ping)}`}>
                <span className="deck-stat-glabel">PING</span>
                <strong>{data.match.player.ping} ms</strong>
              </div>
            </div>

            <div className="spectator-stage live-match-stage">
              <div className="team-column team-column-left slot-rail">
                {[0, 1, 2, 3, 4].map((idx) => (
                  <HeroCard key={`ally-${idx}`} slotId={idx + 1} hero={allyHeroes[idx]} placeholder={isPregame} side="ally" />
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
                  <HeroCard key={`enemy-${idx}`} slotId={idx + 6} hero={enemyHeroes[idx]} placeholder={isPregame} side="enemy" />
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

function fmtK(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

function pingClass(ping: number) {
  if (ping < 40) return "good";
  if (ping < 80) return "warn";
  return "danger";
}

function trendInfo(value: number, avg: number, higherIsBetter: boolean) {
  const diff = value - avg;
  const good = higherIsBetter ? diff > 0 : diff < 0;
  const arrow = diff === 0 ? "–" : good ? "▲" : "▼";
  const cls = diff === 0 ? "trend-flat" : good ? "trend-up" : "trend-down";
  const label = diff > 0 ? `+${diff}` : String(diff);
  return { arrow, cls, label };
}

function TrendChip({ label, value, avg, format }: { label: string; value: number; avg: number; format?: (n: number) => string }) {
  const { arrow, cls, label: diff } = trendInfo(value, avg, true);
  const show = format ? format(value) : String(value);
  return (
    <div className="deck-stat-chip">
      <span className="deck-stat-glabel">{label}</span>
      <div className="deck-stat-line">
        <strong>{show}</strong>
        <span className={`trend ${cls}`}>{arrow}{diff}</span>
      </div>
    </div>
  );
}

function TrendVal({ label, value, avg, higherIsBetter = true }: { label: string; value: number; avg: number; higherIsBetter?: boolean }) {
  const { arrow, cls, label: diff } = trendInfo(value, avg, higherIsBetter);
  return (
    <div className="deck-trend-val">
      <span className="deck-trend-key">{label}</span>
      <strong>{value}</strong>
      <span className={`trend ${cls}`}>{arrow}{diff}</span>
    </div>
  );
}

function heroStatus(hero?: Hero): "dead" | "missing" | "low" | "ok" {
  if (!hero) return "ok";
  if (hero.state === "dead") return "dead";
  if (hero.state === "missing") return "missing";
  if (hero.state === "visible" && hero.hpPercent < 35) return "low";
  return "ok";
}

function HeroCard({ slotId, hero, placeholder, side }: { slotId: number; hero?: Hero; placeholder: boolean; side: "ally" | "enemy" }) {
  const [flipped, setFlipped] = useState(false);
  const empty = placeholder || !hero;
  if (empty) {
    return (
      <div className={`hero-card status-ok ${side} is-empty`}>
        <div className="hero-card-inner">
          <div className="hero-card-face hero-card-front">
            <div className="hc-row hc-top">
              <span className="hc-name">Slot ID {slotId}</span>
            </div>
            <div className="hc-row hc-mid">
              <span className="hc-lvl">Lv –</span>
              <span className="hc-heroname">Waiting</span>
              <span className="hc-kda">0 / 0 / 0</span>
            </div>
            <div className="hc-items">
              {Array(6).fill("").map((_, idx) => (
                <span key={idx} className="hc-item" />
              ))}
              <span className="hc-item hc-neutral" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  const status = heroStatus(hero);
  const showTimer = hero.state === "missing" || hero.state === "dead";
  const items = [...hero.items, "", "", "", "", "", ""].slice(0, 6);

  return (
    <div
      className={`hero-card status-${status} ${side} ${flipped ? "is-flipped" : ""}`}
      onClick={() => setFlipped((f) => !f)}
      title="Click to flip profile"
    >
      <div className="hero-card-inner">
        <div className="hero-card-face hero-card-front">
          {showTimer ? <span className="hc-timer">{formatTimer(hero.timer)}</span> : null}
          <div className="hc-row hc-top">
            <div className="hc-ident">
              <span className="hc-name">{hero.player}</span>
              <span className="hc-rank">{hero.rank}</span>
              <span className="hc-mmr">{fmtK(hero.mmr)}</span>
            </div>
            <div className="hc-badges">
              <span className={`hc-badge ${hero.buyback ? "on" : ""}`}>BB</span>
              <span className={`hc-badge ${hero.tp ? "on" : ""}`}>TP</span>
              <span className={`hc-badge ${hero.ultReady ? "on" : ""}`}>ULT</span>
            </div>
          </div>
          <div className="hc-row hc-mid">
            <span className="hc-lvl">Lv {hero.level}</span>
            <span className="hc-heroname">{hero.hero}</span>
            <span className="hc-kda">{hero.kills} / {hero.deaths} / {hero.assists}</span>
          </div>
          <div className="hc-items">
            {items.map((item, idx) => (
              <span key={idx} className={`hc-item ${item ? "filled" : ""}`}>{item}</span>
            ))}
            <span className={`hc-item hc-neutral ${hero.neutral ? "filled" : ""}`}>{hero.neutral}</span>
          </div>
        </div>
        <div className="hero-card-face hero-card-back">
          {hero.profile.public ? (
            <div className="hc-profile">
              <div className="hc-prow"><span>Rank</span><strong>{hero.rank} · {fmtK(hero.mmr)}</strong></div>
              <div className="hc-prow"><span>Season</span><strong>{hero.profile.winRate}% · {hero.profile.games}g</strong></div>
              <div className="hc-prow"><span>Avg KDA</span><strong>{hero.profile.kda.toFixed(1)}</strong></div>
              <div className="hc-prow"><span>Main</span><strong>{hero.profile.mainHero.name} · {hero.profile.mainHero.games}g · {hero.profile.mainHero.winRate}%</strong></div>
              <div className="hc-prow"><span>Behavior</span><strong>{hero.profile.behavior}</strong></div>
              <div className="hc-prow"><span>Role</span><strong>{hero.profile.role}</strong></div>
            </div>
          ) : (
            <div className="hc-private">
              <span className="hc-lock">🔒</span>
              <strong>Private profile</strong>
              <small>Stats hidden by player</small>
            </div>
          )}
        </div>
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

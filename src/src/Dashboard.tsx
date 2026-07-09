import { memo, useState } from "react";
import { formatTimer, useCompanionDataSelector } from "./companion";
import type { CompanionData } from "./companion";

type Hero = CompanionData["heroes"][number];

import agentBackground from "./assets/agent-layers/maiden-agent-bg-generated.png";
import agentCharacter from "./assets/agent-layers/maiden-agent-character.png";
import agentHairGlow from "./assets/agent-layers/maiden-agent-hair-glow.png";

function DashboardImpl() {
  return (
    <div className="dashboard-v2">
      <div className="board-bento">
        <section className="bento-card minimap-bento tilt-card">
          <DashboardHeader />
          <SpectatorStage />
        </section>
        <AgentSection />
        <StatusSection />
        <WarningSection />
        {/* Activity / Event logs live in the Insights + History tabs (CR-002).
           Dashboard is a fixed-grid, no-scroll layout â€” only the 5 bento cards above. */}
      </div>
    </div>
  );
}

const Dashboard = memo(DashboardImpl);
export default Dashboard;

function DashboardHeaderImpl() {
  const header = useCompanionDataSelector(
    (data) => ({
      gsiOnline: data.match.gsiOnline,
      leftTeamName: data.match.leftTeamName,
      leftScore: data.match.leftScore,
      clock: data.match.clock,
      mode: data.match.mode,
      centerLabel: data.match.centerLabel,
      rightScore: data.match.rightScore,
      rightTeamName: data.match.rightTeamName,
      viewers: data.match.viewers,
      nw: data.match.player.nw,
      nwAvg: data.match.player.nwAvg,
      gpm: data.match.player.gpm,
      gpmAvg: data.match.player.gpmAvg,
      xpm: data.match.player.xpm,
      xpmAvg: data.match.player.xpmAvg,
      k: data.match.player.k,
      kAvg: data.match.player.kAvg,
      d: data.match.player.d,
      dAvg: data.match.player.dAvg,
      a: data.match.player.a,
      aAvg: data.match.player.aAvg,
      cs: data.match.player.cs,
      csAvg: data.match.player.csAvg,
      denies: data.match.player.denies,
      deniesAvg: data.match.player.deniesAvg,
      ping: data.match.player.ping
    }),
    sameHeader
  );

  return (
    <>
      <div className="bento-head deck-head">
        <div className={`live-badge ${header.gsiOnline ? "online" : "offline"}`}>
          <span className="live-dot" />
          {header.gsiOnline ? "GSI Online" : "GSI Offline"}
        </div>
        <div className="deck-clock-cluster">
          <div className="deck-clock-team">
            <span>{header.leftTeamName}</span>
            <strong>{header.leftScore}</strong>
          </div>
          <div className="deck-clock-core">
            <strong>{header.clock}</strong>
            <span>{header.mode || header.centerLabel}</span>
          </div>
          <div className="deck-clock-team">
            <strong>{header.rightScore}</strong>
            <span>{header.rightTeamName}</span>
          </div>
        </div>
        <div className="deck-viewers-chip">
          <span className="deck-eye" />
          {header.viewers}
        </div>
      </div>

      <div className="minimap-spectator is-live">
        <div className="deck-statbar">
          <TrendChip label="NW" value={header.nw} avg={header.nwAvg} format={fmtK} />
          <TrendChip label="GPM" value={header.gpm} avg={header.gpmAvg} />
          <TrendChip label="XPM" value={header.xpm} avg={header.xpmAvg} />
          <div className="deck-stat-chip deck-stat-group">
            <span className="deck-stat-glabel">K / D / A</span>
            <div className="deck-stat-gvals">
              <TrendVal label="K" value={header.k} avg={header.kAvg} />
              <TrendVal label="D" value={header.d} avg={header.dAvg} higherIsBetter={false} />
              <TrendVal label="A" value={header.a} avg={header.aAvg} />
            </div>
          </div>
          <div className="deck-stat-chip deck-stat-group">
            <span className="deck-stat-glabel">CS / DN</span>
            <div className="deck-stat-gvals">
              <TrendVal label="CS" value={header.cs} avg={header.csAvg} />
              <TrendVal label="DN" value={header.denies} avg={header.deniesAvg} />
            </div>
          </div>
          <div className={`deck-stat-chip deck-ping ${pingClass(header.ping)}`}>
            <span className="deck-stat-glabel">PING</span>
            <strong>{header.ping} ms</strong>
          </div>
        </div>
      </div>
    </>
  );
}

const DashboardHeader = memo(DashboardHeaderImpl);

function SpectatorStageImpl() {
  const stage = useCompanionDataSelector(
    (data) => ({
      isPregame: data.match.minimapState === "empty",
      allyHeroes: data.heroes.filter((hero) => hero.team === "ally"),
      enemyHeroes: data.heroes.filter((hero) => hero.team === "enemy"),
      markers: data.match.minimapState === "empty" ? [] : data.markers
    }),
    sameStage
  );

  return (
    <div className={`spectator-stage live-match-stage ${stage.isPregame ? "is-pregame" : "is-live"}`}>
      <div className="team-column team-column-left slot-rail">
        {[0, 1, 2, 3, 4].map((idx) => (
          <HeroCard key={`ally-${idx}`} slotId={idx + 1} hero={stage.allyHeroes[idx]} placeholder={stage.isPregame} side="ally" />
        ))}
      </div>
      <div className="minimap-frame live-map-stack">
        <div className={`map-canvas spectator-map ${stage.isPregame ? "empty" : ""}`}>
          <div className="map-grid" />
          <div className="river-line" />
          <div className="map-terrain map-terrain-radiant" />
          <div className="map-terrain map-terrain-dire" />
          <div className="map-terrain map-terrain-mid" />
          {stage.markers.map((marker) => (
            <MapMarker key={marker.id} marker={marker} />
          ))}
        </div>
      </div>
      <div className="team-column team-column-right slot-rail">
        {[0, 1, 2, 3, 4].map((idx) => (
          <HeroCard key={`enemy-${idx}`} slotId={idx + 6} hero={stage.enemyHeroes[idx]} placeholder={stage.isPregame} side="enemy" />
        ))}
      </div>
    </div>
  );
}

const SpectatorStage = memo(SpectatorStageImpl);

function AgentSectionImpl() {
  const agent = useCompanionDataSelector(
    (data) => ({
      name: data.agentSector.name,
      title: data.agentSector.title,
      status: data.agentSector.status,
      summary: data.agentSector.summary
    }),
    sameAgent
  );

  return (
    <section className="bento-card agent-bento tilt-card">
      <div className="bento-head">
        <div>
          <div className="eyebrow">Agent sector</div>
          <h3>{agent.name}</h3>
        </div>
        <span className="state-pill">{agent.status}</span>
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
          <strong>{agent.title}</strong>
          {agent.summary.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      </div>
    </section>
  );
}

const AgentSection = memo(AgentSectionImpl);

function StatusSectionImpl() {
  const status = useCompanionDataSelector(
    (data) => ({
      voicePack: data.match.voicePack,
      overlayMode: data.match.overlayMode,
      server: data.match.server,
      latencyMs: data.match.latencyMs,
      performance: data.match.performance,
      systemStatus: data.match.systemStatus
    }),
    sameStatus
  );

  return (
    <section className="bento-card status-bento tilt-card">
      <div className="bento-head compact">
        <div>
          <div className="eyebrow">Status</div>
          <h3>Companion state</h3>
        </div>
      </div>
      <div className="status-matrix">
        <StatusCard label="Voice" value={status.voicePack} text="Current pack" />
        <StatusCard label="Overlay" value={status.overlayMode} text="Mirror mode" />
        <StatusCard label="Server" value={status.server} text={`${status.latencyMs}ms`} />
        <StatusCard label="Perf" value={status.performance} text={status.systemStatus} />
      </div>
    </section>
  );
}

const StatusSection = memo(StatusSectionImpl);

function WarningSectionImpl() {
  const warnings = useCompanionDataSelector(
    (data) => data.warningTabs,
    sameWarnings
  );

  return (
    <section className="bento-card warning-bento tilt-card">
      <div className="bento-head compact">
        <div>
          <div className="eyebrow">Alert deck</div>
          <h3>Threat tabs</h3>
        </div>
      </div>
      <div className="warning-tabs warning-tabs-dense">
        {warnings.map((tab) => (
          <div key={tab.key} className={`warning-tab ${warningClass(tab.key)}`}>
            <span>{tab.label}</span>
            <strong>{tab.count}</strong>
            <small>{tab.text}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

const WarningSection = memo(WarningSectionImpl);

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

const HeroCard = memo(function HeroCard({ slotId, hero, placeholder, side }: { slotId: number; hero?: Hero; placeholder: boolean; side: "ally" | "enemy" }) {
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
              <span className="hc-lvl">Lv â€“</span>
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
  const statusLabel = status === "low" ? "LOW" : status === "missing" ? "MISSING" : status === "dead" ? "DEAD" : "VISIBLE";
  const items = [...hero.items, "", "", "", "", "", ""].slice(0, 6);

  return (
    <div
      className={`hero-card status-${status} ${side} ${flipped ? "is-flipped" : ""}`}
      onClick={() => setFlipped((f) => !f)}
      title="Click to flip profile"
    >
      <div className="hero-card-inner">
        <div className="hero-card-face hero-card-front">
          <div className="hc-row hc-top">
            <div className="hc-ident">
              <span className="hc-name">{hero.player}</span>
              <span className="hc-rank">{hero.rank}</span>
              <span className="hc-mmr">{fmtK(hero.mmr)}</span>
            </div>
            <span className={`hc-status hc-status-${status}`}>
              <em>{statusLabel}</em>
              {showTimer ? <b>{formatTimer(hero.timer)}</b> : null}
            </span>
          </div>
          <div className="hc-row hc-mid">
            <span className="hc-lvl">Lv {hero.level}</span>
            <span className="hc-heroname">{hero.hero}</span>
            <span className="hc-kda">{hero.kills} / {hero.deaths} / {hero.assists}</span>
            <div className="hc-badges">
              <span className={`hc-badge ${hero.buyback ? "on" : ""}`}>BB</span>
              <span className={`hc-badge ${hero.tp ? "on" : ""}`}>TP</span>
              <span className={`hc-badge ${hero.ultReady ? "on" : ""}`}>ULT</span>
            </div>
          </div>
          <div className="hc-items">
            {items.map((item, idx) => (
              <span key={idx} className={`hc-item ${item ? "filled" : ""}`}>{item}</span>
            ))}
            <span className={`hc-item hc-neutral ${hero.neutral ? "filled" : ""}`}>{hero.neutral}</span>
          </div>
        </div>
        {flipped ? (
          <div className="hero-card-face hero-card-back">
            {hero.profile.public ? (
              <div className="hc-profile">
                <div className="hc-prow"><span>Rank</span><strong>{hero.rank} Â· {fmtK(hero.mmr)}</strong></div>
                <div className="hc-prow"><span>Season</span><strong>{hero.profile.winRate}% Â· {hero.profile.games}g</strong></div>
                <div className="hc-prow"><span>Avg KDA</span><strong>{hero.profile.kda.toFixed(1)}</strong></div>
                <div className="hc-prow"><span>Main</span><strong>{hero.profile.mainHero.name} Â· {hero.profile.mainHero.games}g Â· {hero.profile.mainHero.winRate}%</strong></div>
                <div className="hc-prow"><span>Hours</span><strong>{(hero.profile.hours ?? hero.profile.games * 12 + 600).toLocaleString()}h</strong></div>
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
        ) : null}
      </div>
    </div>
  );
}, sameHeroCard);

function MapMarkerImpl({ marker }: { marker: CompanionData["markers"][number] }) {
  return (
    <div
      className={`map-marker ${marker.kind} ${marker.state || ""}`}
      style={{ left: `${marker.x}%`, top: `${marker.y}%` }}
      title={marker.heroId || marker.label || marker.kind}
    >
      {marker.label || marker.heroId?.slice(0, 1) || marker.kind.slice(0, 1).toUpperCase()}
    </div>
  );
}

const MapMarker = memo(MapMarkerImpl, sameMarkerCard);

function sameHeader(
  a: {
    gsiOnline: boolean;
    leftTeamName: string;
    leftScore: number;
    clock: string;
    mode: string;
    centerLabel: string;
    rightScore: number;
    rightTeamName: string;
    viewers: number;
    nw: number;
    nwAvg: number;
    gpm: number;
    gpmAvg: number;
    xpm: number;
    xpmAvg: number;
    k: number;
    kAvg: number;
    d: number;
    dAvg: number;
    a: number;
    aAvg: number;
    cs: number;
    csAvg: number;
    denies: number;
    deniesAvg: number;
    ping: number;
  },
  b: typeof a
) {
  return a.gsiOnline === b.gsiOnline
    && a.leftTeamName === b.leftTeamName
    && a.leftScore === b.leftScore
    && a.clock === b.clock
    && a.mode === b.mode
    && a.centerLabel === b.centerLabel
    && a.rightScore === b.rightScore
    && a.rightTeamName === b.rightTeamName
    && a.viewers === b.viewers
    && a.nw === b.nw
    && a.nwAvg === b.nwAvg
    && a.gpm === b.gpm
    && a.gpmAvg === b.gpmAvg
    && a.xpm === b.xpm
    && a.xpmAvg === b.xpmAvg
    && a.k === b.k
    && a.kAvg === b.kAvg
    && a.d === b.d
    && a.dAvg === b.dAvg
    && a.a === b.a
    && a.aAvg === b.aAvg
    && a.cs === b.cs
    && a.csAvg === b.csAvg
    && a.denies === b.denies
    && a.deniesAvg === b.deniesAvg
    && a.ping === b.ping;
}

function sameStatus(a: { voicePack: string; overlayMode: string; server: string; latencyMs: number; performance: string; systemStatus: string }, b: typeof a) {
  return a.voicePack === b.voicePack
    && a.overlayMode === b.overlayMode
    && a.server === b.server
    && a.latencyMs === b.latencyMs
    && a.performance === b.performance
    && a.systemStatus === b.systemStatus;
}

function sameAgent(a: { name: string; title: string; status: string; summary: string[] }, b: typeof a) {
  return a.name === b.name
    && a.title === b.title
    && a.status === b.status
    && sameStringArray(a.summary, b.summary);
}

function sameWarnings(a: CompanionData["warningTabs"], b: CompanionData["warningTabs"]) {
  if (a.length !== b.length) return false;
  return a.every((tab, index) => {
    const other = b[index];
    return tab.key === other.key && tab.label === other.label && tab.count === other.count && tab.text === other.text;
  });
}

function sameStage(
  a: {
    isPregame: boolean;
    allyHeroes: CompanionData["heroes"];
    enemyHeroes: CompanionData["heroes"];
    markers: CompanionData["markers"];
  },
  b: typeof a
) {
  return a.isPregame === b.isPregame
    && sameHeroList(a.allyHeroes, b.allyHeroes)
    && sameHeroList(a.enemyHeroes, b.enemyHeroes)
    && sameMarkerList(a.markers, b.markers);
}

function sameHeroList(a: CompanionData["heroes"], b: CompanionData["heroes"]) {
  if (a.length !== b.length) return false;
  return a.every((hero, index) => sameHero(hero, b[index]));
}

function sameHero(a?: Hero, b?: Hero) {
  if (!a || !b) return a === b;
  return a.id === b.id
    && a.hero === b.hero
    && a.player === b.player
    && a.team === b.team
    && a.level === b.level
    && a.kills === b.kills
    && a.deaths === b.deaths
    && a.assists === b.assists
    && a.state === b.state
    && a.timer === b.timer
    && a.lane === b.lane
    && sameStringArray(a.items, b.items)
    && a.pingMs === b.pingMs
    && a.connection === b.connection
    && a.nw === b.nw
    && a.gpm === b.gpm
    && a.xpm === b.xpm
    && a.lastHits === b.lastHits
    && a.denies === b.denies
    && a.mmr === b.mmr
    && a.rank === b.rank
    && a.hpPercent === b.hpPercent
    && a.buyback === b.buyback
    && a.tp === b.tp
    && a.ultReady === b.ultReady
    && a.neutral === b.neutral
    && a.profile.public === b.profile.public
    && a.profile.winRate === b.profile.winRate
    && a.profile.games === b.profile.games
    && a.profile.kda === b.profile.kda
    && a.profile.mainHero.name === b.profile.mainHero.name
    && a.profile.mainHero.games === b.profile.mainHero.games
    && a.profile.mainHero.winRate === b.profile.mainHero.winRate
    && a.profile.behavior === b.profile.behavior
    && a.profile.role === b.profile.role
    && a.profile.hours === b.profile.hours;
}

function sameHeroCard(prev: { slotId: number; hero?: Hero; placeholder: boolean; side: "ally" | "enemy" }, next: typeof prev) {
  return prev.slotId === next.slotId
    && prev.placeholder === next.placeholder
    && prev.side === next.side
    && sameHero(prev.hero, next.hero);
}

function sameMarkerList(a: CompanionData["markers"], b: CompanionData["markers"]) {
  if (a.length !== b.length) return false;
  return a.every((marker, index) => sameMarker(marker, b[index]));
}

function sameMarker(a?: CompanionData["markers"][number], b?: CompanionData["markers"][number]) {
  if (!a || !b) return a === b;
  return a.id === b.id
    && a.heroId === b.heroId
    && a.x === b.x
    && a.y === b.y
    && a.kind === b.kind
    && a.label === b.label
    && a.state === b.state;
}

function sameMarkerCard(prev: { marker: CompanionData["markers"][number] }, next: typeof prev) {
  return sameMarker(prev.marker, next.marker);
}

function sameStringArray(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function warningClass(key: string) {
  if (key === "danger") return "danger";
  if (key === "objectives") return "warn";
  if (key === "vision") return "info";
  return "good";
}

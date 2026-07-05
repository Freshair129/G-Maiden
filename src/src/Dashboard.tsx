import { useState, useEffect, useRef } from "react";
import { formatTimer, useCompanionData } from "./companion";
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

  // G-Signal sector (D/E/F/G) — a proper bento grid cell (area `gsignal`),
  // not a floating FAB, so it aligns with the other sectors on the grid.
  const enemyMissing = isPregame ? 0 : enemyHeroes.filter((h) => h.state === "missing").length;
  const gankRisk = isPregame ? 0 : Math.min(100, 26 + enemyMissing * 24 + data.match.activeAlerts * 8);
  const safePush = isPregame ? 0 : Math.max(0, 88 - enemyMissing * 18 - data.match.activeAlerts * 10);
  const vision = data.signals.find((s) => s.label.toLowerCase().startsWith("vision"))?.value ?? "—";

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
            <AgentFeed lines={data.agentSector.summary} />
          </div>
        </section>

        <section className="bento-card gsignal-bento tilt-card">
          <div className="bento-head compact">
            <div>
              <div className="eyebrow">G-Signal</div>
              <h3>Threat radar</h3>
            </div>
          </div>
          <div className="gsignal-cells">
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

        {/* announcer event callout — overlays the top-center of the minimap cell */}
        <DeckEventBanner />

        {/* Activity / Event logs live in the Insights + History tabs (CR-002).
           Dashboard is a fixed-grid, no-scroll layout — only the 5 bento cards above. */}
      </div>
    </div>
  );
}

// Announcer event banner (First Blood / Double Kill / streak ladder …), shown as
// a transient Dota-style callout over the top of the minimap cell. Mirrors the
// overlay's STREAK_LABELS. No deck-side announcer event is wired yet, so this
// cycles a demo set; TODO: drive from the `announcer-banner` Tauri event
// (payload.bannerText) + game-tick kill rising-edge, like src/src/App.tsx.
const DECK_EVENTS: Array<{ label: string; tone: "blood" | "gold" | "fire" }> = [
  { label: "FIRST BLOOD", tone: "blood" },
  { label: "DOUBLE KILL", tone: "gold" },
  { label: "TRIPLE KILL", tone: "gold" },
  { label: "KILLING SPREE", tone: "fire" },
  { label: "RAMPAGE", tone: "blood" },
];

function DeckEventBanner() {
  const [idx, setIdx] = useState(-1);
  const [show, setShow] = useState(false);

  useEffect(() => {
    let alive = true;
    let t: number;
    let i = 0;
    const run = () => {
      if (!alive) return;
      setIdx(i % DECK_EVENTS.length);
      setShow(true);
      t = window.setTimeout(() => {
        if (!alive) return;
        setShow(false); // trigger exit animation
        i += 1;
        t = window.setTimeout(run, 1500);
      }, 2400);
    };
    t = window.setTimeout(run, 1400);
    return () => { alive = false; window.clearTimeout(t); };
  }, []);

  const evt = idx >= 0 ? DECK_EVENTS[idx] : null;
  if (!evt) return null;
  return (
    <div className={`deck-event-banner tone-${evt.tone}${show ? "" : " out"}`} aria-live="polite">
      <span className="deb-label">{evt.label}</span>
    </div>
  );
}

// Agent sector caster feed — Maiden "types" the newest line; completed lines
// slide up and fade (sliding window). No live AI-narration event exists yet, so
// this cycles the agent summary (or Maiden persona lines) as a demo. When a real
// stream lands (e.g. a `agent-message` / advice Tauri event), feed it in as
// `lines` / push onto `history` instead of the interval rotator below.
const MAIDEN_LINES = [
  "เฝ้ามินิแมพให้อยู่นะ เดี๋ยวมีคนหายจากสายตา",
  "ฟาร์มต่อได้ ตอนนี้ยังปลอดภัยอยู่",
  "ระวังโรมมิ่งจากเลนบน มืดไปหลายวิแล้ว",
  "เก็บ vision รอบ objective ก่อนจะเข้าน้า",
  "เอ๊ะ! เดี๋ยวก่อน… ถอยดีกว่า เขามากันสาม",
];

function AgentFeed({ lines }: { lines: string[] }) {
  const pool = lines.length ? lines : MAIDEN_LINES;
  const [history, setHistory] = useState<string[]>([]); // completed, newest last
  const [typed, setTyped] = useState("");
  const idx = useRef(0);

  useEffect(() => {
    let alive = true;
    let timer: number;
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    const commit = () => {
      if (!alive) return;
      const line = pool[idx.current % pool.length];
      setHistory((h) => [...h, line].slice(-1)); // keep 1 previous line above
      setTyped("");
      idx.current += 1;
      timer = window.setTimeout(typeNext, 520);
    };
    const typeNext = () => {
      if (!alive) return;
      const line = pool[idx.current % pool.length];
      if (reduce) { setTyped(line); timer = window.setTimeout(commit, 3600); return; }
      let n = 0;
      const step = () => {
        if (!alive) return;
        n += 1;
        setTyped(line.slice(0, n));
        timer = window.setTimeout(n < line.length ? step : commit, n < line.length ? 42 : 3200);
      };
      step();
    };
    typeNext();
    return () => { alive = false; window.clearTimeout(timer); };
  }, [pool]);

  return (
    <div className="agent-feed">
      <div className="agent-feed-tag"><span className="af-dot" />MAIDEN</div>
      <div className="agent-feed-log">
        {history.map((line, i) => (
          <p key={`h${i}-${line}`} className="af-line af-old">{line}</p>
        ))}
        {typed && <p className="af-line af-now">{typed}<span className="af-caret" /></p>}
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
        <div className="hero-card-face hero-card-back">
          {hero.profile.public ? (
            <div className="hc-profile">
              <div className="hc-prow"><span>Rank</span><strong>{hero.rank} · {fmtK(hero.mmr)}</strong></div>
              <div className="hc-prow"><span>Season</span><strong>{hero.profile.winRate}% · {hero.profile.games}g</strong></div>
              <div className="hc-prow"><span>Avg KDA</span><strong>{hero.profile.kda.toFixed(1)}</strong></div>
              <div className="hc-prow"><span>Main</span><strong>{hero.profile.mainHero.name} · {hero.profile.mainHero.games}g · {hero.profile.mainHero.winRate}%</strong></div>
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

import { useEffect, useRef, useState } from "react";
import { formatKda, toneClass, type CompanionData } from "../companion";
import type { MatchPhase } from "../live/phase";
import type { ContextMenuController, ContextMenuEntry } from "../ContextMenu";
import { heroPortraitUrl } from "../heroPortrait";
import { MinimapMirror, MomentumInline, OnAirConsole, ReadinessRundown } from "./onair";
import { DebriefTimeline } from "./Debrief";

export function GMaidenFungDashboard({
  data,
  voicePackName,
  signalEnabled,
  annEnabled,
  masterVolume,
  menu
}: {
  data: CompanionData;
  voicePackName: string | null;
  signalEnabled: boolean;
  annEnabled: boolean;
  masterVolume: number;
  menu: ContextMenuController;
}) {
  const allyHeroes = data.heroes.filter((hero) => hero.team === "ally");
  const enemyHeroes = data.heroes.filter((hero) => hero.team === "enemy");

  // CR-007 WP-4: real governor readings — NO_SENSOR (-1, see buildTelemetry.ts)
  // renders "—" instead of a fake 0.
  const cpuValue = data.telemetry.cpuLoad >= 0 ? `${data.telemetry.cpuLoad}%` : "—";
  const ramValue = data.telemetry.ramUsedGb >= 0 ? `${Math.round(data.telemetry.ramUsedGb * 1024)} MB` : "—";

  // CR-011 §E: the seat content follows the real phase axis, except a quiet
  // local override ("กลับไปดูสด" in the debrief timeline) can force the live
  // layout back on — it resets the instant the REAL phase actually changes
  // (a new prep/live/standby observation), never sticking across matches.
  const realPhase = data.match.matchPhase;
  const [forceLive, setForceLive] = useState(false);
  const prevPhaseRef = useRef(realPhase);
  useEffect(() => {
    if (prevPhaseRef.current !== realPhase) {
      prevPhaseRef.current = realPhase;
      setForceLive(false);
    }
  }, [realPhase]);
  const seatPhase: MatchPhase = forceLive ? "live" : realPhase;

  return (
    <div className="gm-fung-layout">
      <section className="gm-score-header" data-seat="score-header" tabIndex={-1}>
        <strong>{data.match.leftTeamName} {data.match.leftScore}</strong>
        <span className="gm-clock">{data.match.clock}</span>
        <strong>{data.match.rightScore} {data.match.rightTeamName}</strong>
        <MomentumInline momentum={data.momentum} />
      </section>

      <section className="gm-stats-bar" data-seat="stats" tabIndex={-1}>
        <MiniStat label="NW" value={String(data.match.player.nw)} sub="Local" />
        <MiniStat label="GPM" value={String(data.match.player.gpm)} sub="Farm" />
        <MiniStat label="XPM" value={String(data.match.player.xpm)} sub="Tempo" />
      </section>

      <section className="gm-battle-grid" data-seat="battle-grid" tabIndex={-1}>
        {seatPhase === "live" ? (
          <>
            <div className="gm-slot-column">
              {[0, 1, 2, 3, 4].map((idx) => <HeroSlot key={`a-${idx}`} id={idx + 1} hero={allyHeroes[idx]} menu={menu} />)}
            </div>
            <MinimapMirror />
            <div className="gm-slot-column">
              {[0, 1, 2, 3, 4].map((idx) => <HeroSlot key={`e-${idx}`} id={idx + 6} hero={enemyHeroes[idx]} menu={menu} />)}
            </div>
          </>
        ) : seatPhase === "debrief" ? (
          <DebriefTimeline onBackToLive={() => setForceLive(true)} />
        ) : (
          <ReadinessRundown
            gsiOnline={data.match.gsiOnline}
            voicePackName={voicePackName}
            signalEnabled={signalEnabled}
            annEnabled={annEnabled}
            masterVolume={masterVolume}
            draftNote={seatPhase === "prep"}
            onPreviewLive={() => setForceLive(true)}
          />
        )}
      </section>

      <section className="gm-agent-card" data-seat="on-air" tabIndex={-1}>
        <OnAirConsole data={data} menu={menu} />
      </section>

      <section className="gm-sector-log" data-seat="sector-log" tabIndex={-1}>
        <div>
          <h3><span className={`gm-tally${data.match.gsiOnline ? " gm-tally-onair" : ""}`} />Alert Deck</h3>
          <div className="log-list">
            {data.activity.length === 0 ? (
              <div className="log-row">
                <span className="log-time">--:--:--</span>
                <span className="log-text">No alerts yet</span>
              </div>
            ) : (
              data.activity.map((item) => (
                <div key={item.id} className={`log-row ${toneClass(item.tone)}`}>
                  <span className="log-time">{item.at}</span>
                  <span className="log-text">{item.text}</span>
                </div>
              ))
            )}
          </div>
        </div>
        <div>
          <h3><span className={`gm-tally${data.match.gsiOnline ? " gm-tally-onair" : ""}`} />Companion State</h3>
          <div className="gm-state-grid">
            <MiniStat label="Voice" value={voicePackName ?? "—"} sub="Active pack" />
            <MiniStat label="Signal" value={signalEnabled ? "ON" : "OFF"} sub="G-Signal" />
            <MiniStat label="CPU" value={cpuValue} sub="Governor" />
            <MiniStat label="RAM" value={ramValue} sub="Governor" />
          </div>
        </div>
      </section>
    </div>
  );
}

function MiniStat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="gm-mini-stat">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{sub}</small>
    </div>
  );
}

export function VolumeRail({
  value,
  annEnabled,
  signalEnabled,
  onVolumeChange,
  onAnnToggle,
  onSignalToggle
}: {
  value: number;
  annEnabled: boolean;
  signalEnabled: boolean;
  onVolumeChange: (value: number) => void;
  onAnnToggle: () => void;
  onSignalToggle: () => void;
}) {
  return (
    <div className="g-volume-rail" data-no-drag="true">
      <div className="g-volume-copy">
        <strong>VOLUME</strong>
        <span>{value}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={value}
        onChange={(event) => onVolumeChange(Number(event.target.value))}
        aria-label="Master volume"
      />
      <div className="g-volume-toggles">
        <button
          type="button"
          className={`g-volume-toggle${annEnabled ? " on" : ""}`}
          onClick={onAnnToggle}
          title="Mutes G-AnnStudio announcer-pack events only (kill/streak/death lines). Maiden's persona voice and G-Signal gank warnings are separate and stay on."
        >
          ANN
        </button>
        <button type="button" className={`g-volume-toggle signal${signalEnabled ? " on" : ""}`} onClick={onSignalToggle}>
          SIGNAL
        </button>
      </div>
    </div>
  );
}

/** CR011-P4b-01 honesty check: an OpenDota hero-profile link needs a numeric
 *  hero id, but the deck only ever has `hero.hero` = `prettyHeroName(npcShort)`
 *  (title-cased words, spaces — see live/events.ts), while heroNames.ts's
 *  HERO_NAMES is keyed id -> OpenDota's OWN localized spelling ("Anti-Mage",
 *  "Nature's Prophet", "Queen of Pain" — hyphens/apostrophes the npc-short
 *  reconstruction never produces, e.g. npc short "antimage" round-trips to
 *  "Antimage", not "Anti-Mage"). There is no npc-short -> id table anywhere in
 *  the repo, so a reverse-name lookup would silently fail for a large chunk of
 *  the roster. Per the task's honesty rule ("no menu item that can't truly
 *  act"), the OpenDota-profile item is OMITTED rather than wired to a lookup
 *  that would be wrong for names like Anti-Mage/Nature's Prophet/Queen of
 *  Pain — only the copy-name action is offered. */
function heroMenuItems(heroName: string, known: boolean): ContextMenuEntry[] {
  return [
    {
      id: "hero-copy-name",
      label: "คัดลอกชื่อฮีโร่",
      disabled: !known,
      run: () => {
        void navigator.clipboard?.writeText(heroName).catch(() => {});
      }
    }
  ];
}

function HeroSlot({ id, hero, menu }: { id: number; hero?: CompanionData["heroes"][number]; menu: ContextMenuController }) {
  const heroName = hero && hero.hero !== "—" ? hero.hero : "—";
  const known = heroName !== "—";
  const stateLabel = !hero || hero.state === "empty" ? "Waiting" : hero.state;
  const kda = hero ? formatKda(hero) : "—";
  // portrait art behind the card (CDN, dimmed); dead = fainter, missing = grey.
  const portrait = heroPortraitUrl(hero?.hero);
  const overlay = { position: "relative", zIndex: 1 } as const;
  return (
    <div
      className={`gm-hero-slot ${hero?.state ?? "empty"}`}
      style={portrait ? { position: "relative", overflow: "hidden" } : undefined}
      aria-label={`Hero slot ${id}`}
      tabIndex={0}
      // No menu at all for unknown slots — a popup whose only item is disabled
      // is keyboard-inert dead chrome (Opus gate, CR011-P4b).
      onContextMenu={(e) => { if (known) menu.openFromMouseEvent(e, heroMenuItems(heroName, known)); }}
      onKeyDown={(e) => { if (known) menu.openFromKeyboard(e, heroMenuItems(heroName, known)); }}
    >
      {portrait && (
        <img
          src={portrait}
          alt=""
          draggable={false}
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            opacity: hero?.state === "dead" ? 0.12 : 0.3,
            filter: hero?.state === "missing" ? "grayscale(0.7)" : undefined,
            pointerEvents: "none",
            zIndex: 0,
          }}
        />
      )}
      <strong style={portrait ? overlay : undefined}>{heroName}</strong>
      <span style={portrait ? overlay : undefined}>{stateLabel}</span>
      <em style={portrait ? overlay : undefined}>{kda}</em>
    </div>
  );
}

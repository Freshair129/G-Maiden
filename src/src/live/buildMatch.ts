// Pure builder for CompanionData['match'] from live GSI wire data.
// Overlays game-tick / gsi-status onto the mock/base match slice. No side effects.

import type { GameTick, GsiStatus } from "./events";
import type { CompanionData } from "../companion";
import { formatTimer } from "../companion";

function formatNetWorth(nw: number): string {
  if (nw >= 1000) {
    const k = nw / 1000;
    const rounded = Math.round(k * 10) / 10;
    return `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1)}k`;
  }
  return String(nw);
}

export function buildMatch(
  tick: GameTick | null,
  status: GsiStatus | null,
  base: CompanionData["match"]
): CompanionData["match"] {
  if (!tick && !status) return base;

  let match = base;
  const fresh = status ? status.gsi_freshness === "fresh" : tick !== null;

  if (tick && fresh) {
    const seconds = tick.clock_time;
    const clock = formatTimer(Math.max(0, tick.clock_time));
    const phase: CompanionData["match"]["phase"] = tick.in_game ? "live" : "pregame";
    const minimapState: CompanionData["match"]["minimapState"] = tick.in_game ? "live" : "empty";

    const player = {
      ...base.player,
      nw: tick.net_worth,
      nwAvg: tick.net_worth,
      gpm: tick.gpm,
      gpmAvg: tick.gpm,
      xpm: tick.xpm,
      xpmAvg: tick.xpm,
      k: tick.kills,
      kAvg: tick.kills,
      d: tick.deaths,
      dAvg: tick.deaths,
      a: tick.assists,
      aAvg: tick.assists,
      cs: tick.last_hits,
      csAvg: tick.last_hits,
      denies: tick.denies,
      deniesAvg: tick.denies,
      ping: base.player.ping
    };

    const playerStats = {
      ...base.playerStats,
      gpm: tick.gpm,
      xpm: tick.xpm,
      net: formatNetWorth(tick.net_worth)
    };

    match = {
      ...match,
      seconds,
      clock,
      phase,
      minimapState,
      centerSubLabel: clock,
      leftScore: tick.radiant_score,
      rightScore: tick.dire_score,
      player,
      playerStats
    };
  }

  if (status) {
    const gsiFreshness = status.gsi_freshness;
    const gsiAgeMs = status.gsi_age_ms;
    match = {
      ...match,
      gsiOnline: status.gsi_active && fresh,
      gsiFreshness,
      gsiAgeMs,
    };

    if (!fresh) {
      const matchStillOpen = status.dota_running && status.in_game;
      const age = gsiAgeMs === null ? "" : ` · ${(gsiAgeMs / 1000).toFixed(1)}s`;
      match = {
        ...match,
        phase: matchStillOpen ? "live" : "pregame",
        minimapState: matchStillOpen ? "live" : "empty",
        clock: "--:--",
        seconds: 0,
        centerLabel: matchStillOpen ? "LIVE · GSI STALE" : "GSI STALE",
        centerSubLabel: `รอข้อมูล GSI${age}`,
        leftScore: -1,
        rightScore: -1,
        player: {
          ...base.player,
          nw: -1, nwAvg: -1, gpm: -1, gpmAvg: -1, xpm: -1, xpmAvg: -1,
          k: -1, kAvg: -1, d: -1, dAvg: -1, a: -1, aAvg: -1,
          cs: -1, csAvg: -1, denies: -1, deniesAvg: -1, ping: -1,
        },
        playerStats: { ...base.playerStats, net: "—", gpm: -1, xpm: -1 },
      };
    }
  } else if (tick) {
    match = { ...match, gsiOnline: true, gsiFreshness: "fresh", gsiAgeMs: 0 };
  }

  return match;
}

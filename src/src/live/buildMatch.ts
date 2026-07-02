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

  if (tick) {
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
    match = { ...match, gsiOnline: status.gsi_active };
  }

  return match;
}

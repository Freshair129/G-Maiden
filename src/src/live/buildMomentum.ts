// Pure builders for the game-momentum meter + laning/mid/late phase.
//
// Own-game GSI only exposes the LOCAL player, so momentum is a PROXY, not the
// full team net-worth lead the Dota client shows (that needs scoreboard CV).
// It's built from the two signals GSI *does* give at team scope — the team kill
// totals (radiant_score / dire_score) — plus our own economy trajectory vs our
// historical baseline. Phase is a plain clock-based split (laning ends when
// supports typically start rotating, ~10:00).

import type { GameTick } from "./events";
import type { CompanionTone } from "../companion";

export type GamePhase = "pregame" | "laning" | "mid" | "late";

const LANING_END_S = 10 * 60; // ~10:00 — supports start rotating out of lane
const MID_END_S = 25 * 60; // ~25:00 — into late game

export function gamePhase(clockSeconds: number): GamePhase {
  if (clockSeconds < 0) return "pregame";
  if (clockSeconds < LANING_END_S) return "laning";
  if (clockSeconds < MID_END_S) return "mid";
  return "late";
}

const PHASE_LABEL: Record<GamePhase, string> = {
  pregame: "ก่อนเกม",
  laning: "เลนนิ่ง",
  mid: "กลางเกม",
  late: "ปลายเกม",
};

/** Rolling momentum accumulator — advanced once per game-tick. */
export interface MomentumState {
  /** smoothed momentum, -100..100, from OUR team's perspective. */
  ewma: number;
  /** (ourKills - theirKills) at the previous sample, for the swing term. */
  lastDiff: number;
  /** false until the first in-game sample, so the first swing isn't a jump. */
  seeded: boolean;
}

export const EMPTY_MOMENTUM: MomentumState = { ewma: 0, lastDiff: 0, seeded: false };

const ALPHA = 0.35; // EWMA smoothing — higher = more reactive to the latest tick

/** Kill lead from the local player's team perspective (team_name = our side). */
function ourTeamDiff(tick: GameTick): number {
  const radiant = tick.team_name === "radiant";
  const ours = radiant ? tick.radiant_score : tick.dire_score;
  const theirs = radiant ? tick.dire_score : tick.radiant_score;
  return ours - theirs;
}

/**
 * Advance the momentum EWMA from one game-tick. `gpmAvg` is the player's
 * historical GPM baseline; pass the live gpm when no baseline exists, which
 * zeroes the economy term (honest: no baseline = no economy signal).
 */
export function stepMomentum(state: MomentumState, tick: GameTick, gpmAvg: number): MomentumState {
  if (!tick.in_game) return EMPTY_MOMENTUM;
  const diff = ourTeamDiff(tick);
  const swing = state.seeded ? diff - state.lastDiff : 0;
  const econEdge = gpmAvg > 0 ? (tick.gpm - gpmAvg) / gpmAvg : 0;

  // Blend standing kill lead (position) + recent swing (velocity) + economy
  // edge vs our own baseline. tanh keeps each term bounded and smooth.
  const instant =
    45 * Math.tanh(diff / 5) + // overall team kill lead
    35 * Math.tanh(swing) + // teamfight swing since the last tick
    20 * Math.tanh(econEdge * 2); // farming pace vs our baseline

  const clamped = Math.max(-100, Math.min(100, instant));
  const ewma = state.seeded ? ALPHA * clamped + (1 - ALPHA) * state.ewma : clamped;
  return { ewma, lastDiff: diff, seeded: true };
}

export interface MomentumView {
  value: number; // -100..100
  label: string;
  tone: CompanionTone;
  phase: GamePhase;
  phaseLabel: string;
}

/** Present the accumulator for the deck: signed value, Thai label + tone, phase. */
export function momentumView(state: MomentumState, tick: GameTick | null): MomentumView {
  const phase = gamePhase(tick?.clock_time ?? -1);
  const value = Math.round(state.ewma);
  let label = "สูสี";
  let tone: CompanionTone = "info";
  if (value >= 25) {
    label = "กำลังนำ";
    tone = "good";
  } else if (value <= -25) {
    label = "กำลังเสียเปรียบ";
    tone = "danger";
  }
  return { value, label, tone, phase, phaseLabel: PHASE_LABEL[phase] };
}

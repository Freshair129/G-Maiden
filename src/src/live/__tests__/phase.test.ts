import { describe, it, expect } from "vitest";
import { stepPhase, type MatchPhase, type PhaseInput } from "../phase";

function input(overrides: Partial<PhaseInput> = {}): PhaseInput {
  return {
    gsiOnline: true,
    gameState: null,
    inGame: false,
    clockSeconds: -1,
    ...overrides,
  };
}

const ALL_PHASES: MatchPhase[] = ["standby", "prep", "live", "debrief"];

describe("stepPhase — offline", () => {
  it("goes to standby from any non-debrief phase when GSI is offline", () => {
    for (const prev of ["standby", "prep", "live"] as MatchPhase[]) {
      expect(stepPhase(prev, input({ gsiOnline: false }))).toBe("standby");
    }
  });

  it("keeps debrief sticky through GSI/Dota closing", () => {
    expect(stepPhase("debrief", input({ gsiOnline: false }))).toBe("debrief");
  });

  it("ignores game_state/inGame noise while offline", () => {
    expect(
      stepPhase("standby", input({ gsiOnline: false, gameState: "DOTA_GAMERULES_STATE_GAME_IN_PROGRESS", inGame: true }))
    ).toBe("standby");
  });
});

describe("stepPhase — draft states -> prep", () => {
  const draftStates = [
    "DOTA_GAMERULES_STATE_HERO_SELECTION",
    "DOTA_GAMERULES_STATE_STRATEGY_TIME",
    "DOTA_GAMERULES_STATE_TEAM_SHOWCASE",
    "DOTA_GAMERULES_STATE_WAIT_FOR_MAP_TO_LOAD",
    "DOTA_GAMERULES_STATE_WAIT_FOR_PLAYERS_TO_LOAD",
  ];

  for (const state of draftStates) {
    it(`maps ${state} to prep from every prior phase`, () => {
      for (const prev of ALL_PHASES) {
        expect(stepPhase(prev, input({ gameState: state }))).toBe("prep");
      }
    });
  }
});

describe("stepPhase — live states -> live", () => {
  it("maps DOTA_GAMERULES_STATE_PRE_GAME to live", () => {
    expect(stepPhase("prep", input({ gameState: "DOTA_GAMERULES_STATE_PRE_GAME" }))).toBe("live");
  });

  it("maps DOTA_GAMERULES_STATE_GAME_IN_PROGRESS to live", () => {
    expect(stepPhase("prep", input({ gameState: "DOTA_GAMERULES_STATE_GAME_IN_PROGRESS" }))).toBe("live");
  });

  it("honors inGame=true even with an unrecognized/empty game_state", () => {
    expect(stepPhase("standby", input({ gameState: "", inGame: true }))).toBe("live");
  });

  it("live wins over a stale prev of any kind", () => {
    for (const prev of ALL_PHASES) {
      expect(stepPhase(prev, input({ gameState: "DOTA_GAMERULES_STATE_GAME_IN_PROGRESS" }))).toBe("live");
    }
  });
});

describe("stepPhase — post-game -> debrief", () => {
  it("maps DOTA_GAMERULES_STATE_POST_GAME to debrief from every prior phase", () => {
    for (const prev of ALL_PHASES) {
      expect(stepPhase(prev, input({ gameState: "DOTA_GAMERULES_STATE_POST_GAME" }))).toBe("debrief");
    }
  });
});

describe("stepPhase — menu/idle fallback + debrief edge", () => {
  it("prev==live falling back to an unknown/menu state (e.g. disconnect) arms debrief", () => {
    expect(stepPhase("live", input({ gameState: "DOTA_GAMERULES_STATE_DISCONNECT" }))).toBe("debrief");
    expect(stepPhase("live", input({ gameState: "DOTA_GAMERULES_STATE_INIT" }))).toBe("debrief");
    expect(stepPhase("live", input({ gameState: "" }))).toBe("debrief");
  });

  it("debrief stays sticky through further unknown/menu states", () => {
    expect(stepPhase("debrief", input({ gameState: "DOTA_GAMERULES_STATE_INIT" }))).toBe("debrief");
    expect(stepPhase("debrief", input({ gameState: "" }))).toBe("debrief");
    expect(stepPhase("debrief", input({ gameState: "DOTA_GAMERULES_STATE_DISCONNECT" }))).toBe("debrief");
  });

  it("debrief exits only via a new prep or live observation", () => {
    expect(stepPhase("debrief", input({ gameState: "DOTA_GAMERULES_STATE_HERO_SELECTION" }))).toBe("prep");
    expect(stepPhase("debrief", input({ gameState: "DOTA_GAMERULES_STATE_GAME_IN_PROGRESS" }))).toBe("live");
  });

  it("unknown state from standby/prep (not live, not debrief) falls back to standby", () => {
    expect(stepPhase("standby", input({ gameState: "DOTA_GAMERULES_STATE_INIT" }))).toBe("standby");
    expect(stepPhase("prep", input({ gameState: "DOTA_GAMERULES_STATE_DISCONNECT" }))).toBe("standby");
    expect(stepPhase("standby", input({ gameState: "DOTA_GAMERULES_STATE_NONSENSE_FUTURE_VALUE" }))).toBe("standby");
  });

  it("treats a missing/null game_state the same as an unrecognized one", () => {
    expect(stepPhase("standby", input({ gameState: null }))).toBe("standby");
    expect(stepPhase("standby", input({ gameState: undefined }))).toBe("standby");
    expect(stepPhase("live", input({ gameState: null }))).toBe("debrief");
  });
});

describe("stepPhase — determinism / no flapping", () => {
  it("the same prev+input pair always yields the same result", () => {
    const i = input({ gameState: "DOTA_GAMERULES_STATE_GAME_IN_PROGRESS" });
    const a = stepPhase("standby", i);
    const b = stepPhase("standby", i);
    expect(a).toBe(b);
  });

  it("a full standby -> prep -> live -> debrief -> standby cycle settles without oscillation", () => {
    let phase: MatchPhase = "standby";
    phase = stepPhase(phase, input({ gameState: "DOTA_GAMERULES_STATE_HERO_SELECTION" }));
    expect(phase).toBe("prep");
    phase = stepPhase(phase, input({ gameState: "DOTA_GAMERULES_STATE_GAME_IN_PROGRESS", inGame: true }));
    expect(phase).toBe("live");
    phase = stepPhase(phase, input({ gameState: "DOTA_GAMERULES_STATE_POST_GAME" }));
    expect(phase).toBe("debrief");
    phase = stepPhase(phase, input({ gsiOnline: false }));
    expect(phase).toBe("debrief"); // Dota closed — debrief survives
    phase = stepPhase(phase, input({ gameState: "DOTA_GAMERULES_STATE_HERO_SELECTION" }));
    expect(phase).toBe("prep"); // next match's draft finally clears it
  });
});

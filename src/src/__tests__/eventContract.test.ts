import { describe, expect, it } from "vitest";
import { STREAK_LABELS } from "../overlay/streaks";
// The vendored contract lives at repo root: schemas/gmaiden-events.json. This
// test file sits at src/src/__tests__/, so three levels up is the repo root
// (__tests__ -> src/src -> src -> G-Maiden). Statically imported (not read via
// node:fs) because this project has no @types/node — resolveJsonModule +
// Vite's native ESM JSON import handle it without any Node typings.
import rawSchema from "../../../schemas/gmaiden-events.json";

interface EventDef {
  id: string;
  label: string;
  category: string;
  priority: string;
  status: string;
  trigger: string;
}

interface EventSchema {
  version: string;
  "x-events": EventDef[];
}

function loadSchema(): EventSchema {
  return rawSchema as EventSchema;
}

// The 'unused' event (category "none") is a G-AnnStudio authoring-only concept
// and is deliberately NOT wired into G-Maiden code. Exempt it structurally by
// category, not by hardcoding its id, so any future "none"-category addition
// is exempted automatically too.
function codeFacingEvents(schema: EventSchema): EventDef[] {
  return schema["x-events"].filter((e) => e.category !== "none");
}

const SYNC_HINT =
  "update schemas/gmaiden-events.json, src-tauri/src/announcer.rs, and " +
  "src/src/overlay/streaks.ts together (CLAUDE.md \"Kill-banner sync\").";

describe("announcer event contract (schemas/gmaiden-events.json)", () => {
  it("loads the vendored schema at v1.1 with 24 code-facing events (25 total minus 'unused')", () => {
    const schema = loadSchema();
    expect(schema.version).toBe("1.1");
    expect(schema["x-events"].length).toBe(25);
    expect(codeFacingEvents(schema).length).toBe(24);
  });

  it("STREAK_LABELS is keyed by exactly the no-death ladder counts 3..10", () => {
    const counts = Object.keys(STREAK_LABELS)
      .map(Number)
      .sort((a, b) => a - b);
    expect(counts).toEqual([3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("schema 'streak' category has exactly 8 ids, matching STREAK_LABELS' 8 rungs", () => {
    const schema = loadSchema();
    const schemaStreakIds = schema["x-events"].filter((e) => e.category === "streak").map((e) => e.id);
    expect(schemaStreakIds.length).toBe(Object.keys(STREAK_LABELS).length);
  });

  it("each schema streak id lines up with its STREAK_LABELS rung (id order == ladder order 3..10)", () => {
    // Per the reconciled taxonomy, the schema's "streak" category is authored
    // in ladder order (killing_spree=3 .. beyond_godlike=10). Zip that order
    // against STREAK_LABELS' numeric keys and verify the label text itself
    // round-trips from the schema id (e.g. "mega_kill" -> "MEGA KILL"), so a
    // rename OR a reorder in either file fails loudly and by name.
    const schema = loadSchema();
    const schemaStreakIds = schema["x-events"].filter((e) => e.category === "streak").map((e) => e.id);
    const ladderCounts = [3, 4, 5, 6, 7, 8, 9, 10];

    ladderCounts.forEach((count, i) => {
      const schemaId = schemaStreakIds[i];
      if (schemaId === undefined) {
        throw new Error(
          `Streak ladder drift: schema is missing the rung-${count} streak event ` +
            `(only ${schemaStreakIds.length} 'streak' entries found, expected 8) — ${SYNC_HINT}`
        );
      }
      const expectedLabel = schemaId.toUpperCase().replace(/_/g, " ");
      const actualLabel = STREAK_LABELS[count];
      if (actualLabel !== expectedLabel) {
        throw new Error(
          `Streak ladder drift at rung ${count}: schema id "${schemaId}" implies label ` +
            `"${expectedLabel}" but streaks.ts STREAK_LABELS[${count}] is "${actualLabel}" — ${SYNC_HINT}`
        );
      }
    });
  });

  it("STREAK_LABELS has no rungs beyond what the schema defines (no orphaned tiers)", () => {
    const schema = loadSchema();
    const schemaStreakIds = schema["x-events"].filter((e) => e.category === "streak").map((e) => e.id);
    const labelCounts = Object.keys(STREAK_LABELS).map(Number);
    if (labelCounts.length > schemaStreakIds.length) {
      throw new Error(
        `streaks.ts defines ${labelCounts.length} streak rungs but the schema only defines ` +
          `${schemaStreakIds.length} — ${SYNC_HINT}`
      );
    }
  });
});

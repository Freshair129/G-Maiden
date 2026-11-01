import { describe, expect, it } from "vitest";
import { FALLBACK } from "../../companion";
import { heroSlotStatus } from "../heroSlotStatus";
const hero = { ...FALLBACK.heroes[1], hero: "Axe" };
const cv = { ...FALLBACK.heroCv, phase: "live" as const, local: { hero: "earthshaker", team: "radiant", alive: true, respawnSeconds: 0 }, roster: { radiant: ["earthshaker", "axe", null, null, null], dire: [null, null, null, null, null], complete: false, recognizer_active: true, templates_loading: false }, hud: { radiant: [{ cue: "colored" as const, mean_chroma: 50 }, { cue: "death_hint" as const, mean_chroma: 3 }], dire: [] } };
describe("hero slot evidence", () => {
 it("distinguishes an identified hero without current state from an unrecognized slot", () => {
  expect(heroSlotStatus(hero, FALLBACK.heroCv).label).toBe("ยังไม่ทราบสถานะ");
  expect(heroSlotStatus(FALLBACK.heroes[1], FALLBACK.heroCv).label).toBe("รอระบุฮีโร่");
 });
 it("joins teammate HUD by original roster slot and labels death as a hint", () => {
  expect(heroSlotStatus(hero, cv).label).toBe("อาจตาย · HUD");
  expect(heroSlotStatus(hero, { ...cv, hud: null }).label).toBe("ยังไม่ทราบสถานะ");
  expect(heroSlotStatus(hero, { ...cv, phase: "standby" }).label).toBe("ยังไม่ทราบสถานะ");
 });
 it("keeps confirmed missing and GSI death ahead of visual hints", () => {
  expect(heroSlotStatus({ ...hero, state: "missing", timer: 7 }, cv).label).toBe("หายจากสายตา · 7 วิ");
  expect(heroSlotStatus({ ...hero, state: "dead", timer: 12 }, cv).label).toBe("ตาย · 12 วิ");
 });
});

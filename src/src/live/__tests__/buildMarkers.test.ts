import { describe, it, expect } from "vitest";
import { buildMarkers } from "../buildMarkers";
import { MOCK } from "../../companion";
import type { MinimapCv, CvDetection } from "../events";

function makeDetection(overrides: Partial<CvDetection> = {}): CvDetection {
  return {
    label: 1,
    name: "npc_dota_hero_crystal_maiden",
    x: 100,
    y: 100,
    score: 0.92,
    ...overrides
  };
}

function makeCv(overrides: Partial<MinimapCv> = {}): MinimapCv {
  return {
    region: { x: 0, y: 0, side: 200 },
    icon: 0,
    candidates: [],
    count: 1,
    detections: [makeDetection()],
    classifier: true,
    ...overrides
  };
}

describe("buildMarkers", () => {
  it("returns base unchanged when cv is null", () => {
    const result = buildMarkers(null, new Map(), MOCK.markers);
    expect(result).toBe(MOCK.markers);
  });

  it("returns base unchanged when region.side is 0", () => {
    const cv = makeCv({ region: { x: 0, y: 0, side: 0 } });
    const result = buildMarkers(cv, new Map(), MOCK.markers);
    expect(result).toBe(MOCK.markers);
  });

  it("returns base unchanged when detections array is empty", () => {
    const cv = makeCv({ detections: [] });
    const result = buildMarkers(cv, new Map(), MOCK.markers);
    expect(result).toBe(MOCK.markers);
  });

  it("maps each detection to a marker with kind 'hero' and id 'cv-<i>'", () => {
    const cv = makeCv({
      detections: [
        makeDetection({ name: "npc_dota_hero_crystal_maiden", x: 50, y: 50 }),
        makeDetection({ name: "npc_dota_hero_warden", x: 150, y: 20 })
      ]
    });
    const result = buildMarkers(cv, new Map(), MOCK.markers);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("cv-0");
    expect(result[0].kind).toBe("hero");
    expect(result[1].id).toBe("cv-1");
    expect(result[1].kind).toBe("hero");
  });

  it("normalises x/y using side=200, det.x=100 -> x=50 exactly", () => {
    const cv = makeCv({
      region: { x: 0, y: 0, side: 200 },
      detections: [makeDetection({ x: 100, y: 100 })]
    });
    const result = buildMarkers(cv, new Map(), MOCK.markers);
    expect(result[0].x).toBe(50);
    expect(result[0].y).toBe(50);
  });

  it("clamps a detection outside [0, side] to 0 or 100", () => {
    const cv = makeCv({
      region: { x: 0, y: 0, side: 200 },
      detections: [makeDetection({ x: -50, y: 400 })]
    });
    const result = buildMarkers(cv, new Map(), MOCK.markers);
    expect(result[0].x).toBe(0);
    expect(result[0].y).toBe(100);
  });
});

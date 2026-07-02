// Pure builder: live minimap markers from CV detections.
// Falls back to the MOCK/base marker slice untouched whenever live data is absent.

import type { MinimapCv } from "./events";
import { prettyHeroName } from "./events";
import type { CompanionData } from "../companion";

function clamp0to100(v: number): number {
  if (!Number.isFinite(v)) return NaN;
  return Math.max(0, Math.min(100, v));
}

function shortCode(npcName: string): string {
  const pretty = prettyHeroName(npcName);
  const letters = pretty
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");
  return letters.slice(0, 2);
}

export function buildMarkers(
  cv: MinimapCv | null,
  missingPos: Map<string, [number, number]>,
  base: CompanionData["markers"]
): CompanionData["markers"] {
  const hasCv =
    !!cv && !!cv.region && cv.region.side > 0 && !!cv.detections && cv.detections.length > 0;
  const hasMissing = missingPos.size > 0;

  if (!hasCv && !hasMissing) {
    return base;
  }

  const markers: CompanionData["markers"] = [];

  if (hasCv && cv) {
    const side = cv.region.side;
    cv.detections.forEach((det, index) => {
      const nx = clamp0to100((det.x / side) * 100);
      const ny = clamp0to100((det.y / side) * 100);
      if (Number.isNaN(nx) || Number.isNaN(ny)) return;

      markers.push({
        id: `cv-${index}`,
        heroId: undefined,
        x: nx,
        y: ny,
        kind: "hero",
        label: shortCode(det.name),
      });
    });
  }

  let missIndex = 0;
  for (const [npcName, pos] of missingPos) {
    const [nx01, ny01] = pos;
    const nx = clamp0to100(nx01 * 100);
    const ny = clamp0to100(ny01 * 100);
    if (Number.isNaN(nx) || Number.isNaN(ny)) continue;

    markers.push({
      id: `miss-${missIndex}`,
      heroId: undefined,
      x: nx,
      y: ny,
      kind: "enemy",
      state: "missing",
      label: shortCode(npcName),
    });
    missIndex += 1;
  }

  return markers;
}

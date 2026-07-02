// Pure builder for the G-Signal panel (CompanionData['signals']).
// No side effects, no Tauri/React imports — inputs in, new array out.

import type { SignalAlert } from "./events";
import type { CompanionData, CompanionTone } from "../companion";

export function buildSignals(
  gank: SignalAlert | null,
  missing: Map<string, number>,
  base: CompanionData["signals"]
): CompanionData["signals"] {
  // Null-safe fallback: with no live data at all, keep the mock/base slice
  // unchanged rather than fabricate values. Once we have live inputs (even a
  // quiet state), we prefer the computed all-clear array below so the panel
  // reflects a genuine "nothing detected" read instead of stale mock text.
  if (gank === null && missing.size === 0 && base.length === 0) {
    return base;
  }

  const missingCount = missing.size;
  const enemyMissingTone: CompanionTone =
    missingCount === 0 ? "good" : missingCount === 1 ? "warn" : "danger";
  const enemyMissingValue =
    missingCount === 0 ? "Clear" : `${missingCount} ${missingCount === 1 ? "hero" : "heroes"}`;

  let gankRiskTone: CompanionTone = "good";
  let gankRiskValue = "Low";
  if (gank !== null) {
    const pct = Math.round(gank.probability * 100);
    gankRiskValue = `${pct}%`;
    gankRiskTone = pct >= 65 ? "danger" : pct >= 40 ? "warn" : "good";
  }

  const visionPressureValue =
    gank !== null && gank.eta_ms > 0 ? `ETA ${Math.round(gank.eta_ms / 1000)}s` : "Stable";

  const safePushTone: CompanionTone = missingCount >= 2 ? "good" : "info";
  const safePushValue = missingCount >= 2 ? "Window open" : "Hold";

  return [
    { label: "Enemy Missing", tone: enemyMissingTone, value: enemyMissingValue },
    { label: "Gank Risk", tone: gankRiskTone, value: gankRiskValue },
    { label: "Vision Pressure", tone: "info", value: visionPressureValue },
    { label: "Safe Push", tone: safePushTone, value: safePushValue }
  ];
}

// Pure builder for the G-Signal panel (CompanionData['signals']), the D/E/F/G
// annunciator cluster rendered by CommandDeck.tsx's SignalGrid.
// No side effects, no Tauri/React imports — inputs in, new array out.
//
// CR-007 WP-4: every value below is a direct, honest function of (gank,
// missing) — no ad-hoc UI-layer formulas (the old linear-in-missing-count
// "Gank Risk" formula and the hardcoded 40% "Vision" bar were fabrications
// and have been removed). When there is no live data at all, the formulas below
// naturally settle on the correct "nothing to report" values (0 missing, no
// gank), so there is no separate pregame branch to special-case.

import type { SignalAlert } from "./events";
import type { CompanionData, CompanionTone } from "../companion";

// CR-007 WP-4: this tier ladder MUST stay in sync with the overlay's
// gmeterLevel() in src/src/overlay/FullOverlay.tsx (~line 67) — same
// "keep both in sync" rule CLAUDE.md states for STREAK_LABELS. If you change
// one, change the other.
function riskTier(gankActive: boolean, missingCount: number): 0 | 1 | 2 | 3 {
  if (gankActive) return 3;
  if (missingCount >= 3) return 3;
  if (missingCount >= 2) return 2;
  if (missingCount >= 1) return 1;
  return 0;
}

// Thai labels mirror the overlay's G_LEVELS exactly (same file/line as above).
const RISK_LABELS = ["ปลอดภัย", "ระวัง", "เสี่ยง", "อันตราย"] as const;
const RISK_TONES: readonly CompanionTone[] = ["good", "info", "warn", "danger"];

export function buildSignals(
  gank: SignalAlert | null,
  missing: Map<string, number>,
  sensorOk: boolean
): CompanionData["signals"] {
  // An empty missing-set is ambiguous: it means "the CV pipeline saw every
  // enemy" OR "the CV pipeline saw nothing at all" (Lite mode, no ONNX model,
  // capture stalled). Those used to render identically as a green "Clear" —
  // the fake-safe state PRODUCT.md Principle 3 forbids. When the sensor isn't
  // trustworthy we refuse to claim safety and fall back to the same NO_SENSOR
  // "—" sentinel the rest of the deck already uses. An alert that DID arrive
  // is still shown: we withhold reassurance, never a warning.
  if (!sensorOk && gank === null) {
    return [
      { label: "Enemy Missing", tone: "info", value: "—", barPct: 0 },
      { label: "Gank Risk", tone: "info", value: "—", barPct: 0 },
      { label: "Risk Level", tone: "info", value: "—", barPct: 0 },
      { label: "Gank ETA", tone: "info", value: "—", barPct: 0 }
    ];
  }

  const missingCount = missing.size;

  // D — Enemy Missing: real count of heroes currently in the missing map.
  const enemyMissingTone: CompanionTone = missingCount === 0 ? "good" : missingCount === 1 ? "warn" : "danger";
  const enemyMissingValue = missingCount === 0 ? "Clear" : `${missingCount} ${missingCount === 1 ? "hero" : "heroes"}`;
  const enemyMissingBar = Math.min(100, missingCount * 20);

  // E — Gank Risk: real probability from the latest gank-alert. No alert →
  // "—" / bar 0 (not an invented baseline).
  let gankRiskTone: CompanionTone = "info";
  let gankRiskValue = "—";
  let gankRiskBar = 0;
  if (gank !== null) {
    const pct = Math.max(0, Math.min(100, Math.round(gank.probability * 100)));
    gankRiskValue = `${pct}%`;
    gankRiskBar = pct;
    gankRiskTone = pct >= 65 ? "danger" : pct >= 40 ? "warn" : "good";
  }

  // F — Risk Level: mirrors the overlay's G-Meter tiers exactly (see riskTier above).
  const tier = riskTier(gank !== null, missingCount);
  const riskLevelValue = RISK_LABELS[tier];
  const riskLevelTone = RISK_TONES[tier];
  const riskLevelBar = (tier / 3) * 100;

  // G — Gank ETA: eta_ms of the active gank alert, in seconds. No alert →
  // "—" / bar 0. Bar reads as an urgency meter: an imminent gank (low ETA)
  // fills the bar; one 15s+ out reads as empty.
  let gankEtaValue = "—";
  let gankEtaTone: CompanionTone = "info";
  let gankEtaBar = 0;
  if (gank !== null && gank.eta_ms > 0) {
    gankEtaValue = `${Math.round(gank.eta_ms / 1000)}s`;
    gankEtaBar = Math.max(0, Math.min(100, 100 - (gank.eta_ms / 15_000) * 100));
    gankEtaTone = gank.eta_ms <= 5_000 ? "danger" : "warn";
  }

  return [
    { label: "Enemy Missing", tone: enemyMissingTone, value: enemyMissingValue, barPct: enemyMissingBar },
    { label: "Gank Risk", tone: gankRiskTone, value: gankRiskValue, barPct: gankRiskBar },
    { label: "Risk Level", tone: riskLevelTone, value: riskLevelValue, barPct: riskLevelBar },
    { label: "Gank ETA", tone: gankEtaTone, value: gankEtaValue, barPct: gankEtaBar }
  ];
}

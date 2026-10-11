import type { GsiStatus, SensorHealth } from "./live/events";

export type ReadinessStatus = "ready" | "degraded" | "unknown";
export type BetaReadiness = {
  gsi: ReadinessStatus;
  capture: ReadinessStatus;
  minimap: ReadinessStatus;
  overlay: ReadinessStatus;
  audio: ReadinessStatus;
};

export function readinessFromRuntime(input: {
  gsiConfigured: boolean | null;
  gsiStatus: GsiStatus | null;
  sensorHealth: SensorHealth | null;
  overlayReady: boolean | null;
}): BetaReadiness {
  const gsi = input.gsiStatus;
  const sensor = input.sensorHealth;

  return {
    gsi: gsi?.server_state === "port_conflict" || gsi?.server_state === "bind_error"
      ? "degraded"
      : gsi?.gsi_active === true
        ? "ready"
        : input.gsiConfigured === false || (gsi?.gsi_active === false && gsi.dota_running)
          ? "degraded"
          : "unknown",
    capture: sensor ? (sensor.healthy ? "ready" : "degraded") : "unknown",
    // A live sensor or loaded classifier is not evidence that the minimap is
    // covered correctly for this user's display and HUD geometry.
    minimap: sensor && (sensor.backend === "lite" || !sensor.classifier) ? "degraded" : "unknown",
    overlay: input.overlayReady === true ? "ready" : "unknown",
    // There is no audio health producer yet. A preview action is not proof of
    // reliable playback, so this remains unknown until a producer is added.
    audio: "unknown",
  };
}

export function compatibilityMode(readiness: BetaReadiness): boolean {
  return readiness.minimap === "degraded";
}

export function readinessLabel(status: ReadinessStatus): string {
  switch (status) {
    case "ready": return "พร้อม";
    case "degraded": return "บกพร่อง";
    case "unknown": return "ยังไม่ทราบ";
  }
}

export function buildDiagnosticBundle(input: {
  version: string;
  channel: string;
  readiness: BetaReadiness;
  updateStatus: string;
  userNote?: string;
}) {
  return {
    schemaVersion: 2,
    createdAt: new Date().toISOString(),
    app: { version: input.version, channel: input.channel },
    readiness: input.readiness,
    updateStatus: input.updateStatus,
    userNote: input.userNote ?? "",
    privacy: { rawFramesIncluded: false, credentialsIncluded: false, tokensIncluded: false },
  };
}

export function buildFeedback(input: { category: string; description: string; diagnostics: ReturnType<typeof buildDiagnosticBundle> | null; consent: boolean }) {
  if (!input.consent) throw new Error("diagnostic consent is required before attaching evidence");
  return { schemaVersion: 1, category: input.category, description: input.description, diagnostics: input.diagnostics };
}

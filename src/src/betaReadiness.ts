export type ReadinessStatus = "pass" | "warn" | "fail" | "pending";
export type BetaReadiness = {
  gsi: ReadinessStatus;
  capture: ReadinessStatus;
  minimap: ReadinessStatus;
  overlay: ReadinessStatus;
  audio: ReadinessStatus;
};

export function readinessFromRuntime(input: {
  gsiInstalled: boolean;
  gsiActive: boolean | null;
  captureMode: "dxgi" | "lite" | "";
  minimapReady: boolean | null;
  audioReady: boolean | null;
}): BetaReadiness {
  return {
    gsi: input.gsiInstalled && input.gsiActive !== false ? "pass" : input.gsiActive === false ? "warn" : "pending",
    capture: input.captureMode === "dxgi" ? "pass" : input.captureMode === "lite" ? "warn" : "pending",
    minimap: input.minimapReady === true ? "pass" : input.captureMode === "lite" ? "warn" : "pending",
    overlay: "pass",
    audio: input.audioReady === true ? "pass" : "pending",
  };
}

export function compatibilityMode(readiness: BetaReadiness): boolean {
  return readiness.capture === "warn" || readiness.minimap === "warn";
}

export function buildDiagnosticBundle(input: {
  version: string;
  channel: string;
  readiness: BetaReadiness;
  updateStatus: string;
  userNote?: string;
}) {
  return {
    schemaVersion: 1,
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

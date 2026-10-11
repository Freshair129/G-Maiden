/** Compare event epochs before applying session-bound UI state. */
export type SessionEpochRelation = "unknown" | "same" | "new" | "stale";
export type SessionLifecycle = "draft" | "live" | "disconnected" | "end" | "abandon";

export function sessionEpochRelation(
  incoming: number | null | undefined,
  current: number | null | undefined
): SessionEpochRelation {
  if (incoming === null || incoming === undefined || !Number.isSafeInteger(incoming) || incoming < 0) {
    return "unknown";
  }
  if (current === null || current === undefined || !Number.isSafeInteger(current) || current < 0) {
    return incoming > 0 ? "new" : "unknown";
  }
  if (incoming < current) return "stale";
  if (incoming > current) return "new";
  return "same";
}

/** Terminal sessions cannot be resurrected by a late same-epoch event.
 * An abandoned session can resume only when its canonical match ID is known. */
export function allowsSessionLifecycleAdvance(
  previous: SessionLifecycle | null | undefined,
  incoming: SessionLifecycle | null | undefined,
  previousMatchId: string | null | undefined,
  incomingMatchId: string | null | undefined
): boolean {
  if (previous === "end") return incoming === "end";
  if (previous === "abandon" && incoming !== "abandon") {
    return !!previousMatchId && incomingMatchId === previousMatchId;
  }
  return true;
}

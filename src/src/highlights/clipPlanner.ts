/**
 * G-Highlights MVP: pure replay-window scheduler.
 *
 * All timestamps must come from the SAME local monotonic clock. The GSI game
 * clock and wall/Unix timestamps are not interchangeable with media time.
 * This module neither talks to OBS nor claims that a replay has been saved.
 */
export const HIGHLIGHT_KINDS = [
  "kill",
  "first_blood",
  "double_kill",
  "triple_kill",
  "ultra_kill",
  "rampage",
  "killing_spree",
  "dominating",
  "mega_kill",
  "unstoppable",
  "wicked_sick",
  "monster_kill",
  "godlike",
  "beyond_godlike",
  "death"
] as const;

export type HighlightKind = (typeof HIGHLIGHT_KINDS)[number];

export function isHighlightKind(value: string): value is HighlightKind {
  return HIGHLIGHT_KINDS.some((kind) => kind === value);
}

export interface HighlightObservation {
  /** Locally generated, bounded event key; MUST NOT contain match ID/SteamID. */
  eventId: string;
  sessionEpoch: number;
  observedAtMs: number;
  kind: HighlightKind;
  source: "gsi";
  /** Required for every MVP personal highlight, not just for voice playback. */
  ownPlayerVerified: boolean;
}

export interface ReplayPolicy {
  preRollMs: number;
  postRollMs: number;
  replayBufferMs: number;
  safetyMarginMs: number;
  maxPendingWindows: number;
  maxEventChainLength: number;
}

export const DEFAULT_REPLAY_POLICY: Readonly<ReplayPolicy> = {
  preRollMs: 30_000,
  postRollMs: 15_000,
  replayBufferMs: 90_000,
  safetyMarginMs: 5_000,
  maxPendingWindows: 32,
  maxEventChainLength: 8
};

export type ObserveRejectReason =
  | "session_unavailable"
  | "invalid_observation"
  | "unverified_player"
  | "duplicate_event"
  | "out_of_order"
  | "replay_window_expired"
  | "queue_full"
  | "event_capacity"
  | "session_closed";

export type ObserveResult =
  | { accepted: true; windowId: string }
  | { accepted: false; reason: ObserveRejectReason };

export interface ReplaySaveIntent {
  /** An intent to ask OBS to save its CURRENT replay buffer, not a file receipt. */
  windowId: string;
  sessionEpoch: number;
  eventIds: string[];
  eventKinds: HighlightKind[];
  requestedAtMs: number;
  desiredStartMs: number;
  desiredEndMs: number;
  /** Original post-roll target when a partial end policy truncates desiredEndMs. */
  plannedEndMs?: number;
  /** Present only when the available interval is shorter than the planned window. */
  partial?: true;
  /** SaveReplayBuffer includes additional footage; trimming happens later. */
  requiresOfflineTrim: true;
}

export type ReplaySessionEndPolicy = "wait" | "partial" | "discard";

export interface UnresolvedReplayWindow {
  windowId: string;
  eventIds: string[];
  eventKinds: HighlightKind[];
  desiredStartMs: number;
  desiredEndMs: number;
  status: "unsaved";
  reason:
    | "replay_window_expired"
    | "session_replaced"
    | "session_cleared"
    | "session_discarded";
}

export interface ExpiredReplayWindow extends UnresolvedReplayWindow {
  reason: "replay_window_expired";
}

export interface WaitingReplayWindow {
  windowId: string;
  eventIds: string[];
  eventKinds: HighlightKind[];
  desiredStartMs: number;
  desiredEndMs: number;
  notBeforeMs: number;
  status: "waiting";
}

export interface ReplayAdvance {
  saveIntents: ReplaySaveIntent[];
  expired: ExpiredReplayWindow[];
  waiting?: WaitingReplayWindow[];
}

export interface ReplayFinalization extends ReplayAdvance {
  policy: ReplaySessionEndPolicy;
  waiting: WaitingReplayWindow[];
  unresolved: UnresolvedReplayWindow[];
}

export interface ReplaySessionTransition {
  unresolved: UnresolvedReplayWindow[];
}

interface PendingWindow {
  windowId: string;
  startMs: number;
  endMs: number;
  eventIds: string[];
  eventKinds: HighlightKind[];
}

const MAX_SEEN_EVENTS = 256;
const isTime = (value: number): boolean => Number.isSafeInteger(value) && value >= 0;

function validatePolicy(config: ReplayPolicy): void {
  const values = [
    config.preRollMs,
    config.postRollMs,
    config.replayBufferMs,
    config.safetyMarginMs,
    config.maxPendingWindows,
    config.maxEventChainLength
  ];
  if (!values.every(isTime) || config.preRollMs === 0 ||
      config.postRollMs === 0 || config.maxPendingWindows < 1 ||
      config.maxPendingWindows > 256 ||
      config.maxEventChainLength < 1 || config.maxEventChainLength > MAX_SEEN_EVENTS ||
      config.replayBufferMs <= config.safetyMarginMs ||
      config.preRollMs + config.postRollMs >
        config.replayBufferMs - config.safetyMarginMs) {
    throw new Error("Invalid replay policy: limits must fit the safe buffer and event bounds");
  }
}

/** No timers, filesystem, process, networking, or OBS dependency. */
export class ReplayClipPlanner {
  private readonly policy: ReplayPolicy;
  private epoch: number | null = null;
  private startedAtMs = 0;
  private lastObservedAtMs = -1;
  private nextId = 1;
  private windows: PendingWindow[] = [];
  private seenEvents = new Set<string>();
  private sessionClosed = false;
  private finalizationPolicy: ReplaySessionEndPolicy | null = null;
  private finalizedAtMs: number | null = null;

  constructor(policy: ReplayPolicy = DEFAULT_REPLAY_POLICY) {
    validatePolicy(policy);
    this.policy = { ...policy };
  }

  /** Explicit match boundary: pending clips from another match cannot leak in. */
  startSession(sessionEpoch: number, startedAtMs: number): ReplaySessionTransition {
    if (!isTime(sessionEpoch) || !isTime(startedAtMs)) {
      throw new Error("Invalid session identity/time");
    }
    const transition = this.reportUnresolved("session_replaced");
    this.epoch = sessionEpoch;
    this.startedAtMs = startedAtMs;
    this.lastObservedAtMs = -1;
    this.nextId = 1;
    this.windows = [];
    this.seenEvents.clear();
    this.sessionClosed = false;
    this.finalizationPolicy = null;
    this.finalizedAtMs = null;
    return transition;
  }

  clearSession(): ReplaySessionTransition {
    const transition = this.reportUnresolved("session_cleared");
    this.epoch = null;
    this.windows = [];
    this.seenEvents.clear();
    this.lastObservedAtMs = -1;
    this.sessionClosed = false;
    this.finalizationPolicy = null;
    this.finalizedAtMs = null;
    return transition;
  }

  pendingCount(): number {
    return this.windows.length;
  }

  observe(event: HighlightObservation, nowMs: number): ObserveResult {
    if (this.sessionClosed) {
      return { accepted: false, reason: "session_closed" };
    }
    if (this.epoch === null || event.sessionEpoch !== this.epoch) {
      return { accepted: false, reason: "session_unavailable" };
    }
    if (!isTime(nowMs) || !isTime(event.observedAtMs) ||
        event.observedAtMs < this.startedAtMs || event.observedAtMs > nowMs ||
        !/^[A-Za-z0-9:_-]{1,80}$/.test(event.eventId) ||
        event.source !== "gsi" || !isHighlightKind(event.kind)) {
      return { accepted: false, reason: "invalid_observation" };
    }
    if (!event.ownPlayerVerified) {
      return { accepted: false, reason: "unverified_player" };
    }
    if (this.seenEvents.has(event.eventId)) {
      return { accepted: false, reason: "duplicate_event" };
    }
    if (event.observedAtMs < this.lastObservedAtMs) {
      return { accepted: false, reason: "out_of_order" };
    }

    const startMs = Math.max(this.startedAtMs, event.observedAtMs - this.policy.preRollMs);
    const endMs = event.observedAtMs + this.policy.postRollMs;
    const safeSpanMs = this.policy.replayBufferMs - this.policy.safetyMarginMs;
    if (!Number.isSafeInteger(endMs) || nowMs - startMs > safeSpanMs) {
      return { accepted: false, reason: "replay_window_expired" };
    }
    if (this.seenEvents.size >= MAX_SEEN_EVENTS) {
      return { accepted: false, reason: "event_capacity" };
    }
    const overlapping = this.windows.filter(
      (window) => window.startMs <= endMs && window.endMs >= startMs
    );
    const mergedStart = Math.min(startMs, ...overlapping.map((window) => window.startMs));
    const mergedEnd = Math.max(endMs, ...overlapping.map((window) => window.endMs));
    const allFit = overlapping.length > 0 &&
      overlapping.reduce((count, window) => count + window.eventIds.length, 0) + 1 <=
        this.policy.maxEventChainLength &&
      mergedEnd - mergedStart <= safeSpanMs &&
      nowMs - mergedStart <= safeSpanMs;
    const mergeTarget = allFit ? null : [...overlapping].reverse().find((window) => {
      const candidateStart = Math.min(startMs, window.startMs);
      const candidateEnd = Math.max(endMs, window.endMs);
      return window.eventIds.length < this.policy.maxEventChainLength &&
        candidateEnd - candidateStart <= safeSpanMs &&
        nowMs - candidateStart <= safeSpanMs;
    });
    if (!allFit && !mergeTarget &&
        this.windows.length >= this.policy.maxPendingWindows) {
      return { accepted: false, reason: "queue_full" };
    }

    let windowId: string;
    if (allFit) {
      const first = overlapping[0];
      windowId = first.windowId;
      first.startMs = mergedStart;
      first.endMs = mergedEnd;
      for (const duplicate of overlapping.slice(1)) {
        first.eventIds.push(...duplicate.eventIds);
        first.eventKinds.push(...duplicate.eventKinds);
        this.windows = this.windows.filter((window) => window !== duplicate);
      }
      first.eventIds.push(event.eventId);
      first.eventKinds.push(event.kind);
    } else if (mergeTarget) {
      windowId = mergeTarget.windowId;
      mergeTarget.startMs = Math.min(startMs, mergeTarget.startMs);
      mergeTarget.endMs = Math.max(endMs, mergeTarget.endMs);
      mergeTarget.eventIds.push(event.eventId);
      mergeTarget.eventKinds.push(event.kind);
    } else {
      windowId = `clip-${this.epoch}-${this.nextId++}`;
      this.windows.push({
        windowId,
        startMs,
        endMs,
        eventIds: [event.eventId],
        eventKinds: [event.kind]
      });
    }

    this.windows.sort((a, b) => a.startMs - b.startMs);
    this.lastObservedAtMs = event.observedAtMs;
    this.seenEvents.add(event.eventId);
    return { accepted: true, windowId };
  }

  private reportUnresolved(
    reason: UnresolvedReplayWindow["reason"]
  ): ReplaySessionTransition {
    return {
      unresolved: this.windows.map((window) => this.unsavedWindow(window, reason))
    };
  }

  private unsavedWindow(
    window: PendingWindow,
    reason: UnresolvedReplayWindow["reason"]
  ): UnresolvedReplayWindow {
    return {
      windowId: window.windowId,
      eventIds: [...window.eventIds],
      eventKinds: [...window.eventKinds],
      desiredStartMs: window.startMs,
      desiredEndMs: window.endMs,
      status: "unsaved",
      reason
    };
  }

  private expiredWindow(window: PendingWindow): ExpiredReplayWindow {
    return {
      ...this.unsavedWindow(window, "replay_window_expired"),
      reason: "replay_window_expired"
    };
  }

  private waitingWindows(): WaitingReplayWindow[] {
    return this.windows.map((window): WaitingReplayWindow => ({
      windowId: window.windowId,
      eventIds: [...window.eventIds],
      eventKinds: [...window.eventKinds],
      desiredStartMs: window.startMs,
      desiredEndMs: window.endMs,
      notBeforeMs: window.endMs,
      status: "waiting"
    }));
  }

  /** Normal match end freezes admission and applies a selected old-epoch policy. */
  finalizeSession(
    policy: ReplaySessionEndPolicy,
    endedAtMs: number
  ): ReplayFinalization {
    if (this.epoch === null || this.sessionClosed) {
      throw new Error("No open replay session to finalize");
    }
    if (policy !== "wait" && policy !== "partial" && policy !== "discard") {
      throw new Error("Invalid replay session end policy");
    }
    if (!isTime(endedAtMs) || endedAtMs < this.startedAtMs ||
        this.lastObservedAtMs > endedAtMs) {
      throw new Error("Invalid session end time");
    }

    const sessionEpoch = this.epoch;
    this.sessionClosed = true;
    this.finalizationPolicy = policy;
    this.finalizedAtMs = endedAtMs;

    if (policy === "discard") {
      const unresolved = this.reportUnresolved("session_discarded").unresolved;
      this.windows = [];
      this.epoch = null;
      return { policy, saveIntents: [], waiting: [], expired: [], unresolved };
    }

    if (policy === "partial") {
      const saveIntents: ReplaySaveIntent[] = [];
      const expired: ExpiredReplayWindow[] = [];
      const safeSpanMs = this.policy.replayBufferMs - this.policy.safetyMarginMs;
      for (const window of this.windows) {
        if (endedAtMs - window.startMs > safeSpanMs) {
          expired.push(this.expiredWindow(window));
          continue;
        }
        const desiredEndMs = Math.min(window.endMs, endedAtMs);
        const isPartial = desiredEndMs < window.endMs;
        saveIntents.push({
          windowId: window.windowId,
          sessionEpoch,
          eventIds: [...window.eventIds],
          eventKinds: [...window.eventKinds],
          requestedAtMs: endedAtMs,
          desiredStartMs: window.startMs,
          desiredEndMs,
          ...(isPartial ? { plannedEndMs: window.endMs, partial: true } : {}),
          requiresOfflineTrim: true
        });
      }
      this.windows = [];
      this.epoch = null;
      return { policy, saveIntents, waiting: [], expired, unresolved: [] };
    }

    const advance = this.takeDue(endedAtMs);
    return {
      policy,
      saveIntents: advance.saveIntents,
      waiting: advance.waiting ?? [],
      expired: advance.expired,
      unresolved: []
    };
  }

  /**
   * Called by the OBS integration timer. Returning an intent does NOT prove
   * that OBS accepted/saved a clip. Only adapter receipts can report success.
   */
  takeDue(nowMs: number): ReplayAdvance {
    const result: ReplayAdvance = { saveIntents: [], expired: [] };
    if (this.epoch === null || !isTime(nowMs) ||
        (this.sessionClosed && this.finalizationPolicy !== "wait")) return result;
    if (this.sessionClosed && this.finalizedAtMs !== null && nowMs < this.finalizedAtMs) {
      result.waiting = this.waitingWindows();
      return result;
    }

    const stillPending: PendingWindow[] = [];
    const safeSpanMs = this.policy.replayBufferMs - this.policy.safetyMarginMs;
    for (const window of this.windows) {
      if (nowMs < window.endMs) {
        if (nowMs - window.startMs > safeSpanMs) {
          result.expired.push(this.expiredWindow(window));
        } else {
          stillPending.push(window);
        }
        continue;
      }
      if (nowMs - window.startMs > safeSpanMs) {
        result.expired.push(this.expiredWindow(window));
        continue;
      }
      result.saveIntents.push({
        windowId: window.windowId,
        sessionEpoch: this.epoch,
        eventIds: [...window.eventIds],
        eventKinds: [...window.eventKinds],
        requestedAtMs: nowMs,
        desiredStartMs: window.startMs,
        desiredEndMs: window.endMs,
        requiresOfflineTrim: true
      });
    }
    this.windows = stillPending;
    if (this.sessionClosed) {
      result.waiting = this.waitingWindows();
      if (this.windows.length === 0) this.epoch = null;
    }
    return result;
  }
}

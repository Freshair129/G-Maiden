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
}

export const DEFAULT_REPLAY_POLICY: Readonly<ReplayPolicy> = {
  preRollMs: 30_000,
  postRollMs: 15_000,
  replayBufferMs: 90_000,
  safetyMarginMs: 5_000,
  maxPendingWindows: 32
};

export type ObserveRejectReason =
  | "session_unavailable"
  | "invalid_observation"
  | "unverified_player"
  | "duplicate_event"
  | "out_of_order"
  | "replay_window_expired"
  | "queue_full";

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
  /** SaveReplayBuffer includes additional footage; trimming happens later. */
  requiresOfflineTrim: true;
}

export interface ExpiredReplayWindow {
  windowId: string;
  reason: "replay_window_expired";
}

export interface ReplayAdvance {
  saveIntents: ReplaySaveIntent[];
  expired: ExpiredReplayWindow[];
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
    config.maxPendingWindows
  ];
  if (!values.every(isTime) || config.preRollMs === 0 ||
      config.postRollMs === 0 || config.maxPendingWindows < 1 ||
      config.maxPendingWindows > 256 ||
      config.replayBufferMs <= config.safetyMarginMs ||
      config.preRollMs + config.postRollMs >
        config.replayBufferMs - config.safetyMarginMs) {
    throw new Error("Invalid replay policy: pre/post roll must fit the safe buffer");
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

  constructor(policy: ReplayPolicy = DEFAULT_REPLAY_POLICY) {
    validatePolicy(policy);
    this.policy = { ...policy };
  }

  /** Explicit match boundary: pending clips from another match cannot leak in. */
  startSession(sessionEpoch: number, startedAtMs: number): void {
    if (!isTime(sessionEpoch) || !isTime(startedAtMs)) {
      throw new Error("Invalid session identity/time");
    }
    this.epoch = sessionEpoch;
    this.startedAtMs = startedAtMs;
    this.lastObservedAtMs = -1;
    this.nextId = 1;
    this.windows = [];
    this.seenEvents.clear();
  }

  clearSession(): void {
    this.epoch = null;
    this.windows = [];
    this.seenEvents.clear();
    this.lastObservedAtMs = -1;
  }

  pendingCount(): number {
    return this.windows.length;
  }

  observe(event: HighlightObservation, nowMs: number): ObserveResult {
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
    const overlapping = this.windows.filter(
      (window) => window.startMs <= endMs && window.endMs >= startMs
    );
    const mergedStart = Math.min(startMs, ...overlapping.map((window) => window.startMs));
    const mergedEnd = Math.max(endMs, ...overlapping.map((window) => window.endMs));
    const canMerge = mergedEnd - mergedStart <= safeSpanMs &&
      nowMs - mergedStart <= safeSpanMs;
    if ((!canMerge || overlapping.length === 0) &&
        this.windows.length >= this.policy.maxPendingWindows) {
      return { accepted: false, reason: "queue_full" };
    }

    let windowId: string;
    if (overlapping.length && canMerge) {
      const first = overlapping[0];
      windowId = first.windowId;
      const ids = overlapping.flatMap((window) => window.eventIds);
      const kinds = overlapping.flatMap((window) => window.eventKinds);
      this.windows = this.windows.filter((window) => !overlapping.includes(window));
      this.windows.push({
        windowId,
        startMs: mergedStart,
        endMs: mergedEnd,
        eventIds: [...ids, event.eventId],
        eventKinds: [...kinds, event.kind]
      });
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
    if (this.seenEvents.size >= MAX_SEEN_EVENTS) {
      const oldest = this.seenEvents.values().next().value;
      if (oldest !== undefined) this.seenEvents.delete(oldest);
    }
    this.seenEvents.add(event.eventId);
    return { accepted: true, windowId };
  }

  /**
   * Called by the OBS integration timer. Returning an intent does NOT prove
   * that OBS accepted/saved a clip. Only adapter receipts can report success.
   */
  takeDue(nowMs: number): ReplayAdvance {
    const result: ReplayAdvance = { saveIntents: [], expired: [] };
    if (this.epoch === null || !isTime(nowMs)) return result;

    const stillPending: PendingWindow[] = [];
    const safeSpanMs = this.policy.replayBufferMs - this.policy.safetyMarginMs;
    for (const window of this.windows) {
      if (nowMs < window.endMs) {
        if (nowMs - window.startMs > safeSpanMs) {
          result.expired.push({
            windowId: window.windowId,
            reason: "replay_window_expired"
          });
        } else {
          stillPending.push(window);
        }
        continue;
      }
      if (nowMs - window.startMs > safeSpanMs) {
        result.expired.push({ windowId: window.windowId, reason: "replay_window_expired" });
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
    return result;
  }
}

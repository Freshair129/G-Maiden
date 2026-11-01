import { describe, expect, it } from "vitest";
import {
  DEFAULT_REPLAY_POLICY,
  ReplayClipPlanner,
  type HighlightKind,
  type HighlightObservation
} from "./clipPlanner";

function event(
  eventId: string,
  observedAtMs: number,
  overrides: Partial<HighlightObservation> = {}
): HighlightObservation {
  return {
    eventId,
    observedAtMs,
    sessionEpoch: 7,
    source: "gsi",
    kind: "double_kill",
    ownPlayerVerified: true,
    ...overrides
  };
}

describe("ReplayClipPlanner / CR-040 source-only contract", () => {
  it("defers SaveReplayBuffer until post-roll and retains pre-roll trim bounds", () => {
    const planner = new ReplayClipPlanner();
    planner.startSession(7, 1_000);
    expect(planner.observe(event("e1", 60_000), 60_000).accepted).toBe(true);
    expect(planner.takeDue(74_999).saveIntents).toHaveLength(0);

    const due = planner.takeDue(75_000);
    expect(due.expired).toHaveLength(0);
    expect(due.saveIntents).toEqual([{
      windowId: "clip-7-1",
      sessionEpoch: 7,
      eventIds: ["e1"],
      eventKinds: ["double_kill"],
      requestedAtMs: 75_000,
      desiredStartMs: 30_000,
      desiredEndMs: 75_000,
      requiresOfflineTrim: true
    }]);
    expect(planner.takeDue(75_001).saveIntents).toHaveLength(0);
  });

  it("clamps pre-roll to match start rather than fabricating pre-match video", () => {
    const planner = new ReplayClipPlanner();
    planner.startSession(7, 50_000);
    planner.observe(event("early", 53_000), 53_000);
    expect(planner.takeDue(68_000).saveIntents[0]?.desiredStartMs).toBe(50_000);
  });

  it("rejects an unverified personal GSI event and unsafe event types", () => {
    const planner = new ReplayClipPlanner();
    planner.startSession(7, 0);
    expect(planner.observe(event("e1", 1_000, { ownPlayerVerified: false }), 1_000))
      .toEqual({ accepted: false, reason: "unverified_player" });
    expect(planner.observe(event("e2", 2_000, { kind: "match_start" as HighlightKind }), 2_000))
      .toEqual({ accepted: false, reason: "invalid_observation" });
    expect(planner.observe(event("steam/secret", 2_000), 2_000))
      .toEqual({ accepted: false, reason: "invalid_observation" });
    expect(planner.pendingCount()).toBe(0);
  });

  it("fails closed on wrong session epoch, out-of-order timestamps and future frames", () => {
    const planner = new ReplayClipPlanner();
    planner.startSession(7, 0);
    expect(planner.observe(event("wrong", 10_000, { sessionEpoch: 8 }), 10_000))
      .toEqual({ accepted: false, reason: "session_unavailable" });
    expect(planner.observe(event("e1", 10_000), 10_000).accepted).toBe(true);
    expect(planner.observe(event("e2", 9_999), 10_000))
      .toEqual({ accepted: false, reason: "out_of_order" });
    expect(planner.observe(event("future", 20_001), 20_000))
      .toEqual({ accepted: false, reason: "invalid_observation" });
  });

  it("deduplicates replay events even when replay scheduling is requested twice", () => {
    const planner = new ReplayClipPlanner();
    planner.startSession(7, 0);
    expect(planner.observe(event("same", 50_000), 50_000).accepted).toBe(true);
    expect(planner.observe(event("same", 50_000), 51_000))
      .toEqual({ accepted: false, reason: "duplicate_event" });
    expect(planner.pendingCount()).toBe(1);
  });

  it("combines simultaneous kill and multikill observations into one save window", () => {
    const planner = new ReplayClipPlanner();
    planner.startSession(7, 0);
    const a = planner.observe(event("kill-1", 100_000, { kind: "kill" }), 100_000);
    const b = planner.observe(event("double", 100_000), 100_000);
    const c = planner.observe(event("triple", 108_000, { kind: "triple_kill" }), 108_000);
    expect(a).toEqual({ accepted: true, windowId: "clip-7-1" });
    expect(b).toEqual(a);
    expect(c).toEqual(a);
    expect(planner.pendingCount()).toBe(1);
    expect(planner.takeDue(123_000).saveIntents[0]).toMatchObject({
      eventIds: ["kill-1", "double", "triple"],
      eventKinds: ["kill", "double_kill", "triple_kill"],
      desiredStartMs: 70_000,
      desiredEndMs: 123_000
    });
  });

  it("splits very long overlapping fights before the oldest replay frames roll off", () => {
    const planner = new ReplayClipPlanner();
    planner.startSession(7, 0);
    planner.observe(event("a", 100_000), 100_000);
    planner.observe(event("b", 130_000), 130_000);
    const third = planner.observe(event("c", 152_000), 152_000);
    expect(third).toEqual({ accepted: true, windowId: "clip-7-2" });
    expect(planner.pendingCount()).toBe(2);
    const first = planner.takeDue(152_000);
    expect(first.saveIntents).toHaveLength(1);
    expect(first.saveIntents[0].eventIds).toEqual(["a", "b"]);
    expect(planner.takeDue(167_000).saveIntents[0].eventIds).toEqual(["c"]);
  });

  it("expires old windows explicitly rather than submitting an impossible save", () => {
    const planner = new ReplayClipPlanner();
    planner.startSession(7, 0);
    planner.observe(event("old", 100_000), 100_000);
    const late = planner.takeDue(200_000);
    expect(late.saveIntents).toEqual([]);
    expect(late.expired).toEqual([{
      windowId: "clip-7-1",
      reason: "replay_window_expired"
    }]);
  });

  it("rejects stale delayed observations outside the safe buffer window", () => {
    const planner = new ReplayClipPlanner();
    planner.startSession(7, 0);
    expect(planner.observe(event("old", 100_000), 200_000))
      .toEqual({ accepted: false, reason: "replay_window_expired" });
  });

  it("bounds pending intents instead of silently dropping one", () => {
    const planner = new ReplayClipPlanner({ ...DEFAULT_REPLAY_POLICY, maxPendingWindows: 1 });
    planner.startSession(7, 0);
    planner.observe(event("e1", 100_000), 100_000);
    expect(planner.observe(event("e2", 200_000), 200_000))
      .toEqual({ accepted: false, reason: "queue_full" });
  });

  it("clears every old intent and dedup key when the match changes", () => {
    const planner = new ReplayClipPlanner();
    planner.startSession(7, 0);
    planner.observe(event("e1", 100_000), 100_000);
    planner.startSession(8, 101_000);
    expect(planner.takeDue(115_000).saveIntents).toEqual([]);
    expect(planner.observe(event("e1", 110_000), 110_000))
      .toEqual({ accepted: false, reason: "session_unavailable" });
    expect(planner.observe(event("e1", 110_000, { sessionEpoch: 8 }), 110_000))
      .toEqual({ accepted: true, windowId: "clip-8-1" });
    planner.clearSession();
    expect(planner.takeDue(125_000).saveIntents).toEqual([]);
  });

  it("rejects policy settings that cannot retain the requested trim interval", () => {
    expect(() => new ReplayClipPlanner({ ...DEFAULT_REPLAY_POLICY, replayBufferMs: 44_000 }))
      .toThrow(/Invalid replay policy/);
    expect(() => new ReplayClipPlanner({ ...DEFAULT_REPLAY_POLICY, maxPendingWindows: 0 }))
      .toThrow(/Invalid replay policy/);
  });
});

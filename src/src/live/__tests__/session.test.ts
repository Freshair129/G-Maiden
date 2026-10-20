import { describe, expect, it } from "vitest";
import { allowsSessionLifecycleAdvance, sessionEpochRelation } from "../session";

describe("sessionEpochRelation", () => {
  it("treats the first real session as new while ignoring the no-session epoch", () => {
    expect(sessionEpochRelation(0, null)).toBe("unknown");
    expect(sessionEpochRelation(1, null)).toBe("new");
  });

  it("distinguishes reconnects from a new session", () => {
    expect(sessionEpochRelation(4, 4)).toBe("same");
    expect(sessionEpochRelation(5, 4)).toBe("new");
  });

  it("rejects an event from an older session", () => {
    expect(sessionEpochRelation(3, 4)).toBe("stale");
  });

  it("ignores malformed and unsafe epochs", () => {
    expect(sessionEpochRelation(undefined, 4)).toBe("unknown");
    expect(sessionEpochRelation(-1, 4)).toBe("unknown");
    expect(sessionEpochRelation(Number.MAX_SAFE_INTEGER + 1, 4)).toBe("unknown");
  });
});

describe("allowsSessionLifecycleAdvance", () => {
  it("does not let a late live event resurrect an ended epoch", () => {
    expect(allowsSessionLifecycleAdvance("end", "live", "42", "42")).toBe(false);
    expect(allowsSessionLifecycleAdvance("end", "end", "42", "42")).toBe(true);
  });

  it("allows abandon recovery only for the same trusted match ID", () => {
    expect(allowsSessionLifecycleAdvance("abandon", "live", "42", "42")).toBe(true);
    expect(allowsSessionLifecycleAdvance("abandon", "live", "42", "43")).toBe(false);
    expect(allowsSessionLifecycleAdvance("abandon", "live", null, null)).toBe(false);
  });
});

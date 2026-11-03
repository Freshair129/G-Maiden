import { describe, expect, it } from "vitest";
import {
  peerSkillPresentation,
  type PeerSkillEvidence,
  type PeerSkillPresentationReason,
} from "../partyModel";

const visibility = (input: unknown) => peerSkillPresentation(input);

const eligible: PeerSkillEvidence = {
  skills: ["ability_1", "ability_2"],
  skillShareConsent: true,
  verifiedFriend: true,
  sameMatch: true,
  sameTeam: true,
  sourceAttributionVerified: true,
  partyStatus: "connected",
  sampleAgeMsAtObservation: 500,
  observedAtMonotonicMs: 1_000,
  nowMonotonicMs: 1_500,
};

describe("peer skill presentation guard", () => {
  const authorizationCases: Array<[Partial<PeerSkillEvidence>, PeerSkillPresentationReason]> = [
    [{ skillShareConsent: false }, "consent_required"],
    [{ verifiedFriend: false }, "friend_unverified"],
    [{ sameMatch: false }, "scope_unverified"],
    [{ sameTeam: false }, "scope_unverified"],
    [{ sourceAttributionVerified: false }, "source_unverified"],
  ];

  it.each(authorizationCases)("withholds skills when an authorization gate is not met: %o", (change, reason) => {
    expect(visibility({ ...eligible, ...change })).toEqual({
      state: "unknown", skills: null, reason, ageMs: null,
    });
  });

  const invalidCases: Array<[Partial<PeerSkillEvidence>, PeerSkillPresentationReason]> = [
    [{ skills: [] }, "invalid_sample"],
    [{ skills: ["ability_1", "  "] }, "invalid_sample"],
    [{ sampleAgeMsAtObservation: -1 }, "invalid_sample"],
    [{ sampleAgeMsAtObservation: Number.NaN }, "invalid_sample"],
    [{ sampleAgeMsAtObservation: Number.POSITIVE_INFINITY }, "invalid_sample"],
    [{ sampleAgeMsAtObservation: null as unknown as number }, "invalid_sample"],
    [{ sampleAgeMsAtObservation: "500" as unknown as number }, "invalid_sample"],
    [{ observedAtMonotonicMs: -1 }, "invalid_clock"],
    [{ observedAtMonotonicMs: Number.NaN }, "invalid_clock"],
    [{ observedAtMonotonicMs: null as unknown as number }, "invalid_clock"],
    [{ observedAtMonotonicMs: "1000" as unknown as number }, "invalid_clock"],
    [{ observedAtMonotonicMs: Number.POSITIVE_INFINITY }, "invalid_clock"],
    [{ observedAtMonotonicMs: Number.MAX_SAFE_INTEGER + 1 }, "invalid_clock"],
    [{ nowMonotonicMs: Number.MAX_SAFE_INTEGER + 1 }, "invalid_clock"],
    [{ observedAtMonotonicMs: 1e20, nowMonotonicMs: 1e20 }, "invalid_clock"],
    [{ nowMonotonicMs: 1e20 }, "invalid_clock"],
    [{ nowMonotonicMs: Number.NaN }, "invalid_clock"],
    [{ nowMonotonicMs: Number.POSITIVE_INFINITY }, "invalid_clock"],
    [{ nowMonotonicMs: -1 }, "invalid_clock"],
    [{ nowMonotonicMs: null as unknown as number }, "invalid_clock"],
    [{ nowMonotonicMs: "1500" as unknown as number }, "invalid_clock"],
    [{ nowMonotonicMs: 999 }, "invalid_clock"],
  ];

  it.each(invalidCases)("withholds malformed or unverifiable sample data: %o", (change, reason) => {
    expect(visibility({ ...eligible, ...change })).toMatchObject({
      state: "unknown", skills: null, reason,
    });
  });

  it("does not infer consent when the explicit skill-consent field is absent", () => {
    const withoutConsent: Partial<PeerSkillEvidence> = { ...eligible };
    delete withoutConsent.skillShareConsent;
    expect(visibility(withoutConsent as PeerSkillEvidence)).toEqual({
      state: "unknown", skills: null, reason: "consent_required", ageMs: null,
    });
  });

  it("returns unknown for a null evidence envelope instead of throwing", () => {
    for (const envelope of [null, undefined, [], 0, "invalid"]) {
      expect(() => visibility(envelope)).not.toThrow();
      expect(visibility(envelope)).toEqual({
        state: "unknown", skills: null, reason: "invalid_evidence", ageMs: null,
      });
    }
  });

  it("does not inherit consent from a prototype or invoke a consent getter", () => {
    const inherited = { ...eligible } as Partial<PeerSkillEvidence>;
    delete inherited.skillShareConsent;
    Object.setPrototypeOf(inherited, { skillShareConsent: true });
    expect(visibility(inherited as PeerSkillEvidence)).toMatchObject({
      state: "unknown", skills: null, reason: "consent_required",
    });

    const getter = { ...eligible };
    Object.defineProperty(getter, "skillShareConsent", { get: () => { throw new Error("untrusted getter"); } });
    expect(() => visibility(getter)).not.toThrow();
    expect(visibility(getter)).toMatchObject({ state: "unknown", skills: null });
  });

  it("rejects sparse skill arrays instead of returning undefined entries", () => {
    expect(visibility({ ...eligible, skills: Array(1) })).toEqual({
      state: "unknown", skills: null, reason: "invalid_sample", ageMs: null,
    });
  });

  it.each([null, [""], [" a"], ["a "], ["a", null], ["a", 3], "ability_1"])(
    "rejects malformed skill lists: %o",
    (skills) => {
      expect(visibility({ ...eligible, skills } as unknown as PeerSkillEvidence)).toMatchObject({
        state: "unknown", skills: null, reason: "invalid_sample",
      });
    },
  );

  it.each([
    ["skillShareConsent", false, "consent_required"],
    ["skillShareConsent", undefined, "consent_required"],
    ["skillShareConsent", null, "consent_required"],
    ["skillShareConsent", 1, "consent_required"],
    ["skillShareConsent", "true", "consent_required"],
    ["verifiedFriend", false, "friend_unverified"],
    ["verifiedFriend", undefined, "friend_unverified"],
    ["verifiedFriend", null, "friend_unverified"],
    ["verifiedFriend", 1, "friend_unverified"],
    ["verifiedFriend", "true", "friend_unverified"],
    ["sameMatch", false, "scope_unverified"],
    ["sameMatch", undefined, "scope_unverified"],
    ["sameMatch", null, "scope_unverified"],
    ["sameMatch", 1, "scope_unverified"],
    ["sameMatch", "true", "scope_unverified"],
    ["sameTeam", false, "scope_unverified"],
    ["sameTeam", undefined, "scope_unverified"],
    ["sameTeam", null, "scope_unverified"],
    ["sameTeam", 1, "scope_unverified"],
    ["sameTeam", "true", "scope_unverified"],
    ["sourceAttributionVerified", false, "source_unverified"],
    ["sourceAttributionVerified", undefined, "source_unverified"],
    ["sourceAttributionVerified", null, "source_unverified"],
    ["sourceAttributionVerified", 1, "source_unverified"],
    ["sourceAttributionVerified", "true", "source_unverified"],
  ] as const)("requires literal true for %s=%o", (key, value, reason) => {
    expect(visibility({ ...eligible, [key]: value } as unknown as PeerSkillEvidence)).toMatchObject({
      state: "unknown", skills: null, reason,
    });
  });

  it.each(["idle", "connecting", "reconnecting", "closed", "error", undefined, "bogus"] as const)(
    "withholds a fresh sample when the party status is %s",
    (partyStatus) => {
      expect(visibility({ ...eligible, partyStatus })).toEqual({
        state: "unknown", skills: null, reason: "party_unavailable", ageMs: null,
      });
    },
  );

  it("shows only a fresh, authorized peer skill snapshot and copies the values", () => {
    const result = visibility(eligible);
    expect(result).toEqual({ state: "visible", skills: ["ability_1", "ability_2"], ageMs: 1_000 });
    if (result.state === "visible") expect(result.skills).not.toBe(eligible.skills);
  });

  it("treats exactly 2000ms as fresh and older samples as unknown", () => {
    expect(visibility({ ...eligible, sampleAgeMsAtObservation: 1_500 })).toMatchObject({
      state: "visible", ageMs: 2_000,
    });
    expect(visibility({ ...eligible, sampleAgeMsAtObservation: 1_501 })).toEqual({
      state: "unknown", skills: null, reason: "stale", ageMs: 2_001,
    });
  });

  it("adds sample age before considering large finite monotonic readings", () => {
    expect(visibility({
      ...eligible,
      sampleAgeMsAtObservation: 2_001,
      observedAtMonotonicMs: 1e20,
      nowMonotonicMs: 1e20,
    })).toEqual({ state: "unknown", skills: null, reason: "stale", ageMs: 2_001 });
  });
});

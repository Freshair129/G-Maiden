import { describe, expect, it } from "vitest";
import {
  peerSkillPresentation,
  type PeerSkillEvidence,
  type PeerSkillPresentationReason,
} from "../partyModel";

const visibility = (input: PeerSkillEvidence) => peerSkillPresentation(input);

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
    [{ observedAtMonotonicMs: null }, "invalid_clock"],
    [{ observedAtMonotonicMs: Number.POSITIVE_INFINITY }, "invalid_clock"],
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

  it.each(["idle", "reconnecting", "closed", "error"] as const)(
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
});

import { describe, expect, it } from "vitest";
import { generateGid } from "../../gid";

const gid = generateGid({ generation: "P", registeredAt: Date.UTC(2026, 0, 1), cohortSeq: 1 });
const self = { gid, displayName: "Maiden" };
const state = { self, settings: { presenceVisible: false, allowFriendRequests: true, allowInvites: true }, bindingRevision: 0, friends: [], requests: [], invites: [], blocked: [], serverNowMs: 1000, relayOrigin: null };
const model = await import("../friendsModel").catch(() => null);

describe("safe Friends projection", () => {
  it("provides a strict account projection parser", () => {
    expect(model?.parseSocialState(state)).toEqual(state);
  });
  it("rejects private fields at every level and invalid GIDs", () => {
    expect(model).not.toBeNull();
    expect(model?.parseSocialState({ ...state, email: "private" })).toBeNull();
    expect(model?.parseSocialState({ ...state, self: { ...self, userId: "private" } })).toBeNull();
    expect(model?.parseSocialState({ ...state, self: { ...self, gid: "G-invalid" } })).toBeNull();
  });
  it("accepts bounded maximum synthetic collections and rejects over-cap state", () => {
    expect(model).not.toBeNull();
    const friends = Array.from({ length: 200 }, (_, i) => ({ gid: generateGid({ generation: "P", registeredAt: Date.UTC(2026, 0, 1), cohortSeq: i + 2 }), displayName: "Friend", online: true, onlineForMs: 60000 }));
    expect(model?.parseSocialState({ ...state, friends })).not.toBeNull();
    expect(model?.parseSocialState({ ...state, friends: [...friends, friends[0]] })).toBeNull();
    expect(model?.parseSocialState({ ...state, friends: [{ ...friends[0], onlineForMs: 60001 }] })).toBeNull();
    expect(model?.parseSocialState({ ...state, friends: [{ ...friends[0], online: false }] })).toBeNull();
  });
});

it("accepts multiple ordinary requests without interpreting their array index as an invite flag", () => {
  const requests = [1, 2].map((n) => ({ id: `${n}`.repeat(8) + "-1111-4111-8111-111111111111", person: self, direction: "incoming", expiresAtMs: 2000 }));
  expect(model?.parseSocialState({ ...state, requests })).not.toBeNull();
});

it("rejects private fields nested in all collection projections and settings", () => {
  const friend = { ...self, online: false, onlineForMs: 0 };
  for (const invalid of [
    { ...state, settings: { ...state.settings, accountId: "private" } },
    { ...state, friends: [{ ...friend, steamId: "private" }] },
    { ...state, blocked: [{ ...self, phone: "private" }] },
    { ...state, requests: [{ id: "11111111-1111-4111-8111-111111111111", person: { ...self, email: "private" }, direction: "incoming", expiresAtMs: 2000 }] },
  ]) expect(model?.parseSocialState(invalid)).toBeNull();
});

it("validates the maximum 50 requests, 100 direction-bounded invites, and 500 blocks", () => {
  const people = Array.from({ length: 500 }, (_, i) => ({ gid: generateGid({ generation: "P", registeredAt: Date.UTC(2026, 0, 1), cohortSeq: i + 2 }), displayName: "Synthetic" }));
  const requests = Array.from({ length: 50 }, (_, i) => ({ id: `${(i + 1).toString(16).padStart(8, "0")}-1111-4111-8111-111111111111`, person: people[i], direction: "incoming", expiresAtMs: 2000 }));
  const invites = Array.from({ length: 100 }, (_, i) => ({ id: `${(i + 1).toString(16).padStart(8, "0")}-1111-4111-8111-111111111111`, person: people[i], direction: i < 50 ? "incoming" : "outgoing", status: "pending", expiresAtMs: 2000 }));
  expect(model?.parseSocialState({ ...state, requests, invites, blocked: people })).not.toBeNull();
  expect(model?.parseSocialState({ ...state, invites: invites.map((x) => ({ ...x, direction: "incoming" })) })).toBeNull();
  expect(model?.parseSocialState({ ...state, blocked: [...people, self] })).toBeNull();
});

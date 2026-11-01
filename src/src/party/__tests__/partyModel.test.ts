import { describe, expect, it } from "vitest";
import {
  emptyPartyView,
  memberPresentation,
  parsePartyView,
  validatePartyConnection,
} from "../partyModel";

const selfId = "1".repeat(32);
const otherId = "2".repeat(32);
const roomId = "3".repeat(32);
const invite = `GMP1.${roomId}.${"a".repeat(64)}`;

const stats = {
  hero: "npc_dota_hero_crystal_maiden",
  level: 14,
  hp: 612,
  maxHp: 1200,
  manaPercent: 41,
  alive: true,
  respawnSeconds: 0,
};

const liveMember = {
  memberId: otherId,
  displayName: "เพื่อน",
  isOwner: false,
  state: "live" as const,
  ageMs: 100,
  sample: stats,
};

const connected = {
  relayUrl: "https://relay.example", roomGeneration: 1,
  status: "connected" as const,
  roomId,
  selfId,
  ownerId: selfId,
  invite,
  expiresInMs: 120000,
  error: null,
  members: [liveMember],
};

describe("G-Party connection admission", () => {
  it("requires fresh explicit consent and produces only the allowed IPC fields", () => {
    const values = { relayUrl: "https://relay.example/", displayName: "  เมเดน  ", invite: null, consent: true };
    expect(validatePartyConnection({ ...values, consent: false }).ok).toBe(false);
    expect(validatePartyConnection(values)).toEqual({
      ok: true,
      value: { relayUrl: "https://relay.example", displayName: "เมเดน", invite: null, consent: true },
    });
  });

  it.each([
    "http://relay.example", "http://localhost:8787", "http://127.1:8787",
    "http://2130706433:8787", "http://127.000.000.001:8787",
    "https://user:secret@relay.example", "https://relay.example/path",
    "https://relay.example?invite=secret", "https://relay.example#secret",
    "file:///tmp/relay", "javascript:alert(1)",
  ])("rejects unsafe relay origin %s", (relayUrl) => {
    expect(validatePartyConnection({ relayUrl, displayName: "เพื่อน", invite: null, consent: true }).ok).toBe(false);
  });

  it.each(["http://127.0.0.1:8787", "http://[::1]:8787", "https://relay.example"]) (
    "accepts the approved relay origin %s", (relayUrl) => {
      expect(validatePartyConnection({ relayUrl, displayName: "เพื่อน", invite: null, consent: true }).ok).toBe(true);
    },
  );

  it("validates names by Unicode code points and refuses malformed invitations", () => {
    const values = { relayUrl: "https://relay.example", displayName: "🙂".repeat(32), invite, consent: true };
    expect(validatePartyConnection(values).ok).toBe(true);
    expect(validatePartyConnection({ ...values, displayName: "🙂".repeat(33) }).ok).toBe(false);
    expect(validatePartyConnection({ ...values, displayName: "a\u0000b" }).ok).toBe(false);
    expect(validatePartyConnection({ ...values, invite: "not-an-invite" }).ok).toBe(false);
    expect(validatePartyConnection({ ...values, invite: "" }).ok).toBe(false);
  });

  it("rejects unpaired UTF-16 surrogates while accepting Thai and non-BMP characters", () => {
    const values = { relayUrl: "https://relay.example", displayName: "เพื่อน🙂", invite: null, consent: true };
    expect(validatePartyConnection(values).ok).toBe(true);
    expect(validatePartyConnection({ ...values, displayName: "ชื่อ\uD800" }).ok).toBe(false);
    expect(validatePartyConnection({ ...values, displayName: "ชื่อ\uDC00" }).ok).toBe(false);
  });
});

describe("G-Party snapshot validation and freshness", () => {
  it("accepts only the explicit IPC view and never a member token or raw scope", () => {
    expect(parsePartyView(connected)).toEqual(connected);
    expect(parsePartyView({ ...connected, memberToken: "secret" })).toBeNull();
    expect(parsePartyView({ ...connected, members: [{ ...liveMember, scope: { team: "radiant" } }] })).toBeNull();
    expect(parsePartyView({ ...connected, members: Array.from({ length: 6 }, () => liveMember) })).toBeNull();
  });

  it("rejects invalid UTF-16 in an IPC name without rejecting Thai or valid astral characters", () => {
    expect(parsePartyView({ ...connected, members: [{ ...liveMember, displayName: "เพื่อน🙂" }] })).not.toBeNull();
    expect(parsePartyView({ ...connected, members: [{ ...liveMember, displayName: "ชื่อ\uD800" }] })).toBeNull();
    expect(parsePartyView({ ...connected, members: [{ ...liveMember, displayName: "ชื่อ\uDC00" }] })).toBeNull();
  });

  it.each([
    { hp: -1 }, { hp: 1201 }, { maxHp: 0 }, { manaPercent: 101 },
    { level: 0 }, { level: 31 }, { alive: "true" }, { respawnSeconds: 601 },
    { hero: "unknown" }, { hp: Number.NaN }, { maxHp: 2.5 },
  ])("refuses invalid stats %o", (invalid) => {
    expect(parsePartyView({
      ...connected,
      members: [{ ...liveMember, sample: { ...stats, ...invalid } }],
    })).toBeNull();
  });

  it("shows a value at 2000ms, then hides it without another native response", () => {
    expect(memberPresentation(liveMember, connected.status, 1900).sample).toEqual(stats);
    expect(memberPresentation(liveMember, connected.status, 1901)).toMatchObject({
      sample: null, state: "stale", ageMs: 2001,
    });
  });

  it("withholds mismatched, waiting and disconnected values", () => {
    expect(memberPresentation({ ...liveMember, state: "different_match", sample: null, ageMs: null }, "connected", 0))
      .toMatchObject({ sample: null, state: "different_match" });
    expect(memberPresentation({ ...liveMember, state: "waiting", sample: null, ageMs: null }, "connected", 0).sample).toBeNull();
    expect(memberPresentation(liveMember, "reconnecting", 0).sample).toBeNull();
    expect(memberPresentation(liveMember, "error", 0).sample).toBeNull();
  });

  it("does not infer alive from a zero respawn timer", () => {
    const dead = { ...liveMember, sample: { ...stats, alive: false, hp: 0, respawnSeconds: 0 } };
    expect(memberPresentation(dead, "connected", 1000).sample?.alive).toBe(false);
  });

  it("starts with no party, no invite and no invented roster", () => {
    expect(emptyPartyView()).toEqual({
      status: "idle", relayUrl: null, roomGeneration: null, roomId: null, selfId: null, ownerId: null,
      invite: null, expiresInMs: null, error: null, members: [],
    });
  });
});

it("requires authoritative relay and room generation for connected social scope", () => {
  expect(parsePartyView({ ...connected, relayUrl: "https://relay.example", roomGeneration: 1 })).not.toBeNull();
  expect(parsePartyView({ ...connected, relayUrl: "https://relay.example", roomGeneration: 0 })).toBeNull();
});

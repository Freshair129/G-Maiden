import { validateGid } from "../gid";
import type { Session } from "@supabase/supabase-js";

export const SOCIAL_POLL_MS = 15_000;
export const SOCIAL_HEARTBEAT_MS = 20_000;
export const SOCIAL_LEASE_MS = 60_000;
export type SocialPerson = { gid: string; displayName: string };
export type SocialSettings = { presenceVisible: boolean; allowFriendRequests: boolean; allowInvites: boolean };
export type SocialFriend = SocialPerson & { online: boolean; onlineForMs: number };
export type SocialRequest = { id: string; person: SocialPerson; direction: "incoming" | "outgoing"; expiresAtMs: number };
export type SocialInvite = SocialRequest & { status: "pending" | "accepted" };
export type SocialState = { self: SocialPerson; settings: SocialSettings; bindingRevision: number; friends: SocialFriend[]; requests: SocialRequest[]; invites: SocialInvite[]; blocked: SocialPerson[]; serverNowMs: number; relayOrigin: string | null };
export type SocialChallenge = { challenge: string; expiresAtMs: number; relayOrigin: string };
export type SocialProof = { proof: string };
export type SocialBinding = { memberId: string; person: SocialPerson; expiresAtMs: number };
export type SocialRoster = { roomId: string; generation: number; bindings: SocialBinding[]; serverNowMs: number };
export type SocialJoin = { ticket: string; relayOrigin: string; roomId: string; expiresAtMs: number };
export type SocialAction =
  | { action: "state" | "heartbeat" | "unlink" }
  | ({ action: "settings" } & SocialSettings)
  | { action: "request" | "remove" | "block" | "unblock"; gid: string }
  | { action: "request_accept" | "request_decline" | "request_cancel"; requestId: string }
  | { action: "invite_decline" | "invite_revoke"; inviteId: string }
  | { action: "invite_accept"; inviteId: string; consent: true }
  | { action: "challenge"; purpose: "link" | "roster" | "invite"; recipientGid: string | null; bindingRevision: number | null }
  | { action: "link"; proof: string; bindingRevision: number; consent: boolean }
  | { action: "roster" | "invite"; proof: string };

export function exact(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length && Object.keys(value).every((key) => keys.includes(key));
}
const int = (v: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max;
export const socialGid = (v: unknown): v is string => typeof v === "string" && v.length <= 12 && v === v.trim().toUpperCase() && validateGid(v);
const id = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{32}$/.test(v);
const uuid = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);
const opaque = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
const proof = (v: unknown): v is string => typeof v === "string" && v.length <= 4096 && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(v);
export function socialOrigin(v: unknown): v is string {
  if (typeof v !== "string") return false;
  try { const u = new URL(v); return u.protocol === "https:" && u.origin === v && !u.username && !u.password; } catch { return false; }
}
const name = (v: unknown): v is string => typeof v === "string" && v.trim() === v && [...v].length >= 1 && [...v].length <= 32 && !/\p{Cc}|[\uD800-\uDFFF]/u.test(v);
const person = (v: unknown): v is SocialPerson => exact(v, ["gid", "displayName"]) && socialGid(v.gid) && name(v.displayName);
const settings = (v: unknown): v is SocialSettings => exact(v, ["presenceVisible", "allowFriendRequests", "allowInvites"]) && Object.values(v).every((x) => typeof x === "boolean");
const request = (v: unknown, invite = false): boolean => exact(v, invite ? ["id", "person", "direction", "expiresAtMs", "status"] : ["id", "person", "direction", "expiresAtMs"])
  && uuid(v.id) && person(v.person) && ["incoming", "outgoing"].includes(v.direction as string) && int(v.expiresAtMs) && (!invite || ["pending", "accepted"].includes(v.status as string));
function collection(v: unknown, max: number, check: (x: unknown) => boolean, key: string): boolean {
  return Array.isArray(v) && v.length <= max && v.every(check) && new Set(v.map((x) => x[key])).size === v.length;
}
export function parseSocialState(v: unknown): SocialState | null {
  if (!exact(v, ["self", "settings", "bindingRevision", "friends", "requests", "invites", "blocked", "serverNowMs", "relayOrigin"]) || !person(v.self) || !settings(v.settings) || !int(v.bindingRevision) || !int(v.serverNowMs) || !(v.relayOrigin === null || socialOrigin(v.relayOrigin))) return null;
  const friend = (x: unknown) => exact(x, ["gid", "displayName", "online", "onlineForMs"]) && person({ gid: x.gid, displayName: x.displayName }) && typeof x.online === "boolean" && int(x.onlineForMs, 0, SOCIAL_LEASE_MS) && (x.online || x.onlineForMs === 0);
  if (!collection(v.friends, 200, friend, "gid") || !collection(v.blocked, 500, person, "gid") || !collection(v.requests, 50, (x) => request(x), "id") || !collection(v.invites, 100, (x) => request(x, true), "id")) return null;
  const invites = v.invites as SocialInvite[];
  if (invites.filter((x) => x.direction === "incoming").length > 50 || invites.filter((x) => x.direction === "outgoing").length > 50) return null;
  return v as unknown as SocialState;
}
export function parseSocialRoster(v: unknown): SocialRoster | null {
  if (!exact(v, ["roomId", "generation", "bindings", "serverNowMs"]) || !id(v.roomId) || !int(v.generation, 1) || !int(v.serverNowMs)
    || !collection(v.bindings, 5, (x) => exact(x, ["memberId", "person", "expiresAtMs"]) && id(x.memberId) && person(x.person) && int(x.expiresAtMs), "memberId")) return null;
  if ((v.bindings as SocialBinding[]).some((binding) => binding.expiresAtMs - (v.serverNowMs as number) > SOCIAL_LEASE_MS)) return null;
  return v as unknown as SocialRoster;
}
export function parseSocialResult(action: SocialAction, v: unknown): unknown | null {
  if (action.action === "state") return parseSocialState(v);
  if (action.action === "roster") return parseSocialRoster(v);
  if (action.action === "challenge") return exact(v, ["challenge", "expiresAtMs", "relayOrigin"]) && opaque(v.challenge) && int(v.expiresAtMs) && socialOrigin(v.relayOrigin) ? v : null;
  if (action.action === "invite_accept") return exact(v, ["ticket", "relayOrigin", "roomId", "expiresAtMs"]) && opaque(v.ticket) && socialOrigin(v.relayOrigin) && id(v.roomId) && int(v.expiresAtMs) ? v : null;
  return exact(v, ["ok"]) && v.ok === true ? v : null;
}
export function validSocialAction(v: SocialAction): boolean {
  switch (v.action) {
    case "state": case "heartbeat": case "unlink": return exact(v, ["action"]);
    case "settings": return exact(v, ["action", "presenceVisible", "allowFriendRequests", "allowInvites"]) && settings({ presenceVisible: v.presenceVisible, allowFriendRequests: v.allowFriendRequests, allowInvites: v.allowInvites });
    case "request": case "remove": case "block": case "unblock": return exact(v, ["action", "gid"]) && socialGid(v.gid);
    case "request_accept": case "request_decline": case "request_cancel": return exact(v, ["action", "requestId"]) && uuid(v.requestId);
    case "invite_decline": case "invite_revoke": return exact(v, ["action", "inviteId"]) && uuid(v.inviteId);
    case "invite_accept": return exact(v, ["action", "inviteId", "consent"]) && uuid(v.inviteId) && v.consent === true;
    case "challenge": return exact(v, ["action", "purpose", "recipientGid", "bindingRevision"]) && ["link", "roster", "invite"].includes(v.purpose) && (v.purpose === "invite" ? socialGid(v.recipientGid) : v.recipientGid === null) && (v.purpose === "link" ? int(v.bindingRevision) : v.bindingRevision === null);
    case "link": return exact(v, ["action", "proof", "bindingRevision", "consent"]) && proof(v.proof) && int(v.bindingRevision) && typeof v.consent === "boolean";
    case "roster": case "invite": return exact(v, ["action", "proof"]) && proof(v.proof);
    default: return false;
  }
}
// Access token refresh keeps the same provider session epoch. A different session
// for the same account must fence callbacks just as an account change does.
export function socialSessionKey(session: Session | null): string | null {
  if (!session || !(session.user.app_metadata?.provider === "google" || (Array.isArray(session.user.app_metadata?.providers) && session.user.app_metadata.providers.includes("google")))) return null;
  try {
    const body = session.access_token.split(".")[1];
    const claims = JSON.parse(atob(body.replace(/-/g, "+").replace(/_/g, "/"))) as Record<string, unknown>;
    return uuid(claims.session_id) && claims.sub === session.user.id ? `${session.user.id}:${claims.session_id}` : null;
  } catch { return null; }
}

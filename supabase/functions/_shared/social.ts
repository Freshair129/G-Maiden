import type { IamContext, IamDecision } from "./iam.ts";
import {
  exact,
  hash,
  HEX64,
  randomToken,
  type RelayProofPayload,
  verifyProof,
  verifyRedeem,
} from "./social_crypto.ts";
import { GID_ALPHABET } from "./gid.ts";
export type SocialDependencies = {
  authorize: (authorization: string) => Promise<IamDecision>;
  now: () => number;
  config: { origin: string; key: string } | null;
  repository: {
    action: (
      context: IamContext,
      body: Record<string, unknown>,
      origin: string | null,
      proof: RelayProofPayload | null,
      tokenHash: string | null,
    ) => Promise<Record<string, unknown>>;
    redeem: (
      ticketHash: string,
      nonceHash: string,
      origin: string,
    ) => Promise<Record<string, unknown>>;
  };
};
const statuses: Record<string, number> = {
  invalid_request: 400,
  consent_required: 400,
  invalid_session: 401,
  forbidden: 403,
  unavailable: 404,
  conflict: 409,
  limit_reached: 409,
  rate_limited: 429,
  social_unavailable: 503,
};
function response(value: Record<string, unknown>) {
  const error = value.error;
  if (error && (!(typeof error === "string") || !statuses[error])) {
    return response({ error: "social_unavailable" });
  }
  return new Response(JSON.stringify(value), {
    status: typeof error === "string" ? statuses[error] : 200,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}
async function rawBody(request: Request) {
  if (request.method !== "POST") throw Error();
  const reader = request.body?.getReader();
  if (!reader) throw Error();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 8192) {
      await reader.cancel();
      throw Error();
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let pos = 0;
  for (const c of chunks) {
    bytes.set(c, pos);
    pos += c.length;
  }
  // Preserve a leading BOM so JSON parsing rejects it instead of silently
  // authenticating a different byte sequence in the redemption HMAC.
  return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
    bytes,
  );
}
function gid(v: unknown) {
  if (
    typeof v !== "string" ||
    !/^G-[FBP][23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6,12}$/.test(v)
  ) return false;
  const b = v.slice(2, -1);
  let sum = 0;
  for (let i = 0; i < b.length; i++) {
    sum += (i + 1) * GID_ALPHABET.indexOf(b[i]);
  }
  return v.at(-1) === GID_ALPHABET[sum % 31];
}
const uuid = (v: unknown) =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
function valid(b: Record<string, unknown>) {
  switch (b.action) {
    case "state":
    case "heartbeat":
    case "unlink":
      return exact(b, ["action"]);
    case "settings":
      return exact(b, [
        "action",
        "presenceVisible",
        "allowFriendRequests",
        "allowInvites",
      ]) &&
        ["presenceVisible", "allowFriendRequests", "allowInvites"].every((k) =>
          typeof b[k] === "boolean"
        );
    case "request":
    case "remove":
    case "block":
    case "unblock":
      return exact(b, ["action", "gid"]) && gid(b.gid);
    case "request_accept":
    case "request_decline":
    case "request_cancel":
      return exact(b, ["action", "requestId"]) && uuid(b.requestId);
    case "invite_decline":
    case "invite_revoke":
      return exact(b, ["action", "inviteId"]) && uuid(b.inviteId);
    case "invite_accept":
      return exact(b, ["action", "inviteId", "consent"]) && uuid(b.inviteId) &&
        typeof b.consent === "boolean";
    case "challenge":
      return exact(b, [
        "action",
        "purpose",
        "recipientGid",
        "bindingRevision",
      ]) && ["link", "roster", "invite"].includes(b.purpose as string) &&
        (b.purpose === "invite"
          ? gid(b.recipientGid)
          : b.recipientGid === null) &&
        (b.purpose === "link"
          ? Number.isSafeInteger(b.bindingRevision) &&
            (b.bindingRevision as number) >= 0
          : b.bindingRevision === null);
    case "link":
      return exact(b, ["action", "proof", "bindingRevision", "consent"]) &&
        typeof b.proof === "string" && b.proof.length <= 2800 &&
        typeof b.consent === "boolean" &&
        Number.isSafeInteger(b.bindingRevision) &&
        (b.bindingRevision as number) >= 0;
    case "roster":
    case "invite":
      return exact(b, ["action", "proof"]) && typeof b.proof === "string" &&
        b.proof.length <= 2800;
    default:
      return false;
  }
}
function person(v: unknown) {
  return exact(v, ["gid", "displayName"]) && gid(v.gid) &&
    typeof v.displayName === "string" &&
    v.displayName.trim() === v.displayName &&
    Array.from(v.displayName).length >= 1 &&
    Array.from(v.displayName).length <= 32 &&
    !/[\u0000-\u001f\u007f-\u009f\ud800-\udfff]/u.test(v.displayName);
}
const time = (v: unknown) => Number.isSafeInteger(v) && (v as number) >= 0;
function list(v: unknown, max: number, check: (v: unknown) => boolean) {
  return Array.isArray(v) && v.length <= max && v.every(check);
}
function output(action: unknown, v: Record<string, unknown>): boolean {
  if (v.error) {
    return exact(v, ["error"]) && typeof v.error === "string" &&
      !!statuses[v.error];
  }
  if (action === "state") {
    return exact(v, [
      "self",
      "settings",
      "bindingRevision",
      "friends",
      "requests",
      "invites",
      "blocked",
      "serverNowMs",
      "relayOrigin",
    ]) && person(v.self) &&
      exact(v.settings, [
        "presenceVisible",
        "allowFriendRequests",
        "allowInvites",
      ]) && Object.values(v.settings).every((x) => typeof x === "boolean") &&
      time(v.bindingRevision) && time(v.serverNowMs) &&
      (v.relayOrigin === null || typeof v.relayOrigin === "string") &&
      list(v.blocked, 500, person) && list(v.friends, 200, (x) =>
        exact(x, ["gid", "displayName", "online", "onlineForMs"]) &&
        person({ gid: x.gid, displayName: x.displayName }) &&
        typeof x.online === "boolean" && time(x.onlineForMs) &&
        (x.onlineForMs as number) <= 60000 &&
        (x.online || x.onlineForMs === 0)) &&
      list(v.requests, 50, (x) =>
        exact(x, ["id", "person", "direction", "expiresAtMs"]) && uuid(x.id) &&
        person(x.person) &&
        ["incoming", "outgoing"].includes(x.direction as string) &&
        time(x.expiresAtMs)) &&
      list(v.invites, 100, (x) =>
        exact(x, ["id", "person", "direction", "status", "expiresAtMs"]) &&
        uuid(x.id) && person(x.person) &&
        ["incoming", "outgoing"].includes(x.direction as string) &&
        ["pending", "accepted"].includes(x.status as string) &&
        time(x.expiresAtMs));
  }
  if (action === "challenge") {
    return exact(v, ["challenge", "expiresAtMs", "relayOrigin"]) &&
      typeof v.challenge === "string" && HEX64.test(v.challenge) &&
      time(v.expiresAtMs) && typeof v.relayOrigin === "string";
  }
  if (action === "invite_accept") {
    return exact(v, ["ticket", "relayOrigin", "roomId", "expiresAtMs"]) &&
      typeof v.ticket === "string" && HEX64.test(v.ticket) &&
      typeof v.relayOrigin === "string" && typeof v.roomId === "string" &&
      /^[0-9a-f]{32}$/.test(v.roomId) && time(v.expiresAtMs);
  }
  if (action === "roster") {
    return exact(v, ["roomId", "generation", "bindings", "serverNowMs"]) &&
      typeof v.roomId === "string" && /^[0-9a-f]{32}$/.test(v.roomId) &&
      time(v.generation) && (v.generation as number) > 0 &&
      time(v.serverNowMs) && list(v.bindings, 5, (x) =>
        exact(x, ["memberId", "person", "expiresAtMs"]) &&
        typeof x.memberId === "string" && /^[0-9a-f]{32}$/.test(x.memberId) &&
        person(x.person) && time(x.expiresAtMs));
  }
  if (action === "redeem") {
    return exact(v, ["roomId", "ownerId", "generation"]) &&
      ["roomId", "ownerId"].every((k) =>
        typeof v[k] === "string" && /^[0-9a-f]{32}$/.test(v[k] as string)
      ) && time(v.generation) && (v.generation as number) > 0;
  }
  return exact(v, ["ok"]) && v.ok === true;
}
export async function handleSocial(
  request: Request,
  deps: SocialDependencies,
): Promise<Response> {
  const corsHeaders = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers":
      "authorization, x-client-info, apikey, content-type",
    "access-control-allow-methods": "POST, OPTIONS",
  };
  if (request.method === "OPTIONS") {
    return new Response("ok", {
      headers: { ...corsHeaders, "cache-control": "no-store" },
    });
  }
  const result = await handleSocialAccount(request, deps);
  for (const [name, value] of Object.entries(corsHeaders)) {
    result.headers.set(name, value);
  }
  return result;
}
async function handleSocialAccount(
  request: Request,
  deps: SocialDependencies,
): Promise<Response> {
  let b: Record<string, unknown>;
  try {
    b = JSON.parse(await rawBody(request));
    if (!b || !valid(b)) return response({ error: "invalid_request" });
  } catch {
    return response({ error: "invalid_request" });
  }
  try {
    const auth = await deps.authorize(
      request.headers.get("authorization") ?? "",
    );
    if (!auth.ok) {
      return response({
        error: auth.code === "invalid_session"
          ? "invalid_session"
          : auth.code === "capability_denied"
          ? "forbidden"
          : "social_unavailable",
      });
    }
    const social = [
      "challenge",
      "link",
      "roster",
      "invite",
      "invite_accept",
      "invite_decline",
      "invite_revoke",
    ].includes(b.action as string);
    if (social && !deps.config) {
      return response({ error: "social_unavailable" });
    }
    if (b.action === "invite_accept" && b.consent !== true) {
      return response({ error: "consent_required" });
    }
    let proof: RelayProofPayload | null = null,
      token: string | null = null,
      tokenHash: string | null = null;
    if (["link", "roster", "invite"].includes(b.action as string)) {
      proof = await verifyProof(
        b.proof as string,
        deps.config!.key,
        deps.config!.origin,
        deps.now(),
      );
      if (!proof) return response({ error: "unavailable" });
      tokenHash = await hash(proof.challenge);
    }
    if (b.action === "challenge" || b.action === "invite_accept") {
      token = randomToken();
      tokenHash = await hash(token);
    }
    const result = await deps.repository.action(
      auth.context,
      b,
      deps.config?.origin ?? null,
      proof,
      tokenHash,
    );
    if (!result.error && b.action === "challenge") {
      Object.assign(result, {
        challenge: token,
        relayOrigin: deps.config!.origin,
      });
    }
    if (!result.error && b.action === "invite_accept") {
      Object.assign(result, { ticket: token });
    }
    if (
      !output(b.action, result) ||
      new TextEncoder().encode(JSON.stringify(result)).length > 262144
    ) return response({ error: "social_unavailable" });
    return response(result);
  } catch {
    return response({ error: "social_unavailable" });
  }
}
export async function handleSocialRedeem(
  request: Request,
  deps: SocialDependencies,
): Promise<Response> {
  if (!deps.config) return response({ error: "social_unavailable" });
  let raw: string, b: Record<string, unknown>;
  try {
    raw = await rawBody(request);
    b = JSON.parse(raw);
    if (
      !exact(b, ["ticket", "relayOrigin", "nonce", "issuedAtMs"]) ||
      typeof b.ticket !== "string" || !HEX64.test(b.ticket) ||
      typeof b.nonce !== "string" || !HEX64.test(b.nonce) ||
      b.relayOrigin !== deps.config.origin ||
      !Number.isSafeInteger(b.issuedAtMs)
    ) return response({ error: "invalid_request" });
  } catch {
    return response({ error: "invalid_request" });
  }
  if (
    !await verifyRedeem(
      raw,
      request.headers.get("x-g-party-signature") ?? "",
      deps.config.key,
    )
  ) return response({ error: "forbidden" });
  const age = deps.now() - (b.issuedAtMs as number);
  if (age >= 60000 || age < -5000) return response({ error: "unavailable" });
  try {
    const result = await deps.repository.redeem(
      await hash(b.ticket as string),
      await hash(b.nonce as string),
      deps.config.origin,
    );
    return response(
      output("redeem", result) ? result : { error: "social_unavailable" },
    );
  } catch {
    return response({ error: "social_unavailable" });
  }
}

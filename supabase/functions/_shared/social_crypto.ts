const enc = new TextEncoder();
export type RelayProofPayload = {
  v: 1;
  relayOrigin: string;
  challenge: string;
  roomId: string;
  memberId: string;
  ownerId: string;
  generation: number;
  memberIds: string[];
  issuedAtMs: number;
  expiresAtMs: number;
};
export const HEX32 = /^[0-9a-f]{32}$/;
export const HEX64 = /^[0-9a-f]{64}$/;
export function exact(
  value: unknown,
  keys: string[],
): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((k) => Object.hasOwn(value, k));
}
const b64 = (a: Uint8Array) =>
  btoa(String.fromCharCode(...a)).replaceAll("+", "-").replaceAll("/", "_")
    .replaceAll("=", "");
function decode(s: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(s)) throw Error();
  const a = Uint8Array.from(
    atob(s.replaceAll("-", "+").replaceAll("_", "/")),
    (c) => c.charCodeAt(0),
  );
  if (b64(a) !== s) throw Error();
  return a;
}
async function key(hex: string) {
  if (!HEX64.test(hex)) throw Error("invalid key");
  return await crypto.subtle.importKey(
    "raw",
    Uint8Array.from(hex.match(/../g)!, (x) => parseInt(x, 16)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}
export async function signProof(payload: unknown, secret: string) {
  const segment = b64(enc.encode(JSON.stringify(payload)));
  return segment + "." +
    b64(
      new Uint8Array(
        await crypto.subtle.sign(
          "HMAC",
          await key(secret),
          enc.encode("GPartySocialProof/v1\n" + segment),
        ),
      ),
    );
}
export async function verifyProof(
  proof: string,
  secret: string,
  origin: string,
  now: number,
): Promise<RelayProofPayload | null> {
  try {
    if (proof.length > 2800) return null;
    const parts = proof.split(".");
    if (parts.length !== 2) return null;
    const sig = decode(parts[1]);
    if (
      sig.length !== 32 ||
      !await crypto.subtle.verify(
        "HMAC",
        await key(secret),
        sig,
        enc.encode("GPartySocialProof/v1\n" + parts[0]),
      )
    ) return null;
    const bytes = decode(parts[0]);
    if (bytes.length > 2048) return null;
    const p = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    );
    if (
      !exact(p, [
        "v",
        "relayOrigin",
        "challenge",
        "roomId",
        "memberId",
        "ownerId",
        "generation",
        "memberIds",
        "issuedAtMs",
        "expiresAtMs",
      ])
    ) return null;
    if (
      p.v !== 1 || p.relayOrigin !== origin ||
      typeof p.challenge !== "string" || !HEX64.test(p.challenge) ||
      !["roomId", "memberId", "ownerId"].every((k) =>
        typeof p[k] === "string" && HEX32.test(p[k] as string)
      ) || !Number.isSafeInteger(p.generation) || (p.generation as number) < 1
    ) return null;
    if (
      !Array.isArray(p.memberIds) || p.memberIds.length < 1 ||
      p.memberIds.length > 5 || !p.memberIds.every((x) =>
        typeof x === "string" && HEX32.test(x)
      ) || new Set(p.memberIds).size !== p.memberIds.length ||
      !p.memberIds.includes(p.memberId) || !p.memberIds.includes(p.ownerId)
    ) return null;
    if (
      !Number.isSafeInteger(p.issuedAtMs) ||
      !Number.isSafeInteger(p.expiresAtMs) ||
      (p.issuedAtMs as number) > now + 5000 ||
      (p.expiresAtMs as number) <= now ||
      (p.expiresAtMs as number) <= (p.issuedAtMs as number) ||
      (p.expiresAtMs as number) - (p.issuedAtMs as number) > 60000
    ) return null;
    return p as RelayProofPayload;
  } catch {
    return null;
  }
}
export async function signRedeem(raw: string, secret: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.sign(
        "HMAC",
        await key(secret),
        enc.encode("GPartySocialRedeem/v1\n" + raw),
      ),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
export async function verifyRedeem(
  raw: string,
  signature: string,
  secret: string,
) {
  try {
    return HEX64.test(signature) &&
      await crypto.subtle.verify(
        "HMAC",
        await key(secret),
        Uint8Array.from(signature.match(/../g)!, (x) => parseInt(x, 16)),
        enc.encode("GPartySocialRedeem/v1\n" + raw),
      );
  } catch {
    return false;
  }
}
export async function hash(value: string) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(value))),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
export function randomToken() {
  return Array.from(
    crypto.getRandomValues(new Uint8Array(32)),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
export function relayConfig(
  origin: string | undefined,
  secret: string | undefined,
): { origin: string; key: string } | null {
  try {
    if (!origin || !secret || !HEX64.test(secret)) return null;
    const u = new URL(origin);
    if (
      u.protocol !== "https:" || u.username || u.password || u.search ||
      u.hash || u.pathname !== "/" || u.origin !== origin ||
      (u.hostname === "localhost" || u.hostname.endsWith(".localhost") ||
        u.hostname === "[::1]" || /^127\./.test(u.hostname) ||
        /^\[::ffff:7f[0-9a-f]{2}:/.test(u.hostname))
    ) return null;
    return { origin, key: secret };
  } catch {
    return null;
  }
}

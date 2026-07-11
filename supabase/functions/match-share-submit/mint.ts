// Doc: CR-003 §2.5 (match-share-submit) · ADR-16 §3 (mint oracle = OpenDota,
// never G-Log) / §5 (match_ref storage). Pure decision + crypto helpers,
// separated from IO (HTTP fetch to OpenDota, Supabase reads/writes/RPC) so the
// verification and scoring rules are unit-testable without a network/DB mock —
// same split as ../mint-gid/mint.ts.
//
// ADR-16 §5 (load-bearing): the RAW match_id must NEVER be written to any
// database table — it is only ever used (a) here, transiently, as HMAC input
// to derive `match_ref`, and (b) by index.ts to call the OpenDota API. This
// file exports no function that persists match_id; only `computeMatchRef`
// touches it, and it returns a derived hex digest, not the input itself.

// ---------------------------------------------------------------------------
// match_id input validation
// ---------------------------------------------------------------------------
export type MatchIdCheck =
  | { ok: true; matchId: string }
  | { ok: false; reason: string };

/** Dota/OpenDota match ids are decimal digit strings (currently ~10 digits).
 *  Bounded loosely (1-20 digits) so we don't hardcode a width that breaks
 *  later, while still rejecting obviously-bogus input before it reaches
 *  HMAC/OpenDota. */
export function validateMatchId(raw: unknown): MatchIdCheck {
  if (typeof raw !== "string") return { ok: false, reason: "match_id must be a string" };
  const s = raw.trim();
  if (!/^[0-9]{1,20}$/.test(s)) return { ok: false, reason: "match_id must be digits only" };
  return { ok: true, matchId: s };
}

// ---------------------------------------------------------------------------
// Steam link check (ADR-14: profiles.steamid64 / profiles.account_id)
// ---------------------------------------------------------------------------
export interface LinkedProfile {
  steamid64: string | null;
  account_id: number | null;
}

export type LinkCheck =
  | { ok: true; accountId: number }
  | { ok: false; reason: string };

export function checkSteamLinked(profile: LinkedProfile | null): LinkCheck {
  if (!profile || !profile.steamid64 || profile.account_id == null) {
    return {
      ok: false,
      reason: "ยังไม่ได้เชื่อมบัญชี Steam — ไปที่แท็บ Account เพื่อเชื่อมก่อนแชร์แมตช์",
    };
  }
  return { ok: true, accountId: profile.account_id };
}

// ---------------------------------------------------------------------------
// OpenDota match verification (ADR-16 §3: match exists · account_id appears in
// players[] · match is finished). Only the fields we actually read are typed —
// mirrors the "only the fields we read" convention in src/src/live/opendota.ts.
// ---------------------------------------------------------------------------
export interface OpenDotaMatchPlayer {
  account_id?: number | null;
  player_slot?: number | null;
  kills?: number | null;
  deaths?: number | null;
  assists?: number | null;
  gold_per_min?: number | null;
}
export interface OpenDotaMatch {
  match_id?: number | null;
  duration?: number | null;
  radiant_win?: boolean | null;
  players?: OpenDotaMatchPlayer[] | null;
}

export type VerifyResult =
  | { ok: true; player: OpenDotaMatchPlayer; win: boolean }
  | { ok: false; reason: string };

/** Pure: never fetches, only judges an already-fetched OpenDota match payload. */
export function verifyMatchForAccount(match: OpenDotaMatch | null, accountId: number): VerifyResult {
  if (!match || typeof match.match_id !== "number") {
    return {
      ok: false,
      reason: "ไม่พบแมตช์นี้บน OpenDota (อาจยังไม่ถูก parse หรือรหัสแมตช์ไม่ถูกต้อง) ลองใหม่อีกครั้งภายหลัง",
    };
  }
  // duration is only populated once the match is finished + parsed by OpenDota.
  if (!match.duration || match.duration <= 0) {
    return { ok: false, reason: "แมตช์นี้ยังไม่จบ — แชร์ได้หลังเกมจบเท่านั้น" };
  }
  const players = match.players ?? [];
  const player = players.find((p) => p.account_id === accountId);
  if (!player) {
    return {
      ok: false,
      reason: "ไม่พบบัญชีของคุณในแมตช์นี้ — โปรไฟล์ OpenDota อาจตั้งเป็นส่วนตัว (private) หรือคุณไม่ได้เล่นแมตช์นี้",
    };
  }
  // player_slot < 128 = Radiant (0-127), >= 128 = Dire (128-255) — standard
  // OpenDota/Dota2 convention. win = (on Radiant) === (Radiant won).
  const win =
    typeof player.player_slot === "number" && typeof match.radiant_win === "boolean"
      ? (player.player_slot < 128) === match.radiant_win
      : false;
  return { ok: true, player, win };
}

// ---------------------------------------------------------------------------
// Shard scoring — ⚠️ PLACEHOLDER / PROVISIONAL. ⚠️
//
// ADR-16 does not specify an exact formula (only that it must be computed
// server-side from OpenDota public data, §3 step 3). This is a deliberately
// simple, transparent heuristic — base amount + a mild KDA bonus + a mild GPM
// (farm efficiency) bonus + a flat win bonus — bounded to a hard [1, 150]
// range as a safety net against outlier stat lines (e.g. a 40-min stomp with
// absurd KDA). It is NOT a tuned economy design: no consideration has been
// given to shard-supply inflation targets, session-length normalization,
// role/position weighting, or party-size effects. A real balancing pass
// (informed by `economy_config` telemetry once shard-supply metering exists,
// per ADR-16 §6) MUST happen before this is exposed to real users at scale.
// ---------------------------------------------------------------------------
export interface MatchPerformance {
  kills: number;
  deaths: number;
  assists: number;
  goldPerMin: number;
  win: boolean;
}

const SHARD_BASE = 10; // flat reward for a verified, finished match
const SHARD_WIN_BONUS = 20;
const SHARD_KDA_WEIGHT = 5;
const SHARD_KDA_CAP = 10; // (kills+assists)/deaths clamped before weighting
const SHARD_GPM_DIVISOR = 30;
const SHARD_GPM_CAP = 900; // clamp absurd/outlier GPM before dividing
const SHARD_MIN = 1;
const SHARD_MAX = 150; // hard cap independent of economy_config.shard_daily_earn_cap

/** PROVISIONAL — see doc comment above. Pure function of match performance. */
export function scoreShardForMatch(perf: MatchPerformance): number {
  const kda = (perf.kills + perf.assists) / Math.max(1, perf.deaths);
  const kdaBonus = Math.round(Math.min(kda, SHARD_KDA_CAP) * SHARD_KDA_WEIGHT);
  const gpmBonus = Math.round(Math.min(Math.max(perf.goldPerMin, 0), SHARD_GPM_CAP) / SHARD_GPM_DIVISOR);
  const winBonus = perf.win ? SHARD_WIN_BONUS : 0;
  const total = SHARD_BASE + kdaBonus + gpmBonus + winBonus;
  return Math.min(SHARD_MAX, Math.max(SHARD_MIN, Math.round(total)));
}

export function performanceFromMatchPlayer(player: OpenDotaMatchPlayer, win: boolean): MatchPerformance {
  return {
    kills: player.kills ?? 0,
    deaths: player.deaths ?? 0,
    assists: player.assists ?? 0,
    goldPerMin: player.gold_per_min ?? 0,
    win,
  };
}

// ---------------------------------------------------------------------------
// HMAC helpers (Web Crypto — available natively in the Deno Edge runtime).
// ---------------------------------------------------------------------------
function hexEncode(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

/** hex(HMAC-SHA256(secret, message)) */
export async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return hexEncode(sig);
}

/** ADR-16 §5: `match_ref = HMAC(server_key, match_id)`, hex-encoded. This is
 *  the ONLY thing derived from the raw match_id that index.ts may write to
 *  storage — the raw match_id itself must be discarded after this call and
 *  after the OpenDota verification fetch. */
export function computeMatchRef(serverKey: string, matchId: string): Promise<string> {
  return hmacHex(serverKey, matchId);
}

// ---------------------------------------------------------------------------
// Receipt signature.
//
// TODO before shipping to real users: replace this HMAC with a real
// asymmetric signing scheme (e.g. Ed25519) so the receipt is independently
// verifiable by the holder without trusting/holding a shared server secret —
// true non-repudiation per ADR-16 §5. An HMAC receipt only proves "produced
// by someone holding RECEIPT_SIG_HMAC_KEY", which is sufficient for MVP
// dispute resolution (comparing a submitted receipt against a server
// recomputation) but is not a cryptographic non-repudiation guarantee.
// ---------------------------------------------------------------------------
export interface ReceiptPayload {
  gid: string;
  match_ref: string;
  ts: number;
  shard: number;
}

export async function signReceipt(secret: string, payload: ReceiptPayload): Promise<string> {
  // Stable-ish JSON (fixed key order via explicit object literal below) so the
  // same payload always signs to the same digest.
  const message = JSON.stringify({
    gid: payload.gid,
    match_ref: payload.match_ref,
    ts: payload.ts,
    shard: payload.shard,
  });
  return await hmacHex(secret, message);
}

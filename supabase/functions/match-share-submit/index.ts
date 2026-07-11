// Doc: CR-003 §2.5 (match-share-submit) · ADR-16 §3 (mint oracle = OpenDota,
// "ห้าม mint จาก G-Log ในเครื่องผู้ใช้") / §5 (match_ref storage — raw
// match_id must never touch the DB). Verifies a finished match against
// OpenDota, mints shard via the service_role-only RPC `mint_shard_from_match`
// (grant execute deliberately withheld from `authenticated`, CR-003 §2.4), and
// returns a signed receipt.
//
// Honest-state contract (ADR-16 §3 item 4): any verification failure —
// unlinked Steam account, match not found/not finished, account not in the
// match, duplicate submission, daily cap reached — responds 200 with
// `{shard_minted: 0, reason}`, NOT an error status. Only structurally invalid
// requests (bad/missing JSON, malformed match_id, no auth) get 4xx/5xx.
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  checkSteamLinked,
  computeMatchRef,
  performanceFromMatchPlayer,
  scoreShardForMatch,
  signReceipt,
  validateMatchId,
  verifyMatchForAccount,
  type LinkedProfile,
  type OpenDotaMatch,
} from "./mint.ts";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const OPENDOTA_BASE = "https://api.opendota.com/api";

Deno.serve(async (req) => {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json(401, { error: "missing authorization" });

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const matchRefKey = Deno.env.get("MATCH_REF_HMAC_KEY");
  // A distinct receipt-signing key is preferred (defense in depth — a leak of
  // one secret shouldn't let an attacker forge the other), but falls back to
  // the match_ref key so this still works before a second secret is
  // provisioned in the Supabase project's env.
  const receiptKey = Deno.env.get("RECEIPT_SIG_HMAC_KEY") ?? matchRefKey;

  if (!matchRefKey || !receiptKey) {
    return json(500, { error: "server misconfigured: MATCH_REF_HMAC_KEY not set" });
  }

  // Identify the caller from their JWT (user-scoped client) — same pattern as
  // ../mint-gid/index.ts.
  const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json(401, { error: "invalid token" });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid JSON body" });
  }
  const matchIdRaw = (body as { match_id?: unknown } | null)?.match_id;
  const matchIdCheck = validateMatchId(matchIdRaw);
  if (!matchIdCheck.ok) return json(400, { error: matchIdCheck.reason });
  const matchId = matchIdCheck.matchId; // raw match_id — see disposal notes below

  // ADR-16 §5: derive match_ref immediately. From this point on, `matchId`
  // (raw) is used ONLY as an OpenDota lookup key below — it is never written
  // to any table, log line we persist, or response body. `matchRef` (the
  // derived HMAC hex) is the only match-identifying value that may reach
  // storage or the RPC call.
  const matchRef = await computeMatchRef(matchRefKey, matchId);

  // Privileged read: which Steam account is this GID linked to? (ADR-14)
  const admin = createClient(url, service);
  const { data: profile, error: profErr } = await admin
    .from("profiles")
    .select("steamid64, account_id, gid_code")
    .eq("id", user.id)
    .maybeSingle();
  if (profErr) return json(500, { error: profErr.message });

  const linkCheck = checkSteamLinked(profile as LinkedProfile | null);
  if (!linkCheck.ok) return json(200, { shard_minted: 0, reason: linkCheck.reason });

  // Verify against OpenDota (the mint oracle, ADR-16 §3) — this is the only
  // place `matchId` (raw) is used for an outbound call. It is discarded after
  // this fetch; nothing below this block references it again.
  let match: OpenDotaMatch | null = null;
  try {
    const resp = await fetch(`${OPENDOTA_BASE}/matches/${matchId}`, {
      headers: { accept: "application/json" },
    });
    if (resp.ok) match = (await resp.json()) as OpenDotaMatch;
  } catch {
    match = null;
  }
  if (!match) {
    return json(200, {
      shard_minted: 0,
      reason: "ตรวจสอบกับ OpenDota ไม่สำเร็จตอนนี้ — ลองใหม่อีกครั้งภายหลัง",
    });
  }

  const verify = verifyMatchForAccount(match, linkCheck.accountId);
  if (!verify.ok) return json(200, { shard_minted: 0, reason: verify.reason });

  // PLACEHOLDER scoring — see mint.ts `scoreShardForMatch` doc comment; this
  // formula is provisional and needs a real balancing pass before launch.
  const perf = performanceFromMatchPlayer(verify.player, verify.win);
  const shard = scoreShardForMatch(perf);

  const gid = (profile as { gid_code?: string | null } | null)?.gid_code ?? user.id;
  const ts = Date.now();
  // Receipt signing scheme is also provisional — see mint.ts `signReceipt`.
  const receiptSig = await signReceipt(receiptKey, { gid, match_ref: matchRef, ts, shard });

  // service_role-only RPC (not granted to `authenticated`, CR-003 §2.4). It
  // raises on duplicate (user_id, match_ref) or daily cap — both translated
  // to honest-state 200 responses below rather than a 500.
  const { error: mintErr } = await admin.rpc("mint_shard_from_match", {
    p_user_id: user.id,
    p_match_ref: matchRef,
    p_shard: shard,
    p_receipt_sig: receiptSig,
  });

  if (mintErr) {
    const msg = mintErr.message ?? "";
    // unique(user_id, match_ref) violation — Postgres code 23505. PostgREST's
    // RPC error surface doesn't always expose `.code` cleanly, so also match
    // on the message text defensively.
    if (mintErr.code === "23505" || /duplicate key|unique constraint/i.test(msg)) {
      return json(200, { shard_minted: 0, reason: "แมตช์นี้แชร์ไปแล้ว ไม่สามารถรับ Shard ซ้ำได้" });
    }
    if (/daily shard earn cap reached/i.test(msg)) {
      return json(200, { shard_minted: 0, reason: "วันนี้แชร์แมตช์ครบโควตา Shard แล้ว ลองใหม่พรุ่งนี้" });
    }
    // Anything else is a genuine unexpected failure, not an honest-state case.
    return json(500, { error: msg });
  }

  return json(200, { shard_minted: shard, receipt_sig: receiptSig });
});

// Doc: SEC-001 §2 Phase B step 1 (feature--ef-mint-gid) — server-authoritative
// GID minting. Runs after Part B revokes the client's UPDATE(gid_code) grant, so
// gid_code can no longer be forged from the client. Uses the SAME gid.ts codec
// (via ../_shared/gid.ts) so the algorithm stays single-sourced (ADR-14).
import { createClient } from "jsr:@supabase/supabase-js@2";
import { decideMint, type MintProfile } from "./mint.ts";
import { corsJson, corsPreflight, isAllowedMintMethod } from "./cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return corsPreflight();
  }
  if (!isAllowedMintMethod(req.method)) {
    return corsJson(405, { error: "method not allowed" });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return corsJson(401, { error: "missing authorization" });

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Identify the caller from their JWT (user-scoped client).
  const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return corsJson(401, { error: "invalid token" });

  // Privileged read+write (service_role) — bypasses the client column-lock.
  const admin = createClient(url, service);
  const { data: prof, error } = await admin
    .from("profiles")
    .select("gid_code, generation, cohort_seq, created_at")
    .eq("id", user.id)
    .maybeSingle();
  if (error) return corsJson(500, { error: error.message });
  if (!prof) return corsJson(404, { error: "no profile" });

  const decision = decideMint(prof as MintProfile);
  if (decision.action === "error") return corsJson(422, { error: decision.reason });
  if (decision.action === "noop") return corsJson(200, { gid_code: decision.gid_code });

  // action === "mint": persist once (null-guard makes concurrent calls safe).
  const { error: upErr } = await admin
    .from("profiles")
    .update({ gid_code: decision.gid_code })
    .eq("id", user.id)
    .is("gid_code", null);
  if (upErr) return corsJson(500, { error: upErr.message });
  return corsJson(200, { gid_code: decision.gid_code });
});

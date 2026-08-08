import { createClient } from "jsr:@supabase/supabase-js@2";
import { isPostOrOptions, json, preflight } from "../_shared/gmad.ts";
import { isGoogleIdentity, shouldAutoGrant } from "../_shared/entitlement.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();
  if (!isPostOrOptions(req.method)) return json(405, { error: "method not allowed" });
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json(401, { error: "missing authorization" });
  let body: { required_terms_accepted?: unknown; age_requirement_confirmed?: unknown; diagnostics_opt_in?: unknown; marketing_opt_in?: unknown; post_match_opt_in?: unknown };
  try { body = await req.json(); } catch { return json(400, { error: "invalid JSON body" }); }
  if (body.required_terms_accepted !== true) return json(400, { error: "Terms acceptance is required" });
  if (body.age_requirement_confirmed !== true) return json(400, { error: "Age requirement confirmation is required" });
  const optional = ["diagnostics_opt_in", "marketing_opt_in", "post_match_opt_in"] as const;
  if (optional.some((key) => body[key] !== undefined && typeof body[key] !== "boolean")) return json(400, { error: "optional consent must be boolean" });
  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const caller = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await caller.auth.getUser();
  if (!user) return json(401, { error: "invalid token" });
  if (!isGoogleIdentity(user)) return json(403, { error: "Google sign-in is required" });
  const admin = createClient(url, service);
  const { data: document } = await admin.from("closed_beta_legal_documents")
    .select("document_id,version,document_sha256,effective_at").eq("required_for_gmad", true).maybeSingle();
  const { data: privacy } = await admin.from("closed_beta_legal_documents")
    .select("document_id,version,document_sha256,effective_at").eq("document_id", "closed-beta-privacy-notice")
    .order("effective_at", { ascending: false }).limit(1).maybeSingle();
  if (!document || !privacy) return json(503, { error: "current legal documents are unavailable" });
  const { data: receipt, error } = await admin.from("closed_beta_terms_receipts").insert({
    user_id: user.id, document_id: document.document_id, document_version: document.version,
    document_sha256: document.document_sha256, source: "landing", required_terms_accepted: true,
    privacy_document_id: privacy.document_id, privacy_document_version: privacy.version,
    privacy_document_sha256: privacy.document_sha256, age_requirement_confirmed: true,
    diagnostics_opt_in: body.diagnostics_opt_in === true, marketing_opt_in: body.marketing_opt_in === true,
    post_match_opt_in: body.post_match_opt_in === true,
  }).select("id,accepted_at").single();
  if (error || !receipt) return json(500, { error: error?.message ?? "could not record acceptance" });
  await admin.from("gmad_download_audit").insert({ actor_id: user.id, subject_id: user.id, action: "terms_accepted", detail: { document_id: document.document_id, version: document.version } });
  // SPEC-2026-08-09 Phase 1: accepting Terms makes the "queued" state real
  // (enrollment row) and, when the Open Beta switch is on, auto-issues the
  // grant on the designated batch. A previously revoked enrollment is never
  // resurrected and never auto-granted.
  const { data: enrollment } = await admin.from("closed_beta_enrollments")
    .select("status").eq("user_id", user.id).maybeSingle();
  if (!enrollment) {
    const { error: enrollError } = await admin.from("closed_beta_enrollments")
      .insert({ user_id: user.id, source: "landing" });
    // 23505 = concurrent request already created the row; anything else is a real failure
    // the caller must see, because no other code path creates enrollments.
    if (enrollError && enrollError.code !== "23505") {
      return json(500, { error: "could not record enrollment" });
    }
  }
  if (enrollment?.status !== "revoked") {
    const { data: policy } = await admin.from("gmad_distribution_policy")
      .select("open_beta_enabled,open_beta_batch_id,github_release_url")
      .eq("id", 1).maybeSingle();
    if (policy?.open_beta_enabled && policy.open_beta_batch_id) {
      const { data: openBatch } = await admin.from("gmad_download_batches")
        .select("id,status").eq("id", policy.open_beta_batch_id).maybeSingle();
      if (shouldAutoGrant(policy, openBatch?.status ?? null)) {
        const { data: insertedGrants, error: grantError } = await admin.from("gmad_download_grants").upsert(
          { batch_id: policy.open_beta_batch_id, user_id: user.id },
          { onConflict: "batch_id,user_id", ignoreDuplicates: true },
        ).select("batch_id");
        if (!grantError && (insertedGrants?.length ?? 0) > 0) {
          await admin.from("gmad_download_audit").insert({
            actor_id: user.id, subject_id: user.id, batch_id: policy.open_beta_batch_id,
            action: "grant_auto_issued", detail: { source: "accept-closed-beta-terms" },
          });
        }
      }
    }
  }
  return json(200, { receipt_id: receipt.id, accepted_at: receipt.accepted_at,
    document: { id: document.document_id, version: document.version, effective_at: document.effective_at },
    privacy: { id: privacy.document_id, version: privacy.version, effective_at: privacy.effective_at } });
});

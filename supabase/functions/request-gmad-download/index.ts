import { createClient } from "jsr:@supabase/supabase-js@2";
import { GMAD_BUCKET, GMAD_SIGNED_URL_TTL_SECONDS, isPostOrOptions, json, preflight } from "../_shared/gmad.ts";
import { decideGmadEntitlement, isGoogleIdentity, type TermsReceipt } from "../_shared/entitlement.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();
  if (!isPostOrOptions(req.method)) return json(405, { error: "method not allowed" });
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json(401, { error: "missing authorization" });
  try { await req.json(); } catch { return json(400, { error: "invalid JSON body" }); }

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const caller = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await caller.auth.getUser();
  if (!user) return json(401, { error: "invalid token" });
  if (!isGoogleIdentity(user)) return json(403, { error: "Google sign-in is required" });
  const admin = createClient(url, service);
  const { data: profile } = await admin.from("profiles").select("gid_code").eq("id", user.id).maybeSingle();
  const { data: required } = await admin.from("closed_beta_legal_documents")
    .select("document_id,version,document_sha256,effective_at").eq("required_for_gmad", true).maybeSingle();
  const { data: receipt } = required ? await admin.from("closed_beta_terms_receipts")
    .select("document_id,document_version,document_sha256").eq("user_id", user.id).eq("document_id", required.document_id)
    .eq("required_terms_accepted", true).eq("age_requirement_confirmed", true)
    .order("accepted_at", { ascending: false }).limit(1).maybeSingle() : { data: null };
  const { data: grants, error: grantError } = await admin
    .from("gmad_download_grants")
    .select("batch_id,gmad_download_batches!inner(status,artifact_path,release_id)")
    .eq("user_id", user.id)
    .eq("gmad_download_batches.status", "published");
  if (grantError) return json(500, { error: grantError.message });
  const decision = decideGmadEntitlement({ gid: profile?.gid_code ?? null, currentTerms: required ?? null,
    receipt: receipt as TermsReceipt | null, activeGrant: (grants ?? []).length > 0 });
  if (decision.state !== "eligible") return json(403, { error: decision.state });
  const grant = (grants ?? [])[0];
  const batch = grant?.gmad_download_batches as { artifact_path?: string; release_id?: string } | null;
  if (!grant || !batch?.artifact_path) return json(403, { error: "download is not available for this GID" });
  const { data: signed, error } = await admin.storage.from(GMAD_BUCKET).createSignedUrl(batch.artifact_path, GMAD_SIGNED_URL_TTL_SECONDS);
  if (error || !signed) return json(500, { error: error?.message ?? "could not issue download" });
  await admin.from("gmad_download_audit").insert({ actor_id: user.id, subject_id: user.id, batch_id: grant.batch_id, action: "download_issued", detail: { release_id: batch.release_id } });
  return json(200, { url: signed.signedUrl, expires_in: GMAD_SIGNED_URL_TTL_SECONDS, release_id: batch.release_id });
});

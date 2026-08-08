import { createClient } from "jsr:@supabase/supabase-js@2";
import { isPostOrOptions, json, preflight } from "../_shared/gmad.ts";
import { deriveTermsState, isGoogleIdentity, resolveDownloadChannel, type TermsReceipt } from "../_shared/entitlement.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();
  if (!isPostOrOptions(req.method)) return json(405, { error: "method not allowed" });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json(401, { state: "signed_out" });
  try { await req.json(); } catch { return json(400, { error: "invalid JSON body" }); }

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const caller = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await caller.auth.getUser();
  if (!user) return json(401, { state: "signed_out" });
  if (!isGoogleIdentity(user)) return json(200, { state: "not_registered" });
  const admin = createClient(url, service);
  const { data: profile } = await admin.from("profiles").select("id,gid_code").eq("id", user.id).maybeSingle();
  if (!profile?.gid_code) return json(200, { state: "not_registered" });

  const { data: required } = await admin.from("closed_beta_legal_documents")
    .select("document_id,version,document_sha256,effective_at").eq("required_for_gmad", true).maybeSingle();
  const { data: latestReceipt } = required
    ? await admin.from("closed_beta_terms_receipts")
      .select("document_id,document_version,document_sha256").eq("user_id", user.id)
      .eq("document_id", required.document_id).eq("required_terms_accepted", true)
      .eq("age_requirement_confirmed", true)
      .order("accepted_at", { ascending: false }).limit(1).maybeSingle()
    : { data: null };
  const termsState = deriveTermsState(required ?? null, (latestReceipt as TermsReceipt | null) ?? null);
  const { data: policy } = await admin.from("gmad_distribution_policy")
    .select("open_beta_enabled,open_beta_batch_id,github_release_url").eq("id", 1).maybeSingle();

  const { data: enrollment } = await admin.from("closed_beta_enrollments").select("status").eq("user_id", user.id).maybeSingle();
  if (!enrollment || enrollment.status === "revoked") return json(200, { state: "revoked" });
  const { data: grants, error: grantError } = await admin
    .from("gmad_download_grants")
    .select("batch_id,gmad_download_batches!inner(status,label,release_id)")
    .eq("user_id", user.id)
    .in("gmad_download_batches.status", ["published", "paused"]);
  if (grantError) return json(500, { error: grantError.message });
  const grant = (grants ?? []).find((row) => {
    const batch = row.gmad_download_batches as { status?: string } | null;
    return batch?.status === "published";
  }) ?? (grants ?? [])[0];
  const batch = grant?.gmad_download_batches as { status?: string; label?: string; release_id?: string } | null;
  const state = batch?.status === "published" ? "available" : batch?.status === "paused" ? "paused" : "waiting";
  await admin.from("gmad_download_audit").insert({ actor_id: user.id, subject_id: user.id, batch_id: grant?.batch_id ?? null, action: "queue_checked", detail: { state } });
  const download = state === "available"
    ? resolveDownloadChannel(policy ?? null, grant?.batch_id ?? null)
    : { channel: "gated" as const };
  return json(200, {
    state,
    batch_label: state === "available" || state === "paused" ? batch?.label : null,
    release_id: state === "available" ? batch?.release_id : null,
    terms: {
      state: termsState,
      document_id: required?.document_id ?? null,
      version: required?.version ?? null,
      effective_at: required?.effective_at ?? null,
    },
    channel: download.channel,
    download_url: download.channel === "github" ? download.download_url : null,
  });
});

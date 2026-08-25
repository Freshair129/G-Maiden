import { createClient } from "jsr:@supabase/supabase-js@2.110.2";
import { isPostOrOptions, isPublishableStatus, json, normaliseGid, preflight } from "../_shared/gmad.ts";
import { adminCapabilityForAction } from "../_shared/gmad_admin.ts";
import { iamErrorBody, requireIamContext } from "../_shared/iam_runtime.ts";

type AdminProfile = { id: string; role: string | null };
type GidProfile = { id: string; gid_code: string; generation: string; cohort_seq: number };

async function resolveBounds(admin: any, startValue: unknown, endValue: unknown) {
  const gidStart = normaliseGid(startValue);
  const gidEnd = normaliseGid(endValue);
  if (!gidStart || !gidEnd) return { error: "valid GID bounds are required" } as const;
  const { data: profiles, error } = await admin
    .from("profiles")
    .select("id,gid_code,generation,cohort_seq")
    .in("gid_code", [gidStart, gidEnd]);
  if (error || !profiles || profiles.length !== 2) return { error: "both GID bounds must exist" } as const;
  const start = profiles.find((row: GidProfile) => row.gid_code === gidStart) as GidProfile | undefined;
  const end = profiles.find((row: GidProfile) => row.gid_code === gidEnd) as GidProfile | undefined;
  if (!start || !end || start.generation !== end.generation || start.cohort_seq > end.cohort_seq) {
    return { error: "GID bounds must use one generation in ascending registration order" } as const;
  }
  return { gidStart, gidEnd, start, end } as const;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();
  if (!isPostOrOptions(req.method)) return json(405, { error: "method not allowed" });
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json(401, { error: "invalid_session" });
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(400, { error: "invalid JSON body" }); }
  if (typeof body.action !== "string") return json(400, { error: "action is required" });
  const capability = adminCapabilityForAction(body.action);
  if (!capability) return json(400, { error: "unsupported action" });
  const decision = await requireIamContext(
    authHeader,
    capability,
    "admin-gmad-controller",
    crypto.randomUUID(),
  );
  if (!decision.ok) return json(decision.status, iamErrorBody(decision));
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const actorId = decision.context.userId;
  const role = decision.context.role;

  if (body.action === "change_role") {
    if (role !== "owner") return json(403, { error: "capability_denied" });
    const targetGid = normaliseGid(body.target_gid);
    const nextRole = typeof body.role === "string" ? body.role : "";
    if (!targetGid || !["user", "creator", "admin"].includes(nextRole)) return json(400, { error: "valid target_gid and delegable role are required" });
    const { data: targetData, error: targetError } = await admin.from("profiles").select("id,role").eq("gid_code", targetGid).maybeSingle();
    const target = targetData as AdminProfile | null;
    if (targetError || !target) return json(404, { error: "not_found" });
    if (target.id === actorId) return json(409, { error: "invalid_state" });
    if (target.role === "owner") return json(409, { error: "invalid_state" });
    const { error: updateError } = await admin.from("profiles").update({ role: nextRole }).eq("id", target.id);
    if (updateError) return json(503, { error: "security_dependency_unavailable" });
    await admin.from("gmad_download_audit").insert({ actor_id: actorId, subject_id: target.id, action: "role_changed", detail: { from: target.role, to: nextRole } });
    return json(200, { gid_code: targetGid, role: nextRole });
  }

  if (body.action === "list") {
    const page = typeof body.page === "number" && body.page >= 0 ? Math.floor(body.page) : 0;
    const pageSize = typeof body.page_size === "number" ? Math.min(100, Math.max(1, Math.floor(body.page_size))) : 25;
    const from = page * pageSize;
    const { data: roster, error: rosterError, count } = await admin
      .from("closed_beta_enrollments")
      .select("user_id,status,registered_at,profiles!inner(gid_code,generation,cohort_seq)", { count: "exact" })
      .order("registered_at", { ascending: true })
      .range(from, from + pageSize - 1);
    if (rosterError) return json(503, { error: "security_dependency_unavailable" });
    const { data: batches, error: batchError } = await admin
      .from("gmad_download_batches")
      .select("id,label,release_id,artifact_path,gid_start,gid_end,generation,cohort_seq_start,cohort_seq_end,status,created_at,published_at")
      .order("created_at", { ascending: false });
    if (batchError) return json(503, { error: "security_dependency_unavailable" });
    return json(200, { roster: roster ?? [], roster_total: count ?? 0, batches: batches ?? [], operator_role: role });
  }

  if (body.action === "create_draft") {
    const label = typeof body.label === "string" ? body.label.trim() : "";
    const releaseId = typeof body.release_id === "string" ? body.release_id.trim() : "";
    const artifactPath = typeof body.artifact_path === "string" ? body.artifact_path.trim() : "";
    if (!label || !releaseId || !artifactPath || artifactPath.startsWith("/") || artifactPath.split("/").includes("..")) {
      return json(400, { error: "valid label, release_id and relative artifact_path are required" });
    }
    const bounds = await resolveBounds(admin, body.gid_start, body.gid_end);
    if ("error" in bounds) return json(400, { error: bounds.error });
    const { data: batch, error } = await admin.from("gmad_download_batches").insert({
      label, release_id: releaseId, artifact_path: artifactPath, gid_start: bounds.gidStart, gid_end: bounds.gidEnd,
      generation: bounds.start.generation, cohort_seq_start: bounds.start.cohort_seq, cohort_seq_end: bounds.end.cohort_seq,
      created_by: actorId,
    }).select("id,label,status").single();
    if (error || !batch) return json(503, { error: "security_dependency_unavailable" });
    await admin.from("gmad_download_audit").insert({ actor_id: actorId, batch_id: batch.id, action: "batch_created", detail: { label, release_id: releaseId } });
    return json(201, { batch });
  }

  if (body.action === "publish") {
    const batchId = typeof body.batch_id === "string" ? body.batch_id : "";
    const { data: batch, error: batchError } = await admin
      .from("gmad_download_batches")
      .select("id,status,generation,cohort_seq_start,cohort_seq_end")
      .eq("id", batchId).maybeSingle();
    if (batchError || !batch) return json(404, { error: "not_found" });
    if (batch.status !== "draft") return json(409, { error: "invalid_state" });
    const { data: eligible, error: eligibleError } = await admin
      .from("closed_beta_enrollments")
      .select("user_id,profiles!inner(generation,cohort_seq)")
      .in("status", ["registered", "invited"])
      .eq("profiles.generation", batch.generation)
      .gte("profiles.cohort_seq", batch.cohort_seq_start)
      .lte("profiles.cohort_seq", batch.cohort_seq_end);
    if (eligibleError) return json(503, { error: "security_dependency_unavailable" });
    const grants = (eligible ?? []).map((row: { user_id: string }) => ({ batch_id: batch.id, user_id: row.user_id }));
    if (grants.length) {
      const { error: grantError } = await admin.from("gmad_download_grants").upsert(grants, { onConflict: "batch_id,user_id", ignoreDuplicates: true });
      if (grantError) return json(503, { error: "security_dependency_unavailable" });
    }
    const { error: publishError } = await admin.from("gmad_download_batches").update({ status: "published", published_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", batch.id);
    if (publishError) return json(503, { error: "security_dependency_unavailable" });
    await admin.from("gmad_download_audit").insert({ actor_id: actorId, batch_id: batch.id, action: "batch_published", detail: { grant_count: grants.length } });
    return json(200, { batch_id: batch.id, status: "published", grant_count: grants.length });
  }

  if (body.action === "set_status") {
    const batchId = typeof body.batch_id === "string" ? body.batch_id : "";
    const status = typeof body.status === "string" ? body.status : "";
    if (!isPublishableStatus(status) || (status !== "paused" && status !== "closed")) return json(400, { error: "status must be paused or closed" });
    const { data: batch, error } = await admin.from("gmad_download_batches").update({ status, updated_at: new Date().toISOString() }).eq("id", batchId).select("id,status").maybeSingle();
    if (error || !batch) return json(404, { error: "not_found" });
    await admin.from("gmad_download_audit").insert({ actor_id: actorId, batch_id: batch.id, action: "batch_status_changed", detail: { status } });
    return json(200, { batch });
  }

  return json(400, { error: "unsupported action" });
});

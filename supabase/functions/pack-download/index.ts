// Doc: CR-003 §2.5 (pack-download) · §5.3 EF-06 acceptance — owned item gets a
// signed URL, unowned gets 403, missing JWT gets 401, and the URL expires in
// 5 minutes. Ownership is checked server-side against `inventory` before any
// Supabase Storage signed URL is issued — `catalog_items.bundle_path` lives in
// a private bucket, so this endpoint is the only legitimate way to reach it.
import { createClient } from "jsr:@supabase/supabase-js@2";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const SIGNED_URL_TTL_SECONDS = 300; // CR-003 §2.5 — "อายุ 5 นาที"

Deno.serve(async (req) => {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json(401, { error: "missing authorization" });

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Identify the caller from their JWT (user-scoped client) — same pattern as
  // ../mint-gid/index.ts and ../match-share-submit/index.ts.
  const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json(401, { error: "invalid token" });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid JSON body" });
  }
  const itemId = (body as { item_id?: unknown } | null)?.item_id;
  if (typeof itemId !== "string" || itemId.length === 0) {
    return json(400, { error: "item_id is required" });
  }

  // Privileged client: RLS already scopes `authenticated` reads of `inventory`
  // to the caller's own rows, but we go through service_role here so the
  // "not owned" (403) vs "not found" distinction below is explicit application
  // logic, not an artifact of RLS row-filtering semantics.
  const admin = createClient(url, service);

  const { data: owned, error: invErr } = await admin
    .from("inventory")
    .select("id")
    .eq("user_id", user.id)
    .eq("item_id", itemId)
    .maybeSingle();
  if (invErr) return json(500, { error: invErr.message });
  if (!owned) return json(403, { error: "item not owned" });

  const { data: item, error: itemErr } = await admin
    .from("catalog_items")
    .select("bundle_path")
    .eq("id", itemId)
    .maybeSingle();
  if (itemErr) return json(500, { error: itemErr.message });
  if (!item || !item.bundle_path) return json(404, { error: "bundle not found for this item" });

  const { data: signed, error: signErr } = await admin
    .storage
    .from("packs")
    .createSignedUrl(item.bundle_path, SIGNED_URL_TTL_SECONDS);
  if (signErr || !signed) {
    return json(500, { error: signErr?.message ?? "failed to create signed url" });
  }

  return json(200, { url: signed.signedUrl, expires_in: SIGNED_URL_TTL_SECONDS });
});

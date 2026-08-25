import { createClient } from "jsr:@supabase/supabase-js@2.110.2";
import { json, preflight } from "../_shared/gmad.ts";
import { iamErrorBody, requireIamContext, withIamConnection } from "../_shared/iam_runtime.ts";
import { securityStateProjection } from "../_shared/iam_security.ts";

function headerValue(req: Request, name: string, fallback: string, max: number): string {
  const value = req.headers.get(name)?.trim();
  return value ? value.slice(0, max) : fallback;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "GET") return json(405, { error: "method not allowed" });
  const authorization = req.headers.get("Authorization");
  if (!authorization) return json(401, { error: "invalid_session" });

  const decision = await requireIamContext(
    authorization,
    "iam.security.read",
    "iam-security-state",
    crypto.randomUUID(),
    false,
  );
  if (!decision.ok) return json(decision.status, iamErrorBody(decision));

  const requestId = crypto.randomUUID();
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const publishable = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY");
    if (!url || !publishable) throw new Error("missing auth configuration");
    const caller = createClient(url, publishable, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { Authorization: authorization } },
    });
    const factorsResult = await caller.auth.mfa.listFactors();
    if (factorsResult.error) throw factorsResult.error;

    await withIamConnection((client) => client.queryObject(
      "select iam_private.record_device_seen($1, $2, $3, $4, $5)",
      [
        decision.context.userId,
        decision.context.sessionId,
        headerValue(req, "x-gmaiden-device-label", "", 64) || null,
        headerValue(req, "x-gmaiden-platform", "desktop", 32),
        headerValue(req, "x-gmaiden-app-version", "unknown", 32),
      ],
    ));

    const devices = await withIamConnection(async (client) => {
      const result = await client.queryObject<{
        id: string;
        provider_session_id: string;
        user_label: string | null;
        platform: string;
        app_version: string;
        first_seen_at: string;
        last_seen_at: string;
        revoked_at: string | null;
      }>("select * from iam_private.device_projection($1)", [decision.context.userId]);
      return result.rows;
    });

    const factorData = factorsResult.data as {
      all?: Array<{ factor_type: string; status: string }>;
    } | null;
    const projection = securityStateProjection({
      sessionId: decision.context.sessionId,
      aal: decision.context.aal,
      factors: factorData?.all ?? [],
      devices,
    });
    return json(200, {
      ...projection,
      observed_device_source: "app_observed",
      request_id: requestId,
    });
  } catch {
    return json(503, { error: "security_dependency_unavailable" });
  }
});

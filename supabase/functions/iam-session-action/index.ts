import { createClient } from "jsr:@supabase/supabase-js@2.110.2";
import { isPostOrOptions, json, preflight } from "../_shared/gmad.ts";
import { iamErrorBody, requireIamContext } from "../_shared/iam_runtime.ts";
import {
  parseSessionScope,
  providerSignOutScope,
} from "../_shared/iam_security.ts";
import { appendIamSecurityEvent } from "../_shared/iam_runtime.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();
  if (!isPostOrOptions(req.method)) return json(405, { error: "method not allowed" });
  const authorization = req.headers.get("Authorization");
  if (!authorization) return json(401, { error: "invalid_session" });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid JSON body" });
  }
  const scope = parseSessionScope(body.scope);
  if (!scope) return json(400, { error: "scope must be current or others" });

  const requestId = crypto.randomUUID();
  const decision = await requireIamContext(
    authorization,
    "iam.session.revoke",
    "iam-session-action",
    requestId,
    scope === "others",
  );
  if (!decision.ok) return json(decision.status, iamErrorBody(decision));

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const publishable = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY");
    if (!url || !publishable) throw new Error("missing auth configuration");
    const caller = createClient(url, publishable, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { Authorization: authorization } },
    });
    const providerScope = providerSignOutScope(scope);
    const { error } = await caller.auth.signOut({ scope: providerScope });
    if (error) return json(503, { error: "security_dependency_unavailable" });

    await appendIamSecurityEvent({
      requestId,
      actorUserId: decision.context.userId,
      sessionId: decision.context.sessionId,
      eventType: "session_signout",
      outcome: "success",
      source: "iam-session-action",
      context: { action: "sign_out", scope, result: "success" },
    });
    return json(200, {
      scope,
      provider_scope: providerScope,
      runtime_lock_required: scope === "current",
      request_id: requestId,
    });
  } catch {
    return json(503, { error: "security_dependency_unavailable" });
  }
});

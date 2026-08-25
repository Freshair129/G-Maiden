import { json, preflight } from "../_shared/gmad.ts";
import { iamErrorBody, requireIamContext, withIamConnection } from "../_shared/iam_runtime.ts";
import { parseSecurityActivityCursor, projectSecurityEvent } from "../_shared/iam_security.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "GET") return json(405, { error: "method not allowed" });
  const authorization = req.headers.get("Authorization");
  if (!authorization) return json(401, { error: "invalid_session" });
  const decision = await requireIamContext(
    authorization,
    "iam.security.read",
    "iam-security-events",
    crypto.randomUUID(),
    false,
  );
  if (!decision.ok) return json(decision.status, iamErrorBody(decision));

  const url = new URL(req.url);
  const cursorResult = parseSecurityActivityCursor(
    url.searchParams.get("before"),
    url.searchParams.get("before_id"),
  );
  if (!cursorResult.ok) return json(400, { error: "invalid cursor" });
  const before = cursorResult.cursor?.before ?? null;
  const beforeId = cursorResult.cursor?.beforeId ?? null;
  const requestedLimit = Number(url.searchParams.get("limit") ?? "25");
  const limit = Number.isInteger(requestedLimit) ? Math.min(100, Math.max(1, requestedLimit)) : 25;

  try {
    const result = await withIamConnection(async (client) => client.queryObject<{
      id: string;
      event_type: string;
      outcome: string;
      source: string;
      session_id: string | null;
      context: Record<string, unknown>;
      occurred_at: string;
    }>(
      "select * from iam_private.security_events_for_user($1, $2, $3, $4)",
      [decision.context.userId, before, limit, beforeId],
    ));
    const events = result.rows.map(projectSecurityEvent);
    return json(200, {
      events,
      next_before: result.rows.length === limit
        ? result.rows[result.rows.length - 1]?.occurred_at ?? null
        : null,
      next_before_id: result.rows.length === limit
        ? result.rows[result.rows.length - 1]?.id ?? null
        : null,
    });
  } catch {
    return json(503, { error: "security_dependency_unavailable" });
  }
});

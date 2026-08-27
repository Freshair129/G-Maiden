import { Pool, type PoolClient } from "jsr:@db/postgres@0.19.5";
import { createClient } from "jsr:@supabase/supabase-js@2.110.2";
import {
  type IamAuthorizationEvent,
  type IamCapability,
  type IamContext,
  type IamDecision,
  type IamDependencies,
  type IamRole,
  resolveIamContext,
  sanitizeAuditContext,
} from "./iam.ts";

let pool: Pool | null = null;
let auditKey: Promise<CryptoKey> | null = null;

function environment(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`missing ${name}`);
  return value;
}

function databasePool(): Pool {
  if (!pool) pool = new Pool(environment("IAM_DATABASE_URL"), 1);
  return pool;
}

async function withConnection<T>(
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await databasePool().connect();
  try {
    return await operation(client);
  } finally {
    client.release();
  }
}

// Edge Functions use the same least-privilege runtime connection as the
// authorization resolver. Keeping this wrapper here prevents feature routes
// from reaching for service-role database access or duplicating connection
// setup and error handling.
export const withIamConnection = withConnection;

function hmacKey(): Promise<CryptoKey> {
  if (!auditKey) {
    auditKey = crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(environment("IAM_AUDIT_HMAC_KEY")),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
  }
  return auditKey;
}

async function referenceHash(value: string): Promise<Uint8Array> {
  return new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      await hmacKey(),
      new TextEncoder().encode(value),
    ),
  );
}

function retentionUntil(): Date {
  const configured = Number(Deno.env.get("IAM_AUDIT_RETENTION_DAYS") ?? "365");
  if (!Number.isInteger(configured) || configured < 30 || configured > 3650) {
    throw new Error("invalid IAM_AUDIT_RETENTION_DAYS");
  }
  return new Date(Date.now() + configured * 86_400_000);
}

async function appendAuthorizationEvent(
  source: string,
  requestId: string,
  event: IamAuthorizationEvent,
): Promise<void> {
  const userHash = await referenceHash(event.userId);
  const context = sanitizeAuditContext({
    capability: event.capability,
    reason_code: event.reasonCode,
    result: event.outcome,
    source,
  });
  await withConnection(async (client) => {
    await client.queryObject(
      `insert into iam_private.security_events (
         request_id, actor_user_id, subject_user_id, actor_ref_hash, subject_ref_hash,
         event_type, outcome, source, session_id, context, retention_until
       ) values ($1, $2, $2, $3, $3, $4, $5, $6, $7, $8::jsonb, $9)`,
      [
        requestId,
        event.userId,
        userHash,
        event.outcome === "success"
          ? "authorization_granted"
          : "authorization_denied",
        event.outcome,
        source,
        event.sessionId,
        JSON.stringify(context),
        retentionUntil(),
      ],
    );
  });
}

export type IamSecurityEvent = {
  requestId: string;
  actorUserId: string;
  subjectUserId?: string;
  sessionId?: string;
  eventType: "session_signout";
  outcome: "success" | "denied" | "failure";
  source: string;
  context: Record<string, unknown>;
};

export async function appendIamSecurityEvent(
  event: IamSecurityEvent,
): Promise<void> {
  const actorHash = await referenceHash(event.actorUserId);
  const subjectId = event.subjectUserId ?? event.actorUserId;
  const subjectHash = await referenceHash(subjectId);
  const context = sanitizeAuditContext({
    ...event.context,
    source: event.source,
  });
  await withConnection(async (client) => {
    await client.queryObject(
      `insert into iam_private.security_events (
         request_id, actor_user_id, subject_user_id, actor_ref_hash, subject_ref_hash,
         event_type, outcome, source, session_id, context, retention_until
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11)`,
      [
        event.requestId,
        event.actorUserId,
        subjectId,
        actorHash,
        subjectHash,
        event.eventType,
        event.outcome,
        event.source,
        event.sessionId ?? null,
        JSON.stringify(context),
        retentionUntil(),
      ],
    );
  });
}

function dependencies(source: string, requestId: string): IamDependencies {
  return {
    verifyUser: async (accessToken) => {
      const client = createClient(
        environment("SUPABASE_URL"),
        Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
          environment("SUPABASE_ANON_KEY"),
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
        },
      );
      const { data: { user }, error } = await client.auth.getUser(accessToken);
      if (error || !user) return null;
      return { id: user.id, app_metadata: user.app_metadata };
    },
    sessionExists: (userId, sessionId) =>
      withConnection(async (client) => {
        const result = await client.queryObject<{ exists: boolean }>(
          "select iam_private.session_is_active($1, $2) as exists",
          [userId, sessionId],
        );
        return result.rows[0]?.exists === true;
      }),
    loadRole: (userId) =>
      withConnection(async (client) => {
        const result = await client.queryObject<{ role: string | null }>(
          "select iam_private.role_for_user($1) as role",
          [userId],
        );
        const role = result.rows[0]?.role;
        return role === "user" || role === "creator" || role === "admin" ||
            role === "owner"
          ? role as IamRole
          : null;
      }),
    recordDecision: (event) =>
      appendAuthorizationEvent(source, requestId, event),
  };
}

export async function requireIamContext(
  authorization: string,
  capability: IamCapability,
  source: string,
  requestId: string,
  requireAal2 = true,
): Promise<IamDecision> {
  return await resolveIamContext(
    authorization,
    capability,
    requireAal2,
    dependencies(source, requestId),
  );
}

export function iamErrorBody(
  decision: Exclude<IamDecision, { ok: true }>,
): { error: string } {
  return { error: decision.code };
}

export type { IamContext };

import { isGoogleIdentity } from "./entitlement.ts";

export type IamRole = "user" | "creator" | "admin" | "owner";
export type IamAal = "aal1" | "aal2";
export type IamCapability =
  | "gmad.batch.manage"
  | "iam.role.delegate"
  | "iam.audit.read"
  | "iam.security.read"
  | "iam.session.revoke";

type IamAuditReasonCode = IamErrorCode | "invalid_identity";

export type IamUser = {
  id: string;
  app_metadata?: Record<string, unknown>;
};

export type IamDependencies = {
  verifyUser: (accessToken: string) => Promise<IamUser | null>;
  sessionExists: (userId: string, sessionId: string) => Promise<boolean>;
  loadRole: (userId: string) => Promise<IamRole | null>;
  recordDecision?: (event: IamAuthorizationEvent) => Promise<void>;
};

export type IamAuthorizationEvent = {
  userId: string;
  sessionId: string;
  aal: IamAal;
  role: IamRole | null;
  capability: IamCapability;
  outcome: "success" | "denied";
  reasonCode:
    | "authorized"
    | Exclude<IamAuditReasonCode, "security_dependency_unavailable">;
};

export type IamContext = {
  userId: string;
  sessionId: string;
  aal: IamAal;
  role: IamRole;
};

export type IamErrorCode =
  | "invalid_session"
  | "step_up_required"
  | "capability_denied"
  | "security_dependency_unavailable";

export type IamDecision =
  | { ok: true; context: IamContext }
  | { ok: false; status: 401 | 403 | 503; code: IamErrorCode };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CAPABILITIES: Record<IamCapability, readonly IamRole[]> = {
  "gmad.batch.manage": ["admin", "owner"],
  "iam.role.delegate": ["owner"],
  "iam.audit.read": ["admin", "owner"],
  "iam.security.read": ["user", "creator", "admin", "owner"],
  "iam.session.revoke": ["user", "creator", "admin", "owner"],
};

function accessTokenFromHeader(authorization: string): string | null {
  const match = /^Bearer\s+([^\s]+)$/i.exec(authorization.trim());
  return match?.[1] ?? null;
}

function decodeClaims(
  accessToken: string,
): { sub: string; sessionId: string; aal: IamAal } | null {
  const parts = accessToken.split(".");
  if (parts.length !== 3) return null;
  try {
    const normalized = parts[1].replaceAll("-", "+").replaceAll("_", "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const payload = JSON.parse(atob(padded)) as Record<string, unknown>;
    if (
      typeof payload.sub !== "string" || typeof payload.session_id !== "string"
    ) return null;
    if (!UUID.test(payload.sub) || !UUID.test(payload.session_id)) return null;
    if (
      payload.aal !== undefined && payload.aal !== "aal1" &&
      payload.aal !== "aal2"
    ) return null;
    return {
      sub: payload.sub,
      sessionId: payload.session_id,
      aal: payload.aal === "aal2" ? "aal2" : "aal1",
    };
  } catch {
    return null;
  }
}

export async function resolveIamContext(
  authorization: string,
  capability: IamCapability,
  requireAal2: boolean,
  dependencies: IamDependencies,
): Promise<IamDecision> {
  const accessToken = accessTokenFromHeader(authorization);
  if (!accessToken) return { ok: false, status: 401, code: "invalid_session" };
  const claims = decodeClaims(accessToken);
  if (!claims) return { ok: false, status: 401, code: "invalid_session" };

  try {
    const user = await dependencies.verifyUser(accessToken);
    if (!user || user.id !== claims.sub) {
      return { ok: false, status: 401, code: "invalid_session" };
    }
    if (!isGoogleIdentity(user)) {
      await dependencies.recordDecision?.({
        userId: user.id,
        sessionId: claims.sessionId,
        aal: claims.aal,
        role: null,
        capability,
        outcome: "denied",
        reasonCode: "invalid_identity",
      });
      return { ok: false, status: 401, code: "invalid_session" };
    }
    if (!await dependencies.sessionExists(user.id, claims.sessionId)) {
      await dependencies.recordDecision?.({
        userId: user.id,
        sessionId: claims.sessionId,
        aal: claims.aal,
        role: null,
        capability,
        outcome: "denied",
        reasonCode: "invalid_session",
      });
      return { ok: false, status: 401, code: "invalid_session" };
    }
    if (requireAal2 && claims.aal !== "aal2") {
      await dependencies.recordDecision?.({
        userId: user.id,
        sessionId: claims.sessionId,
        aal: claims.aal,
        role: null,
        capability,
        outcome: "denied",
        reasonCode: "step_up_required",
      });
      return { ok: false, status: 403, code: "step_up_required" };
    }
    const role = await dependencies.loadRole(user.id);
    if (!role || !CAPABILITIES[capability].includes(role)) {
      await dependencies.recordDecision?.({
        userId: user.id,
        sessionId: claims.sessionId,
        aal: claims.aal,
        role,
        capability,
        outcome: "denied",
        reasonCode: "capability_denied",
      });
      return { ok: false, status: 403, code: "capability_denied" };
    }
    await dependencies.recordDecision?.({
      userId: user.id,
      sessionId: claims.sessionId,
      aal: claims.aal,
      role,
      capability,
      outcome: "success",
      reasonCode: "authorized",
    });
    return {
      ok: true,
      context: {
        userId: user.id,
        sessionId: claims.sessionId,
        aal: claims.aal,
        role,
      },
    };
  } catch {
    return { ok: false, status: 503, code: "security_dependency_unavailable" };
  }
}

const AUDIT_KEYS = new Set([
  "action",
  "batch_id",
  "capability",
  "reason_code",
  "result",
  "scope",
  "source",
  "status",
  "target_gid",
]);

export function sanitizeAuditContext(
  input: Record<string, unknown>,
): Record<string, string | number | boolean | null> {
  const output: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!AUDIT_KEYS.has(key)) continue;
    if (
      value === null || typeof value === "string" ||
      typeof value === "number" || typeof value === "boolean"
    ) {
      output[key] = value;
    }
  }
  return output;
}

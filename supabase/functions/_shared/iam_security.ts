export type SecuritySessionScope = "current" | "others";

const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type SecurityActivityCursor = {
  before: string;
  beforeId: string;
};

export type SecurityActivityCursorResult =
  | { ok: true; cursor: SecurityActivityCursor | null }
  | { ok: false };

export function parseSecurityActivityCursor(
  beforeRaw: string | null,
  beforeIdRaw: string | null,
): SecurityActivityCursorResult {
  if (beforeRaw === null && beforeIdRaw === null) return { ok: true, cursor: null };
  if (
    beforeRaw === null || beforeIdRaw === null || !beforeRaw.trim() ||
    !SESSION_ID.test(beforeIdRaw)
  ) {
    return { ok: false };
  }
  const before = new Date(beforeRaw);
  if (Number.isNaN(before.getTime())) return { ok: false };
  return { ok: true, cursor: { before: before.toISOString(), beforeId: beforeIdRaw } };
}

export function parseSessionScope(value: unknown): SecuritySessionScope | null {
  return value === "current" || value === "others" ? value : null;
}

export function providerSignOutScope(
  scope: SecuritySessionScope,
): "local" | "others" {
  return scope === "current" ? "local" : "others";
}

export function maskSessionReference(value: unknown): string | null {
  if (typeof value !== "string" || !SESSION_ID.test(value)) return null;
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}

type DeviceRow = {
  id: string;
  provider_session_id: string;
  user_label: string | null;
  platform: string;
  app_version: string;
  first_seen_at: string;
  last_seen_at: string;
  revoked_at: string | null;
};

export function projectDevice(row: DeviceRow) {
  return {
    id: row.id,
    label: row.user_label,
    platform: row.platform,
    app_version: row.app_version,
    first_seen_at: row.first_seen_at,
    last_seen_at: row.last_seen_at,
    revoked_at: row.revoked_at,
    source: "app_observed" as const,
    session_ref: maskSessionReference(row.provider_session_id),
  };
}

type SecurityEventRow = {
  id: string;
  event_type: string;
  outcome: string;
  source: string;
  session_id: string | null;
  context: unknown;
  occurred_at: string;
};

const EVENT_CONTEXT_KEYS = new Set([
  "action",
  "capability",
  "reason_code",
  "result",
  "scope",
  "source",
  "status",
]);

export function projectSecurityEvent(row: SecurityEventRow) {
  const context: Record<string, string | number | boolean | null> = {};
  if (!row.context || typeof row.context !== "object" || Array.isArray(row.context)) {
    return {
      id: row.id,
      event_type: row.event_type,
      outcome: row.outcome,
      source: row.source,
      session_ref: maskSessionReference(row.session_id),
      context,
      occurred_at: row.occurred_at,
    };
  }
  for (const [key, value] of Object.entries(row.context as Record<string, unknown>)) {
    if (!EVENT_CONTEXT_KEYS.has(key)) continue;
    if (
      value === null || typeof value === "string" ||
      typeof value === "number" || typeof value === "boolean"
    ) context[key] = value;
  }
  return {
    id: row.id,
    event_type: row.event_type,
    outcome: row.outcome,
    source: row.source,
    session_ref: maskSessionReference(row.session_id),
    context,
    occurred_at: row.occurred_at,
  };
}

type SecurityStateInput = {
  sessionId: string;
  aal: "aal1" | "aal2";
  factors: Array<{ factor_type: string; status: string }>;
  devices: DeviceRow[];
};

export function securityStateProjection(input: SecurityStateInput) {
  const factors = input.factors
    .filter((factor) => ["totp", "phone", "webauthn"].includes(factor.factor_type))
    .filter((factor) => ["verified", "unverified"].includes(factor.status))
    .map((factor) => ({ type: factor.factor_type, status: factor.status }));
  return {
    current_session: {
      session_ref: maskSessionReference(input.sessionId),
      aal: input.aal,
      authoritative: true,
    },
    factors,
    // Recovery contacts are a Phase 4 surface. An empty projection here is
    // intentional: it never implies that a contact exists or is verified.
    contacts: [],
    devices: input.devices.map(projectDevice),
  };
}

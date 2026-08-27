import { supabase } from "./supabase";
import { APP_VERSION } from "./app/theme";

export type SecuritySessionScope = "current" | "others";

export type SecurityDevice = {
  id: string;
  label: string | null;
  platform: string;
  app_version: string;
  first_seen_at: string;
  last_seen_at: string;
  revoked_at: string | null;
  source: "app_observed";
  session_ref: string | null;
};

export type SecurityState = {
  current_session: {
    session_ref: string | null;
    aal: "aal1" | "aal2";
    authoritative: true;
  };
  factors: Array<{ type: string; status: string }>;
  contacts: [];
  devices: SecurityDevice[];
  observed_device_source: "app_observed";
};

export type SecurityEvent = {
  id: string;
  event_type: string;
  outcome: string;
  source: string;
  session_ref: string | null;
  context: Record<string, string | number | boolean | null>;
  occurred_at: string;
};

function deviceHeaders(): Record<string, string> {
  return {
    "x-gmaiden-platform": "windows",
    "x-gmaiden-app-version": APP_VERSION,
  };
}

function functionError(error: unknown): Error {
  const message = (error as { message?: unknown })?.message;
  return new Error(typeof message === "string" ? message : "security service unavailable");
}

export async function readSecurityState(): Promise<SecurityState> {
  const { data, error } = await supabase.functions.invoke<SecurityState>("iam-security-state", {
    method: "GET",
    headers: deviceHeaders(),
  });
  if (error || !data) throw functionError(error);
  return data;
}

export async function readSecurityEvents(): Promise<SecurityEvent[]> {
  const { data, error } = await supabase.functions.invoke<{ events?: SecurityEvent[] }>("iam-security-events", {
    method: "GET",
  });
  if (error || !data) throw functionError(error);
  return data.events ?? [];
}

export async function requestSessionAction(scope: SecuritySessionScope): Promise<void> {
  const { error } = await supabase.functions.invoke("iam-session-action", {
    method: "POST",
    body: { scope },
  });
  if (error) throw functionError(error);
}

#!/usr/bin/env node

const DEFAULT_SUPABASE_URL = "https://wsseitulmcgnolgsrxgh.supabase.co";
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = "sb_publishable__vr0-aNdudlq3aPbH8OMXw_0rr0JScZ";
const APP_VERSION = "0.13.2";
const REQUEST_TIMEOUT_MS = 15_000;
const RECOGNIZED_ERROR_CODES = new Set([
  "security_dependency_unavailable",
  "step_up_required",
  "capability_denied",
  "invalid_session",
]);

const PROBES = [
  {
    name: "iam-security-state",
    method: "GET",
    path: "iam-security-state",
  },
  {
    name: "iam-security-events",
    method: "GET",
    path: "iam-security-events",
  },
  {
    name: "admin-gmad-controller",
    method: "POST",
    path: "admin-gmad-controller",
    body: { action: "list", page: 0, page_size: 1 },
  },
];

function endpoint(baseUrl, functionName) {
  return `${baseUrl.replace(/\/+$/, "")}/functions/v1/${functionName}`;
}

function parseErrorCode(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const candidate = payload.error;
  return typeof candidate === "string" && RECOGNIZED_ERROR_CODES.has(candidate) ? candidate : null;
}

function verdictFor(status, errorCode) {
  if (status === 200) return "WIRED";
  if (status === 503 && errorCode === "security_dependency_unavailable") {
    return "SECRETS-OR-DB-UNREACHABLE";
  }
  if (status === 403 && errorCode === "step_up_required") {
    return "AAL2-LOCKOUT (expected until T1/T6)";
  }
  if (status === 403 && errorCode === "capability_denied") return "ROLE-MISMATCH";
  if (status === 401 && errorCode === "invalid_session") return "TOKEN-OR-SESSION-INVALID";
  return null;
}

async function runProbe(probe, headers, baseUrl) {
  let response;
  try {
    response = await fetch(endpoint(baseUrl, probe.path), {
      method: probe.method,
      headers,
      body: probe.body ? JSON.stringify(probe.body) : undefined,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    return { status: "network_error", errorCode: null, verdict: null };
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    // A non-JSON response is intentionally treated as an unrecognized result.
  }

  const errorCode = parseErrorCode(payload);
  return {
    status: response.status,
    errorCode,
    verdict: verdictFor(response.status, errorCode),
  };
}

async function main() {
  const accessToken = process.env.GMAD_ACCESS_TOKEN?.trim();
  if (!accessToken) {
    console.error("GMAD_ACCESS_TOKEN is required; obtain a signed-in Supabase access token first.");
    process.exitCode = 1;
    return;
  }

  const baseUrl = process.env.SUPABASE_URL?.trim() || DEFAULT_SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY?.trim() || DEFAULT_SUPABASE_PUBLISHABLE_KEY;
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    apikey: publishableKey,
    "x-gmaiden-platform": "desktop",
    "x-gmaiden-app-version": APP_VERSION,
    "content-type": "application/json",
  };

  let allRecognized = true;
  for (const probe of PROBES) {
    const result = await runProbe(probe, headers, baseUrl);
    const errorCode = result.errorCode ?? "none";
    const verdict = result.verdict ?? "UNRECOGNIZED";
    console.log(`${probe.name}: status=${result.status} error=${errorCode} verdict=${verdict}`);
    if (!result.verdict) allRecognized = false;
  }

  process.exitCode = allRecognized ? 0 : 1;
}

main().catch(() => {
  console.error("IAM live probe failed before completing the requests.");
  process.exitCode = 1;
});

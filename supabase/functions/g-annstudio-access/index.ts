import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json(405, { error: "method not allowed" });

  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return json(401, { error: "missing authorization" });

  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const allowedEmails = (Deno.env.get("G_ANNSTUDIO_ALLOWED_EMAILS") ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  if (!url || !anon) return json(503, { error: "authorization service is not configured" });
  if (allowedEmails.length === 0) return json(503, { error: "developer allowlist is not configured" });

  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) return json(401, { error: "invalid session" });

  const email = user.email?.trim().toLowerCase();
  const isGoogleAccount = user.app_metadata?.provider === "google"
    || user.app_metadata?.providers?.includes("google") === true;
  if (!email || !user.email_confirmed_at || !isGoogleAccount || !allowedEmails.includes(email)) {
    return json(403, { error: "developer access required" });
  }

  return json(200, { authorized: true, expires_in: 600 });
});

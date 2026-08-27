export const GMAD_BUCKET = "gmad-releases";
export const GMAD_SIGNED_URL_TTL_SECONDS = 300;

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-gmaiden-platform, x-gmaiden-app-version, x-gmaiden-device-label",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

export function preflight(): Response {
  return new Response("ok", { headers: corsHeaders });
}

export function isPostOrOptions(method: string): boolean {
  return method === "POST" || method === "OPTIONS";
}

export function normaliseGid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const gid = value.trim().toUpperCase();
  return /^G-[FBP][23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6,10}$/.test(gid) ? gid : null;
}

export function isPublishableStatus(status: string): boolean {
  return status === "draft" || status === "published" || status === "paused" || status === "closed";
}

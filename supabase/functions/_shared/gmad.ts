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

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function isAllowedMintMethod(method: string): boolean {
  return method === "POST" || method === "OPTIONS";
}

export function corsJson(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

export function corsPreflight(): Response {
  return new Response("ok", { headers: corsHeaders });
}

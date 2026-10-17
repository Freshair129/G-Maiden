// Doc: CR-003 §2.5 (pack-download) · §5.3 EF-06 acceptance — a purchased item
// gets a signed URL and signed install receipt, unpurchased gets 403, missing
// JWT gets 401, and the URL expires in 5 minutes. Ownership is checked
// server-side against `inventory` before any Supabase Storage signed URL is
// issued — `catalog_items.bundle_path` lives in a private bucket, so this
// endpoint is the only legitimate way to reach it.
import { createClient } from "jsr:@supabase/supabase-js@2";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const SIGNED_URL_TTL_SECONDS = 300; // CR-003 §2.5 — "อายุ 5 นาที"

type StoreInstallReceipt = {
  version: 1;
  userId: string;
  itemId: string;
  packId: string;
  issuedAt: string;
  signature: string;
};

async function signedInstallReceipt(userId: string, itemId: string, packId: string): Promise<StoreInstallReceipt> {
  const privateKeyB64 = Deno.env.get("PACK_INSTALL_SIGNING_PRIVATE_KEY_PKCS8");
  if (!privateKeyB64) throw new Error("install receipt signer is not configured");
  const binary = atob(privateKeyB64);
  const privateKeyBytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    privateKeyBytes,
    { name: "Ed25519" },
    false,
    ["sign"],
  );
  const issuedAt = new Date().toISOString();
  const message = `gmaiden-store-install-v1\n${userId}\n${itemId}\n${packId}\n${issuedAt}`;
  const signature = await crypto.subtle.sign(
    { name: "Ed25519" },
    privateKey,
    new TextEncoder().encode(message),
  );
  const bytes = new Uint8Array(signature);
  const signatureB64 = btoa(String.fromCharCode(...bytes));
  return {
    version: 1,
    userId,
    itemId,
    packId,
    issuedAt,
    signature: signatureB64,
  };
}

Deno.serve(async (req) => {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json(401, { error: "missing authorization" });

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Identify the caller from their JWT (user-scoped client) — same pattern as
  // ../mint-gid/index.ts and ../match-share-submit/index.ts.
  const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json(401, { error: "invalid token" });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid JSON body" });
  }
  const itemId = (body as { item_id?: unknown } | null)?.item_id;
  if (typeof itemId !== "string" || itemId.length === 0) {
    return json(400, { error: "item_id is required" });
  }

  // Only a completed Store purchase authorizes a consumer install. Starter
  // grants, admin grants, and redeem codes do not authorize pack downloads.
  const admin = createClient(url, service);

  const { data: owned, error: invErr } = await admin
    .from("inventory")
    .select("id, source")
    .eq("user_id", user.id)
    .eq("item_id", itemId)
    .maybeSingle();
  if (invErr) return json(500, { error: invErr.message });
  if (!owned || owned.source !== "purchase") {
    return json(403, { error: "pack must be purchased from the Store" });
  }

  const { data: item, error: itemErr } = await admin
    .from("catalog_items")
    .select("item_type, pack_id, bundle_path, status")
    .eq("id", itemId)
    .maybeSingle();
  if (itemErr) return json(500, { error: itemErr.message });
  if (!item || item.item_type !== "announcer_pack" || item.status !== "active") {
    return json(404, { error: "active announcer pack not found" });
  }
  if (!item.pack_id || !item.bundle_path) {
    return json(404, { error: "bundle not found for this item" });
  }

  let installReceipt: StoreInstallReceipt;
  try {
    installReceipt = await signedInstallReceipt(user.id, itemId, item.pack_id);
  } catch {
    return json(503, { error: "Store install receipt signer is not configured" });
  }

  const { data: signed, error: signErr } = await admin
    .storage
    .from("packs")
    .createSignedUrl(item.bundle_path, SIGNED_URL_TTL_SECONDS);
  if (signErr || !signed) {
    return json(500, { error: signErr?.message ?? "failed to create signed url" });
  }

  return json(200, {
    item_id: itemId,
    pack_id: item.pack_id,
    url: signed.signedUrl,
    expires_in: SIGNED_URL_TTL_SECONDS,
    install_receipt: installReceipt,
  });
});

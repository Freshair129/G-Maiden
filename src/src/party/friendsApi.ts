import { supabase } from "../supabase";
import { localAuthBlocked } from "../securitySession";
import { parseSocialResult, socialSessionKey, validSocialAction, type SocialAction } from "./friendsModel";

const ENDPOINT = "https://wsseitulmcgnolgsrxgh.supabase.co/functions/v1/g-party-social";
export function socialRequest<T>(body: SocialAction, signal?: AbortSignal): Promise<T> {
  return brokerRequest<T>(body, signal);
}
export function sessionSocialRequest<T>(body: SocialAction, expectedSessionKey: string, signal?: AbortSignal): Promise<T> {
  return brokerRequest<T>(body, signal, expectedSessionKey);
}
async function brokerRequest<T>(body: SocialAction, signal?: AbortSignal, expectedSessionKey?: string): Promise<T> {
  if (localAuthBlocked() || !validSocialAction(body)) throw new Error("invalid_session");
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  const key = socialSessionKey(session);
  if (!key || !session || (expectedSessionKey !== undefined && expectedSessionKey !== key) || localAuthBlocked()) throw new Error("invalid_session");
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timer = setTimeout(abort, 5000);
  try {
    const response = await fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(body), signal: controller.signal, redirect: "error", cache: "no-store" });
    // Stream with a hard byte cap: a dishonest Content-Length cannot allocate an
    // unbounded renderer string before validation.
    const reader = response.body?.getReader();
    if (!reader) throw new Error("social_unavailable");
    const chunks: Uint8Array[] = []; let size = 0;
    for (;;) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.byteLength;
      if (size > 262144) { await reader.cancel(); throw new Error("social_unavailable"); }
      chunks.push(part.value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    const current = await supabase.auth.getSession();
    if (signal?.aborted || controller.signal.aborted || localAuthBlocked() || socialSessionKey(current.data.session) !== key) throw new Error("invalid_session");
    if (!response.ok) throw new Error("social_unavailable");
    const parsed = parseSocialResult(body, value);
    if (parsed === null) throw new Error("social_unavailable");
    return parsed as T;
  } finally { clearTimeout(timer); signal?.removeEventListener("abort", abort); }
}

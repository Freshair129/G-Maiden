// GID profile (display name) — shared between the topbar and the Account page so
// setting your name reflects everywhere immediately. Backed by the `profiles`
// row in Supabase (gstore); reactive via a window event on save.

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";
import { useAuth } from "./auth";
import { GENERATIONS, type Generation } from "./gid";
import { localAuthBlocked } from "./securitySession";

const PROFILE_EVENT = "gmaiden:profile";

export function useProfile() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [displayName, setDisplayName] = useState("");
  const [gidCode, setGidCode] = useState("");
  const [generation, setGeneration] = useState<Generation | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [dataEpoch, setDataEpoch] = useState(0);
  const owner = useRef({ userId, epoch: 0 });
  if (owner.current.userId !== userId) owner.current = { userId, epoch: owner.current.epoch + 1 };
  const request = useRef({ seq: 0 });

  const load = useCallback(async () => {
    if (owner.current.userId !== userId || localAuthBlocked()) return;
    const epoch = owner.current.epoch;
    const seq = ++request.current.seq;
    const current = () => owner.current.userId === userId && owner.current.epoch === epoch && request.current.seq === seq && !localAuthBlocked();
    if (!userId) { setDisplayName(""); setGidCode(""); setGeneration(null); setLoaded(true); return; }
    const { data } = await supabase
      .from("profiles")
      .select("display_name, gid_code, generation")
      .eq("id", userId)
      .maybeSingle();

    if (!current()) return;

    const gen = (data?.generation as Generation | null) ?? null;
    setDisplayName((data?.display_name as string | null) ?? "");
    setGeneration(gen && gen in GENERATIONS ? gen : null);

    // GID is minted server-side (Edge Fn `mint-gid`, SEC-001 §2 Phase B): the
    // client can no longer write gid_code (it's column-locked to prevent GID /
    // Founder forgery), so ask the server to mint it once — idempotent there.
    let code = (data?.gid_code as string | null) ?? "";
    if (!code) {
      try {
        const { data: minted } = await supabase.functions.invoke<{ gid_code?: string }>("mint-gid");
        code = minted?.gid_code ?? "";
      } catch {
        code = "";
      }
    }
    if (!current()) return;
    setGidCode(code);
    setLoaded(true);
  }, [userId]);

  useEffect(() => {
    const lifetime = owner.current;
    const requests = request.current;
    setDataEpoch(owner.current.epoch);
    setDisplayName(""); setGidCode(""); setGeneration(null); setLoaded(false);
    void load();
    const handler = () => void load();
    window.addEventListener(PROFILE_EVENT, handler);
    return () => { requests.seq++; lifetime.epoch++; window.removeEventListener(PROFILE_EVENT, handler); };
  }, [load]);

  const save = useCallback(async (name: string): Promise<string | null> => {
    if (!userId || localAuthBlocked() || owner.current.userId !== userId) return "not signed in";
    const epoch = owner.current.epoch;
    const { error } = await supabase
      .from("profiles")
      .upsert({ id: userId, display_name: name.trim() }, { onConflict: "id" });
    if (owner.current.userId !== userId || owner.current.epoch !== epoch || localAuthBlocked()) return "account changed";
    if (error) return error.message;
    setDisplayName(name.trim());
    window.dispatchEvent(new CustomEvent(PROFILE_EVENT));
    return null;
  }, [userId]);

  const visible = dataEpoch === owner.current.epoch && !localAuthBlocked();
  const generationName = visible && generation ? GENERATIONS[generation] : "";
  return { user, email: user?.email ?? "", displayName: visible ? displayName : "", gidCode: visible ? gidCode : "",
    generation: visible ? generation : null, generationName, loaded: visible ? loaded : !userId, save };
}

// GID profile (display name) — shared between the topbar and the Account page so
// setting your name reflects everywhere immediately. Backed by the `profiles`
// row in Supabase (gstore); reactive via a window event on save.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import { useAuth } from "./auth";
import { GENERATIONS, type Generation } from "./gid";

const PROFILE_EVENT = "gmaiden:profile";

export function useProfile() {
  const { user } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [gidCode, setGidCode] = useState("");
  const [generation, setGeneration] = useState<Generation | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!user) { setDisplayName(""); setGidCode(""); setGeneration(null); setLoaded(true); return; }
    const { data } = await supabase
      .from("profiles")
      .select("display_name, gid_code, generation")
      .eq("id", user.id)
      .maybeSingle();

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
    setGidCode(code);
    setLoaded(true);
  }, [user?.id]);

  useEffect(() => {
    void load();
    const handler = () => void load();
    window.addEventListener(PROFILE_EVENT, handler);
    return () => window.removeEventListener(PROFILE_EVENT, handler);
  }, [load]);

  const save = useCallback(async (name: string): Promise<string | null> => {
    if (!user) return "not signed in";
    const { error } = await supabase
      .from("profiles")
      .upsert({ id: user.id, display_name: name.trim() }, { onConflict: "id" });
    if (error) return error.message;
    setDisplayName(name.trim());
    window.dispatchEvent(new CustomEvent(PROFILE_EVENT));
    return null;
  }, [user?.id]);

  const generationName = generation ? GENERATIONS[generation] : "";
  return { user, email: user?.email ?? "", displayName, gidCode, generation, generationName, loaded, save };
}

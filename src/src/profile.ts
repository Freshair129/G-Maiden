// GID profile (display name) — shared between the topbar and the Account page so
// setting your name reflects everywhere immediately. Backed by the `profiles`
// row in Supabase (gstore); reactive via a window event on save.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import { useAuth } from "./auth";
import { generateGid, GENERATIONS, type Generation } from "./gid";

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
      .select("display_name, gid_code, generation, cohort_seq, created_at")
      .eq("id", user.id)
      .maybeSingle();

    const gen = (data?.generation as Generation | null) ?? null;
    setDisplayName((data?.display_name as string | null) ?? "");
    setGeneration(gen && gen in GENERATIONS ? gen : null);

    let code = (data?.gid_code as string | null) ?? "";
    const seq = data?.cohort_seq as number | null;
    const createdAt = data?.created_at as string | null;
    // Mint the GID once, from the app's single-sourced codec, and persist it
    // immutably (the `.is null` guard prevents overwriting or racing).
    if (!code && gen && gen in GENERATIONS && seq && createdAt) {
      try {
        code = generateGid({ generation: gen, registeredAt: new Date(createdAt), cohortSeq: seq });
        await supabase.from("profiles").update({ gid_code: code }).eq("id", user.id).is("gid_code", null);
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

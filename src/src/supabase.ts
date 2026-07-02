// Supabase client (account system, Phase B). The publishable/anon key is safe to
// ship client-side — Row Level Security on `profiles` is what protects data.
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://wsseitulmcgnolgsrxgh.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable__vr0-aNdudlq3aPbH8OMXw_0rr0JScZ";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false, // desktop: we handle the callback ourselves
    // PKCE returns the auth `?code=` in the QUERY string (reaches our loopback
    // server) instead of implicit `#access_token=` in the fragment (which the
    // browser never sends to the server).
    flowType: "pkce",
  },
});

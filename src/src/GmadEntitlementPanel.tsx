import { useGmadDesktopEntitlement } from "./gmadEntitlement";

export default function GmadEntitlementPanel() {
  const { state, decision, refresh, signInWithGoogle } = useGmadDesktopEntitlement();
  if (state === "eligible") return <section className="auth-panel signedin"><strong>G-Maiden Closed Beta active</strong><span>{decision?.gid} · Terms {decision?.terms?.version}{decision?.stale ? " · offline — showing your last confirmed access" : ""}</span></section>;
  if (state === "sign_in_required") return <section className="auth-panel"><strong>Google sign-in required</strong><button onClick={() => void signInWithGoogle()}>Continue with Google</button></section>;
  if (state === "terms_required") return <section className="auth-panel"><strong>Current Terms acceptance required</strong><a href="https://g-maiden-landing.vercel.app/terms?from=desktop">Review Terms on landing</a><button onClick={() => void refresh()}>Re-check</button></section>;
  if (state === "no_active_entitlement" || state === "account_not_eligible") return <section className="auth-panel"><strong>No active G-Maiden entitlement</strong><a href="https://g-maiden-landing.vercel.app/#gmad">Open eligibility page</a></section>;
  if (state === "offline_or_unavailable") return <section className="auth-panel"><strong>Unable to verify access</strong><span>Internet is required for first verification.</span><button onClick={() => void refresh()}>Retry</button></section>;
  return <section className="auth-panel"><strong>Checking G-Maiden access…</strong></section>;
}

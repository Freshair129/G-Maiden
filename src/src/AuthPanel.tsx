// G-Maiden account (GID) sign-in card — additive, Google only. Signing in links
// the current Steam identity to the GID profile row.

import { useAuth } from "./auth";
import { useProfile } from "./profile";

export default function AuthPanel() {
  const { user, loading, busy, error, signInWithGoogle, signOut } = useAuth();
  const { gidCode, generationName } = useProfile();

  if (loading) {
    return <div className="auth-panel muted">checking account…</div>;
  }

  if (user) {
    return (
      <div className="auth-panel signedin">
        <div className="auth-row">
          <span className="auth-label">Account</span>
          <span className="auth-badge">GID</span>
        </div>
        <div className="auth-sub">{user.email}</div>
        <div className="auth-gid-label">GID{generationName ? ` · ${generationName}` : ""}</div>
        <code className="auth-gid" title={user.id}>{gidCode || "…"}</code>
        <button type="button" className="auth-out" onClick={() => void signOut()}>Sign out</button>
      </div>
    );
  }

  return (
    <div className="auth-panel">
      <div className="auth-label">Sign in</div>
      <button type="button" className="auth-google" onClick={() => void signInWithGoogle()} disabled={busy}>
        <span className="auth-google-g">G</span>
        {busy ? "Opening…" : "Continue with Google"}
      </button>
      {error ? <div className="auth-err">{error}</div> : null}
      <div className="auth-hint">Optional — links your Steam profile to a G-Maiden account.</div>
    </div>
  );
}

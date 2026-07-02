// G-Maiden account (GID) sign-in card — additive, lives in the profile dropdown.
// Email OTP: enter email -> receive a 6-digit code -> verify -> signed in. On
// sign-in the current Steam identity is linked to the GID profile row.

import { useState, type FormEvent } from "react";
import { useAuth } from "./auth";
import { useProfile } from "./profile";

export default function AuthPanel() {
  const { user, loading, busy, error, step, pendingEmail, sendCode, verifyCode, signInWithGoogle, signOut, resetFlow } = useAuth();
  const { gidCode, generationName } = useProfile();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");

  if (loading) {
    return <div className="auth-panel muted">checking account…</div>;
  }

  if (step === "signedin") {
    return (
      <div className="auth-panel signedin">
        <div className="auth-row">
          <span className="auth-label">Account</span>
          <span className="auth-badge">GID</span>
        </div>
        <div className="auth-sub">{user?.email}</div>
        <div className="auth-gid-label">GID{generationName ? ` · ${generationName}` : ""}</div>
        <code className="auth-gid" title={user?.id}>{gidCode || "…"}</code>
        <button type="button" className="auth-out" onClick={() => void signOut()}>Sign out</button>
      </div>
    );
  }

  if (step === "code") {
    const onVerify = (e: FormEvent) => {
      e.preventDefault();
      const t = code.trim();
      if (t) void verifyCode(t).then(() => setCode(""));
    };
    return (
      <form className="auth-panel" onSubmit={onVerify}>
        <div className="auth-label">Enter code</div>
        <div className="auth-sub">sent to {pendingEmail}</div>
        <input
          className="auth-input"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="6-digit code"
          inputMode="numeric"
          autoComplete="one-time-code"
        />
        <button type="submit" className="auth-go" disabled={busy || !code.trim()}>
          {busy ? "Verifying…" : "Verify"}
        </button>
        <button type="button" className="auth-link" onClick={() => { setCode(""); resetFlow(); }}>
          Use a different email
        </button>
        {error ? <div className="auth-err">{error}</div> : null}
      </form>
    );
  }

  const onSend = (e: FormEvent) => {
    e.preventDefault();
    const v = email.trim();
    if (v) void sendCode(v);
  };
  return (
    <form className="auth-panel" onSubmit={onSend}>
      <div className="auth-label">Sign in</div>
      <button type="button" className="auth-google" onClick={() => void signInWithGoogle()} disabled={busy}>
        <span className="auth-google-g">G</span>
        {busy ? "Opening…" : "Continue with Google"}
      </button>
      <div className="auth-divider"><span>or email</span></div>
      <input
        className="auth-input"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@email.com"
        autoComplete="email"
      />
      <button type="submit" className="auth-go" disabled={busy || !email.trim()}>
        {busy ? "Sending…" : "Send code"}
      </button>
      {error ? <div className="auth-err">{error}</div> : null}
      <div className="auth-hint">Optional — links your Steam profile to a G-Maiden account.</div>
    </form>
  );
}

// Account & profile page — the real home for GID sign-in, Steam linking, and
// user profile setup (was cramped in the profile dropdown). Reached via the
// profile menu -> "Account & Steam".

import { useEffect, useState } from "react";
import AuthPanel from "./AuthPanel";
import SteamLink from "./SteamLink";
import { useIdentity } from "./live/identity";
import { useProfile } from "./profile";

export default function AccountPage() {
  const { identity } = useIdentity();
  const { user, displayName, save } = useProfile();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Keep the editable field in sync with the loaded/persisted name.
  useEffect(() => { setName(displayName); }, [displayName]);

  async function saveName() {
    setSaving(true);
    setMsg(null);
    const err = await save(name);
    setSaving(false);
    setMsg(err ?? "Saved");
  }

  return (
    <div className="account-page">
      <h2 className="account-title">Account &amp; Profile</h2>
      <p className="account-lead">
        Sign in to a G-Maiden account (GID) — one identity across the G-series — link your
        Steam, and set up your profile. The deck works without an account; this adds sync and linking.
      </p>

      <div className="account-grid">
        <section className="account-card">
          <h3 className="account-h3">G-Maiden account</h3>
          <AuthPanel />
        </section>

        <section className="account-card">
          <h3 className="account-h3">Steam</h3>
          <SteamLink />
          {identity ? (
            <div className="account-note">Deck loads OpenDota for account #{identity.accountId}.</div>
          ) : (
            <div className="account-note">Link Steam so the deck can load your OpenDota profile.</div>
          )}
        </section>

        <section className={`account-card${user ? "" : " muted"}`}>
          <h3 className="account-h3">Profile</h3>
          {user ? (
            <>
              <label className="account-field-label">Display name</label>
              <input
                className="account-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name in G-Maiden"
                spellCheck={false}
              />
              <button
                type="button"
                className="account-save"
                onClick={() => void saveName()}
                disabled={saving || name.trim() === displayName}
              >
                {saving ? "Saving…" : "Save"}
              </button>
              {msg ? <div className="account-msg">{msg}</div> : null}
            </>
          ) : (
            <p className="account-hint">Sign in to set your display name and sync your profile.</p>
          )}
        </section>
      </div>
    </div>
  );
}

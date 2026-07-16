// Account & profile page — the real home for GID sign-in, Steam linking, and
// user profile setup (was cramped in the profile dropdown). Reached via the
// profile menu -> "Account & Steam".
//
// CR011-P5-01 (CR-011 §C "Account ... ▸ Wallet ▸ Ledger"): adds a sub-tab row
// so the CR-003 economy surfaces (previously orphaned — no nav entry at all)
// live alongside identity: บัญชี (existing 3 cards, default) · กระเป๋า
// (WalletTab) · ประวัติธุรกรรม (LedgerTab). WalletTab's topup modal and
// LedgerTab's receipt modal are unchanged internal state in those components,
// so they keep working exactly as before — this file only decides which one
// is mounted.

import { useEffect, useState } from "react";
import AuthPanel from "./AuthPanel";
import SteamLink from "./SteamLink";
import { useIdentity } from "./live/identity";
import { useProfile } from "./profile";
import WalletTab from "./WalletTab";
import LedgerTab from "./LedgerTab";

type AccountMode = "account" | "wallet" | "ledger";

const ACCOUNT_TABS: Array<{ key: AccountMode; label: string }> = [
  { key: "account", label: "บัญชี" },
  { key: "wallet", label: "กระเป๋า" },
  { key: "ledger", label: "ประวัติธุรกรรม" },
];

// entryMode/entryNonce: sub-tab deep-link (Opus gate, CR011-P5) — the Store's
// "เติมเหรียญ" must land ON the Wallet sub-tab, not one click short. The nonce
// retriggers the jump when the user navigates again with the same mode.
export default function AccountPage({ entryMode, entryNonce }: { entryMode?: AccountMode; entryNonce?: number } = {}) {
  const { identity } = useIdentity();
  const { user, displayName, save } = useProfile();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [mode, setMode] = useState<AccountMode>(entryMode ?? "account");
  useEffect(() => {
    if (entryMode) setMode(entryMode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryNonce]);

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

      <div className="gm-account-tabs" role="tablist" aria-label="Account sections">
        {ACCOUNT_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={mode === t.key}
            className={`gm-account-tab${mode === t.key ? " active" : ""}`}
            onClick={() => setMode(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {mode === "account" ? (
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
      ) : mode === "wallet" ? (
        <WalletTab onViewAllTransactions={() => setMode("ledger")} />
      ) : (
        <LedgerTab />
      )}
    </div>
  );
}

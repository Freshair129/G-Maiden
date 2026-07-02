// Steam identity link/login card (account system, Phase A).
// Compact panel for the profile dropdown: paste a Steam profile URL / vanity /
// SteamID64 / account id -> resolved via the Rust `resolve_steam_id` command ->
// persisted to the Tauri store. When linked, shows the account + Unlink. This is
// what feeds the OpenDota profile/baseline enrichment.

import { useState, type FormEvent } from "react";
import { useIdentity } from "./live/identity";

export default function SteamLink() {
  const { identity, loading, resolving, error, linkSteam, clear } = useIdentity();
  const [input, setInput] = useState("");

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const value = input.trim();
    if (value) void linkSteam(value).then(() => setInput(""));
  }

  if (loading) {
    return <div className="steam-link muted">checking Steam link…</div>;
  }

  if (identity) {
    return (
      <div className="steam-link linked">
        <div className="steam-link-row">
          <span className="steam-link-label">Steam linked</span>
          <span className="steam-link-id">#{identity.accountId}</span>
        </div>
        <div className="steam-link-sub">SteamID64 {identity.steamid64}</div>
        <button type="button" className="steam-link-unlink" onClick={() => void clear()}>
          Unlink
        </button>
      </div>
    );
  }

  return (
    <form className="steam-link" onSubmit={onSubmit}>
      <div className="steam-link-label">Link Steam</div>
      <input
        className="steam-link-input"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Profile URL / vanity / SteamID64 / id"
        spellCheck={false}
        autoComplete="off"
      />
      <button type="submit" className="steam-link-go" disabled={resolving || !input.trim()}>
        {resolving ? "Resolving…" : "Link"}
      </button>
      {error ? <div className="steam-link-err">{error}</div> : null}
      <div className="steam-link-hint">
        Pulls your public OpenDota profile. Vanity /id/ links are supported.
      </div>
    </form>
  );
}

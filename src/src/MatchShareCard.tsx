// CR-003 §3.2 addendum — "แชร์แมตช์ล่าสุด" card. Fires the shard faucet
// (ADR-16 §3, `match-share-submit` behind `useWallet().shareMatch()`) for the
// player's most recent completed local match.
//
// Where `matchId` should come from: there is currently NO real source for
// "the most recent completed local match id" anywhere in this codebase.
// The deck's existing local match history (`list_match_logs` Tauri command,
// consumed by src/src/live/buildHistory.ts as `MatchLog`) only exposes
// `{ name, size, modified_ms }` — a per-second G-Log tick recording, with no
// OpenDota match id, because those logs predate CR-003 / the shard faucet
// entirely (see buildHistory.ts's own comment: "these logs live on-device...
// do NOT record win/loss or a final KDA"). `src/src/live/opendota.ts` fetches
// a player's OpenDota match list keyed by Steam account id, which DOES carry
// real match ids, but nothing today marks one of those as "the local match
// that just finished" the way this card needs.
//
// Whoever wires this up for real should either: (a) capture `map.matchid` off
// the live GSI payload when a match transitions to finished and persist the
// latest one (companion.ts / a small Rust-side store), or (b) cross-reference
// the newest OpenDota match for the linked Steam account against the newest
// G-Log file's `modified_ms`. Until then, this component takes `matchId` as
// a prop and simply disables its button when there's nothing to share.

import { useState } from "react";
import { useWallet, type ShareMatchResult } from "./wallet";

type MatchShareCardProps = {
  /** OpenDota match id of the most recent completed local match, or null if
   *  there isn't one available yet (see the file-level comment above). */
  matchId: string | null;
};

function errMessage(e: unknown): string {
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  return String(e);
}

export default function MatchShareCard({ matchId }: MatchShareCardProps) {
  const { shareMatch } = useWallet();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ShareMatchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function share() {
    if (!matchId || busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await shareMatch(matchId);
      setResult(res);
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  // Honest-state per ADR-16 §3: shardMinted === 0 is an expected outcome
  // (private profile, not parsed yet, etc.) and must read as informational,
  // never as an error.
  const tone: "success" | "info" | "error" | null = error ? "error" : result ? (result.shardMinted > 0 ? "success" : "info") : null;

  return (
    <div style={styles.card}>
      <style>{cssBlock}</style>
      <div style={styles.head}>
        <span style={styles.icon}>💎</span>
        <div>
          <div style={styles.title}>แชร์แมตช์ล่าสุด</div>
          <div style={styles.sub}>ยืนยันผ่าน OpenDota แลก Shard ได้ทันที</div>
        </div>
      </div>

      <button
        type="button"
        className="match-share-btn"
        style={{ ...styles.btn, ...(busy ? styles.btnBusy : null) }}
        onClick={() => void share()}
        disabled={!matchId || busy}
      >
        {busy ? "กำลังส่งแมตช์…" : "แชร์แมตช์ล่าสุด"}
      </button>

      {!matchId && !busy ? <div style={styles.hint}>ยังไม่พบแมตช์ล่าสุดให้แชร์ในตอนนี้</div> : null}

      {tone === "success" && result ? (
        <div className="match-share-toast success" style={{ ...styles.toast, ...styles.toastSuccess }}>
          ❄ ได้รับ <b>{result.shardMinted.toLocaleString()}</b> Shard จากแมตช์นี้แล้ว!
        </div>
      ) : null}

      {tone === "info" && result ? (
        <div style={{ ...styles.toast, ...styles.toastInfo }}>
          <span>{result.reason || "แมตช์นี้ยังไม่ได้ Shard ในตอนนี้"}</span>
          <button type="button" style={styles.retryBtn} onClick={() => void share()} disabled={busy}>
            ลองใหม่
          </button>
        </div>
      ) : null}

      {tone === "error" ? (
        <div style={{ ...styles.toast, ...styles.toastError }}>
          <span>{error}</span>
          <button type="button" style={styles.retryBtn} onClick={() => void share()} disabled={busy}>
            ลองใหม่
          </button>
        </div>
      ) : null}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: "rgba(18, 20, 28, 0.72)",
    border: "1px solid #24344e",
    borderRadius: 14,
    padding: 14,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  head: { display: "flex", alignItems: "center", gap: 10 },
  icon: { fontSize: 22 },
  title: { fontSize: 13.5, fontWeight: 700, color: "#d8e6f2" },
  sub: { fontSize: 11, color: "#8fa6c0", marginTop: 2 },
  btn: {
    borderRadius: 10,
    fontSize: 12.5,
    fontWeight: 600,
    border: "1px solid #64c7ff",
    background: "#11203a",
    color: "#9be7ff",
    padding: "10px 14px",
    cursor: "pointer",
  },
  btnBusy: { opacity: 0.7, cursor: "wait" },
  hint: { fontSize: 11, color: "#8fa6c0" },
  toast: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, borderRadius: 10, padding: "9px 12px", fontSize: 12 },
  toastSuccess: { background: "rgba(49, 208, 160, 0.14)", border: "1px solid rgba(49, 208, 160, 0.3)", color: "#31d0a0" },
  toastInfo: { background: "rgba(100, 199, 255, 0.12)", border: "1px solid rgba(100, 199, 255, 0.3)", color: "#9be7ff" },
  toastError: { background: "rgba(255, 92, 122, 0.14)", border: "1px solid rgba(255, 92, 122, 0.3)", color: "#ff5c7a" },
  retryBtn: {
    borderRadius: 8,
    fontSize: 11,
    border: "1px solid currentColor",
    background: "transparent",
    color: "inherit",
    padding: "4px 10px",
    cursor: "pointer",
    flexShrink: 0,
  },
};

const cssBlock = `
@keyframes matchShareIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
.match-share-toast.success { animation: matchShareIn 260ms ease-out; }
.match-share-btn:disabled { opacity: .55; cursor: not-allowed; }
.match-share-btn:not(:disabled):hover { background: #16294a; }
`;

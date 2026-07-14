// RwangIngest (feature--gorch-rw1-02) — read-only mirror of an external RWANG project's live state,
// rendered inside G-Orchestra Studio. Talks to GET /api/rwang/state?project=<name> (gks/rwang-ingest.mjs
// projects it into an engine.mjs snapshot()-shaped object so we can reuse the same status vocabulary /
// styling as DevProgress/Progress). This tab issues its OWN fetch+poll loop — it does NOT go through the
// global atom store (store.ts), because that store is wired to /api/state (the local backlog), not this
// external project's state. No commands/mutations here: no claim/dispatch/assign controls, ever.
import { useEffect, useState } from "react";

type RwangTask = {
  id: string; title: string; type: string; phase: string | null; role: string | null;
  status: string; deps: string[]; depsDone: boolean; ready: boolean; est: number | null; accept?: string;
};
type RwangEvent = { ts: string; event: string; detail?: string };
type RwangSnapshot = {
  progress: { done: number; total: number; pct: number };
  counts: Record<string, number>;
  updatedAt: string | null;
  waves: string[][];
  wave: { name: string | null; title: string | null };
  project: { name: string | null; phase: string | null; phaseStatus: string | null };
  tasks: RwangTask[];
  events: RwangEvent[];
  warnings: string[];
};

const PROJECT = "G-Maiden";
const POLL_MS = 2000;

export default function RwangIngest() {
  const [data, setData] = useState<RwangSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0); // bumped by the retry button to force an immediate refetch

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const load = async () => {
      if (document.hidden) return; // mirror store.ts's polling discipline — skip while tab is backgrounded
      try {
        const r = await fetch(`/api/rwang/state?project=${encodeURIComponent(PROJECT)}`, { signal: controller.signal });
        if (!r.ok) throw new Error("HTTP " + r.status);
        const j = (await r.json()) as RwangSnapshot;
        if (!cancelled) { setData(j); setError(null); }
      } catch (e: any) {
        if (!cancelled && e?.name !== "AbortError") setError(String(e?.message || e));
      }
    };

    load();
    const timer = setInterval(load, POLL_MS);
    return () => { cancelled = true; controller.abort(); clearInterval(timer); };
  }, [nonce]);

  if (error && !data) {
    return (
      <div className="prog">
        <div className="banner err">
          RWANG engine unreachable for project "{PROJECT}" — {error}.{" "}
          <button className="rm-btn" onClick={() => setNonce((n) => n + 1)}>retry</button>
        </div>
      </div>
    );
  }
  if (!data) return <div className="loading">loading RWANG state…</div>;

  const byId = new Map(data.tasks.map((t) => [t.id, t]));
  const { progress: p, project, wave } = data;

  return (
    <div className="prog">
      {error && (
        <div className="banner err">
          last refresh failed — {error} (showing last known state).{" "}
          <button className="rm-btn" onClick={() => setNonce((n) => n + 1)}>retry</button>
        </div>
      )}

      <div className="prog-head">
        <div>
          <div className="prog-title">{project.name || PROJECT}</div>
          <div className="prog-sub">
            {(project.phase || "—")}/{project.phaseStatus || "—"} · wave {wave.name || "—"}
            {wave.title ? " — " + wave.title : ""}
          </div>
        </div>
        <div className="prog-pct">{p.pct}%</div>
      </div>
      <div className="prog-bar"><div className="prog-fill" style={{ width: p.pct + "%" }} /></div>
      <div className="graph-legend">{p.done}/{p.total} tasks done · read-only mirror, no claim/dispatch here</div>

      {data.warnings.length > 0 && (
        <div className="pcard-dod" style={{ borderColor: "#5a4a1f", color: "var(--warn)", marginBottom: 14 }}>
          <span className="dod-l" style={{ color: "var(--warn)" }}>⚠ warnings</span> {data.warnings.join(" · ")}
        </div>
      )}

      {data.waves.map((ids, i) => {
        const items = ids.map((id) => byId.get(id)).filter(Boolean) as RwangTask[];
        const done = items.filter((t) => t.status === "done").length;
        return (
          <section className="phase open" key={i}>
            <header className="phase-h" style={{ cursor: "default" }}>
              <span className="phase-tag">Wave {i}</span>
              <span className="phase-spacer" />
              <span className="phase-count">{done}/{items.length}</span>
            </header>
            <div className="phase-body" style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "4px 12px 12px" }}>
              {items.length === 0 && <div className="empty">no atoms in this wave</div>}
              {items.map((t) => (
                <span key={t.id} className={"status-pill ss-" + t.status} title={t.title || t.id}>
                  {t.id} · {t.status}
                </span>
              ))}
            </div>
          </section>
        );
      })}

      <div className="graph-legend" style={{ marginTop: 4 }}>tasks</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "110px 1fr 90px 110px 90px", gap: 8, fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".4px", padding: "0 10px" }}>
          <span>id</span><span>title</span><span>role</span><span>status</span><span>deps</span>
        </div>
        {data.tasks.map((t) => (
          <div key={t.id} className="pcard" style={{ display: "grid", gridTemplateColumns: "110px 1fr 90px 110px 90px", gap: 8, alignItems: "center", padding: "7px 10px" }} title={t.title}>
            <span className="pcard-id">{t.id}</span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12 }}>{t.title}</span>
            <span className="pill role">{t.role || "—"}</span>
            <span className={"status-pill ss-" + t.status}>{t.status}</span>
            <span className={"pill deps" + (t.depsDone ? " ok" : "")}>⛓ {t.deps.length}</span>
          </div>
        ))}
        {data.tasks.length === 0 && <div className="empty">no tasks</div>}
      </div>

      <div className="graph-legend">events (last {data.events.length})</div>
      <pre className="dp-log" style={{ maxHeight: 260, overflowY: "auto" }}>
        {data.events.length
          ? data.events.map((e) => `${e.ts}  ${e.event}${e.detail ? "  " + e.detail : ""}`).join("\n")
          : "(no events)"}
      </pre>
    </div>
  );
}

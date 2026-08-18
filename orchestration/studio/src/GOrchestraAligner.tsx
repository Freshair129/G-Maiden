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

type SearchHit = {
  path: string;
  line: number;
  score: number;
  title: string;
  snippet: string;
};

const PROJECT = "G-Maiden";
const POLL_MS = 2000;

export default function GOrchestraAligner() {
  const [data, setData] = useState<RwangSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  // Semantic Search States
  const [searchQuery, setSearchQuery] = useState("");
  const [searchBackend, setSearchBackend] = useState("auto");
  const [searchLimit, setSearchLimit] = useState(5);
  const [searchResults, setSearchResults] = useState<SearchHit[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [showTaskDetails, setShowTaskDetails] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const load = async () => {
      if (document.hidden) return;
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

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearchLoading(true);
    setSearchError(null);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: searchQuery,
          limit: searchLimit,
          backend: searchBackend,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || `HTTP ${res.status}`);
      }
      setSearchResults(json.hits || []);
    } catch (err: any) {
      setSearchError(err.message || String(err));
    } finally {
      setSearchLoading(false);
    }
  };

  const renderSearchConsole = () => {
    return (
      <div className="card" style={{ marginTop: "24px", padding: "16px" }}>
        <h3>◈ G-Aligner Semantic Search</h3>
        <form onSubmit={handleSearch} style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "12px" }}>
          <input
            id="g-aligner-semantic-query"
            name="g-aligner-semantic-query"
            type="text"
            placeholder="ค้นหาสเปกหรือเนื้อหาเอกสาร (เช่น 'gank warning threshold' หรือ 'เตือนเลือดต่ำ')"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ flex: 1, minWidth: "250px", padding: "8px", background: "#12141c", border: "1px solid rgba(143,212,255,0.16)", borderRadius: "4px", color: "#e7eef6" }}
          />
          <select
            id="g-aligner-search-backend"
            name="g-aligner-search-backend"
            value={searchBackend}
            onChange={(e) => setSearchBackend(e.target.value)}
            style={{ padding: "8px", background: "#12141c", border: "1px solid rgba(143,212,255,0.16)", borderRadius: "4px", color: "#e7eef6" }}
          >
            <option value="auto">Auto Backend</option>
            <option value="supabase">Supabase pgvector</option>
            <option value="ollama">Ollama (bge-m3)</option>
            <option value="file">File System FTS</option>
          </select>
          <select
            id="g-aligner-search-limit"
            name="g-aligner-search-limit"
            value={searchLimit}
            onChange={(e) => setSearchLimit(Number(e.target.value))}
            style={{ padding: "8px", background: "#12141c", border: "1px solid rgba(143,212,255,0.16)", borderRadius: "4px", color: "#e7eef6" }}
          >
            <option value={3}>Top 3</option>
            <option value={5}>Top 5</option>
            <option value={10}>Top 10</option>
          </select>
          <button type="submit" disabled={searchLoading} className="btn primary" style={{ padding: "8px 16px" }}>
            {searchLoading ? "กำลังค้นหา..." : "ค้นหา"}
          </button>
        </form>

        {searchError && <div className="banner err" style={{ marginTop: "12px" }}>{searchError}</div>}

        <div className="search-results" style={{ marginTop: "16px" }}>
          {searchResults.length === 0 && !searchLoading && searchQuery.trim() !== "" && (
            <div className="empty-state">ไม่พบผลการค้นหาสำหรับ "{searchQuery}"</div>
          )}
          {searchResults.map((hit, idx) => (
            <div key={idx} className="card-row" style={{ padding: "12px", borderBottom: "1px solid rgba(143,212,255,0.08)", display: "flex", flexDirection: "column", gap: "6px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="node-id" style={{ fontSize: "14px", fontWeight: "bold" }}>
                  📁 {hit.title}
                </span>
                <span className="badge" style={{ background: "rgba(91,227,167,0.15)", color: "#5be3a7", fontSize: "12px", padding: "2px 8px", borderRadius: "12px" }}>
                  score: {hit.score.toFixed(2)}
                </span>
              </div>
              <div style={{ fontSize: "12px", color: "#8794a6" }}>
                พาธไฟล์: <code>{hit.path.replace(/\\/g, "/").split("/G-Maiden/").pop()}:{hit.line}</code>
              </div>
              <blockquote style={{ margin: "4px 0 0 0", padding: "8px", borderLeft: "2px solid #8fd4ff", background: "rgba(143,212,255,0.04)", fontSize: "13px", color: "#e7eef6", whiteSpace: "pre-wrap" }}>
                {hit.snippet}
              </blockquote>
            </div>
          ))}
        </div>
      </div>
    );
  };

  if (error && !data) {
    return (
      <div className="prog">
        <div className="banner err">
          G-Aligner engine unreachable for project "{PROJECT}" — {error}.{" "}
          <button className="rm-btn" onClick={() => setNonce((n) => n + 1)}>retry</button>
        </div>
        {renderSearchConsole()}
      </div>
    );
  }
  if (!data) {
    return (
      <div className="prog">
        <div className="loading">loading G-Aligner state…</div>
        {renderSearchConsole()}
      </div>
    );
  }

  const byId = new Map(data.tasks.map((t) => [t.id, t]));
  const { progress: p, project } = data;

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, height: "100%", width: "100%", overflow: "hidden" }}>
      {error && (
        <div className="banner err" style={{ flexShrink: 0 }}>
          last refresh failed — {error} (showing last known state).{" "}
          <button className="rm-btn" onClick={() => setNonce((n) => n + 1)}>retry</button>
        </div>
      )}

      {/* 1. IDE 3-PANEL WORKSPACE (Full Viewport Height & Width, No Page Scroll) */}
      <DynamicDocExplorer 
        rwangData={{
          progressPct: p.pct,
          doneTasks: p.done,
          totalTasks: p.total,
          projectName: project.name || "unknown",
          phase: project.phase || "—",
          phaseStatus: project.phaseStatus || "—"
        }}
        renderSearchForm={renderSearchConsole}
      />
    </div>
  );
}

// ── Types ──────────────────────────────────────────────────────────────────
type DocNode = {
  id: string; path: string; title?: string;
  doc_type?: string; status?: string; domain?: string; metadata?: Record<string, unknown>;
};
type DocEdge = { from: string; to: string; kind?: string };
type DocGraph = { nodes: DocNode[]; edges: DocEdge[] };

type OpenTab = {
  id: string;
  path: string;
  title: string;
  content: string | null;
  loading: boolean;
};

// ── Colour palette ─────────────────────────────────────────────────────────
const STATUS_COLOR: Record<string, string> = {
  active:      "#5be3a7",
  draft:       "#f0c060",
  accepted:    "#8fd4ff",
  deprecated:  "#8794a6",
  superseded:  "#c97aff",
  proposed:    "#ffb347",
};
const TYPE_COLOR: Record<string, string> = {
  "feature-spec":  "#8fd4ff",
  "change-request":"#f0c060",
  "architecture":  "#c97aff",
  "product":       "#5be3a7",
  "operations":    "#ffb347",
  "audit":         "#ff8080",
};
function nodeColor(n: DocNode): string {
  return (
    STATUS_COLOR[n.status?.toLowerCase() ?? ""] ??
    TYPE_COLOR[n.doc_type?.toLowerCase() ?? ""] ??
    "#8fd4ff"
  );
}

import {
  ReactFlow, Background, Controls, MiniMap,
  useNodesState, useEdgesState,
  type Node as XNode, type Edge as XEdge,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

// ── Helper: Hop calculation for Context Graph ──────────────────────────────
function getNeighborhood(
  centerId: string,
  allNodes: DocNode[],
  allEdges: DocEdge[],
  maxHops: number,
  direction: "both" | "inbound" | "outbound"
): { subNodes: DocNode[]; subEdges: DocEdge[] } {
  const visitedNodes = new Set<string>([centerId]);
  let currentFrontier = new Set<string>([centerId]);
  const collectedEdges: DocEdge[] = [];
  const seenEdges = new Set<string>();

  for (let hop = 0; hop < maxHops; hop++) {
    const nextFrontier = new Set<string>();
    for (const edge of allEdges) {
      const eKey = `${edge.from}->${edge.to}`;
      if (direction === "outbound" || direction === "both") {
        if (currentFrontier.has(edge.from)) {
          if (!seenEdges.has(eKey)) {
            seenEdges.add(eKey);
            collectedEdges.push(edge);
          }
          if (!visitedNodes.has(edge.to)) {
            visitedNodes.add(edge.to);
            nextFrontier.add(edge.to);
          }
        }
      }
      if (direction === "inbound" || direction === "both") {
        if (currentFrontier.has(edge.to)) {
          if (!seenEdges.has(eKey)) {
            seenEdges.add(eKey);
            collectedEdges.push(edge);
          }
          if (!visitedNodes.has(edge.from)) {
            visitedNodes.add(edge.from);
            nextFrontier.add(edge.from);
          }
        }
      }
    }
    currentFrontier = nextFrontier;
    if (currentFrontier.size === 0) break;
  }

  const subNodes = allNodes.filter((n) => visitedNodes.has(n.id));
  return { subNodes, subEdges: collectedEdges };
}

// ── Sub-component: ContextualGraphPane (Right Panel) ────────────────────────
function ContextualGraphPane({
  focusDocId,
  allNodes,
  allEdges,
  maxHops,
  direction,
  onSelectDoc,
}: {
  focusDocId: string | null;
  allNodes: DocNode[];
  allEdges: DocEdge[];
  maxHops: number;
  direction: "both" | "inbound" | "outbound";
  onSelectDoc: (id: string, path: string) => void;
}) {
  if (!focusDocId) {
    return (
      <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", color: "#8794a6", fontSize: "12px", textAlign: "center", padding: "20px" }}>
        Select a document from the left explorer or tab to inspect its relationship graph.
      </div>
    );
  }

  const { subNodes, subEdges } = getNeighborhood(focusDocId, allNodes, allEdges, maxHops, direction);

  // Radial / Circle layout for neighborhood graph around center node
  const RADIUS = Math.min(180 + subNodes.length * 8, 320);
  const CENTER_X = 250, CENTER_Y = 220;

  const otherNodes = subNodes.filter((n) => n.id !== focusDocId);
  const xNodes: XNode[] = [];

  // Focus Node at center
  const focusNodeObj = allNodes.find((n) => n.id === focusDocId);
  if (focusNodeObj) {
    const color = nodeColor(focusNodeObj);
    xNodes.push({
      id: focusNodeObj.id,
      position: { x: CENTER_X - 70, y: CENTER_Y - 20 },
      data: { label: `⭐ ${focusNodeObj.title || focusNodeObj.id.split("/").pop()}` },
      style: {
        background: color,
        color: "#0a0e17",
        border: `2px solid ${color}`,
        borderRadius: "8px",
        fontWeight: "bold",
        fontSize: "11px",
        padding: "6px 10px",
        boxShadow: `0 0 16px ${color}aa`,
        maxWidth: "180px",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      },
    });
  }

  // Neighbor nodes in a ring
  otherNodes.forEach((n, idx) => {
    const angle = (idx / Math.max(otherNodes.length, 1)) * 2 * Math.PI;
    const x = CENTER_X + RADIUS * Math.cos(angle) - 60;
    const y = CENTER_Y + RADIUS * Math.sin(angle) - 15;
    const color = nodeColor(n);
    xNodes.push({
      id: n.id,
      position: { x, y },
      data: { label: n.title || n.id.split("/").pop() },
      style: {
        background: `${color}22`,
        border: `1.5px solid ${color}`,
        borderRadius: "6px",
        color: color,
        fontSize: "10px",
        padding: "4px 8px",
        maxWidth: "140px",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        cursor: "pointer",
      },
    });
  });

  const xEdges: XEdge[] = subEdges.map((e) => ({
    id: `${e.from}->${e.to}`,
    source: e.from,
    target: e.to,
    animated: e.from === focusDocId || e.to === focusDocId,
    style: { stroke: "rgba(143,212,255,0.4)", strokeWidth: 1.5 },
    markerEnd: { type: "arrowclosed" as const, color: "rgba(143,212,255,0.6)" },
  }));

  return (
    <div style={{ width: "100%", height: "420px", borderRadius: "6px", overflow: "hidden", border: "1px solid rgba(255,255,255,0.06)" }}>
      <ReactFlow
        nodes={xNodes}
        edges={xEdges}
        onNodeClick={(_e, node) => {
          const doc = allNodes.find((n) => n.id === node.id);
          if (doc) onSelectDoc(doc.id, doc.path);
        }}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={2.5}
        colorMode="dark"
        style={{ background: "rgba(10,14,23,0.95)" }}
      >
        <Background variant={BackgroundVariant.Dots} color="rgba(143,212,255,0.05)" />
        <Controls style={{ background: "rgba(18,24,38,0.8)", border: "1px solid rgba(255,255,255,0.07)" }} />
      </ReactFlow>
    </div>
  );
}

// ── Sub-component: FileTreeItem (Recursive AST File Tree) ────────────────────
type DirectoryTree = {
  name: string;
  fullPath: string;
  files: DocNode[];
  dirs: Record<string, DirectoryTree>;
};

function buildDirTree(nodes: DocNode[]): DirectoryTree {
  const root: DirectoryTree = { name: "docs", fullPath: "docs", files: [], dirs: {} };

  for (const node of nodes) {
    const parts = node.path.replace(/\\/g, "/").split("/");
    let curr = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!curr.dirs[part]) {
        curr.dirs[part] = {
          name: part,
          fullPath: parts.slice(0, i + 1).join("/"),
          files: [],
          dirs: {},
        };
      }
      curr = curr.dirs[part];
    }
    curr.files.push(node);
  }
  return root;
}

function FolderNodeItem({
  tree,
  activeDocPath,
  onSelectDoc,
  depth = 0,
}: {
  tree: DirectoryTree;
  activeDocPath: string | null;
  onSelectDoc: (id: string, path: string) => void;
  depth?: number;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div style={{ marginLeft: depth > 0 ? "10px" : "0" }}>
      {depth > 0 && (
        <div
          onClick={() => setOpen(!open)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "4px",
            fontSize: "12px",
            fontWeight: "bold",
            color: "#e7eef6",
            padding: "3px 4px",
            cursor: "pointer",
            borderRadius: "4px",
            userSelect: "none",
          }}
        >
          <span style={{ fontSize: "10px", color: "#8794a6" }}>{open ? "▼" : "▶"}</span>
          <span>📁 {tree.name}</span>
        </div>
      )}

      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1px", marginTop: "2px" }}>
          {Object.values(tree.dirs).map((childDir) => (
            <FolderNodeItem
              key={childDir.fullPath}
              tree={childDir}
              activeDocPath={activeDocPath}
              onSelectDoc={onSelectDoc}
              depth={depth + 1}
            />
          ))}

          {tree.files.map((doc) => {
            const filename = doc.path.split("/").pop() || doc.path;
            const isSelected = activeDocPath === doc.path;
            const color = nodeColor(doc);
            return (
              <div
                key={doc.id || doc.path}
                onClick={() => onSelectDoc(doc.id, doc.path)}
                style={{
                  marginLeft: depth > 0 ? "14px" : "0",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  background: isSelected ? "rgba(143,212,255,0.18)" : "transparent",
                  color: isSelected ? "#8fd4ff" : "#b0c0d4",
                  border: isSelected ? "1px solid rgba(143,212,255,0.3)" : "1px solid transparent",
                  borderRadius: "4px",
                  padding: "3px 6px",
                  fontSize: "11.5px",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
                title={doc.path}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "6px", overflow: "hidden" }}>
                  <span style={{ fontSize: "9px", color }}>●</span>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{filename}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface DynamicDocExplorerProps {
  rwangData?: {
    progressPct: number;
    doneTasks: number;
    totalTasks: number;
    projectName: string;
    phase: string;
    phaseStatus: string;
  };
  renderSearchForm?: () => React.ReactNode;
}

function DynamicDocExplorer({ rwangData, renderSearchForm }: DynamicDocExplorerProps) {
  const [graph, setGraph] = useState<DocGraph>({ nodes: [], edges: [] });
  const [loadingGraph, setLoadingGraph] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);

  // Tabs & active state
  const [openTabs, setOpenTabs] = useState<OpenTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  // Left Panel Search
  const [searchQuery, setSearchQuery] = useState("");

  // Right Panel Controls
  const [maxHops, setMaxHops] = useState<number>(1);
  const [direction, setDirection] = useState<"both" | "inbound" | "outbound">("both");

  useEffect(() => {
    setLoadingGraph(true);
    fetch("/api/doc-graph")
      .then((r) => r.json())
      .then((data) => {
        if (data?.nodes) setGraph({ nodes: data.nodes, edges: data.edges ?? [] });
      })
      .catch((e) => console.error("Doc-graph fetch error:", e))
      .finally(() => setLoadingGraph(false));
  }, []);

  // Open doc into VS Code multi-tab
  const handleSelectDoc = (id: string, path: string) => {
    const existing = openTabs.find((t) => t.path === path);
    const title = graph.nodes.find((n) => n.path === path)?.title || path.split("/").pop() || path;

    if (existing) {
      setActiveTabId(existing.id);
    } else {
      const newTab: OpenTab = { id: path, path, title, content: null, loading: true };
      setOpenTabs((prev) => [...prev, newTab]);
      setActiveTabId(path);

      fetch(`/api/doc-content?path=${encodeURIComponent(path)}`)
        .then((r) => r.json())
        .then((data) => {
          setOpenTabs((prev) =>
            prev.map((t) => (t.id === path ? { ...t, content: data.ok ? data.content : `Error: ${data.error}`, loading: false } : t))
          );
        })
        .catch((e) => {
          setOpenTabs((prev) => prev.map((t) => (t.id === path ? { ...t, content: `Error: ${e.message}`, loading: false } : t)));
        });
    }
  };

  const handleCloseTab = (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    const nextTabs = openTabs.filter((t) => t.id !== tabId);
    setOpenTabs(nextTabs);
    if (activeTabId === tabId) {
      setActiveTabId(nextTabs.length > 0 ? nextTabs[nextTabs.length - 1].id : null);
    }
  };

  const activeTab = openTabs.find((t) => t.id === activeTabId);
  const activeNode = graph.nodes.find((n) => n.path === activeTab?.path);

  // Search Filter
  const filteredNodes = graph.nodes.filter((n) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return n.path.toLowerCase().includes(q) || (n.title ?? "").toLowerCase().includes(q);
  });

  const dirTree = buildDirTree(filteredNodes);

  return (
    <div style={{ flex: 1, height: "100%", padding: "10px", background: "rgba(14, 18, 28, 0.95)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "10px", display: "flex", flexDirection: "column", overflow: "hidden", boxSizing: "border-box" }}>
      {/* Top Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px", borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: "8px", padding: "0 4px" }}>
        <h3 style={{ margin: 0, color: "#8fd4ff", display: "flex", alignItems: "center", gap: "8px", fontSize: "14px" }}>
          <span>📚 G-Maiden Document Studio</span>
          <span style={{ fontSize: "11px", fontWeight: "normal", background: "rgba(143,212,255,0.1)", color: "#8fd4ff", padding: "2px 8px", borderRadius: "10px" }}>
            Single SSOT · {graph.nodes.length} Total Docs
          </span>
        </h3>
        {loadingGraph && <span style={{ fontSize: "11px", color: "#8794a6" }}>Syncing doc graph…</span>}
      </div>

      {/* 3-Panel Grid Container — responsive columns, fills remaining height */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(250px,300px) 1fr minmax(320px,420px)", gap: "10px", flex: 1, minHeight: 0, width: "100%" }}>
        
        {/* PANEL 1: LEFT PANEL (AST File System, Top Widgets & Search) */}
        <div style={{ background: "rgba(10,14,23,0.7)", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.06)", display: "flex", flexDirection: "column", padding: "10px", minHeight: 0 }}>
          
          {/* Top Compact Cards: Task Progress & Semantic Search Modal Toggle */}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "10px" }}>
            {rwangData && (
              <div style={{ background: "rgba(18,24,38,0.8)", border: "1px solid rgba(143,212,255,0.15)", borderRadius: "6px", padding: "8px 10px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#8fd4ff", fontWeight: "bold", marginBottom: "4px" }}>
                  <span>⚡ G-Aligner Task Progress</span>
                  <span>{rwangData.progressPct}%</span>
                </div>
                <div style={{ height: "4px", background: "rgba(255,255,255,0.1)", borderRadius: "4px", overflow: "hidden", marginBottom: "4px" }}>
                  <div style={{ width: `${rwangData.progressPct}%`, height: "100%", background: "#8fd4ff" }} />
                </div>
                <div style={{ fontSize: "10px", color: "#8794a6", display: "flex", justifyContent: "space-between" }}>
                  <span>Tasks: {rwangData.doneTasks}/{rwangData.totalTasks}</span>
                  <span>{rwangData.phase}</span>
                </div>
              </div>
            )}

            <button
              onClick={() => setShowSearchModal(!showSearchModal)}
              style={{
                width: "100%",
                background: showSearchModal ? "rgba(143,212,255,0.2)" : "rgba(255,255,255,0.04)",
                border: "1px solid rgba(143,212,255,0.25)",
                color: "#8fd4ff",
                borderRadius: "6px",
                padding: "6px",
                fontSize: "11px",
                cursor: "pointer",
                textAlign: "center",
                fontWeight: "bold",
              }}
            >
              {showSearchModal ? "▲ Hide Semantic AI Search" : "🔍 Open G-Aligner AI Search Engine"}
            </button>

            {showSearchModal && renderSearchForm && (
              <div style={{ background: "rgba(10,14,23,0.95)", border: "1px solid rgba(143,212,255,0.2)", borderRadius: "6px", padding: "8px", maxHeight: "250px", overflowY: "auto" }}>
                {renderSearchForm()}
              </div>
            )}
          </div>

          <div style={{ fontSize: "11px", fontWeight: "bold", color: "#8794a6", marginBottom: "6px", letterSpacing: "0.05em" }}>EXPLORER & SEARCH</div>
          
          <input
            id="doc-search-query"
            name="doc-search-query"
            placeholder="🔍 Filter file tree..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: "100%",
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "6px",
              color: "#e7eef6",
              padding: "6px 10px",
              fontSize: "12px",
              marginBottom: "8px",
              outline: "none",
              boxSizing: "border-box",
            }}
          />

          <div style={{ flex: 1, overflowY: "auto", paddingRight: "4px" }}>
            <FolderNodeItem tree={dirTree} activeDocPath={activeTab?.path ?? null} onSelectDoc={handleSelectDoc} />
          </div>
        </div>

        {/* PANEL 2: MAIN PANEL (VS Code Multi-Tab Viewer) */}
        <div style={{ background: "rgba(10,14,23,0.9)", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.06)", display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }}>
          
          {/* Tab Header Bar */}
          <div style={{ display: "flex", background: "rgba(18,24,38,0.9)", borderBottom: "1px solid rgba(255,255,255,0.08)", overflowX: "auto" }}>
            {openTabs.map((tab) => {
              const isActive = tab.id === activeTabId;
              return (
                <div
                  key={tab.id}
                  onClick={() => setActiveTabId(tab.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "8px 14px",
                    fontSize: "12px",
                    cursor: "pointer",
                    background: isActive ? "rgba(14,18,28,0.95)" : "transparent",
                    color: isActive ? "#8fd4ff" : "#8794a6",
                    borderRight: "1px solid rgba(255,255,255,0.06)",
                    borderTop: isActive ? "2px solid #8fd4ff" : "2px solid transparent",
                    whiteSpace: "nowrap",
                    userSelect: "none",
                  }}
                >
                  <span>📄 {tab.title}</span>
                  <span
                    onClick={(e) => handleCloseTab(e, tab.id)}
                    style={{ fontSize: "11px", borderRadius: "50%", padding: "1px 4px", color: "#8794a6" }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "#ff8080")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "#8794a6")}
                  >
                    ✕
                  </span>
                </div>
              );
            })}
          </div>

          {/* Main Document Content Area */}
          <div style={{ flex: 1, padding: "16px", overflowY: "auto" }}>
            {!activeTab ? (
              <div style={{ display: "flex", height: "100%", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#8794a6", fontSize: "13px" }}>
                <span style={{ fontSize: "32px", marginBottom: "8px" }}>📑</span>
                Select a document from the left file tree to open and inspect content.
              </div>
            ) : activeTab.loading ? (
              <div style={{ fontSize: "13px", color: "#8fd4ff" }}>Loading content for {activeTab.path}…</div>
            ) : (
              <div>
                <div style={{ paddingBottom: "8px", marginBottom: "12px", borderBottom: "1px solid rgba(255,255,255,0.1)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "13px", color: "#8fd4ff", fontWeight: "bold" }}>📌 {activeTab.path}</span>
                  {activeNode?.status && (
                    <span style={{ fontSize: "10px", padding: "2px 8px", borderRadius: "10px", background: `${nodeColor(activeNode)}22`, color: nodeColor(activeNode), border: `1px solid ${nodeColor(activeNode)}` }}>
                      {activeNode.status}
                    </span>
                  )}
                </div>
                <pre style={{ whiteSpace: "pre-wrap", fontFamily: "monospace", fontSize: "12.5px", color: "#d2dfed", margin: 0, lineHeight: 1.6 }}>
                  {activeTab.content}
                </pre>
              </div>
            )}
          </div>
        </div>

        {/* PANEL 3: RIGHT PANEL (Contextual Relationship Graph & Hops) */}
        <div style={{ background: "rgba(10,14,23,0.7)", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.06)", display: "flex", flexDirection: "column", padding: "12px", minHeight: 0 }}>
          <div style={{ fontSize: "11px", fontWeight: "bold", color: "#8794a6", marginBottom: "8px", letterSpacing: "0.05em" }}>CONTEXTUAL RELATIONSHIP GRAPH</div>

          {/* Graph Controls */}
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "12px", background: "rgba(255,255,255,0.03)", padding: "10px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.05)" }}>
            
            {/* Hop Depth Number Input */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "11px", color: "#b0c0d4" }}>Hop Depth:</span>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <input
                  id="graph-max-hops"
                  name="graph-max-hops"
                  type="number"
                  min={1}
                  max={20}
                  value={maxHops}
                  onChange={(e) => setMaxHops(Math.max(1, parseInt(e.target.value) || 1))}
                  style={{
                    width: "55px",
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(143,212,255,0.3)",
                    borderRadius: "4px",
                    color: "#8fd4ff",
                    padding: "3px 6px",
                    fontSize: "12px",
                    textAlign: "center",
                    fontWeight: "bold",
                  }}
                />
                <button
                  onClick={() => setMaxHops(10)}
                  style={{
                    padding: "2px 8px",
                    fontSize: "11px",
                    borderRadius: "4px",
                    cursor: "pointer",
                    background: maxHops >= 10 ? "rgba(143,212,255,0.2)" : "transparent",
                    border: `1px solid ${maxHops >= 10 ? "#8fd4ff" : "rgba(255,255,255,0.1)"}`,
                    color: maxHops >= 10 ? "#8fd4ff" : "#8794a6",
                  }}
                >
                  Full
                </button>
              </div>
            </div>

            {/* Edge Direction Selector */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "11px", color: "#b0c0d4" }}>Direction:</span>
              <select
                id="graph-direction-select"
                name="graph-direction-select"
                value={direction}
                onChange={(e) => setDirection(e.target.value as "both" | "inbound" | "outbound")}
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "4px",
                  color: "#e7eef6",
                  padding: "3px 6px",
                  fontSize: "11px",
                }}
              >
                <option value="both">Both (In + Out)</option>
                <option value="outbound">Outbound (Links to)</option>
                <option value="inbound">Inbound (Referenced by)</option>
              </select>
            </div>
          </div>

          {/* Active Node Information Card */}
          {activeNode && (
            <div style={{ marginBottom: "10px", padding: "8px 10px", background: "rgba(143,212,255,0.05)", borderRadius: "6px", border: "1px solid rgba(143,212,255,0.15)", fontSize: "11px" }}>
              <div style={{ fontWeight: "bold", color: "#8fd4ff", marginBottom: "4px" }}>📌 {activeNode.title || activeNode.id.split("/").pop()}</div>
              <div style={{ color: "#8794a6" }}>
                Type: <span style={{ color: "#e7eef6" }}>{activeNode.doc_type || "N/A"}</span> · Domain: <span style={{ color: "#e7eef6" }}>{activeNode.domain || "N/A"}</span>
              </div>
            </div>
          )}

          {/* Graph Canvas Component */}
          <div style={{ flex: 1, minHeight: 0 }}>
            <ContextualGraphPane
              focusDocId={activeNode?.id ?? null}
              allNodes={graph.nodes}
              allEdges={graph.edges}
              maxHops={maxHops}
              direction={direction}
              onSelectDoc={handleSelectDoc}
            />
          </div>
        </div>
      </div>
    </div>
  );
}





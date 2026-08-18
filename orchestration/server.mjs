#!/usr/bin/env node
/**
 * G-Maiden Orchestrator — Web UI server
 *   node server.mjs [--port 4577]
 * เปิด http://localhost:4577 เพื่อ monitor + สั่งงาน (claim/done/fail/release/assign/dispatch/reset)
 * ไม่มี dependency ภายนอก (Node http ล้วน). ใช้ engine.mjs ร่วมกับ CLI.
 */
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import * as E from "./engine.mjs";
import { writeNode, writeEdge, queryNodes } from "./store/knowledge.mjs";
import { loadRwangProject, toSnapshot, listProjects } from "./gks/rwang-ingest.mjs";

const PORT = Number((process.argv.includes("--port") ? process.argv[process.argv.indexOf("--port") + 1] : 0)) || 4577;
const UI = join(E.PATHS.__dir, "public", "index.html");
const DOC_GRAPH_FILE = join(E.PATHS.ROOT, "docs", "DOC-GRAPH.json");

/** The scanner's published graph, or null when it has not been generated yet. */
function readDocGraph() {
  if (!existsSync(DOC_GRAPH_FILE)) return null;
  return JSON.parse(readFileSync(DOC_GRAPH_FILE, "utf8"));
}

function send(res, code, body, type = "application/json") {
  res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}
function readBody(req) {
  return new Promise((resolve) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => { try { resolve(b ? JSON.parse(b) : {}); } catch { resolve({}); } }); });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (req.method === "GET" && url.pathname === "/") {
      return send(res, 200, existsSync(UI) ? readFileSync(UI, "utf8") : "<h1>UI missing</h1>", "text/html; charset=utf-8");
    }
    if (req.method === "GET" && url.pathname === "/api/state") return send(res, 200, E.snapshot());
    if (req.method === "GET" && url.pathname === "/api/ollama") return send(res, 200, await E.ollamaInfo());
    if (req.method === "GET" && url.pathname === "/api/providers") return send(res, 200, await E.providersInfo());
    if (req.method === "GET" && url.pathname === "/api/knowledge") return send(res, 200, E.knowledgeOutcomes());
    if (req.method === "GET" && url.pathname === "/api/personas") {
      try { const p = JSON.parse(readFileSync(new URL("./personas.json", import.meta.url), "utf8")); return send(res, 200, p.personas || []); }
      catch { return send(res, 200, []); }
    }
    // RWANG project ingest (feature--gorch-rw1-ingest, read-only mirror). SECURITY: never accept a
    // filesystem path from the query string — only a registered project name from config.rwang.projects.
    if (req.method === "GET" && url.pathname === "/api/rwang/state") {
      try {
        const name = url.searchParams.get("project");
        const projects = listProjects(E.CONFIG);
        const proj = name ? projects.find((p) => p.name === name) : projects[0];
        if (!proj) return send(res, 404, { ok: false, error: `unknown rwang project: ${name || "(none registered)"}` });
        return send(res, 200, toSnapshot(loadRwangProject(proj.root)));
      } catch (e) { return send(res, 500, { ok: false, error: e.message }); }
    }
    if (req.method === "GET" && url.pathname === "/api/log") {
      const id = url.searchParams.get("id") || "";
      const offset = Number(url.searchParams.get("offset") || 0) || 0;
      return send(res, 200, E.readLogChunk(id, offset));
    }
    // Doc registry (feature--g-aligner). Reads the doc-graph the scanner already published.
    if (req.method === "GET" && url.pathname === "/api/doc-graph") {
      const graph = readDocGraph();
      if (!graph) return send(res, 404, { ok: false, error: `${DOC_GRAPH_FILE} not found — run tools/doc-graph/scan.mjs first` });
      return send(res, 200, graph);
    }
    if (req.method === "GET" && url.pathname === "/api/doc-content") {
      // SECURITY: `path` is caller-controlled, so it is never joined onto ROOT and probed.
      // It must name a node the doc-graph already published — a membership test against a
      // known set. A `startsWith(ROOT)` check on `join(ROOT, rel)` does NOT hold: '../G-Maiden-secret'
      // normalizes to a sibling directory whose absolute path still passes the prefix test,
      // and even a correct containment check would still expose .env / .git/config.
      // Same rule as /api/rwang/state above: no filesystem path from the query string.
      const graph = readDocGraph();
      if (!graph) return send(res, 404, { ok: false, error: `${DOC_GRAPH_FILE} not found — run tools/doc-graph/scan.mjs first` });
      const rel = url.searchParams.get("path") || "";
      if (!(graph.nodes || []).some((n) => n.path === rel)) {
        return send(res, 403, { ok: false, error: "path is not a doc-graph node" });
      }
      const full = join(E.PATHS.ROOT, rel);
      if (!existsSync(full)) return send(res, 404, { ok: false, error: "File not found" });
      return send(res, 200, { ok: true, content: readFileSync(full, "utf8") });
    }
    // Node↔DB canvas write endpoints (feature--node-db-canvas)
    if (req.method === "POST" && url.pathname === "/api/node") {
      const body = await readBody(req);
      try { return send(res, 200, await writeNode(E.CONFIG, body)); }
      catch (e) { return send(res, 500, { ok: false, error: e.message }); }
    }
    if (req.method === "POST" && url.pathname === "/api/edge") {
      const body = await readBody(req);
      try { return send(res, 200, await writeEdge(E.CONFIG, body)); }
      catch (e) { return send(res, 500, { ok: false, error: e.message }); }
    }
    if (req.method === "POST" && url.pathname === "/api/query-nodes") {
      const body = await readBody(req);
      try { return send(res, 200, await queryNodes(E.CONFIG, body)); }
      catch (e) { return send(res, 500, { ok: false, error: e.message }); }
    }
    // Semantic doc search (feature--g-aligner). Roots are fixed server-side, never taken from the body.
    if (req.method === "POST" && url.pathname === "/api/search") {
      const { query, limit, backend } = await readBody(req);
      try {
        const { semanticSearch } = await import("../tools/doc-graph/semantic_ir.mjs");
        const roots = [join(E.PATHS.ROOT, "docs"), join(E.PATHS.ROOT, ".govibe", ".brain")];
        return send(res, 200, { ok: true, hits: await semanticSearch(roots, query, { limit, backend }) });
      } catch (e) { return send(res, 500, { ok: false, error: e.message }); }
    }
    if (req.method === "POST" && url.pathname === "/api/cmd") {
      const { action, id, worker, model, owner, mode, max, on, tier, deps } = await readBody(req);
      let r;
      switch (action) {
        case "claim": r = E.claim(id, worker || "ui"); break;
        case "done": r = E.setStatus(id, "done"); break;
        case "fail": r = E.setStatus(id, "failed"); break;
        case "release": r = E.setStatus(id, "todo"); break;
        case "assign": r = E.assign(id, model || null); break;
        case "assignowner": r = E.assignOwner(id, owner || null); break;
        case "dispatch": r = E.dispatchOne(id, worker || "ui"); break;
        case "run": r = E.runPool({ mode: mode || "wave", max: Number(max) || undefined }); break;
        case "stop": r = E.stopPool(); break;
        case "setauth": r = E.setAuthMode(mode); break;
        case "reset": r = E.reset(); break;
        case "killswitch": r = E.setKillSwitch(!!on); break;
        case "settier": r = E.setTier(tier); break;
        case "setdeps": r = await E.setDeps(id, deps); break;
        case "confirm": r = E.confirmAtom(id); break;
        case "unconfirm": r = E.unconfirmAtom(id); break;
        default: r = { ok: false, error: "unknown action " + action };
      }
      return send(res, r.ok === false ? 400 : 200, r);
    }
    send(res, 404, { ok: false, error: "not found" });
  } catch (e) { send(res, 500, { ok: false, error: e.message }); }
});

server.listen(PORT, () => {
  console.log(`\n  G-Maiden Orchestrator UI → http://localhost:${PORT}\n  (Ctrl+C เพื่อหยุด)\n`);
  // governance interlock at boot (engine-lint-interlock): the same meta-guard the runner honors.
  // The verdict is cached inside the engine; runPool/dispatchOne re-check it before any dispatch.
  const gv = E.governanceInterlock({ force: true });
  if (gv.ok === true) console.log("  governance lint: OK");
  else if (gv.ok === false) console.log("  ⛔ governance lint BROKEN — dispatch is blocked: " + gv.detail);
  else console.log("  governance lint: " + gv.detail);
});

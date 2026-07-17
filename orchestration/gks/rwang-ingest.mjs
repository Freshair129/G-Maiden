// gks/rwang-ingest.mjs — RWANG project ingest adapter (feature--gorch-rw1-ingest, read-only mirror).
// อ่านไฟล์ RWANG (queue/IMPLEMENTATION_QUEUE.json, state/PROJECT_STATE.json, state/progress.jsonl,
// state/events.jsonl) จากโปรเจกต์ RWANG ภายนอก (ในเรโปนี้คือ repo root, root=".." จาก orchestration/)
// แล้ว project ให้เป็นรูปทรงเดียวกับ engine.mjs snapshot() เพื่อให้ studio/legacy UI render ได้ไม่ต้องแก้.
// Zero-dependency Node ESM. Read-only: this module never writes back to the RWANG project files.
import { readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url)); // orchestration/gks
const ORCH_DIR = join(__dir, "..");                    // orchestration/ — the base for relative project roots

// ---------- tolerant readers (missing file -> sensible empty; malformed content -> fallback) ----------
// BOM: strip a leading U+FEFF before JSON.parse, same as engine.mjs loadJson() — Windows-authored
// RWANG files (like this repo's own config.json) can carry one, and a silent parse failure here
// would drop the whole queue with no diagnostic (Opus gate, GORCH-RW1).
// loadWarnings: parse failures are recorded (not just swallowed) so toSnapshot can surface them
// in `warnings` — a malformed queue must not silently shrink progress.total (Opus gate, GORCH-RW1).
function stripBom(text) { return text.replace(/^﻿/, ""); }
function readJsonTolerant(path, fallback, loadWarnings) {
  if (!existsSync(path)) return fallback;
  try { return JSON.parse(stripBom(readFileSync(path, "utf8"))); } catch (e) {
    if (loadWarnings) loadWarnings.push(`parse failed: ${basename(path)} (${e.message}) — using empty fallback`);
    return fallback;
  }
}
// state/progress.jsonl + state/events.jsonl are append-only JSONL: skip malformed lines individually
// (same tolerance as knowledgeOutcomes()'s failures.jsonl parsing in engine.mjs), don't fail the whole file.
function readJsonlTolerant(path, loadWarnings) {
  if (!existsSync(path)) return [];
  let text;
  try { text = readFileSync(path, "utf8"); } catch { return []; }
  const out = [];
  let skipped = 0;
  for (const line of stripBom(text).split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try { out.push(JSON.parse(t)); } catch { skipped += 1; }
  }
  if (skipped > 0 && loadWarnings) loadWarnings.push(`${basename(path)}: skipped ${skipped} malformed line(s)`);
  return out;
}

/** Read the four RWANG project files under `root`. Tolerant of any of them being absent/malformed;
 *  parse problems are collected into `loadWarnings` (merged into toSnapshot's `warnings`). */
export function loadRwangProject(root) {
  const loadWarnings = [];
  const state = readJsonTolerant(join(root, "state", "PROJECT_STATE.json"), {}, loadWarnings);
  const queueRaw = readJsonTolerant(join(root, "queue", "IMPLEMENTATION_QUEUE.json"), { tasks: [] }, loadWarnings);
  const queue = { ...queueRaw, tasks: Array.isArray(queueRaw?.tasks) ? queueRaw.tasks : [] };
  const progress = readJsonlTolerant(join(root, "state", "progress.jsonl"), loadWarnings);
  const events = readJsonlTolerant(join(root, "state", "events.jsonl"), loadWarnings);
  // queue/PROJECT_GRAPH.json may be absent — not read by this adapter (not part of the snapshot shape yet).
  return { state, queue, progress, events, loadWarnings };
}

// ---------- status mapping table (a2a-surface style: both directions documented) ----------
// RWANG progress.jsonl status -> this ingest's engine-style task status (forward direction, used by
// deriveTaskStatus below). "Completed" only reads as "reviewing" until a later wave:* Reviewed|Merged
// entry promotes it to "done" — see deriveTaskStatus. Verified/Reviewed appearing directly on a task id
// (rather than a wave:* row) are treated the same as Completed (an extension beyond the literal spec,
// documented in the task's NOTES/RISKS).
const TO_ENGINE_STATUS = {
  Started: "running",
  Failed: "failed",
  Completed: "reviewing",
  Verified: "reviewing",
  Reviewed: "reviewing",
  Merged: "done",
};
// Reverse direction (engine-style status -> the RWANG progress-status that would represent it), kept for
// symmetry with a2a-surface.mjs's TO_A2A/FROM_A2A pair. RWANG does not consume this direction today —
// this adapter is read-only — but it documents the mapping's invertibility (todo/ready have no progress
// row at all, so they map to null).
const FROM_ENGINE_STATUS = {
  todo: null, ready: null, running: "Started", failed: "Failed", reviewing: "Completed", done: "Merged",
};
export const RWANG_STATUS = { TO_ENGINE_STATUS, FROM_ENGINE_STATUS };

function parseTs(ts) { const n = Date.parse(ts); return Number.isNaN(n) ? 0 : n; }

/**
 * Derive one task's engine-style status from (progress entries for that id, the ready flag).
 * Rules (in order):
 *   - no progress entry + ready:false -> "todo"
 *   - no progress entry + ready:true  -> "ready"
 *   - latest progress entry Started   -> "running"
 *   - latest progress entry Failed    -> "failed"
 *   - latest progress entry Completed (or Verified/Reviewed directly on the id) -> "reviewing",
 *     UNLESS some wave:* progress entry has status Reviewed|Merged with ts >= the latest entry's ts,
 *     in which case -> "done" (the wave-Merged/Reviewed promotion).
 *   - latest progress entry Merged    -> "done"
 *
 * ASSUMPTION (Opus gate, GORCH-RW1): the promotion keys on ANY wave:* row because RWANG's
 * progress.jsonl does not attribute a task to its owning wave, and RWANG waves run strictly
 * sequentially (a wave merges before the next dispatches). If a project ever interleaves waves,
 * a Completed task from an abandoned wave could be falsely promoted by an unrelated wave's
 * merge — tightening then requires wave attribution in the RWANG log format itself.
 */
export function deriveTaskStatus(taskId, progress, ready) {
  const own = (progress || []).filter((p) => p && p.task === taskId);
  if (!own.length) return ready ? "ready" : "todo";
  const latest = own[own.length - 1]; // append-only log -> last matching entry is the latest
  const mapped = TO_ENGINE_STATUS[latest.status];
  if (!mapped) return ready ? "ready" : "todo"; // unrecognized status: fall back like "no progress"
  if (mapped === "reviewing") {
    const at = parseTs(latest.ts);
    const promoted = (progress || []).some(
      (p) => p && typeof p.task === "string" && p.task.startsWith("wave:") &&
        (p.status === "Reviewed" || p.status === "Merged") && parseTs(p.ts) >= at
    );
    if (promoted) return "done";
  }
  return mapped;
}

// ---------- waves: Kahn dep-level algorithm (same pattern as atom-schema.validateSet) ----------
/**
 * Compute dependency levels/waves over RWANG tasks (field `dependencies`, not `deps`). Unknown deps
 * (ids that don't exist in the task set — e.g. a dep that rotated out of the queue) are tolerated by
 * treating them as level-0 inputs (an already-satisfied phantom prerequisite), and recorded as warnings.
 */
export function computeWaves(tasks) {
  const warnings = [];
  const ids = new Set(tasks.map((t) => t.id));
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const level = new Map();
  const calc = (id, visiting) => {
    if (level.has(id)) return level.get(id);
    if (visiting.has(id)) { warnings.push(`cycle detected at ${id}`); level.set(id, 0); return 0; }
    visiting.add(id);
    const deps = byId.get(id).dependencies || [];
    const depLevels = deps.map((d) => {
      if (!ids.has(d)) { warnings.push(`unknown dep: ${id} -> ${d} (treated as level-0 input)`); return 0; }
      return calc(d, visiting);
    });
    const L = depLevels.length ? Math.max(...depLevels) + 1 : 0;
    visiting.delete(id);
    level.set(id, L);
    return L;
  };
  for (const t of tasks) calc(t.id, new Set());
  const maxLevel = tasks.length ? Math.max(...tasks.map((t) => level.get(t.id))) : -1;
  const waves = Array.from({ length: maxLevel + 1 }, () => []); // dense — no holes even for empty levels
  for (const t of tasks) waves[level.get(t.id)].push(t.id);
  return { level, waves, warnings };
}

// ---------- projection: RWANG project -> engine.mjs snapshot()-shaped object ----------
/**
 * Shape it exactly like engine.mjs snapshot() so the studio/legacy UI can render it unchanged.
 * Tasks present in the *current* queue snapshot project with the full field set; task ids that only
 * exist in state/progress.jsonl (rotated out of the queue by a later wave, e.g. a prior wave's
 * completed tasks) are merged in as minimal historical entries so progress/counts reflect the whole
 * project's history, not just the in-flight wave — see NOTES in the task write-up.
 */
export function toSnapshot(project) {
  const { state = {}, queue = {}, progress = [], events = [] } = project || {};
  const queueTasks = Array.isArray(queue.tasks) ? queue.tasks : [];
  const seen = new Set(queueTasks.map((t) => t.id));
  const historicalTasks = [];
  for (const p of progress) {
    if (p && typeof p.task === "string" && !p.task.startsWith("wave:") && !seen.has(p.task)) {
      seen.add(p.task);
      historicalTasks.push({
        id: p.task, title: p.task, category: undefined, dependencies: [], verification: [],
        estimated_complexity: undefined, ready: false, worker_group: undefined,
      });
    }
  }
  const allTasks = [...historicalTasks, ...queueTasks];

  const { waves, warnings } = computeWaves(allTasks);
  const statusById = new Map();
  for (const t of allTasks) statusById.set(t.id, deriveTaskStatus(t.id, progress, !!t.ready));

  const tasks = allTasks.map((t) => {
    const deps = t.dependencies || [];
    // a dep id not present in the task set (rotated out / unknown) is treated as already-satisfied,
    // consistent with computeWaves' level-0 treatment of unknown deps.
    const depsDone = deps.every((d) => !statusById.has(d) || statusById.get(d) === "done");
    return {
      id: t.id,
      title: t.title,
      type: String(t.category || "unknown").toLowerCase(),
      phase: state.current_phase ?? null,
      role: t.worker_group ?? null,
      status: statusById.get(t.id),
      deps,
      depsDone,
      ready: !!t.ready,
      est: t.estimated_complexity ?? null,
      accept: Array.isArray(t.verification) ? t.verification.join(", ") : "",
    };
  });

  const counts = {};
  for (const t of tasks) counts[t.status] = (counts[t.status] || 0) + 1;
  const total = tasks.length;
  const done = counts.done || 0;

  return {
    progress: { done, total, pct: total ? Math.round((done / total) * 100) : 0 },
    counts,
    updatedAt: state.updated_at ?? null,
    waves: waves.map((w) => w || []),
    wave: { name: queue.wave ?? null, title: queue.wave_title ?? null },
    project: { name: state.project ?? queue.project ?? null, phase: state.current_phase ?? null, phaseStatus: state.phase_status ?? null },
    tasks,
    events: [...events].reverse().slice(0, 20),
    // diagnostics — load-time parse problems first (a malformed queue must be visible, not a
    // silently-shrunk total), then graph diagnostics (unknown-dep etc.). Additive to the base
    // snapshot shape, harmless for the UI (Opus gate, GORCH-RW1).
    warnings: [...(project.loadWarnings ?? []), ...warnings],
  };
}

// ---------- registry: rwang.projects from config.json ----------
/** Read config.rwang.projects, resolving each relative `root` against the orchestration/ dir. */
export function listProjects(config) {
  const list = config?.rwang?.projects;
  if (!Array.isArray(list)) return [];
  return list.filter((p) => p && p.name && p.root != null).map((p) => ({ name: p.name, root: resolve(ORCH_DIR, p.root) }));
}

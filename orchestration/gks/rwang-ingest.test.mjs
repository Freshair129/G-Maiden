// gks/rwang-ingest.test.mjs — acceptance for feature--gorch-rw1-ingest.
// ทดสอบด้วย temp-dir fixtures (mkdtemp) เสมอ — ไม่พึ่งไฟล์ RWANG จริงของเรโปนี้ (ตามที่ระบุใน task).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadRwangProject, RWANG_STATUS, deriveTaskStatus, computeWaves, toSnapshot, listProjects,
} from "./rwang-ingest.mjs";

function makeFixture(files) {
  const root = mkdtempSync(join(tmpdir(), "rwang-ingest-"));
  for (const [rel, content] of Object.entries(files)) {
    const full = join(root, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  return root;
}
function jsonl(lines) { return lines.map((l) => JSON.stringify(l)).join("\n") + "\n"; }

// ---------- status-mapping table ----------
test("no progress + ready:false -> todo", () => {
  assert.equal(deriveTaskStatus("T1", [], false), "todo");
});
test("no progress + ready:true -> ready", () => {
  assert.equal(deriveTaskStatus("T1", [], true), "ready");
});
test("latest progress Started -> running", () => {
  const p = [{ ts: "2026-01-01T00:00:00Z", task: "T1", status: "Started" }];
  assert.equal(deriveTaskStatus("T1", p, true), "running");
});
test("latest progress Failed -> failed", () => {
  const p = [
    { ts: "2026-01-01T00:00:00Z", task: "T1", status: "Started" },
    { ts: "2026-01-01T00:00:01Z", task: "T1", status: "Failed" },
  ];
  assert.equal(deriveTaskStatus("T1", p, true), "failed");
});
test("latest progress Completed (no wave promotion yet) -> reviewing", () => {
  const p = [
    { ts: "2026-01-01T00:00:00Z", task: "T1", status: "Started" },
    { ts: "2026-01-01T00:00:01Z", task: "T1", status: "Completed" },
  ];
  assert.equal(deriveTaskStatus("T1", p, true), "reviewing");
});
test("Completed + a LATER wave:* Reviewed entry (ts >= completed ts) -> done", () => {
  const p = [
    { ts: "2026-01-01T00:00:01Z", task: "T1", status: "Completed" },
    { ts: "2026-01-01T00:00:02Z", task: "wave:W1", status: "Reviewed" },
  ];
  assert.equal(deriveTaskStatus("T1", p, true), "done");
});
test("Completed + a LATER wave:* Merged entry (ts >= completed ts) -> done", () => {
  const p = [
    { ts: "2026-01-01T00:00:01Z", task: "T1", status: "Completed" },
    { ts: "2026-01-01T00:00:02Z", task: "wave:W1", status: "Merged" },
  ];
  assert.equal(deriveTaskStatus("T1", p, true), "done");
});
test("Completed + an EARLIER wave:* Reviewed entry (ts < completed ts) -> stays reviewing", () => {
  const p = [
    { ts: "2026-01-01T00:00:00Z", task: "wave:W1", status: "Reviewed" },
    { ts: "2026-01-01T00:00:05Z", task: "T1", status: "Completed" },
  ];
  assert.equal(deriveTaskStatus("T1", p, true), "reviewing");
});
test("Merged directly on the task id -> done", () => {
  const p = [{ ts: "2026-01-01T00:00:00Z", task: "T1", status: "Merged" }];
  assert.equal(deriveTaskStatus("T1", p, true), "done");
});
test("RWANG_STATUS documents both directions", () => {
  assert.equal(RWANG_STATUS.TO_ENGINE_STATUS.Started, "running");
  assert.equal(RWANG_STATUS.TO_ENGINE_STATUS.Merged, "done");
  assert.equal(RWANG_STATUS.FROM_ENGINE_STATUS.done, "Merged");
  assert.equal(RWANG_STATUS.FROM_ENGINE_STATUS.todo, null);
});

// ---------- tolerant loading ----------
test("loadRwangProject tolerates a completely missing project dir", () => {
  const root = mkdtempSync(join(tmpdir(), "rwang-ingest-empty-"));
  const p = loadRwangProject(root);
  assert.deepEqual(p.state, {});
  assert.deepEqual(p.queue, { tasks: [] });
  assert.deepEqual(p.progress, []);
  assert.deepEqual(p.events, []);
});
test("loadRwangProject skips malformed JSONL lines but keeps valid ones", () => {
  const root = makeFixture({
    "state/progress.jsonl": [
      JSON.stringify({ ts: "t1", task: "A", status: "Started" }),
      "{not valid json,,,",
      JSON.stringify({ ts: "t2", task: "A", status: "Completed" }),
      "",
    ].join("\n"),
  });
  const p = loadRwangProject(root);
  assert.equal(p.progress.length, 2);
  assert.equal(p.progress[0].task, "A");
  assert.equal(p.progress[1].status, "Completed");
});
test("loadRwangProject tolerates malformed JSON in queue/state files (falls back to empty)", () => {
  const root = makeFixture({
    "queue/IMPLEMENTATION_QUEUE.json": "{ this is not json",
    "state/PROJECT_STATE.json": "{ also not json",
  });
  const p = loadRwangProject(root);
  assert.deepEqual(p.queue, { tasks: [] });
  assert.deepEqual(p.state, {});
});
test("loadRwangProject tolerates queue/PROJECT_GRAPH.json being absent entirely", () => {
  const root = makeFixture({
    "queue/IMPLEMENTATION_QUEUE.json": JSON.stringify({ wave: "W1", tasks: [] }),
  });
  assert.doesNotThrow(() => loadRwangProject(root));
});

// ---------- waves computation ----------
test("computeWaves: a simple chain A -> B -> C", () => {
  const tasks = [
    { id: "A", dependencies: [] },
    { id: "B", dependencies: ["A"] },
    { id: "C", dependencies: ["B"] },
  ];
  const { waves, warnings } = computeWaves(tasks);
  assert.deepEqual(waves, [["A"], ["B"], ["C"]]);
  assert.equal(warnings.length, 0);
});
test("computeWaves: parallel tasks at the same level", () => {
  const tasks = [
    { id: "A", dependencies: [] },
    { id: "B", dependencies: [] },
    { id: "C", dependencies: ["A", "B"] },
  ];
  const { waves } = computeWaves(tasks);
  assert.deepEqual(waves[0].sort(), ["A", "B"]);
  assert.deepEqual(waves[1], ["C"]);
});
test("computeWaves: unknown dep is tolerated as a level-0 input and produces a warning", () => {
  const tasks = [{ id: "A", dependencies: ["GHOST"] }];
  const { waves, warnings } = computeWaves(tasks);
  assert.deepEqual(waves, [[], ["A"]]); // A depends on a phantom level-0 node -> A is level 1
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /unknown dep/);
  assert.match(warnings[0], /GHOST/);
});

// ---------- toSnapshot ----------
test("toSnapshot: counts/pct math over a small fixture", () => {
  const project = {
    state: { project: "Fixture", current_phase: 3, phase_status: "in_progress", updated_at: "2026-01-02" },
    queue: {
      wave: "W1", wave_title: "Fixture wave",
      tasks: [
        { id: "T1", title: "Task one", category: "Agent", dependencies: [], estimated_complexity: "S", verification: ["node --test"], ready: true, worker_group: "A" },
        { id: "T2", title: "Task two", category: "UI", dependencies: ["T1"], estimated_complexity: "M", verification: [], ready: true, worker_group: "B" },
      ],
    },
    progress: [
      { ts: "2026-01-01T00:00:00Z", task: "T1", status: "Started" },
      { ts: "2026-01-01T00:00:01Z", task: "T1", status: "Completed" },
      { ts: "2026-01-01T00:00:02Z", task: "wave:W1", status: "Merged" },
      { ts: "2026-01-01T00:00:03Z", task: "T2", status: "Started" },
    ],
    events: Array.from({ length: 25 }, (_, i) => ({ ts: `e${i}`, event: "X", detail: String(i) })),
  };
  const snap = toSnapshot(project);
  assert.equal(snap.progress.total, 2);
  assert.equal(snap.progress.done, 1); // T1 promoted to done via wave:W1 Merged
  assert.equal(snap.progress.pct, 50);
  assert.equal(snap.counts.done, 1);
  assert.equal(snap.counts.running, 1); // T2 Started
  assert.equal(snap.wave.name, "W1");
  assert.equal(snap.wave.title, "Fixture wave");
  assert.equal(snap.project.name, "Fixture");
  assert.equal(snap.project.phase, 3);
  assert.equal(snap.updatedAt, "2026-01-02");
  assert.deepEqual(snap.waves, [["T1"], ["T2"]]);
  const t1 = snap.tasks.find((t) => t.id === "T1");
  const t2 = snap.tasks.find((t) => t.id === "T2");
  assert.equal(t1.status, "done");
  assert.equal(t1.type, "agent");
  assert.equal(t1.accept, "node --test");
  assert.equal(t2.depsDone, true); // T1 is done, so T2's dep is satisfied
  assert.equal(snap.events.length, 20);
  assert.equal(snap.events[0].detail, "24"); // newest first
});
test("toSnapshot: merges historical task ids (only in progress.jsonl) that rotated out of the queue", () => {
  const project = {
    state: {},
    queue: { wave: "W2", tasks: [{ id: "NEW1", category: "Agent", dependencies: [], verification: [], ready: true }] },
    progress: [
      { ts: "t0", task: "OLD1", status: "Started" },
      { ts: "t1", task: "OLD1", status: "Completed" },
      { ts: "t2", task: "wave:W1", status: "Merged" },
    ],
    events: [],
  };
  const snap = toSnapshot(project);
  assert.equal(snap.progress.total, 2);
  const old1 = snap.tasks.find((t) => t.id === "OLD1");
  assert.ok(old1, "historical-only task id should be present in tasks[]");
  assert.equal(old1.status, "done");
});
test("toSnapshot: empty project (no queue tasks, no progress) is zeroed out safely", () => {
  const snap = toSnapshot({ state: {}, queue: { tasks: [] }, progress: [], events: [] });
  assert.deepEqual(snap.progress, { done: 0, total: 0, pct: 0 });
  assert.deepEqual(snap.tasks, []);
  assert.deepEqual(snap.waves, []);
});

// ---------- listProjects ----------
test("listProjects resolves a relative root against the orchestration/ dir", () => {
  const config = { rwang: { projects: [{ name: "G-Maiden", root: ".." }] } };
  const result = listProjects(config);
  assert.equal(result.length, 1);
  assert.equal(result[0].name, "G-Maiden");
  const gksDir = dirname(fileURLToPath(import.meta.url)); // this test lives in orchestration/gks/, same as the module
  const expectedRoot = resolve(gksDir, "..", ".."); // orchestration/ -> its parent (repo root)
  assert.equal(result[0].root, expectedRoot);
});
test("listProjects passes through an already-absolute root unchanged", () => {
  const abs = mkdtempSync(join(tmpdir(), "rwang-ingest-abs-"));
  const config = { rwang: { projects: [{ name: "Abs", root: abs }] } };
  const result = listProjects(config);
  assert.equal(result[0].root, abs);
  rmSync(abs, { recursive: true, force: true });
});
test("listProjects tolerates a missing rwang.projects config block", () => {
  assert.deepEqual(listProjects({}), []);
  assert.deepEqual(listProjects(undefined), []);
});

// ---------- gate fixes (Opus gate, GORCH-RW1): BOM tolerance + parse-failure observability ----------
test("BOM-prefixed queue/state files still parse (Windows-authored RWANG repos)", () => {
  const BOM = "﻿";
  const root = makeFixture({
    "queue/IMPLEMENTATION_QUEUE.json": BOM + JSON.stringify({ wave: "W", wave_title: "t", tasks: [
      { id: "T1", title: "a", dependencies: [], ready: true, status: "dispatched" },
    ] }),
    "state/PROJECT_STATE.json": BOM + JSON.stringify({ project: "P", current_phase: 7, phase_status: "in_progress" }),
    "state/progress.jsonl": BOM + jsonl([{ ts: "2026-01-01T00:00:00Z", task: "T1", status: "Started" }]),
  });
  try {
    const snap = toSnapshot(loadRwangProject(root));
    assert.equal(snap.progress.total, 1);
    assert.equal(snap.tasks[0].status, "running");
    assert.deepEqual(snap.warnings, []);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test("malformed queue JSON surfaces a warning instead of silently shrinking total", () => {
  const root = makeFixture({
    "queue/IMPLEMENTATION_QUEUE.json": "{ not json",
    "state/progress.jsonl": jsonl([{ ts: "2026-01-01T00:00:00Z", task: "T9", status: "Completed" }]),
  });
  try {
    const snap = toSnapshot(loadRwangProject(root));
    assert.ok(snap.warnings.some((w) => w.includes("IMPLEMENTATION_QUEUE.json")));
    // historical task from progress.jsonl still shows up
    assert.equal(snap.progress.total, 1);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

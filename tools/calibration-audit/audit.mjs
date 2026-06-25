#!/usr/bin/env node
/**
 * Calibration audit tool (Phase 3) — closes the G-Log #7 loop.
 *
 * Reads a match's calibration evidence (audit.jsonl + keyframe PNGs produced by
 * the in-game calibration mode) and has a VISION model verdict each event:
 * was the detection/prediction CORRECT? — then writes an audit report and a
 * machine-readable verdicts file used to re-tune thresholds.
 *
 * Backends:
 *   (default) dry   — structure + count only, no model (works with zero deps/keys)
 *   --ollama <model>— local vision-language model via /api/chat (e.g. a VL GGUF)
 *
 * Usage:
 *   node audit.mjs                         # latest match, dry
 *   node audit.mjs --dir <path>            # a specific match folder
 *   node audit.mjs --ollama qwen2.5vl:3b   # real verdicts from a local VL
 *
 * Output (in the match folder): audit-report.md  +  verdicts.jsonl
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const flag = (name, def) => { const i = args.indexOf(name); return i >= 0 ? (args[i + 1] ?? true) : def; };

const CALIB_ROOT = join(process.env.LOCALAPPDATA || ".", "G-Maiden", "calibration");
const host = (process.env.OLLAMA_HOST || "http://127.0.0.1:11434").replace(/\/$/, "");

function latestMatchDir() {
  if (!existsSync(CALIB_ROOT)) return null;
  const dirs = readdirSync(CALIB_ROOT)
    .map((n) => join(CALIB_ROOT, n))
    .filter((p) => { try { return statSync(p).isDirectory(); } catch { return false; } });
  dirs.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return dirs[0] || null;
}

const dir = flag("--dir", null) || latestMatchDir();
const ollamaModel = flag("--ollama", null);

if (!dir || !existsSync(join(dir, "audit.jsonl"))) {
  console.error(`no audit.jsonl found (dir=${dir}).\n→ enable Calibration in a match first, or pass --dir <path>.`);
  process.exit(1);
}

const events = readFileSync(join(dir, "audit.jsonl"), "utf8")
  .split("\n").filter(Boolean)
  .map((l) => { try { return JSON.parse(l); } catch { return { _bad: true }; } })
  .filter((e) => !e._bad);

const imagesFor = (ev) =>
  (ev.keyframes?.length ? ev.keyframes : ev.image ? [ev.image] : [])
    .map((n) => join(dir, n)).filter(existsSync);

function prompt(ev) {
  const ctx = JSON.stringify(ev.context ?? {});
  const q = {
    gank: `These keyframes span ~3s before to ~3s after a GANK WARNING Maiden gave ("${ev.line || ""}"). Was an enemy gank/threat really developing?`,
    "enemy-missing": `Maiden flagged enemy hero(es) missing from the minimap (context ${ctx}). Do the frame(s) support it (heroes off-screen / not visible)?`,
    danger: `Maiden warned the player was in danger ("${ev.line || ""}", context ${ctx}). Did the situation justify it?`,
  }[ev.event] || `Event "${ev.event}" (line "${ev.line || ""}", context ${ctx}). Was the call appropriate?`;
  return `${q} Reply ONLY compact JSON: {"verdict":"correct|false_positive|missed|unclear","confidence":0-1,"reason":"short"}.`;
}

async function ollamaVerdict(ev) {
  const imgs = imagesFor(ev).slice(0, 6).map((p) => readFileSync(p).toString("base64"));
  const body = { model: ollamaModel, stream: false, options: { temperature: 0.2 },
    messages: [{ role: "user", content: prompt(ev), images: imgs }] };
  const r = await fetch(`${host}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`ollama HTTP ${r.status}`);
  const text = (await r.json()).message?.content || "";
  const m = text.match(/\{[\s\S]*\}/);
  try { return m ? JSON.parse(m[0]) : { verdict: "unclear", confidence: 0, reason: text.slice(0, 120) }; }
  catch { return { verdict: "unclear", confidence: 0, reason: text.slice(0, 120) }; }
}

const verdicts = [];
for (const ev of events) {
  const nImg = imagesFor(ev).length;
  let verdict = null;
  if (ollamaModel) {
    try { verdict = await ollamaVerdict(ev); } catch (e) { verdict = { verdict: "error", reason: e.message }; }
  }
  verdicts.push({ ts: ev.ts, event: ev.event, kind: ev.kind, line: ev.line ?? null, images: nImg, verdict });
  console.log(`${String(ev.event).padEnd(14)} ${String(ev.kind).padEnd(11)} imgs=${nImg}${verdict ? "  → " + verdict.verdict : "  (dry)"}`);
}

const KEY = { correct: "correct", false_positive: "fp", missed: "missed" };
const byType = {};
for (const v of verdicts) {
  const t = (byType[v.event] ??= { n: 0, img: 0, correct: 0, fp: 0, missed: 0, unclear: 0 });
  t.n++; t.img += v.images;
  if (v.verdict?.verdict) t[KEY[v.verdict.verdict] ?? "unclear"]++;
}

let md = `# Calibration Audit\n\n`;
md += `- match: \`${dir}\`\n- events: **${verdicts.length}**\n- backend: ${ollamaModel ? "`ollama:" + ollamaModel + "`" : "dry (no model — structure only)"}\n\n`;
md += `| event | n | imgs | correct | false_pos | missed | unclear |\n|---|---|---|---|---|---|---|\n`;
for (const [t, c] of Object.entries(byType))
  md += `| ${t} | ${c.n} | ${c.img} | ${c.correct} | ${c.fp} | ${c.missed} | ${c.unclear} |\n`;
if (ollamaModel && byType.gank?.n >= 3) {
  const fp = byType.gank.fp / byType.gank.n;
  md += `\n## Suggestions\n- gank false-positive rate **${(fp * 100).toFixed(0)}%** — ${fp > 0.3 ? "RAISE the gank probability threshold (>85%) to cut false alarms." : "threshold looks reasonable."}\n`;
}
if (!ollamaModel) md += `\n> dry run — no verdicts. Re-run with \`--ollama <vision-model>\` for correctness labels + tuning suggestions.\n`;

writeFileSync(join(dir, "audit-report.md"), md);
writeFileSync(join(dir, "verdicts.jsonl"), verdicts.map((v) => JSON.stringify(v)).join("\n"));
console.log(`\nwrote audit-report.md + verdicts.jsonl → ${dir}`);

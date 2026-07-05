#!/usr/bin/env node
/**
 * G-Offload runner — dispatch a prompt to a cheap provider tier and log it,
 * so the G-Offload Monitor (index.html) can show multi-tier activity.
 *
 * Usage:
 *   node run.mjs ollama <model> "prompt"      # local, free  (127.0.0.1:11434)
 *   node run.mjs openrouter <model> "prompt"  # cloud        (needs OPENROUTER_API_KEY)
 *   node run.mjs codex [-] "prompt"           # OpenAI Codex CLI (spawns `codex exec`)
 *
 * Appends one entry to ./offload-log.json (array) + ./offload-log.jsonl.
 * Keep orchestration / audit / integration on Claude; offload cheap/visual/mechanical work here.
 */
import { readFileSync, writeFileSync, existsSync, appendFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const LOG_JSON = join(HERE, "offload-log.json");
const LOG_JSONL = join(HERE, "offload-log.jsonl");
const OLLAMA = process.env.OLLAMA_HOST || "http://127.0.0.1:11434";

function openrouterKey() {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY;
  // fall back to RWANG's .env (the user's own key) without printing it
  const envPath = "G:/GenesisBlock_Dev/Rwang_remote/.env";
  if (existsSync(envPath)) {
    const m = readFileSync(envPath, "utf8").match(/^OPENROUTER_API_KEY\s*=\s*(.+)$/m);
    if (m) return m[1].trim().replace(/^["']|["']$/g, "");
  }
  return null;
}

function logEntry(e) {
  const entry = { ts: new Date().toISOString(), ...e };
  let arr = [];
  try { arr = JSON.parse(readFileSync(LOG_JSON, "utf8")); } catch {}
  arr.push(entry);
  writeFileSync(LOG_JSON, JSON.stringify(arr, null, 2));
  appendFileSync(LOG_JSONL, JSON.stringify(entry) + "\n");
}

async function runOllama(model, prompt) {
  const r = await fetch(`${OLLAMA}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model, stream: false, think: false, keep_alive: "30m",
      options: { temperature: 0.3, num_predict: 2048, num_ctx: 8192 },
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!r.ok) throw new Error(`ollama ${r.status}: ${await r.text()}`);
  const j = await r.json();
  return { text: j.message?.content ?? "", tokens: (j.prompt_eval_count || 0) + (j.eval_count || 0) };
}

async function runOpenRouter(model, prompt) {
  const key = openrouterKey();
  if (!key) throw new Error("OPENROUTER_API_KEY not set (env or Rwang_remote/.env)");
  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }] }),
  });
  if (!r.ok) throw new Error(`openrouter ${r.status}: ${await r.text()}`);
  const j = await r.json();
  return { text: j.choices?.[0]?.message?.content ?? "", tokens: j.usage?.total_tokens || 0 };
}

function runCodex(model, prompt) {
  return new Promise((res, rej) => {
    const args = ["exec", "--sandbox", "read-only", "--skip-git-repo-check"];
    if (model && model !== "-") args.push("-c", `model=${JSON.stringify(model)}`);
    args.push(prompt);
    const child = spawn("codex", args, { shell: true, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (code) => (code === 0 ? res({ text: out, tokens: 0 }) : rej(new Error(`codex exit ${code}`))));
    child.on("error", rej);
  });
}

const [, , provider, model, ...rest] = process.argv;
const prompt = rest.join(" ");
if (!provider || !prompt) {
  console.error('usage: node run.mjs <ollama|openrouter|codex> <model|-> "prompt"');
  process.exit(1);
}

// the actual underlying call each provider makes — shown in the monitor's Activity view
function cmdFor(p, m) {
  if (p === "ollama") return `POST ${OLLAMA}/api/chat  model=${m}`;
  if (p === "openrouter") return `POST openrouter.ai/api/v1/chat/completions  model=${m}`;
  if (p === "codex") return `codex exec --sandbox read-only  model=${m || "(default)"}`;
  return `${p} ${m}`;
}

const t0 = Date.now();
const runners = { ollama: runOllama, openrouter: runOpenRouter, codex: runCodex };
const fn = runners[provider];
if (!fn) { console.error("unknown provider:", provider); process.exit(1); }

try {
  const { text, tokens } = await fn(model, prompt);
  const durationMs = Date.now() - t0;
  logEntry({ provider, model: model || "(default)", task: prompt.slice(0, 80), tokens, durationMs, status: "ok",
    cmd: cmdFor(provider, model), output: String(text).slice(0, 400) });
  process.stdout.write(text + "\n");
  console.error(`\n[offload] ${provider}:${model} · ${tokens} tok · ${durationMs}ms · logged`);
} catch (e) {
  logEntry({ provider, model: model || "(default)", task: prompt.slice(0, 80), tokens: 0, durationMs: Date.now() - t0, status: "error",
    cmd: cmdFor(provider, model), output: "", note: String(e.message).slice(0, 160) });
  console.error("[offload] error:", e.message);
  process.exit(1);
}

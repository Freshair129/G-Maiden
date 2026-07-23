#!/usr/bin/env node
// phase-provenance-check.mjs — the gate for G3.5 finding 3 (phase_target honesty).
//
// RULE: a row may claim a SOURCED phase (phase_source anything other than `derived`)
// only if at least one of its cited docs EXISTS on disk and CONTAINS the claimed phase
// token. Anything else is a claim of provenance that no document backs, and it renders
// as uncaveated fact in FEATURE-LEDGER.md — the exact defect G3's adversarial review
// raised and G3.5 exists to close.
//
// Why this file is separate from ledger.mjs: it is the GATE, not the implementation.
// It re-derives the answer from the manifest and the docs on disk and deliberately does
// not import or trust ledger.mjs, so a change to the generator cannot make its own gate
// agree with it. Do not soften this check to make a run pass — downgrade the unbacked
// rows to `derived`, which is what they actually are.
//
// Token matching is split-on-non-alphanumeric rather than a \b regex: an earlier
// inlined version of this check mangled its own escaping and reported EVERY row
// unbacked, which is a gate that always fails — as useless as one that always passes.
//
// Exit 0 = every sourced claim is backed. Exit 1 = at least one is not.

import { readFileSync, existsSync } from "node:fs";

const MANIFEST = process.argv[2] || "docs/feature-ledger.manifest.yaml";

function docRefs(block) {
  const refs = [];
  const inline = block.match(/docs:\s*\[([^\]]*)\]/);
  if (inline) {
    for (const part of inline[1].split(",")) {
      const s = part.trim().replace(/^['"]|['"]$/g, "");
      if (s) refs.push(s);
    }
  }
  const listed = block.match(/docs:\s*\n((?:\s+-\s+.+\n?)+)/);
  if (listed) {
    for (const line of listed[1].split("\n")) {
      const m = line.match(/-\s+(.+)/);
      if (m) refs.push(m[1].trim().replace(/^['"]|['"]$/g, ""));
    }
  }
  return refs;
}

function statesPhase(path, phase) {
  if (!existsSync(path)) return false;
  return readFileSync(path, "utf8").split(/[^A-Za-z0-9]+/).includes(phase);
}

const blocks = readFileSync(MANIFEST, "utf8").split(/\n(?=\s*-\s+id:)/);
const unbacked = [];
let claimed = 0;

for (const block of blocks) {
  const id = (block.match(/id:\s*(\S+)/) || [])[1];
  const source = (block.match(/phase_source:\s*['"]?(\w+)/) || [])[1];
  const phase = (block.match(/phase_target:\s*['"]?(P[0-6])/) || [])[1];
  if (!id || !source || !phase || source === "derived") continue;

  claimed++;
  const refs = docRefs(block);
  if (!refs.some((r) => statesPhase(r, phase))) {
    unbacked.push({ id, phase, refs: refs.length ? refs : ["(no doc refs)"] });
  }
}

if (unbacked.length) {
  console.error(
    `FAIL: ${unbacked.length} of ${claimed} sourced-phase claims are not backed by their cited doc.`
  );
  console.error("Fix by setting phase_source: derived on these rows — do not weaken this check.\n");
  for (const u of unbacked) {
    console.error(`  ${u.id} claims ${u.phase}; ${u.refs.join(", ")} does not state it`);
  }
  process.exit(1);
}

console.log(`ok: all ${claimed} sourced-phase claims are backed by a doc that states the phase`);

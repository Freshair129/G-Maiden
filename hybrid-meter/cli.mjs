#!/usr/bin/env node
// hybrid-meter — show the hybrid (frontier-plan + local-execute) cost savings.
//   npx hybrid-meter              replay a real build as a live meter (demo)
//   npx hybrid-meter watch FILE   live meter over your own usage.jsonl
//   npx hybrid-meter report FILE  one-shot savings report
import { readFileSync, watchFile } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const DIR = dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2)
const mode = argv[0] && !argv[0].startsWith('-') ? argv[0] : 'demo'
const fileArg = argv.find((a, i) => i > 0 && !a.startsWith('-'))
const FAST = argv.includes('--fast') || !process.stdout.isTTY
const SAMPLE = resolve(DIR, 'sample-usage.jsonl')

const SONNET = { in: 3, out: 15 } // local SLM replaces the sonnet coder tier (counterfactual rate)
const C = { reset: '\x1b[0m', dim: '\x1b[2m', bold: '\x1b[1m', teal: '\x1b[36m', green: '\x1b[32m', yellow: '\x1b[33m', gray: '\x1b[90m' }

const parse = t => t.split(/\r?\n/).filter(Boolean).map(l => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
const isLocal = r => typeof r.model === 'string' && r.model.toLowerCase().includes('ollama')
const isReview = r => String(r.id).includes('#review')

function compute(rows) {
  let actual = 0, review = 0, localRuns = 0, cfFloor = 0
  const produce = []
  for (const r of rows) {
    if (isLocal(r)) { localRuns++; cfFloor += ((r.in || 0) * SONNET.in + (r.out || 0) * SONNET.out) / 1e6 }
    else { actual += r.cost || 0; if (isReview(r)) review += r.cost || 0; else if ((r.out || 0) > 500) produce.push(r.cost || 0) }
  }
  const avg = produce.reduce((a, b) => a + b, 0) / (produce.length || 1)
  const cfReal = localRuns * avg
  return { total: rows.length, localRuns, actual, review, cfReal, cfFloor, allFrontier: actual + cfReal }
}
const bar = (f, w) => '█'.repeat(Math.round(f * w)) + C.dim + '·'.repeat(w - Math.round(f * w)) + C.reset

function frame(d, clear) {
  const savedPct = d.allFrontier ? d.cfReal / d.allFrontier * 100 : 0
  const localPct = d.total ? d.localRuns / d.total * 100 : 0
  const reviewPct = d.actual ? d.review / d.actual * 100 : 0
  const L = ['']
  L.push(`  ${C.bold}GoVibe · Hybrid Cost Meter${C.reset}  ${C.dim}${d.total} runs${C.reset}`)
  L.push('')
  L.push(`  ${C.green}${C.bold}~$${d.cfReal.toFixed(0)} saved${C.reset} ${C.green}(≈${savedPct.toFixed(0)}%, est.)${C.reset}   ${C.teal}${localPct.toFixed(0)}% on-device · $0${C.reset}   ${C.teal}100% code local${C.reset}`)
  L.push('')
  L.push(`  ${C.dim}all-frontier ~$${d.allFrontier.toFixed(0)}${C.reset}  ${bar(1, 28)}`)
  L.push(`  ${C.bold}hybrid  $${d.actual.toFixed(2)}${C.reset}      ${C.green}${bar(d.allFrontier ? d.actual / d.allFrontier : 0, 28)}${C.reset}`)
  L.push('')
  L.push(`  ${C.gray}produce/plan $${(d.actual - d.review).toFixed(2)}  ·  ${C.yellow}review $${d.review.toFixed(2)} (${reviewPct.toFixed(0)}% = next lever)${C.reset}`)
  return (clear ? '\x1b[2J\x1b[H' : '') + L.join('\n') + '\n'
}
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function demo() {
  const rows = parse(readFileSync(SAMPLE, 'utf8'))
  process.stdout.write(`${C.dim}  replaying a real ${rows.length}-run build (measured) …${C.reset}\n`)
  if (FAST) process.stdout.write(frame(compute(rows), false))
  else for (let i = 1; i <= rows.length; i++) { process.stdout.write(frame(compute(rows.slice(0, i)), true)); await sleep(40) }
  process.stdout.write(`\n  ${C.dim}est: run-replacement; floor (token-only) is lower; planning-heavy sample.${C.reset}\n`)
  process.stdout.write(`  ${C.teal}on your own loop:${C.reset} hybrid-meter watch path/to/usage.jsonl\n\n`)
}
function watch() {
  const f = fileArg || resolve(process.cwd(), 'usage.jsonl')
  const draw = () => { try { process.stdout.write(frame(compute(parse(readFileSync(f, 'utf8'))), !FAST)) } catch { process.stdout.write(`  ${C.yellow}waiting for ${f} …${C.reset}\n`) } }
  draw(); watchFile(f, { interval: 500 }, draw)
  process.stdout.write(`${C.dim}  watching ${f} (Ctrl+C to exit)${C.reset}\n`)
}
function report() {
  const f = fileArg || SAMPLE
  process.stdout.write(frame(compute(parse(readFileSync(f, 'utf8'))), false))
}

if (mode === 'watch') watch()
else if (mode === 'report') report()
else await demo()

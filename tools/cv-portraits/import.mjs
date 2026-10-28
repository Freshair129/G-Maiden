import fs from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {fileURLToPath} from 'node:url'

// Input is Source2Viewer's static panorama/images/heroes export, never match captures.
export function canonicalPortrait(stem, labels) {
  const name = /^npc_dota_hero_(.+)_png$/.exec(stem)?.[1]
  if (!name) return null
  for (const label of [...labels].sort((a, b) => b.length - a.length)) {
    if (name === label) return {label, variant: 'default'}
    const variant = name.startsWith(`${label}_`) ? name.slice(label.length + 1) : ''
    if (/^(alt\d*|persona\d*)$/.test(variant)) return {label, variant}
  }
  return null
}

export function importPortraits(source, output, labels) {
  const entries = []
  fs.mkdirSync(output, {recursive: true})
  for (const name of fs.readdirSync(source).sort()) {
    if (!name.endsWith('.png')) continue
    const identity = canonicalPortrait(name.slice(0, -4), labels)
    if (!identity) continue
    const bytes = fs.readFileSync(path.join(source, name))
    if (bytes.length > 512 * 1024 || !bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) continue
    const filename = `${identity.label}__${identity.variant}.png`
    fs.writeFileSync(path.join(output, filename), bytes)
    entries.push({...identity, source: name, file: filename, sha256: createHash('sha256').update(bytes).digest('hex')})
  }
  fs.writeFileSync(path.join(output, 'local-assets.json'), JSON.stringify({
    source: 'installed Dota 2 static panorama/images/heroes; exported with Source2Viewer',
    imported_at: new Date().toISOString(), entries,
  }, null, 2) + '\n')
  return entries.length
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [source, output] = process.argv.slice(2)
  if (!source || !output) throw new Error('Usage: node tools/cv-portraits/import.mjs <exported panorama/images/heroes> <app cache/cv/portraits/hud-v2>')
  const registry = JSON.parse(fs.readFileSync(new URL('../../src-tauri/data/hero-identities.json', import.meta.url), 'utf8'))
  const labels = registry.heroes.map(hero => hero.label)
  console.log(`Imported ${importPortraits(source, output, labels)} static references locally.`)
}

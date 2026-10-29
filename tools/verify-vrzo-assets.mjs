import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const catalog = JSON.parse(readFileSync(resolve(root,'src-tauri/src/vrzo_catalog.json'),'utf8'));
if (catalog.pack_id !== 'pack_vrzo_20261028' || catalog.version !== '0.2.0' || catalog.visual_version !== 8 || catalog.entries.length !== 21) throw Error('Unexpected VRZO catalog');
const seen = new Set(), events = new Set();
for (const entry of catalog.entries) {
 if (!/^[a-z0-9_]+$/.test(entry.id) || !/^[a-z0-9_]+$/.test(entry.event) || !/^[0-9a-f]{64}$/.test(entry.video_sha256) || seen.has(entry.id)) throw Error('Invalid VRZO catalog identity');
 seen.add(entry.id); events.add(entry.event);
 const path = resolve(root,'src/public/vrzo-banners',`${entry.id}.webm`);
 const hash = createHash('sha256').update(readFileSync(path)).digest('hex');
 if (hash !== entry.video_sha256) throw Error(`VRZO visual integrity mismatch: ${entry.id}`);
 if (![entry.audio_sha256,entry.mixed_sha256].every(hash => /^[0-9a-f]{64}$/.test(hash)) || !Number.isSafeInteger(entry.mixed_samples) || entry.mixed_samples < 1 || entry.mixed_samples > 2*1024*1024) throw Error('Invalid mixed provenance');
 const mix=readFileSync(resolve(root,'src-tauri/vrzo-mixed',`${entry.id}.wav`));
 if(createHash('sha256').update(mix).digest('hex')!==entry.mixed_sha256) throw Error(`VRZO mixed integrity mismatch: ${entry.id}`);
}
if(events.size!==15)throw Error('Unexpected VRZO event count');
console.log('VRZO v8 catalog: 21 video + 21 mixed hashes verified, 15 events');

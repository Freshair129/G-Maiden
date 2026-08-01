#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const [latestPath, outputPath, channel, sourceSha] = process.argv.slice(2);
if (!latestPath || !outputPath || !channel || !sourceSha) throw new Error('usage: manifest-from-tauri.mjs <latest.json> <output> <channel> <sourceSha>');
const latest = JSON.parse(await readFile(latestPath, 'utf8'));
const platforms = {};
for (const [platform, entry] of Object.entries(latest.platforms ?? {})) {
  if (!entry.url || !entry.signature) throw new Error(`latest.json platform ${platform} lacks URL or signature`);
  const response = await fetch(entry.url);
  if (!response.ok) throw new Error(`could not download ${platform} artifact: ${response.status}`);
  const sha256 = createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex');
  platforms[platform] = { url: entry.url, signature: entry.signature, sha256 };
}
const manifest = { schemaVersion: 1, channel, version: latest.version, notes: latest.notes ?? '', pub_date: latest.pub_date, sourceSha, publishedAt: new Date().toISOString(), platforms };
await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

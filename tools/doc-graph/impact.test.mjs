import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { test } from 'node:test';

import { renderC4Mermaid, renderErdMermaid, resolveImpact, validateManifest } from './impact.mjs';

function write(root, path, content) {
  const full = join(root, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content, 'utf8');
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'impact-map-'));
  write(root, 'docs/adr.md', '# docs/adr.md');
  write(root, 'docs/security.md', '# Security');
  write(root, 'src/gid.ts', 'export const gid = true;');
  write(root, 'supabase/migrations/beta.sql', 'create table public.closed_beta_enrollments (user_id uuid references public.profiles(id));');
  write(root, 'supabase/migrations/profiles.sql', 'create table public.profiles (id uuid primary key);');
  write(root, 'supabase/migrations/rls.sql', 'alter table public.profiles enable row level security;');
  const graph = { nodes: [{ id: 'docs/adr.md' }, { id: 'docs/security.md' }, { id: 'src/gid.ts' }], edges: [{ from: 'docs/adr.md', to: 'src/gid.ts', type: 'symbol', line: 4 }] };
  const manifest = {
    version: '1',
    nodes: [
      { ref: 'docs/adr.md', node_kind: 'document', artifact_type: 'adr', domain: 'account-identity', cluster: 'gid-security', system: 'G-Maiden', bounded_context: 'identity-access', layer: 'security', c4_level: 'container', lifecycle: 'approved', owners: ['Boss'] },
      { ref: 'docs/security.md', node_kind: 'document', artifact_type: 'threat-model', domain: 'account-identity', cluster: 'gid-security', system: 'Security', bounded_context: 'identity-access', layer: 'security', c4_level: 'component', lifecycle: 'implemented', owners: ['Boss'] },
      { ref: 'system:gstore', node_kind: 'datastore', domain: 'account-identity', cluster: 'gid-security', system: 'Supabase gstore', bounded_context: 'identity-access', layer: 'data', c4_level: 'container', lifecycle: 'implemented', owners: ['Boss'] },
    ],
    edges: [{ from: 'docs/adr.md', to: 'docs/security.md', relation: 'must_review_with', assertion: 'declared', confidence: 'high', evidence: 'fixture rule', evidence_reference: { path: 'docs/adr.md', line: 1 } }],
    entities: [
      { name: 'profiles', source: 'supabase/migrations/profiles.sql', rls_reference: 'supabase/migrations/rls.sql', classification: 'identity-pii', owns_data: 'identity-access', fields: ['uuid id PK'] },
      { name: 'closed_beta_enrollments', source: 'supabase/migrations/beta.sql', classification: 'identity-status', owns_data: 'identity-access', fields: ['uuid user_id FK'] },
    ],
    relationships: [{ from: 'closed_beta_enrollments.user_id', to: 'profiles.id', cardinality: '0..1 to 1', relation: 'foreign_key', assertion: 'declared', confidence: 'high', source: 'supabase/migrations/beta.sql', evidence_reference: { path: 'supabase/migrations/beta.sql', line: 1 } }],
  };
  return { root, graph, manifest };
}

test('impact separates mandatory review from observed linked context', () => {
  const { root, graph, manifest } = fixture();
  const result = resolveImpact({ graph, graphRaw: JSON.stringify(graph), manifest, root, artifacts: ['docs/adr.md'] });
  assert.deepEqual(validateManifest(manifest, root), []);
  assert.equal(result.must_review[0].target, 'docs/security.md');
  assert.deepEqual(result.must_review[0].evidence_reference, { path: 'docs/adr.md', line: 1 });
  assert.equal(result.linked_context[0].to, 'src/gid.ts');
  assert.equal(result.unmapped.length, 0);
  assert.equal(result.stale_link.length, 0);
});

test('ERD and C4 render only declared metadata', () => {
  const { manifest } = fixture();
  assert.match(renderErdMermaid(manifest), /profiles \|\|--o\| closed_beta_enrollments/);
  assert.match(renderErdMermaid(manifest), /uuid user_id FK/);
  assert.match(renderErdMermaid(manifest), /source: supabase\/migrations\/profiles\.sql/);
  assert.match(renderErdMermaid(manifest), /rls: supabase\/migrations\/rls\.sql/);
  assert.match(renderErdMermaid(manifest), /classification: identity-pii/);
  assert.match(renderC4Mermaid(manifest), /Supabase gstore/);
  assert.doesNotMatch(renderC4Mermaid(manifest, { system: 'G-Maiden' }), /Supabase gstore/);
  manifest.relationships[0].cardinality = 'many to 1';
  assert.match(renderErdMermaid(manifest), /profiles \|\|--o\{ closed_beta_enrollments/);
});

test('missing schema evidence is a validation error', () => {
  const { root, manifest } = fixture();
  manifest.relationships[0].source = 'supabase/migrations/missing.sql';
  assert.match(validateManifest(manifest, root).join('\n'), /missing relationship source/);
});

test('metadata and declared evidence must use the approved contract', () => {
  const { root, manifest } = fixture();
  manifest.nodes[0].artifact_type = 'change-request';
  manifest.nodes[1].layer = 'presentation';
  manifest.edges[0].relation = 'extends';
  delete manifest.edges[0].confidence;
  delete manifest.edges[0].evidence_reference;
  assert.match(validateManifest(manifest, root).join('\n'), /invalid artifact_type/);
  assert.match(validateManifest(manifest, root).join('\n'), /invalid layer/);
  assert.match(validateManifest(manifest, root).join('\n'), /invalid relation/);
  assert.match(validateManifest(manifest, root).join('\n'), /confidence/);
  assert.match(validateManifest(manifest, root).join('\n'), /evidence_reference/);
  delete manifest.nodes[0].artifact_type;
  assert.match(validateManifest(manifest, root).join('\n'), /artifact_type is required/);
  manifest.edges[0].evidence_reference = { path: 'docs/adr.md', line: 999999 };
  assert.match(validateManifest(manifest, root).join('\n'), /unresolved evidence reference/);
});

test('ERD rejects an undeclared foreign-key source column', () => {
  const { root, graph, manifest } = fixture();
  write(root, 'supabase/migrations/beta.sql', 'create table public.closed_beta_enrollments (other uuid);\ncreate table public.other (user_id uuid references public.profiles(id));');
  const result = resolveImpact({ graph, graphRaw: JSON.stringify(graph), manifest, root, artifacts: ['docs/adr.md'] });
  assert.equal(result.stale_link[0].reason, 'schema evidence contradicts declared foreign key');
});

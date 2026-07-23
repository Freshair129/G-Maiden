#!/usr/bin/env node
/**
 * Resolve evidence-labelled document impact and Mermaid views from the generated
 * doc graph plus the owner-declared JSON-compatible YAML impact manifest.
 *
 * Usage:
 *   node tools/doc-graph/impact.mjs --artifact <path> [--view impact|c4|erd] [--format json|mermaid]
 *   node tools/doc-graph/impact.mjs --changed [<git-range>] [--view impact] [--format json]
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');
const VALID_NODE_KINDS = new Set(['document', 'code', 'schema', 'api', 'service', 'datastore', 'actor', 'external_system', 'test', 'deployment']);
const VALID_ARTIFACT_TYPES = new Set(['adr', 'cr', 'prd', 'srs', 'design-system', 'threat-model', 'migration', 'runbook', 'contract']);
const VALID_LAYERS = new Set(['product', 'architecture', 'application', 'data', 'infrastructure', 'security', 'operations']);
const VALID_C4_LEVELS = new Set(['context', 'container', 'component', 'code']);
const VALID_LIFECYCLES = new Set(['proposed', 'approved', 'implemented', 'deprecated', 'superseded']);
const VALID_RELATIONS = new Set(['references', 'symbol_ref', 'depends_on', 'implements', 'governs', 'must_review_with', 'reads', 'writes', 'emits', 'consumes', 'stores', 'owns_data', 'tests', 'deploys']);
const VALID_ASSERTIONS = new Set(['observed', 'declared', 'derived']);
const VALID_CONFIDENCE = new Set(['low', 'medium', 'high']);

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`${label} must be JSON-compatible YAML: ${error.message}`);
  }
}

function pathExists(root, ref) {
  return !ref.startsWith('system:') && existsSync(join(root, ref));
}

function escapeMermaid(value) {
  return String(value).replace(/[^A-Za-z0-9_]/g, '_');
}

function validateEvidenceReference(value, root, label, errors, expectedText) {
  if (!value || typeof value.path !== 'string' || !Number.isInteger(value.line) || value.line < 1) {
    errors.push(`${label} requires evidence_reference.path and a positive evidence_reference.line`);
  } else if (!pathExists(root, value.path)) {
    errors.push(`${label} has missing evidence reference: ${value.path}`);
  } else {
    const lines = readFileSync(join(root, value.path), 'utf8').split(/\r?\n/);
    if (value.line > lines.length || (expectedText && !lines[value.line - 1].includes(expectedText))) {
      errors.push(`${label} has unresolved evidence reference: ${value.path}:${value.line}`);
    }
  }
}

export function validateManifest(manifest, root) {
  const errors = [];
  for (const key of ['nodes', 'edges', 'entities', 'relationships']) {
    if (!Array.isArray(manifest[key])) errors.push(`manifest.${key} must be an array`);
  }
  if (errors.length > 0) return errors;

  const refs = new Set();
  for (const node of manifest.nodes) {
    if (!node.ref || refs.has(node.ref)) errors.push(`node ref must be unique: ${node.ref ?? '<missing>'}`);
    refs.add(node.ref);
    if (!VALID_NODE_KINDS.has(node.node_kind)) errors.push(`invalid node_kind for ${node.ref}`);
    if (node.node_kind === 'document' && !node.artifact_type) errors.push(`document artifact_type is required for ${node.ref}`);
    if (node.artifact_type && !VALID_ARTIFACT_TYPES.has(node.artifact_type)) errors.push(`invalid artifact_type for ${node.ref}`);
    if (!node.domain || !node.cluster || !node.system || !node.bounded_context) errors.push(`node metadata is incomplete for ${node.ref}`);
    if (!VALID_LAYERS.has(node.layer)) errors.push(`invalid layer for ${node.ref}`);
    if (!VALID_C4_LEVELS.has(node.c4_level)) errors.push(`invalid c4_level for ${node.ref}`);
    if (!VALID_LIFECYCLES.has(node.lifecycle)) errors.push(`invalid lifecycle for ${node.ref}`);
    if (!Array.isArray(node.owners) || node.owners.length === 0) errors.push(`node owners are required for ${node.ref}`);
  }
  for (const edge of manifest.edges) {
    if (!edge.from || !edge.to || !edge.relation) errors.push('edge requires from, to, and relation');
    if (!VALID_RELATIONS.has(edge.relation)) errors.push(`invalid relation for edge ${edge.from} -> ${edge.to}`);
    if (!VALID_ASSERTIONS.has(edge.assertion)) errors.push(`invalid assertion for edge ${edge.from} -> ${edge.to}`);
    if (!VALID_CONFIDENCE.has(edge.confidence)) errors.push(`edge requires valid confidence for ${edge.from} -> ${edge.to}`);
    validateEvidenceReference(edge.evidence_reference, root, `edge ${edge.from} -> ${edge.to}`, errors, edge.from);
  }
  const entities = new Set(manifest.entities.map((entity) => entity.name));
  for (const entity of manifest.entities) {
    if (!entity.name || !entity.source) errors.push('entity requires name and source');
    if (!pathExists(root, entity.source)) errors.push(`missing entity source: ${entity.source}`);
    if (entity.rls_reference && !pathExists(root, entity.rls_reference)) errors.push(`missing RLS reference: ${entity.rls_reference}`);
  }
  for (const relationship of manifest.relationships) {
    const [fromTable] = String(relationship.from).split('.');
    const [toTable] = String(relationship.to).split('.');
    if (!entities.has(fromTable) || !entities.has(toTable)) errors.push(`relationship uses undeclared entity: ${relationship.from} -> ${relationship.to}`);
    if (relationship.relation !== 'foreign_key') errors.push(`unsupported ERD relation: ${relationship.relation}`);
    if (!VALID_ASSERTIONS.has(relationship.assertion)) errors.push(`invalid ERD assertion: ${relationship.from} -> ${relationship.to}`);
    if (!VALID_CONFIDENCE.has(relationship.confidence)) errors.push(`relationship requires valid confidence: ${relationship.from} -> ${relationship.to}`);
    validateEvidenceReference(relationship.evidence_reference, root, `relationship ${relationship.from} -> ${relationship.to}`, errors, String(relationship.from).split('.')[1]);
    if (!mermaidCardinality(relationship.cardinality)) errors.push(`unsupported ERD cardinality: ${relationship.cardinality}`);
    if (!pathExists(root, relationship.source ?? '')) errors.push(`missing relationship source: ${relationship.source ?? '<missing>'}`);
  }
  return errors;
}

function schemaRelationshipAgrees(relationship, root) {
  const [fromTable, fromColumn] = relationship.from.split('.');
  const [toTable, toColumn] = relationship.to.split('.');
  const sql = readFileSync(join(root, relationship.source), 'utf8');
  const tablePattern = new RegExp(`create\\s+table(?:\\s+if\\s+not\\s+exists)?\\s+public\\.${fromTable}\\s*\\(([\\s\\S]*?)\\);`, 'i');
  const foreignKeyPattern = new RegExp(`\\b${fromColumn}\\b[^,\\n]*references\\s+public\\.${toTable}\\s*\\(\\s*${toColumn}\\s*\\)`, 'i');
  const table = sql.match(tablePattern);
  return Boolean(table && foreignKeyPattern.test(table[1]));
}

function mermaidCardinality(cardinality) {
  const marks = new Map([['0..1', 'o|'], ['1', '||'], ['many', 'o{'], ['0..many', 'o{'], ['1..many', '|{']]);
  const [from, to] = String(cardinality).split(' to ');
  if (!marks.has(from) || !marks.has(to)) return null;
  return { from: marks.get(from), to: marks.get(to) };
}

export function resolveImpact({ graph, graphRaw, manifest, root, artifacts }) {
  const errors = validateManifest(manifest, root);
  const graphNodes = new Set((graph.nodes ?? []).map((node) => node.id));
  const manifestRefs = new Set(manifest.nodes.map((node) => node.ref));
  const result = {
    graph_revision: createHash('sha256').update(graphRaw).digest('hex'),
    artifacts,
    must_review: [],
    linked_context: [],
    unmapped: [],
    stale_link: [],
    validation_errors: errors,
  };

  for (const artifact of artifacts) {
    if (!manifestRefs.has(artifact)) result.unmapped.push({ artifact, reason: 'no declared metadata' });
    for (const edge of graph.edges ?? []) {
      if (edge.from === artifact || edge.to === artifact) {
        result.linked_context.push({ artifact, from: edge.from, to: edge.to, relation: edge.type, assertion: 'observed', line: edge.line });
      }
    }
    for (const edge of manifest.edges) {
      if (edge.from !== artifact && edge.to !== artifact) continue;
      const target = edge.from === artifact ? edge.to : edge.from;
      const missingTarget = !target.startsWith('system:') && !graphNodes.has(target) && !pathExists(root, target);
      if (missingTarget) {
        result.stale_link.push({ artifact, target, reason: 'declared target does not resolve', evidence: edge.evidence });
      } else if (edge.relation === 'must_review_with') {
        result.must_review.push({ artifact, target, relation: edge.relation, assertion: edge.assertion, confidence: edge.confidence, evidence: edge.evidence, evidence_reference: edge.evidence_reference });
      } else {
        result.linked_context.push({ artifact, from: edge.from, to: edge.to, relation: edge.relation, assertion: edge.assertion, confidence: edge.confidence, evidence: edge.evidence, evidence_reference: edge.evidence_reference });
      }
    }
  }
  for (const relationship of manifest.relationships) {
    if (pathExists(root, relationship.source) && !schemaRelationshipAgrees(relationship, root)) {
      result.stale_link.push({ artifact: relationship.from, target: relationship.to, reason: 'schema evidence contradicts declared foreign key', source: relationship.source });
    }
  }
  return result;
}

export function renderImpactMermaid(result) {
  const lines = ['flowchart LR'];
  for (const entry of [...result.must_review, ...result.linked_context]) {
    const from = escapeMermaid(entry.from ?? entry.artifact);
    const to = escapeMermaid(entry.to ?? entry.target);
    lines.push(`  ${from}["${entry.from ?? entry.artifact}"] -->|${entry.relation}/${entry.assertion}| ${to}["${entry.to ?? entry.target}"]`);
  }
  return `${lines.join('\n')}\n`;
}

export function renderC4Mermaid(manifest, filters = {}) {
  const nodes = manifest.nodes.filter((node) =>
    (node.c4_level === 'context' || node.c4_level === 'container')
    && node.node_kind !== 'document'
    && Object.entries(filters).every(([key, value]) => node[key] === value)
  );
  const allowed = new Set(nodes.map((node) => node.ref));
  const lines = ['flowchart LR'];
  for (const node of nodes) lines.push(`  ${escapeMermaid(node.ref)}["${node.system}"]`);
  for (const edge of manifest.edges.filter((edge) => allowed.has(edge.from) && allowed.has(edge.to))) {
    lines.push(`  ${escapeMermaid(edge.from)} -->|${edge.relation}/${edge.assertion}| ${escapeMermaid(edge.to)}`);
  }
  return `${lines.join('\n')}\n`;
}

export function renderErdMermaid(manifest) {
  const lines = ['erDiagram'];
  for (const relationship of manifest.relationships) {
    const [fromTable] = relationship.from.split('.');
    const [toTable] = relationship.to.split('.');
    const cardinality = mermaidCardinality(relationship.cardinality);
    lines.push(`  ${toTable} ${cardinality.to}--${cardinality.from} ${fromTable} : "${relationship.relation}/${relationship.assertion}"`);
  }
  for (const entity of manifest.entities) {
    lines.push(`  %% ${entity.name} source: ${entity.source}`);
    if (entity.rls_reference) lines.push(`  %% ${entity.name} rls: ${entity.rls_reference}`);
    if (entity.classification) lines.push(`  %% ${entity.name} classification: ${entity.classification}`);
    if (entity.owns_data) lines.push(`  %% ${entity.name} owns_data: ${entity.owns_data}`);
    lines.push(`  ${entity.name} {`);
    for (const field of entity.fields ?? []) lines.push(`    ${field}`);
    lines.push('  }');
  }
  return `${lines.join('\n')}\n`;
}

function parseArgs(args) {
  const parsed = { view: 'impact', format: 'json', artifacts: [], changed: null, filters: {} };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--artifact') parsed.artifacts.push(args[++index]);
    else if (arg === '--changed') parsed.changed = args[index + 1]?.startsWith('--') ? 'HEAD' : (args[++index] ?? 'HEAD');
    else if (arg === '--view') parsed.view = args[++index];
    else if (arg === '--format') parsed.format = args[++index];
    else if (arg === '--graph') parsed.graph = args[++index];
    else if (arg === '--manifest') parsed.manifest = args[++index];
    else if (arg === '--filter') {
      const [key, value] = String(args[++index] ?? '').split('=', 2);
      if (!['domain', 'cluster', 'system', 'bounded_context', 'layer', 'c4_level'].includes(key) || !value) throw new Error(`invalid filter: ${key}`);
      parsed.filters[key] = value;
    }
    else throw new Error(`unknown argument: ${arg}`);
  }
  return parsed;
}

function changedArtifacts(root, range) {
  const result = spawnSync('git', ['diff', '--name-only', range], { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`unable to read git diff ${range}: ${result.stderr.trim()}`);
  return result.stdout.split(/\r?\n/).filter(Boolean);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!['impact', 'c4', 'erd'].includes(args.view)) throw new Error(`unsupported view: ${args.view}`);
  const graphPath = resolve(REPO_ROOT, args.graph ?? 'docs/DOC-GRAPH.json');
  const manifestPath = resolve(REPO_ROOT, args.manifest ?? 'docs/impact-map.yaml');
  const graphRaw = readFileSync(graphPath, 'utf8');
  const graph = JSON.parse(graphRaw);
  const manifest = readJson(manifestPath, 'impact manifest');
  const artifacts = args.changed ? changedArtifacts(REPO_ROOT, args.changed) : args.artifacts;
  if (artifacts.length === 0 && args.view === 'impact') throw new Error('provide --artifact <path> or --changed [<git-range>]');
  const result = resolveImpact({ graph, graphRaw, manifest, root: REPO_ROOT, artifacts });
  if (result.validation_errors.length > 0 || result.stale_link.length > 0) throw new Error(JSON.stringify(result, null, 2));
  const output = args.format === 'mermaid'
    ? (args.view === 'impact' ? renderImpactMermaid(result) : args.view === 'c4' ? renderC4Mermaid(manifest, args.filters) : renderErdMermaid(manifest))
    : JSON.stringify(result, null, 2);
  if (!output) throw new Error(`unsupported view: ${args.view}`);
  process.stdout.write(`${output}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(`[impact] ${error.message}`); process.exit(1); }
}

#!/usr/bin/env node
/**
 * doc-graph ledger manifest parser and ref resolver — v0.1.0.
 *
 * Parses docs/feature-ledger.manifest.yaml (hand-written manifest of features/FRs/NFRs)
 * and resolves refs to check file existence on disk.
 *
 * YAML Subset Parser:
 *   This parser handles only a minimal YAML subset sufficient for the manifest:
 *   - Top-level key: entries (required, must be a sequence)
 *   - Each entry is a mapping with scalar values and optional nested mappings (refs)
 *   - No aliases, anchors, tags, comments, or multi-line strings
 *   - Scalars only (no nested sequences within refs)
 *   This is NOT a general YAML parser. If the manifest needs complex YAML features,
 *   migrate to 'js-yaml' or similar.
 *
 * Schema (enforced):
 *   entries:
 *     - id: <string>              (required, stable identifier)
 *       title: <string>           (required)
 *       kind: feature|fr|nfr       (required, one of three)
 *       phase_target: P0..P6       (required)
 *       refs:                      (required, object)
 *         docs: <string|array>    (optional)
 *         srs: <string|array>     (optional)
 *         code: <string|array>    (optional)
 *         tests: <string|array>   (optional)
 *         review: <string|array>  (optional)
 *
 * Unknown keys at any level → error 'Unknown key: X'
 * Missing required field (id/title/kind/phase_target/refs) → error
 */

import { readFileSync } from 'fs';
import { resolve, join, isAbsolute } from 'path';
import { existsSync } from 'fs';

/**
 * Minimal YAML parser for the ledger manifest subset.
 * Returns { entries: [...] } or throws on parse error.
 */
function parseYamlManifest(text) {
  const lines = text.split('\n');
  let i = 0;

  // Skip leading empty lines and comments
  while (i < lines.length && (!lines[i].trim() || lines[i].trim().startsWith('#'))) {
    i++;
  }

  if (i >= lines.length) {
    throw new Error('YAML: empty file');
  }

  // Expect top-level key "entries:"
  if (!lines[i].trim().startsWith('entries:')) {
    throw new Error('YAML: expected "entries:" at top level');
  }
  i++;

  const entries = [];

  // Parse each entry (starts with "- " indented under entries)
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      i++;
      continue;
    }

    // Entry start: "- " at some indentation
    if (trimmed.startsWith('- ')) {
      const entry = {};

      // Parse the first field on the same line as "- "
      // E.g., "  - id: feat-1" -> extract "id: feat-1"
      const entryStart = trimmed.slice(2); // Remove "- "
      if (entryStart) {
        const colonIdx = entryStart.indexOf(':');
        if (colonIdx >= 0) {
          const key = entryStart.slice(0, colonIdx).trim();
          const valueStr = entryStart.slice(colonIdx + 1).trim();
          entry[key] = unquoteScalar(valueStr);
        }
      }

      i++;

      // Parse remaining fields until next entry or EOF
      while (i < lines.length) {
        const fieldLine = lines[i];
        const fieldTrimmed = fieldLine.trim();

        if (!fieldTrimmed || fieldTrimmed.startsWith('#')) {
          i++;
          continue;
        }

        // Check if this is the start of a new entry (starts with "- ")
        if (fieldTrimmed.startsWith('- ')) {
          break;
        }

        // Parse key: value line
        const colonIdx = fieldTrimmed.indexOf(':');
        if (colonIdx < 0) {
          throw new Error(`YAML line ${i + 1}: expected key: value, got "${fieldTrimmed}"`);
        }

        const key = fieldTrimmed.slice(0, colonIdx).trim();
        const valueStr = fieldTrimmed.slice(colonIdx + 1).trim();

        if (key === 'refs' && (!valueStr || valueStr === '{}')) {
          // Refs block (nested mapping)
          const refsEntry = {};
          i++;

          while (i < lines.length) {
            const refLine = lines[i];
            const refTrimmed = refLine.trim();

            if (!refTrimmed || refTrimmed.startsWith('#')) {
              i++;
              continue;
            }

            // Check if we've exited the refs block
            if (refTrimmed.startsWith('- ') || (!refLine.startsWith('    ') && !refLine.startsWith('\t'))) {
              break;
            }

            // Parse ref key: value
            const refColonIdx = refTrimmed.indexOf(':');
            if (refColonIdx < 0) {
              throw new Error(`YAML line ${i + 1}: expected key: value in refs block, got "${refTrimmed}"`);
            }

            const refKey = refTrimmed.slice(0, refColonIdx).trim();
            const refValueStr = refTrimmed.slice(refColonIdx + 1).trim();

            if (refValueStr.startsWith('[') && refValueStr.endsWith(']')) {
              // Array literal
              refsEntry[refKey] = parseYamlArray(refValueStr);
            } else if (refValueStr) {
              // Single scalar
              refsEntry[refKey] = unquoteScalar(refValueStr);
            } else {
              refsEntry[refKey] = '';
            }

            i++;
          }

          entry.refs = refsEntry;
        } else if (valueStr) {
          // Scalar value
          entry[key] = unquoteScalar(valueStr);
          i++;
        } else {
          // Empty value treated as empty string
          entry[key] = '';
          i++;
        }
      }

      entries.push(entry);
    } else {
      i++;
    }
  }

  return { entries };
}


function parseYamlArray(str) {
  // Simple array parser: [a, b, c] -> ['a', 'b', 'c']
  const content = str.slice(1, -1).trim();
  if (!content) return [];
  return content.split(',').map(s => unquoteScalar(s.trim()));
}

function unquoteScalar(s) {
  // Remove surrounding quotes if present
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

/**
 * Load and parse the manifest from a YAML file.
 * Validates schema and returns manifest entries array.
 * Throws on parse error, schema error, or file not found.
 */
export function loadManifest(path) {
  const text = readFileSync(path, 'utf8');
  let parsed;

  try {
    parsed = parseYamlManifest(text);
  } catch (err) {
    throw new Error(`Failed to parse ${path}: ${err.message}`);
  }

  if (!Array.isArray(parsed.entries)) {
    throw new Error('Manifest: "entries" must be an array');
  }

  // Validate schema
  const REQUIRED_FIELDS = ['id', 'title', 'kind', 'phase_target', 'refs'];
  const VALID_KINDS = new Set(['feature', 'fr', 'nfr']);
  const VALID_PHASES = new Set(['P0', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6']);
  const VALID_REF_KEYS = new Set(['docs', 'srs', 'code', 'tests', 'review']);

  const seenIds = new Set();
  for (let idx = 0; idx < parsed.entries.length; idx++) {
    const entry = parsed.entries[idx];

    // Check required fields
    for (const field of REQUIRED_FIELDS) {
      if (!(field in entry)) {
        throw new Error(`Entry #${idx}: missing required field "${field}"`);
      }
    }

    // ids must be unique (G3-R-adv finding 3): a copy-pasted row would
    // otherwise double-count in the ledger undetected.
    if (seenIds.has(entry.id)) {
      throw new Error(`Entry #${idx}: duplicate id "${entry.id}"`);
    }
    seenIds.add(entry.id);

    // Check for unknown keys at entry level
    const KNOWN_ENTRY_KEYS = new Set([...REQUIRED_FIELDS, 'claimed_status', 'source', 'phase_source']);
    for (const key in entry) {
      if (!KNOWN_ENTRY_KEYS.has(key)) {
        throw new Error(`Entry #${idx}: unknown key "${key}"`);
      }
    }

    // phase_source (optional): where phase_target came from. 'doc' = an
    // explicit **Phase:** line in the row's FEAT doc / a documented meaning;
    // 'heuristic' = the bootstrap badge->phase guess (G3.5 review finding 3:
    // heuristics must render marked, never as fact).
    if ('phase_source' in entry && !['doc', 'heuristic'].includes(entry.phase_source)) {
      throw new Error(
        `Entry #${idx} (${entry.id}): invalid phase_source "${entry.phase_source}", must be doc|heuristic`
      );
    }

    // Validate kind
    if (!VALID_KINDS.has(entry.kind)) {
      throw new Error(`Entry #${idx} (${entry.id}): invalid kind "${entry.kind}", must be one of: feature, fr, nfr`);
    }

    // Validate phase_target
    if (!VALID_PHASES.has(entry.phase_target)) {
      throw new Error(`Entry #${idx} (${entry.id}): invalid phase_target "${entry.phase_target}", must be P0-P6`);
    }

    // Validate refs object
    if (typeof entry.refs !== 'object' || entry.refs === null || Array.isArray(entry.refs)) {
      throw new Error(`Entry #${idx} (${entry.id}): refs must be an object`);
    }

    for (const refKey in entry.refs) {
      if (!VALID_REF_KEYS.has(refKey)) {
        throw new Error(`Entry #${idx} (${entry.id}): unknown ref key "${refKey}", must be one of: docs, srs, code, tests, review`);
      }
    }
  }

  return parsed.entries;
}

/**
 * Resolve refs to check file existence on disk.
 * Returns array of entries with added { exists: { docs, code, tests, review, review } } map.
 */
export function resolveRefs(manifest, repoRoot) {
  return manifest.map(entry => {
    const exists = {
      docs: checkRefExists(entry.refs.docs, repoRoot),
      srs: checkRefExists(entry.refs.srs, repoRoot),
      code: checkRefExists(entry.refs.code, repoRoot),
      tests: checkTestRefExists(entry.refs.tests, repoRoot),
      review: checkRefExists(entry.refs.review, repoRoot),
    };

    return {
      ...entry,
      exists,
      dangling: danglingRefs(entry, repoRoot),
    };
  });
}

// Ref kinds whose entries are repo-relative PATHS and must resolve on disk.
// `srs` refs are SRS section labels ('§3.1') — never paths, never dangling.
// A `tests` ref of the form 'cargo:<test-name>' is a command ref (G3-T4),
// not a path, and is likewise exempt from the dangling check.
const PATH_REF_KINDS = ['docs', 'code', 'tests', 'review'];

/**
 * List every path-kind ref of an entry that does NOT exist on disk.
 * The epic DoD makes any dangling ref a BLOCKING violation, so this is
 * per-ref (unlike checkRefExists, whose any-of semantics answer the
 * separate question "is there evidence of this kind at all?").
 * @returns {Array<{kind: string, ref: string}>}
 */
function danglingRefs(entry, repoRoot) {
  const out = [];
  for (const kind of PATH_REF_KINDS) {
    const refValue = entry.refs[kind];
    if (!refValue) continue;
    const refs = Array.isArray(refValue) ? refValue : [refValue];
    for (const ref of refs) {
      if (kind === 'tests' && String(ref).startsWith('cargo:')) continue;
      if (!existsSync(resolve(repoRoot, ref))) out.push({ kind, ref });
    }
  }
  return out;
}

/**
 * Tests-kind existence: like checkRefExists, but a `cargo:<test-name>` entry
 * is a COMMAND ref (G3-T4's format), not a path — its presence in the
 * manifest means a test is mapped, which is exactly what the pinned rule
 * "in-code = tests refs missing/empty" distinguishes. Whether the command
 * actually passes is --run-tests territory (ledger-runtests.mjs), never
 * existence territory. Mirrors danglingRefs()'s cargo: exemption.
 */
function checkTestRefExists(refValue, repoRoot) {
  if (!refValue) return false;
  const refs = Array.isArray(refValue) ? refValue : [refValue];
  for (const ref of refs) {
    if (String(ref).startsWith('cargo:')) return true;
    if (existsSync(resolve(repoRoot, ref))) return true;
  }
  return false;
}

function checkRefExists(refValue, repoRoot) {
  if (!refValue) {
    return false;
  }

  const refs = Array.isArray(refValue) ? refValue : [refValue];

  for (const ref of refs) {
    const absPath = resolve(repoRoot, ref);
    if (existsSync(absPath)) {
      return true;
    }
  }

  return false;
}

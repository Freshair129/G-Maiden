#!/usr/bin/env node

/**
 * wikilinks.test.mjs — Unit tests for wikilink extraction and validation.
 * Run with: node --test tools/doc-graph/wikilinks.test.mjs
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractWikilinks, validateWikilinks } from './wikilinks.mjs';

// ============================================================================
// extractWikilinks Tests
// ============================================================================

test('extractWikilinks: plain wikilink', () => {
  const md = 'This is a [[reference]] to a doc.';
  const result = extractWikilinks(md);

  assert.equal(result.links.length, 1);
  assert.equal(result.links[0].slug, 'reference');
  assert.equal(result.links[0].label, null);
  assert.equal(result.links[0].line, 1);
  assert.equal(result.wildcards.length, 0);
});

test('extractWikilinks: labeled wikilink', () => {
  const md = 'See [[design-system|Design System]] for details.';
  const result = extractWikilinks(md);

  assert.equal(result.links.length, 1);
  assert.equal(result.links[0].slug, 'design-system');
  assert.equal(result.links[0].label, 'Design System');
  assert.equal(result.links[0].line, 1);
});

test('extractWikilinks: wikilink inside code fence (should be ignored)', () => {
  const md = `Some text.
\`\`\`markdown
This [[ignored]] link is in a code fence.
\`\`\`
More text with [[real]] link.`;

  const result = extractWikilinks(md);

  assert.equal(result.links.length, 1);
  assert.equal(result.links[0].slug, 'real');
  assert.equal(result.links[0].line, 5);
});

test('extractWikilinks: wikilink inside inline code (should be ignored)', () => {
  const md = 'The code \`[[inline]]\` is ignored, but [[actual]] is parsed.';
  const result = extractWikilinks(md);

  assert.equal(result.links.length, 1);
  assert.equal(result.links[0].slug, 'actual');
  assert.equal(result.links[0].line, 1);
});

test('extractWikilinks: wildcard slug (should be in wildcards, not links)', () => {
  const md = 'Reference [[FEAT-G-*]] for all feature docs, or [[specific-doc]].';
  const result = extractWikilinks(md);

  assert.equal(result.links.length, 1);
  assert.equal(result.links[0].slug, 'specific-doc');

  assert.equal(result.wildcards.length, 1);
  assert.equal(result.wildcards[0].slug, 'FEAT-G-*');
  assert.equal(result.wildcards[0].label, null);
});

test('extractWikilinks: wildcard with label', () => {
  const md = 'See [[FEAT-*|All Features]] for options.';
  const result = extractWikilinks(md);

  assert.equal(result.links.length, 0);
  assert.equal(result.wildcards.length, 1);
  assert.equal(result.wildcards[0].slug, 'FEAT-*');
  assert.equal(result.wildcards[0].label, 'All Features');
});

test('extractWikilinks: multiple links with correct line numbers', () => {
  const md = `Line 1 with [[link1]].
Line 2 has [[link2|Label 2]].
Line 3 is empty.
Line 4 has [[link3]] and [[link4]].`;

  const result = extractWikilinks(md);

  assert.equal(result.links.length, 4);
  assert.equal(result.links[0].line, 1);
  assert.equal(result.links[1].line, 2);
  assert.equal(result.links[2].line, 4);
  assert.equal(result.links[3].line, 4);
});

test('extractWikilinks: consecutive code fence markers', () => {
  const md = `Start.
\`\`\`
outer fence
\`\`\`
Middle [[valid]].
\`\`\`
next fence
\`\`\`
End [[also-valid]].`;

  const result = extractWikilinks(md);

  // Line 2: open fence, Line 4: close fence, Line 5: find [[valid]]
  // Line 6: open fence, Line 8: close fence, Line 9: find [[also-valid]]
  assert.equal(result.links.length, 2);
  assert.equal(result.links[0].slug, 'valid');
  assert.equal(result.links[0].line, 5);
  assert.equal(result.links[1].slug, 'also-valid');
  assert.equal(result.links[1].line, 9);
});

test('extractWikilinks: spaces in slug and label', () => {
  const md = 'Check [[my slug|My Display Label]] for details.';
  const result = extractWikilinks(md);

  assert.equal(result.links.length, 1);
  assert.equal(result.links[0].slug, 'my slug');
  assert.equal(result.links[0].label, 'My Display Label');
});

// ============================================================================
// validateWikilinks Tests
// ============================================================================

test('validateWikilinks: all links resolved', () => {
  const links = [
    { slug: 'doc1', label: null, line: 1 },
    { slug: 'doc2', label: 'Doc Two', line: 2 }
  ];
  const slugMap = {
    'doc1': true,
    'doc2': true
  };

  const violations = validateWikilinks(links, slugMap);
  assert.equal(violations.length, 0);
});

test('validateWikilinks: unresolved link', () => {
  const links = [
    { slug: 'doc1', label: null, line: 1 },
    { slug: 'missing-doc', label: null, line: 2 }
  ];
  const slugMap = {
    'doc1': true
  };

  const violations = validateWikilinks(links, slugMap);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].slug, 'missing-doc');
  assert.equal(violations[0].line, 2);
  assert.equal(violations[0].reason, 'unresolved');
});

test('validateWikilinks: collision detection', () => {
  const links = [
    { slug: 'doc1', label: null, line: 1 },
    { slug: 'doc1', label: null, line: 3 },
    { slug: 'doc1', label: 'Alt Label', line: 5 }
  ];
  const slugMap = {
    'doc1': true
  };

  const violations = validateWikilinks(links, slugMap);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].reason, 'collision');
  assert.equal(violations[0].slug, 'doc1');
});

test('validateWikilinks: mixed unresolved and collision', () => {
  const links = [
    { slug: 'valid', label: null, line: 1 },
    { slug: 'valid', label: null, line: 2 },
    { slug: 'missing', label: null, line: 3 }
  ];
  const slugMap = {
    'valid': true
  };

  const violations = validateWikilinks(links, slugMap);
  assert.equal(violations.length, 2);

  const collisions = violations.filter(v => v.reason === 'collision');
  const unresolved = violations.filter(v => v.reason === 'unresolved');

  assert.equal(collisions.length, 1);
  assert.equal(unresolved.length, 1);
  assert.equal(unresolved[0].slug, 'missing');
});

test('validateWikilinks: empty links', () => {
  const links = [];
  const slugMap = { 'doc1': true };

  const violations = validateWikilinks(links, slugMap);
  assert.equal(violations.length, 0);
});

test('validateWikilinks: empty slugMap', () => {
  const links = [
    { slug: 'doc1', label: null, line: 1 }
  ];
  const slugMap = {};

  const violations = validateWikilinks(links, slugMap);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].reason, 'unresolved');
});

// ============================================================================
// Integration Tests
// ============================================================================

test('integration: extract then validate', () => {
  const md = `Documentation example.
See [[reference|Ref]] and [[tutorial]].
Code example:
\`\`\`
[[ignored-in-fence]]
\`\`\`
Also check [[FEAT-*|Features]] pattern.`;

  const { links, wildcards } = extractWikilinks(md);
  const slugMap = {
    'reference': true,
    'tutorial': true
  };

  const violations = validateWikilinks(links, slugMap);

  assert.equal(links.length, 2);
  assert.equal(wildcards.length, 1);
  assert.equal(violations.length, 0);
});

test('integration: complex document with multiple issues', () => {
  const md = `# Doc Title
Section [[s1]].
Duplicate: [[s1]] and [[s1]].
Missing: [[broken-link]].
Wildcard: [[FEAT-*]].
Inline code: \`[[s1]]\`.
Code fence:
\`\`\`
[[ignored]]
\`\`\`
End.`;

  const { links } = extractWikilinks(md);
  const slugMap = {
    's1': true
  };

  const violations = validateWikilinks(links, slugMap);

  // Should have: collision for s1, unresolved for broken-link
  assert.equal(violations.length, 2);
  const reasons = violations.map(v => v.reason).sort();
  assert.deepEqual(reasons, ['collision', 'unresolved']);
});

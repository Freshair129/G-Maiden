import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('../../.github/workflows/candidate-release.yml', import.meta.url), 'utf8');

test('candidate publication pushes a dev branch without requiring Actions PR creation', () => {
  assert.doesNotMatch(workflow, /\bgh\s+pr\s+create\b/);
  assert.doesNotMatch(workflow, /pull-requests:\s*write/);
  assert.match(workflow, /git push --set-upstream origin \$manifestBranch/);
  assert.match(workflow, /pull request manually/i);
  assert.match(workflow, /GITHUB_STEP_SUMMARY/);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('../../.github/workflows/promote-release.yml', import.meta.url), 'utf8');
const ciWorkflow = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');

test('promotion workflow grants only contents write permission', () => {
  const permissions = workflow.match(/^permissions:\r?\n((?: {2}[^\r\n]+\r?\n)+)/m)?.[1];

  assert.ok(permissions, 'expected an explicit workflow permissions block');
  assert.deepEqual(permissions.trim().split(/\r?\n/).map((line) => line.trim()), ['contents: write']);
  assert.doesNotMatch(workflow, /\bGH_TOKEN\b/);
  assert.doesNotMatch(workflow, /\bgh\s+pr\s+create\b/);
});

test('promotion checks out main and passes dispatch paths through quoted environment variables', () => {
  assert.match(workflow, /uses: actions\/checkout@v4\r?\n\s+with:\r?\n\s+ref: main\r?\n\s+fetch-depth: 0/);
  assert.match(workflow, /CANDIDATE_MANIFEST:\s*\$\{\{\s*inputs\.candidate_manifest\s*\}\}/);
  assert.match(workflow, /APPROVAL_FILE:\s*\$\{\{\s*inputs\.approval_file\s*\}\}/);
  assert.match(workflow, /validate-published "\$CANDIDATE_MANIFEST"/);
  assert.match(workflow, /promote "\$CANDIDATE_MANIFEST" release\/channels\/stable\.json "\$APPROVAL_FILE"/);
  assert.equal((workflow.match(/\$\{\{\s*inputs\.candidate_manifest\s*\}\}/g) ?? []).length, 3);
  assert.equal((workflow.match(/\$\{\{\s*inputs\.approval_file\s*\}\}/g) ?? []).length, 1);
});

test('promotion proves platform, source SHA, and version identity', () => {
  assert.match(workflow, /JSON\.stringify\(c\.platforms\)\s*!==\s*JSON\.stringify\(s\.platforms\)/);
  assert.match(workflow, /c\.sourceSha\s*!==\s*s\.sourceSha\s*\|\|\s*c\.version\s*!==\s*s\.version/);
});

test('dry runs exit before creating a promotion branch, commit, or push', () => {
  const publicationStep = workflow.match(/- name: Publish the stable promotion branch[\s\S]*?(?=\r?\n      - name:|$)/)?.[0];

  assert.ok(publicationStep, 'expected the stable promotion publication step');
  const dryRunGuard = publicationStep.indexOf('if [ "$DRY_RUN" = "true" ]');
  const branchCreation = publicationStep.indexOf('git switch -c "$branch"');
  const commit = publicationStep.indexOf('git commit ');
  const push = publicationStep.indexOf('git push ');

  assert.ok(dryRunGuard >= 0, 'expected an explicit dry-run exit guard');
  assert.ok(publicationStep.indexOf('exit 0', dryRunGuard) < branchCreation, 'dry run must exit before branch creation');
  assert.ok(branchCreation > dryRunGuard && commit > dryRunGuard && push > dryRunGuard);
  assert.match(publicationStep, /branch="release\/stable-\$\{GITHUB_RUN_ID\}-\$\{GITHUB_RUN_ATTEMPT\}"/);
  assert.equal((publicationStep.match(/^\s+git push\b/gm) ?? []).length, 1);
  assert.match(publicationStep, /git push --set-upstream origin "\$branch"/);
  assert.match(publicationStep, /echo .*owner.*open .*pull request manually/i);
});

test('CI runs the focused promotion workflow regression test with release manifest tests', () => {
  const releaseStep = ciWorkflow.match(/- name: Release manifest and packaged updater regression tests[\s\S]*?(?=\r?\n        - name:|$)/)?.[0];

  assert.ok(releaseStep, 'expected the existing Release manifest CI step');
  assert.match(releaseStep, /^        run: node --test scripts\/releases\/channel-manifest\.test\.mjs scripts\/releases\/promote-workflow\.test\.mjs/m);
});

export function normalizePath(p) {
  return String(p ?? '').replace(/\\/g, '/').replace(/^\.\//, '');
}

export function bucketForPath(path) {
  const p = normalizePath(path);
  if (!p) return 'unknown';
  if (p.startsWith('.github/workflows/')) return '.github/workflows';
  if (p.startsWith('docs/')) return 'docs';
  if (p.startsWith('landing/')) return 'landing';
  if (p.startsWith('src-tauri/')) return 'src-tauri';
  if (p.startsWith('src/')) return 'src';
  if (p.startsWith('supabase/')) return 'supabase';
  if (p.startsWith('tools/')) return 'tools';
  if (p.startsWith('.agents/')) return '.agents';
  if (p.startsWith('.brain/')) return '.brain';
  const top = p.split('/')[0];
  return top || 'unknown';
}

export function uniqueBuckets(paths) {
  return [...new Set((paths ?? []).map(bucketForPath))].sort();
}

export function hasExplicitScopeRationale(body) {
  const text = String(body ?? '').toLowerCase();
  return (
    text.includes('## summary') ||
    text.includes('## rationale') ||
    text.includes('## scope') ||
    text.includes('scope-justification:')
  );
}

export function needsScopeJustification(paths) {
  const buckets = uniqueBuckets(paths);
  return buckets.length > 3 || buckets.includes('.github/workflows');
}

export function shouldRunDocGraphGate(paths) {
  return (paths ?? []).some((raw) => {
    const p = normalizePath(raw);
    return (
      p.startsWith('docs/') ||
      p === 'AGENTS.md' ||
      p === 'CLAUDE.md' ||
      p.startsWith('tools/doc-graph/')
    );
  });
}

export function ciCheckConclusion(checkRuns) {
  for (const run of checkRuns ?? []) {
    if (String(run.name ?? '').toLowerCase() === 'ci') {
      return { status: run.status ?? '', conclusion: run.conclusion ?? '' };
    }
  }
  return null;
}

export function evaluatePrGate({ pr, changedPaths, checkRuns, body }) {
  const findings = [];
  const draft = Boolean(pr?.draft);
  const mergeable = String(pr?.mergeable ?? '').toUpperCase();
  const ci = ciCheckConclusion(checkRuns);

  if (!draft && mergeable === 'CONFLICTING') {
    findings.push({
      severity: 'error',
      code: 'merge-conflict',
      message: 'PR has merge conflicts against main.',
    });
  }

  if (!draft) {
    if (!ci) {
      findings.push({
        severity: 'error',
        code: 'missing-ci',
        message: 'Required check `ci` is missing from this PR.',
      });
    } else if (String(ci.status).toUpperCase() !== 'COMPLETED' || String(ci.conclusion).toUpperCase() !== 'SUCCESS') {
      findings.push({
        severity: 'error',
        code: 'ci-not-green',
        message: `Required check \`ci\` is not green yet (status=${ci.status || 'unknown'}, conclusion=${ci.conclusion || 'unknown'}).`,
      });
    }
  }

  if ((changedPaths ?? []).length === 0) {
    findings.push({
      severity: 'error',
      code: 'empty-diff',
      message: 'PR exposes no changed files to the gate.',
    });
  }

  if (needsScopeJustification(changedPaths) && !hasExplicitScopeRationale(body)) {
    findings.push({
      severity: 'error',
      code: 'missing-scope-rationale',
      message: 'Wide-scope PRs must include an explicit scope/rationale section in the PR body.',
    });
  }

  return findings;
}

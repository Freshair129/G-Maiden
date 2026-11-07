## Summary

<!-- What changed and why, in a paragraph. Keep this heading: `pr-gate-agent` requires a
     rationale section (`## Summary` / `## Rationale` / `## Scope`) on any PR touching more than
     three top-level path buckets or anything under `.github/workflows/`. -->

## Scope

<!-- Delete if this PR is narrow. If it is wide, say why these areas had to move together
     instead of as separate PRs. -->

## Work item and collisions

<!-- Required by docs/engineering/GIT-WORKTREE-POLICY.md §9. Link the Issue/task this PR belongs to,
     name other open PRs or worktrees touching the same files, interfaces, lockfiles or generated
     artifacts, and list prerequisite PRs with the order they must land in. -->

- Work item:
- Collisions / dependencies:

## Verification

<!-- The checks actually run, with their result. See AGENTS.md → "Review / verify-gate checklist".
     Not all of these apply to every PR — delete the ones that don't. -->

- [ ] `cargo test --manifest-path src-tauri/Cargo.toml --locked`
- [ ] `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --locked -- -D warnings`
- [ ] `pnpm -C src lint`
- [ ] `pnpm -C src exec tsc --noEmit`
- [ ] `pnpm -C src test`
- [ ] `node tools/doc-graph/ci-gate.mjs` (any change under `docs/`, `CLAUDE.md`, `AGENTS.md`, `tools/doc-graph/` — and its regenerated artifacts are committed here, generated on the final HEAD)
- Outstanding gates (each as `NOT_RUN` + reason, or `NOT_APPLICABLE`): native/UAT, owner approval

## Notes for the reviewer

<!-- Known gaps, follow-ups, anything deliberately left out, or the plan/CR this belongs to.
     Delete if there is nothing to say. -->

# RCA: candidate artifact overwrite from concurrent tag publisher

## Symptom

The `v0.13.1` candidate workflow produced signed installers and `latest.json`, but the final release assets later had different SHA-256 values at the same version and URLs. The candidate workflow then failed while publishing the Dev manifest.

## Evidence

- Candidate run `30703080800` completed verification, smoke build, signing, prerelease publication, and evidence upload before failing only at Dev-manifest publication.
- The candidate release assets were first uploaded around `2026-08-01T14:40Z`.
- Tag push also started `release` run `30703077680`; it completed successfully at `2026-08-01T14:56:21Z`.
- GitHub release asset metadata shows the same `v0.13.1` assets updated around `2026-08-01T14:55Z` with SHA-256 values different from the first candidate manifest.
- The failing candidate log records `GH006: Protected branch update failed`; direct push of `release/channels/dev.json` to `main` was rejected.

## Root Cause

The legacy `release.yml` triggered automatically for every `v*` tag while `candidate-release.yml` was dispatched for the same tag. Both workflows built, signed, and published to the same GitHub Release/tag, allowing the later legacy workflow to replace candidate assets. The candidate workflow also assumed it could push its Dev manifest directly to protected `main`.

## Why the issue escaped detection

Local validation covered manifest invariants but did not exercise concurrent GitHub workflows against a protected branch. The release migration left the legacy tag trigger active, and candidate publication did not require a reviewed manifest PR.

## Proposed Prevention

1. Retire the legacy tag-triggered `release.yml` workflow.
2. Route candidate Dev-manifest publication through a PR after strict validation.
3. Treat a red candidate workflow, changed release-asset digest, or direct-main publication rejection as a release blocker.
4. Before promotion, compare candidate release asset digests, Dev manifest SHA-256 fields, signatures, source SHA, and Stable metadata.

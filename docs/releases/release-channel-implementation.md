---
title: "G-Maiden Release Channel Implementation and Evidence Runbook"
doc_id: "release-channel-implementation"
status: "draft"
version: "0.4.0"
updated: "2026-08-01"
owner: "Boss"
related_docs: ["RELEASE-CHANNEL-ARCHITECTURE", "CLOSED-BETA-WAVE-0-DOD"]
---

# Release channel implementation and evidence runbook

## Implemented in repository

- `candidate-release.yml` verifies tag lineage, runs the release gates, builds/signs once, publishes a prerelease, writes `build-evidence.json` with the source SHA and release-asset hashes, and uploads that file as a workflow artifact.
- The same workflow downloads the published signed Tauri `latest.json`, derives and strictly validates `release/channels/dev.json` from its artifact metadata, then opens a protected-main PR for review; it does not rebuild or resign during manifest publication.
- `channel-manifest.mjs` validates channel metadata, rejects non-publishable placeholders for publication, writes Stable atomically, and preserves artifact URL/signature/SHA fields during promotion.
- `promote-release.yml` is manual, bound to the `production` environment, validates a published candidate, and performs no build/package/sign operation.
- `betaReadiness.ts`, `GmadFirstRunGate.tsx`, and `BetaFeedback.tsx` expose GSI/capture/minimap/overlay/audio readiness, disclose exact Compatibility Mode wording, export a sanitized diagnostic JSON bundle locally, and export structured feedback with diagnostics only after explicit consent.
- `release-rehearsal.mjs` validates the Dev-to-Stable same-artifact identity and writes a machine-readable rehearsal report when given real candidate, Stable, and approval metadata.
- `wave-0-evidence.mjs` validates the complete Closed Beta Wave 0 evidence packet against the published entry/exit thresholds without inventing measurements.

## Local validation

```text
node --test scripts/releases/channel-manifest.test.mjs
node scripts/releases/channel-manifest.mjs validate release/channels/stable.json
node scripts/releases/channel-manifest.mjs validate release/channels/dev.json
```

For a real artifact rehearsal, run:

```text
node scripts/releases/release-rehearsal.mjs <published-dev-manifest> release/channels/stable.json <approval.json> release/evidence/<version>/rehearsal-report.json
```

The rehearsal refuses seeded `0.0.0`, `example.invalid`, zero-SHA, and `not-published` candidate metadata. Its report is not a substitute for an updater install test.

## Evidence and manual production steps

The repository cannot prove GitHub production state from source alone. One operator must:

1. Configure the `production` GitHub Environment with required reviewers and verify the environment is referenced by the promotion job.
2. Configure `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` as GitHub secrets; never copy them to the workstation.
3. Run the candidate workflow from an approved version tag and retain the workflow run URL, prerelease assets, `latest.json`, signatures, SHA-256 evidence, and source SHA.
4. Verify the channel manifest is hosted at the exact updater URL and that Stable metadata is unchanged before approval.
5. Approve and run the promotion workflow with a reviewed approval record, then verify Stable points to the same URLs, signatures, SHA-256 values, and source SHA.
6. Exercise the failed-gate and rollback/forward-fix paths and attach the resulting logs to the release evidence directory.

Until these steps produce real signed artifacts and GitHub run evidence, issues #19, #20, #22, and #26 remain open for release-operations purposes. The source implementation is complete; production proof is not inferred.

Wave 0 evidence is validated separately with `node scripts/releases/wave-0-evidence.mjs validate release/evidence/wave-0/<version>`. The operator packet and HOLD/PASS semantics are defined in `docs/releases/closed-beta/wave-0/evidence-runbook.md`.

## Retirement of the tag publisher

The legacy `.github/workflows/release.yml` tag trigger is retired. A version tag must now be followed by the explicit `candidate-release.yml` dispatch, then reviewed channel-manifest PRs and the protected `promote-release.yml` workflow. This prevents two independent signing jobs from publishing different bytes under one tag and preserves same-artifact promotion.

## Rollback

Restore the previous Stable manifest from the audited commit only if the updater supports the intended rollback. Otherwise publish a higher emergency forward-fix version that restores the last known-good behavior. Never rebuild or resign an already-promoted candidate to perform a rollback.

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.4.0 | 2026-08-01 | Retired the competing tag publisher after candidate asset overwrite RCA |
| 0.3.0 | 2026-08-01 | Documented candidate evidence upload and signed `dev` manifest publication steps |
| 0.2.0 | 2026-08-01 | Added publication validation, release rehearsal, Wave 0 readiness and evidence runbook |
| 0.1.0 | 2026-07-23 | Initial release-channel and artifact-promotion architecture |

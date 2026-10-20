---
title: "G-Maiden Release Channel Implementation and Evidence Runbook"
doc_id: "release-channel-implementation"
status: "active"
version: "0.5.0"
updated: "2026-10-18"
owner: "Boss"
related_docs: ["RELEASE-CHANNEL-ARCHITECTURE"]
---

# Release channel implementation and evidence runbook

## Implemented in repository

- `candidate-release.yml` verifies tag lineage, runs release checks, builds and signs once, publishes
  a GitHub prerelease, records the source SHA and artifact hashes, and uploads the evidence.
- The same workflow derives `release/channels/dev.json` from the signed artifact metadata and opens a
  protected-main pull request. It does not rebuild or resign during manifest publication.
- `channel-manifest.mjs` validates channel metadata and platform keys, rejects non-publishable
  placeholders, and writes manifest changes atomically.
- `promote-release.yml` is manually dispatched, uses the `production` environment, validates the
  candidate evidence, and promotes the same signed artifact without rebuilding or resigning.
- The desktop updater currently checks the signed Stable manifest. Sign-in does not choose the
  updater channel or gate local desktop startup.
- `release-rehearsal.mjs` checks Dev-to-Stable artifact identity and writes a machine-readable report
  from supplied candidate, Stable, and approval metadata.

## Local validation

```text
node --test scripts/releases/channel-manifest.test.mjs
node scripts/releases/channel-manifest.mjs validate release/channels/stable.json
node scripts/releases/channel-manifest.mjs validate release/channels/dev.json
```

For an artifact rehearsal, run:

```text
node scripts/releases/release-rehearsal.mjs <published-dev-manifest> release/channels/stable.json <approval.json> release/evidence/<version>/rehearsal-report.json
```

The rehearsal refuses seeded `0.0.0`, `example.invalid`, zero-SHA, and `not-published` candidate
metadata. Its report does not replace an updater installation test.

## Evidence and manual production steps

Repository source cannot prove current GitHub production state. Before a release, an operator must:

1. Configure the `production` GitHub Environment with required reviewers and verify the promotion
   job uses it.
2. Configure signing secrets in GitHub; never copy private signing keys to the workstation.
3. Run the candidate workflow from an approved version tag and retain the workflow URL, prerelease
   assets, signatures, hashes, evidence artifact, and source SHA.
4. Verify the Dev manifest is hosted at the updater URL and review Stable metadata before promotion.
5. Approve and run promotion with a reviewed approval record, then verify Stable points to the same
   URLs, signatures, hashes, and source SHA.
6. Exercise the failed-gate and rollback/forward-fix paths and attach the logs to the release evidence.

## Rollback

Restore the previous Stable manifest only if the updater supports the intended rollback. Otherwise,
publish a higher forward-fix version that restores the last known-good behavior. Never rebuild or
resign an already-promoted candidate to perform a rollback.

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.5.0 | 2026-10-18 | Refreshed the runbook to match the implemented Dev/Stable workflows and current updater behavior. |
| 0.4.0 | 2026-08-01 | Retired the competing tag publisher after candidate asset overwrite RCA. |
| 0.3.0 | 2026-08-01 | Documented candidate evidence upload and signed Dev manifest publication. |
| 0.2.0 | 2026-08-01 | Added publication validation and artifact rehearsal. |
| 0.1.0 | 2026-07-23 | Initial release-channel and artifact-promotion architecture. |

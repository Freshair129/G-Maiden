---
version: "0.1.2b"
created_at: "2026-07-22T01:15:00+07:00,ATHER"
last_update: "2026-07-22T01:20:00+07:00,ATHER"
status: "beta"
superseded_by: null
attributes:
  doc_type: "root-cause-analysis"
  domain: "closed-beta-landing"
  scope: "Vercel legal-content build boundary"
---

# RCA — Landing legal content outside the Vercel deployment root

## Symptom

The Landing test, typecheck, and Vite build passed locally, but the Vercel production build failed
to resolve the Terms and Privacy Markdown imports from `../../docs/product/`.

## Evidence

- The remote build reported `UNRESOLVED_IMPORT` for both canonical legal Markdown files.
- Vercel uploaded the linked `landing/` project directory, while the imported files live in the
  repository-level `docs/` directory outside that deployment root.
- Local builds ran from the full worktree and therefore had access to both directories.

## Root Cause

The browser bundle depended on source files outside the Vercel project's upload boundary. Local
module resolution proved only worktree availability, not remote deployment-package completeness.

## Why the issue escaped detection

The pre-deploy gate validated the local build but did not inspect the actual Vercel upload root or
run a remote preview build before requesting production deployment.

## Proposed prevention and applied correction

- Bundle byte-identical legal Markdown under `landing/src/legal/` and import it from inside the
  deployment root; the repository `docs/product/` files remain the canonical authoring source.
- Run `landing/scripts/verify-legal-mirrors.mjs` before every build. It compares canonical and
  bundled bytes when the canonical files are available and always rejects empty mirrors.
- Treat a successful remote build as a required gate in addition to the local Vite build.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
| --- | --- | --- | --- | --- | --- |
| 0.1.2b | 2026-07-22 | beta | Recorded the byte-for-byte prebuild parity gate now enforced by the Landing package. | null | ATHER |
| 0.1.1b | 2026-07-22 | beta | Clarified normalized-content parity while preserving canonical receipt hashes. | null | ATHER |
| 0.1.0b | 2026-07-22 | beta | Documented and corrected the Vercel upload-root mismatch for bundled legal content. | null | ATHER |

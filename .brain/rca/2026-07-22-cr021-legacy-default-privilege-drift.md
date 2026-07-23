---
version: "0.1.0b"
created_at: "2026-07-22T01:10:25+07:00,ATHER"
last_update: "2026-07-22T01:10:25+07:00,ATHER"
status: "beta"
superseded_by: null
attributes:
  doc_type: "root-cause-analysis"
  domain: "identity-entitlement"
  scope: "CR-021 legal-table production privileges"
---

# RCA — CR-021 legacy default privilege drift

## Symptom

The post-migration production assertion showed that `service_role` could insert into
`closed_beta_legal_documents`, although the CR-021 contract only requires it to read the immutable
document registry and insert acceptance receipts.

## Evidence

- `has_table_privilege('service_role', ..., 'INSERT')` returned `true` for both new legal tables.
- The migration revoked privileges from `PUBLIC`, `anon`, and `authenticated`, then granted only
  `SELECT` on the document registry, but it did not revoke privileges already inherited from the
  project's legacy default-privilege configuration.
- Supabase announced that automatic Data API grants are being removed, confirming that migrations
  must declare role privileges explicitly instead of depending on project defaults.

## Root Cause

The migration added desired grants without first removing legacy grants held directly by
`service_role`. PostgreSQL grants are additive, so the narrower grant did not subtract the existing
`INSERT`, `UPDATE`, or `DELETE` privileges.

## Why the issue escaped detection

The transaction dry-run asserted that browser roles had no access, but did not assert the complete
`service_role` privilege matrix. Functional Function tests also could not reveal excessive database
privileges because the intended operations still succeeded.

## Proposed prevention and applied correction

- Revoke all legal-table privileges from `service_role`, then grant only document `SELECT` and
  receipt `SELECT, INSERT`.
- Keep the correction in both the original migration for fresh environments and a follow-up
  idempotent production migration.
- Assert positive and negative privileges for every role after future security-sensitive migrations.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
| --- | --- | --- | --- | --- | --- |
| 0.1.0b | 2026-07-22 | beta | Documented and corrected legacy default privileges that exceeded the CR-021 service-role contract. | null | ATHER |

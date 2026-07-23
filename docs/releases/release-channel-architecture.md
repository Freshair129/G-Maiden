---
title: "G-Maiden Release Channel Architecture"
doc_id: "RELEASE-CHANNEL-ARCHITECTURE"
status: "draft"
version: "0.1.0"
updated: "2026-07-23"
owner: "Boss"
related_docs: ["RELEASE-GOVERNANCE", "BETA-ROADMAP"]
---

# G-Maiden Release Channel Architecture

## 1. Decision

G-Maiden ใช้ repository เดียว, source tree เดียว และ `main` branch เดียว แต่แยกการแจก Desktop Update ด้วย release channels

```text
main
  ↓
verify
  ↓
build + sign once
  ↓
dev channel
  ↓
internal validation
  ↓
manual approval
  ↓
promote same artifact
  ↓
stable channel
```

## 2. Channels

| Channel | Audience | Access | Purpose |
| --- | --- | --- | --- |
| `dev` | Developer/Internal tester | restricted | ตรวจ candidate ก่อนถึงผู้ใช้จริง |
| `closed-beta` | Approved beta testers | entitlement/invite | ตรวจ compatibility และ product value |
| `stable` | Public users | public | รับเฉพาะ artifact ที่ผ่าน promotion |

Open Beta สามารถเพิ่มเป็น channel แยกภายหลังเมื่อ Closed Beta ผ่าน Exit Gate

## 3. Non-negotiable Rules

1. Stable users ต้องไม่เห็น candidate ที่ยังไม่ผ่าน approval
2. Promotion ห้าม rebuild หรือ resign artifact
3. Version ที่ fail ห้ามนำกลับมา build ทับด้วย version เดิม
4. Candidate ที่ fail ให้แก้แล้ว bump patch/minor version ใหม่
5. Stable manifest เปลี่ยนได้เฉพาะ workflow ที่มี production approval
6. ทุก promotion ต้องมี test evidence และ known-issues record

## 4. Current-State Gap

ระบบปัจจุบันใช้ tag `v*` เพื่อ build, sign และ publish GitHub Release เป็น full release ทันที และ Desktop updater อ่าน `releases/latest/download/latest.json` endpoint เดียว ทำให้ทุก installation อยู่ channel เดียวกัน

## 5. Target Components

```text
.github/workflows/
├── candidate-release.yml
└── promote-release.yml

release/
├── channels/
│   ├── dev.json
│   ├── closed-beta.json
│   └── stable.json
└── evidence/
    └── <version>/
        ├── test-report.json
        ├── performance-summary.json
        ├── known-issues.md
        └── approval.json
```

Manifest อาจ host บน Vercel, object storage หรือ update gateway แต่ต้องมี URL แยกตาม channel

## 6. Candidate Workflow

Trigger: version tag หรือ manual workflow ตาม policy ที่อนุมัติ

Required steps:

1. Verify tag SHA lineage
2. Run Rust lint/tests
3. Run frontend lint/typecheck/tests
4. Run Tauri smoke build
5. Build installers and updater artifacts
6. Sign artifacts
7. Publish GitHub prerelease/candidate
8. Write `dev` manifest to candidate artifact
9. Record artifact hashes and signatures
10. Do not modify `stable` manifest

## 7. Promotion Workflow

Trigger: manual `workflow_dispatch`

Inputs:

- candidate version
- candidate release identifier
- evidence path
- approver

Required checks:

1. Candidate artifact exists
2. SHA256 and updater signature match build evidence
3. Required Dev DoD passed
4. No unresolved S0/S1 issue
5. Production environment approval granted
6. Promote existing artifact without rebuild
7. Update stable manifest atomically
8. Record promotion event and previous stable version

## 8. Failure and Rollback

### Candidate failure

```text
stable stays unchanged
candidate is marked rejected
fix code
release new version
```

### Stable rollback

Rollback changes the stable manifest to the last approved artifact. If the updater does not support downgrade, use a higher emergency patch version that restores the last known-good behavior.

## 9. Runtime Channel Resolution

Recommended priority:

```text
signed local override for developers
→ account entitlement
→ installer default
→ stable fallback
```

Unauthenticated or unresolved users must always fall back to `stable`.

## 10. Security Requirements

- Updater public key remains embedded in the application
- Channel selection cannot bypass signature verification
- Dev entitlement must not grant backend administrative privileges
- Update endpoint must not return secrets
- Promotion credentials are restricted to production environment
- Every manifest change is auditable

## 11. Definition of Done

- Dev installation sees candidate update
- Stable installation does not see candidate update
- Candidate is built and signed once
- Promotion uses byte-identical artifact and signature
- Failed candidate leaves stable unchanged
- Production approval is enforced
- Rollback path is documented and tested

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-07-23 | Initial release-channel and artifact-promotion architecture |

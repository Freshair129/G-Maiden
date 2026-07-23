---
version: "0.1.0b"
title: "CR-005 W1C — Landing Analytics และ Git Integration"
doc_id: "CR-005-W1C-landing-analytics-git-integration"
created_at: "2026-07-20T22:05:00+07:00,ATHER"
last_update: "2026-07-20T22:05:00+07:00,ATHER"
updated: "2026-07-20"
owner: "Boss"
status: "active"
superseded_by: null
attributes:
  doc_type: "change-request"
  domain: "landing-analytics-deployment"
  scope: "CR-005 W1C"
  language: "th"
  parent: "CR-005-W1B-thai-features-and-doc-encoding"
  related_docs:
    - "landing/DESIGN-SYSTEM.md"
    - "landing/README.md"
---

# CR-005 W1C — Landing Analytics และ Git Integration

> **Approval:** Boss อนุมัติเมื่อ 2026-07-20 ให้ติดตั้ง `@vercel/analytics` สร้าง private GitHub repository
> และเชื่อม Vercel Git integration สำหรับ automatic deployment

## 1. Classification

| หัวข้อ | ค่า |
| --- | --- |
| Complexity | **C-2 — Documentation-Driven Implementation** |
| Risk | **MEDIUM** |
| เหตุผล | เพิ่ม external page-view telemetry และเปลี่ยน deployment source เป็น standalone GitHub repository |

## 2. Scope and privacy contract

1. ติดตั้ง `@vercel/analytics` แบบ pinned ใน React + Vite landing
2. render `<Analytics />` หนึ่งครั้งที่ application root ผ่าน `@vercel/analytics/react`
3. ส่งเฉพาะ aggregate page views โดยตัด query string และ fragment ก่อนส่ง
4. ไม่สร้าง custom events และไม่ส่ง email, GID, OAuth/session data, match state, CV detection หรือ G-Log
5. Analytics ทำงานเฉพาะ public landing ไม่ถูกนำเข้า desktop app
6. สร้าง private repo `Freshair129/g-maiden-landing` โดยมี `main` เป็น production branch
7. เชื่อม repo กับ Vercel project `pornpons-projects/g-maiden-landing`

## 3. Parent and peer impact

- Product privacy boundary คงเดิม: raw match state, CV detections และ G-Log อยู่ในเครื่อง
- Account/GID enrollment คง schema และ RLS เดิม
- Landing Design System เปลี่ยนข้อกำหนดจาก no-analytics เป็น aggregate page-view exception ที่มีขอบเขตชัดเจน
- ไม่แก้ Command Deck, overlay, Rust backend, Supabase schema หรือ desktop release version

## 4. Acceptance and exit criteria

- dependency และ lockfile ตรงกันด้วย frozen install
- TypeScript และ production build ผ่าน
- production HTML โหลด Vercel Analytics script โดยไม่มี console error
- URL ที่ส่งไม่มี query string/fragment และไม่มี custom event
- GitHub repo เป็น private, default branch เป็น `main` และไม่มี secret หรือ `.vercel/project.json`
- Vercel project เชื่อม repo สำเร็จ; push เข้า `main` สร้าง production deployment อัตโนมัติ
- `codedoc-aligner` exit 0; exit 2 ถือเป็น INDETERMINATE ไม่ใช่ผ่าน

## 5. Version diff

| Artifact | Before | After |
| --- | --- | --- |
| Landing Design System | `0.4.1b` | `0.5.0b` |
| Analytics | ไม่มี | Aggregate page views with URL redaction |
| Deployment source | Vercel CLI จาก monorepo | Private standalone GitHub repo + Vercel Git integration |

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
| --- | --- | --- | --- | --- | --- |
| 0.1.0b | 2026-07-20 | active | Approved Vercel Analytics privacy boundary and standalone Git deployment contract | — | ATHER |

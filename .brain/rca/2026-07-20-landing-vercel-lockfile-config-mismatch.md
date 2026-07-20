---
version: "0.1.1b"
created_at: "2026-07-20T21:12:00+07:00,ATHER"
last_update: "2026-07-20T21:20:00+07:00,ATHER"
status: "active"
superseded_by: null
attributes:
  doc_type: "rca"
  domain: "landing-deployment"
  scope: "Vercel CLI production build"
  language: "th"
---

# RCA — Vercel local build ปฏิเสธ pnpm lockfile configuration

## Symptom

`vercel build --prod` หยุดก่อน Vite build ด้วย
`ERR_PNPM_LOCKFILE_CONFIG_MISMATCH` ขณะรัน `pnpm install --frozen-lockfile`

## Evidence

- Vercel CLI 54.14.5 ตรวจพบ lockfile v9 และเลือก pnpm 10
- `landing/pnpm-lock.yaml` บันทึก `overrides.lightningcss = 1.32.0`
- Override เดียวกันอยู่ใน `landing/pnpm-workspace.yaml` แต่ไม่มีใน `landing/package.json`
- Landing typecheck และ Vite build ผ่านเมื่อใช้ dependency tree ที่ติดตั้งแล้ว จึงไม่ใช่ source/build error

## Root Cause

Vercel static-build ตรวจ frozen lockfile จาก project manifest ใน build context แต่ override ที่สร้าง lockfile
ถูกประกาศไว้เฉพาะ workspace config ทำให้ configuration ที่ Vercel ใช้เปรียบเทียบไม่ตรงกับ lockfile

## Why the issue escaped detection

Local dependency tree ถูกติดตั้งไว้แล้วและ supply-chain gate ยืนยัน lockfile โดยไม่สร้าง Vercel clean build context
จึงไม่เจอ manifest/lockfile comparison แบบเดียวกับ `vercel build --prod`

## Proposed prevention

- ประกาศ root override ใน `package.json#pnpm.overrides` ซึ่ง Vercel ตรวจโดยตรง
- ให้ workspace config ทำหน้าที่ระบุ package roots เท่านั้น เพื่อลด configuration SSOT ซ้ำ
- รัน `pnpm install --frozen-lockfile` และ `vercel build --prod` เป็น deployment gate

## Resolution

- ย้าย override ไป `package.json#pnpm.overrides` และ pin `packageManager` เป็น `pnpm@10.34.5`
- Regenerate lockfile ด้วย pnpm 10.34.5; frozen install ผ่าน
- `vercel build --prod` และ prebuilt production deploy ผ่าน

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
| --- | --- | --- | --- | --- | --- |
| 0.1.0b | 2026-07-20 | active | Confirmed Vercel manifest/lockfile override mismatch and bounded prevention | — | ATHER |
| 0.1.1b | 2026-07-20 | active | Pinned pnpm contract, regenerated lockfile and verified production deployment | — | ATHER |

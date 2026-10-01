---
version: "0.2.3"
created_at: "2026-07-22T20:05:00+07:00,ATHER"
last_update: "2026-10-01T08:55:14+07:00,RWANG"
status: "historical"
superseded_by: null
attributes:
  domain: "release-operations"
  scope: "G-Maiden landing closed beta delivery and operator release flow"
  language: "th"
title: "G-Maiden Closed Beta Release Playbook"
doc_id: "gmaiden-closed-beta-release-playbook"
updated: "2026-10-01"
owner: "Boss"
related_docs:
  - "CR-016-gmad-beta-download-admin-controller"
  - "CR-020-gmad-beta-notification-and-open-beta-countdown"
  - "CR-021-closed-beta-terms-consent-and-entitlement-acceptance"
  - "CR-022-gmad-desktop-first-run-entitlement-account-handoff"
  - "gmad-current-first-run-user-flow-walkthrough"
---

# G-Maiden Closed Beta Release Playbook

เอกสารนี้เป็น archived playbook สำหรับ flow ปล่อยสิทธิ์ดาวน์โหลด G-Maiden Closed Beta ในอดีต
โดยเก็บ implementation reference จาก landing/ และ Supabase project ไว้ทบทวนย้อนหลัง

## Current source and deployment status (2026-10-01)

D4=B: ห้ามอ้างว่า UI operator /ops เป็น shipped ปัจจุบัน

- [landing/src/main.tsx](../../landing/src/main.tsx) ส่ง /demo และ /public-demo ไป PublicDemo; path อื่นแสดง App. entrypoint นี้ไม่มี branch เฉพาะสำหรับ /ops และไม่ได้พิสูจน์ว่า App แสดงอะไร
- [landing/vercel.json](../../landing/vercel.json) ระบุ Vite install/build/output โดยไม่มี rewrite; ข้อเท็จจริงของ source ไม่ได้พิสูจน์ HTTP response ของ deployment ปัจจุบัน
- สถานะ route ที่ deploy: DEPLOYED: UNKNOWN / NOT_VERIFIED; ไม่มี browser/HTTP probe ปัจจุบันในเอกสารนี้
- [CLAUDE.md](../../CLAUDE.md) บันทึก production G-Maiden queue sector ซึ่งควรเก็บเป็นข้ออ้างเรื่อง queue/support แยกต่างหาก; เอกสารเดียวกันกล่าวถึง owner/admin controller ที่ /ops แต่ไม่ใช่หลักฐาน UI source หรือ route ที่ deploy และไม่ใช่ข้ออ้างว่า UI ดังกล่าว shipped ตาม D4=B

> บันทึก snapshot ทางประวัติศาสตร์ ณ 2026-07-23: ขณะนั้นเอกสารระบุว่า public landing page ถอด flow เช็กคิว/ดาวน์โหลด, route /ops, และหน้า Terms/Privacy ออกแล้ว ส่วน backend artifacts/functions ยังคงอยู่เป็นโครงปฏิบัติการภายใน ข้อความนี้เป็นประวัติของ snapshot นั้น ไม่ใช่สถานะ deployment วันนี้ และไม่ยกเลิก queue/support claim ที่บันทึกใน CLAUDE.md

## 1. เป้าหมายของระบบเดิมนี้

ระบบ Closed Beta เดิมมีหน้าที่ 3 อย่าง:

1. คุมว่าใคร “ถึงคิวดาวน์โหลด” ผ่าน grant ฝั่ง backend
2. แจกไฟล์ installer ผ่าน signed URL ระยะสั้นเท่านั้น
3. แยก reader-facing release wave ออกจาก technical storage path / function name ได้

ระบบนี้ไม่ได้ใช้:

- email เป็น bearer download link
- GID ที่พิมพ์เองเป็น credential
- public file URL แบบถาวร

## 2. ข้อเท็จจริงเชิงระบบที่ต้องจำ

### 2.1 หนึ่ง batch ครอบได้แค่ generation เดียว

`gmad_download_batches` บังคับว่า:

- `gid_start` และ `gid_end` ต้องอยู่ generation เดียวกัน
- `cohort_seq_start` ต้องน้อยกว่าหรือเท่ากับ `cohort_seq_end`

ดังนั้น release wave เดียวอาจแตกเป็นหลาย batches ได้ หาก waiting list กระจายหลาย generation

### 2.2 ผู้ใช้จะเปลี่ยนจาก `waiting` เป็น `available` ก็ต่อเมื่อครบทุกเงื่อนไขใน flow เดิม

ต้องมีพร้อมกันทั้งหมด:

1. artifact ถูกอัปโหลดเข้า private bucket `gmad-releases`
2. มี batch ที่ชี้มาที่ `artifact_path` นั้น
3. batch ถูก publish แล้ว
4. มี grant ของ user คนนั้นใน `gmad_download_grants`

ถ้าขาดข้อใดข้อหนึ่ง `check-gmad-queue` จะยังไม่ปล่อยให้โหลด

### 2.3 `artifact_path` เป็น relative path ภายใน bucket

ค่า `artifact_path` ต้อง:

- ไม่ขึ้นต้นด้วย `/`
- ไม่มี `..`
- เป็น key ภายใน bucket `gmad-releases`

ตัวอย่างที่ถูกต้อง:

`windows/closed-beta/2026-07-22/gmaiden-cb-2026-07-22-v0-13-0/g-maiden-0.13.0-x64-setup.exe`

## 3. Sequence diagram ของ flow เดิมก่อน retirement

> หมายเหตุ: sequence นี้เก็บไว้เป็น reference สำหรับ backend/operator flow เดิมเท่านั้น
> ไม่ได้สะท้อน public landing page ปัจจุบันแล้ว

```mermaid
sequenceDiagram
    autonumber
    actor User as ผู้ใช้
    participant Landing as Landing Page
    participant OAuth as Google OAuth
    participant Queue as check-gmad-queue
    participant Terms as accept-closed-beta-terms
    participant Grant as request-gmad-download
    participant Storage as Supabase Storage
    participant Ops as Ops/Admin

    Ops->>Storage: อัปโหลด artifact release
    Ops->>Ops: สร้าง batch ตามช่วง GID
    Ops->>Ops: Publish batch

    User->>Landing: เปิดหน้า G-Maiden section
    User->>OAuth: Sign in ด้วย Google
    OAuth-->>Landing: กลับมาพร้อม session
    Landing->>Queue: ตรวจคิว/สิทธิ์ของ GID ปัจจุบัน
    Queue-->>Landing: waiting หรือ available

    alt available
        User->>Landing: กดยอมรับ Terms และขอดาวน์โหลด
        Landing->>Terms: บันทึก acceptance/consent ที่จำเป็น
        Terms-->>Landing: success
        Landing->>Grant: ขอ signed URL
        Grant->>Storage: ตรวจ batch + grant + artifact_path
        Storage-->>Grant: signed URL อายุสั้น
        Grant-->>Landing: ส่ง URL กลับ
        Landing-->>User: redirect ไปดาวน์โหลด installer
    else waiting
        Landing-->>User: แสดงว่ายังไม่ถึงคิว
    end
```

## 4. Operator flow สำหรับปล่อย Closed Beta (dormant reference)

```mermaid
flowchart TD
    A[เลือก release asset ที่จะปล่อยจริง] --> B[อัปโหลดเข้า bucket gmad-releases]
    B --> C[กำหนด release wave id]
    C --> D[แตก waiting list เป็น batch ตาม generation และ GID range]
    D --> E[สร้าง batch]
    E --> F[publish batch]
    F --> G[grant ถูก snapshot ให้ผู้ใช้ในช่วงนั้น]
    G --> H[check-gmad-queue ตอบ available]
    H --> I[request-gmad-download สร้าง signed URL]
```

## 5. Naming convention ที่ใช้ต่อจากนี้

### 5.1 Release wave id

ใช้สำหรับ “รอบปล่อย” ระดับธุรกิจ/ปฏิบัติการ

รูปแบบ:

`gmaiden-cb-YYYY-MM-DD-vX-Y-Z`

ตัวอย่าง:

`gmaiden-cb-2026-07-22-v0-13-0`

### 5.2 Batch release_id

ใช้สำหรับ batch ที่ publish จริงใน generation ใด generation หนึ่ง

รูปแบบ:

`<release-wave-id>-<generation-lower>`

ตัวอย่าง:

- `gmaiden-cb-2026-07-22-v0-13-0-b`
- `gmaiden-cb-2026-07-22-v0-13-0-f`

### 5.3 Artifact path

รูปแบบ:

`windows/closed-beta/YYYY-MM-DD/<release-wave-id>/g-maiden-<version>-x64-setup.exe`

ตัวอย่าง:

`windows/closed-beta/2026-07-22/gmaiden-cb-2026-07-22-v0-13-0/g-maiden-0.13.0-x64-setup.exe`

ไฟล์ signature ให้ใช้ path เดียวกันและเติม `.sig`

## 6. ขั้นตอนปล่อย release wave ใหม่ (dormant operator runbook)

1. ยืนยันว่า asset ที่จะปล่อย “ดาวน์โหลดได้จริง”
   - แนะนำให้ใช้ asset จาก GitHub Release ที่ publish แล้ว
   - ถ้าไฟล์ local ใหญ่กว่า storage limit ของ project ให้ตรวจ size limit ก่อน

2. อัปโหลดไฟล์เข้า bucket `gmad-releases`
   - installer
   - signature (`.sig`) ถ้ามี

3. ตรวจ waiting roster
   - list GID
   - generation
   - cohort sequence

4. group เป็น batches
   - หนึ่ง batch ต่อหนึ่ง generation
   - หนึ่ง batch ต่อหนึ่งช่วง `gid_start -> gid_end`

5. สร้าง/publish batches
   - `label`
   - `release_id`
   - `artifact_path`
   - `gid_start`
   - `gid_end`

6. verify หลังปล่อย
   - object อยู่ใน bucket
   - batch เป็น `published`
   - grants ถูกสร้างครบ
   - ผู้ใช้ในช่วงนั้น `check-gmad-queue` ได้สถานะ `available`

## 7. Historical comparison: Closed Beta and Open Beta

### Closed Beta

- เข้าถึงผ่าน waiting list / invite / grant
- ต้องมี batch publish ให้ก่อน
- signed URL ออกให้เฉพาะผู้ใช้ที่ผ่าน entitlement

### Open Beta

- แผน ณ 2026-07-23 ระบุเวลาเปิด `2026-07-24 18:00 ICT`; วันที่ดังกล่าวเป็นแผนในอดีต ไม่ใช่หลักฐาน availability ปัจจุบัน
- Snapshot 2026-07-23 บันทึกการปิด queue/download gate ชั่วคราว; ไม่ใช้ข้อความนี้ยืนยันสถานะ landing ปัจจุบัน
- คง Terms / entitlement shape / signed URL policy เป็นแนวทางออกแบบย้อนหลัง; อย่าอนุมานว่ามี public mirror ปัจจุบัน

## 8. Release log ที่ยืนยันแล้ว ณ 2026-07-22

รอบปล่อยจริงชุดแรกที่ verify แล้ว:

### Release wave

- `gmaiden-cb-2026-07-22-v0-13-0`

### Artifact

- `windows/closed-beta/2026-07-22/gmaiden-cb-2026-07-22-v0-13-0/g-maiden-0.13.0-x64-setup.exe`
- `windows/closed-beta/2026-07-22/gmaiden-cb-2026-07-22-v0-13-0/g-maiden-0.13.0-x64-setup.exe.sig`

### Published batches

- `gmaiden-cb-2026-07-22-v0-13-0-b`
  - Gen B
  - `G-B4A8G3AS7` -> `G-B4AKAR5G9`
- `gmaiden-cb-2026-07-22-v0-13-0-f`
  - Gen F
  - `G-F496Z2TUG` -> `G-F496Z2TUG`

### Waiting list ที่ถูกปล่อยแล้วในรอบนี้

- `G-B4A8G3AS7`
- `G-B4A8G3ATF`
- `G-B4AKAR5G9`
- `G-F496Z2TUG`

## 9. ข้อควรระวัง

1. อย่าคิดว่า release wave หนึ่งเท่ากับหนึ่ง batch เสมอ
2. อย่าผูก download link ถาวรไว้ใน email
3. อย่าใช้ typed GID เป็นตัวตัดสินสิทธิ์แทน authenticated user + grant
4. อย่าปล่อย object เข้าพาธที่อ่านไม่ออกจากชื่ออย่างเดียว
5. อย่าข้ามขั้น verify ว่า object อยู่ใน bucket จริงก่อน publish

## 10. Checklist สั้นก่อนกดปล่อย

- [ ] เลือก asset release ถูก version
- [ ] ตั้ง release wave id แล้ว
- [ ] อัปโหลด `.exe` แล้ว
- [ ] อัปโหลด `.sig` แล้ว
- [ ] แยก waiting roster ตาม generation แล้ว
- [ ] ตั้ง `release_id` ของแต่ละ batch แล้ว
- [ ] ตั้ง `artifact_path` ตรงกับ object จริงแล้ว
- [ ] publish batch แล้ว
- [ ] ตรวจ grants แล้ว
- [ ] ทดสอบ user state ว่าเป็น `available` แล้ว

## 11. Historical operator snapshot for /ops

รายละเอียดด้านล่างเป็น historical operator snapshot contract เท่านั้น ไม่ใช่ข้ออ้างว่า UI นี้ shipped อยู่ในปัจจุบัน ตาม D4=B ไม่อ้างว่า /ops มีหน้า operator ปัจจุบัน; source/config/deployed status แยกกันตามสถานะด้านบน

- current release wave จาก `release_id` ของ published batch ล่าสุด
- `artifact_path` ของ wave ที่กำลังปล่อย
- เวลาที่ publish ล่าสุด
- จำนวน batch ที่ published / draft / paused
- coverage ของ roster ที่โหลดมา เทียบกับ published batches ปัจจุบัน
- checklist สำหรับบอกว่า wave ปัจจุบันพร้อม, ยังมี draft ค้าง, หรือยังมี GID ที่ roster ที่โหลดมายังไม่ถูกครอบ

หลักคิด:

1. หน้า `/ops` ใช้เพื่อ “คุมสถานะการปล่อย” ไม่ใช่แค่สร้าง draft
2. ค่าที่แสดงต้องคำนวณจาก payload จริงของ `admin-gmad-controller`
3. ถ้า roster ที่โหลดมาไม่ครบทั้งหมด ต้องเตือนชัดว่า coverage ที่เห็นเป็น coverage ของชุดข้อมูลที่โหลดมา ไม่ใช่ทั้งระบบ

## Changelog

| Version | Date | Status | Summary | Commit Hash | Agent |
| 0.1.0 | 2026-07-22 | active | Added the operational playbook for G-Maiden Closed Beta release flow, sequence diagram, naming convention, release checklist, and the verified 2026-07-22 release log. | null | ATHER |
| 0.2.0 | 2026-07-22 | active | Added the `/ops` operator snapshot contract: current release wave, artifact path, publish recency, loaded-roster coverage, and checklist expectations. | null | ATHER |
| 0.2.1 | 2026-07-23 | active | Marked the public landing Closed Beta queue/download flow, `/ops`, and Terms/Privacy routes as retired while backend release infrastructure remains dormant for the next roadmap. | null | ATHER |
| 0.2.2 | 2026-07-23 | active | Reframed this document as an archived/dormant operator reference so it no longer describes the removed public landing queue/download flow as current behavior. | null | ATHER |
| 0.2.3 | 2026-10-01 | historical | Reconciled historical queue/operator notes with current source evidence: preserve the repository queue/support claim, do not claim a current shipped /ops UI, and mark deployed route status unverified. | null | RWANG |

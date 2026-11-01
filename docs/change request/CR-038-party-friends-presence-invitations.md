---
title: "CR-038 — G-Party Friends, presence และคำเชิญเข้าปาร์ตี้"
doc_id: "CR-038-party-friends-presence-invitations"
status: active
version: "0.2.1"
updated: "2026-11-01"
owner: "G-Maiden"
complexity: "C-3"
risk: "HIGH"
related_docs: ["FEAT-G-FRIENDS", "FEAT-G-PARTY", "mvp-decisions", "2026-11-01-g-party-friends-design", "2026-11-01-g-party-friends", "ADR-20", "g-party-social-operations"]
---

# CR-038 — G-Party Friends, presence และคำเชิญเข้าปาร์ตี้

GitHub tracking: https://github.com/Freshair129/G-Maiden/issues/106 · implementation PR: https://github.com/Freshair129/G-Maiden/pull/107

## เป้าหมายและอำนาจดำเนินงาน

Owner อนุญาตในบทสนทนาวันที่ 2026-11-01 (Asia/Bangkok) ให้เปิด Change Request บน GitHub เริ่มพัฒนาด้วย multi-agent workflow ที่มีผู้ควบคุม และดำเนินงานจน PR ผ่านเงื่อนไขและ merge ได้

เพิ่มระบบเพื่อนถาวรและคำเชิญสำหรับกลุ่มที่เล่นซ้ำ โดยรักษาเส้นทางเข้าห้อง G-Party ด้วยรหัสโดยไม่ต้องมีบัญชี ระบบเพื่อนช่วยหาและเชิญคนเดิม; การเป็นเพื่อนไม่ให้สิทธิ์อ่าน HP หรือเปิดแชร์ GSI อัตโนมัติ

Reserved documentation IDs: **CR-038**, **ADR-20**, **FEAT-G-FRIENDS**.
Dependency: **#104 G-Party own-GSI sharing**. ไม่รวมงาน gameplay/release ใน #105 หรือ PR อื่นที่ไม่เกี่ยวข้อง

## ขอบเขตที่อนุญาต

- เพิ่มเพื่อนด้วยรหัสที่ปลอดภัยและจากสมาชิกที่มีการผูกตัวตนอย่างตรวจสอบได้; อีกฝ่ายตอบรับ/ปฏิเสธ
- รายชื่อเพื่อนถาวร, ลบเพื่อน, block/unblock และควบคุมการรับคำเชิญ
- Presence หมายถึงออนไลน์ใน G-Maiden เท่านั้น; มี hidden, lease/expiry และไม่มีประวัติ last-seen
- เชิญเพื่อนเข้าห้อง, ทบทวนปลายทาง, รับ/ปฏิเสธ/หมดอายุ/revoke โดยไม่ดึง focus
- เข้าปาร์ตี้ต้อง checked sharing consent ใหม่ตาม G-Party และแสดงข้อมูลเฉพาะสมาชิกห้อง/แมตช์/ทีมที่ตรงกันและข้อมูลสด
- ใช้บัญชี Google/Supabase เดิมสำหรับ social operations เท่านั้น; local core และ manual room code ยังคงใช้โดยไม่ล็อกอิน
- Private social storage และ safe account projection; ไม่เปิดตาราง profiles ทั้งแถวให้ค้นหากัน
- จัดเตรียม relay/social configuration และคู่มือให้ผู้ดูแลตั้งค่าบริการที่รองรับได้ โดยไม่แต่ง URL บริการหรืออ้างว่ามี deployment แล้ว
- UI ออกแบบ G-Party ใหม่รอบ minimap ใหญ่ พร้อม room/member region และ Friends rail; ตามคำสั่งล่าสุดให้ใช้ design tokens เดิม แต่ไม่ต้องยึดเลย์เอาต์เดิม

## ขอบเขตข้อมูลและความปลอดภัย

Friendship, presence visibility, invitation acceptance และ GSI sharing เป็นคนละสิทธิ์
ห้ามส่ง account access token ไป arbitrary relay, ห้ามเก็บ member token/GMP1 invitation secret เป็นประวัติ social และห้ามใช้ nickname เป็นตัวตนบัญชี
Room-bound proof/recipient-bound short-lived ticket และรายละเอียด persistence/expiry เป็น implementation decisions ที่ต้องเขียน spec/threat model และตรวจสอบก่อนลงมือ
ห้ามเพิ่ม raw GSI/match ID/SteamID, enemy/CV/Voice/Memory/G-Log หรือ peer stats เข้า social database, AI หรือ analytics
Account switch/logout, block, delayed replies, invitation replay, revoked membership และ room rotation ต้องไม่เปิดสิทธิ์ผิดคน

## Multi-agent workflow และเจ้าของงาน

Supervisor/integrator คุม contract, lane ownership, evidence ledger และ merge
1. Recon/spec: ตรวจ auth, native/UI seams และ governance แบบอ่านอย่างเดียว
2. Contract/design review: ล็อก API/DTO/authorization/consent และแผนทดสอบ
3. Implementation lanes: private backend; relay/native bridge; frontend พร้อม ownership ไม่ทับไฟล์
4. Independent review: ตรวจ spec compliance, สิทธิ์/ข้อมูลรั่ว/การแข่งขันของคำขอ และ UX
5. Integrate: run targeted/integration/full gates, แก้ findings, regenerate doc graph
6. Open PR, ตรวจ CI และ review threads บน final head, update main ผ่าน merge ที่ได้รับอนุญาตเท่านั้น

## Acceptance / execution checklist

- [x] CR/spec/ADR/threat model/implementation plan และ doc impact ลง repo
- [x] Server-authorized friend relationship + block + rate/capacity controls ทดสอบกับ database จริง
- [x] Safe presence lease + account isolation + hidden semantics
- [x] Room-bound invite/identity contract พร้อม replay/expiry/wrong-recipient/revocation tests
- [x] Native trusted-Control bridge; ไม่เผย credentials และไม่ auto-join/share
- [x] Friends UI + fresh consent + sign-out/switch/race/failure tests
- [x] Guest G-Party/local core regression tests
- [ ] Independent review ปิด confirmed blockers
- [ ] Required CI, doc graph, Windows/native compile/tests/package และ review threads ผ่านบน final mergeable head
- [ ] Protected PR merge verified และบันทึก merge SHA
- [ ] บันทึก live Dota/two-client/two-monitor/NFR และ hosted deployment acceptance ตามหลักฐานจริง

The repository checklist is the source checkpoint. Final whole-branch review, exact-head CI and merge receipts are updated on issue #106 / PR #107 after execution, without claiming hosted/live acceptance.

## Source integration versus release

คำสั่งนี้อนุญาต source integration ผ่าน PR หลัง checks/review ผ่าน รวม dependency #104 ที่จำเป็น
ไม่ถือว่า live Dota/native runtime/NFR ผ่านจาก unit tests หรือ CI และไม่ถือว่าอนุญาต production migration/deployment, release/tag/channel promotion หรือการแจ้งเตือนบุคคลภายนอก
ข้อจำกัดการรับรองที่ยังไม่มีหลักฐานต้องคงสถานะ pending และแยกงานติดตามอย่างชัดเจน
ไม่เปลี่ยน branch protection, ไม่ force-push/amend PR, ไม่ลดหรือปิด checks

## ไม่รวมในรอบนี้

Full text/voice chat, community servers, screen sharing, Steam friend import, public activity feed, automatic sharing, automatic join และการเปลี่ยน 62 MVP parent tasks เดิม


## Dependency integration receipt

PR #104 merged through the protected PR flow at `a9b31b06ffd1c0ffb6c4177d428bf8ff4923b917`. Its source head was `612088dc5d7a467b6869d8b8711e44c558d2287f`; CI run 41278442753 and ready-for-review PR Gate run 41320018976 passed, with no review threads. The source-integration authority above supersedes the earlier assistant recommendation to retain that dependency as draft. Live Dota/native runtime, multi-monitor, resource and deployment/release acceptance remain pending.

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-11-01 | Record owner-authorized Friends implementation through protected merge, separate social consent/data scope, supervised workflow and G-Party dependency integration. |
| 0.2.0 | 2026-11-01 | Record latest owner frontend direction: reuse design tokens while redesigning room/member/Friends layout around a large minimap; retain consent and functional scope. |
| 0.2.1 | 2026-11-01 | Link PR107 and record implemented/reviewed source gates; final protected merge and live receipts remain separately evidenced. |

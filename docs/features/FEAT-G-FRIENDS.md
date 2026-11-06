---
title: "FEAT: G-Friends — Friends and consented party invitations"
doc_id: "FEAT-G-FRIENDS"
status: "active"
version: "0.1.1"
updated: "2026-11-01"
owner: "G-Maiden"
source_of_truth: true
complexity: "C-3"
risk: "HIGH"
related_docs: ["FEAT-G-PARTY", "ADR-20", "mvp-decisions", "G-SERIES-DATA-LINEAGE", "CR-038-party-friends-presence-invitations", "2026-11-01-g-party-friends-design", "2026-11-01-g-party-friends", "g-party-social-operations"]
---

# FEAT-G-FRIENDS — Friends and consented party invitations

> **Module:** G-Friends, ภายในหน้า G-Party · **Phase:** 3 (extension integration)
> **สถานะ:** source implementation และ task reviews ผ่านแล้วใน [PR #107](https://github.com/Freshair129/G-Maiden/pull/107); final CI/merge receipts ดู PR และ issue #106 ส่วน hosted service และ live acceptance เป็นหลักฐานคนละชุด

## 1. เป้าหมายและอำนาจดำเนินงาน

ผู้ใช้ต้องการเล่นกับปาร์ตี้เดิมและเห็นสถานะของสมาชิกโดยไม่เลื่อนกล้องไปเลือกฮีโร่เพื่อน จึงอนุญาตวันที่ 2026-11-01 ให้เปิด CR บน GitHub ทำงานด้วยหลาย agent ภายใต้ผู้ควบคุม และดำเนินการผ่าน PR จน merge ได้ ตาม [[CR-038-party-friends-presence-invitations]]. งานนี้เพิ่มความสะดวกในการหาและเชิญคนเดิม โดยใช้ own-GSI sharing ของ [[FEAT-G-PARTY]] เป็นฐาน

**มิตรภาพ การแสดงออนไลน์ การผูกโปรไฟล์กับห้อง และการแชร์ GSI เป็นคนละสิทธิ์** การเพิ่มเพื่อนไม่เปิด HP/MP ไม่ยืนยันว่าอยู่ทีมเดียวกัน และไม่ทำให้เข้าห้องอัตโนมัติ ผู้เล่นที่ใช้รหัสห้องยังเล่นแบบ guest ได้โดยไม่ต้องเพิ่มเพื่อนหรือเข้าสู่บัญชี

ขอบเขตผลิตภัณฑ์มาจากคำสั่งผู้ใช้ ส่วน protocol, HMAC, limits และวิธีเก็บข้อมูลเป็น implementation decisions ของ assistant ที่ผ่าน design review ไม่ใช่คำกล่าวว่าผู้ใช้อนุมัติราย field หรือรับรองผลทดสอบทุกกรณี ไม่เพิ่ม priority P0 ไม่เปลี่ยน 62 MVP parent tasks และไม่อนุญาต deployment/release จาก source merge

## 2. เส้นทางผู้ใช้และเงื่อนไข

| Requirement | พฤติกรรมที่ต้องได้ |
| --- | --- |
| `FRIENDS-FR-001` | ใช้ Google session เดิมของ G-Maiden เฉพาะ social actions; signed-out หรือ social unavailable ต้องยังใช้ guest create/join และ local core ได้ |
| `FRIENDS-FR-002` | เพิ่มเพื่อนด้วย GID ที่ตรงทั้งรหัสและ checksum; อีกฝ่ายตอบรับหรือปฏิเสธ ผู้ส่งยกเลิกได้ คำขอย้อนกลับไม่ auto-accept |
| `FRIENDS-FR-003` | รายชื่อเพื่อนถาวรสูงสุด 200 คน; pending รวมขาเข้า/ขาออก 50 รายการ; block สูงสุด 500 คน ลบ/block/unblock ได้และ unblock ไม่คืนความสัมพันธ์เดิม |
| `FRIENDS-FR-004` | ออนไลน์หมายถึงแอปกำลังทำงานและผู้ใช้เปิดแสดงออนไลน์เท่านั้น ค่าเริ่มต้นซ่อน ไม่มี last-seen, current-match หรือ activity feed |
| `FRIENDS-FR-005` | เจ้าของห้องเชิญเพื่อนที่อนุญาตรับคำเชิญได้ ผู้รับรับ/ปฏิเสธ ผู้ส่ง revoke ได้ คำเชิญหมดอายุใน 5 นาที |
| `FRIENDS-FR-006` | หน้ารับคำเชิญแสดงผู้เชิญและ relay ที่ตรวจจาก broker, ชื่อในห้อง, เวลาที่เหลือ และ checkbox แชร์ own-GSI ที่เริ่มว่างทุกครั้ง กด Join หลังยินยอมเท่านั้น |
| `FRIENDS-FR-007` | ถ้าอยู่ห้องแล้วต้อง Leave ให้สำเร็จก่อนรับคำเชิญใหม่ Native ห้ามออกจากห้องเดิมเองเพื่อ join เพื่อน การรับ ticket หรือ redeem สำเร็จยังไม่ใช่ joined |
| `FRIENDS-FR-008` | ยืนยัน joined จาก native connected snapshot ของ roomId ที่ร้องขอเท่านั้น; room เต็ม/ปิด/เปลี่ยน generation หรือการเชื่อมต่อล้มเหลวต้องรายงานตามจริง ไม่ fallback เข้าด้วยรหัส |
| `FRIENDS-FR-009` | ผู้ใช้กดยินยอมแยกเพื่อผูก GID กับสมาชิกห้องตนเอง จากนั้นแสดง Add Friend เฉพาะ membership ที่ proof และ binding ยัง valid; nickname guest ไม่กลายเป็นบัญชีโดยการคาดเดา |
| `FRIENDS-FR-010` | ปิดรับ friend requests/invites ได้ การปิดรับ invites ยกเลิก incoming invite ที่ยังไม่ redeem; hidden/revoked/expired/offline ไม่ถูกแยกเป็น last-seen ให้ผู้อื่นรู้ |

ลบเพื่อนหรือ block หยุด social visibility/คำเชิญที่ยังไม่ใช้ แต่ **ไม่เตะสมาชิกที่เข้าห้องอยู่แล้ว** ต้องอธิบายทางเลือก Leave, owner Kick และ Rotate โดยแยกผลของแต่ละ action เมื่อ redeem ได้รับอนุญาตก่อน block commit อาจมี admission นั้นสำเร็จได้เพียงครั้งเดียว ตาม transaction ordering ใน §5

## 3. หน้า UI และจอที่สอง

คำสั่งผู้ใช้ล่าสุดวันที่ 2026-11-01 ให้ **ใช้ design tokens เดิม แต่จัดเลย์เอาต์ใหม่ได้** แทนข้อจำกัดช่วงต้นที่ห้ามอ้าง design system ทั้งชุด ใช้สี/ฟอนต์/ระยะ/มุมตาม tokens เดิมและออกแบบ G-Party ใหม่ให้ minimap ใหญ่เป็นพื้นที่หลัก ตำแหน่งรอบแผนที่รองรับ room controls/member vitals และ Friends rail ที่มี tabs สำหรับเพื่อน/คำขอ/คำเชิญ/ความเป็นส่วนตัว

รายการยาวเลื่อนในพื้นที่ที่กำหนด จอแคบยุบ social rail ด้วยการเลือกของผู้ใช้เพื่อรักษาแผนที่ ไม่ย้าย Overlay navigation และไม่เรียก focus/show/notifications ที่แย่งเกม แชตข้อความและ voice chat ยังนอก functional scope; โครงหน้าต่อเพิ่มได้โดยไม่แสดงปุ่มที่อ้างว่าใช้งานได้แล้ว

CommandDeck เป็นเจ้าของ social controller เพียงตัวเดียว การกลับไปดูแผนที่ไม่ทำให้ presence หรือ profile-link renewal หยุด ส่วน passive roster query พักได้เมื่อพาเนลไม่แสดง ข้อมูลเพื่อนและ guest room controls แสดงสถานะล้มเหลวแยกกัน

Account/session change ต้องล้าง UI ที่เป็นของบัญชีเก่าทันทีและทิ้ง late replies หากมี social join ที่ยังค้าง ต้องยกเลิก native งานนั้นก่อนเปิด controls ให้บัญชีใหม่ แต่ signout ปกติไม่ทำให้ออกจาก guest room ที่มีอยู่ก่อน

Profile-link consent เริ่มว่างและ reset เมื่อเปลี่ยนบัญชีหรือ `(relayOrigin, roomId, selfId, roomGeneration)` ทุกครั้ง ก่อน link scope ใหม่ต้องรอ server รับ `unlink`, เพิ่ม `bindingRevision` และโหลด revision ใหม่สำเร็จ การ abort HTTP ไม่ถือว่า unlink สำเร็จ หาก backend ไม่พร้อมต้องปิด link ไว้จน reconcile ได้

## 4. Data contract และอายุข้อมูล

สัญญา HTTP/DTO/HMAC แบบ exact-key อยู่ที่ [[2026-11-01-g-party-friends-design]] และเป็นข้อกำหนดสำหรับทั้งสาม implementation lanes

| ข้อมูล | เจ้าของและอายุ | สิ่งที่ออกจาก boundary |
| --- | --- | --- |
| Friendships / blocks / settings | `social_private` ถาวรจนลบหรือบัญชีถูกลบ | เฉพาะ GID + displayName ของความสัมพันธ์ที่ผู้เรียกมีสิทธิ์ดู |
| Pending request | ไม่เกิน 30 วัน; combined cap 50/account | request ID, direction, safe person, expiry |
| Presence | heartbeat ทุก 20 s เมื่อเปิดแสดง; lease 60 s และ live Google session | online + remaining TTL เท่านั้น; ไม่คืน timestamp ของการออนไลน์ล่าสุด |
| Room profile binding | explicit opt-in; lease 60 s, renewal 20 s; session-bound revision | member ID ↔ GID/name สำหรับ current proof roster และ current UI roster เท่านั้น |
| Challenge / relay proof | one-use challenge; อายุสูงสุด 60 s | proof ไม่มี GID/JWT/UUID/GSI และยืนยันเพียงการถือ membership credential ที่ relay รับรอง |
| Targeted invite | 5 นาที; active 50 sent และ 50 received/account | safe person, direction/status/expiry; ไม่ส่ง GMP1 secret |
| Join ticket | one-use, สูงสุด 60 s และไม่เลย invite expiry; 1 live ticket/invite | opaque random 32 bytes + origin/expected roomId; ไม่คืน memberToken |
| Redeem nonce | hash-only, 120 s, ไม่เกิน 120 live rows/registered relay | ไม่มี nonce/account/ticket history ใน public DTO |

Presence state polling 15 s, หนึ่ง request in flight; client หัก whole RTT และ monotonic elapsed จาก TTL จึงไม่แสดง online ต่อเมื่อ poll ค้าง Failure ต้องล้าง online indicator ไม่เดาจาก roster หรืออายุคำขอ

Database เก็บ challenge/ticket/nonce เป็น hash เท่านั้น ไม่มี GMP1 invite secret, memberToken, GSI stats, match/team history, SteamID, raw profiles, email/phone หรือ gameplay payload ใน social tables/DTO/audit ข้อมูล peer stats ยังเดินตาม G-Party route เดิมและไม่เข้า social DB, AI, G-Memory, G-Log หรือ analytics

Expired rows เข้าถึงไม่ได้ทันที มี bounded cleanup อย่างน้อยวันละครั้ง; completed ephemeral rows ต้องถูกลบภายใน 24 ชั่วโมง ไม่มี presence/link history และไม่มีการ append social actions ไป security audit ระยะยาว คู่มือปฏิบัติการและการตรวจ cleanup อยู่ใน [[g-party-social-operations]]

## 5. Authorization และ trust

### 5.1 Account broker

`g-party-social` รับ Google access token ที่ endpoint คงที่ของ Supabase ตรวจ identity และ live session ด้วย IAM resolver ที่มี `social.use`, AAL1/AAL2 และไม่มี audit callback ของ heartbeat ใช้ `gmaiden_iam_runtime` แบบ least privilege ผ่าน parameterized SQL เท่านั้น ไม่ใช้ service-role key

Schema `social_private` อยู่นอก exposed schemas ทุก table เปิด RLS, revoke PUBLIC/anon/authenticated และ runtime direct-table access มีเพียง bounded fixed-search-path definer functions ที่เปิด EXECUTE แบบเจาะจง ไม่ขยาย `profiles` SELECT เป็น directory

Session locks มาก่อน canonical account/pair locks ทุก social mutation ล็อก auth.sessions ให้ conflict กับการลบจริงและใช้ `clock_timestamp()` หลังการรอ locks ไม่อ้างว่า EXISTS อย่างเดียวป้องกัน revocation race ได้ Friend caps/pending caps/accept/block/remove ใช้ atomic transactions

Expected denial คืน error envelope ตามปกติเพื่อให้ rate charges และ nonce ที่ authenticated แล้ว commit ต่อไป ไม่ RAISE จน rollback การนับ คำขอ GID ที่ไม่มีจริง/ถูก block/ปิดรับคืน unavailable เหมือนกัน Exact-GID create จำกัด 10/min/account; mutation 30, state 12, heartbeat 6, challenge mint 12 ต่อ minute/account; redeem 60/min/relay การ consume challenge ไม่หัก flow budget ซ้ำ

### 5.2 Registered relay

เฉพาะ relay HTTPS origin ที่ operator ตั้งค่าร่วมกับ broker เท่านั้นที่ใช้ social proof/admission ได้ Custom relay ยังใช้ guest code ได้ ไม่มี account JWT, GID หรือ UUID ส่งไป relay Native รักษา member credentials; trusted Control IPC ไม่คืน token

Relay proof ใช้ HMAC-SHA256 พร้อม domain-separated exact bytes; broker ตรวจ signature ก่อน parse และผูก one-use challenge กับ account/session/purpose/recipient/revision Relay ที่รู้ key อาจสร้าง membership proof ของตัวเองได้ จึงเป็น trust boundary ของ operator ไม่ใช่ legal identity, official Dota party proof หรือ E2EE

Redemption ใช้ fixed broker URL, signed raw body และ one-use nonce/ticket ไม่มี redirects Broker ล็อกและตรวจ live sender/recipient sessions, friendship, blocks, controls และ expiry อีกครั้งก่อน consume แล้ว relay ตรวจ owner/generation/room/capacity หลัง await ก่อนเพิ่มสมาชิกโดยไม่มี await คั่นการตรวจและ admission

**Ordering:** session deletion/block/remove ที่ commit ก่อน redemption ป้องกัน admission; redemption ที่ได้ locks และ commit ก่อนอนุญาตได้หนึ่งครั้ง และ block ภายหลังไม่ย้อนเตะคนที่เข้าห้องแล้ว การ consume ticket ไม่ยืนยัน relay admission ถ้าห้องเปลี่ยน/เต็มหลัง consume ต้องรับเชิญใหม่อย่างตั้งใจ

### 5.3 ขอบเขตการป้องกันและ protocol upgrade

Proof ไม่ refresh membership heartbeat หรืออายุ GSI; social traffic ไม่ทำให้ health เก่าดูสด Limits เดิมของ relay ยังคง 100 rooms/5 members และมี social joins in flight ≤32

CR-038 เพิ่ม authoritative `roomGeneration` ใน Membership/RoomSnapshot/rotate และเพิ่ม `relayUrl`/`roomGeneration` ใน PartyView ต้องอัปเดต relay และ native คู่กัน ชุดเก่า/ใหม่ที่ schema ไม่ตรงปฏิเสธอย่างชัดเจน ไม่ default generation หรือ downgrade เงียบ Rotation invalidates future code/social admission แต่ไม่เตะสมาชิกที่อยู่แล้ว

## 6. Acceptance matrix

Checkbox เป็นผลหลักฐาน ไม่ใช่สิ่งที่ปิดได้เพียงเพราะมี requirement หรือ code ชุดหลักฐานรวมอยู่ใน [[g-party-social-operations]]

- [x] `FRIENDS-AC-001` Actual PostgreSQL migration, RLS/grants, safe projection, session auth, caps/reciprocal/direction/idempotency ผ่านด้วย runtime role
- [x] `FRIENDS-AC-002` Separate DB connections พิสูจน์ cap races, block-first/redeem-first, session-delete ordering, post-lock expiry, replay และ denial accounting
- [x] `FRIENDS-AC-003` Real Edge handler → SQL → DTO และ signed redeem → one-use ticket; strict bounds, canonical HMAC vector, origin/expiry/unknown-key errors; existing IAM AAL2/audit regressions ผ่าน
- [x] `FRIENDS-AC-004` Relay/native real HTTP tests ครอบคลุม owner loss/rotate/full/in-flight ceiling, no heartbeat refresh, expected room mismatch และ cancelled admission cleanup
- [x] `FRIENDS-AC-005` Frontend strict DTO, consent reset, account/scope epochs, acknowledged unlink, stale online expiry, action direction และ failure states ผ่าน
- [ ] `FRIENDS-AC-006` Guest route/local core regression, frontend build/lint/typecheck, portable Rust/relay/Deno/SQL และ Windows CI checks ผ่านบน PR head
- [ ] `FRIENDS-AC-007` Fresh independent review ปิด confirmed blockers และ protected PR merge verified
- [ ] `FRIENDS-AC-008` Live Google signup/signout/revoke และ production-equivalent HTTPS broker/relay configuration/rotation/cleanup ตรวจจริงโดยผู้ดูแล
- [ ] `FRIENDS-AC-009` Windows native สองผู้เล่น/สองจอ, current Dota GSI, focus, unknown-state UX และแผนที่ใหญ่ ตรวจจากการใช้งานจริง
- [ ] `FRIENDS-AC-010` CPU ≤10%/1 s, aggregate RAM ≤900,000,000 bytes, FPS impact ≤3%, G-Signal p50 ≤250 ms และทุก sample ≤300 ms มี measured evidence ตาม MVP-006

## 7. Rollout และ rollback

Source merge ไม่ทำ migration/deploy/release ให้เอง Friends/settings/presence ใช้ได้เมื่อ account backend พร้อมแม้ยังไม่มี social relay โดย `relayOrigin:null`; proof/link/invites/redemption ต้องแสดง unavailable จนตั้งค่า registered relay ถูกต้อง ไม่มี hosted URL ที่แต่งขึ้นหรือ client guest URL ที่ใช้แทน readiness

คู่มือ [[g-party-social-operations]] แยก migration, least-privilege configuration, service readiness, cleanup, key rotation และ rollback Key replacement อย่างเดียวไม่ revoke opaque DB tickets; ต้อง disable admission และ revoke pending invitations/tickets/challenges ก่อนเปลี่ยน key ทั้งสองฝั่ง

Rollback ปิด social functions/config/UI ก่อน รักษา guest routes และข้อมูลความสัมพันธ์ไว้ การลบตารางต้องมี reviewed migration แยก ห้ามแก้ด้วยการเปิด RLS หรือเพิ่ม service-role access ไม่รวม chat/voice/community/screen share/Steam friend import ในรอบนี้

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-11-01 | Define optional Friends/presence/verified profile links and targeted invitations, separate consent/privacy, transaction ordering, protocol upgrade and evidence gates under CR-038. |
| 0.1.1 | 2026-11-01 | Record implemented source and reviewed frontend lifecycle/lease corrections while keeping final CI/merge and live acceptance receipts separate. |

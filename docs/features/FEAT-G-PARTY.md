---
title: "FEAT: G-Party — Cooperative own-GSI status sharing"
doc_id: "FEAT-G-PARTY"
status: "active"
version: "0.2.0"
updated: "2026-11-01"
owner: "G-Maiden"
source_of_truth: true
complexity: "C-3"
risk: "HIGH"
related_docs: ["mvp-decisions", "product-requirements", "software-requirements-specification", "G-SERIES-DATA-LINEAGE", "CR-037-party-gsi-own-stat-sharing", "2026-11-01-g-party-gsi-sharing", "FEAT-G-FRIENDS", "ADR-20", "CR-038-party-friends-presence-invitations"]
---

# FEAT-G-PARTY — Cooperative own-GSI status sharing

> **Module:** G-Party · **Phase:** 3 (การเชื่อมแหล่งข้อมูลและ consumer ของส่วนขยายนี้ ไม่ใช่การเปลี่ยน priority ของ MVP เดิม)
> **สถานะ:** base source merged ผ่าน PR #104; CR-038 เพิ่ม optional G-Friends และ required roomGeneration schema ตาม §5–6. Native runtime/live Dota/สองจอ/resource acceptance ยังรอหลักฐานของตน

## 1. เป้าหมายและอำนาจตัดสินใจ

ผู้ใช้อนุญาตในบทสนทนาวันที่ 2026-11-01 ให้พัฒนาการแชร์ own-GSI ระหว่างสมาชิกปาร์ตี้และอัปเดตเอกสาร เพื่อดู HP/MP/alive/respawn ของเพื่อนโดยไม่ต้องเลือกกล้องหรือเลือกฮีโร่เพื่อน. [[CR-037-party-gsi-own-stat-sharing]] บันทึกขอบเขตคำสั่งนี้; protocol และรายละเอียดการป้องกันด้านล่างเป็นการตัดสินใจ implementation ของ assistant ไม่ใช่คำยืนยันว่า Owner ตรวจทุก field แล้วหรือผ่าน runtime acceptance.

G-Party เป็น **ส่วนขยายที่ Owner สั่งเพิ่ม** ไม่เพิ่ม P0 ให้ MVP เดิมโดยปริยาย ไม่เปลี่ยน 62 parent task ของ [[mvp-backlog]] และไม่ทำให้ local core ต้องพึ่งบัญชีหรือเครือข่าย. ใช้เฉพาะผู้เข้าร่วมที่กดยินยอมและเปิดใช้งานเอง; ไม่มีการอ่าน stats ของผู้เล่นที่ไม่ได้เข้าร่วม และไม่เติม roster ให้ครบ 5 คนด้วยค่าจำลอง.

## 2. ขอบเขตและ consent

- `PARTY-FR-001` สร้าง/เข้าห้องต้องระบุ relay URL, display name และ **ติ๊ก consent อย่างชัดเจนพร้อมกดเปิดใช้ใน action เดียวกัน**. Native ปฏิเสธ `consent=false` ก่อน request เครือข่ายใด ๆ. การรู้ invitation หรือการ sign-in ไม่ใช่ consent.
- `PARTY-FR-002` รอบนี้ไม่มี view-only mode. ข้อความก่อน connect ต้องบอกว่าเมื่อเปิดใช้จะส่งเฉพาะ own stats ที่อนุญาต พร้อม room-scoped match/team binding ผ่าน relay ที่เลือกให้สมาชิกห้อง. ต้องยินยอมใหม่ในแต่ละการเปิดแอป/การเชื่อมต่อโดยตั้งใจ ไม่มี auto-join ตอน startup และไม่บันทึก room credentials ลงดิสก์.
- `PARTY-FR-003` Guest create/join ด้วยรหัสใช้ได้โดยไม่ต้องมี Google/GID/Steam account session ของ G-Maiden. Optional Friends/targeted invitations ใช้ Google session ตาม [[FEAT-G-FRIENDS]] โดยไม่เปลี่ยน guest route. การตรวจ active local Steam owner เพื่อยืนยัน source เป็นการตรวจในเครื่อง ไม่ใช่ app account gate และไม่ส่ง SteamID ออกไป.
- `PARTY-FR-004` Leave หยุด sharing ล้าง credentials/peer state ในเครื่องทันที และ fence งานที่ค้าง; ลบ membership ที่ relay แบบ best effort. เมื่อ offline ห้ามอ้างว่าปลายทางถูกลบทันที: peer health หมดความสดไม่เกิน 2 วินาทีและ membership หมดอายุหลังไม่ sync 30 วินาที.
- `PARTY-FR-005` ห้องมีได้ไม่เกิน 5 คนรวม owner อายุไม่เกิน 4 ชั่วโมง. Owner leave/หมดอายุทำให้ห้องปิด. Owner kick สมาชิกได้และหมุน invitation ได้; rotate เพิ่ม authoritative roomGeneration และปิดการ join ในอนาคตด้วย code เก่าหรือ social proof/invite/ticket generation เก่า ไม่ revoke สมาชิกที่อยู่แล้ว. ผู้ถูก kick ที่ยังมี invite ใช้ได้อาจกลับมา join จึงต้องแนะนำให้ rotate ด้วย.

Consent ของ G-Party แยกจาก account consent และ AI/cloud-context consent ใน [[mvp-decisions]] MVP-005 โดยสมบูรณ์. ไม่เพิ่ม telemetry, public profile, match contribution, AI prompt หรือการเผยแพร่สู่ชุมชนจาก action นี้.

## 3. Source admission และ allowlist

`PARTY-FR-006` ใช้เฉพาะ production GSI ที่ผ่านเงื่อนไขทั้งหมด: Dota appid `570`, `player.activity="playing"` ที่มีจริง, `local_player_verified=true` จาก active local Steam owner ที่ตรงกัน, match ID เป็น canonical positive decimal จริง, ทีม `radiant`/`dire` และ state `PRE_GAME` หรือ `GAME_IN_PROGRESS`. Spectator, activity หาย, identity ไม่ยืนยัน, match/team ไม่ทราบ หรือค่าไม่ครบต้องไม่สร้าง sample. Production rejection ทั้ง invalid JSON และ invalid schema ต้อง invalidate party source เดิมทันที; ไม่มีการส่งค่าก่อนหน้าอีกจนมี observation ใหม่ที่ผ่านเกณฑ์.

| Field ของ Stats | ขอบเขตและความหมาย |
| --- | --- |
| `hero` | `npc_dota_hero_` ตามด้วย `[a-z0-9_]{1,100}` ของผู้เล่นเจ้าของ GSI |
| `level` | integer 1–30 |
| `hp`, `maxHp` | integer; HP 0–100000, maxHP 1–100000 และ HP ≤ maxHP |
| `manaPercent` | integer 0–100; MP ใน slice นี้เป็นเปอร์เซ็นต์ ไม่ใช่ค่า mana/maxMana absolute |
| `alive` | boolean ที่มีจริงใน source ไม่อนุมานจาก HP หรือ countdown |
| `respawnSeconds` | integer 0–600 ที่มีจริง; ไม่สร้างค่าคาดเดาเมื่อ field หาย |

ต้องมีทุก field ที่ระบุและค่า valid; ห้ามใช้ lenient parser defaults เพื่อเปลี่ยน missing เป็น 0/false. Export hook อัปเดต latest slot ที่ bounded เพียงหนึ่งรายการ ไม่ await network และไม่ spawn task ต่อ GSI tick. ตรวจ owner/session/team อีกครั้งก่อน publish; เมื่อเปลี่ยนให้ทิ้ง cached source ก่อนส่งหรือแสดง peer.

`PARTY-SEC-001` สร้าง DTO จาก allowlist เท่านั้น ไม่ serialize raw GSI/GameTick. Raw match ID และ SteamID อยู่ในเครื่อง. `matchKey` เป็น lowercase SHA-256 hex ของ UTF-8 `G-Party/v1\0${roomId}\0${canonicalMatchId}` โดย `\0` หมายถึง NUL byte. key เปลี่ยนเมื่อ room เปลี่ยน; เป็น scoped pseudonym/equality fence **ไม่ใช่ anonymity หรือหลักฐานยืนยันเกมเชิง cryptographic**.

`PARTY-SEC-002` ส่งได้เพิ่มจาก Stats เฉพาะ room/member/session protocol metadata, `sequence`, `matchKey`, `team`, `sourceAgeMs` และ display name ที่ผู้ใช้ใส่. ห้าม raw GSI, raw match ID, SteamID, enemy/CV/position/image, item/KDA/gold/net worth, Voice audio/transcript/question, Memory, G-Log/history/replay, account/security data หรือ local diagnostics. ข้อมูล peer ที่รับมาไม่มี consumer ไปยัง AI, log/history, Memory, public profile หรือ analytics ใน slice นี้.

## 4. Transport และวงจรอายุ

Relay คือ Node ≥22 ใช้ built-in HTTP/crypto ไม่มี runtime package dependency และเก็บข้อมูลใน memory เท่านั้น. ค่าเริ่มต้น bind `127.0.0.1:8787`; operator เลือก `G_PARTY_HOST`/`G_PARTY_PORT` ได้. Desktop remote ใช้ **HTTPS ผ่าน TLS proxy ที่ตั้งค่าถูกต้อง**; HTTP รับเฉพาะ literal loopback `127.0.0.1`/`[::1]` สำหรับทดสอบในเครื่อง. งานนี้ไม่มี deployment หรือบริการ hosting ที่เปิดให้แล้ว.

Native reqwest เป็นเจ้าของ transport: ไม่ follow redirect, ไม่รับ URL credential/query/fragment, รับเฉพาะ root origin ของ HTTP(S), ไม่รับ path อื่นนอกจาก `/`, remote HTTP ต้องปฏิเสธ. Timeout ต่อ request 1500 ms; response ไม่เกิน 32 KiB. WebView เรียก trusted native commands ไม่ส่ง arbitrary network requests. ห้าม log tokens หรือ raw request/response body.

`PARTY-FR-007` worker async อยู่นอก GSI/G-Signal hot path มี sync in flight ได้หนึ่งรายการ loop แบบ sequential cadence ปกติ 500 ms. Transient failure ล้างหรือทำ peer health เป็น unavailable และ retry แบบ bounded 0.5–5 s. หลัง transport failure ต้องส่งและรอ **null scope/sample sync probe** สำเร็จก่อน resume samples เพื่อไม่ให้ late timed-out request ทำลายลำดับเวลา. HTTP 401/404/410 ปิด membership และต้อง join ใหม่โดยตั้งใจ; ไม่จับ global native lock ระหว่าง network await.

`PARTY-FR-008` ทุก leave/join generation change ทิ้ง late replies และ cached samples. Late successful join ต้อง best-effort delete orphan membership. Source cache เก็บ latest ได้ไม่เกิน 10 s แต่ส่ง sample ที่ไม่เป็น null ได้เฉพาะอายุ ≤2000 ms. Null scope/sample ล้าง publication เดิมที่ relay ไม่ใช่ “ไม่มี update”.

`PARTY-FR-009` freshness ใช้ monotonic elapsed durations ไม่เปรียบเทียบ wall-clock ข้ามเครื่อง. Relay คิด `effective age = sourceAgeMs + publisherUploadBound + elapsed since receipt`. `publisherUploadBound` คือช่วงเวลาทั้งหมดตั้งแต่ admission/sync response ก่อนหน้าของ publishing member เพื่อครอบคลุมเวลาส่งขาขึ้น; administrative requests ไม่เลื่อน reference นี้. Receiving native บวก whole request round-trip elapsed และ UI บวก elapsed หลังรับ snapshot. Bounds นี้ conservative จึงทำข้อมูลหมดอายุเร็วกว่าความจริงได้; polling ไม่ refresh อายุ GSI เก่า. Live เฉพาะอายุ ≤2000 ms รวมขอบ; เกินนั้น sample เป็น null พร้อม stale. Network loss/local source invalid ต้องไม่คง peer vitals ว่า live และ UI ต้องหมดอายุเองแม้ IPC หยุด.

## 5. HTTP protocol v1

Unknown keys ทุกระดับถูกปฏิเสธ. roomId/memberId เป็น random 16 bytes แสดงด้วย 32 lowercase hex; memberToken/invite secret เป็น random 32 bytes แสดงด้วย 64 lowercase hex. Invite คือ `GMP1.<roomId>.<secret>`; ไม่ใส่ credentials ใน URL/query/log. Display name trim แล้วไม่ว่าง ไม่เกิน 32 Unicode code points ไม่มี control characters และต้องเป็น well-formed Unicode (ปฏิเสธ lone UTF-16 surrogate เพื่อไม่ให้ชื่อสมาชิกทำ snapshot ของ typed Rust client อ่านไม่ได้).

| Request | Body / สิทธิ์ | ผลสำเร็จ |
| --- | --- | --- |
| `POST /v1/rooms` | `{displayName}` | 201 Membership; owner ได้ invite |
| `POST /v1/rooms/join` | `{invite,displayName}` | 201 Membership; invite=null |
| `POST /v1/rooms/:roomId/sync` | Bearer memberToken; `{sequence,scope,sample}` | 200 RoomSnapshot |
| `DELETE /v1/rooms/:roomId/members/me` | Bearer memberToken | 204; owner leave ปิดห้อง |
| `DELETE /v1/rooms/:roomId/members/:memberId` | owner เท่านั้น; kick owner ไม่ได้ | 204 |
| `POST /v1/rooms/:roomId/invite` | owner เท่านั้น; `{}` | 200 `{invite,roomGeneration}` |
| `GET /health` | ไม่คืนข้อมูลห้อง | `{ok:true,protocol:1}` |

Membership มี `roomId, memberId, memberToken, ownerId, invite, expiresInMs, roomGeneration`. CR-038 กำหนด roomGeneration เป็น positive safe integer เริ่ม 1 และเพิ่มเมื่อ rotate; ต้องอัปเดต relay/native คู่กันและปฏิเสธ schema เก่าที่ field หายโดยไม่เติม default. `sequence` เป็น positive safe integer ที่เพิ่มต่อ membership; ค่าซ้ำ/ย้อนกลับถูกปฏิเสธ. `scope` เป็น null หรือ `{matchKey: string64hex,team:"radiant"|"dire"}`. `sample` เป็น null หรือ Stats พร้อม `sourceAgeMs` เป็น nonnegative integer ≤10000; non-null sample ต้องมี non-null scope.

RoomSnapshot มี `roomId,selfId,ownerId,expiresInMs,members,roomGeneration`. สมาชิกแต่ละรายมี `memberId,displayName,isOwner,state,ageMs,sample`. ข้อมูลชื่อ/ID/owner มองเห็นภายในห้อง; raw scope ไม่ส่งกลับ. Relay คืน Stats/age เฉพาะ caller และ source มี matchKey **และ** team ตรงกัน. Scope หาย → `waiting` และ sample/age=null; scope ต่าง → `different_match` และ sample/age=null ไม่เผย hero/vitals; เกิน TTL → `stale` และ sample=null; ผ่าน → `live` พร้อม Stats.

ข้อผิดพลาดเป็น JSON `{error: code}` เท่านั้น: `invalid_request` 400, `unauthorized` 401, `room_unavailable` 404, `room_full` 409, `forbidden` 403, `replayed_sequence` 409, `rate_limited` 429, `capacity` 503; unexpected internal error คืน `unavailable` 500 โดยไม่มี raw exception. Native รับเฉพาะ error code ที่อยู่ใน allowlist และตรง HTTP status; ข้อความอื่นเป็น generic error.

`PARTY-SEC-003` request ≤4096 bytes, ไม่เกิน 100 ห้อง, per-IP create ≤10/min และ join ≤20/min, limiter entries ≤1024, per-member sync ห่างอย่างน้อย 200 ms. ไม่เชื่อ `x-forwarded-for` โดยไม่มี deployment design ใหม่. ไม่เปิด CORS; ปฏิเสธ nonempty Origin; responses เป็น no-store และไม่มี room inventory endpoint.

## 6. Native IPC และพฤติกรรมผู้ใช้

Commands จำกัด trusted Control WebView origin+label: `party_connect({relayUrl,displayName,invite:null|string,consent:boolean})`, `party_get_state()`, `party_leave()`, `party_kick({memberId})`, `party_rotate_invite()`. ไม่ส่ง memberToken ข้าม IPC.

PartyView มี `status` (`idle|connecting|connected|reconnecting|closed|error`), `roomId,selfId,ownerId,invite,expiresInMs,error,members` และ required nullable `relayUrl,roomGeneration`. Connected ต้องมี validated relay origin และ positive roomGeneration ของ relay แยกจาก native local cancellation epoch. Native get_state คำนวณอายุใหม่ก่อนคืน; error เป็น sanitized code. Connect สำเร็จหลัง relay admission จริง. UI แสดง consent, create/join, leave, owner controls และสถานะเพื่อนที่เข้าร่วมจริง; การดู HP/MP ไม่ต้องเปลี่ยน camera selection. ไม่ใช้ mock fallback และไม่เรียก “allies ทั้งทีม” ถ้ามีสมาชิกเพียงบางคน.

พื้นที่ใช้งาน slice นี้คือ G-Party ภายใต้ Live พร้อม status cards ใกล้ minimap บนจอที่สอง. คำสั่งล่าสุดใน CR-038 ให้ใช้ design tokens เดิมและออกแบบเลย์เอาต์ใหม่รอบแผนที่ใหญ่; source checks ไม่รับรองการรองรับสองจอจริง. ปุ่ม/แสดงสถานะไม่ดึง focus จากเกมเอง.

### 6.1 Optional G-Friends bridge (CR-038)

[[FEAT-G-FRIENDS]] เพิ่ม `party_social_proof({challenge,relayUrl})` และ `party_join_social({ticket,relayUrl,roomId,displayName,consent})` ด้วย trusted Control checks เดิม Native ไม่คืน memberToken และไม่ส่ง account JWT/GID/UUID ไป relay Social join ต้อง idle-only และ consent ใหม่ ห้ามใช้ connect path ที่ออกจากห้องเดิมเอง; response ต้องตรง expected roomId ก่อนแสดง connected

Registered relay เพิ่ม member-authenticated `POST /v1/rooms/:roomId/social-proof` และ anonymous-ticket `POST /v1/rooms/social-join`. Proof ไม่ต่อ heartbeat/sample age และ social-join ต้อง revalidate owner/generation/capacity หลัง await signed broker redemption. สัญญา exact DTO/HMAC/limits/replay และ account-room profile binding อยู่ใน [[2026-11-01-g-party-friends-design]]. Custom relay ที่ไม่ registered ยังคง guest code ได้แต่ social controls unavailable

Private friendships/temporary profile links/invites อยู่ใน account backend ตาม MVP-005B ไม่ใช่การ persist peer stats หรือ room credentials; ห้ามนำข้อมูล social หรือ received stats ไป AI/Memory/G-Log การเป็นเพื่อนไม่ให้สิทธิ์อ่าน GSI จนเข้าห้องโดยยินยอมและผ่าน source/match/team/freshness gates เดิม

## 7. Trust, privacy และ resilience

- Relay operator อ่าน shared stats ได้; TLS ป้องกันระหว่างทาง **ไม่มี end-to-end encryption claim**. Cooperative client อาจโกหก stats ได้ และ protocol ไม่พิสูจน์ official Dota party membership.
- Rooms, tokens, source slot และ received samples อยู่ใน memory; ไม่มี durable room/profile/stat history ที่ relay, telemetry หรือ credentials persistence. Optional private social graph และ temporary account-room binding ที่ broker เป็น route แยกตาม [[FEAT-G-FRIENDS]] ไม่เก็บ gameplay/room secrets. Restart ล้างสถานะ; fresh consent/activation ใช้เปิดใหม่.
- Invite เป็นความลับที่แบ่งปันให้ผู้รับที่ตั้งใจ. Kick และ rotate มีผลต่างกันตาม §2; membership/health expiry เป็นเพดานหลังหลุดการเชื่อมต่อ ไม่อ้าง remote erase ทันที.
- Relay/network/account failure ไม่หยุด local GSI/CV/G-Signal/Voice/Memory/Log. ไม่เพิ่ม remote dependencies ใน critical warning path.
- CPU/RAM/FPS และ latency targets ของ [[mvp-decisions]] ไม่เปลี่ยน: CPU ≤10% ทุก 1 s, aggregate Working Set ≤900000000 bytes, FPS impact ≤3%, G-Signal p50 ≤250 ms/ทุก sample ≤300 ms. หากรัน relay บนเครื่องเล่นเดียวกัน ต้องนับ resource ของ relay ในการวัดด้วย. Cadence G-Party ไม่ใช่การอ้างว่าผ่านงบ G-Signal.

## 8. Acceptance และหลักฐานที่ยังต้องเก็บ

- [ ] `PARTY-AC-001` consent=false ไม่มี network request; create/join ใช้ checked consent+activation; restart ไม่ auto-join และไม่พบ credentials บน disk.
- [ ] `PARTY-AC-002` source fixture ผ่านเฉพาะ app570/playing/verified local owner/real match/team/live state/ครบ valid Stats; camera-selected/spectator/unverified/malformed/missing ถูกปฏิเสธ.
- [ ] `PARTY-AC-003` รัน relay และ sender/receiver จริงบน socket; same room/match/team ได้ HP/MP/alive/respawn, different room/match/team และ missing scope ไม่ได้ hero/vitals.
- [ ] `PARTY-AC-004` serializer ส่งเฉพาะ allowlist; ตรวจ raw matchID/SteamID/rawGSI/CV/Voice/Memory/Log/account fields ไม่ออกใน normal/error/retry/cancel paths และไม่ถูกส่งต่อ AI.
- [ ] `PARTY-AC-005` monotonic age/publisherUploadBound/admin-reference invariance/receiver RTT, stale boundary 2000/2001 ms, null publication/probe หลัง transport failure, disconnected UI, reordered sequence และ source/session/owner/team changes ไม่คืนข้อมูลเก่าว่า live.
- [ ] `PARTY-AC-006` leave ระหว่าง connect/sync, late join cleanup, owner expiry/leave, kick/rotate/rejoin, max5, 30 s membership และ 4 h room TTL ทำงานตามสัญญา.
- [ ] `PARTY-AC-007` URL/TLS/redirect/origin/auth/body/response/rate/capacity limits และ trusted IPC ถูกทดสอบด้วย positive/negative controls.
- [ ] `PARTY-AC-008` UI lifecycle/consent/stale/error/keyboard checks ผ่านโดยไม่สร้าง mock roster หรือ focus steal.
- [ ] `PARTY-AC-009` Windows native build และสอง client ใน live Dota พิสูจน์ own-stat updates โดยไม่ camera-select; Linux/socket fixtures ไม่แทนหลักฐานนี้.
- [ ] `PARTY-AC-010` resource/FPS/G-Signal non-interference บน matrix จริง พร้อม source/build/environment; SKIP ไม่ใช่ PASS.

ผลและข้อจำกัดบันทึกที่ [[2026-11-01-g-party-gsi-sharing]] ตามจริง. การติ๊กในแผนต้องอ้าง evidence ที่ได้แล้ว ไม่ปิด native/live gates จาก unit หรือ HTTP synthetic tests.

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-11-01 | เพิ่ม G-Party owner-authorized extension: explicit per-launch consent, narrow own-stat protocol, in-memory relay, match/team/freshness fences และ pending acceptance; ไม่ขยาย AI allowlist. |
| 0.2.0 | 2026-11-01 | Add CR-038 required authoritative roomGeneration/PartyView origin schema and optional social native/relay bridge; preserve guest consent, source allowlist and separate live acceptance. |

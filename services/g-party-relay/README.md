---
title: "G-Party relay — การรันและขอบเขตการใช้งาน"
doc_id: g-party-relay-runbook
status: active
version: "0.2.0"
updated: "2026-11-01"
owner: G-Maiden
---

# G-Party relay

ตัวกลางสำหรับสมาชิกปาร์ตี้สูงสุด 5 คนที่เลือกแชร์ GSI ของตนเอง
ใช้ Node.js 22 ขึ้นไปและ built-in modules เท่านั้น ไม่มี package ที่ต้องติดตั้งเพิ่ม
สเปกและรายการข้อมูลที่อนุญาตอยู่ใน
[FEAT-G-PARTY](../../docs/features/FEAT-G-PARTY.md)

## รันในเครื่องสำหรับพัฒนา

จาก root ของ repository:

```sh
node services/g-party-relay/server.mjs
```

ค่าปริยายฟังที่ `127.0.0.1:8787` ในแอป G-Maiden เปิด Live → G-Party
ใส่ `http://127.0.0.1:8787` เป็น relay URL ตั้งชื่อเล่น อ่านและติ๊กยินยอม
จากนั้นสร้างห้องหรือเข้าด้วยรหัสเชิญ `GMP1...`
รหัสสมาชิก/ห้องเก็บในหน่วยความจำและไม่เชื่อมต่อใหม่อัตโนมัติเมื่อเปิดแอปครั้งถัดไป

URL loopback ใช้ทดสอบในเครื่องเดียวเท่านั้น เพื่อนอีกเครื่องใช้ URL นี้เข้าถึงเครื่องของเราไม่ได้
แอปแต่ละเครื่องต้องมี GSI ของ Dota 2 ตนเองและผ่านการตรวจว่าเป็นผู้เล่นเจ้าของเครื่อง
ไม่มีการอ่าน HP เพื่อนจาก GSI ของเจ้าของห้อง

## ใช้กับเพื่อนผ่านอินเทอร์เน็ต

ผู้ดูแลต้องรัน relay บนเครื่องที่เข้าถึงได้ และวาง HTTPS reverse proxy ที่มีใบรับรองถูกต้อง
ด้านหน้า โดย proxy ส่งต่อไปยัง loopback `127.0.0.1:8787`
สมาชิกทุกคนใช้ HTTPS origin เดียวกัน เช่น `https://party.example.com`
แอปไม่รับ path, query, URL credentials หรือ redirect และไม่ยอมส่งผ่าน HTTP ที่เป็น remote host
ไม่ต้องเปิดพอร์ต GSI `3000` ของผู้เล่นสู่อินเทอร์เน็ต

ไม่มี public relay ที่ถูก deploy หรือรับรองโดยการเพิ่มโค้ดชุดนี้
ห้ามใช้ตัวอย่าง domain เป็นบริการจริง หรือกล่าวว่าผ่าน native/live-game acceptance แล้ว

ตัวแปรสำหรับผู้ดูแล:

| ตัวแปร | ค่าเริ่มต้น | ความหมาย |
| --- | --- | --- |
| `G_PARTY_HOST` | `127.0.0.1` | IP ที่ HTTP backend bind; คง loopback เมื่อ proxy อยู่เครื่องเดียวกัน |
| `G_PARTY_PORT` | `8787` | TCP port 1–65535 |

ตั้ง request body limit ของ proxy ไม่เกิน 4096 bytes สำหรับ API และ request timeout ประมาณ 5 วินาที
ปิด access/body/header logging ที่อาจบันทึก `Authorization` หรือข้อมูลปาร์ตี้
อย่าเปิด CORS หรือแปลง relay เป็น API สำหรับหน้าเว็บทั่วไป
ตัว relay ไม่เชื่อ `X-Forwarded-For`: เมื่อใช้ proxy สมาชิกจะใช้ IP quota ร่วมกัน
เพียงพอสำหรับกลุ่มส่วนตัว แต่การให้บริการสาธารณะหลายกลุ่มต้องออกแบบ quota และการปฏิบัติการเพิ่ม

## ความเป็นส่วนตัวและการหมดอายุ

- Relay อ่านข้อมูลที่แชร์ได้ การใช้ HTTPS ไม่ใช่ end-to-end encryption
- ข้อมูลในหน่วยความจำเท่านั้น ไม่มีฐานข้อมูล ไฟล์ประวัติ analytics หรือ request-body log
- เก็บ hash ของ invite secret/member token; secret ไม่อยู่ใน URL
- ห้องสูงสุด 100 ห้อง, ห้องละ 5 คน, อายุห้อง 4 ชั่วโมง
- สมาชิกที่ไม่ sync 30 วินาทีหมดสิทธิ์; เจ้าของออก/หมดอายุทำให้ห้องปิด
- แสดง HP/MP เฉพาะแมตช์และทีมตรงกันและอายุรวมไม่เกิน 2 วินาที
  คำนวณรวมขอบเขตเวลา upload, เวลาอยู่ที่ relay, เวลา request ของผู้รับ และเวลาแสดงใน UI
  การนับแบบเผื่ออาจซ่อนค่าเร็วกว่าความล่าช้าจริง
- ค่าเก่าไม่กลายเป็นคนตายและไม่ถูกต่ออายุด้วย heartbeat ของคนอื่น
  ค่าเก่าสุดถูกล้างจาก relay หลัง 10 วินาทีในการเก็บกวาดรอบถัดไป
- ออกจากห้องหยุดส่งและล้างค่าในเครื่องทันที หากเน็ตขาด การลบระยะไกลเป็น best effort;
  ค่าเก่าหมดความสดและสมาชิกหมดอายุตามกรอบข้างต้น
- เปลี่ยนรหัสเชิญกันการเข้าครั้งใหม่ด้วยรหัสเดิม แต่ไม่ไล่คนที่เข้ามาแล้ว
  หลังเตะคนที่รู้รหัสเดิม ให้เปลี่ยนรหัสด้วยหากไม่ต้องการให้เขาเข้ามาอีก
- ข้อมูลเพื่อนเป็นข้อมูลจาก client ของเพื่อน ไม่ใช่การยืนยันโดยเซิร์ฟเวอร์เกม
  Match key เป็น pseudonym เฉพาะห้อง ไม่ใช่การปกปิดตัวตนที่พิสูจน์ได้

## ตรวจสอบ

```sh
node --test services/g-party-relay/server.test.mjs
cargo test --manifest-path src-tauri/g-party/Cargo.toml --locked
```

ชุด HTTP tests ใช้ socket จริงบน loopback และข้อมูลจำลอง ไม่มีข้อมูลผู้เล่นจริง
ครอบคลุมการแบ่งห้อง/แมตช์/ทีม, token, sequence, อายุข้อมูลรวม upload,
การออก/เตะ/เปลี่ยนรหัส, ห้องเต็ม, expiry, body limit และ rate limit
ผล native Windows, Dota จริง, เครือข่ายหลายเครื่อง, FPS/CPU/RAM และภาพบนจอสองจอ
ต้องบันทึกแยกใน [implementation plan](../../docs/superpowers/plans/2026-11-01-g-party-gsi-sharing.md)

## Optional Friends registration (CR-038)

Guest create/join and local core need no account or social configuration. Friends proofs and
one-use invitations require one operator-registered HTTPS relay origin plus the authenticated
broker. No hosted service is created by this source change. A custom guest relay cannot assert
a GID through this registration.

Set all three relay values together using your secret manager (values below are placeholders):

| Variable | Required value |
| --- | --- |
| `G_PARTY_SOCIAL_RELAY_ORIGIN` | Exact normalized public HTTPS origin, such as `https://relay.example.invalid`, without a trailing slash, path, query or credentials |
| `G_PARTY_SOCIAL_HMAC_KEY` | 64 lowercase hexadecimal characters, decoded as a 32-byte key; the same secret configured at the broker |
| `G_PARTY_SOCIAL_REDEEM_URL` | Fixed HTTPS URL of `/functions/v1/g-party-social-redeem` on the configured broker; never provided by a client |

Missing/invalid configuration makes social proof/join return `503 social_unavailable`; existing
guest endpoints continue to work. Production environment parsing rejects HTTP, including
loopback, for social registration/redemption. Tests inject an explicit loopback fixture only.
Both the relay redemption client and native HTTP client refuse redirects, bound response bodies,
and send no account JWT/GID/UUID to the relay. Redemption has a 3-second timeout. Incoming relay
requests retain the existing 4-KiB body cap; redemption responses have an 8-KiB cap. Social proof
allows 30/minute/member, social join 20/minute/IP, and at most 32 simultaneous pending joins.
After redemption, capacity and active owner/generation are checked synchronously before adding
a member. A consumed ticket with failed room admission cannot imply joined success.

`POST /v1/rooms/{roomId}/social-proof` requires the existing native member credential and exact
`{challenge}` body. It signs the current roster and authoritative generation with
`GPartySocialProof/v1\n`; it does not refresh membership heartbeat or source sample age.
`POST /v1/rooms/social-join` accepts only `{ticket,displayName}` and forwards a new nonce and
wall-clock timestamp to the fixed broker, signed over exact raw UTF-8 with
`GPartySocialRedeem/v1\n`. Neither endpoint stores an account mapping or audit history.

Deploy the updated relay and native client together before enabling registration. Membership,
sync snapshots and rotate replies now require `roomGeneration` (initialized at 1 and incremented
on each rotation). Old/new wire-schema combinations fail validation; there is no default to 1,
cancellation-epoch substitution or downgrade. Existing room members remain admitted across
rotation, while previous-generation social invitations/tickets cannot admit new members.
The native `party_join_social` command is Control-only, requires fresh GSI consent and an idle
or closed state, and never performs an implicit Leave. Unexpected-room or cancelled late
admissions are best-effort left using native credentials, which are never exposed to JavaScript.

Operator readiness checks before enabling social registration:

1. Apply the CR-038 private migration through authorized operations and configure the intended
   least-privilege runtime login/`IAM_DATABASE_URL`; do not grant direct private/auth table access.
2. Verify broker Google/session validation connectivity and authenticated social state; ordinary
   friendship/settings/presence actions remain available when `relayOrigin` is null.
3. Confirm normalized relay origin and key agree at broker and relay, HTTPS certificates verify,
   `/health` is reachable, and the fixed broker redemption endpoint is reachable without redirects.
4. Exercise fresh member proof, targeted invitation, explicit consent and admission against the
   intended environment; verify unavailable/replay/rotation failures and no request-body or secret logs.
5. Complete Windows native, live Google/revocation, live Dota, multi-machine, focus/two-monitor
   and CPU/RAM/FPS/G-Signal acceptance separately. Local synthetic tests do not establish these.

For HMAC rotation, first disable social admission (remove relay social configuration and disable
broker invitation/redemption operations). An authorized database operation must atomically revoke
all outstanding invitations, tickets and challenges for the registered origin. Replacing the HMAC
key alone does **not** revoke opaque tickets already stored in the database. Replace both keys,
verify origin/endpoint readiness, then enable social admission and issue new invitations. Existing
in-memory room membership is a separate capability; do not claim key replacement evicts members.

For rollback, disable social configuration/functions first, remove the new social UI entry points,
and coordinate relay/native schema rollback while retaining guest room routes. Preserve private
friendships until a separately reviewed data-removal migration; never expose private tables or
broaden service-role privileges. A source revert is not a live infrastructure rollback. This lane
has not deployed services, provisioned secrets or performed infrastructure rollback.

Run the complete local relay/native checks:

```sh
node --test services/g-party-relay/server.test.mjs services/g-party-relay/social.test.mjs
cargo test --manifest-path src-tauri/g-party/Cargo.toml --locked
cargo clippy --manifest-path src-tauri/g-party/Cargo.toml --all-targets --locked -- -D warnings
```

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.2.0 | 2026-11-01 | Document optional registered Friends proofs, admission, coordinated schema, readiness and key rotation/rollback |
| 0.1.0 | 2026-11-01 | เพิ่มวิธีรัน relay และข้อจำกัด HTTPS, consent, retention, freshness และการทดสอบ |

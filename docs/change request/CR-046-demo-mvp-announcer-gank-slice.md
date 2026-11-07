---
title: "CR-046 — First demo slice: Announcer Pack + Gank Meter + missing-hero alert"
doc_id: "CR-046-demo-mvp-announcer-gank-slice"
status: "accepted"
approved_by: "Boss (explicit approval in chat, 2026-11-07: อนุมัติตามร่าง; v0.1.2 amendment approved 2026-11-07: อนุมัติตามร่าง; v0.1.4 §9.3 approved 2026-11-08: อนุมัติตามร่าง)"
approved_date: "2026-11-07"
version: "0.1.5"
updated: "2026-11-08"
owner: "Boss"
complexity: "C-2"
risk: "MEDIUM"
related_docs: ["roadmap", "mvp-backlog", "mvp-delivery-plan", "mvp-decisions", "gann-event-media-contract", "software-requirements-specification"]
---

# CR-046: เดโมแรก (Announcer Pack + Gank Meter + แจ้งฮีโร่หาย)

> **สถานะ:** accepted 2026-11-07. Boss อนุมัติตามร่าง พร้อมมติตาม §9.1 **Risk: MEDIUM**: เปลี่ยนลำดับความสำคัญของ MVP และเพิ่ม announcer event ใหม่หนึ่งตัว.
> **v0.1.3 (accepted 2026-11-07):** Boss อนุมัติการแก้ข้อเท็จจริงเรื่องที่มาของเสียงเตือนใน §2 และมติ §9.2 ที่แทน §9.1(3): ใช้คลิป `gank`/`danger`/`revision` ใน VRZO pack revision 6.
> **v0.1.5 (accepted 2026-11-08):** Boss อนุมัติ §9.3: สร้างคลิปเตือนด้วยการโคลนเสียงในเครื่องแทนการอัดใหม่. §9.2 ข้ออื่นคงเดิม.
> ไม่เปลี่ยน G-Signal latency budget, privacy contract หรือกติกา GANN-only ของ [[gann-event-media-contract]].

## 1. เหตุผล

Boss กำหนด (2026-11-07) ว่าภาพแรกที่ผู้เล่นต้องเห็นคือ:
- เริ่มเกม → **แบนเนอร์ขึ้นพร้อมเสียงพากย์ไทย** แบบเกม HoN ใช้ VRZO announcer pack
- **Gank Meter** (แถบความปลอดภัย)
- **แจ้งเตือนฮีโร่ศัตรูหาย**

เหตุผลคือแอปอื่นส่วนใหญ่เป็นโค้ชที่แจ้งเตือนรก ส่วน announcer ที่เล่นเสียงพร้อมแบนเนอร์ตามเหตุการณ์ยังไม่มีใครทำ.
CR นี้กำหนด "เดโมแรก" (milestone **D1**) เป็นชุดย่อยของ MVP ที่ปิดก่อน. งานทั้งหมดอยู่ใน MVP-017, 018, 022, 025, 026 อยู่แล้ว
**จึงไม่ใช่งานเสริม** และไม่ขัดกับการ freeze จนถึง M6 ใน [[mvp-delivery-plan]].

## 2. สถานะปัจจุบัน (ตรวจ 2026-11-07, อ่านอย่างเดียว)

| ส่วน | ที่มีแล้ว | ช่องว่าง |
| --- | --- | --- |
| VRZO pack | Studio `vrzo-mapping-v5` (`ann_c4d92f17…`, revision 5): 14 event มีเสียง+แบนเนอร์ (match_start, first_blood, double/triple/ultra kill, rampage, streak 3–10) และ multi-kill ตรงจำนวนคิลทั้ง Dota และ HoN | ยังไม่ยืนยันว่า revision 5 ถูก import เข้าแอปที่ใช้เดโม (handoff ระบุว่า runtime owner ต้อง import ผ่าน Control) |
| คิลเดี่ยว `kill` | revision 5 ตั้งใจลบคลิปพิเศษของ HoN ที่เคยแทนไว้ | **เงียบ**: event ที่เกิดบ่อยที่สุดไม่มีเสียง |
| กลุ่มเตือน `gank`/`danger`/`revision` | G-Signal เล่นเสียงจาก critical cache เท่านั้น: `audio.rs` `critical_snapshot()` อ่านคู่ audio+video ที่ verified จาก GANN pack ที่เลือก (`try_voice_interrupt_cached_before` ใช้ cache นี้). **ไม่มี Maiden cached Thai line แยก** (แก้ข้อเท็จจริงใน v0.1.2) | pack VRZO ไม่มีคลิปกลุ่มนี้ → `capture.rs` เรียก `suspend_observation()` บันทึก `critical_audio_unready` แล้ว return **ก่อน** emit `gank-alert`: ไม่มีเสียง ไม่มีแบนเนอร์ Gank Meter ไม่ขึ้นระดับ 3. dev log 2026-11-07 พบ `phase=unmapped event=danger` |
| `hpLow`/`manaLow`/`levelUp`/`death`/`respawn`/`advice` | – | ไม่มีเสียงใน pack |
| Gank Meter | `FullOverlay.tsx` `gmeterLevel()` ระดับ 0–3 จาก missing count + gank phase | ยังไม่มีผลตรวจบนแมตช์จริง |
| ฮีโร่หาย | `capture.rs` emit `enemy-missing` (>5 s) | **ไม่ใช่ announcer event**: ไม่มีเสียงหรือแบนเนอร์ผูกได้ |
| จังหวะ multi-kill | – | ต้องตรวจในแมตช์จริง (CLAUDE.md: การนับคิลกระโดดจาก GSI ยังไม่พิสูจน์จังหวะ multi-kill) |
| ลิขสิทธิ์เสียง | `distribution: self_contained_filesystem` | ไม่มีข้อมูลสิทธิ์ใช้เสียง HoN/VRZO สำหรับการเผยแพร่ |

## 3. ขอบเขตเดโม D1

**In scope:**
1. Import และยืนยัน VRZO revision 5 ในแอปที่ใช้เดโม
   - preview ของ First Blood, Double Kill และ Rampage ต้องตรง
   - ต้องไม่มี generic Kill substitute
2. ตัดสินและทำเสียงของคิลเดี่ยวตาม §9.2
3. ยืนยันเส้นทางเสียงเตือน gank/danger/revision ของ G-Signal ให้มีเสียงในเดโมเสมอ (source ตาม §9.2: คลิปใน VRZO pack revision 6)
   - latency ≤300 ms คงเดิม
   - ไม่ใช้ SLM/WebView
4. เพิ่ม announcer event **`enemy_missing`** (group `warning`)
   - Native Rust เป็นเจ้าของ event เดียวกับที่ emit `enemy-missing` แล้ว
   - มี dedupe/cooldown ต่อฮีโร่
   - Overlay แสดงชิปฮีโร่ที่หาย
   - เสียง/แบนเนอร์ตาม §9.4
5. ตรวจ Gank Meter ระดับ 0–3 บนแมตช์จริง
   - unknown/no coverage ต้องไม่แสดงเป็น "ปลอดภัย" ตาม MVP-018
6. บันทึกวิดีโอเดโมหนึ่งแมตช์พร้อม receipt

**Out of scope:**
- `hpLow`/`manaLow`/`levelUp`/`death`/`respawn`/`advice` (คงเงียบได้ในเดโม)
- เปิดคลิป HoN พิเศษ 7 ตัว
- G-Voice, G-Master advice, Store, การแจกจ่ายสาธารณะ

## 4. สัญญา event `enemy_missing`

| หัวข้อ | สัญญา |
| --- | --- |
| เจ้าของ | Native Rust (G-Sentry/capture) เท่านั้น; Overlay ไม่สร้าง event ซ้ำ |
| Trigger | ฮีโร่ศัตรูที่เคยเห็นหายจาก minimap >5 s ภายใน capture coverage ที่ยืนยันแล้ว; ไม่มี coverage = ไม่ trigger |
| Dedupe | หนึ่งครั้งต่อฮีโร่ต่อช่วงที่หาย; cooldown รวม ≥10 s ระหว่างเสียง `enemy_missing` เพื่อไม่รก |
| Priority | ต่ำกว่า `gank`/`danger` (critical) และไม่ขัด G-Signal; ถ้า critical กำลังเล่น ให้ทิ้งเสียง `enemy_missing` นั้น |
| Media | ตาม GANN contract: ใช้ได้เฉพาะ mapping ใน pack ที่ verify แล้ว; ไม่มี mapping = แสดงชิป overlay อย่างเดียวและบันทึกเหตุผล |
| Privacy | event อยู่ในเครื่อง; ไม่เข้า cloud/G-Party |

## 5. Acceptance (D1)

**อัตโนมัติ:**
- [ ] Rust: `enemy_missing` trigger/dedupe/cooldown/priority, no-coverage ไม่ trigger, critical preempt ทิ้ง `enemy_missing`
- [ ] Rust: event list มี `enemy_missing` ใน group `warning`; GANN resolver คืน unmapped อย่างเงียบเมื่อไม่มี mapping
- [ ] Frontend: ชิปฮีโร่หาย และ Gank Meter ระดับ 0–3 รวม unknown state
- [ ] `cargo test`, clippy, tsc, eslint, vitest, doc gate ผ่าน

**ต้องใช้คนบนแมตช์จริง (Boss):**
- [ ] แอปที่ใช้เดโมแสดง VRZO revision 5 เป็น pack ที่เลือก
- [ ] First Blood, Double Kill และสตรีคหนึ่งระดับ: แบนเนอร์และเสียงตรงกัน ไม่ซ้ำ
- [ ] คิลเดี่ยวทำงานตาม §9.2
- [ ] หลัง import revision 6 log มี `phase=critical_ready` ครบ `gank`, `danger`, `revision` และไม่มี `critical_audio_unready`
- [ ] gank alert มีเสียงทุกครั้งที่แถบขึ้นระดับ 3 ภายใน ≤300 ms (วัดตาม MVP-006)
- [ ] เมื่อคาดผิด เสียง `revision` แก้คำเตือนกลางประโยคตาม Belief Revision
- [ ] ฮีโร่หาย >5 s แสดงชิป (และเสียงตาม §9.4) โดยไม่รก
- [ ] Gank Meter ไม่แสดงปลอดภัยเมื่อ capture ไม่มี coverage
- [ ] วิดีโอเดโม 1 แมตช์ + FPS drop ≤3% + RAM ≤900,000,000 bytes ตาม receipt

## 6. ความเสี่ยงด้านสิทธิ์

เสียงใน VRZO pack มาจาก announcer ของ HoN และเสียง VRZO. pack ไม่มีข้อมูลสิทธิ์ใช้งาน.
D1 ใช้ได้เป็น**เดโมภายใน**. การโพสต์หรือแจกจ่ายสาธารณะต้องได้สิทธิ์จากเจ้าของเสียงก่อน (ผูกกับ MVP-062 ที่ยัง DEFERRED) หรือใช้เสียงต้นฉบับที่เราอัดเอง.

## 7. ผลต่อแผน

- งานประมาณ **8–10 แต้ม** (import/verify S, `enemy_missing` M, คิลเดี่ยว S–M, ตรวจเส้นทางเสียงเตือน M, overlay chip S) + หนึ่ง live session
- ส่วนใหญ่ซ้อนกับ MVP-017/018/026 จึงเลื่อนวันรวมของ MVP ประมาณ **+0.5–1 สัปดาห์** (scenario กลาง ≈ 2027-02-17 ถึง 2027-02-20)
- เป้าหมาย D1: **2026-11-22** (สิ้นสัปดาห์ 2) ถ้าเริ่ม 2026-11-09
- ปรับ [[mvp-delivery-plan]] เพิ่ม milestone D1 หลังอนุมัติ

## 8. การประสานงาน

Repo หลัก `D:\G-Maiden` อยู่บน branch `fix/vrzo-visual-completion` และมีไฟล์ announcer/variant rotation ที่ยังไม่ commit (มีอีก session ทำอยู่).
งาน implementation ของ CR นี้ต้องเริ่มจาก worktree ใหม่บน `main` หลังงานนั้น merge หรือประสานเจ้าของก่อน. ห้ามแก้ไฟล์ใน worktree ของ session อื่น.

## 9. ข้อที่ขอให้ Boss ตัดสิน

1. **ขอบเขต D1 ตาม §3:** อนุมัติหรือแก้
2. **คิลเดี่ยว `kill`:**
   - (a) แบนเนอร์อย่างเดียว ไม่มีเสียง
   - (b) อัดคลิป "kill" ใหม่ในสไตล์ VRZO: แนะนำถ้าหาเสียงได้ทันเดโม
   - (c) ใช้คลิปพิเศษ HoN ที่ปิดไว้: **ไม่แนะนำ** เพราะ revision 5 ตัดสินแล้วว่าผิดความหมาย
3. **เสียงเตือน gank/danger:**
   - (a) ใช้ cached Thai line ของ Maiden ที่ G-Signal มีอยู่: แนะนำ เพราะไม่ต้องรอเสียงใหม่ (**v0.1.2: ทำไม่ได้** เพราะไม่มี line นี้ในโค้ด ดู §2)
   - (b) อัดคลิปเตือนในสไตล์ VRZO แล้วเพิ่ม mapping ใน pack
4. **ฮีโร่หาย:**
   - (a) ชิป overlay อย่างเดียว
   - (b) ชิป + เสียงสั้นตามกติกา §4: แนะนำถ้ามีคลิป; ถ้าไม่มีจะเป็น (a) อัตโนมัติ
5. **ผู้ชมเดโม:** ภายในเท่านั้น (แนะนำจนกว่าจะได้สิทธิ์เสียง) หรือเผยแพร่สาธารณะ
6. **วันเป้าหมาย D1:** 2026-11-22

### 9.1 มติ (2026-11-07, ตามข้อแนะนำในร่าง)

1. ขอบเขต D1 ตาม §3
2. คิลเดี่ยว: (b) อัดคลิป "kill" ใหม่ในสไตล์ VRZO ถ้าได้เสียงทันเดโม; ถ้าไม่ทันใช้ (a) แบนเนอร์อย่างเดียว. ห้ามใช้คลิปพิเศษ HoN ที่ revision 5 ปิดไว้
3. ~~เสียงเตือน gank/danger: (a) cached Thai line ของ Maiden ใน G-Signal~~ ถูกแทนด้วย §9.2 (v0.1.3)
4. ฮีโร่หาย: (b) ชิป overlay + เสียงสั้นเมื่อมี mapping ใน pack; ไม่มี mapping จะเป็นชิปอย่างเดียวอัตโนมัติ
5. ผู้ชมเดโม: ภายในเท่านั้นจนกว่าจะได้สิทธิ์เสียง
6. วันเป้าหมาย D1: 2026-11-22

### 9.2 แก้มติ §9.1(3) (accepted v0.1.3, 2026-11-07; แทน §9.1(3))

เหตุ: มติเดิม (a) ตั้งบนข้อเท็จจริงที่ผิด. โค้ดไม่มี cached Thai line ของ Maiden; เสียงเตือนมาจาก GANN pack อย่างเดียว และเมื่อ pack ไม่มีคลิป ระบบจะกด gank alert ทั้งหมด (ดู §2).
Boss เลือกในแชต 2026-11-07: "ก) เพิ่มคลิปเข้า pack".

มติ:
1. เสียงเตือน gank/danger/revision ใช้ (b): อัดคลิปเตือนสไตล์ VRZO สามตัว `gank`, `danger`, `revision` แล้วเพิ่ม mapping เป็น VRZO pack **revision 6** ผ่าน G-AnnStudio. แต่ละ event เป็นคู่ mixed WAV + silent WebM ที่ verified ตาม [[gann-event-media-contract]] และ import ผ่าน Control.
2. คลิป `revision` ต้องเป็นการแก้คำเตือนกลางประโยคตาม persona Belief Revision ("เอ๊ะ! เดี๋ยวก่อน!").
3. **ไม่เปลี่ยนโค้ด G-Signal**: ไม่เพิ่ม fallback ใน G-Maiden, latency ≤300 ms, pure Rust, ไม่มี SLM/WebView. ทางเลือก "แบนเนอร์/Gank Meter ขึ้นได้แม้ไม่มีเสียง" อยู่นอก D1 และต้องเป็น CR แยกถ้าต้องการ.
4. ถ้า revision 6 ไม่พร้อมภายใน 2026-11-22: เดโม D1 ส่วน gank alert ถือว่า**ยังไม่ผ่าน** และรายงานตามจริง. ห้ามแทนด้วยคลิปอื่นหรือ TTS.
5. ผู้ทำ: Boss/เจ้าของ Studio อัดเสียงและ author pack ใน workspace ของ Studio (นอก repo G-Maiden). งานใน G-Maiden มีแค่ตรวจ log `critical_ready` และ acceptance §5.
6. สิทธิ์เสียง: เหมือน §6 คือใช้เป็นเดโมภายในเท่านั้น.
7. ผลต่อแผน: เพิ่มงานอัดเสียงและ author pack ประมาณ S (1–2 แต้ม) ภายในงบ 8–10 แต้มเดิมของ §7.

### 9.3 ที่มาของเสียงเตือน: โคลนเสียงในเครื่อง (accepted v0.1.5, 2026-11-08)

เหตุ: ต้นฉบับในเครื่องไม่มีท่อนเตือนที่ตรงความหมาย. ไฟล์ที่ตรวจคือ `E:\VRZO-ANNOUNCER.mp4` (96 s) ซึ่งใช้ครบแล้วใน 35 คลิปของ pack, และ `audio/announcer/ann-pack01` (น้าค่อม, 120.7 s) ที่คลิปตัดขาดกลางประโยค.
ทดลองเมื่อ 2026-11-08: F5-TTS-THAI สร้างเสียงสไตล์ VRZO ได้ในเครื่องแบบออฟไลน์, ประมาณ 4 s ต่อคลิปบน RTX 3060. การถอดเสียงกลับอ่านได้เกือบทุกคำ.

มติ (แทนข้อ 1 และ 5 ของ §9.2 เฉพาะเรื่องที่มาของเสียง):
1. **วิธีสร้าง:**
   - คลิป `gank`, `danger`, `revision` สร้างด้วย F5-TTS-THAI (`VIZINTZOR/F5-TTS-THAI`, snapshot `af023c70…`) บนเครื่องนี้เท่านั้น ไม่ส่งเสียงหรือข้อความออกนอกเครื่อง.
   - เสียงต้นแบบคือคลิป VRZO ที่ผู้ใช้ยืนยันคำพูดแล้ว: `double_kill`, `mega_kill`, `rampage`.
2. **บทพูดเริ่มต้น** (ยาวไม่เกินประมาณ 3 s ต่อคลิป; Boss แก้คำได้ก่อน build):
   - `gank`: "เฮ้ย! ระวัง! มันมาแล้ว!"
   - `danger`: "อันตราย! ถอยก่อน!"
   - `revision`: "เอ๊ะ! เดี๋ยวก่อน! ไม่ใช่แล้ว"
3. **การตรวจรับก่อนเข้า pack:**
   - Boss ฟังและอนุมัติแต่ละคลิป.
   - ตัดช่วงเงียบหัวท้าย และปรับความดังให้ใกล้คลิปอื่นใน pack.
   - เป็นคู่ mixed WAV + silent WebM ที่ verified ตาม [[gann-event-media-contract]].
4. **Provenance:** pack revision 6 ต้องบันทึกต่อคลิปว่าเป็น**เสียงสังเคราะห์ (voice clone)**: โมเดล, seed, บทพูด, SHA-256 ของคลิปต้นแบบ และ SHA-256 ของผลลัพธ์. ห้ามติดป้ายว่าเป็นเสียงต้นฉบับของผู้พากย์.
5. **สิทธิ์:**
   - การโคลนเสียงคนจริงพูดประโยคใหม่เข้มกว่าการตัดคลิปเดิม จึงใช้ได้เฉพาะเดโมภายในตาม §6.
   - ห้ามเผยแพร่ pack, คลิปโคลน หรือวิดีโอเดโมที่มีเสียงนี้สู่สาธารณะ จนกว่าจะได้สิทธิ์จากเจ้าของเสียง หรือเปลี่ยนเป็นเสียงที่เราเป็นเจ้าของ.
6. **ผู้ทำ:**
   - Claude/Codex สร้างคลิปและ author pack revision 6 ใน workspace ของ Studio (`D:\G-Maiden-3D-Studio\workspace\vrzo-mapping-v6`, นอก repo G-Maiden). ไม่แก้ revision 5 และไม่แก้ Lalin.
   - Boss import ผ่าน Control.
7. **ไม่เปลี่ยน:** โค้ด G-Signal, ข้อ 2–4 และ 6–7 ของ §9.2.

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-11-07 | Draft first demo slice D1: VRZO revision 5 import/verification, single-kill and warning-voice decisions, new native `enemy_missing` announcer event, Gank Meter live check, rights limits and plan impact. |
| 0.1.1 | 2026-11-07 | Boss approved the draft as written; recorded §9 decisions per the draft recommendations. |
| 0.1.2 | 2026-11-07 | Correct the warning-voice source (GANN critical cache only; no Maiden cached line; missing clips suppress the gank alert) and propose amending §9.1(3) to pack revision 6 clips for gank/danger/revision; pending Boss approval. |
| 0.1.3 | 2026-11-07 | Boss approved the v0.1.2 amendment as written; §9.2 (pack revision 6 warning clips) supersedes §9.1(3). |
| 0.1.4 | 2026-11-08 | Propose §9.3: generate the gank/danger/revision clips locally with F5-TTS-THAI voice cloning instead of recording; synthetic provenance and internal-only use; pending Boss approval. |
| 0.1.5 | 2026-11-08 | Boss approved §9.3 (local voice-clone warning clips) as written. |

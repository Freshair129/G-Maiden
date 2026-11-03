---
title: "GSI victim counters and draft slot evidence"
doc_id: "2026-11-03-gsi-victim-slot-evidence"
status: "active"
version: "1.0.0"
updated: "2026-11-03"
owner: "G-Maiden"
---

# GSI victim counters and draft slot evidence

## Purpose and scope

บันทึกข้อมูลจาก GSI ที่เจ้าของเก็บเองสองแมตช์และภาพ draft ในเครื่อง เพื่อกำหนด candidate logic สำหรับการทดลองระบุตำแหน่งผู้เล่นและเหยื่อ โดยไม่ยกสมมติฐานเป็นข้อเท็จจริงสากล ข้อมูล match ID, ชื่อผู้เล่น, raw GSI, DEM และภาพหน้าจออยู่ในเครื่องเจ้าของ ไม่รวมใน repository

## Observed GSI shape

ในสอง session ที่ตรวจพบ cumulative counters อยู่ที่ `player.kill_list` ตัวอย่างเชิงสังเคราะห์ที่รักษารูปแบบจริง:

```json
{"player":{"kills":6,"kill_list":{"victimid_4":3,"victimid_1":2,"victimid_2":1}}}
```

ค่าคือจำนวนที่สะสมต่อ key ใน snapshot; จำนวน key ไม่เท่ากับจำนวนคิลรวม ลำดับ key ใน object ไม่ใช่ลำดับเวลา และ snapshot ที่มีหลาย victim ไม่บอกว่าใครเป็นเหยื่อคนล่าสุดโดยตัวมันเอง การเทียบ snapshot ก่อน–หลังอาจช่วยหา counter ที่เพิ่ม แต่ข้ามหลายคิล, counter reset, frame loss, ข้ามแมตช์ หรือ increment พร้อมกันต้องแสดงผล unknown จนมีหลักฐานเพียงพอ

## Player slot observations

| ตัวอย่าง | ฝั่ง | ตำแหน่งในภาพที่นับจาก 1 | `player.team_slot` | `player.player_slot` |
| --- | --- | ---: | ---: | ---: |
| แมตช์ A, Earthshaker | Dire | 3 | 2 | 1 |
| แมตช์ B, Silencer | Dire | 4 | 3 | 8 |

ตรวจค่าใน payload ช่วง live ที่มีข้อมูล: A 14,295 records และ B 25,949 records; ค่าที่แสดงคงที่ในแต่ละชุด. สองตัวอย่างสนับสนุน `visual_index_1_based = team_slot + 1` สำหรับตำแหน่งของเจ้าของ แต่ยังไม่ยืนยันทุกผู้เล่น, ฝั่ง Radiant, โหมดอื่น หรือความหมายของ `player_slot` ที่เปลี่ยนต่างกัน

## Victim observations

แมตช์ A มี DEM เทียบ GSI: 11/11 คิลตรงตามจำนวน ลำดับเหยื่อ และวินาทีของ game clock. ในแมตช์นั้น key `victimid_1`, `victimid_2`, `victimid_3`, `victimid_4` ตรงกับ Centaur Warrunner, Invoker, Windranger, Storm Spirit ตามลำดับ; `victimid_0` ไม่มี kill event ที่ตรวจยืนยัน. แมตช์ B มี snapshot/ภาพ roster แต่ยังไม่มี DEM ที่ตรวจว่าเป็นแมตช์เดียวกัน จึงยังไม่ถือว่า mapping ของ B ผ่าน

Candidate ที่เจ้าของเลือกคือใช้ลำดับ portrait ภายในแต่ละทีมและเลข victim เริ่มจาก 0 เป็น mapping รายแมตช์ **ภายใต้สมมติฐาน**; ห้ามตีตราว่าเป็นตัวตนที่ยืนยันแล้วหรือผูกฮีโร่กับเลขนั้นข้ามแมตช์โดยไม่มีหลักฐาน. แม้คิลที่อยู่ในแมตช์ A จะตรงกับลำดับ roster ภาพ แต่ยังขาดการยืนยัน `victimid_0`, สลับฝั่ง และโหมด/แมตช์อื่น

## Draft portrait source

เจ้าของเลือกแนวทางทดลองอ่านแถบ hero portraits และชื่อผู้เล่นในช่วง draft/strategy เมื่อเลือกครบทั้งสองทีม ครั้งเดียวต่อแมตช์; ไม่เพิ่มการอ่าน scoreboard ระหว่างเกมเพื่อเก็บ roster. ภาพแมตช์ B ที่เจ้าของส่งแสดง draft และในเกมเรียง portrait ของแต่ละทีมสอดคล้องกับ scoreboard ของภาพนั้น แต่ยังไม่มีตัวตรวจ CV ที่ผ่านทดสอบ ชื่อบางช่องถูกตัด ภาพ portrait บางส่วนถูกทับ และ role ที่เลือกใน UI ไม่ใช่หลักฐาน lane ที่เล่นจริง

ระบบในอนาคตควรติดป้าย candidate/source/confidence, คืน unknown เมื่ออ่านไม่ชัดหรือข้อมูลกำกวม, ล้าง mapping ขณะเปลี่ยนแมตช์ และเก็บข้อมูลส่วนตัวในเครื่องตาม MVP contract. ห้ามเดาตัวตนจาก hero missing หรือเผยแพร่ screenshot/player names

## Implementation boundary and verification

โค้ดที่ตรวจ ณ checkout `7cda300` เดิมอ่าน `hero.kill_list` เป็นลำดับ object มี `victimid` ซึ่งต่างจากข้อมูลที่เก็บจริง; ดู `src-tauri/src/gsi.rs`. Candidate patch อ่านและตรวจ `player.kill_list` เป็น cumulative counters แล้วรวมจำนวน โดยตั้ง `last_victim_slot = -1` เพราะ snapshot เดียวไม่ให้ลำดับเวลา และหาก list ไม่มีมา หรือไม่ตรงรูปแบบที่ยอมรับให้ count เป็น unknown (`-1`) โดยไม่ปฏิเสธ tick เกม; synthetic regressions ครอบคลุม counts และ malformed input แต่ full crate/live acceptance ยังต้องตรวจแยก ห้ามอ้างว่า parser แบบ stateless ระบุเหตุการณ์ล่าสุดได้เมื่อไม่มี delta ที่เชื่อถือได้. คำอธิบายเดิมของ CR-010 ที่อ้าง `hero.kill_list` และ victim ล่าสุดจึงไม่ใช่หลักฐานของ feed ที่บันทึกจริง

ผลตรวจไฟล์แมตช์ B: 28,739 records, verifier ผ่านและ transport complete, พบก่อนเกม/live/post-game; offline replay อ่านครบ แต่ไม่ใช่การทดสอบ runtime G-Maiden หรือหลักฐานว่า GSI บันทึกทุก event. แมตช์ A ใช้ local GSI และ DEM; ภาพและผลวิเคราะห์อยู่เฉพาะเครื่องเจ้าของ ไม่ใช่ fixture ใน repo

ยังต้องทดสอบ: ฝั่ง Radiant, victim ทุกสล็อตรวม 0, หลายแมตช์, slot reorder, ภาพ draft UI scale/ภาษา/portrait obscured, snapshot reset/duplicate/batched increments และ live runtime. การยืนยัน event/hero ต้องอ้าง source, confidence และ match boundary

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 1.0.0 | 2026-11-03 | บันทึก GSI counters, หลักฐานสล็อตสองแมตช์, candidate draft mapping และข้อจำกัด. |

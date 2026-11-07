---
title: "G-Maiden Tactical Tools MVP — SRS"
doc_id: "g-tactical-tools-mvp-srs"
status: "draft"
version: "0.1.0"
updated: "2026-11-07"
owner: "G-Maiden"
complexity: "C-2"
risk: "MEDIUM"
related_docs: ["mvp-decisions", "software-requirements-specification", "FEAT-G-LOG", "FEAT-G-MASTER", "FEAT-G-SIGNAL", "FEAT-G-MEMORY", "FEAT-G-TACTICAL-TOOLS", "2026-11-07-g-tactical-tools-handoff"]
---

# SRS — 3 ฟีเจอร์เพิ่มสำหรับ G-Maiden

## 1. สถานะ อำนาจ และฐานที่ใช้

ผู้ใช้เลือก 3 อันดับแรกจากการเปรียบเทียบ HG และสั่งวันที่ 2026-11-07 ให้จัดทำ SRS, Feature Spec และ PR ส่งต่อ agent: (1) รีวิวการเตือนหลังเกมแบบย่อ (2) แผนซื้อไอเท็มเป็นขั้นตอน (3) ตัวจับเวลา ULT/BKB/TP ศัตรูแบบกดเอง งานนี้เป็น **ข้อกำหนดสำหรับพัฒนาต่อ ไม่ใช่ implementation หรือผลตรวจรับ**.

ขอบเขตผลิตภัณฑ์สามข้อเป็นสิ่งที่ผู้ใช้เลือก ส่วนรายละเอียด schema, ขนาดข้อมูล, hero cohort และวิธีจับคู่เหตุการณ์ด้านล่างเป็นข้อเสนอทางวิศวกรรมของผู้เขียนให้ตรวจใน PR; ไม่อ้างว่าผู้ใช้อนุมัติรายละเอียดทุก field. คง [[mvp-decisions]] v0.7.0 และ [[software-requirements-specification]] เป็น authority ด้าน privacy, account, quality และ supported matrix. ไม่เปลี่ยน 62 parent MVP tasks, ไม่ย้าย Voice/Memory P0 และไม่เปิด deep Coach ที่เลื่อนไว้.

ฐาน source: `Freshair129/G-Maiden@0693b2f1ce7151ea0cca198b5e2509f1df3dba2c` (main ที่ตรวจวันที่ 2026-11-07). HG ที่ตรวจคือ App 1.4.125 / Server 1.4.398; G-Maiden ที่ตรวจ UI คือ installed 0.13.6. UI inspection เป็นนอกเกมเท่านั้น. ห้ามนำสถานะ installed UI ไปแทน source ล่าสุด หรือใช้ editor preview เป็น live evidence.

| ความสามารถเดิมที่ต้อง reuse | สิ่งที่ต้องเติมในรอบนี้ |
| --- | --- |
| G-Log มี JSONL, session identity/epoch, typed events, `parse_timeline`/`read_match_log`, efficacy study join 8 s | เพิ่ม evidence ของ presentation, death observation/coverage และหน้ารีวิวที่แยก known/unknown; ไม่สร้าง logger/study ใหม่ทับของเดิม |
| Build builder ใช้ own inventory และ G-Master prose; `counter_advice.rs` มี static counter knowledge | เพิ่ม typed deterministic plan; ไม่ parse prose เป็นรายการซื้อที่ดูเหมือนแน่นอน |
| มี CV roster, session lifecycle, overlay และ layout editor | เพิ่ม manual timer state; ไม่อ้างว่ารู้ enemy cooldown อัตโนมัติ |

Feature/interaction/data contract: [[FEAT-G-TACTICAL-TOOLS]]. File ownership, slices และ tests: [[2026-11-07-g-tactical-tools-handoff]].

## 2. ขอบเขต MVP และสิ่งที่ไม่รวม

| Feature | MVP ที่ต้องส่งมอบ | หลัง MVP / ไม่รวมใน PR ชุดนี้ |
| --- | --- | --- |
| **G-Review** | อ่าน archived local session; timeline คำเตือน/revision/presentation/death; lead-time interval, coverage/gaps, summary ไม่เกิน 3 จุดพร้อม source event | DEM parser, kill attribution/death cause, fight/position heatmap, win probability, coach efficacy เชิงเหตุเป็นผล, tuning อัตโนมัติ, cloud summary |
| **G-BuildPlan** | Plan ใน Live → Build: Next ≤1, Then ≤3, Situational ≤3; เหตุผล/แหล่งข้อมูล/แพตช์/role; deterministic rules ที่ตรวจแล้วสำหรับ 3 hero-role pairs | ซื้อของอัตโนมัติ, shop input, gold ETA, best-build/win-rate claims, full hero catalogue, inferred enemy inventory, LLM เป็นเจ้าของ structured plan |
| **G-Cooldown** | ULT/BKB/TP สูงสุด 5 enemy subjects ×3 kinds; start/restart/cancel ด้วยผู้ใช้; countdown ตาม game clock พร้อม estimated/unknown states | auto-detect cast, auto enemy buyback, charge/Refresher modelling, hidden cooldown discovery, new global hotkey, interactive full-screen overlay |

ค่าเริ่มต้นของ cohort ที่เสนอ: Crystal Maiden position 5, Lion position 4, Juggernaut position 1. ก่อนส่ง implementation ต้องมี data review ระบุ patch/source สำหรับทุก rule. ชุดนี้เป็นขอบเขตทดสอบ ไม่ได้อ้างว่ามีคำแนะนำปัจจุบันที่ผ่านการตรวจแล้ว. Unsupported hero/role/patch แสดง unavailable ตามจริง.

## 3. Actors และการแยกหน้าที่

Player เลือกบทบาท/อ่านรีวิว/กด timer. Native Rust เป็นเจ้าของ session, quality, event identity, deterministic plan และ timer. Control WebView เป็นผู้แสดงผลและส่ง user intents ที่ถูกตรวจซ้ำ. Overlay รับ state เพื่อแสดงผลอย่างเดียว. GSI/CV เป็น source ที่มี admission/freshness เดิม. G-Log เป็น local persistence; optional cloud, Party/Friends, Store และบัญชีไม่ใช่ dependency ของสามฟีเจอร์.

## 4. Functional requirements

### 4.1 Shared contract

| ID | Requirement | การตรวจรับ |
| --- | --- | --- |
| TT-C01 | ทั้งสามฟีเจอร์ใช้ได้โดยไม่ sign-in/network/SLM; data และ derived outputs อยู่ local | AT-C01 |
| TT-C02 | Live asynchronous result/action มี `run_id`, `session_epoch` และ revision; native ปฏิเสธ stale context. Archived Review ใช้ archive identity + selection/request generation แยกจาก current-match epoch; reject เมื่อเลือกไฟล์อื่น/ลบ/ไฟล์เปลี่ยน | AT-C02 |
| TT-C03 | Input ขาด/ผิด/เก่าไม่ใช้ zero/empty เป็น known value; own live source ต้องผ่าน admission และ valid-source age ≤2 s เดิม | AT-C03 |
| TT-C04 | Source `live`, `replay_test`, `fixture`, `manual` แยกชัด; synthetic/replay-test ไม่ปน live history หรือ effectiveness denominator | AT-C04 |
| TT-C05 | Reuse 7-page navigation, `--g-*` deck tokens, bounded-region scroll/tab/pagination; overlay click-through และ HUD keep-outs คงเดิม | AT-C05 |
| TT-C06 | Feature work เป็น non-critical; critical producer ไม่รอ JSON serialization, disk I/O, scan, WebView, network หรือ SLM ของฟีเจอร์ใหม่ | AT-C06 |
| TT-C07 | ไม่มี egress ผ่าน cloud prompt, diagnostics export อัตโนมัติ, Party, social หรือ account; ไม่ขยาย existing consent/allowlists | AT-C01 |
| TT-C08 | ไม่เปลี่ยน G-Signal sensitivity/hysteresis, silent-arm assignment, GANN event-source contract หรือระบบ audio owner | AT-C06, AT-R09 |

### 4.2 G-Review

| ID | Requirement | การตรวจรับ |
| --- | --- | --- |
| TT-R01 | เข้าจาก Insights → History → session เดิม; แยก archived complete, partial/abandoned, disconnected และ legacy evidence | AT-R01 |
| TT-R02 | Timeline แสดง decision, withdrawal/revision, presentation receipt และ death observation ด้วย event IDs ที่ตามกลับได้ | AT-R02 |
| TT-R03 | แยก `decision_emitted`, `audio_admitted`, `audio_started`, `suppressed`, `cancelled`, `failed`, `unknown`; `armed=true` ไม่เป็นหลักฐานว่าเสียงเริ่ม | AT-R02 |
| TT-R04 | `audio_started` หมายถึง native playback-start receipt เท่านั้น ไม่ใช่พิสูจน์ผู้เล่นได้ยิน; absence ของ receipt เป็น unknown | AT-R02 |
| TT-R05 | Death delta=1 จาก valid own-player observations ใช้ช่วงค่า game clock ที่สังเกต `[a,b]` พร้อม resolution 1 s ไม่ใช่ขอบเขตเวลาเสียชีวิตจริง; jump>1, initial count, reconnect gap, reset หรือ invalid identity ห้ามสร้าง exact death หลายเหตุการณ์ | AT-R03 |
| TT-R06 | แสดง warning context ย้อนหลัง 30 game-seconds ต่อช่วง clock ที่สังเกต และ observed-clock lead range พร้อม quantization/ordering caveat โดยคงทุก warning ที่เข้าเงื่อนไข; ไม่อ้าง actual death-time bound หรือ causal attribution | AT-R04 |
| TT-R07 | Revision ผูก original warning ID; เก็บประวัติเริ่มเสียงแล้วแต่ถูกยกเลิก แยกจาก warning ที่ยังมีผล; ไม่ลบเหตุการณ์เพื่อเพิ่มคะแนน | AT-R05 |
| TT-R08 | Summary ของ complete session ≤3 จุด ข้อละ source event/time; partial/legacy แสดงหลักฐานเท่าที่มี ไม่เดา win/loss, death cause หรือคำว่า safe | AT-R06 |
| TT-R09 | Count และ denominator ระบุ eligibility/coverage; lead time ไม่ใช้วัด precision/recall/การช่วยชีวิต; ไม่เปลี่ยน efficacy study window 8 s หรือ MVP-006 label protocol | AT-R09 |
| TT-R10 | Corrupt/truncated/unknown records ทำให้ completeness ลดลงพร้อมเหตุผล; UI ยังอ่าน valid prefix ได้ตามขอบเขตที่ปลอดภัย | AT-R07 |
| TT-R11 | อ่านเฉพาะ archived log ผ่าน native confined path/opaque ID; one scan job, cancellation และ bounds ตาม Feature Spec; ลบ log แล้ว derived view/cache ต้องหาย | AT-R08 |

### 4.3 G-BuildPlan

| ID | Requirement | การตรวจรับ |
| --- | --- | --- |
| TT-B01 | Native planner คืน typed Next/Then/Situational พร้อม rule IDs, reasons, provenance, dataset revision และ assumptions; input เดียวกันให้ output เดียวกัน | AT-B01 |
| TT-B02 | Role เป็น explicit player selection สำหรับ session; ไม่อนุมาน lane จาก hero name หรือใส่ Support เมื่อไม่รู้ | AT-B02 |
| TT-B03 | ชุด rules ระบุ 3 hero-role pairs, patch, source/review date และ item/recipe identifiers; patch ไม่ตรงปฏิเสธ, patch ไม่ทราบรอการยืนยันชุดข้อมูลโดยผู้ใช้พร้อม `manual_confirmed` label | AT-B02, AT-B08 |
| TT-B04 | Own inventory ต้องครบ required scopes inventory/backpack/stash และแยก absent/incomplete จาก known empty/quantity. Courier/transit เป็น optional scope: unknown ไม่บล็อก plan แต่ต้องมี limited-ownership badge; required scope ขาดหรือ stale ถอน active recommendation | AT-B03 |
| TT-B05 | แสดง Next ≤1, Then ≤3, Situational ≤3; canonical item dedup, stable ordering และ upgrade/recipe closure ไม่แนะนำซื้อของที่ถือครบแล้วใน admitted inventory scopes; ห้ามอ้าง duplicate protection ครอบคลุม courier/transit ที่ไม่ทราบ | AT-B04 |
| TT-B06 | ซื้อ component ไม่เท่ากับถือ final item; component quantity ถูกใช้ครั้งเดียวต่อ recipe evaluation; ไม่มี automatic purchase/sell | AT-B04 |
| TT-B07 | Situational ใช้เฉพาะ current-session admitted enemy identities และ reviewed rules; absence ของ observed enemy ไม่แปลว่าไม่มี threat; ไม่ใช้ unseen enemy items/gold | AT-B05 |
| TT-B08 | Recompute เมื่อ semantic input เปลี่ยน ไม่ใช่ทุก render/tick; reject result ที่ session/dataset/inventory revision เปลี่ยนระหว่างคำนวณ | AT-B06 |
| TT-B09 | คง G-Master prose เป็นช่องแยก มีสถานะของตัวเอง; local deterministic plan ทำงานได้แม้ G-Master unavailable และไม่ส่ง inventory/roster/rules output ไป cloud | AT-B07 |
| TT-B10 | MVP เป็น visual-only, ไม่มีเสียงซื้อของใหม่หรือ automatic provider call; unsupported context แสดงเหตุผล ไม่ fallback เป็นคำแนะนำแต่งขึ้น | AT-B07, AT-B08 |

### 4.4 G-Cooldown

| ID | Requirement | การตรวจรับ |
| --- | --- | --- |
| TT-T01 | สร้างได้สูงสุด 15 timer keys ต่อ session: enemy subject × ULT/BKB/TP; subject มาจาก admitted roster หรือ explicit user mapping ที่ติด source=manual | AT-T01 |
| TT-T02 | Start/restart/cancel ส่ง typed command ผ่าน native validation; duplicate command ID ไม่เริ่มใหม่และ stale expected revision ไม่แก้ state | AT-T02 |
| TT-T03 | ต้องมี valid current session/game clock และ duration source ก่อน start; ULT level/variant ตาม reviewed data หรือ user-supplied duration 1–1800 s ไม่เดา level | AT-T01 |
| TT-T04 | Remaining=max(0, deadline_game_ms−current_game_ms); pause ไม่เดิน, valid forward clock หลัง reconnect คำนวณใหม่; wall clock ไม่ใช่ timer authority | AT-T03 |
| TT-T05 | GSI age>2 s/disconnected ทำให้ frozen/unknown-time; clock ถอยหลังภายใน session หรือ identity เปลี่ยนทำให้ต้องเริ่มใหม่ ไม่เดา elapsed | AT-T04 |
| TT-T06 | หมดเวลาแสดง “คาดว่าพร้อม” พร้อม manual-estimate label ไม่ใช่ยืนยันสกิลพร้อม; cancel กลับ unknown ไม่ใช่ ready | AT-T05 |
| TT-T07 | การแก้ level/duration ใช้กับ start ครั้งถัดไป; running timer คง assumption snapshot เดิมจน explicit restart; enemy death ไม่ reset cooldown อัตโนมัติ | AT-T06 |
| TT-T08 | Match/session/run ใหม่ล้าง timer; reconnect session เดิมเก็บได้ตาม trusted game clock; ไม่ persist ข้าม restart และไม่โหลด timer จาก log | AT-T07 |
| TT-T09 | Control อยู่ Live → Timers; overlay แสดงผลได้อย่างเดียว ผ่าน existing layout system; ไม่เปลี่ยน input policy หรือเพิ่ม global hotkey ใน MVP | AT-C05, AT-T08 |
| TT-T10 | Charge/Refresher/cooldown reduction ที่ไม่ถูกสังเกตแสดงข้อจำกัด; ไม่มี auto enemy buyback หรือ auto cast detection | AT-T06 |
| TT-T11 | Timer ไม่เป็น input ของ G-Signal risk หรือ G-Revive verdict ใน MVP และไม่ส่งเสียงเมื่อหมดเวลา | AT-T08 |

## 5. ข้อมูลที่ต้องเก็บและการเก็บรักษา

รายละเอียด schema อยู่ Feature Spec §3; ตารางนี้เป็น minimum data contract ไม่ใช่คำสั่งเก็บ raw payload เพิ่ม.

| ข้อมูล | มีแล้ว / ต้องเพิ่ม | Persistence / ขอบเขต |
| --- | --- | --- |
| Session ID/epoch/lifecycle, own ticks, Signal/missing events | มีบางส่วนใน G-Log; ต้องเพิ่ม process run ID, origin, quality และ event correlation | local G-Log; ห้าม raw account/Steam ID ใน extension records |
| Warning/revision identity และ source evidence timestamps | ต้องเพิ่มให้เชื่อม decision กับ presentation ได้ | local bounded typed records |
| Audio admitted/start/cancel/failure receipt | ตรวจ native owner เดิมก่อนเพิ่ม adapter; ไม่ใช้คำสั่ง play เป็น start receipt | เก็บ status/time/code ไม่เก็บเสียงหรือ transcript |
| Own death observation interval/coverage gaps | derive จาก valid consecutive own observations; เพิ่ม presence/quality ที่ defaulted GameTick แทนไม่ได้ | local typed observation; ไม่เก็บ killer/location ที่ไม่มี source |
| Review rows/summary | derive on demand | memory cache ผูก source identity/revision; ไม่มีฐานข้อมูลใหม่ใน MVP |
| Own inventory validity/quantities, user role, roster evidence, selected dataset | inventory บางส่วนมีแล้ว แต่ complete/presence/recipe quantities ต้องตรวจเพิ่ม | live in-memory; user role/patch confirmation session-scoped; ไม่เพิ่ม raw GSI dump |
| Reviewed item/cooldown rule data | ต้องสร้าง/ตรวจ content; public static facts เท่านั้น | version-controlled bundled dataset; source URL/date/patch/hash |
| Timer subject, start clock, duration, assumptions, command/revision | ต้องเพิ่ม | session memory only; ไม่ persist ใน history หรือ cloud |

G-Log retention/deletion เดิมยังเป็นเจ้าของ archive. ไม่สร้าง auto-delete ของหลักฐานเดิม. Review derived cache ถูก invalidate เมื่อลบ source; Memory clear เป็นคนละคำสั่งกับ G-Log delete และห้ามดึงข้อมูลที่ถูก forget กลับเข้า Memory ผ่าน review. ไม่มี screenshot, replay, live log หรือรายละเอียดบัญชีจริงใน PR; fixtures ต้องเป็นข้อมูลสังเคราะห์.

## 6. Non-functional requirements

| ID | ข้อกำหนด | หลักฐานที่ต้องส่ง |
| --- | --- | --- |
| TT-N01 | คง G-Signal p50 ≤250 ms และทุก measured sample ≤300 ms ตาม T0–T3 เดิม | Native acoustic/loopback + accepted live protocol; unit tests ไม่แทน |
| TT-N02 | Whole-app CPU ทุก 1 s ≤10%; aggregate peak Working Set ≤900,000,000 bytes; paired Dota FPS loss ≤3% | รวม host/WebView2/sidecar/provider processes ตาม MVP-006; ไม่ลด scope เพื่อผ่าน |
| TT-N03 | Event enrichment ใช้ bounded nonblocking queue; overflow ระบุ coverage loss; writer/scanner failure ไม่หยุด critical alerts | Fault injection + native contention test |
| TT-N04 | Input/file/action bounds ตาม spec ต้อง enforce ก่อน allocate/parse; one review job และ bounded rows/cache | Malformed/oversize/resource fixtures |
| TT-N05 | UI แสดง no data/stale/partial/unsupported ชัด ไม่มี mock recommendation ใน native path | Component + native screenshots |
| TT-N06 | Local-only data และ optional-account behavior คงเดิม | Network-deny tests และ native signed-out/offline checks |

## 7. เกณฑ์ส่งมอบและสถานะ

แต่ละ requirement map ไป AT tests ใน [[2026-11-07-g-tactical-tools-handoff]]. ต้องแยก (a) unit/component fixture checks (b) installed native behavior (c) real Dota/acoustic/resource acceptance. ทุกผลมี exact SHA, environment/source origin, command, pass/fail/not-run และ evidence. ยอด test ผ่านไม่ทดแทน requirement ที่ไม่มี coverage.

PR เอกสารนี้สำเร็จเมื่อ scope/data/file map/test matrix ตรวจได้และ doc-graph/required PR checks ผ่านตาม gate. การเปิดหรือ merge สเปกไม่ทำให้ feature เป็น implemented และไม่ให้สิทธิ์ release/merge implementation อัตโนมัติ. รับ implementation เป็น slices ตาม handoff; native/live gaps คงเปิดจนมีหลักฐาน.

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-11-07 | ร่าง SRS สำหรับสามฟีเจอร์ที่ผู้ใช้เลือก แยก MVP, data lineage, existing-source reuse, local-only boundaries และ acceptance สำหรับส่งต่อ agent. |

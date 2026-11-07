---
title: "G-Tactical Tools — Warning Review, Build Plan and Manual Timers"
doc_id: "FEAT-G-TACTICAL-TOOLS"
status: "draft"
version: "0.1.0"
updated: "2026-11-07"
owner: "G-Maiden"
complexity: "C-2"
risk: "MEDIUM"
related_docs: ["g-tactical-tools-mvp-srs", "2026-11-07-g-tactical-tools-handoff", "FEAT-G-LOG", "FEAT-G-MASTER", "FEAT-G-SENSORY", "FEAT-G-MEMORY", "mvp-decisions"]
---

# Feature Spec — Tactical Tools MVP

**สถานะ:** planned / doc-only — ข้อเสนอที่ผู้ใช้สั่งให้จัดทำเพื่อส่งต่อ implementation; ยังไม่มี feature code หรือ runtime acceptance ใน PR นี้. Scope authority คือ [[g-tactical-tools-mvp-srs]]; tasks/tests อยู่ [[2026-11-07-g-tactical-tools-handoff]]. ทั้งสามส่วนเป็น extension ของระบบเดิม ไม่ใช่การเปิด deep G-Coach ทั้งชุด.

## 1. เหตุผลและแนวทางที่เลือก

ลำดับส่งมอบคือ G-Review → G-BuildPlan → G-Cooldown: รีวิวช่วยเห็นหลักฐานการเตือนจากระบบหลัก; build plan ทำคำแนะนำให้ใช้ตัดสินใจซื้อได้; manual timers เติมเครื่องมือระหว่างเกมโดยมีขอบเขตความแม่นยำชัดเจน. ข้อมูลเปรียบเทียบ HG มาจาก UI นอกเกมและ local inspection; ไม่อ้างว่าได้วัดประสิทธิภาพจริงในแมตช์.

| ทางเลือก | ข้อดี/ต้นทุน | การตัดสินใจ |
| --- | --- | --- |
| ต่อยอด G-Log + native typed planner/timers | ใช้ session/admission/privacy เดิม; ต้องเพิ่ม correlation และ source-quality contract | เลือกสำหรับ MVP |
| ให้ WebView/LLM สร้าง plan และถือ timer state | ทำ demo ง่าย แต่ lifetime/reconnect/ผลลัพธ์ไม่แน่นอน และเสี่ยงส่งข้อมูลเกิน allowlist | ไม่เลือกเป็น authority; WebView แสดงผล/ส่ง intents เท่านั้น |
| Full post-match coach + auto enemy cast tracking | ครอบคลุมกว่า แต่ต้องมี dataset/observation/validation เพิ่มมาก | หลัง MVP; ไม่ใช้เป็น prerequisite |

## 2. UX และ interaction

| Surface | พฤติกรรมหลัก | Empty/error/unknown |
| --- | --- | --- |
| Insights → History → เก็บย้อนหลัง session | Summary ไม่เกิน 3 ข้อ; timeline 50 แถวต่อหน้า; ตัวกรอง decision/presentation/death/revision; ทุกข้อเปิด source event ได้ | แสดง complete/partial/legacy พร้อมสาเหตุและ coverage; ไม่แสดง accuracy หรือ death cause ที่ไม่มีหลักฐาน |
| Live → Build | Next หนึ่งช่อง; Then ไม่เกิน 3; Situational ไม่เกิน 3; role selector, patch/dataset badge, reason และ assumptions | no session / inventory unavailable / stale / unsupported hero-role / patch mismatch / awaiting patch confirmation |
| Live → Timers | 5 enemy subjects × ULT/BKB/TP; duration/level ก่อน Start; Running มี Restart/Cancel; readonly overlay pin ตาม layout เดิม | ยังไม่กด = unknown; ข้อมูลเวลาเก่า = frozen; clock reset = invalid ต้องเริ่มใหม่; หมดเวลา = คาดว่าพร้อม |

คง navigation 7 หน้า, token `--g-*`, focus/keyboard/Thai labels และ bounded content regions. ไม่เพิ่ม page-level scroll. Overlay รับ snapshot เพื่อแสดงผลเท่านั้นและยัง click-through; การกด timer อยู่ Control ซึ่งอาจต้องสลับหน้าต่าง. ต้นทุน interaction นี้ยอมรับใน MVP; global hotkey/interactive overlay ต้องมีข้อเสนอแยก. ไม่มีเสียงใหม่จาก Build/Timers และไม่ใช้ TTS แทน GANN.

## 3. Ownership และ shared data contract

```text
Admitted GSI/CV + session lifecycle ──> native typed context
                                          ├─> BuildPlan ─> Control/readonly overlay
Control user intents ─> native validation ─┤
                                          └─> TimerStore ─> Control/readonly overlay
Signal decision + native audio receipt ─> bounded observation queue
                                          └─> existing local G-Log
เก็บย้อนหลัง G-Log ─> bounded native review scan ─> Review DTO ─> History
```

### 3.1 Context และ identity

| Field | Type/กฎ | Source/lifetime |
| --- | --- | --- |
| `schema_version` | integer = 1 สำหรับ extension records/DTOs | แยกจาก legacy G-Log; unknown version ไม่ parse แบบเดา |
| `run_id` | opaque random ID ต่อ process start | local; ไม่ใช่ account/device/Steam ID |
| `session_id`, `session_epoch` | ใช้ lifecycle เดิม; nullable เฉพาะ no-session | native runtime; ห้าม client ตั้ง epoch เอง |
| `origin` | `live`, `replay_test`, `fixture`; user mapping ใช้ field source=`manual` แยกจาก session origin | replay/fixture เก็บคนละ namespace และไม่เป็น live denominator |
| `revision`, `event_seq` | checked unsigned integers; revision ต่อ state, sequence ต่อ session stream | ไม่เอา wall-clock timestamp มาแทน identity |
| `game_clock_ms` | signed integer, checked conversion จาก `clock_time` วินาที ×1000; pregame อาจติดลบ | game clock มี resolution ตาม source; ไม่แต่ง sub-second precision |
| `observed_mono_ms`, `age_ms` | process-local monotonic time; source freshness ≤2000 ms | capture ณ จุดสังเกต ก่อน enqueue; ห้ามเทียบ monotonic ข้าม run |
| `presence`, `quality` | explicit present/absent/incomplete/invalid + reason codes | default `0`, `false`, `[]` ใน GameTick ไม่ใช่หลักฐาน known |
| `wall_time` | optional display/debug timestamp | ห้ามเป็น countdown หรือ latency authority |

สร้าง typed allowlisted view ของ own inventory/deaths/game clock และ admitted enemy identities จาก source owner เดิม. ไม่เพิ่ม raw GSI payload, CV frames, player names หรือ account IDs เข้า extension. ระหว่าง disconnect/stale คง last value ได้เฉพาะติด stale label; ห้ามสร้าง active recommendation ใหม่จากมัน.

Live IPC ทุก mutation มี `{command_id, run_id, session_epoch, expected_revision, payload}`. Native ตรวจ current context ก่อนแก้ state และคืน revision ใหม่หรือ typed rejection. หนึ่ง session เก็บ dedup IDs แบบ bounded LRU 128 entries; retry ID เดิมในหน้าต่างนี้คืนผลเดิมโดยไม่ทำซ้ำ. ID เก่าที่หลุด LRU ต้องถูก expected revision fence ปฏิเสธก่อน mutation; frontend ห้าม refresh expected revision แล้ว reuse ID เก่า. Live read มี request ID/cancellation; late responses ไม่ทับ session/revision ปัจจุบัน. ผลที่มี `unknown` ต้องมี reason code ให้ UI แปลได้.

เก็บย้อนหลัง Review ใช้คนละ fence: `{archive_id, archive_change_identity, selection_generation, request_id}`. Archive มี ของเกมก่อน run/session identity สำหรับ provenance เท่านั้น ไม่ต้องเท่ากับ current live epoch. เปิด archive เกม A ขณะเล่น B หรือเปลี่ยน B→C ยังอ่าน A ได้ถ้ายังเลือก A และ source ไม่เปลี่ยน. เปลี่ยน selection/ปิด detail/delete/source change เพิ่ม selection generation หรือ invalidate source แล้ว cancel/reject late results. การยกเว้นนี้ใช้เฉพาะ read-only archive path ไม่อนุญาต ของเกมก่อน command แก้ live state.

### 3.2 Persistence และขอบเขตข้อมูล

- Review ใช้ G-Log เดิมเป็นแหล่งเดียว. เก็บ typed decision/presentation/quality records เพิ่ม; derived rows/summary เป็น memory cache เท่านั้น.
- Build inputs และ timer state อยู่ใน session memory; ไม่บันทึก roster/inventory/timer เพิ่มลง archive. Dataset เป็น public static rules ที่ review และ bundle มากับ app.
- ไม่มี cloud/Party/account/telemetry egress ใหม่. G-Master prose ใช้ consent/allowlist เดิม ไม่รับ Build inputs หรือ derived plan ไปเพิ่ม prompt.
- ลบ เก็บย้อนหลัง log แล้ว invalidate Review cache ทันที. Memory clear กับ Log delete เป็นคนละ operation; Review ไม่ทำให้ G-Memory ingest ข้อมูลที่ผู้ใช้เคย forget.

## 4. G-Review

### 4.1 ขอบเขตและ event schema

MVP วิเคราะห์เฉพาะ **G-Signal gank warning + revision**; `enemy_missing` และ risk trace เป็น context. ไม่สรุปประสิทธิภาพ warning ทุกชนิด, G-Voice conversation, death cause หรือ buyback. Legacy record อ่านได้แต่ห้ามเติม audio receipt/identity ที่ไม่มี.

ทุก extension มี envelope §3.1 และ `event_id = run_id/session_epoch/event_seq`. Warning ID เกิด ณ native decision owner และส่งต่อผ่าน audio path; revision อ้าง `warning_id` เดิมและมี event ID ของตัวเอง.

| Record | Minimum fields | ความหมาย |
| --- | --- | --- |
| `warning_decision_v1` | warning ID, kind=`gank`, decision game clock, source observed time/quality, risk/ETA เมื่อมี, study assignment | ระบบตัดสินใจเตือน; ไม่เท่ากับมีเสียง |
| `warning_revision_v1` | original warning ID, revision kind/reason, observed time | คงทั้งต้นฉบับและ revision; orphan reference แสดง unresolved |
| `warning_presentation_v1` | warning ID, status, native observed time/game clock quality, bounded reason code | `audio_admitted`, `audio_started`, `suppressed`, `cancelled`, `failed`; unknown เกิดเมื่อ evidence ขาด |
| `own_death_observation_v1` | valid own death counter, prior/current observation clocks, quality/continuity | ใช้ counter delta ตาม §4.3; ไม่เขียน killer หรือ inferred cause |
| `review_stream_health_v1` | attempted/accepted/dropped counts, sequence gap range, overflow/write failure/truncation reason | ทำให้ coverage loss ปรากฏ; queue loss ห้ามเป็น silent success |
| `review_stream_end_v1` | final counters, schema/origin, close reason, clean-close flag | ไม่มี record นี้ = extension completeness unknown/partial ไม่ใช่ complete |

Native `audio_started` ต้องมาจาก audio engine ยืนยันเริ่ม playback ที่จุดจริง; enqueue/play request/admission callback ไม่เพียงพอ. เป็น **software playback evidence** ไม่ใช่ acoustic proof ว่าผู้ใช้ได้ยิน. Silent-arm/suppressed/cancelled-before-start ต้องไม่สร้าง start receipt. หาก start แล้ว cancel เก็บทั้งสองสถานะและเวลา. Implementation owner ต้องระบุ exact hook ใน `audio.rs` และแสดง trace/test ก่อนรับ slice.

### 4.2 Nonblocking observation และ scan bounds

ข้อเสนอ bounds สำหรับ implementation: queue 128 typed events, ขนาดต่อ event ≤1 KiB; extension bytes ต่อ session ≤512 KiB โดยกัน 1 KiB สุดท้ายไว้ health/end records. เป็นเพดานของ **ข้อมูลที่เพิ่ม** ไม่ใช่อนุญาตขยาย total log/resource budgets เดิม. ถ้าโควตารวมเดิมเข้มกว่าให้หยุด extension ก่อน พร้อม partial status.

Critical producer ใช้ nonblocking try-send และ atomic attempt/drop counters; ไม่ serialize JSON, lock/wait writer หรือ flush disk. Worker ผูก immutable session sink/epoch ที่สร้างตอนเปิด log; ห้าม dequeued record จากเกมก่อนเข้าของเกมใหม่. Close barrier อยู่ background worker; lifecycle producer ไม่รอ drain. Writer รวม health counters ทุก batch/ตอนปิด; ถ้า queue/budget เต็มยังเขียน final health ภายใน reserved bytes ได้. ถ้า I/O failure/crash ทำให้ health/footer เขียนไม่ได้ การไม่มี valid end record หรือ sequence mismatch ทำให้ archive partial. ห้ามรายงาน complete เพียงเพราะอ่าน valid prefix สำเร็จ.

Review เปิดเฉพาะ เก็บย้อนหลัง opaque ID ผ่าน native confined-path validation เดิม. Stream scan จำกัด 16 MiB/source file, line ≤64 KiB, timeline เก็บล่าสุด ≤500 rows, UI page 50 rows, cache หนึ่ง session และหนึ่ง scan job. Bounds ตรวจขณะอ่านก่อน allocate; หากถึง limit ให้ partial พร้อม `scan_limit`/`oversize_line`, ไม่แก้ source. Complete-summary/denominator คำนวณจากทั้ง bounded scan ไม่ใช่เฉพาะหน้าที่แสดง; ถ้า scan ไม่ครบห้ามอ้าง full-session counts. เปลี่ยน session/ปิด detail/delete ต้อง cancel job และ reject late result ด้วย source identity/revision. Cache key รวม opaque log ID, size/change identity และ parser version; archive ที่เปลี่ยน invalidate.

### 4.3 Death interval และ warning context

เฉพาะ consecutive admitted own-player observations ที่ fresh และไม่มี continuity gap: counter เพิ่ม 1 จาก clock `a` ไป `b` ให้ **observed clock range `[a,b]`**. นี่คือค่าบน game clock ของตัวอย่าง ไม่ใช่ mathematical bound ของเวลาเสียชีวิตจริง: GSI เป็นวินาทีและความสัมพันธ์ของ timestamp กับ physical event ไม่ได้รับการยืนยัน. ต้อง `b≥a`; เมื่อ `a=b` แสดง “สังเกตในวินาทีเดียวกัน” ไม่ใช้ empty interval `(a,a]` และไม่อ้าง sub-second order. Initial nonzero, delta>1, reset, identity invalid, backward clock, disconnect หรือ valid-observation gap>2 s เป็น unknown/aggregate gap ไม่แตกเป็น exact deaths.

สำหรับ observed death clock range `[a,b]`, candidate warning ที่ observed clock `w` อยู่ใน `[a−30000,b]`; แสดงทุก candidate และ receipt/revision ไม่เลือกเฉพาะอันดูดี. Observed-clock lead range `[a−w,b−w]` แยก decision จาก audio-start; UI ระบุ “ต่างจากค่าเวลาเกมที่สังเกต” และ resolution 1 s ไม่ใช้คำว่า guaranteed lead หรือ actual death-time bound. ถ้า `w≥a` หรือ clock เดียวกันให้ `order_uncertain` แม้ record sequence ต่างกัน; ห้ามอ้างเตือนก่อนตาย. แม้ `w<a` ก็อ้างได้เพียง earlier observed clock ไม่ใช่ causal success. Candidate ที่ warning/audio clock ไม่ valid ยังคงแสดง timeline แต่ไม่คำนวณ lead. Revisions ไม่ลบ history และไม่แปลง cancellation เป็น successful warning.

Summary complete session เลือก deterministic ไม่เกิน 3 รายการ: (1) documented decisions/presentation counts (2) death contexts ที่มี evidence พร้อม lead intervals (3) coverage caveats. จัด tie ตาม game clock แล้ว event ID; ทุกข้อความอ้าง event IDs หรือ bounded aggregate source range. Partial/legacy แสดงข้อมูลและข้อจำกัดเท่านั้น; ห้ามเดา outcome, cause หรือคำแนะนำว่าทำอะไรแล้วจะรอด. Counts ต้องแยก recorded/eligible/unknown และ scope `live` เท่านั้น. **30 s เป็น retrospective context window ไม่ใช่ efficacy threshold**; code/study window 8 s, silent-arm และ MVP-006 labels คงเดิม.

## 5. G-BuildPlan

### 5.1 Dataset และ inputs

MVP cohort: Crystal Maiden pos5, Lion pos4, Juggernaut pos1. Content owner ต้องส่ง rules จริงที่ตรวจ patch/source ก่อนรับ implementation; spec นี้ไม่ได้รับรองคำแนะนำของแพตช์ปัจจุบัน. Dataset schema มี `dataset_id`, revision/hash, game patch, reviewed_at, source URLs, canonical hero/item IDs, hero-role pair, ordered core targets, situational predicates/reasons, recipe graph/quantities/upgrade relations. ห้าม bundle scraped competitor implementation หรือใช้ competitor screenshots เป็น source code/data license.

Runtime ไม่ fetch เว็บไซต์. Known patch mismatch → unavailable. ถ้า source ไม่ส่ง patch ต้องให้ผู้ใช้ยืนยันชุดข้อมูลสำหรับ session พร้อม label `manual_confirmed`; ไม่เรียกว่า auto-verified. Unsupported hero-role ปฏิเสธ; role ไม่มี default จาก hero. Dataset validation ต้อง reject duplicate IDs, missing items/recipes, cycles, invalid quantities, missing provenance หรือ unsupported patch definitions ก่อน activate.

Typed inventory ระบุ completeness แยกราย scope, canonical item ID, quantity และ slot class. Dataset v1 กำหนด `required_scopes=[inventory,backpack,stash]`; ทั้งสามต้อง admitted/complete จึงสร้าง active plan ได้. Neutral slots ไม่ปน purchase recipes; consumables ใช้ stack quantity ที่ source รับรอง. Missing required field ไม่ใช่ known-empty และต้อง unavailable.

`optional_scopes=[courier,transit]`: นับเพิ่มเมื่อ source มี admitted ownership ของผู้เล่นและ quantities ที่เชื่อถือได้เท่านั้น. ถ้าไม่ทราบ ให้ plan ทำงานบน required scopes พร้อม `ownership_coverage=limited` และ badge “ไม่นับของบนคูเรียร์/กำลังส่ง — ตรวจของก่อนซื้อ”; ไม่ block ตลอดเกมเพราะ source ไม่มี courier. ต้องแสดง badge ข้าง Next และ missing-components; duplicate protection รับรองเฉพาะ admitted scopes. ห้ามติด label full ownership หรือเดาว่าไม่มีของระหว่างส่ง. Active plan จึงไม่ใช่คำสั่งซื้ออัตโนมัติ; หาก required scope ขาดยังต้อง unavailable แม้ optional scope มี. Inventory semantic revision รวม coverage/quality changes ด้วย.

Enemy context ใช้ current-session admitted hero identities/quality เท่านั้น. Explicit manual enemy mapping ของ Timer ไม่ยกระดับเป็น observed input ของ Build. Situational rules ต้องระบุว่าต้องการ observed identity ใด; absence ใน observed roster ไม่แปลว่าไม่มีฮีโร่/threat และห้าม inferred enemy inventory/gold/cooldown.

### 5.2 Deterministic planner

Input snapshot มี run/session/input revision, hero, explicit role, inventory revision/quality, admitted roster revision, dataset ID/revision และ patch confirmation. Validate context ก่อน run; semantic hash เปลี่ยนจึง recompute. Worker result ต้องตรง current revisions ทุกตัวก่อน publish; cancellation/late-result rejection อยู่ native.

1. เลือก reviewed hero-role profile และ canonicalize owned inventory.
2. ประเมิน ordered targets ด้วย recipe DAG และ upgrade closure. Owned final/declared upgrade satisfy target; components อย่างเดียวไม่ทำให้ final fulfilled.
3. จัด component quantities ให้ core targets ตามลำดับก่อนหลังโดยใช้หน่วยเดียวครั้งเดียว; duplicate required component ใช้ quantity จริง. Situational แสดงเป็น **ทางเลือกอิสระ** ไม่ reserve/หัก components จาก core queue และห้ามรวม progress ของทางเลือกเป็น shopping list เดียว.
4. `Next` = first unmet core target; `Then` = next ≤3 unmet targets. ห้าม duplicate canonical target ข้ามสองกลุ่มหรือเสนอซื้อ lower tier ที่ upgrade ถือครบแล้ว.
5. `Situational` = ≤3 matching alternatives เรียง explicit rule priority แล้ว canonical ID; exclude target ที่มีอยู่/อยู่ core output; predicates unknown ไม่ถือเป็น false-positive certainty.

แต่ละ entry มี target item ID/name, rule ID, reason code/text, missing component quantities, evidence/provenance, assumptions และ state. Completion หลังขาย/เสียไอเท็มประเมินจาก current inventory ใหม่ ไม่จำว่าเคยซื้อแล้วตลอดเกม. Core ครบทั้งหมดแสดง complete; situational ยังเป็น optional แยก. ไม่มี gold ETA, win-rate score, automatic purchase/sell หรือคำว่า optimal.

Plan state: `no_session`, `awaiting_role`, `awaiting_dataset_confirmation`, `unavailable(reason)`, `active`, `stale(last_plan)`, `complete`. G-Master prose/latency/error อยู่ช่องเดิมแยกจาก typed plan; network/SLM failure ไม่ทำให้ deterministic plan หาย. ห้ามแยก item names จาก prose แล้วถือเป็น authoritative plan.

## 6. G-Cooldown

### 6.1 Model และ manual commands

`TimerKey = (run_id, session_epoch, subject_slot[0..4], kind[ULT|BKB|TP])`; maximum 15 keys. Subject มี stable slot + hero ID + mapping revision/source. เปลี่ยน subject identity/mapping revision ต้อง invalidate timers ใน slot นั้น. Manual hero mapping ไม่เป็น hidden enemy knowledge หรือ input ของ Signal.

Timer snapshot มี command/revision, start game clock, immutable duration/level/variant/source snapshot, checked deadline, remaining, source age, state/reason. Duration เลือกจาก bundled reviewed cooldown dataset หรือ user-supplied integer 1–1800 s. ไม่มี level default; unsupported/dynamic variant ต้องให้ user ระบุ duration. Manual duration แสดง user-enteredestimate เสมอ; ไม่ใช้ auto CDR/Refresher/charge assumptions. Dataset ที่ patch ไม่ตรงไม่เสนอ prefill; user ยังระบุ duration เองได้พร้อม manuallabel. Configchanges ใช้กับ nextstart เท่านั้น.

Start/Restart ต้อง valid source/session/clock, full context และ revision ตรง. Start รับเฉพาะ unknown/estimated_ready; Running ต้อง explicit Restart. Cancel ใช้ได้เมื่อมี current session และ revision แม้ clockstale เพื่อให้ผู้ใช้ล้างค่า; resultingstate unknown. Retry/duplicate ตาม§3.1. ไม่มี command ที่ให้ client ส่ง remaining/deadline เอง.

### 6.2 State transitions

| From / event | To / พฤติกรรม |
| --- | --- |
| unknown + valid Start | running, deadline=start+duration |
| running + valid clock | remaining=max(0,deadline−clock); ใช้ gameclock เท่านั้น |
| running + source stale>2 s/disconnect | frozen, last remaining + unknown-time badge; ห้าม local wall-clock countdown |
| frozen + same-session valid forward clock | recompute จาก deadline; ถ้าหมดไปแล้วให้ estimated_ready |
| valid source emits unchanged clock during pause | remaining ไม่เปลี่ยน; ถ้า pause ไม่มี freshsamples ให้ frozen แทนการเดาว่า source ยัง fresh |
| running/frozen + clock ย้อนกลับ | invalid; ต้อง explicit Restart ด้วย validcontext |
| running + reaches deadline | estimated_ready (“คาดว่าพร้อม”), manualestimatebadge คงอยู่ |
| active/ready/invalid + Cancel | unknown ไม่ใช่ ready |
| explicit Restart + valid context | snapshotconfig ใหม่ + deadline ใหม่ + revision เพิ่ม |
| enemy death / level config edit | ไม่ resetrunningtimer; level ใหม่ใช้ nextstart |
| new session/run / subject remap | clear หรือ invalidate ตาม scope; ไม่มี resume จาก disk |

UI refresh จาก native state/events ที่มี revision และ context; frontend interpolation ทำได้เฉพาะ visualtransition ระหว่าง knownsnapshots และห้ามทำให้เวลานับต่อเมื่อ sourceclock หยุด/เก่า. ใช้ whole-seconddisplay เพื่อไม่อ้าง precision เกิน GSI. Timer หมดไม่ส่งเสียง ไม่เพิ่ม risk และไม่เปลี่ยน G-Revive verdict.

## 7. Implementation constraints และความยาก

| Feature | ความยาก | งานที่มีต้นทุนจริง |
| --- | --- | --- |
| G-Review | กลาง–สูง | correlation ผ่าน Signal/audio/lifecycle, honest gaps และ death intervals; reuseUI reader ช่วยลดงานแต่เสียงเริ่มจริงต้องพิสูจน์ |
| G-BuildPlan | กลาง | source presence/complete inventory, recipe/upgrade validation และ contentreview; จำกัด 3pairs ลด datasetcoverage แต่ไม่ลด quality |
| G-Cooldown | กลาง | corestate ง่ายกว่า auto-detection แต่ pause/reconnect/revision/inputUX ต้องทดสอบ native |

Pure modules และ componentnames ที่เสนอใน handoff เป็น builder discretion; FR/state/data/privacy/qualitycontracts เป็นสิ่งที่ต้องรักษา. Sharedfileadapters ให้ integratorowner เดียวแก้ต่อคิว ห้ามยึด workspace ของ Voice/GSI/CV/Task4. Featureflags หรือการเปิดใช้ใน dev build เป็นตัวเลือก implementation แต่ห้ามเปลี่ยน acceptedshipping/qualitygate. ไม่รวม dependencyinstallation,build หรือ release ไว้ใน docPR.

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-11-07 | เสนอ UX, typed data/state contracts, bounded logging/review, deterministic build planning และ manual timer behavior พร้อมขอบเขตการต่อระบบเดิม. |

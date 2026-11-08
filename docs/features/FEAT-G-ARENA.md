---
title: "FEAT-G-ARENA — สนามกลางและ Hero Inspector"
doc_id: "FEAT-G-ARENA"
status: "accepted"
approved_by: "Boss — \"approve all action and start imp\" in orchestrator session"
approved_date: "2026-11-08"
version: "0.2.0"
updated: "2026-11-08"
owner: "Boss"
source_of_truth: false
complexity: "C-2"
risk: "MEDIUM"
related_docs: ["software-requirements-specification", "FEAT-G-SENSORY", "FEAT-G-PARTY", "05-sitemap-ia", "03-layout", "2026-11-08-g-arena-hero-inspector-handoff"]
---

# FEAT-G-ARENA — สนามกลางและ Hero Inspector

**Phase:** P3 extension · **Status:** accepted 2026-11-08 (Boss) · implementation assigned for base Arena AR-01..03 ตาม [CR-047 §11.3 D-3](../change%20request/CR-047-pro-tier-entitlement-contract.md); entitlement ยังเป็น `absent` จนกว่า ADR ตาม CR-047 §12 accepted.
อำนาจเรื่อง tier และ offline behavior อ้าง [CR-047 §11.1 D-1 / §11.2 D-2](../change%20request/CR-047-pro-tier-entitlement-contract.md) ([PR #169](https://github.com/Freshair129/G-Maiden/pull/169)); ผู้ใช้ยืนยันให้ #165 ใช้ D-2 ล่าสุด. เอกสารนี้ไม่กำหนด entitlement mechanism, schema, key หรือ policy ใหม่.
ข้อกำหนด authoritative คือ [[software-requirements-specification]] §4.1A; เอกสารนี้กำหนด behavior/data contract และ test oracle.
ไม่ใช่ declaration ว่า production UI, ownership admission, native timer หรือ live acceptance เสร็จแล้ว.

## 1. แบบที่ต้องทำ

![Approved interactive prototype — synthetic fixtures](../design-system/assets/arena-hero-inspector-20261108/desktop-approved.jpg)

![Compact prototype at 1280×720 — synthetic fixtures](../design-system/assets/arena-hero-inspector-20261108/compact-approved.jpg)

ภาพจาก prototype เป็นหลักฐาน fixture เดิม; ข้อกำหนด D-1/D-2 และ UX ด้านล่างมีผลเหนือ chrome, preselection และ unknown tiles ในภาพ; JSX/CSS/data อ้างอิงและ hashes อยู่ใน [ชุดอ้างอิง](../design-system/assets/arena-hero-inspector-20261108/prototype-manifest.json).
ภาพประกอบแมปเป็น artwork จำลอง; ไม่ใช่ screenshot จาก match, calibration surface หรือหลักฐานตำแหน่งเกมจริง.
ใช้ actual CV preview/geometry ที่ตรวจสอบแล้วใน production; artwork fallback ต้องติดป้ายว่าไม่มีข้อมูลสดและไม่วาง live markers บน geometry ที่ไม่ตรง.

| Region | Content / behavior |
| --- | --- |
| Top | ศัตรู 5 การ์ดแบบย่อ: portrait/identity เท่าที่รู้ + seen/missing + last-seen age ที่ source ยืนยัน; ไม่แสดง HP/MP/skill/item ที่ไม่ทราบ |
| Left | การ์ดตัวเอง, existing missing/status information เมื่อมีแหล่งข้อมูล, Maiden mascot แยกจาก Crystal Maiden portrait |
| Center | แมปที่มีพื้นที่มากที่สุดในสนาม, marker ที่รู้ตัวตนคลิกได้, ขอบเขตคงที่เมื่อ inspect |
| Bottom | เพื่อน 4 stable slots ไม่รวมตัวเอง; unknown ally ใช้ portrait + admitted visibility/age แบบย่อ; Pro จึงเห็น G-Party detail ที่ consent/freshness ยืนยัน |
| Right | จองพื้นที่คงที่; เริ่ม neutral ทุก tier. Pro เปิด full inspector เมื่อผู้ใช้เลือก; ดูเหตุการณ์ เปิด bounded local event feed ได้ทุก tier; base ไม่มี skill/item detail |
| Existing chrome | คง Deck navigation/shortcuts/other tabs; ป้าย demo และ clock controls อยู่ใน fixture mode เท่านั้น |

Routing: ทุก tier ใช้ Arena เป็น body ของ Live > สด; คง 7-page ONE CANVAS navigation และ Live tabs [สด / บิลด์ / ฮีโร่ CV / G-Party] ตาม [[05-sitemap-ia]] R1–R3. ชื่อ สนาม เป็นชื่อ content ไม่ใช่การเปลี่ยน label สด. ห้ามคัดลอก prototype top nav สนาม / รีวิวเกม / เสียง / เพื่อน.
ใช้ CommandDeck เป็นเจ้าของ useParty/useFriends เดิม. Arena รับ read model จาก owner เดียว; ห้าม mount relay controller ใหม่.
Prototype ไม่ได้กำหนดให้ลบหรือ disable เมนู production ที่ไม่มีในตัวอย่าง.
Inner Arena layout ใช้แบบใหม่นี้แทน anatomy เดิมเฉพาะหน้า สนาม; outer stage และ ONE CANVAS จาก [[03-layout]]/[[05-sitemap-ia]] ยังใช้เดิม.

รายละเอียด layout แบบขาวดำและตารางระยะที่วัดจริงอยู่ใน [[arena-layout-dimensional]] (HTML/SVG/JPEG). ใช้เทียบ region/card/inspector; native stage เดิมและค่า [TBD] ไม่ถูกแทนด้วยขนาด viewport ของ prototype.

## 2. MVP และสิ่งที่ยังไม่รวม

MVP มี base Arena สำหรับทุก tier และ Pro features ภายใน Command Deck เดียว ตามตารางด้านล่าง; roster, source states, keyboard/focus และ deterministic fixture harness ใช้ contract เดียวกัน.
Production แสดงข้อมูลจริงเท่าที่ source admission ยืนยันได้. UI ที่ยุบข้อมูล unknown อย่างซื่อตรงเป็น milestone ที่ส่ง review ได้หลังได้รับ implementation assignment แต่ไม่ใช่การผ่านเกณฑ์ live skill/item โดยอัตโนมัติ.

ไม่รวมการเปิดเผย enemy/peer information ใหม่, auto enemy skill inference, spectator backend, replay scrubber, item shop/casting, global navigation redesign, mobile product หรือการเพิ่ม Party payload.
งาน G-Review/G-BuildPlan ไม่ถูกย้ายมาเป็น scope ของ Arena. คงลำดับ tactical handoff เดิม TT-00 → TT-R1 → TT-R2.
การเขียน production code รวม AR-01–03 ต้องรอ owner approval ของ #165, dependency gates ของ CR-047 (accepted follow-up ADR และ M6 ปิดตาม D-2) และ explicit orchestrator assignment. Pro timer slice ต้องรอ native G-Cooldown store จาก [PR #154](https://github.com/Freshair129/G-Maiden/pull/154) ที่ review แล้วด้วย.
Native manual timer integration ต้องรอ contract/store ที่ reviewed; เมื่อยังไม่มีให้ disabled action พร้อมเหตุผลที่อ่านได้ ไม่สร้าง timer backend สำเนาใน React.

### 2.1 Base / Pro capability contract

| Capability | Base: ทุกคน รวม signed-out | Pro เมื่อ authority ยืนยันสิทธิ์ |
| --- | --- | --- |
| Command Deck / Live > สด | Arena เดียวกัน, แมปกลาง + own hero + enemy seen/missing/last-seen age | ใช้ layout และ route เดียวกัน |
| Own hero / enemy / unknown ally cards | ข้อมูล base ที่ admitted; enemy และ unknown ally ยุบเป็น portrait + visibility/age; unknown age เป็น — | ใช้ base cards เดียวกัน; ไม่แต่งข้อมูลเพิ่มเพราะมี Pro |
| Full hero inspector | ไม่เปิด skill/item detail; reserved region เป็น neutral/base summary หรือ event feed ที่ผู้ใช้เปิด | เลือก card/known marker จึงเปิด full inspector; เฉพาะข้อมูลที่ admitted |
| G-Cooldown timers | ไม่แสดงหรือเปิด Pro timer actions | ใช้ native store ของ #154; ยังมี clock/source/admission gate |
| G-Party ally detail | ไม่มี Pro ally detail ใน Arena; คง navigation และ owner/consent lifecycle เดิม | แสดง narrow admitted stats ที่ยัง fresh ตาม G-Party; ไม่เพิ่ม payload |
| G-Review integration | ไม่มี Pro review action ใน Arena | เปิด existing reviewed review target ตาม #154; ไม่สร้าง replay backend |
| ดูเหตุการณ์ / event timeline | เข้าถึง existing local activity/event feed ใน bounded right-region tab | feed เดียวกัน แยกจาก Pro G-Review integration |
| G-Signal / voice alerts / overlay / GSI / local core | ทำงานเสมอโดยไม่ขึ้นกับ tier | ไม่เพิ่ม entitlement check ใน game hot path |

การ gate จำกัดที่ presentation ของ Pro features โดยอ่านผลจาก authority ตาม CR-047; React, fixture และ local storage ไม่เป็นผู้ออกสิทธิ์.
Teaser อยู่ในตำแหน่งฟีเจอร์ที่เกี่ยวข้อง ใช้คำอธิบายสั้นตามจริง; ไม่เบลอข้อมูลสด, ไม่เติม fixture, ไม่แสดง modal/เสียง/toast/nag ระหว่างแมตช์.
Pro ไม่ขยาย source admission, consent, selected-unit attribution หรือสิทธิ์ network/AI. Match/CV/G-Log/G-Memory อยู่ local.

### 2.2 Entitlement presentation transitions

ใช้ state จาก CR-047 ตาม D-2; ตารางนี้เป็น UI behavior เท่านั้น ไม่กำหนดการ verify, TTL, refresh, key หรือ lease schema ซ้ำ.

| Authority / transition | Arena presentation | UI invariant |
| --- | --- | --- |
| Cold start / signed-out / ไม่มีสิทธิ์ | Base Arena, inspector neutral | มีแมป/own hero/visibility เท่าที่ source มี; ไม่มี default hero selection |
| Valid Pro / offline แต่ signed lease ยังใช้ได้ | คง Pro ตาม CR-047 D-2 | Offline อย่างเดียวไม่ปิด Pro; source freshness ประเมินแยกตาม producer |
| Pro → lapsed / revoked / unverifiable หรือ sign-out/account change ที่ authority ถอนสิทธิ์ | ลดเป็น base ทันทีเมื่อรับ state ใหม่ | ปิด Pro detail/controls และ clear selection/detail/backpack/scroll ของ inspector ใน transition เดียว; late Pro detail ต้องไม่เปิดกลับ |
| Base → authority ยืนยัน Pro ใหม่ | Pro actions กลับมาใช้ได้ | inspector ยัง neutral จนผู้ใช้เลือกใหม่; ไม่เปิดฮีโร่เก่าอัตโนมัติ |

เมื่อ degrade: คง current Live route, map bounds, own/base observations และ existing local event feed; ไม่มี blank/stuck frame, forced page navigation, modal, toast หรือเสียง. ถ้า focus อยู่ใน control ที่ถูกถอนให้คืนไป card ที่ยังอยู่หรือ base-region heading อย่างไม่แย่ง focus เกม.
ซ่อน presentation ของ timer/Party/Review ตามสิทธิ์ แต่ Arena ไม่ล้าง native timer store, ไม่ยกเลิก producer/relay และไม่เปลี่ยน consent จาก tier transition. Producer/store lifecycle ยังคงเจ้าของเดิม.

## 3. Interaction contract

1. Initial: ทุก tier เริ่ม roster เท่าที่รู้, แมปหรือ unavailable state, inspector neutral และไม่มี selected hero; live refresh ห้ามเปิด inspector. Crystal Maiden preselect มีเฉพาะ explicit fixture entrypoint.
2. Card/known marker click: select HeroKey เดียวและ highlight ที่สัมพันธ์กัน; Pro จึงเปิด full inspector และ admitted detail ส่วน base คง base summary/neutral โดยไม่มี skill/item rows. Reset inline detail/backpack/scrollTop เมื่อเปลี่ยน selection. ห้าม pan/resize แมป.
3. Pro + admitted skill click: inline detail ในขวา แสดง catalog description, hotkey/rank เฉพาะเมื่อมี, passive/not-learned/readiness/cooldown source. รายการเต็มไม่จำกัด 4; preview +N เปิดรายการเดียวกัน.
4. Pro + admitted item click: inline detail พร้อม inventory location, count/charges เมื่อมี, cooldown และ source. unknown slot ไม่อ้างว่าฮีโร่ไม่มี item; ซ่อนทั้ง unknown-only row แทน ? ต่อช่อง.
5. Click slot/detail ไม่สั่ง Dota และไม่แก้ loadout. Collapse detail กลับ overview; X ปิด inspectorแต่เก็บ map bounds.
6. Esc ถ้ามี inline detail ให้ปิด detailก่อน; Esc ถัดไปปิด inspector. เมื่อปิดคืน focus ไปการ์ดที่เลือกถ้ายังอยู่ ไม่ trap focus แบบ modal. ไม่ดัก Esc เมื่อ descendant control ใช้ Esc จัดการ editing ของตัวเอง.
7. Keyboard: Enter/Space เลือกการ์ด/marker/skill/item; focus ring ชัด, status ไม่ใช้สีอย่างเดียว. ไม่ย้าย keyboard focus เมื่อข้อมูล live refresh.
8. สลับฮีโร่หรือปิด inspectorไม่ยกเลิก timer. เปลี่ยน session/identity/source generation จึง invalidate ตามข้อ 4.
9. Tooltip ต้องไม่บัง map center, ไม่เด้งทุก tick; screen reader ประกาศ selection และ user action แทน countdown ทุกวินาที. Entitlement transition ไม่มี toast/เสียง/modal.
10. ดูเหตุการณ์ เปิดแท็บ เหตุการณ์ ใน reserved right region ได้ทุก tier โดยไม่เลือก hero; ใช้ existing local feed, bounded scroll/pagination, empty/stale labels ตามจริง และกลับไป base/inspector ที่ยังมีสิทธิ์ได้โดยแมปไม่ขยับ. ไม่เป็น replay scrubber หรือ Pro G-Review bypass.
11. Glance priority: map ก่อน, missing-enemy alert เป็นอันดับสอง; inspector เปิดด้วย user selection เท่านั้น. Enemy/unknown-ally cards ยุบเป็น portrait + seen/missing + last-seen age ตามข้อมูล; visibility/age ที่ไม่ทราบใช้ — ไม่สร้าง timestamp. ซ่อน unknown skill/item rows ทั้งแถว ไม่สร้างชุด ? tiles.

## 4. Read model และข้อมูลที่ต้องเก็บ

เก็บเฉพาะ in-memory view state และ source snapshots ที่ได้รับอนุญาต; ไม่เพิ่ม telemetry, persistent match store, cloud หรือ AI context.
ชื่อด้านล่างเป็น proposed view model ไม่ใช่คำสั่งเปลี่ยน native IPC โดยยังไม่ review.

| Data | Fields / rules |
| --- | --- |
| HeroKey | sessionEpoch, team, playerSlot; heroId/revision เป็น identity guard; ห้ามใช้ชื่อฮีโร่เป็น unique key |
| FieldState<T> | value nullable, availability: known/unknown/stale/unavailable, source: own-gsi/party/cv/catalog/manual, observedAt/ageMs ตาม producer, sourceGeneration, revision |
| HeroView | HeroKey, admitted identity, level/alive/respawn, HP current/max หรือ HP%, MP current/max เฉพาะเมื่อมีหรือ MP%; unknown ไม่ใช่ zero |
| SkillView[] | stable slot/key, canonical name/icon/catalog revision, learned level nullable, passive, canCast nullable, castCooldown nullable, charges/maxCharges/recharge nullable; ability_active ไม่แปลว่า ready |
| ItemSlotView[] | inventory group+slot, known empty แยก unknown, itemId nullable, stack/count แยก charges, cooldown/recharge, enabled/disabled เมื่อ source มี |
| MapView | current frame/region.side, health, geometry/session generations, admitted detections x/y pixel, identity association; normalizeก่อนlayout |
| InspectorState | selected HeroKey+identity revision, selected detail kind/key, backpack expanded, local scroll; ไม่เป็น timer owner |
| TimerRef | match/session+enemy slot+kind(ULT/BKB/TP), native revision, start/end game time, manual source; React render อย่างเดียว |

### 4.1 Source availability ณ main 6a26d628992f0267ef4d848d92f2050bdbfa3c0f

| Source inspected | Evidence / implementation implication |
| --- | --- |
| src/src/live/events.ts GameTick | hp_percent/mana_percent และ optional item_names มี; ไม่ใช่ full HP/MP numerator/max, slot inventory, charges หรือ ability DTO. ห้าม fabricate fields จากชื่อ item/percent |
| src-tauri/src/gsi.rs / gsi_ability.rs | CR-039 parses selected-unit AbilityCandidate แล้วไม่ serialize/emit/share/log; verified SteamID ไม่พิสูจน์ skill ownership. ห้ามต่อ candidate เข้า inspector โดยตรง |
| src/src/live/events.ts MinimapCv | detection x/y เป็น pixel ภายใน region.side ไม่ใช่ normalized; ต้องตรวจ health/session/geometry, ไม่อ้างว่า CV ต่อเนื่อง 60fps |
| DraftRoster / live/buildHeroes.ts | slot-preserving roster มี null; ใช้ stable slots ไม่สร้าง unknown heroes จาก fixture |
| FEAT-G-PARTY / party owner | narrow relay own stats มี freshness/null contract; ไม่ส่ง abilities/items/positions และไม่อนุมานว่าฮีโร่ party member อยู่ตำแหน่งใดบนแมป |

UI adapter ใช้ admitted producers ที่มีอยู่ก่อน. หากต้องเพิ่ม own stats/item projection ให้แยก typed DTO ที่ระบุ selected-unit attribution, validation, generation และ privacy tests;
ห้ามต่อ raw payload ทั้งก้อนเข้า WebView หรือเปลี่ยน GameTick ให้กลายเป็น API ส่ง skill/AI โดยไม่ผ่าน CR-039 admission review.
ก่อนเปิด live own skills ต้องมี real player-mode fixtures ที่เลือก own hero/ally/enemy/creep/illusion และ ownership fence ผ่าน; mock identity test ไม่แทนหลักฐานนี้.
ใน Pro inspector หลัง user selection: catalog/description แสดงได้เมื่อรู้ hero identity และ catalog revision แม้ dynamic status ยัง unknown โดยระบุ catalog-only; ไม่เติม unknown dynamic rows/slots. Base ไม่มี full skill/item detail. Passive/catalog label ต้องแยกจาก measured learned rank.
Party stale TTL ใช้ contract เดิม (2000/2001ms boundary); sample ถูกถอนต้องล้าง HP/MP. Own GSI freshness ใช้ producer status เดิม ไม่สร้าง threshold คู่ขนาน.

### 4.2 Status และ timer

| State | Display | Source rule |
| --- | --- | --- |
| observed ready | พร้อม / castable ตามที่ยืนยันได้ | cooldown 0 อย่างเดียวไม่สรุป canCast; mana/silence/charges ไม่ครบให้ระบุความไม่แน่นอน |
| observed cooldown | countdown + source/age | ใช้ admitted native clock/snapshot; ไม่ใช้ browser wall clock เป็น authority |
| passive / not-learned | ติดตัว / ยังไม่เรียน | passive catalog กับ learned rank ต้องไม่ปะปน |
| unknown / unavailable | ยุบ card; ซ่อน unknown-only skill/item row; ใช้ — / ยังไม่มีข้อมูล ใน summary หรือ field ของรายละเอียดที่ admitted | ไม่เดา 0, ready, empty หรือ full HP; ไม่สร้าง ? ต่อ slot |
| stale | ข้อมูลเก่า + age; ห้ามอ้างว่าสด | stale inventory/skill ไม่ใช้เพื่อแสดง affirmative-ready; peer sample withdrawn เป็น null |
| manual running | คาดการณ์ · ผู้ใช้ตั้ง | แยกจาก observed state, ไม่เขียนทับ observation |
| manual expired | คาดว่าพร้อม | ไม่ยกระดับเป็น observed-ready |
| cancelled | ไม่ทราบ | ไม่แปลง cancel เป็น ready |

PR #154 G-Cooldown MVP จำกัด enemy ULT/BKB/TP สูงสุด 15 keys, native game-clock/pause/stale/session/revision fences.
Duration/catalog revision ยึด reviewed contract ของงานนั้น. หาก clock stale ให้ freeze และติดป้าย; หากเกม pause ให้ freezeตาม authoritative game time; resume ไม่วิ่งเองด้วย elapsed walltime.
Prototype ยอมกรอก 1..1800 วินาทีและจำลอง self/any skill/item เพื่อสำรวจ UI เท่านั้น; **ไม่ขยาย production timer scope**.
Fixture Lion ULT 42s, Blink/BKB และ roster ทั้งหมดเป็นค่าจำลอง ห้าม seed เมื่อเริ่ม live.

## 5. Visual, responsive และ assets

- รักษาลำดับชั้นของภาพ: map ใหญ่กลางเป็นอันดับแรก, missing alert อันดับสอง, enemy top / ally bottom แบบย่อ, inspector right เปิดเมื่อเลือก; ใช้ --g-* tokens และ readable Thai typography.
- Desktop acceptance วัด content bounds และ DPI จริงที่ 1280×720, 1440×900 และ 1672×941 window references; screenshot prototype ไม่ใช่ค่า outer Tauri chrome.
- authored Deck stage 1420×760 และ panel-local 1280×720 ยังคงเดิม. Resize fit stage; overflowใช้ bounded inspector tabs/scroll. ห้าม body/page scrollbar, fontsหดเพื่อยัดข้อมูล หรือซ่อน map เมื่อเลือก.
- Inspector reserve width ทั้ง open/closed/base/Pro และ event-feed view; bound delta ≤1 CSS px ใน viewport เดิม. Marker movementจากข้อมูลใหม่ไม่ถือเป็น layout shift; test freeze input ก่อนวัด.
- Mobile390/tablet1024 ใน prototypeเป็น exploratory browser views ไม่ใช่ production ONE CANVAS waiver.
- ใช้ project assets/catalog เมื่อมี. Missing image แสดงชื่อ/placeholderโดยไม่เปลี่ยนขนาดช่อง. Maiden mascot เป็น companion แยกจาก Crystal Maiden hero.
- Dota art belongs to Valve; Phosphor MIT, Noto Sans Thai OFL, map generated, mascot supplied project asset. Screenshot เป็น design fixture. ตรวจ asset rights/catalog revision ก่อน packaging; ไม่คัดลอก HG binary/assets.

## 6. Acceptance matrix

ทุกแถวเริ่ม **NOT RUN for production**. Synthetic prototype checks อยู่แยกใน evidence file; ไม่ใช้ปิด production row.

| Case → SRS | Setup/action | Expected / evidence |
| --- | --- | --- |
| ARENA-AC-001 → FR-001 | base/Pro เปิด Live > สด แล้วสลับทุก 7 pages และ Live tabs | คง [สด / บิลด์ / ฮีโร่ CV / G-Party], shortcuts และ one party/friends owner; ไม่มี prototype chrome หรือ old Live fallback |
| ARENA-AC-002 → FR-002 | complete roster แล้ว null slots/no-match | 5 + 4 + 1, self ไม่ซ้ำ, unknown ไม่ถูกเติม fixture; screenshots |
| ARENA-AC-003 → FR-003 | own admitted/null vitals, Pro admitted 4 / 6 / 0 skills และ unknown ally | known vitals ตรง source, Pro preview สูงสุด 4 +N เมื่อมี, unknown rows ถูกซ่อน; full variable list ไม่ตกหล่น |
| ARENA-AC-004 → FR-004 | base/Pro initial แล้วคลิกทั้ง 10 cards และ known markers | initial ไม่เลือก hero; shared key/highlight ถูกต้อง, Pro เท่านั้นเปิด full inspector; unknown marker ไม่เปิดผิด hero |
| ARENA-AC-005 → FR-005 | freeze data; open/switch/close/detail/backpack/event tab และ base↔Pro | map x/y/w/h delta ≤1 CSS px ทุก transition; reserved region ไม่ทับแมป/ไม่สร้าง page scroll |
| ARENA-AC-006 → FR-006 | Pro เลือก admitted active/passive/extra/stolen skill; ลอง base/unknown row | admitted detail ตรง key/revision, hidden unknown-only row ไม่มี click target; base ไม่เปิด detail และ late response ไม่ข้ามสิทธิ์ |
| ARENA-AC-007 → FR-007 | ready / CD 0 but no mana / unknown canCast / passive / unlearned / charges | distinct labels, no false castability; cast CD ไม่ปน recharge |
| ARENA-AC-008 → FR-008 | Pro admitted main/backpack/special; known empty vs unknown-only inventory | slot/count/charge ตรง source; unknown-only row ถูกซ่อน, ไม่ตีความเป็น empty; ไม่มี cast/purchase |
| ARENA-AC-009 → FR-009 | detail → Esc → Esc, X, select new hero, return to previous hero | focus restored, scroll / detail / backpack reset, timer คงอยู่ |
| ARENA-AC-010 → FR-010 | match / source / identity generation เปลี่ยนพร้อม late event | old selection / details / timers ไม่ข้าม generation; reused hero name ไม่ชน |
| ARENA-AC-011 → FR-011 | partial stats, unknown, peer 2000 / 2001 ms | no fabricated denominator / 0; stale peer sample ถูกถอน; age/sourceอ่านได้ |
| ARENA-AC-012 → FR-012 | unverified selected-unit abilities + peer skill/item injection | no candidate / forbidden field reaches UI / relay / AI; retain gsi.rs regression test + native ownership gate |
| ARENA-AC-013 → FR-013 | known region, zero / missing region, new geometry, unhealthy / Lite | correct pixel transform; invalid markers withheld; no synthetic positions |
| ARENA-AC-014 → FR-014 | Pro start/cancel/expiry/pause/stale/resume; max15keys; base timer attempt | native clock และ estimated-ready; base ไม่มี Pro timer action; BLOCKED จน reviewed #154 store พร้อม |
| ARENA-AC-015 → FR-015 | base/Pro production entry + refresh เทียบ explicit fixture entry | ไม่มี default CM selection, demo seed, arbitrary timer, simulate/play/reset; inspector เปิดด้วย user selection เท่านั้น |
| ARENA-AC-016 → FR-016 | keyboard only, screen-reader labels, focus during refresh | all controls reachable; unknown is not zero; no keyboard / game focus steal |
| ARENA-AC-017 → FR-017 | 3 desktop references with fixed input; open long details | no page overflow / clipped cards; map visible; actual bounds / DPI captured |
| ARENA-AC-018 → FR-018 | no-match/Lite/stale/disconnect/missingassets และเลือก card | honest fallback; source outage แยก entitlement; ไม่มี join/consent/cast/game-focus side effect |
| ARENA-AC-019 → FR-019 | event / IPC / network inspection + existing NFR protocol | no broader egress or hot-path dependency; report actual native NFR status separately |
| ARENA-AC-020 → FR-020 | implementationPR evidence review | source head + tests + screenshots + native/live results or NOT_RUN explicit; no acceptance inflation |
| ARENA-AC-021 → FR-021 | signed-out/base และ valid Pro; activate inspector/timers/ally detail/review/event target; inspect source/egress | capability table ตรงทุกแถว; no UI self-grant; Pro ไม่เพิ่ม data rights; core/voice/overlay/GSI ยังทำงานทุก tier |
| ARENA-AC-022 → FR-022 | Pro inspector/detail/timer หรือ event tab เปิด แล้ว authority เป็น lapsed/revoked/unverifiable/sign-out; ส่ง late response; กลับ valid; ทดสอบ offline-valid lease | ลด base ทันทีไม่มี blank/stuck/modal/toast/เสียง, focus และ bounds คง contract, stale detail ไม่ฟื้น; native store/relay ไม่ถูกล้าง; regain ไม่ preselect; offline-valid คง Pro ตาม D-2 |
| ARENA-AC-023 → FR-023 | 5 enemies + unknown allies, unknown last-seen, peer sample withdrawal, mixed admitted fields | portrait + admitted seen/missing/age เท่านั้นบน collapsed cards; unknown age —; ไม่มี ? tile matrix หรือ unknown-only skill/item rows; map/missing alert ยังเด่น |
| ARENA-AC-024 → FR-024 | base/Pro เปิด ดูเหตุการณ์; empty/live/stale feed; tab switch และ entitlement loss | existing local event timeline เข้าถึงได้ทุก tier; bounded scroll/pagination; map bounds ≤1 CSS px, no page scroll; ไม่เพิ่ม log schema/cloud/replay backend |

## 7. Prototype evidence boundary

Committed reference files preserve the original prototype source and visual/interaction evidence, not an installed G-Maiden feature. Their top chrome, CM preselection and unknown tiles are superseded for production by this revision; existing screenshots/drawing/source remain historical fixtures, not evidence that D-1/D-2 or the four UX adjustments were tested.
The prototype previously passed 30 synthetic browser checks: ten hero selections, skill/item details, timer interactions, keyboard behavior and fixed map bounds.
Compact capture records 369×369 map unchanged at 1280×720, page height720 and clippedSkills0.
These are fixture observations only. No GSI/CV/Party/native game, resource budget or release acceptance was established.
The full runnable local prototype is supplied privately to the incumbent agent; committed JSX/CSS/data are reference text and are not imported by production code.

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-11-08 | บันทึกแบบ Arena/Hero Inspector ที่ผู้ใช้อนุมัติ พร้อม MVP, data/ownership boundary, production-vs-demo distinction และ acceptance20รายการ. |
| 0.1.1 | 2026-11-08 | Add the measured dimensional layout sheet and distinguish prototype dimensions from native stage constants. |
| 0.1.2 | 2026-11-08 | Align base/Pro presentation with CR-047 D-1/D-2, honest-data density, explicit selection, local timeline and preserved navigation; add AC-021–024 and implementation prerequisites. |
| 0.2.0 | 2026-11-08 | Boss approved the spec and started implementation (CR-047 D-3): base Arena AR-01..03 assigned, entitlement fixed to `absent` until the entitlement ADR. |

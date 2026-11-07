---
title: "CR-044 — G-Voice Slice 3a: local STT candidate eligibility and benchmark harness"
doc_id: "CR-044-g-voice-stt-benchmark-harness"
status: "accepted"
approved_by: "Boss (explicit approval in chat, 2026-11-07: อนุมัติตามร่าง)"
approved_date: "2026-11-07"
version: "0.1.2"
updated: "2026-11-07"
owner: "Boss"
complexity: "C-2"
risk: "MEDIUM"
related_docs: ["MVP-038-local-stt-evaluation", "CR-043-g-voice-transient-mic-capture", "FEAT-G-VOICE", "mvp-decisions", "mvp-backlog"]
---

# CR-044 — G-Voice Slice 3a: คัดผู้สมัคร STT และสร้างเครื่องมือ benchmark (ยังไม่เชื่อมแอป)

> **สถานะ:** accepted 2026-11-07. Boss อนุมัติตามร่าง โดยมีมติตาม §8.1 **Risk: MEDIUM**: เป็นเครื่องมือฝั่งนักพัฒนาที่รัน binary/model ของบุคคลที่สามบนเครื่อง dev.
> ไม่แตะ runtime ของแอป, ไม่เพิ่ม dependency ใน `src-tauri`, และไม่มี network path ในแอป.

## 1. เหตุผลและขอบเขต

[[CR-043-g-voice-transient-mic-capture]] ทำให้ไมค์เก็บ PCM mono 16 kHz ได้แล้ว แต่ยังไม่มี STT.
[[MVP-038-local-stt-evaluation]] กำหนดว่าต้องเลือก engine/model จากหลักฐานจริง (คุณภาพ, latency, resource, license, offline) **ก่อน** integration (MVP-040).
Slice นี้สร้างสิ่งที่ทำได้ก่อนมี corpus จริง ได้แก่ eligibility table ของผู้สมัคร และเครื่องมือวัดผลที่ทำซ้ำได้ เพื่อให้รัน benchmark ได้ทันทีเมื่อมี corpus ที่ผู้พูดยินยอม.

**In scope:**
- ตารางผู้สมัครพร้อม license/ขนาด/ภาษาที่ตรวจแล้ว (§3)
- เครื่องมือ `tools/g-voice-stt-bench/` ที่อยู่นอกแอป (§4)
- template ของ corpus manifest และ consent (§5)
- fixture สังเคราะห์สำหรับเทสต์ตัวให้คะแนน

**Out of scope:**
- เชื่อม STT เข้า `MicCaptureBackend` (MVP-040)
- เลือกผู้ชนะ: ต้องรอผล benchmark จริง (Slice 3b)
- บันทึกเสียง corpus
- packaging/distribution ของ model (MVP-047)
- การดาวน์โหลด binary/model โดยไม่ได้รับอนุญาต

## 2. Gap analysis

| ข้อกำหนด MVP-038 | ปัจจุบัน | Gap | Slice |
| --- | --- | --- | --- |
| Eligibility ต่อผู้สมัคร: engine, model, license, hash, ขนาด, offline | ยังไม่มี | ต้องทำตารางและพิสูจน์ license/hash จากแหล่งต้นทาง | 3a (นี้) |
| ≥2 configurations ที่เข้า gate | ยังไม่มี | คัดจาก long-list §3 | 3a |
| Corpus ≥100 utterances ต่อภาษา, quiet/game-audio, code-switch, consent | ยังไม่มี | ต้องใช้คนบันทึกและเซ็นยินยอม; อยู่นอก Git | 3b (คน) |
| Scoring: Thai CER ≤20%, English WER ≤15%, intent/slot ≥90%, completion ≥95% | ยังไม่มี | ตัวให้คะแนน + normalization ที่ตรึงก่อนรัน | 3a |
| Warm turn ≤2,000 ms, cold ≤10 s, p50/p95/p99/max | ยังไม่มี | ตัววัด latency ต่อ utterance | 3a |
| Aggregate peak Working Set ≤900,000,000 bytes, CPU ≤10% | ยังไม่มี | วัด peak WS ของ process ผู้สมัคร; การวัด whole-app ทำตอน integration | 3a (บางส่วน) / MVP-048 |
| Offline/no-egress | ยังไม่มี | รัน harness ขณะตัด network และบันทึกผล | 3a เครื่องมือ / 3b ผล |
| Receipt ผูก app SHA + hardware | ยังไม่มี | harness เขียน receipt JSON | 3a |

## 3. ผู้สมัครเบื้องต้น (desk research, ยังไม่ยืนยัน)

ข้อจำกัดหลักที่คัดออกตั้งแต่ต้น: RAM รวมทั้งแอปต้องไม่เกิน **900,000,000 bytes** รวม WebView2 และ sidecar ทั้งหมด.
ดังนั้น Whisper medium/large (รุ่นที่รายงาน Thai CER ดีที่สุด) ใหญ่เกินงบ จึงไม่อยู่ในรายการหลัก.

| # | Engine | Model | ภาษา | License (ต้องยืนยันจากต้นทาง) | ข้อสังเกต |
| --- | --- | --- | --- | --- | --- |
| C1 | whisper.cpp (MIT) | Whisper `small` multilingual, quantized | Thai + English ในโมเดลเดียว | MIT (OpenAI Whisper) | code-switch ได้ในตัว; ยังไม่มีตัวเลข Thai CER ที่ยืนยันสำหรับ small quantized |
| C2 | whisper.cpp | Thai fine-tune ขนาด small (เช่น `biodatlab/distill-whisper-th-small`) | Thai เด่น | ต้องตรวจ card (Thonburian variants มีทั้ง MIT และ Apache-2.0) | Thai fine-tune บางตัวระบุว่า**ไม่รักษาภาษาอื่น**: เสี่ยง English WER/code-switch |
| C3 | sherpa-onnx (Apache-2.0) | Zipformer Thai (`sherpa-onnx-zipformer-thai-2024-06-20`, GigaSpeech2) + English zipformer | แยกโมเดลต่อภาษา | icefall card ระบุ Apache-2.0; license ของ dataset GigaSpeech2 ต้องตรวจแยก | ต้องมีตัวเลือกภาษาหรือรันสองโมเดล → RAM/latency เพิ่ม |
| C4 | faster-whisper 1.2.1 (CTranslate2) ผ่าน runtime ที่ FUNG staged ไว้ (`G:\AI-Studio\development\FUNG\.venv-whisper`, Python 3.11.9 embed) | ที่มีในเครื่อง: `large-v3-turbo` (≈1.6 GB, `mobiuslabsgmbh/faster-whisper-large-v3-turbo` rev `0a363e91…`); รุ่น `small` int8 ต้องดาวน์โหลดแยก | Thai + English (Whisper multilingual) | `manifest.json` ของ FUNG ระบุ SHA-256 ทุกไฟล์; โฟลเดอร์ `LICENSES` มี faster-whisper, Python และ model card (model ระบุ MIT) | engine เดียวกับ Lalin/FUNG; `large-v3-turbo` เกินงบ RAM 900 MB จึงใช้เป็น**ตัวอ้างอิงเพดานคุณภาพเท่านั้น** ห้ามถือเป็นตัวเลือกส่งจริง; ถ้าเลือกแนวนี้ต้องแนบ Python runtime (ตัดสินใน MVP-047) |

ทุกแถวต้องผ่าน eligibility gate ของ MVP-038 §3 ก่อนเข้า benchmark: hash, license ของทั้ง engine และ model, สิทธิ์ redistribution, offline behavior.
การมี crate ใน `Cargo.lock` หรือ card บน Hugging Face ไม่ถือเป็นหลักฐาน license จนกว่าจะบันทึกไฟล์ license และ hash.

## 4. Benchmark harness

| หัวข้อ | สัญญา |
| --- | --- |
| ที่อยู่ | `tools/g-voice-stt-bench/` (Node ESM, ไม่มี npm dependency ใหม่) แยกจากแอป; ไม่ import อะไรจาก `src-tauri` หรือ `src` |
| Adapter | หนึ่ง adapter ต่อ engine: รัน CLI ของ engine (path ที่ผู้ใช้ระบุ) ด้วย `child_process.spawn` แบบไม่มี shell, อ่าน transcript จาก stdout/ไฟล์ output ชั่วคราว |
| Input | corpus manifest JSON (§5) + WAV mono 16 kHz PCM16 (ตรงรูปแบบ CR-043) |
| Scoring | English WER (word Levenshtein) และ Thai CER (character Levenshtein หลัง normalization) โดย normalization ถูกตรึงในไฟล์ config ที่มี SHA-256 บันทึกใน receipt; intent/slot exact-match จาก label ใน manifest |
| Latency | ต่อ utterance: spawn→transcript (cold ครั้งแรก, warm ครั้งถัดไปเมื่อ engine รองรับ server mode); รายงาน p50/p95/p99/max + timeout ที่ตั้งก่อนรัน; timeout/error/no-speech อยู่ใน denominator |
| Resource | peak Working Set ของ process tree ผู้สมัคร sampling ทุก 1 s (Windows API ผ่าน PowerShell `Get-Process` หรือ `wmic` ที่มีอยู่แล้ว); รายงานเป็นตัวเลขส่วนเพิ่ม ไม่อ้างว่าเป็น whole-app |
| Receipt | `receipt.json`: app/git SHA, engine/model path + SHA-256, hardware/OS, config hash, ผลต่อภาษา/condition/code-switch, failures ทั้งหมด |
| Privacy | corpus และ receipt ที่มี transcript อยู่ใน directory ที่ผู้ใช้ระบุ **นอก repo**; `.gitignore` กัน `tools/g-voice-stt-bench/out/`; harness ไม่มี network call และตรวจ source scan ว่าไม่ import `http`/`https`/`net`/`fetch` |
| เทสต์ | `node --test` กับ fixture สังเคราะห์: WER/CER ที่รู้คำตอบ, normalization Thai, timeout นับเป็น failure, adapter ด้วย fake engine script, receipt schema, source scan no-network |

## 5. Corpus manifest และ consent (template เท่านั้น)

- `corpus.manifest.template.json`: `id`, `language` (`th`/`en`/`code-switch`), `condition` (`quiet`/`game-audio`), `speaker` (pseudonym), `session`, `split` (`tuning`/`holdout`), `reference`, `intent`, `slots`, `wav`.
- `CONSENT-TEMPLATE.md`: ผู้พูดยินยอมให้บันทึกเพื่อวัด STT ในเครื่อง, ไม่เผยแพร่, ลบได้เมื่อขอ; เก็บไว้นอก Git.
- Holdout แยกตาม speaker/session ทั้งก้อน ตาม MVP-038 §4.

## 6. Privacy และความปลอดภัย

1. ไม่มี audio/transcript เข้า Git, G-Log, telemetry หรือ network
2. Harness ไม่ดาวน์โหลดอะไรเอง; path ของ binary/model มาจากผู้ใช้เท่านั้น
3. การดาวน์โหลด binary/model ของผู้สมัครลงเครื่อง dev ต้องได้รับอนุญาตจาก Boss ทีละรายการ (ชื่อไฟล์, แหล่ง, ขนาด) และเก็บใน directory แยก นอก repo
4. Binary ของบุคคลที่สามรันด้วย argument array (ไม่มี shell) และไม่รันจากใน directory ของ corpus

## 7. Acceptance criteria (Slice 3a)

- [ ] ตาราง §3 ปรับเป็นผลที่ยืนยันแล้ว: license ไฟล์จริง, SHA-256, ขนาด, ภาษา, ต่อผู้สมัครที่ Boss อนุญาตให้ดาวน์โหลด
- [ ] `node --test tools/g-voice-stt-bench` ผ่าน: WER/CER fixtures, Thai normalization, timeout/error ใน denominator, fake-engine adapter, receipt schema, no-network source scan
- [ ] harness รันกับ fake engine และ corpus สังเคราะห์แล้วได้ `receipt.json` ครบ field
- [ ] ไม่มีไฟล์ใน `src-tauri/` หรือ `src/` เปลี่ยน; `Cargo.lock`/`pnpm-lock.yaml` ไม่เปลี่ยน
- [ ] doc gate ผ่าน; MVP-038 worksheet ยังเขียนว่า "ยังไม่เลือก" (ไม่อ้างผล)

**ไม่อยู่ใน acceptance นี้ (Slice 3b, ต้องใช้คน):**
- บันทึก corpus จริง
- รัน benchmark บน reference tier
- เลือกผู้ชนะและปิด MVP-038

## 8. ข้อที่ขอให้ Boss ตัดสิน

1. **แนวทางภาษา:**
   - (a) โมเดล multilingual ตัวเดียว (C1) เป็นตัวหลัก: แนะนำ เพราะรองรับ code-switch และใช้ RAM โมเดลเดียว
   - (b) แยกโมเดลต่อภาษา (C3)
   - (c) ทดสอบทั้ง C1, C2 และ C3
2. **อนุญาตให้ดาวน์โหลด** engine และ model ของผู้สมัครที่เลือกจากข้อ 1 ลงเครื่อง dev นอก repo หรือไม่. ก่อนดาวน์โหลดจะแจ้งชื่อไฟล์, แหล่ง และขนาดทีละรายการ
3. **ภาษาของ harness:** Node (ไม่มี dependency ใหม่, สอดคล้อง `tools/` ส่วนใหญ่) หรือ Rust crate แยก
4. **Corpus:** Boss เป็นผู้พูด/จัดหาผู้พูดเอง (≥100 Thai + ≥100 English + code-switch, quiet และ game-audio) พร้อมเซ็น consent. ระบุ directory ที่จะเก็บนอก repo

### 8.1 มติ (2026-11-07)

1. ใช้ **C1 (whisper.cpp + Whisper small multilingual)** เป็นผู้สมัครหลัก; C2/C3 คงอยู่ใน long-list เป็นตัวเปรียบเทียบเมื่อผ่าน eligibility gate
2. อนุญาตหลักการดาวน์โหลดลงเครื่อง dev นอก repo **ทีละรายการ**; ทุกไฟล์ต้องแจ้งชื่อไฟล์, แหล่ง และขนาด แล้วรอ Boss ยืนยันรายการนั้นก่อนดาวน์โหลด (การอนุมัติ CR นี้ไม่ใช่การอนุญาตดาวน์โหลดไฟล์ใดไฟล์หนึ่ง)
3. Harness เขียนด้วย **Node** โดยไม่มี npm dependency ใหม่
4. Boss เป็นผู้พูดหรือจัดหาผู้พูด พร้อม consent; directory ของ corpus นอก repo ระบุตอนเริ่ม Slice 3b
5. (เพิ่ม 2026-11-07, Boss: "เพิ่ม C4 เลย") เพิ่ม **C4 faster-whisper** และ adapter `faster-whisper` ใน harness; อ่าน runtime ของ FUNG **แบบอ่านอย่างเดียว** ด้วย path ที่ผู้ใช้ระบุ ไม่คัดลอกเข้า repo ไม่แก้ไฟล์ใน FUNG และไม่ดาวน์โหลดโมเดลเพิ่มโดยไม่ได้รับอนุญาตทีละไฟล์

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-11-07 | Draft Slice 3a: STT candidate long-list under the 900 MB aggregate RAM ceiling, out-of-app Node benchmark harness contract, corpus/consent templates and decisions; no model selected, no app change. |
| 0.1.1 | 2026-11-07 | Boss approved the draft as written; recorded §8 decisions (C1 primary, per-file download confirmation, Node harness, Boss-provided corpus). |
| 0.1.2 | 2026-11-07 | Boss added candidate C4 (faster-whisper 1.2.1 via the FUNG staged runtime, read-only) and a faster-whisper harness adapter; large-v3-turbo is a quality-ceiling reference only. |

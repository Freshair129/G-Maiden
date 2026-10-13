---
title: "MVP-038 — Local STT Design and Evaluation Protocol"
doc_id: "MVP-038-local-stt-evaluation"
status: "draft"
version: "0.1.2"
updated: "2026-10-13"
owner: "Codex"
related_docs: ["mvp-decisions", "mvp-backlog", "mvp-execution-dag", "roadmap", "FEAT-G-VOICE", "engineering-spec"]
---

# MVP-038 — Local STT Design and Evaluation Protocol

> **สถานะ ณ 2026-10-11:** ตรวจ source และกำหนด protocol แล้ว แต่ยังไม่มีผล benchmark, corpus ที่รับรอง หรือผู้สมัคร STT ที่ผ่านการเลือก งาน MVP-038 จึงยังไม่ DONE และเอกสารนี้ยังไม่เลือก dependency/model

## 1. ขอบเขตและมติที่ใช้

เอกสารนี้แปลงเกณฑ์ที่รับแล้วใน [[mvp-decisions]] และ [[FEAT-G-VOICE]] ให้เป็นวิธีเปรียบเทียบ local STT ก่อนทำไมค์และ integration ใน MVP-039/040:

- G-Voice ใช้ไมค์เมื่อกด PTT เท่านั้น; ค่าเริ่มต้นคือ `Ctrl+Alt+V` และ `Alt+M` คงเป็น mute toggle
- audio, transcript, free-form utterance และ bounded local context อยู่ในเครื่อง; Voice ห้ามใช้ cloud STT, cloud interpretation หรือ cloud fallback
- เมื่อไม่มีโมเดล/อุปกรณ์/สิทธิ์ ให้แสดง unavailable หรือให้พูดใหม่อย่างชัดเจน; ห้ามดาวน์โหลดหรือเปิดไมค์เองโดยเงียบ
- G-Signal ต้องทำงานต่อได้โดยไม่พึ่ง STT, SLM หรือ cloud และต้อง preempt คำตอบ Voice ได้
- ไม่เปลี่ยน threshold ของ MVP-006; เกณฑ์เลือกผู้สมัครคือ English WER ≤15%, Thai CER ≤20%, intent/critical-slot accuracy ≥90%, completion ≥95% ต่อภาษา, คำตอบ warm ทุก turn ที่รับต้องเริ่มมีเสียงภายใน 2,000 ms และ cold preparation ≤10 s พร้อมสถานะเตรียมระบบ

MVP-038 จบได้เมื่อมีผู้สมัครที่เลือกพร้อมหลักฐานคุณภาพ, latency, resource, offline/privacy, license และ resource delivery บนเครื่องเป้าหมาย. การเขียนแผนอย่างเดียวไม่ปิด acceptance.

## 2. หลักฐานจาก source ที่ตรวจ

ตรวจ working tree `docs/mvp-038-local-stt-evaluation` บน `82ae5a4bb65ad266fbd009ea7366a972f0c8c695`:

| ประเด็น | หลักฐานปัจจุบัน | สิ่งที่สรุปได้ |
| --- | --- | --- |
| Capture/STT | `src-tauri/Cargo.toml` มี `rodio` สำหรับเสียงออกและ `tract-onnx` สำหรับ inference ที่มีอยู่; source ที่ตรวจไม่พบ microphone input capture หรือ STT path | Voice capture และ STT ยังไม่มี implementation ที่ยืนยันได้; `tract-onnx` ที่มีอยู่ไม่ใช่หลักฐานว่ามี STT |
| Hotkey | [`lib.rs`](../../../src-tauri/src/lib.rs#L797) ลงทะเบียน `Ctrl+Alt+S`, `Alt+↑`, `Alt+↓`, `Alt+M` | `Alt+M` เป็น mute; `Ctrl+Alt+V` ยังเป็น target ของ MVP ไม่ใช่ runtime ที่ทำแล้ว |
| TTS | [`tts.rs`](../../../src-tauri/src/tts.rs#L111) ค้นหา `piper.exe` และโมเดลในเครื่อง; [`speak_with_priority`](../../../src-tauri/src/tts.rs#L632) ลอง Piper ก่อนแล้ว fallback ไป SAPI | มี optional local TTS path แต่ไม่ใช่ microphone/STT; วิธีจัดส่ง Piper/model ยังต้องยืนยันบน clean install |
| Corpus/ผลวัด | ไม่พบ STT corpus, candidate receipt หรือผล benchmark ที่ผูกกับ target hardware ใน source ที่ตรวจ | ยังสรุปคุณภาพ, cold/warm latency, RAM, CPU, license หรือขนาดแพ็กเกจของ STT ไม่ได้ |

ข้อค้นพบนี้เป็น source inspection ไม่ใช่ผลทดสอบเครื่องหรือการยืนยัน distribution ที่ติดตั้งจริง.

## 3. Eligibility gate ก่อนนำผู้สมัครเข้า benchmark

บันทึก dependency, engine และ model เป็นคนละรายการ เพราะ license และขนาดอาจต่างกัน:

| ช่องข้อมูลต่อผู้สมัคร | หลักฐานที่ต้องแนบ |
| --- | --- |
| Capture API และ dependency | ชื่อ/รุ่น, Windows x64 ที่รองรับ, microphone device lifecycle, license และ dependency tree |
| STT engine/runtime | ชื่อ/รุ่นหรือ commit, CPU/GPU execution path, offline behavior, license, subprocess/network behavior |
| Model | ชื่อ/รุ่น, SHA-256, ภาษา/Thai-English code-switch coverage, model card/source, license และสิทธิ์ redistribution |
| Resource delivery | compressed/unpacked bytes, install footprint, peak loaded memory, ตำแหน่งไฟล์และผู้เป็นเจ้าของไฟล์ |
| Provisioning | bundled หรือ user-started setup/download ที่ระบุขนาดและแหล่งที่มา, progress/cancel/retry/offline failure; ห้าม silent download |
| Runtime boundary | ไม่มี remote endpoint; ไม่ส่ง audio/transcript ไป Claude, Ollama หรือบริการอื่น; ยกเลิกและปล่อยอุปกรณ์ได้เมื่อ PTT จบ |

นำเข้า benchmark เฉพาะผู้สมัครที่แสดง offline operation และเงื่อนไข license/distribution ได้ครบ. เปรียบเทียบอย่างน้อยสอง configurations ที่เข้า gate ถ้าหาไม่ได้ ให้บันทึกการค้นหาและเหตุที่เหลือผู้สมัครเดียว; ห้ามถือการมี library ใน `Cargo.lock` ว่าเป็นหลักฐาน license ของ model.

## 4. Corpus และ scoring protocol

### Corpus

1. สร้าง held-out set อย่างน้อย **100 utterances ต่อภาษา** ให้ตรง MVP-006; แยก Thai และ English และแสดงจำนวนตัวอย่างทุก condition.
2. ครอบคลุมเสียงพูดในสภาพเงียบและสภาพมีเสียงเกมที่ใกล้การเล่นจริง; รายงานผลแยก condition ด้วย ห้ามให้คะแนนเฉลี่ยรวมกลบกรณีเสียงเกม.
3. ใส่ศัพท์ที่ผู้เล่นพูดจริง เช่นชื่อฮีโร่ ไอเทม ตัวเลข เวลา และคำถามในเกม รวมตัวอย่าง Thai-English code-switch; รายงานจำนวนและผล code-switch แยก ไม่ใช้ตัวอย่างกลุ่มนี้แทนจำนวนขั้นต่ำของแต่ละภาษา.
4. แยก train/tuning/holdout ตาม speaker และ session ทั้งก้อน; คนหรือ session ใน holdout ห้ามปรากฏใน tuning. ตรึงเสียงอ้างอิง, transcript, label, normalization และ script scoring ก่อนเปิดผล candidate.
5. บันทึก consent สำหรับผู้พูด, microphone/device, ระดับเสียงและวิธีสร้างเสียงเกม. จัด corpus ไว้ local-only; ไม่ commit เสียง/transcript ที่ระบุตัวบุคคลหรือข้อมูลผู้เล่นเข้า Git.

### Metrics

- English: WER ≤15%; Thai: CER ≤20%. บันทึก normalization ที่ใช้ก่อนคำนวณและเก็บ raw score ไว้เทียบ; ห้ามแก้กติกาหลังเห็นผล.
- Intent และ critical slots: ≥90% ต่อภาษา. ระบุ intent/slot inventory และวิธีนับ exact match ก่อนรัน; รายงาน confusion และ slot omission/substitution แยก.
- รายงานทั้ง corpus aggregate และ per-speaker/per-session distribution; แสดงจำนวนตัวอย่างที่ตัดออกพร้อมเหตุผล. Timeout, no-speech, low-confidence และ decode error อยู่ใน completion denominator และรายงานแยก.
- ประโยคที่ไม่มั่นใจต้อง abstain/ขอพูดใหม่ตาม contract; การเดา transcript ที่เปลี่ยนความหมายไม่ใช่ completion ที่ผ่าน.

## 5. Latency และ resource protocol

ใช้ reference tier และการวัดตาม [[mvp-decisions]] §MVP-006: Windows x64 target, 6 physical/12 logical cores, RAM 16 GB, DXGI GPU, 1080p; บันทึก SKU, OS/build, driver, audio device, power mode, app/model hashes และสถานะ Dota/CV ทุก receipt. ห้ามอ้างผลข้ามเครื่องหรือข้าม OS ที่ยังไม่ได้วัด.

| Measurement | วิธีบันทึก / gate |
| --- | --- |
| Cold preparation | วัดตั้งแต่เริ่มเตรียม process/model ถึงพร้อมรับ PTT; ≤10 s และต้องมีสถานะ `preparing` ที่ผู้เล่นเห็น; timeout ยังอยู่ในผล |
| Warm turn | วัดตั้งแต่ PTT release → final transcript → answer-ready → first audible sample; ทุก accepted ready/warm turn ≤2,000 ms และ completion ≥95% ต่อภาษา |
| Component latency | บันทึก capture stop, STT start/end, local interpretation, TTS start และ audible onset ด้วย monotonic clock; รายงาน p50/p95/p99/max และจำนวนตัวอย่าง ไม่แยกช่วงช้าออกจาก end-to-end |
| Resource | warm-up 2 นาที แล้ว idle/live-CV/Voice+Signal เฟสละ 10 นาที ×3 runs, sampling ทุก 1 s; รายงาน process tree, STT child/model PID, aggregate peak Working Set และ incremental STT footprint |
| System limits | whole-app CPU ทุก 1 s ≤10% ตาม MVP-006; หาก Job Object setup/assignment ไม่สำเร็จ แอปต้องปฏิเสธ startup ก่อนเปิด Tauri/WebView หรือ sidecar; หาก runtime accounting query ล้มเหลวหลัง setup สำเร็จ ให้นับ CPU sample เป็น unavailable และห้ามนับ CPU gate ว่าผ่าน; aggregate peak Working Set ≤400,000,000 bytes รวม WebView2, feeder, STT/TTS/SLM และ external model processes; FPS impact ≤3% ตาม paired run ใน MVP-006 |
| Critical path | รัน Voice พร้อม G-Signal; STT เพิ่ม latency หรือ block GSI→G-Signal→cached alert ไม่ได้; ใช้ G-Signal thresholds และ hard max เดิม ไม่สร้างข้อยกเว้นให้ STT |

บันทึก warm/cold, accepted/rejected, quiet/game-audio และ language แยกกัน. ใช้ timeout ที่ตั้งไว้ก่อนรันและเก็บ timeout ทุกครั้งในผล. หาก resource limit ไม่ผ่าน ให้ลด/เปลี่ยน configuration หรือเปิดการตัดสินใจ requirement ใหม่; ห้ามนับ external model process ออกจากงบ.

## 6. PTT, privacy และ lifecycle contract สำหรับ integration

| State/event | พฤติกรรมที่ต้องตรวจใน MVP-039/040/042 |
| --- | --- |
| Idle | ไม่เปิด capture stream หรือรับเสียง; แสดงสถานะว่าไมค์ยังไม่ทำงาน |
| PTT down/up | ใช้ `Ctrl+Alt+V` เป็นค่าเริ่มต้น; กดค้างจึง capture และปล่อยแล้วหยุดทันที; ตรวจ collision และรองรับ remap; `Alt+M` ยังคง mute |
| Cancel/G-Signal interrupt | ยกเลิก decode/response ที่ค้าง, ล้าง buffer ของ turn นั้น และให้ G-Signal preempt เสียงโดยไม่รอ STT |
| Device permission/loss/model unavailable | แสดงข้อผิดพลาดหรือ unavailable แบบ local, ไม่ค้าง capture และไม่มี cloud fallback |
| App exit/end turn | ปล่อย mic handle; เก็บ audio/transcript ไว้ใน memory เท่าที่จำเป็นต่อ turn แล้วทิ้งเมื่อจบ/cancel/error; ไม่เขียนลง G-Log, history, crash log, telemetry หรือ cache |
| Network | Voice ต้องทำงาน/รายงาน unavailable ได้เมื่อ offline; ตรวจ outbound destinations ระหว่าง capture/decode/answer เพื่อพิสูจน์ว่าไม่มี audio/transcript egress |

ก่อน integration ต้องกำหนดขอบเขต audio buffer ด้วย duration/bytes และอายุสูงสุดที่ทดสอบแล้ว. Transcript ที่แสดงเป็น subtitle เป็นเพียง output ชั่วคราวและไม่กลายเป็น persistence.

## 7. Worksheet และ exit checklist

หนึ่งแถวต่อ candidate/configuration และผูกกับ exact app SHA:

| Candidate/config | Engine + model hashes/licenses | Package bytes | Thai CER / English WER | Intent/slot | Cold ready | Warm total p50/p95/max | Completion/language | CPU max | RAM peak | Offline/no-egress | Decision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ยังไม่มี — benchmark ไม่ได้รัน | — | — | — | — | — | — | — | — | — | — | ยังไม่เลือก |

ปิด MVP-038 ได้เมื่อครบทุกข้อ:

- [ ] corpus และ normalization ถูกตรึงก่อนให้คะแนน; ผล holdout แสดงแยกภาษา, acoustic condition และ code-switch
- [ ] มี candidate comparison receipt ที่ทำซ้ำได้บน reference tier พร้อม failures/timeouts ทั้งหมด
- [ ] candidate ที่เลือกผ่าน quality, latency, whole-app CPU/RAM/FPS และ offline/no-egress gates ของ MVP-006
- [ ] ระบุ dependency/model/version/hash/license, redistribution obligations, ขนาดที่ติดตั้งจริง และวิธี provision/remove
- [ ] ระบุ PTT `Ctrl+Alt+V`, collision/remap, mic permission/device-loss, cancel/interrupt และ transient-data cleanup
- [ ] บันทึกข้อจำกัดและ decision ต่อใน [[mvp-backlog]]; หากไม่มีผู้สมัครผ่าน ให้ task คงเปิดและเสนอการแก้ design/requirement แยกต่างหาก

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-10-11 | Defined a candidate-neutral local STT evaluation, corpus, resource, privacy, and exit protocol; no model selected and no benchmark claimed. |
| 0.1.1 | 2026-10-12 | Aligned the system CPU gate and unavailable-sample evidence rule with MVP decisions v0.2.0–0.2.1. |
| 0.1.2 | 2026-10-13 | Updated CPU setup-failure handling to fail startup and retained the unavailable-sample gate for runtime query failures. |

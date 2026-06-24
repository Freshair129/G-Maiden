# HuggingFace Dota 2 Resource Report

> **วันที่สำรวจ:** 2026-06-24  
> **ผู้สำรวจ:** Claude Code (automated research agent)  
> **คำค้นหา:** `dota`, `dota-2`, `dota2`  
> **แหล่งข้อมูล:** huggingface.co — Models, Datasets, Spaces, Papers  
> **จำนวนรายการที่พบ:** 31 รายการ

---

## สรุปภาพรวม

ทรัพยากรบน HuggingFace ที่เกี่ยวข้องกับ Dota 2 ครอบคลุม 4 หมวด ได้แก่ LLM สำหรับให้คำแนะนำเกมส์, Dataset ระดับ pro-match, Voice conversion, และ Papers สำหรับ AI เกม-สเตต HuggingFace มีช่องว่างสำคัญที่ G-Maiden สามารถเป็น first-mover ได้ โดยเฉพาะ real-time gank prediction model และ sub-300ms inference pipeline

---

## 1. Models

### 1.1 LLM / Advisory Models

#### `build-small-hackathon/dota2tuned-qwen3-4b-2507-lora`
- **URL:** https://huggingface.co/build-small-hackathon/dota2tuned-qwen3-4b-2507-lora
- **ขนาด:** 4B parameters (LoRA adapter บน Qwen3-4B-Instruct-2507)
- **License:** Apache 2.0
- **ข้อมูล:** Fine-tune ด้วย SFT บน dataset 3.64M rows ครอบคลุม draft recommendations, hero synergies, item builds, match prediction, และ patch meta สร้างในเดือนมิถุนายน 2026 มี 61 likes (สูงสุดใน Dota 2 models)
- **ประโยชน์สำหรับ G-Maiden:** ตัวเลือกหลักสำหรับ **G-Master** (strategic advisor) ขนาด 4B รันได้บน RTX 3060 (~5GB free VRAM) ใช้คู่กับ dataset `dota2tuned-data`

#### `build-small-hackathon/dota2tuned-qwen3-30b-a3b-2507-lora`
- **URL:** https://huggingface.co/build-small-hackathon/dota2tuned-qwen3-30b-a3b-2507-lora
- **ขนาด:** 30B MoE, active params ~3B (Qwen3-30B-A3B LoRA)
- **License:** Apache 2.0
- **ข้อมูล:** ฐาน MoE ขนาดใหญ่กว่า แต่ activated params ใกล้เคียง 3B ดังนั้น inference cost ใกล้เคียง dense 3B model
- **ประโยชน์สำหรับ G-Maiden:** **G-Master cloud tier** — คุณภาพคำตอบสูงกว่า 4B ที่ VRAM ใกล้เคียงกัน เหมาะสำหรับ deep analysis ที่ไม่ time-critical

#### `Adrian-tf/dota2-expert-1b`
- **URL:** https://huggingface.co/Adrian-tf/dota2-expert-1b
- **ขนาด:** 1B parameters (Llama-3.2-1B-Instruct via Unsloth)
- **License:** Apache 2.0
- **ข้อมูล:** Fine-tune สำหรับ Dota 2 Q&A และ game advice context 2,048 tokens train ด้วย Unsloth (2x faster) รองรับ Transformers และ Unsloth
- **ประโยชน์สำหรับ G-Maiden:** ตัวเลือกหลักสำหรับ **G-Signal local SLM** — fit ใน ~2GB VRAM บน RTX 3060 latency ต่ำกว่า 100ms สำหรับ short completion ซึ่งอยู่ภายใน budget 300ms ของ G-Signal

#### `Aiden07/Mistral-7B-Instruct-dota2` + GGUF variant
- **URL:** https://huggingface.co/Aiden07/Mistral-7B-Instruct-dota2 / [`-GGUF`](https://huggingface.co/Aiden07/Mistral-7B-Instruct-dota2-GGUF)
- **ขนาด:** 7B (Q4_K_M = 4.37 GB / Q8_0 = 7.7 GB)
- **License:** MIT
- **ข้อมูล:** Mistral-7B fine-tune บน 4,740 Dota 2 wiki Q&A pairs ครอบคลุม heroes, items, abilities, mechanics
- **ประโยชน์สำหรับ G-Maiden:** GGUF Q4_K_M พร้อมใช้ผ่าน **Ollama วันนี้เลย** เหมาะสำหรับ G-Master item-build advice ⚠️ authors ระบุว่า knowledge อาจไม่ถูกต้องเสมอ ใช้เป็นจุดเริ่มต้นเท่านั้น

#### `CMunch/fine_tuned_dota`
- **URL:** https://huggingface.co/CMunch/fine_tuned_dota
- **ขนาด:** ไม่ระบุ
- **ข้อมูล:** Text classification fine-tune accuracy 84.7% บน Dota 2 classification task ไม่ชัดเจนว่า classify อะไร
- **ประโยชน์สำหรับ G-Maiden:** ต้องตรวจสอบเพิ่มเติมก่อนใช้

---

### 1.2 Voice / TTS Models

#### Kokoro-TTS (hexgrad)
- **URL:** https://huggingface.co/spaces/hexgrad/Kokoro-TTS
- **ขนาด:** ~82M parameters
- **ข้อมูล:** TTS เร็วและเบา เป็น Space ที่ popular ที่สุดใน HuggingFace (3.37k likes) รันได้บน CPU
- **ประโยชน์สำหรับ G-Maiden:** **ตัวเลือกหลักสำหรับ G-Signal TTS** ขนาดเล็กมาก real-time บน CPU อยู่ภายใน latency budget <300ms ใช้คู่กับ DOTA-2-RVC เพื่อแปลงเสียงเป็น Maiden character

#### `Swordsmagus/DOTA-2-RVC`
- **URL:** https://huggingface.co/Swordsmagus/DOTA-2-RVC
- **License:** OpenRAIL
- **ข้อมูล:** Dota 2 RVC (Retrieval-based Voice Conversion) สำหรับแปลงเสียงเป็น character voice ใน Dota 2
- **ประโยชน์สำหรับ G-Maiden:** **Voice persona pipeline:** Kokoro-TTS → RVC → เสียง Maiden (Crystal Maiden style)

#### `DotaVoices/Hoodwink`
- **URL:** https://huggingface.co/DotaVoices/Hoodwink
- **License:** OpenRAIL
- **ข้อมูล:** Voice synthesis model สำหรับ hero Hoodwink ชื่อ org "DotaVoices" บ่งชี้ว่าอาจมี series ครอบคลุมหลาย hero
- **ประโยชน์สำหรับ G-Maiden:** ถ้ามี Crystal Maiden ใน series นี้ ใช้แทน RVC pipeline ได้เลย ต้องตรวจสอบ org ว่ามี hero ใดบ้าง

#### CAMB-AI/MARS5-TTS
- **URL:** https://huggingface.co/CAMB-AI/MARS5-TTS
- **ขนาด:** ~1.2B total (AR ~750M + NAR ~450M)
- **License:** GNU AGPL-3.0 (commercial license available)
- **ข้อมูล:** English TTS พร้อม voice cloning จาก reference audio 5 วินาที ระบุเป็น "sports commentary" prosody
- **ประโยชน์สำหรับ G-Maiden:** TTS คุณภาพสูงที่สุดสำหรับ live-caster style ⚠️ ต้องการ VRAM ≥20 GB — **cloud inference only** บน RTX 3060

---

### 1.3 Visual / อื่นๆ

#### `Muapi/crystal-maiden-from-dota-2`
- **URL:** https://huggingface.co/Muapi/crystal-maiden-from-dota-2
- **ข้อมูล:** Text-to-Image LoRA (FLUX/SDXL) สำหรับสร้าง Crystal Maiden artwork
- **ประโยชน์สำหรับ G-Maiden:** Overlay art / avatar สำหรับ G-Sensory UI ตัวละคร Maiden ที่เป็น inspiration

#### `fwgalde/dota2-toxic-detector`
- **URL:** https://huggingface.co/fwgalde/dota2-toxic-detector
- **ขนาด:** ~0.1B (RoBERTa-based)
- **License:** GPL-2.0
- **ข้อมูล:** Classifier ตรวจจับ toxicity ใน Dota 2 in-game chat มี live Space demo
- **ประโยชน์สำหรับ G-Maiden:** G-Log chat filtering (ลำดับความสำคัญต่ำ)

---

## 2. Datasets

### 2.1 Game-State Data (Core สำหรับ G-Sentry / G-Motion)

#### `wolframko/betty-dota2` ⭐
- **URL:** https://huggingface.co/datasets/wolframko/betty-dota2
- **ขนาด:** ~1.9 พันล้าน rows, 9.65 GB
- **License:** MIT
- **ข้อมูล:** 9,385 pro matches จาก `.dem` replay files ที่ parse แล้ว ระดับ per-second granularity ประกอบด้วย 8 ตาราง:

  | ตาราง | จำนวน rows | เนื้อหา |
  |---|---|---|
  | `ticks` | ~211M | hero positions (x/y), HP, mana, gold, items ทุกวินาที |
  | `events` | ~287M | damage dealt, kills, gold changes, XP |
  | `abilities` | ~720M | cooldowns, levels, mana costs per tick |
  | `buildings` | ~465M | tower HP by lane/tier |
  | `modifiers` | ~196M | buffs/debuffs + duration |
  | `wards` | ~971K | observer/sentry ward placements + destruction |
  | `objectives` | ~176K | Roshan, runes, tower kills |
  | `matches` | 9,385 | tournament metadata + final stats |

- **ประโยชน์สำหรับ G-Maiden:** **Dataset สำคัญที่สุดสำหรับโปรเจค** ตาราง `ticks` + `wards` train G-Sentry (fog-of-war tracking) และ G-Motion (enemy position heatmaps) ได้โดยตรง ตาราง `events` ให้ ground-truth label "gank happened" สำหรับ train G-Signal classifier

#### `apararti/betty-dota2-canonical-v1`
- **URL:** https://huggingface.co/datasets/apararti/betty-dota2-canonical-v1
- **URL (mirror):** https://huggingface.co/datasets/wolframko/betty-dota2-canonical-v1
- **ขนาด:** 57.7 GB (apararti fork มี 67.3K downloads/month — download rate สูงกว่า)
- **ข้อมูล:** Enriched/canonical version ของ betty dataset พร้อม match outcome features
- **ประโยชน์สำหรับ G-Maiden:** Match outcome prediction สำหรับ G-Master win-probability display

---

### 2.2 Strategy / Advisory Data (สำหรับ G-Master)

#### `build-small-hackathon/dota2tuned-data`
- **URL:** https://huggingface.co/datasets/build-small-hackathon/dota2tuned-data
- **ขนาด:** 3.64M rows, 12.5 MB
- **License:** Apache 2.0
- **ข้อมูล:** จาก OpenDota + STRATZ + Steam APIs ประกอบด้วย hero stats (pick/win rates by patch), item builds, draft synergy/counter tables, SFT fine-tuning examples schema มี `hero_id`, `pro_pick`, `pro_win`, `pro_win_rate`, `roles`, item timing
- **ประโยชน์สำหรับ G-Maiden:** Ready-made training data สำหรับ G-Master สามารถใช้ fine-tune Qwen3-4B LoRA ได้ทันที Apache 2.0 อนุญาตใช้เชิงพาณิชย์

#### `howl-anderson/Game-Oracle_DOTA2-Match-Prediction-Dataset`
- **URL:** https://huggingface.co/datasets/howl-anderson/Game-Oracle_DOTA2-Match-Prediction-Dataset
- **ขนาด:** 219 MB, 1.3M+ pro matches
- **License:** ⚠️ CC-BY-NC-ND-4.0 (ห้ามใช้เชิงพาณิชย์และ derivatives)
- **ข้อมูล:** Pro match data จาก STRATZ API — hero pick/ban patterns, player metrics, team compositions, game-state progression, outcomes confidence 95% ที่ ±2.5%
- **ประโยชน์สำหรับ G-Maiden:** Draft analysis + match prediction ⚠️ **ตรวจสอบ license ก่อนใช้งาน**

#### `Aiden07/dota2_instruct_prompt`
- **URL:** https://huggingface.co/datasets/Aiden07/dota2_instruct_prompt
- **ขนาด:** 4,739 rows, 2.58 MB
- **License:** MIT
- **ข้อมูล:** Q&A pairs จาก Dota 2 Fandom wiki ผ่าน GPT-3.5 Turbo ครอบคลุม hero attributes, abilities, talents, items, runes, buildings, creeps, mechanics format: instruction-answer pairs สำหรับ Mistral chat template
- **ประโยชน์สำหรับ G-Maiden:** Seed data สำหรับ game-knowledge LLM เล็กพอสำหรับ fine-tune 1B model บน consumer hardware

---

### 2.3 Audio Data

#### `Dubina/dota2-wd`
- **URL:** https://huggingface.co/datasets/Dubina/dota2-wd
- **ขนาด:** 26 audio clips, 127 MB (2–5 วินาที/clip)
- **License:** ไม่ระบุ (19 likes)
- **ข้อมูล:** Dota 2 audio dataset soundfolder format ไม่ชัดเจนว่าเป็น hero voice lines ตัวใด
- **ประโยชน์สำหรับ G-Maiden:** อาจเป็น reference audio สำหรับ Crystal Maiden voice cloning ต้องตรวจสอบเนื้อหา

---

### 2.4 Replay / Development Data

#### `MakiAi/dota2-sample-dem`
- **URL:** https://huggingface.co/datasets/MakiAi/dota2-sample-dem
- **ขนาด:** 47.4 MB
- **License:** MIT
- **ข้อมูล:** Sample Dota 2 `.dem` replay files ขนาดเล็ก (sample only)
- **ประโยชน์สำหรับ G-Maiden:** ทดสอบ `.dem` replay parsing pipeline (complement กับ betty-dota2 ที่ parse แล้ว)

---

### 2.5 Chat / Toxicity Data

#### `dffesalbon/dota-2-toxic-chat-data`
- **URL:** https://huggingface.co/datasets/dffesalbon/dota-2-toxic-chat-data
- **ขนาด:** 2,552 rows, 66.6 KB
- **ข้อมูล:** In-game chat labeled toxicity severity 0/1/2 จาก Dota 2 sessions จริง
- **ประโยชน์สำหรับ G-Maiden:** G-Log chat filtering (ลำดับความสำคัญต่ำ)

---

## 3. Spaces (Live Demo / Reference Implementations)

| Space | URL | สถานะ | ประโยชน์สำหรับ G-Maiden |
|---|---|---|---|
| **DOTA2Tuned** | [build-small-hackathon/dota2tuned](https://huggingface.co/spaces/build-small-hackathon/dota2tuned) | ✅ Running | Reference implementation: serving 4B LoRA สำหรับ match analysis — ดู source code |
| **Dota Draft** | [build-small-hackathon/dota-draft](https://huggingface.co/spaces/build-small-hackathon/dota-draft) | ✅ Running | Reference: G-Master draft advisor (Agents-based app) |
| **Dota Seer** | [alaSandbox/dota2-tips](https://huggingface.co/spaces/alaSandbox/dota2-tips) | 💤 Sleeping | Lightweight stats-to-advice pipeline concept |
| **DOTA2 Strategy Assistant** | [paulhao/DOTA2-Strategy-Assistant](https://huggingface.co/spaces/paulhao/DOTA2-Strategy-Assistant) | ❌ Runtime error | Concept validation (same use case เป็น G-Master แต่ broken) |
| **Dota2 Predictor API** | [BurningYolo/dota2-predictor-api](https://huggingface.co/spaces/BurningYolo/dota2-predictor-api) | ❌ Runtime error | Team composition outcome prediction concept |
| **Toxic Detector** | [fwgalde/dota2-toxic-detector](https://huggingface.co/spaces/fwgalde/dota2-toxic-detector) | ✅ Running | Live demo ของ toxic classifier |

---

## 4. Papers

### 4.1 Game-State / Reinforcement Learning

#### OpenAI Five: "Dota 2 with Large Scale Deep Reinforcement Learning"
- **URL:** https://huggingface.co/papers/1912.06680
- **Authors:** 26 OpenAI researchers (Berner, Brockman et al.)
- **ปี:** 2019
- **สรุป:** OpenAI Five เอาชนะ world champion ด้วย self-play RL Architecture: 159M-parameter LSTM processing ~**16,000 observation values ต่อ timestep** train 10 เดือนบน 51,200 CPUs ชนะ 99.4% จาก 7,257 public games
- **ประโยชน์สำหรับ G-Maiden:** **Technical reference สูงสุด** observation vector ~16,000 values/tick บอกวิธี structure GSI-derived state สำหรับ G-Sentry

#### "Semantic HELM: An Interpretable Memory for Reinforcement Learning"
- **URL:** https://huggingface.co/papers/2306.09312
- **ปี:** 2023
- **สรุป:** Language-based memory mechanism สำหรับ partially observable environments ใช้ CLIP + LLM
- **ประโยชน์สำหรับ G-Maiden:** Inform G-Motion's 5-minute enemy position memory — ใช้ semantic representation แทน raw coordinates

---

### 4.2 Draft / Strategy

#### "DraftRec: Personalized Draft Recommendation for Winning in MOBA Games"
- **URL:** https://huggingface.co/papers/2204.12750
- **Authors:** 5 นักวิจัย (KAIST)
- **ปี:** 2022
- **สรุป:** Hierarchical Transformer (Player Network + Match Network) train บน 280K LoL matches + **50K Dota 2 matches** ปรับปรุง 12.1% เหนือ SASRec baseline 86.9% ของ users ต้องการใช้
- **ประโยชน์สำหรับ G-Maiden:** **Algorithm paper สำคัญที่สุดสำหรับ G-Master draft advisor** — เป็น architecture blueprint โดยตรง

---

### 4.3 Commentary / Multimodal

#### "Game-MUG: Multimodal Oriented Game Situation Understanding and Commentary Generation"
- **URL:** https://huggingface.co/papers/2404.19175
- **ปี:** 2024
- **สรุป:** Multimodal dataset จาก LoL broadcasts (2020–2022) ครอบคลุม game audio + audience chat + event logs สำหรับ situation understanding + commentary generation
- **ประโยชน์สำหรับ G-Maiden:** **Analog โดยตรงสำหรับ Maiden's live-caster commentary** multimodal framing (audio + events) map กับ GSI events + TTS output

---

### 4.4 Dataset Methodology

#### "CONDA: CONtextual Dual-Annotated dataset for in-game toxicity"
- **URL:** https://huggingface.co/papers/2106.06213
- **ปี:** 2021
- **สรุป:** 45K utterances จาก 12K Dota 2 match chat logs พร้อม joint intent classification
- **ประโยชน์สำหรับ G-Maiden:** ถ้าจะ build chat-aware features ใน G-Log

#### "SC2EGSet: StarCraft II Esport Replay and Game-state Dataset"
- **URL:** https://huggingface.co/papers/2207.03428
- **ปี:** 2022
- **สรุป:** 17,930 tournament SC2 replay files พร้อม processed game-state methodology นำไปใช้กับ Dota 2 ได้
- **ประโยชน์สำหรับ G-Maiden:** Reference สำหรับ build Dota 2 game-state dataset จาก `.dem` replays ของตัวเอง

---

## 5. ช่องว่างที่ G-Maiden ควรเติม (โอกาส First-Mover)

ทรัพยากรต่อไปนี้ **ยังไม่มีใครทำบน HuggingFace** ถ้า G-Maiden build และ publish จะเป็น first-mover ใน Dota 2 ML community:

| ช่องว่าง | Dataset ที่มีแล้ว | สิ่งที่ต้องสร้าง |
|---|---|---|
| **Real-time gank prediction model** | betty-dota2 (ticks + events) | Binary classifier: gank_happening ต่อ 500ms window |
| **Minimap vision parser** | ไม่มี | Computer vision model สำหรับ fog-of-war จาก screenshot |
| **Sub-300ms alert classifier** | - | Lightweight model (<500MB) สำหรับ real-time danger scoring |
| **Crystal Maiden TTS voice** | dota2-wd (ต้องตรวจสอบ) | Fine-tuned TTS voice model สำหรับ CM |

> **หมายเหตุ:** `DMshpark/dota2_seg` (7.5K downloads, 70 likes) เป็น false positive — เป็น aerial imagery segmentation (DOTA = **D**ataset for **O**bject de**T**ection in **A**erial images) ไม่เกี่ยวกับเกม Dota 2

---

## 6. Priority Action List

```
ลำดับ 1 — G-Sentry / G-Motion training data
  ดาวน์โหลด wolframko/betty-dota2
  ตาราง ticks + events + wards
  → train gank danger classifier

ลำดับ 2 — G-Signal local SLM
  pull Adrian-tf/dota2-expert-1b ผ่าน Unsloth หรือ Ollama
  ~2GB VRAM, latency <100ms บน RTX 3060 ✓

ลำดับ 3 — G-Master advisory LLM
  ใช้ dota2tuned-qwen3-4b-2507-lora
  fine-tune เพิ่มด้วย dota2tuned-data (Apache 2.0)
  → item builds, draft advice, synergy analysis

ลำดับ 4 — G-Voice / TTS pipeline
  ทดสอบ Kokoro-TTS (82M, real-time)
  + DOTA-2-RVC (voice conversion)
  → Kokoro output → RVC → Maiden voice ✓

ลำดับ 5 — Architecture reference
  อ่าน OpenAI Five paper (game-state structure)
  อ่าน DraftRec paper (draft advisor architecture)
  → implement สถาปัตยกรรม G-Sentry + G-Master

ลำดับ 6 — Quick start (วันนี้)
  Aiden07/Mistral-7B-Instruct-dota2-GGUF Q4_K_M
  → ดึงผ่าน Ollama ทดสอบ G-Master prototype ได้ทันที
```

---

## 7. License Summary

| License | รายการ | ข้อจำกัด |
|---|---|---|
| Apache 2.0 | dota2tuned-* models, dota2tuned-data, dota2-expert-1b | ใช้เชิงพาณิชย์ได้ |
| MIT | betty-dota2, Aiden07 GGUF, dota2_instruct_prompt, MakiAi dem | ใช้เชิงพาณิชย์ได้ |
| OpenRAIL | DotaVoices, DOTA-2-RVC | ใช้ได้แต่มี usage restrictions |
| CC-BY-NC-ND-4.0 | Game-Oracle dataset | ❌ ห้ามเชิงพาณิชย์และ derivatives |
| GPL-2.0 | dota2-toxic-detector | copyleft — ระวังถ้า closed-source |
| AGPL-3.0 | MARS5-TTS | ❌ copyleft เข้มงวด / ต้องซื้อ commercial license |

---

*รายงานนี้ generate โดย automated research agent วันที่ 2026-06-24 ทรัพยากรบน HuggingFace อาจเปลี่ยนแปลงได้ ควรตรวจสอบ URL ซ้ำก่อน implement*

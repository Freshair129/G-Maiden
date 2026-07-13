# 2026-07-13 B — G-Ann Event Mapping + Banner (banner override → animated-WebP bake → W4 label)

> ⚠️ **งาน session นี้อยู่ใน repo พี่น้อง `G:\G-Suite\packages\ann-studio` (G-AnnStudio) ไม่ใช่ G-Maiden.**
> บันทึกใน brain ของ G-Maiden เพราะ G-Ann คือเครื่องมือผลิต voice pack + banner ให้ G-Maiden.
> **ต่างจาก session ก่อนหน้า (2026-07-13 A mastering deck): รอบนี้ committed + pushed ขึ้น G-Suite remote จริง.**

## Entry point
ต่อจาก 2026-07-13 A (mastering deck complete). Boss สั่ง "เริ่ม event mapping + banner เลย" แล้ว
สั่งต่อทีละชิ้น: banner override → animated-WebP bake → W4 OCR label → commit → push.
ของพื้นฐานมีแล้ว (EventTestGrid, tone banners 23, `install_gmaiden_pack` เขียน manifest pack จริง จาก commit `be37053`).

## สิ่งที่ทำ (3 commit บน G-Suite `main`, pushed `be37053..8c1c11a`)

### 1. Banner override rail — `ce65e3d`
- **จุดสำคัญที่เจอ**: ฝั่ง Rust `install_gmaiden_pack` รับ `banners[]` = `{event, b64, ext}` และเขียน ext
  png/webp/gif/apng อยู่แล้ว (lib.rs:691-713) → **override + animated รองรับ backend แล้ว**; ช่องว่างจริง
  = frontend ส่งแต่ tone-banner PNG อัตโนมัติ ไม่มีทางให้ author ใส่ภาพเอง.
- store: `bannerOverrides: Record<event,{b64,ext,mime}>` + `setBannerOverride` + persist เข้า project.
- EventTestGrid: ปุ่ม "แทนภาพเอง/เปลี่ยน/ล้าง" ต่อการ์ด (file input, png/webp/gif/apng) + preview บนการ์ด+เวที
  + badge "ภาพเอง·ext" + นับใน header. exportGmaidenPack: override ชนะ tone banner ต่อ event.
- **APNG → normalize เป็น png**: G-Maiden `image_mime` (voice_api.rs:948) รองรับ png/webp/gif แต่**ไม่มี apng**
  (จะตกเป็น octet-stream = ภาพแตกใน overlay). APNG เป็น PNG container ที่ Chromium/WebView2 เล่นภายใต้
  image/png → normalize ตั้งแต่ต้นทาง.

### 2. Animated-WebP bake — `792214b`
- ตอน install: event ที่ไม่มี override → bake **animated WebP** แทน static PNG: 12 เฟรมของ
  `drawToneBanner(progress 0→1)` (entrance slide-up+fade ที่ปูใน `progress` param) → ffmpeg `libwebp_anim`
  (lossless, `-loop 1` เล่นครั้งเดียวแล้วค้าง). Rust cmd ใหม่ `bake_animated_webp` (frames b64 → temp dir →
  webp b64), register ใน handler. frontend `lib/bakeBanner.ts` (offscreen canvas → เรียก cmd).
  exportGmaidenPack priority: **override image > baked webp > static PNG** (bake fail = fallback PNG).
  UI toggle "banner เคลื่อนไหว" (default เปิด).

### 3. W4 HoN→Dota announcer-label resolver — `8c1c11a`
- `lib/honEventMap.ts` `matchAnnouncerLabel(raw) -> eventId|null`: HoN streak ladder ≈ 1:1 กับ Dota,
  multikill map ตามจำนวนศพ (**Quad=ultra_kill, Annihilation=rampage**). ทน OCR noise (case/วรรค/
  เครื่องหมาย), whole-word membership กัน "kill" เดี่ยวหลุดเป็น killing_spree. event label/id ของ Dota resolve ได้.
- `autoMapEvents` เพิ่ม **deterministic pass ก่อน LLM**: clip ที่ชื่อมีป้าย announcer → map ทันที,
  เหลือส่ง LLM แล้วรายงานแยก "กี่อันจากป้าย/กี่อันจาก AI" → แม่นขึ้น + ลด LLM load.
- **OCR frame-reader (`detect_buttons.py`) ยังไม่ทำ** — เป็น env-dependent (ต้อง sample video + OCR engine
  ใน sidecar venv + ROI calibration). contract เขียนใน `sidecar/README.md`: sidecar ปล่อย raw label text
  อย่างเดียว, resolve ที่ honEventMap.ts ที่เดียว (single source of truth).

## Verify (gate ที่รันจริง)
| Gate | ผล |
| --- | --- |
| `npx tsc --noEmit` (G-Ann src/) ทุกรอบ | ✅ exit 0 |
| `cargo check` (src-tauri) | ✅ exit 0 |
| ffmpeg bake exact args บน ffmpeg-static จริง | ✅ valid animated WebP 6030B |
| WebP container inspect | ✅ VP8X `0x12`=alpha+anim · **12 ANMF** · loop=1 |
| WebP alpha ramp (Pillow decode) | ✅ frame0 (0,0) → frame11 (253,253) = fade-in + alpha ครบ |
| resolver → CJS แล้วรัน node | ✅ **36/36** (HoN button/OCR noise/dropped-word/Dota-native/negative) |
| live in-game (banner เด้ง/เสียง) + drag | ❌ ต้อง Boss เปิด Tauri — browser preview รัน Tauri app นี้ไม่ได้ |

## Key facts / กับดักที่กันไว้ (session นี้)
- **`-loop` ต้องอยู่หลัง `-i`** (encoder option = webp loop count) ไม่งั้นเป็น image-demuxer input-loop.
- **`-start_number 0`** จำเป็น — image2 demuxer default start=1 จะทิ้ง frame 0 (เฟรมโปร่งใสตอนเริ่ม entrance).
- **ALPH chunk = 0 เป็นเรื่องปกติของ lossless webp** — VP8L เก็บ alpha inline ไม่มี ALPH chunk แยก;
  เช็ก VP8X flag bit 0x10 แทน (อย่าเข้าใจผิดว่า alpha หาย).
- **ffmpeg-static ไม่มี ffprobe + decoder อ่าน animated webp ไม่ได้** (ข้อจำกัด ffmpeg) → verify ต้อง
  container-inspect + Pillow (decoder อิสระ เหมือน Chromium/WebView2 ในเกม).
- **G-Maiden มี event `kill` เดี่ยวจริง** — resolver คืน "kill"→kill ถูกต้อง (เกือบจด false-fail).
- **Node 24 type-strip อ่าน extensionless import ไม่ได้** → verify TS logic ด้วยการ compile→CJS ก่อนรัน node
  (ไม่ใช่รัน .ts ตรง). vitest ไม่มีใน G-Ann frontend.

## สิ่งที่ทำ (เพิ่มเติม — banner-build "ตาม voice" 3 แบบ, pushed `8c1c11a..e5d8606`)

Boss ถาม "banner เราจะ build ยังไง เริ่มจาก build ตาม voice ก็ได้" → ถาม interpretation
(AskUserQuestion) → ตอบ **"ทั้งหมดเลย"** → สร้าง 3 แบบเรียงตาม dependency+risk:

### 4. Voice-caption banner — `5a33047`
- `drawToneBanner` รับ optional `caption` = transcript จริงที่ voice พูด (clip แรกของ event)
  แทน `EVENT_THAI` คงที่ + `fitText` auto-truncate ellipsis ให้พอดี panel. ผ่าน static PNG +
  animated bake + preview กริด/เวที + toggle "ข้อความจาก voice" (default on) → install.

### 5. Audio-reactive banner — `d05869d`
- `drawToneBanner` รับ optional `BannerWave {env, head}`: waveform strip + border-glow **เต้นตาม
  loudness** ที่ playhead. `peaks.ts clipEnvelope()` downsample [start,end] → normalized buckets.
  `bakeReactiveWebp` bake เฟรมตามความยาว clip (playhead sweep) encode `loop=0` (pulse ต่อเนื่อง).
  Rust `bake_animated_webp` เพิ่ม `loop_count` (0=forever, default 1). **live preview เวทีซิงก์เสียงจริง**
  (`ReactiveBanner` rAF อ่าน `audio.currentTime`). priority: override>reactive>entrance>PNG.

### 6. AI banner art (Stable Diffusion) — `e5d8606`
- `bannerPrompt.ts` (pure, mood ตาม tone ladder) → Rust `generate_banner_image` ยิง SD WebUI
  A1111 `/sdapi/v1/txt2img` → base64 PNG → เป็น `bannerOverride` (ไหลผ่าน pipeline เดิม). ปุ่ม
  "✨ AI" ต่อการ์ด + SD endpoint field ใน Settings (store `sdEndpoint`, default `127.0.0.1:7860`).
  **backend env-dependent** — ต้องมี SD WebUI รัน `--api` ถึงสร้างภาพจริง (Boss verify).

Verify เพิ่ม: tsc 0 ทุก commit · cargo 0 (#5 loop, #6 txt2img) · reactive bake `loop=0` บน
ffmpeg-static จริง (VP8X 0x12, 12 ANMF, loop=0) · `bannerPrompt` compiled+asserted **8/8**
(mood/subject/text-free ทุก event). Node 24 อ่าน extensionless import ไม่ได้ → compile→CJS ก่อนรัน.

### 7. W4 button-OCR frame reader — `2b42a34` (grounded บนวิดีโอจริง)
- `sidecar/detect_buttons.py`: อ่านปุ่ม active ต่อ line window — OCR button panel (rapidocr-onnxruntime,
  ONNX ไม่ต้อง PyTorch/tesseract) → label+ตำแหน่ง; หา **cursor ทองแบบ Dota** (warm blob R>G>B) → ปุ่มที่ใกล้สุด,
  vote หลาย sample. emit **raw label** → resolve ที่ `matchAnnouncerLabel` (single source). contract mirror
  detect_boundaries.py (`--windows` in, `{labels:[{startMs,endMs,label,cursor,conf}]}` out). ROI+cursor thr = params.
- `honEventMap`: `norm()` split camelCase (OCR ต่อคำ "DoubleTap"/"HatTrick") + "hat trick"→triple_kill.
- **Mechanic ที่เจอจากเฟรมจริง** (KOM 1280x720): HoN preview UI = grid ปุ่ม fixed (bottom-right panel),
  user คลิกทีละปุ่ม, cursor ทองชี้ปุ่ม active, caption เขียว = บทพูด (ที่ W1 จับ). ปุ่ม active = ตาม cursor ไม่ใช่ order.
- **Verify e2e จริง**: detect_boundaries→11 windows→detect_buttons **label ครบ 11/11 มี cursor** (Hat Trick,
  Bloodlust, Double Tap, Immortal, Annihilation, Genocide, Smackdown, Humiliation…). OCR อ่านปุ่ม 9/9.
  resolver 17/17 (camelCase+hat trick). tsc 0.
- **honest**: OCR noise บางคำ (Annihilation→Ansihilation) → เพี้ยนหนัก resolve null (author map เอง = by design).
  HoN events หลายตัว (Bloodlust/Immortal/Genocide/Smackdown/Humiliation/Denied) ไม่มี G-Maiden equivalent → null ตั้งใจ.
- **ยังไม่ wire**: Rust wrapper chain W1→whisper→W4 (W1 ก็ไม่มี wrapper) = integration task แยก.
- **installed rapidocr-onnxruntime ใน sidecar `.venv`** (gitignored) + เพิ่มใน requirements.txt.

### 8. Vision-pipeline wrapper + authoring/library UX (`7f0f117..e4c0620`)
Boss ขอ: (a) Rust wrapper chain W1→whisper→W4, (b) save-to-library ที่ใช้ได้จริง แยกตามเจ้าของเสียง,
(c) หน้าทดสอบเพิ่มเสียงได้, "Design UX/UI flow ตรงนี้ด้วย". → ถาม design (AskUserQuestion) ยืนยัน:
**package name = เจ้าของเสียง** (ไม่แตะ schema) + **หน้าทดสอบ = library pack builder (ลาก+add)**.
- **`7f0f117` `analyze_video`** — tauri cmd orchestrate 3 sidecar (spawn_sidecar helper): detect_boundaries
  → transcribe → detect_buttons, fuse per window เป็น clips {start,end,text,label}. คืน [] ถ้า vision ไม่เจอ
  window (fallback whisper). detect_buttons fail = label ว่าง ไม่ error. frontend `runAnalyzeVideo` resolve
  label→event ผ่าน matchAnnouncerLabel. ปุ่ม "แยกอัตโนมัติ" ใช้ vision เมื่อ source เป็นวิดีโอ (VIDEO_EXT).
  **verified e2e KOM: 11 windows fused** (Hat Trick→triple_kill + ข้อความไทยจาก whisper).
- **`9a55927` Save to Library (Phase A+B)** — 🔴 **root cause: `SaveToLibDialog` ถูก mount แค่ใน `ClipList.tsx`
  ที่ `App.tsx` ไม่เคย render** → หน้า authoring มีแค่ Export/Install. แก้: ปุ่ม Save to Library ใน SourceView +
  relabel dialog "ชื่อเจ้าของเสียง" + guard ตอน import (confirm ก่อนล้าง clip ค้าง = กันเสียงปน).
- **`e4c0620` Test-screen pack builder (Phase C)** — store `packBuilder` (event→LibSound[], persisted) +
  การ์ด event = drop target (drag `application/x-library-sound-json`) + picker "+ เพิ่มเสียงจากคลัง" + ✕ +
  ปุ่ม "ติดตั้งจากคลัง". Rust `install_library_pack` = **copy library wav (canonicalize+contain ใต้ sounds_dir)**
  แทน ffmpeg cut (library sound เป็นไฟล์แยก ไม่ใช่ source เดียว) + banner/manifest เหมือน install_gmaiden_pack.
  `installLibraryPack` banner = override→animated tone→PNG (ยังไม่รวม caption/reactive — library sound ไม่มี window).
- gotcha: closure-returning-future ใน Rust ติด lifetime → ใช้ free async fn `spawn_sidecar` แทน.

### 9. Library banner caption/reactive — `ef905f2`
`installLibraryPack` รองรับ banner ครบเท่า session path: caption = ชื่อ library sound ตัวแรกของ event,
reactive = `clipEnvelope(abs, 0, dur, dur)` ของทั้งไฟล์ (library sound = wav ทั้งไฟล์) → `bakeReactiveWebp`.
priority override→reactive→animated→PNG. ปุ่ม "ติดตั้งจากคลัง" ส่ง toggle animate/voiceCaption/reactive.
pure frontend, ใช้ building block ที่พิสูจน์แล้ว. tsc 0.

## State ปลาย turn
- **G-Suite**: `main` sync กับ `origin/main` (pushed `be37053..ef905f2`, 13 commit thread นี้). clean.
- **G-Maiden**: branch `main`, ไม่แตะทั้ง session. เหลือ `orchestration/src-tauri/Cargo.toml` M เดิม
  (CRLF/build flicker มาตั้งแต่ต้น session, `git checkout --` ทิ้งได้).
- **ไม่ tag/ไม่ release** (batching). G-Ann ยังไม่มี release workflow.

## งานต่อ (เรียงค่า)
1. **live verify ทั้ง flow ใหม่** (งาน Boss) — `pnpm ann-studio:dev`: (a) import วิดีโอ → "วิเคราะห์วิดีโอ"
   (vision chain) → ดู clips + event auto-map, (b) Save to Library เป็นเจ้าของเสียง + ลอง import ใหม่ (guard เตือน),
   (c) หน้าทดสอบ: ลากเสียงจากคลังวางบน event / "+ เพิ่มเสียง" → "ติดตั้งจากคลัง" → เข้าเกมดู banner+เสียง.
   (browser preview รัน Tauri app นี้ไม่ได้ — `__TAURI__.invoke` undefined.)
2. **[DONE `ef905f2`] library banner caption/reactive** — ครบเท่า session แล้ว.
3. **AI banner (#6) ต้องมี SD backend** — เปิด Stable Diffusion WebUI แบบ `--api` ที่ `127.0.0.1:7860`
   (หรือแก้ endpoint ใน Settings→AI) ก่อนกด "✨ AI". ยังไม่ได้ verify e2e เพราะไม่มี SD รัน headless.
   ภาพ SD ออกมาเป็น RGB ทึบ (ไม่มี alpha) — banner จะเป็นสี่เหลี่ยมทึบ (ยอมรับได้ เป็น author choice).
4. **W4 calibration ต่อวิดีโอ** — `--roi`/cursor threshold ตอนนี้ tune กับ Na Khom/HoN panel; community videos
   (panel คนละที่/cursor คนละสี) ต้อง learn ต่อวิดีโอ. OCR noise คำเพี้ยนหนัก → author map เอง.
5. **bake params ปรับได้**: entrance frames=12/fps=24 (~0.5s); reactive fps=18/max 48 frames. แก้ใน
   bakeBanner.ts. reactive waveform visual เห็นเฉพาะใน webview (canvas) — encoding path พิสูจน์แล้ว.

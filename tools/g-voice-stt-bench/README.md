# G-Voice local STT benchmark harness

This is an out-of-app, dependency-free Node ESM harness for CR-044 Slice 3a. It does not select a model, modify G-Maiden, download software, or create a production STT path. Results are local-only evidence, not a quality claim.

## Eligibility before a run

Do not benchmark a candidate until its MVP-038 §3 evidence is recorded separately for every dependency, engine/runtime, and model:

- name/version or commit, Windows x64 support, CPU/GPU path, offline and subprocess behavior, and license;
- model SHA-256, Thai/English/code-switch coverage, model card/source, license, and redistribution rights;
- compressed/unpacked bytes, install footprint, peak loaded memory, file location/owner; and
- a user-started provisioning path with source, size, cancellation/retry/offline behavior. Silent download is forbidden.

CR-044 §8.1 makes whisper.cpp plus a multilingual Whisper small candidate the primary investigation only; it does not select or approve it. Every binary or model download needs a separate Boss confirmation **per file**, after stating that file's name, source, and size. This approval for the harness is not permission to download any file.

## Privacy and input contract

Keep corpus files, signed consent, transcripts, and benchmark outputs local and outside Git. Receipts contain reference and generated transcripts, which are speech content. The default `tools/g-voice-stt-bench/out/` is git-ignored, but choose an output directory outside the repository for any real corpus. The harness reads only WAV files listed by the manifest and validates each as mono, 16 kHz, PCM16 (the CR-043 capture format). It never writes raw audio. It does not import application code and has no network API use; `source-scan.mjs` is exercised by the test suite.

Separate tuning and holdout by whole speaker/session. Freeze the corpus reference transcript, labels, and `normalization.json` before opening candidate results. Normalization uses NFC, lowercases, removes the listed invisible characters, and strips Unicode punctuation (`\p{P}`) and symbols (`\p{S}`); Unicode number characters are retained. Thai and code-switch use grapheme-safe CER with all whitespace removed before segmentation; English uses word-level WER. Timeouts, engine errors, and no-speech outputs remain failed denominator entries.

Copy `corpus.manifest.template.json` to a **local-only** corpus directory and replace every placeholder. Its `wav` paths are intentionally examples, not bundled audio. Record participant permission with `CONSENT-TEMPLATE.md` outside the repository.

## Candidate config

Create a local JSON file that names exact existing binary and model paths. The harness resolves those paths from the config location, hashes them, and never searches for alternatives.

```json
{
  "schema_version": 1,
  "name": "local candidate name",
  "adapter": "whisper-cpp",
  "engine_path": "D:/approved-tools/whisper-cli.exe",
  "engine_args": ["-l", "auto"],
  "model_path": "D:/approved-models/ggml-small.bin",
  "timeout_ms": 15000,
  "response_format": "plain-text"
}
```

`whisper-cpp` builds a fixed argument array of `engine_args`, `-m <model>`, `-f <wav>`, `-otxt`, and `-of <user-output-temp-base>`. It starts the third-party binary from the repository root rather than the corpus directory. `response_format` is retained for one uniform config shape but whisper.cpp reads its temporary text output.

For a local generic CLI, use `"adapter": "generic-cli"` and provide `engine_args` with `{wav}` and/or `{model}` placeholders. The generic command is spawned with `shell: false`; it treats stdout as either a plain transcript or, with `"response_format": "json"`, exactly one JSON object containing `transcript` and optional `intent` and `slots` fields. Intent/slot exact-match is only meaningful when the local adapter supplies those fields.

For C4, use the persistent `faster-whisper` adapter with an existing local model directory. `engine_path` is the user-selected Python executable; it is never hard-coded, copied, or modified. The worker receives one JSON request per line and is started with `HF_HUB_OFFLINE=1` and `TRANSFORMERS_OFFLINE=1`; it rejects a model path that is not a local directory.

```json
{
  "schema_version": 1,
  "name": "local faster-whisper C4 reference",
  "adapter": "faster-whisper",
  "engine_path": "D:/user-selected-runtime/python.exe",
  "model_path": "D:/user-approved-models/faster-whisper-local-directory",
  "timeout_ms": 15000,
  "device": "cpu",
  "compute_type": "int8",
  "language": null,
  "beam_size": 5
}
```

`language` may be `"th"`, `"en"`, or `null` for auto. With auto, Thai/English manifest labels are passed through and a code-switch utterance requests auto detection. This adapter uses a user-provided FUNG runtime read-only when that is the selected `engine_path`; it does not copy its files into this repository. FUNG's staged `large-v3-turbo` exceeds the 900,000,000-byte aggregate budget, so it is a quality-ceiling reference only, not a shipping candidate.

## Run

From the repository root:

```powershell
node tools/g-voice-stt-bench/run.mjs `
  --corpus D:/local-only-g-voice-corpus/manifest.json `
  --config D:/local-only-g-voice-corpus/candidate.json `
  --output D:/local-only-g-voice-results/run-001
```

When `--output` is omitted, the ignored local directory `tools/g-voice-stt-bench/out/` is used. Choose an output directory deliberately: `receipt.json` contains references and generated transcripts so that they remain together in a user-chosen local location. The runner refuses an output directory inside the corpus directory.

Receipts record `latency_ms.mode`. `generic-cli` and `whisper-cpp` are `process-per-utterance`: the first record is labelled cold and later ones warm for comparison, but every utterance includes process and model loading, so warm is **not** model-resident. `faster-whisper` is `persistent`: the first request is cold (including model load), later requests are warm while the worker survives, and a request after a timeout-induced restart is recorded as a new cold load. The receipt records p50/p95/p99/max latency, grouping by language, acoustic condition, and code-switch; WER/CER; intent/slot exact-match; completion; every failure/reason; app Git SHA; candidate/config/model hashes; and OS/hardware data. A directory model hash is SHA-256 of a sorted manifest of relative path, size, and per-file SHA-256. On Windows it samples the candidate process tree's Working Set every second using the bundled PowerShell helper. That is incremental candidate evidence only, not whole-app CPU/RAM/FPS acceptance under MVP-038.

## Verify the harness

```powershell
node --test tools/g-voice-stt-bench/*.test.mjs
node tools/doc-graph/ci-gate.mjs
```

Tests create tiny synthetic PCM WAV files only in the operating-system temporary directory and remove them. They do not download or benchmark a real model.

---
title: "FEAT-G-MASTER — Strategic & Financial Advisor"
doc_id: "FEAT-G-MASTER"
status: "active"
version: "0.2.0"
updated: "2026-10-10"
owner: "Boss"
source_of_truth: true
complexity: "C-2"
risk: "MEDIUM"
related_docs: ["software-requirements-specification", "mvp-decisions", "G-SERIES-DATA-LINEAGE"]
---

# FEAT-G-MASTER — Strategic & Financial Advisor

> **Module:** G-Master · **Priority:** Core · **Phase:** 5
> **SRS:** [[software-requirements-specification|SRS]] §3.4 · [[engineering-spec|Eng Spec]] §2.4

---

## 1. Purpose

ให้คำแนะนำ skill/item ใน non-critical path. Local backend ใช้ source ที่ถูกต้องในเครื่อง.
Cloud game context ปิดโดย default; เมื่อ opt-in เปิด ให้ส่งได้เฉพาะ own-stat fields ใน
[[mvp-decisions]] allowlist. Route runtime ยังต้องผ่าน MVP-027/MVP-050; เอกสารนี้ไม่อ้างว่า
allowlist enforcement เสร็จแล้ว.

## 2. Input

| Source | Data |
| --- | --- |
| Local GSI tick | Own-player fields ที่มี source/freshness; own items/abilities ใช้ local เท่านั้น |
| Local CV | Certified visible enemy identity/position; local-only, never cloud input |
| Meta dataset | Hero matchup data, item winrates, popular builds |

Cloud-eligible fields are narrower than local inputs: static Maiden persona always; coarse
phase, own hero/level/KDA/net worth/gold/HP%/mana%, and team score only under the separate
context opt-in. Exact clock, own items, self-burst, CV/enemy fields, G-Memory, G-Log, match ID,
and raw GSI/GameTick are excluded. See [[mvp-decisions]] for the exact boundary.

## 3. Logic

```
on advise(tick) request:
  ถ้าอยู่ในหน้าต่าง throttle (30s) → คืน last response (cached=true)
  local_context = build_local_context(valid_tick, certified_cv) // no network serialization
  backend = runtime::master_backend()   // Auto | Claude | Ollama
    Auto   → ถ้า cloud opt-in เปิด ให้สร้าง purpose-built allowlist payload แล้วลอง Claude;
             ถ้าปิด ให้ข้าม Claude; ใช้ Ollama local หรือ unavailable
    Claude → ถ้า opt-in ปิด ห้ามส่ง; แสดง local alternative/unavailable
    Ollama → local SLM เท่านั้น
  emit Advice { text, cached }
```

- **Throttle:** flat 30s ต่อ request พร้อม cache คำตอบล่าสุด ([`THROTTLE`](file:///g:/G-Maiden/src-tauri/src/master.rs#L23), [`master.rs`](file:///g:/G-Maiden/src-tauri/src/master.rs)).
  *(planned: trigger ตาม gold change ±500 และ cap ≤2/min ยังไม่ได้ทำ)*
- **Cloud backend:** `claude` CLI (Plan quota) หรือ Anthropic Messages API (`claude-haiku-4-5`)
  เมื่อผู้ใช้ตั้ง API key; ไม่มี Gemini และไม่มี "Template" tier.
- **Consent:** sign-in, backend/provider selection, API key entry, or Ask does not imply
  cloud-context consent. Opt-out cancels future sends and invalidates consent/session-mismatched
  cached or in-flight responses.
- **Meta dataset:** static dataset ของ counter-item builds ([`counter_advice.rs`](file:///g:/G-Maiden/src-tauri/src/counter_advice.rs)).
- **Counter-item logic:** [`counter_advice.rs`](file:///g:/G-Maiden/src-tauri/src/counter_advice.rs) ต่อสายจริงแล้ว — [`request_advice`](file:///g:/G-Maiden/src-tauri/src/main.rs) (`main.rs:251`)
  ป้อน [`runtime::known_enemies()`](file:///g:/G-Maiden/src-tauri/src/runtime.rs#L493) (รายชื่อฮีโร่ศัตรูที่ CV เห็นซ้ำจนข้ามเกณฑ์ confirm) เข้า
  [`counter_advice_text()`](file:///g:/G-Maiden/src-tauri/src/counter_advice.rs#L11); ว่างเฉพาะตอนยังไม่มีศัตรูที่ CV ยืนยันแล้ว ไม่ใช่ hardcode ว่างตลอด.

## 4. Output

โค้ดจริง ([`master.rs`](file:///g:/G-Maiden/src-tauri/src/master.rs)) — struct แบบเรียบ:

```rust
Advice {
    text: String,   // คำแนะนำที่ voiced แล้ว (ไทย, 1-2 ประโยค)
    cached: bool,   // true = คืนจาก throttle cache (UI ใช้บอกความ stale)
}
```

*(planned: struct ที่ละเอียดกว่า `Advice { topic, rationale, persona_text }` ยังไม่ได้ทำ —
ตอนนี้รวมเหตุผล + persona ไว้ใน `text` เดียว)*

→ ส่งเข้า **G-Sensory** (overlay display) + **Audio Engine** (narration queue, preemptible)

## 5. Persona Behavior

- อ่อนโยน + ฉลาด: *"ถ้าจะเอาชนะตัวนั้น ฉันแนะนำ MKB นะ"*
- Nerf CM self-deprecation: *"แต่ถ้าฉันมีเงินน้อยแบบทุกวันนี้ ฉันคงซื้อแค่ Ward แหละ..."*
- ไม่ aggressive / ไม่ judge ผู้เล่น: ให้ข้อมูล + แนะนำ ไม่บังคับ

## 6. Constraints

- **Non-critical:** ไม่มี hard latency budget; cloud timeout **30s** (`--max-time 30`); fallback local SLM (ollama)
- **Cloud payload:** build a purpose-specific allowlist object; never serialize `GameTick`.
  G-Memory (including aggregates), CV/enemy fields, G-Log/history, match identifiers, items,
  exact clock, audio/transcript, and account/security fields are denied. *(runtime enforcement
  and network evidence remain open)*
- **Frequency:** throttle 30s ต่อ request. *(planned: cap ≤2 advice/min ยังไม่ได้ทำ)*
- **Preemptible:** G-Signal interrupt ได้เสมอ (advice ถูกตัดเมื่อ critical alert มา)

## 7. Dependencies

| ต้องการจาก | Module |
| --- | --- |
| Game state | GSI Server |
| LLM inference | Claude (CLI / Anthropic API) only under consent + allowlist; local Ollama otherwise/when cloud unavailable |
| Meta data | Static dataset (per-patch) |
| → แสดงผล | **G-Sensory** (overlay) |
| → เสียง | Audio Engine (narration queue) |

## 8. Acceptance Criteria

- [ ] แนะนำ counter-item ได้ถูกต้องเทียบกับ meta (≥70% match rate) *(counter_advice.rs ต่อสายเข้า `runtime::known_enemies()` แล้ว; ยังไม่มี accuracy eval)*
- [x] throttle: 30s ต่อ request + cache *(planned: cap 2/min)*
- [x] Claude fail → fallback local SLM (ไม่ crash)
- [x] G-Signal interrupt ตัด advice narration ได้ทันที
- [x] persona text สอดคล้องกับ Maiden character
- [ ] cloud-context default off; Ask/backend/API key do not imply consent
- [ ] serialized CLI/API requests contain only allowlisted fields under opt-in; deny Memory/CV/raw GSI/items/exact clock/match ID/identity across success, error, retry, cancellation, and cache paths
- [ ] opt-out cancels future sends and invalidates stale in-flight/cached responses

## Changelog
| Version | Date | Summary |
| --- | --- | --- |
| — | 2026-07-19 | link/metadata sweep (G1.5): wikilink/symbol-link fixes only — no content change |
| 0.2.0 | 2026-10-10 | Applied MVP-005 cloud-context opt-in and strict allowlist; separated local context from cloud payload and marked runtime enforcement evidence open. |

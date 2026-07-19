# FEAT-G-MIND — Cognitive Model Router

> **สถานะ (2026-07): ยังไม่ได้ทำ (spec ล่วงหน้า) — ยังไม่มีโมดูลนี้ในโค้ด (`src-tauri/src/`)**

> **Module:** G-Mind · **Priority:** Companion P1 · **Phase:** 4
> **PRD:** [[product-requirements|PRD]] §3A G-Mind · **SRS:** [[software-requirements-specification|SRS]] §3.10

---

## 1. Purpose

จะให้เลือก/สลับ Cloud LLM ได้เพื่อกัน vendor lock-in.
คง fallback chain ไป Local SLM เมื่อ cloud ไม่ได้.
**ไม่กระทบ G-Signal latency path** — G-Signal ไม่ผ่าน LLM อยู่แล้ว.

> **หมายเหตุสแตกปัจจุบัน:** spec เดิมเขียนโดยตั้ง **Gemini** เป็น default cloud และ **Qwen2.5** เป็น local SLM. โค้ดที่ ship จริงใช้ **Claude CLI / Anthropic API** เป็น cloud brain และ **Ollama** (Aroow-9B, ยังไม่ pin Qwen/llama-cpp) เป็น local SLM. G-Mind ในฐานะ router layer ยังไม่มีในโค้ด — ตัวเลือก provider ด้านล่างเป็น design ล่วงหน้า.

## 2. Architecture (planned)

```
G-Mind = Brain Router configuration layer

                    ┌── Cloud LLM (Claude CLI / Anthropic)  ← สแตกปัจจุบัน
G-Mind ─────────────┤── Cloud LLM (Gemini, GPT, etc.)       ← selectable (planned)
(non-critical path) ├── Local SLM (Ollama — Aroow-9B)       ← fallback (ที่ ship จริง)
                    └── Template Engine                     ← last resort
```

> เดิม spec วางให้ Gemini 2.0 Flash เป็น default และ Qwen2.5/Gemma เป็น local — ยังคงไว้เป็นตัวเลือกในอนาคต แต่โค้ดที่ ship ตอนนี้คือ Claude (cloud) + Ollama Aroow-9B (local).

## 3. Configuration (proposed schema — ยังไม่ได้ implement)

> ตัวอย่างด้านล่างเป็น schema ที่เสนอไว้ ยังไม่มีไฟล์ config นี้ในโค้ด. ค่า default `"gemini"` และ `"qwen2.5:7b"` เป็นของ spec เดิม — สแตกจริงคือ Claude + Ollama Aroow-9B.

```json
{
  "active_cloud": "gemini",
  "cloud_providers": {
    "gemini": {
      "endpoint": "https://generativelanguage.googleapis.com/v1beta/...",
      "model": "gemini-2.0-flash",
      "timeout_ms": 1500,
      "api_key_env": "GEMINI_API_KEY"
    },
    "claude": { ... },
    "openai": { ... }
  },
  "local_slm": {
    "model": "qwen2.5:7b",
    "provider": "ollama"
  },
  "fallback_order": ["active_cloud", "local_slm", "template"],
  "circuit_breaker": {
    "fail_threshold": 3,
    "reset_after_ms": 60000
  }
}
```

## 4. Logic

```
query(prompt, context):
  for source in fallback_order:
    if source == "active_cloud":
      if circuit_breaker.is_open: continue
      result = call_cloud(active_cloud, prompt, timeout_ms)
      if result.ok: return result
      circuit_breaker.record_failure()
    
    if source == "local_slm":
      result = call_ollama(local_slm.model, prompt)
      if result.ok: return result
    
    if source == "template":
      return template_engine.render(prompt.topic)
  
  return error("all sources failed")
```

## 5. Persona Behavior

- Self-aware: *"ตอนนี้ฉันกำลังคิดด้วยสมองกลีบ Gemini อยู่ค่ะ"*
- On fallback: *"เอ่อ... เน็ตดูจะมีปัญหา ฉันขอคิดเองนะคะ"* (switch to local)
- ผู้เล่นเลือก model ได้จาก settings

## 6. Constraints

- **ไม่กระทบ G-Signal:** G-Signal ใช้ cached audio ตรง ไม่ผ่าน G-Mind
- **Timeout:** cloud calls ≤1500ms; เกินแล้ว fallback
- **Circuit breaker:** fail 3 ครั้งติด → open circuit → ลง local จนกว่า 60s ผ่าน
- **Redaction:** ตัด PII/G-Log ดิบก่อนส่ง cloud (ทุก provider)

## 7. Dependencies

| ต้องการจาก | Module |
| --- | --- |
| Cloud APIs | Gemini, Claude, OpenAI (configurable) |
| Local inference | Ollama (SLM) |
| → Used by | **G-Master**, **G-Voice**, **G-Coach** |
| → NOT used by | **G-Signal** (cached audio path) |

## 8. Acceptance Criteria

- [ ] สลับ cloud provider ได้จาก settings (hot-switch)
- [ ] fallback chain: cloud → local SLM → template (ไม่ crash)
- [ ] circuit breaker: 3 failures → auto-switch local → auto-retry after 60s
- [ ] timeout ≤1500ms per cloud call
- [ ] redaction: ไม่ส่ง PII/raw G-Log
- [ ] G-Signal ไม่ถูกกระทบโดย model switch
- [ ] ≥2 cloud providers ใช้ได้ (Claude ที่ ship จริง + อีก 1 เช่น Gemini)

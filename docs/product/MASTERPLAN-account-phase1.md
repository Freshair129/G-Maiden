---
title: "MASTERPLAN: Account Phase 1 (CR-003) — orchestrated build via G-Orchestra"
doc_id: "MASTERPLAN-account-phase1"
status: "Active"
version: "1.0.0"
updated: "2026-07-04"
owner: "Boss"
source_of_truth: true
related_docs: ["CR-003-account-phase1-wallet-billing", "ADR-14-gid-account-identity", "ADR-12-community-ai-marketplace"]
---

# MASTERPLAN: Account Phase 1 — Wallet · Billing · Store · Inventory · History

**Spec:** [[CR-003-account-phase1-wallet-billing]] (`docs/change request/CR-003-account-phase1-wallet-billing.md`) (v0.2.0 — รวมนโยบาย no-scroll §3.0)
**Backlog (source of truth):** `orchestration/gks/atoms.cr003.json` → compile → `backlog.cr003.json` + `gks/atoms-cr003/*.md`
**หลักการ:** ทุก task คือ Genesis atom ที่มี AC (`accept`) วัดผลได้ + Doc:/Code: link เสมอ; แตกถึงระดับ pure function เพื่อให้ local LLM claim ได้โดยไม่หลอน

---

## 1. Agent pipeline (ใครทำอะไร — ตามที่ Boss กำหนด)

```
                    ┌────────────────────────────────────────────────┐
 atoms.cr003.json → │ ENGINE (GORCH_BACKLOG=gks/backlog.cr003.json)  │
                    └────────────────────────────────────────────────┘
   wave N ready ──► ① CLAIM   micro lane → Ollama local (rust-coder/qwen) · H0-H1, fenced
                              standard code/test → claude:sonnet · H2, dependency-heavy
                              design/architecture → claude:opus
                    ② GATE 1  Verify Gate (config.review, reviewerRole=reviewer → opus/sonnet)
                              = "Frontier คัดผลลัพธ์" · failOn critical · autoRework ×1
                    ③ ASSEMBLE Lead agent (Claude session กับ Boss) ประกอบข้ามไฟล์,
                              รัน gate รวม (tsc / cargo test / vitest / pgTAP), final review
                    ④ GATE 2  Boss approve (DACI approver) — โดยเฉพาะ atom ที่ requiresConfirm
```

| บทบาท | Persona/Provider | ขอบเขต |
| --- | --- | --- |
| Planner (driver) | LYRA (เอกสารนี้ + atoms) | แตกงาน, จัด dependency, ห้าม approve งานตัวเอง |
| Local workers | `roles.micro` → Ollama (Aroow-Rust-Coder-9B / qwen3.5:4b) | atom `engineType: micro` เท่านั้น — pure fn เดี่ยว + test, มี `excludes` fence |
| Standard coder | `claude:sonnet` | feature/algo/eval ที่ H2 หรือ dependency เยอะ (RPC atomic, webhook, modal state machine, hook realtime) |
| Architect | `claude:opus` | `concept--*` (นโยบาย no-scroll), การตัดสินใจข้ามโมดูล |
| **Verify Gate** | RKOI role=reviewer (`claude:opus/sonnet`) | รีวิวทุก task ก่อนออกจาก wave — เปิดอยู่แล้วใน `config.review` |
| QA/E2E | GHOST | `eval--e2e-*`, `guard--e2e-no-scroll` |
| Compliance | ATHER | `audit--pdpa-deletion` |
| **Lead agent** | Claude session (คู่ Boss) | ประกอบ, integration ข้าม wave, final gate + final review |
| Approver | **Boss** | ทิศทาง, `requiresConfirm` (Omise onboarding), สั่ง release |

**กติกา anti-hallucination ของ micro lane:** ทุก atom micro มี (1) signature เป๊ะ + ตัวอย่าง I/O ใน body, (2) `excludes` ห้ามออกนอกไฟล์/ห้าม import เกิน, (3) H0-H1 context budget (4-6k tokens — ไม่มีที่ให้เดา), (4) test-first ใน DoD — ถ้า test แดงหรือหลุด fence, Verify Gate ตีกลับ (autoRework 1 รอบ) แล้ว escalate ไป sonnet

## 2. หลักปฏิบัติ (บังคับทุก atom)

- **DoD** — งานเสร็จ = `accept` ของ atom ผ่าน + test เขียว + ผ่าน Verify Gate + มี traceability header ใหม่ครบ ไม่มีข้อยกเว้น
- **TDD** — atom `eval--*` เป็น **dependency ของ atom impl** (แดงก่อน เขียวทีหลัง); atom micro ใช้ self-TDD (test อยู่ใน DoD ของตัวเอง เขียนก่อน impl ใน claim เดียว)
- **DDD** — bounded contexts: **Identity** (เดิม ADR-14) · **Wallet** (wallets, ledger) · **Billing** (packages, orders, webhook) · **Catalog** (items, purchases) · **Entitlement** (inventory, pack install) — type กลางอยู่ `entity--account-domain-types`; ภาษาใน type = ภาษาใน DB = ภาษาใน UI
- **Traceability (doc↔code symbol link)** — โค้ดใหม่ทุกไฟล์ขึ้นหัว `// Doc: CR-003 §x.y (atom-id)`; ทุก section ใน CR-003 ชี้กลับด้วย atom id; บังคับด้วย `guard--traceability-lint` (`scripts/trace-lint.mjs`)
- **Success meter** — ทุก phase มี gate เป็น test ที่รันได้จริง (ตาราง §4) ไม่ใช่คำบรรยาย

## 3. Sprint plan = build waves (คำนวณจาก dependency จริงโดย compiler)

`node gks/compile.mjs gks/atoms.cr003.json` → 51 atoms, valid (GKS-001/002 ✓), 8 waves —
ทุก atom ใน wave เดียวกัน **claim ขนานกันได้**:

| Sprint | Wave | Atoms (จำนวน) | ธีม | Gate ปิด sprint |
| --- | --- | --- | --- | --- |
| S0 | 0 | 7 | สัญญา+ราง: types, migrations ×3, no-scroll policy, micro lane, **เริ่ม Omise onboarding (Boss)** | `tsc` ผ่าน, `supabase db reset` ผ่าน |
| S1 | 1 | 18 | pgTAP RED ทั้งชุด + pure fns micro ทั้ง 6 + shell + pack-download + store-api | vitest micro เขียว, pgTAP แดงครบ (ตั้งใจ) |
| S2 | 2 | 7 | RLS + seed + hook + หน้า Store/Inventory/Danger zone | `eval--pgtap-rls-isolation` **เขียว** |
| S3 | 3 | 9 | plpgsql ×3 + EF tests RED + Wallet/History tabs + install wire | pgTAP purchase/credit/redeem **เขียว** |
| S4 | 4 | 3 | Edge Fns จริง (topup-create, webhook) + invariant | Deno EF-01..05 เขียว, DB-08 invariant เขียว |
| S5 | 5 | 2 | Top-up modal + rate limit | `eval--vitest-topup-states` เขียว + sandbox จ่ายจริงผ่าน |
| S6 | 6 | 4 | E2E ทั้งหมด + no-scroll gate + feature flag | E2E-01 golden path + no-scroll 6×2×2 เขียว |
| S7 | 7 | 1 | Release checklist (`runbook--release-cr003`) | ทุก gate เขียว → รอ Boss สั่ง tag |

> หมายเหตุ compiler: `GKS-003 COUPLING_RISK_WARN: runbook--release-cr003 depth 7` —
> จงใจ: มันคือ terminal gate ที่รวมทุก gate ก่อน release ไม่ใช่ coupling จริง

**Critical path ที่ไม่ใช่โค้ด:** `runbook--omise-onboarding` (ทะเบียนพาณิชย์ + อนุมัติ
TrueMoney channel) — เริ่ม S0 วันแรก; ถ้าไม่ทันก็ ship S7 ด้วย `wallet_enabled=false`
(เศรษฐกิจ redeem/ของฟรียังใช้ได้ — cold-start ตาม ADR-12 ไม่สะดุด)

## 4. Success meters (program level)

| Meter | เป้า | วัดโดย |
| --- | --- | --- |
| ความถูกต้องเงิน | `wallets.balance == Σ ledger` ทุก user, 0 negative | DB-08 (CI + nightly) |
| Idempotency | webhook ซ้ำ ×N → เครดิต 1 ครั้งเสมอ | EF-04 / DB-06 |
| No-scroll | 6 จอ × 2 DPI × 2 data states = 24/24 ผ่าน | `guard--e2e-no-scroll` |
| Realtime settle | จ่ายแล้วยอดเด้งในแอป ≤ 5 วิ | E2E-01 assertion |
| Additive | signed-out ใช้ deck + ดู Store ได้ครบ | E2E-06 (ใน billing-edge suite) |
| Local-lane quality | micro atoms ผ่าน Verify Gate ครั้งแรก ≥ 70% (ต่ำกว่านั้น → ย้าย lane ไป haiku) | engine usage log |

## 5. วิธีรัน (Windows / PowerShell)

```powershell
cd G:\G-Maiden\orchestration
node gks/compile.mjs gks/atoms.cr003.json      # validate + emit backlog.cr003.json
$env:GORCH_BACKLOG = "gks/backlog.cr003.json"  # engine ใช้ board แยก state ไม่ปน backlog เกมหลัก
# จากนั้นเปิด studio/engine ตามปกติ (dev.bat / pnpm -C orchestration tauri dev)
```

- แก้แผน → แก้ **`atoms.cr003.json` เท่านั้น** แล้ว compile ใหม่ (`.md` + backlog เป็นไฟล์ derive ห้ามแก้มือ — กติกาเดิมของ G-Orchestra)
- Verify Gate เปิดอยู่แล้ว (`config.review.enabled=true`); lane local จะ active เมื่อ atom `config--local-first-micro-role` (S0) ถูก merge

## 6. ความเสี่ยงหลัก

| ความเสี่ยง | ท่ารับ |
| --- | --- |
| Omise live approval ช้า (นิติบุคคล + TrueMoney channel) | เริ่ม S0 วันแรก + `wallet_enabled` flag ship dark |
| Local model คุณภาพไม่ถึงบน micro lane | Verify Gate ตีกลับ → autoRework → escalate haiku/sonnet; วัดด้วย meter ข้อ 6 |
| VRAM ชน (RTX 3060 ~5GB ว่าง) | micro lane ใช้ num_ctx เล็กตาม config เดิม; อย่ารัน bench คู่ |
| RLS พลาด = เงินรั่ว | pgTAP RED-first (S1) ก่อนมี policy จริง + Verify Gate บังคับรีวิว security atoms โดย opus |
| Tab proliferation จาก no-scroll | เพดาน 7 top-level tabs (CR-003 §3.0) + review IA ทุกครั้งที่เพิ่มแท็บ |

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 1.0.0 | 2026-07-04 | แผนแรก — 51 atoms / 8 waves / 8 sprints, pipeline local→frontier-gate→lead→Boss, กติกา DoD+DDD+TDD+traceability, success meters |

---
id: config--local-first-micro-role
block_id: Genesis::GMaiden-CR003-Account
context_scaling_tier: H1
role: worker
status: todo
---

# CONFIG: G-Orchestra 'micro' role + routing (local-first claim lane) [L2-Process] config--local-first-micro-role

**Phase:** P0 · **Tier:** H1 · **Type:** config · **Est:** 1 · **MoSCoW:** must

### Description
Edit orchestration/config.json: add roles.micro = { requires:["file_edit"], preferred:["ollama:hf.co/sillykiwi/Aroow-Rust-Coder-9B-Q4_K_S-GGUF:Q4_K_S", "ollama:qwen3.5:4b", "claude:haiku"] } and routing "micro":"micro". This is the lane local LLMs claim; Verify Gate (config.review, reviewerRole=reviewer -> claude opus/sonnet) stays ON for it — that is the frontier gate. Code: orchestration/config.json.

### Acceptance (DoD)
Engine dry-run resolves an engineType:'micro' task to an ollama provider first; existing roles/routing untouched; JSON valid.

### Depends on
(none)

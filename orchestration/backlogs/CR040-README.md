# CR-040 — OBS-backed G-Highlights MVP (G-Orchestra lane queue)

**Authority:** [parent issue #109](https://github.com/Freshair129/G-Maiden/issues/109). The isolated DAG is [cr040-obs-mvp.json](cr040-obs-mvp.json). The repo's existing `orchestration/engine.mjs` already supports `GORCH_BACKLOG`, so this queue **does not overwrite** `orchestration/backlog.json` or its default `state.json`.

## Read-only discovery (safe on a clean checkout)

PowerShell (Windows):

```powershell
$env:GORCH_BACKLOG = "backlogs/cr040-obs-mvp.json"
node orchestration/orchestrator.mjs graph --mermaid
node orchestration/orchestrator.mjs next
node orchestration/orchestrator.mjs status
node orchestration/orchestrator.mjs run
```

Bash:

```bash
GORCH_BACKLOG=backlogs/cr040-obs-mvp.json node orchestration/orchestrator.mjs graph
GORCH_BACKLOG=backlogs/cr040-obs-mvp.json node orchestration/orchestrator.mjs next
```

The last PowerShell command is **dry-run** without `--execute`; it must not be represented as a live agent dispatch. Manual tasks `CR040-B` (review PR #116) and `CR040-INTEGRATE` remain blocked until a human/supervisor records actual review and CI evidence. Never mark them done merely because their source exists.

## Before starting any write-capable agents

1. Check `git status`, current `main` and the live changes in [#105](https://github.com/Freshair129/G-Maiden/pull/105), [#88](https://github.com/Freshair129/G-Maiden/pull/88), and [#108](https://github.com/Freshair129/G-Maiden/issues/108). Never discard or stage unrelated work.
2. Make **separate external worktrees**, e.g. `git worktree add ../gm-cr040-A -b wip/cr040-obs-adapter main`. Each worker gets its own cwd, branch and owner paths. The stock G-Orchestra pool invokes providers in the common repository workspace; **do not run `run --execute --max 3` in the same checkout**, as the backlog's path guidance alone does not prevent dirty-worktree collision.
3. Ensure a provider is actually installed/authorized. The current G-Orchestra `config.json` lists Codex disabled and can default to Claude. Avoid changing global credentials or provider settings just to make this task appear active; inspect actual environment first.
4. Supervisor reviews each branch/PR and tests independently; all writes to shared hotspots (`gsi.rs`, `capture.rs`, `lib.rs`, `CommandDeck.tsx`, `docs`, generated doc graph) belong to the integration lane only.
5. Follow `AGENTS.md` and protected `main` PR gates. Draft PRs until source, CI and review complete; actual Windows OBS + Dota perf/UAT remains a separate acceptance gate.

### Task order

```text
CR040-ARCH (contract and conflict recon)
  ├── CR040-A  OBS adapter         (#110)
  ├── CR040-B  PR #116 review      (#111; manual)
  ├── CR040-C  OBS/CV spike        (#112)
  └── CR040-D  Clip UI             (#113)
               \ | /
               CR040-QA           (#114)
                   |
               CR040-INTEGRATE    (#109; manual)
```

**Post-launch Native Media Engine:** [#115](https://github.com/Freshair129/G-Maiden/issues/115), explicitly excluded. Never treat source CI or a synthetic screenshot as live OBS/Dota evidence.

## Current execution receipt

As of 2026-11-02 (Asia/Bangkok), source-only highlight planning is present on [Draft PR #116](https://github.com/Freshair129/G-Maiden/pull/116). Five worker issues and this isolated DAG are created. This queue is **registered, not a claim that the local G-Orchestra daemon, Codex/Claude workers or Windows UAT are running**. Desktop Commander reports the authorized Windows device offline, so local provider dispatch/OBS validation cannot be performed through this conversation at this point.

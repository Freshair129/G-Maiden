---
name: end-session
description: Wrap up the current G-Maiden working session — write a session summary to .govibe/.brain/session/, refresh the rolling self-note at .govibe/.brain/memory/todo-next.md, update the cross-session auto-memory index (MEMORY.md), verify a clean tree, and commit/push only if asked. Use when the user says "end session", "wrap up", "ปิด session", "/end-session", or otherwise signals the work is done and should be recorded for the next session.
---

# End Session (G-Maiden)

Close out the current session by persisting durable memory so the **next** session
(or the next agent / a local-LLM worker) resumes with full context. G-Maiden keeps
memory in **two** places — update both:

1. **`.govibe/.brain/`** — the in-repo, git-tracked working memory (`session/` narratives +
   `memory/todo-next.md` rolling self-note). This is the source of truth for "where we are".
2. **`C:\Users\freshair\.claude\projects\G--G-Maiden\memory\`** — the cross-session
   auto-memory (`MEMORY.md` index + one fact per file), loaded into every session's context.

Run these steps in order. Skip a step only if it clearly does not apply, and say so.

## 1. Write a session summary → `.govibe/.brain/session/`

Create `.govibe/.brain/session/<YYYY-MM-DD>[-<B/C…>]-<short-slug>.md` (lowercase date-slug,
matching the existing files). If a file already exists for today, add a `-B`/`-C` suffix —
never overwrite a prior session's record. **Write it in Thai**, matching the most recent
`session/*.md` style. Include:

- **Entry point** — one line: what the session started from (question / task / branch).
- **Arc** — narrative of what happened and *why*: decisions, the user's corrections,
  dead-ends, gotchas — not just a changelog. This is the part that saves the next session.
- **สิ่งที่ทำ** — grouped by file/area, with the commit hash if committed (else "uncommitted").
- **Verify** — the layered gate table actually run (`cargo test`, `tsc --noEmit`,
  `pnpm -C src lint`, vitest, deno test, pgTAP, live `get_advisors` / SQL checks) with real
  pass/fail — never claim a gate that wasn't run.
- **Key numbers / results** — measured latency, test counts, advisor findings, GID/grant
  verification output, etc., if any.
- **Artifacts** — files/docs/migrations/atoms created or changed (paths), and any live
  actions taken (Supabase migration applied, Edge Fn deployed — these are irreversible-ish,
  record them explicitly).
- **State ปลาย turn** — branch + ahead/behind, working-tree state, and the honest "what's
  still pending / deferred".

## 2. Refresh the rolling self-note → `.govibe/.brain/memory/todo-next.md`

This is a **single rolling file** (not one-per-date). Update it:

- Bump the "อัปเดตล่าสุด: <YYYY-MM-DD>" line + a one-line reason.
- Mark finished items **DONE** (keep the trail — don't delete decided items).
- Add new hard-won facts / "do not repeat" corrections discovered this session.
- Keep a **ranked "highest-leverage next work"** list so the next session knows where to start.
- Convert relative dates to absolute. Don't duplicate what the code/git already records.

## 3. Update the cross-session auto-memory (only for durable, non-obvious facts)

In `C:\Users\freshair\.claude\projects\G--G-Maiden\memory\`:

- If the session produced a **durable** fact worth recalling next time (a live security
  finding, an architectural decision, an env gotcha, a "next steps" pointer), write/append
  the matching one-fact file and refresh its one-line pointer in `MEMORY.md`.
- Prefer **updating** an existing memory file over creating a duplicate; delete memories
  proven wrong. Do **not** store what the repo/git already records.

## 4. Verify state, then commit & push ONLY if asked

- Run `git status`; confirm the tree is clean **except** intended leftovers. Note `.govibe/`
  **is git-tracked** in this repo (not gitignored), so brain writes show up as changes.
- **Commit/push only when the user explicitly asks** (repo rule — see CLAUDE.md). If asked,
  make logically-grouped commits with clear messages and the repo trailer:
  `Co-Authored-By: Claude <noreply@anthropic.com>`. If on `main`, branch first. Push only on
  an explicit ask.
- **Never bump the version or push a `vX.Y.Z` tag** as part of ending a session — releases are
  a separate, explicit act (CLAUDE.md batching policy: tag only when the user asks to release).

## 5. Confirm and close

Give a short close-out:
- Where the session summary + self-note were written (paths).
- Any **live/irreversible actions** taken this session (migrations applied, functions deployed).
- Commit range (if any) and that the tree is clean.
- The top 1–3 "next session" items from `todo-next.md`.

## Notes

- Be honest in the record: failed tests, skipped steps, deferred gates, and unverified claims
  go in as-is. The summary is for resuming accurately, not for looking good.
- If the session touched the **live `gstore` DB or Edge Functions**, that MUST be in the
  session record and (if durable) the auto-memory — live state and the repo can drift.
- Do not invent a future obligation (cron/schedule) unless the session left a dated artifact
  that warrants one.

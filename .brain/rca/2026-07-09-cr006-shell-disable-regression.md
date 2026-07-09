# RCA: CR-006 shell disable regression

Date: 2026-07-09
Owner: Codex
Scope: CommandDeck CR-006 layout regression after disabling the legacy shell block

## Symptom

- The topbar became a long broken grey bar instead of a compact FAB seated in the top-right notch.
- The profile block detached and floated in the wrong place.
- The signal cards lost their internal typography/layout and collapsed into raw text.
- The left rail/power zone looked visually fragmented and partially doubled.

## Evidence

- In `src/src/styles.css`, I disabled the older shell block by wrapping lines around `4130-4259` in `@media not all`.
- That block did not only contain outdated positioning. It also contained the base definitions for:
  - `.g-topbar-fab` display/flex behavior
  - `.g-sidebar-fab` base box model
  - `.g-signals-fab` base grid model
  - `.g-sig .sg-tag`, `.g-sig .sg-label`, `.g-sig .sg-val`, `.g-sig .sg-bar`, `.g-sig .sg-fill`
  - `.g-deck-panel .surface.page-*` overflow behavior
- The later CR-006 block around `4361+` only reintroduced part of that system:
  - it redefined top-level positions and some shell visuals
  - it did **not** fully redefine all nested child rules for the topbar and signal cards
- Result: once the old block was disabled, the remaining CR-006 block had missing child-level styles, so layout pieces still rendered but lost the CSS contract that made them align and size correctly.

## Root Cause

The regression was caused by a **false assumption during cleanup**:

I treated the earlier shell block as “fully legacy positioning only,” but it was actually a **hybrid block** containing both:

1. obsolete shell geometry that conflicted with CR-006, and
2. still-needed base child styles that the newer CR-006 block never fully replaced.

So when I disabled the block wholesale, I removed not only the conflicting geometry but also the styling primitives that the current UI still depended on.

## Why the issue escaped detection

- I correctly identified the duplicate shell blocks as a root problem, but I removed the old block too coarsely.
- I optimized for “one shell block” before proving that the new shell block was self-sufficient.
- The newer block looked authoritative because it controlled the big geometry, but it was actually incomplete at the child selector level.
- Build/test did not catch this because TypeScript and CSS compilation both pass even when the visual cascade becomes structurally incomplete.

## Proposed prevention

- Do not disable a duplicated CSS block wholesale until every selector it uniquely owns has been mapped.
- Separate cleanup into two passes:
  1. classify selectors as geometry vs component styling
  2. only remove the geometry subset first
- Before disabling a large shell block, diff selectors by depth:
  - shell container selectors
  - nested component selectors
  - typography/detail selectors
- For CR-006, create one explicit authoritative section that fully defines:
  - `.g-topbar-fab` and all nested children
  - `.g-sidebar-fab` and nav children
  - `.g-signals-fab` and all `.g-sig*` children
  - `.g-power-radial` and menu children
- Add a visual regression checklist before build handoff:
  - topbar remains flex-aligned
  - profile remains inside the topbar
  - signal cards keep labels, values, and bars
  - no detached duplicate shell fragments appear on the left edge

## Immediate next step

- Restore or re-home all child-level rules that were accidentally removed with the disabled block.
- Then remove only the truly conflicting geometry rules, not the whole section at once.

---
name: update-workdocs-for-handoff
description: Update a task's workdocs to be handoff-ready for another developer or agent.
---

# update-workdocs-for-handoff

## Purpose

Update a task's **workdocs** to be handoff-ready.

## Inputs

- Task scope (module / integration)
- The task workdocs directory
- Current repo state (PR, branch, or working tree)

## Outputs

A handoff-ready workdocs set including:

- `03-implementation-notes.md` — current status, blockers, next steps (TODO)
- `01-plan.md` — updated plan/checklist (with completed items checked off)
- `04-verification.md` — verification commands/results (or blockers)
- `05-pitfalls.md` — pitfalls and “do not repeat” notes
- `handoff.md` — concise handoff instructions (optional but recommended)

## Procedure

1. Locate the task's workdocs folder:
   - Module: `modules/<module_id>/workdocs/active/<task_slug>/`
   - Integration: `modules/integration/workdocs/active/<task_slug>/`

2. Update `03-implementation-notes.md`:
   - Current status
   - What was completed
   - Known issues / blockers
   - Next steps (ordered TODO)
   - How to validate (commands)

3. Update `01-plan.md`:
   - Check off completed work
   - Add any new TODOs discovered during implementation

4. Update `04-verification.md`:
   - Commands/checks run + results
   - What remains blocked and why (if applicable)

5. Update `05-pitfalls.md`:
   - Record high-signal pitfalls only (bugs, dead ends, non-obvious constraints)
   - Keep entries future-facing (“do not do X because Y”)

6. (Optional) Create/update `handoff.md`:
   - Keep it short and operational (commands, paths, exact blockers).

## Verification

- Confirm the workdocs folder contains:
  - `03-implementation-notes.md` updated with next steps + validation commands
  - `01-plan.md` updated with completed items checked off
  - `04-verification.md` updated with commands/results (or blockers)
  - `05-pitfalls.md` updated with actionable “do not repeat” notes (if any)
  - `handoff.md` (optional) with concise handoff instructions
- If the work involved modular SSOT, run:
  - `node .ai/scripts/flowctl.js lint`
  - `node .ai/scripts/integrationctl.js validate`
  - `node .ai/scripts/contextctl.js verify`

## Boundaries

- Do **not** make additional product/code changes when preparing the handoff; only document and point to the existing changes.
- Do **not** edit derived artifacts directly; regenerate them via the corresponding ctl scripts if needed.
- Keep handoff notes operational: commands, file paths, and exact known issues; avoid long narratives.

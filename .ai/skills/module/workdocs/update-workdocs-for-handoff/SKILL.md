---
name: update-workdocs-for-handoff
description: Finalize/synchronize a task’s workdocs for handoff or wrap-up in module/integration scope; docs only (no new code changes).
---

# update-workdocs-for-handoff

## Purpose

Update a task's **workdocs** to be handoff-ready.

## Default use (do not wait for a “trigger phrase”)

Use this skill **proactively** when:
- you are about to hand off work to another person/agent
- you are about to switch context and may not return soon
- you have completed a meaningful milestone and want the work to be resumable

User “trigger phrases” are only hints; correct usage must not depend on language.

## Inputs

- Task scope (module / integration / temporary)
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
   - Temporary: `.ai/.tmp/workdocs/<task_slug>/`

2. If the folder does not exist:
   - Stop and ask for the missing scope inputs (`module_id` vs `integration` vs `temporary`, `task_slug`), then create the bundle via `create-workdocs-plan`.
   - Do not guess scope silently; if an assumption is required, record the assumption explicitly in `00-overview.md`.
   - If user cannot decide scope or explicitly requests temporary, use `.ai/.tmp/workdocs/<task_slug>/` as the fallback.

3. Update `03-implementation-notes.md`:
   - Current status
   - What was completed
   - Known issues / blockers
   - Next steps (ordered TODO)
   - How to validate (commands)

4. Update `01-plan.md`:
   - Check off completed work
   - Add any new TODOs discovered during implementation

5. Update `04-verification.md`:
   - Commands/checks run + results
   - What remains blocked and why (if applicable)

6. Update `05-pitfalls.md`:
   - Record high-signal pitfalls only (bugs, dead ends, non-obvious constraints)
   - Keep entries future-facing (“do not do X because Y”)

7. Create/update `handoff.md` (recommended):
   - Keep `handoff.md` short and operational:
     - Where to start reading (usually `03-implementation-notes.md`)
     - Exact next 3 actions (commands + file paths)
     - Blockers + how to unblock

8. Use the checklist template for completeness:
   - `.ai/skills/workflows/workdocs/update-workdocs-for-handoff/templates/handoff-checklist.md`

## Verification

- Confirm the workdocs folder contains:
  - `03-implementation-notes.md` updated with next steps + validation commands
  - `01-plan.md` updated with completed items checked off
  - `04-verification.md` updated with commands/results (or blockers)
  - `05-pitfalls.md` updated with actionable “do not repeat” notes (if any)
  - `handoff.md` (optional) with concise handoff instructions
- If the work involved modular SSOT, run:
  - `node .ai/scripts/modules/flowctl.mjs lint`
  - `node .ai/scripts/modules/integrationctl.mjs validate`
  - `node .ai/skills/features/context-awareness/scripts/contextctl.mjs verify`

## Boundaries

- Do **not** make additional product/code changes when preparing the handoff; only document and point to the existing changes.
- Do **not** edit derived artifacts directly; regenerate them via the corresponding ctl scripts if needed.
- Keep handoff notes operational: commands, file paths, and exact known issues; avoid long narratives.

> **Note**: Temporary workdocs (`.ai/.tmp/workdocs/`) are not tracked by module registries. If scope becomes clear during implementation, consider moving the workdocs to the appropriate module or integration location before handoff.

## Reader-test handoff check (borrowed)

Before considering the handoff complete, ensure a fresh reader can answer:
- What changed?
- What is the current status?
- What are the next 3 actions (with commands + file paths)?
- How do we verify success?

If any question requires "tribal knowledge," add the missing context to `handoff.md` or `03-implementation-notes.md`.

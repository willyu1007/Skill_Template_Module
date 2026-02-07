---
name: update-dev-docs-for-handoff
description: Finalize/synchronize a task’s dev-docs for handoff or wrap-up in module/integration scope; docs only (no new code changes).
---

# update-dev-docs-for-handoff

## Purpose

Update a task’s dev-docs to be handoff-ready.

## Default use (do not wait for a trigger phrase)

Use this skill proactively when:
- you are about to hand off work to another person/agent
- you are about to switch context and may not return soon
- you have completed a meaningful checkpoint and want the work to be resumable

## Inputs

- Task scope (module / integration / temporary)
- The task dev-docs directory
- Current repo state (PR, branch, or working tree)

## Outputs

A handoff-ready dev-docs set including:

- `03-implementation-notes.md` (current status, blockers, next steps)
- `01-plan.md` (updated plan/checklist)
- `04-verification.md` (verification commands/results or blockers)
- `05-pitfalls.md` (high-signal "do not repeat" notes)
- `handoff.md` (optional but recommended)

## Procedure

1. Locate the task’s dev-docs folder:
   - Module: `modules/<module_id>/dev-docs/active/<task_slug>/`
   - Integration: `modules/integration/dev-docs/active/<task_slug>/`
   - Temporary: `.ai/.tmp/dev-docs/<task_slug>/`

2. If the folder does not exist:
   - Stop and ask for the missing scope inputs (`module_id` vs `integration` vs `temporary`, `task_slug`), then create the bundle via `create-dev-docs-plan`.
   - Do not guess scope silently; if an assumption is required, record it explicitly in `00-overview.md`.
   - If user cannot decide scope or explicitly requests temporary, use `.ai/.tmp/dev-docs/<task_slug>/` as the fallback.

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
   - Keep entries future-facing ("do not do X because Y")

7. Create/update `handoff.md` (recommended):
   - Where to start reading (usually `03-implementation-notes.md`)
   - Exact next 3 actions (commands + file paths)
   - Blockers + how to unblock

8. Use the checklist template for completeness:
   - `./templates/handoff-checklist.md`

## Verification

- Confirm the dev-docs folder contains updated:
  - `03-implementation-notes.md`
  - `01-plan.md`
  - `04-verification.md`
  - `05-pitfalls.md`
  - `handoff.md` (optional)

## Boundaries

- Do not make additional product/code changes when preparing the handoff; only document and point to the existing changes.
- Do not edit derived artifacts directly; regenerate them via the corresponding ctl scripts if needed.
- Keep handoff notes operational: commands, file paths, and exact known issues; avoid long narratives.

> Note: Temporary dev-docs (`.ai/.tmp/dev-docs/`) are not tracked by module registries. If scope becomes clear during implementation, consider moving the dev-docs to the appropriate module or integration location before handoff.


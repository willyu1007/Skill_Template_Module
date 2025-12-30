---
name: update-dev-docs-for-handoff
description: Update a task's workdocs to be handoff-ready for another developer or agent.
---

# update-dev-docs-for-handoff

## Purpose

Update a task's **workdocs** to be handoff-ready.

## Inputs

- Task scope (module / integration)
- The task workdocs directory
- Current repo state (PR, branch, or working tree)

## Outputs

A handoff-ready workdocs set including:

- `status.md` — what’s done, what’s not, what to do next
- `plan.md` — updated checklist (with completed items checked off)
- `context.md` — updated context links
- `decisions.md` — updated decisions/notes
- `handoff.md` — concise handoff instructions

## Procedure

1. Locate the task's workdocs folder:
   - Module: `modules/<module_id>/workdocs/active/<task_slug>/`
   - Integration: `modules/integration/workdocs/active/<task_slug>/`

2. Ensure `status.md` clearly states:
   - Progress summary
   - Known issues / blockers
   - Next steps (ordered)
   - How to validate (commands)

3. Ensure the plan is current:
   - Check off completed work
   - Add any new TODOs discovered during implementation

4. Capture key context:
   - Changed files
   - Relevant SSOT changes (module MANIFEST, flow graph, context registries)
   - Any migration/rollout considerations

5. Keep it short and operational:
   - Prefer commands and file paths over long narrative.

## Notes

- Do not use `dev/` in this template; it has been replaced by `workdocs/` and module-local `workdocs/`.

## Verification

- Confirm the workdocs folder contains:
  - `status.md` with next steps and validation commands
  - `plan.md` with completed items checked off
  - `context.md` with updated links/paths
  - `decisions.md` updated as needed
  - `handoff.md` with concise handoff instructions
- If the work involved modular SSOT, run:
  - `node .ai/scripts/flowctl.js lint`
  - `node .ai/scripts/integrationctl.js validate`
  - `node .ai/scripts/contextctl.js verify`

## Boundaries

- Do **not** make additional product/code changes when preparing the handoff; only document and point to the existing changes.
- Do **not** edit derived artifacts directly; regenerate them via the corresponding ctl scripts if needed.
- Keep handoff notes operational: commands, file paths, and exact known issues; avoid long narratives.

# update-dev-docs-for-handoff

## Purpose

Update a task's **workdocs** to be handoff-ready.

## Inputs

- Task scope (module / integration / project)
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

1. Locate the task’s workdocs folder:
   - Module: `modules/<module_id>/workdocs/active/<task_slug>/`
   - Integration: `modules/integration/workdocs/active/<task_slug>/`
   - Project: `workdocs/active/<task_slug>/`

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

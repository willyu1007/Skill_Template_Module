# Optional supporting workdocs convention

This reference describes an optional file layout for maintaining task-level documentation alongside the plan produced by this skill.

## Convention
When a task requires additional documentation (architecture notes, current status, verification evidence, pitfalls), keep supporting workdocs files next to `01-plan.md` in the scoped workdocs folder.

Module scope:

```
modules/<module_id>/workdocs/active/<task_slug>/
  00-overview.md
  01-plan.md
  02-architecture.md
  03-implementation-notes.md
  04-verification.md
  05-pitfalls.md
```

Integration scope:

```
modules/integration/workdocs/active/<task_slug>/
  00-overview.md
  01-plan.md
  02-architecture.md
  03-implementation-notes.md
  04-verification.md
  05-pitfalls.md
```

Notes:
- This skill (plan-maker) only produces `01-plan.md`. It does not create or update supporting workdocs files.
- Keep supporting files short and operational (paths, commands, decisions, evidence).

## Suggested mapping
- `00-overview.md`: goals, non-goals, acceptance criteria
- `01-plan.md`: milestones, phases, sequencing, rollback checkpoints
- `02-architecture.md`: boundaries, contracts, compatibility/migration notes
- `03-implementation-notes.md`: current status + future TODOs (what still needs to be done)
- `04-verification.md`: commands/checks + results (or blockers)
- `05-pitfalls.md`: "do not repeat" pitfalls and dead ends

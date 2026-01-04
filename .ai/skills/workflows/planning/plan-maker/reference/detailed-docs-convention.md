# Workdocs convention and skill coordination

The reference describes the file layout for task-level documentation and clarifies how `plan-maker` coordinates with `create-workdocs-plan`.

## Artifact responsibilities

| Artifact | Produced by | Focus |
|----------|-------------|-------|
| `roadmap.md` | **plan-maker** | Macro-level: milestones, phases, impact scope, acceptance criteria, risks, rollback strategy |
| `01-plan.md` | `create-workdocs-plan` | Implementation-level: specific steps, file changes, current status tracking |

## Convention

Module scope:

```
modules/<module_id>/workdocs/active/<task_slug>/
  roadmap.md              # Macro-level planning (plan-maker)
  00-overview.md          # Goal, non-goals, acceptance criteria
  01-plan.md              # Implementation plan (specific steps)
  02-architecture.md      # Architecture design
  03-implementation-notes.md  # Current status + TODOs
  04-verification.md      # Verification commands + results
  05-pitfalls.md          # "Do not repeat" lessons
```

Integration scope:

```
modules/integration/workdocs/active/<task_slug>/
  roadmap.md              # Macro-level planning (plan-maker)
  00-overview.md
  01-plan.md
  02-architecture.md
  03-implementation-notes.md
  04-verification.md
  05-pitfalls.md
```

## Notes

- The `plan-maker` skill only produces `roadmap.md` and does not create or update the `00-05` bundle files.
- Use `create-workdocs-plan` to generate the implementation bundle (`00-overview.md` through `05-pitfalls.md`).
- Both artifacts can coexist in the same workdocs directory.

## Typical workflow

1. **Strategic alignment**: Use `plan-maker` to create `roadmap.md` when the task needs macro-level planning (milestones, risk assessment, rollback strategy).
2. **Implementation setup**: Use `create-workdocs-plan` to create the bundle for tracking implementation progress.
3. **Execution**: Update `01-plan.md`, `03-implementation-notes.md`, `04-verification.md`, and `05-pitfalls.md` as work proceeds.
4. **Handoff**: Use `update-workdocs-for-handoff` before context switch.

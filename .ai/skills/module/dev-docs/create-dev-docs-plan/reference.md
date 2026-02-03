# Dev Docs Usage Reference

## When to use dev docs

Use dev docs when the task meets any of these criteria:

| Criterion | Threshold | Rationale |
|-----------|-----------|-----------|
| File span | >3 files | Coordination overhead increases |
| Step count | >5 steps | Risk of losing track |
| Architectural decisions | Any | Decisions need documentation for future reference |
| Potential interruption | Likely | Handoff requires documented state |
| Unclear scope | Yes | Exploration benefits from tracking |

## When to skip dev docs

Skip dev docs for:

- Single file fixes: bug fix in one file, no side effects
- Simple refactors: rename variable, move file (with auto-import update)
- Quick tasks: well-defined, <30 min estimated time
- Trivial changes: typo fix, comment update, formatting

## Dev-docs structure

Module-scoped tasks:

```
modules/<module_id>/dev-docs/active/<task-slug>/
  roadmap.md                  # Optional: macro-level planning (plan-maker)
  00-overview.md              # Goal, non-goals, acceptance criteria
  01-plan.md                  # Implementation plan (specific steps)
  02-architecture.md          # Architecture design
  03-implementation-notes.md  # Current status + TODOs
  04-verification.md          # Verification commands + results
  05-pitfalls.md              # "Do not repeat" lessons
```

Integration-scoped tasks:

```
modules/integration/dev-docs/active/<task-slug>/
  roadmap.md
  00-overview.md
  01-plan.md
  02-architecture.md
  03-implementation-notes.md
  04-verification.md
  05-pitfalls.md
```

## Artifact responsibilities

| Artifact | Skill | Focus |
|----------|-------|-------|
| `roadmap.md` | plan-maker | Macro-level: milestones, phases, impact scope, acceptance criteria, risks, rollback strategy |
| `01-plan.md` | create-dev-docs-plan | Implementation-level: specific steps, file changes, checklist |

Use plan-maker first when the task needs strategic alignment (milestones, risk assessment, rollback strategy). Then use create-dev-docs-plan for the implementation bundle.

## File semantics (avoid ambiguity)

- `03-implementation-notes.md`: current status + future TODOs (what still needs to be done).
- `05-pitfalls.md`: historical lessons (bugs, dead ends, constraints). Write future-facing "do not repeat" notes.

## Resume checklist (before coding)

- Read `03-implementation-notes.md` and `05-pitfalls.md` first.
- Update `01-plan.md` as you complete work (check off items).
- Update `04-verification.md` with commands and results (or blockers).

## Task slug naming

Use descriptive, kebab-case slugs:

- `add-user-pagination`
- `refactor-auth-flow`
- `fix-race-condition-in-cache`
- `integrate-payment-gateway`

## Lifecycle

1. Strategic planning (optional): use plan-maker to create `roadmap.md` when the task needs macro-level planning.
2. Create bundle: use create-dev-docs-plan at task start.
3. Update: keep `01-plan.md`, `03-implementation-notes.md`, `04-verification.md`, and `05-pitfalls.md` current.
4. Handoff: use update-dev-docs-for-handoff before interruption.
5. Archive: move the task folder to `modules/<module_id>/dev-docs/archive/` (or `modules/integration/dev-docs/archive/`) when complete.


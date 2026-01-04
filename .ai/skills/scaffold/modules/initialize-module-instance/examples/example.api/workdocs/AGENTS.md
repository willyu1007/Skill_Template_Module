---
name: example.api-workdocs
purpose: Module-local task tracking and decision documentation.
---

# Module Workdocs

## Scope

Long-running task tracking, design decisions, and handoff documentation for this module.

## Structure

| Directory | Content |
|-----------|---------|
| `active/<task-slug>/` | Current tasks |
| `archive/` | Completed tasks |

## Task Directory Layout

```
active/<task-slug>/
  00-overview.md              # Goal, non-goals, acceptance criteria
  01-plan.md                  # Milestones and step-by-step checklist
  02-architecture.md          # Boundaries, contracts, migration notes
  03-implementation-notes.md  # Current status + TODOs (future work)
  04-verification.md          # Commands/checks + results (or blockers)
  05-pitfalls.md              # "Do not repeat" pitfalls and dead ends
```

## Workflow

1. Create task dir via `create-workdocs-plan` skill
2. Update `01-plan.md` as work progresses (check off items)
3. Before handoff: use `update-workdocs-for-handoff` skill
4. On completion: move to `archive/`

## Naming

Task slugs: kebab-case, descriptive (e.g., `add-pagination`, `refactor-auth-flow`).

## Example

See `active/example-add-pagination/` for a complete task workdocs example.


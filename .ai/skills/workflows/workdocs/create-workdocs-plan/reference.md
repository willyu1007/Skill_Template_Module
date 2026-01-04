# Workdocs Usage Reference

## When to use workdocs

Use workdocs when the task meets **any** of these criteria:

| Criterion | Threshold | Rationale |
|-----------|-----------|-----------|
| File span | >3 files | Coordination overhead increases |
| Step count | >5 steps | Risk of losing track |
| Architectural decisions | Any | Decisions need documentation for future reference |
| Potential interruption | Likely | Handoff requires documented state |
| Unclear scope | Yes | Exploration benefits from tracking |

## When to skip workdocs

Skip workdocs for:

- **Single file fixes**: Bug fix in one file, no side effects
- **Simple refactors**: Rename variable, move file (with auto-import update)
- **Quick tasks**: Well-defined, <30 min estimated time
- **Trivial changes**: Typo fix, comment update, formatting

## Workdocs structure

Module-scoped tasks:

```
modules/<module_id>/workdocs/active/<task-slug>/
  00-overview.md
  01-plan.md
  02-architecture.md
  03-implementation-notes.md
  04-verification.md
  05-pitfalls.md
```

Integration-scoped tasks:

```
modules/integration/workdocs/active/<task-slug>/
  00-overview.md
  01-plan.md
  02-architecture.md
  03-implementation-notes.md
  04-verification.md
  05-pitfalls.md
```

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

1. **Create**: Use `create-workdocs-plan` at task start.
2. **Update**: Keep `01-plan.md`, `03-implementation-notes.md`, `04-verification.md`, and `05-pitfalls.md` current.
3. **Handoff**: Use `update-workdocs-for-handoff` before interruption.
4. **Archive**: Move the task folder to `modules/<module_id>/workdocs/archive/` (or `modules/integration/workdocs/archive/`) when complete.


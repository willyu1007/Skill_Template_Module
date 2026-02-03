---
name: example-api-dev-docs
purpose: Module-local task tracking and decision documentation.
---

# Module Dev Docs

## Scope

Long-running task tracking, design decisions, and handoff documentation for this module.

## Operating rules (MUST)

- Do not start non-trivial implementation without a task folder under `active/<task-slug>/`.
- Prefer resume over new: if a related task already exists in `active/`, reuse it.
- Before doing any work in an existing task, read:
  - `03-implementation-notes.md`
  - `05-pitfalls.md`
- Keep execution synced during work:
  - `01-plan.md` (checklist + newly discovered TODOs)
  - `03-implementation-notes.md` (what changed + decisions + deviations)
  - `04-verification.md` (commands run + results + blockers)
- Before context switch / handoff / wrap-up: run `update-dev-docs-for-handoff` and ensure `handoff.md` is present and actionable.

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

1. If the user asks for planning before coding, write `active/<task-slug>/roadmap.md` via `plan-maker` (planning-only).
2. Create (or resume) the task bundle via `create-dev-docs-plan`.
3. Execute work while continuously syncing `01-plan.md`, `03-implementation-notes.md`, and `04-verification.md`.
4. Before handoff: use `update-dev-docs-for-handoff`.
5. On completion: move the folder to `archive/`.

## Naming

Task slugs: kebab-case, descriptive (e.g., `add-pagination`, `refactor-auth-flow`).

## Example

See `active/example-add-pagination/` for a complete task dev-docs example.


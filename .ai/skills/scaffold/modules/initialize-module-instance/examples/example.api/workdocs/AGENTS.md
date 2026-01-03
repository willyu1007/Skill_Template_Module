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
  plan.md        # Goal, checklist, validation plan
  context.md     # Relevant files, scripts, open questions
  decisions.md   # Key decisions and rationale
  risks.md       # (optional) Risks and mitigations
```

## Workflow

1. Create task dir via `create-dev-docs-plan` skill
2. Update `plan.md` as work progresses (check off items)
3. Before handoff: use `update-dev-docs-for-handoff` skill
4. On completion: move to `archive/`

## Naming

Task slugs: kebab-case, descriptive (e.g., `add-pagination`, `refactor-auth-flow`).

## Example

See `active/example-add-pagination/` for a complete task workdocs example.


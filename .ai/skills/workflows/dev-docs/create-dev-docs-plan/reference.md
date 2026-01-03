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

## Decision flowchart

```
Is the task well-defined and single-file?
├── YES → Skip workdocs, execute directly
└── NO → Continue...

Will the task take >30 minutes or span >3 files?
├── YES → Create workdocs plan
└── NO → Continue...

Does the task involve architectural decisions?
├── YES → Create workdocs plan
└── NO → Continue...

Might you be interrupted or need to hand off?
├── YES → Create workdocs plan
└── NO → Execute directly (consider lightweight notes)
```

## Workdocs structure

When creating workdocs, use this structure:

```
modules/<module_id>/workdocs/active/<task-slug>/
├── plan.md        # Goal, checklist, validation plan
├── context.md     # Relevant files, scripts, open questions
├── decisions.md   # Key decisions and rationale
└── risks.md       # (optional) Risks and mitigations
```

For integration-scoped tasks:

```
modules/integration/workdocs/active/<task-slug>/
├── plan.md
├── context.md
├── decisions.md
└── risks.md
```

## Task slug naming

Use descriptive, kebab-case slugs:

- `add-user-pagination`
- `refactor-auth-flow`
- `fix-race-condition-in-cache`
- `integrate-payment-gateway`

## Lifecycle

1. **Create**: Use `create-dev-docs-plan` skill at task start
2. **Update**: Check off items in `plan.md` as you progress
3. **Handoff**: Use `update-dev-docs-for-handoff` skill before interruption
4. **Archive**: Move to `workdocs/archive/` when complete


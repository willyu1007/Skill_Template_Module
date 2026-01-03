---
name: packaging-workdocs
purpose: Container image planning and build optimization documentation.
---

# Packaging Workdocs

## Scope

Container image planning, base image decisions, build optimization, registry configuration.

## Structure

| Directory | Content |
|-----------|---------|
| `active/<task-slug>/` | Current packaging tasks |
| `archive/` | Completed tasks |

## Related SSOT

- Registry: `docs/packaging/registry.json`
- Templates: `ops/packaging/templates/`
- Targets: `ops/packaging/services/`, `jobs/`, `apps/`

## Workflow

1. Document packaging decisions in workdocs
2. Use `packctl.js` to register targets
3. Request human to build and push

## Skills

- Create: `create-dev-docs-plan`
- Handoff: `update-dev-docs-for-handoff`


---
name: ci-workdocs
purpose: CI pipeline planning and workflow customization documentation.
---

# CI Workdocs

## Scope

CI pipeline planning, workflow customization, platform-specific configuration.

## Structure

| Directory | Content |
|-----------|---------|
| `active/<task-slug>/` | Current CI tasks |
| `archive/` | Completed tasks |

## Related SSOT

- Config: `ci/config.json`
- Generated: `.github/workflows/`, `.gitlab-ci.yml`

## Workflow

1. Document CI change rationale in workdocs
2. Use `cictl.js` to enable features and generate workflows
3. Commit generated files

## Skills

- Create: `create-workdocs-plan`
- Handoff: `update-workdocs-for-handoff`


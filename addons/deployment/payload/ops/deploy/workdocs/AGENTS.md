---
name: deploy-workdocs
purpose: Deployment planning, environment configuration, and runbook documentation.
---

# Deployment Workdocs

## Scope

Deployment planning, environment configuration decisions, scaling strategies.

## Structure

| Directory | Content |
|-----------|---------|
| `active/<task-slug>/` | Current deployment tasks |
| `archive/` | Completed tasks |
| `runbooks/` | Operational procedures |

## Related SSOT

- Services: `ops/deploy/http_services/`, `ops/deploy/workloads/`
- Environments: `ops/deploy/environments/`
- K8s configs: `ops/deploy/k8s/`

## Workflow

1. Document deployment plan in workdocs
2. Use `deployctl.js` to register and plan
3. Request human approval for staging/prod

## Skills

- Create: `create-dev-docs-plan`
- Handoff: `update-dev-docs-for-handoff`


---
name: alert-runbooks
purpose: Alert-specific runbooks for incident response.
---

# Alert Runbooks

## Scope

Alert-specific operational procedures for diagnosis and resolution.

## Runbook Structure

Each runbook file should contain:

| Section | Content |
|---------|---------|
| Alert Name | Identifier matching monitoring config |
| Description | What the alert indicates |
| Impact | User/business impact severity |
| Investigation | Diagnostic steps |
| Resolution | Fix procedures |
| Escalation | Contact chain if unresolved |

## Related SSOT

- Metrics: `docs/context/observability/metrics-registry.json`
- Logs: `docs/context/observability/logs-schema.json`

## Naming Convention

`<alert-name>.md` — kebab-case, matching alert identifier.


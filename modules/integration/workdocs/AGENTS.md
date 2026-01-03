---
name: integration-workdocs
purpose: Cross-module debugging and integration task tracking.
---

# Integration Workdocs

## Scope

Cross-module integration work: debugging, scenario planning, multi-module coordination.

## Structure

| Directory | Content |
|-----------|---------|
| `active/<task-slug>/` | Current integration tasks |
| `archive/` | Completed tasks |

## Task Directory Layout

```
active/<task-slug>/
  plan.md        # Goal, checklist, validation
  context.md     # Relevant modules, flows, scenarios
  decisions.md   # Cross-module decisions
```

## Related SSOT

- Scenarios: `modules/integration/scenarios.yaml`
- Flow graph: `.system/modular/flow_graph.yaml`

## Skills

- Create: `create-dev-docs-plan` (scope: integration)
- Handoff: `update-dev-docs-for-handoff`


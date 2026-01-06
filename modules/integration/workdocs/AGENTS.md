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
  00-overview.md              # Goal, non-goals, acceptance criteria
  01-plan.md                  # Milestones and step-by-step checklist
  02-architecture.md          # Cross-module boundaries, contracts, rollout notes
  03-implementation-notes.md  # Current status + TODOs (future work)
  04-verification.md          # Commands/checks + results (or blockers)
  05-pitfalls.md              # "Do not repeat" pitfalls and dead ends
```

## Related SSOT

- Scenarios: `modules/integration/scenarios.yaml`
- Flow graph: `.system/modular/flow_graph.yaml`

## Resume checklist (before changes)

- Read `03-implementation-notes.md` and `05-pitfalls.md` first.
- Update `01-plan.md` and `04-verification.md` as you work.
- If the user asks for planning before coding (plan/roadmap/milestones/phases), create `active/<task-slug>/roadmap.md` via `plan-maker` before implementation.

## Skills

- Create: `create-workdocs-plan` (scope: integration)
- Handoff: `update-workdocs-for-handoff`

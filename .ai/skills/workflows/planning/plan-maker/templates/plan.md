# <Task Title> — Implementation Plan

## Goal
- <One-sentence goal statement>

## Non-goals
- <Explicitly list what is out of scope>

## Open questions and assumptions
### Open questions (answer before execution)
- Q1: <...>
- Q2: <...>

### Assumptions (if unanswered)
- A1: <assumption> (risk: <low|medium|high>)

## Workdocs scope
- Scope: <module|integration>
- Module id (if scope=module): <module_id>
- Task slug: <task_slug>
- Plan path:
  - Module: `modules/<module_id>/workdocs/active/<task_slug>/01-plan.md`
  - Integration: `modules/integration/workdocs/active/<task_slug>/01-plan.md`

## Scope and impact
- Affected modules: <...>
- Cross-module/integration concerns: <...>
- Modular SSOT touchpoints (if any):
  - Module manifests: <...>
  - Flow graph/bindings: <...>
  - Integration scenarios: <...>
  - Context registries: <...>
- Derived artifacts to regenerate (if any): <...>
- External interfaces/APIs: <...>
- Data/storage impact: <...>
- Backward compatibility: <...>

## Milestones
1. **Milestone 1**: <name>
   - Deliverable: <what exists when done>
   - Acceptance criteria: <how to know it is done>
2. **Milestone 2**: <name>
   - Deliverable: <...>
   - Acceptance criteria: <...>

## Step-by-step plan (phased)
> Keep each step small, verifiable, and reversible.

### Phase 0 — Discovery (if needed)
- Objective: <what you need to learn/confirm>
- Deliverables:
  - <notes, diagrams, list of files>
- Verification:
  - <how you confirm discovery is complete>
- Rollback:
  - N/A (no code changes)

### Phase 1 — <name>
- Objective:
- Deliverables:
  - <...>
- Verification:
  - <tests/checks/acceptance criteria>
- Rollback:
  - <how to revert if this phase causes issues>

### Phase 2 — <name>
- Objective:
- Deliverables:
- Verification:
- Rollback:

## Verification and acceptance criteria
- Build/typecheck:
  - <command(s) or CI job(s)>
- Automated tests:
  - <unit/integration/e2e>
- Manual checks:
  - <smoke test steps>
- Acceptance criteria:
  - <bullet list>

## Risks and mitigations
| Risk | Likelihood | Impact | Mitigation | Detection | Rollback |
|---|---:|---:|---|---|---|
| <risk> | <low/med/high> | <low/med/high> | <...> | <...> | <...> |

## Optional supporting workdocs (convention)
If the task benefits from additional workdocs, keep them next to this plan:

```
modules/<module_id>/workdocs/active/<task_slug>/
  00-overview.md
  01-plan.md
  02-architecture.md
  03-implementation-notes.md
  04-verification.md
  05-pitfalls.md
```

or (integration scope):

```
modules/integration/workdocs/active/<task_slug>/
  00-overview.md
  01-plan.md
  02-architecture.md
  03-implementation-notes.md
  04-verification.md
  05-pitfalls.md
```

This skill produces only `01-plan.md`.

## To-dos
- [ ] Confirm open questions
- [ ] Confirm milestone ordering and DoD
- [ ] Confirm verification/acceptance criteria
- [ ] Confirm rollout/rollback strategy

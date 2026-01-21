# <Task Title> — Roadmap

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
- Roadmap path:
  - Module: `modules/<module_id>/workdocs/active/<task_slug>/roadmap.md`
  - Integration: `modules/integration/workdocs/active/<task_slug>/roadmap.md`

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

## Phased execution plan
> Keep each phase small, verifiable, and reversible.

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
  - <how to revert if the phase causes issues>

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

## Companion workdocs (convention)
The roadmap provides macro-level planning. For implementation details, use `create-workdocs-plan` to generate:

```
modules/<module_id>/workdocs/active/<task_slug>/
  requirement.md          # (Optional) Requirements alignment
  roadmap.md              # Macro-level planning (plan-maker)
  00-overview.md          # Goal, non-goals, acceptance criteria
  01-plan.md              # Implementation plan (specific steps)
  02-architecture.md      # Architecture design
  03-implementation-notes.md  # Current status + TODOs
  04-verification.md      # Verification commands + results
  05-pitfalls.md          # "Do not repeat" lessons
```

or (integration scope):

```
modules/integration/workdocs/active/<task_slug>/
  requirement.md          # (Optional) Requirements alignment
  roadmap.md              # Macro-level planning
  00-overview.md
  01-plan.md
  02-architecture.md
  03-implementation-notes.md
  04-verification.md
  05-pitfalls.md
```

## Next step (after roadmap approval)
After user confirms this roadmap is correct, run `create-workdocs-plan` to generate the implementation bundle.

The following fields will be pre-filled from this roadmap:
- Goal → `00-overview.md` Goal
- Non-goals → `00-overview.md` Non-goals
- Acceptance criteria → `04-verification.md`

## To-dos
- [ ] Confirm open questions
- [ ] Confirm milestone ordering and DoD
- [ ] Confirm verification/acceptance criteria
- [ ] Confirm rollout/rollback strategy
- [ ] (After approval) Create implementation workdocs bundle


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

## Scope and impact
- Affected areas/modules: <...>
- External interfaces/APIs: <...>
- Data/storage impact: <...>
- Backward compatibility: <...>

## Project structure change preview (may be empty)
This section is a **non-binding, early hypothesis** to help humans confirm expected project-structure impact.

Rules:
- Prefer **directory-level** paths by default; use file-level paths only when you have clear evidence.
- Do not guess project-specific paths or interfaces; if you have not inspected the repo, keep `(none)` or use `<TBD>`.
- If unknown, keep `(none)` or use `<TBD>` and add/keep a **Discovery** step to confirm.

### Existing areas likely to change (may be empty)
- Modify:
  - (none)
- Delete:
  - (none)
- Move/Rename:
  - (none)

### New additions (landing points) (may be empty)
- New module(s) (preferred):
  - (none)
- New interface(s)/API(s) (when relevant):
  - (none)
- New file(s) (optional):
  - (none)

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

## Optional detailed documentation layout (convention)
If you maintain a detailed dev documentation bundle for the task, the repository convention is:

```
dev-docs/active/<task>/
  roadmap.md              # Macro-level planning (plan-maker)
  00-overview.md
  01-plan.md
  02-architecture.md
  03-implementation-notes.md
  04-verification.md
  05-pitfalls.md
```

The roadmap document can be used as the macro-level input for the other files. The plan-maker skill does not create or update those files.

Suggested mapping:
- The roadmap's **Goal/Non-goals/Scope** → `00-overview.md`
- The roadmap's **Milestones/Phases** → `01-plan.md`
- The roadmap's **Architecture direction (high level)** → `02-architecture.md`
- Decisions/deviations during execution → `03-implementation-notes.md`
- The roadmap's **Verification** → `04-verification.md`

## To-dos
- [ ] Confirm open questions
- [ ] Confirm milestone ordering and DoD
- [ ] Confirm verification/acceptance criteria
- [ ] Confirm rollout/rollback strategy

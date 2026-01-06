---
name: plan-maker
description: Create a macro-level roadmap under module/integration workdocs (`roadmap.md`); ask clarifying questions and confirm plan-only vs plan+implement (planning only, no code changes).
---

# Plan Maker

## Purpose
Produce a single, goal-aligned **macro-level roadmap** as a Markdown document that can guide execution without modifying the codebase.

The skill focuses on **strategic planning**: milestones, phased execution, impact scope, acceptance criteria, risk assessment, and rollback strategy. The skill does NOT cover implementation-level details (specific file changes, step-by-step code modifications)—those belong in `01-plan.md` created by `create-workdocs-plan`.

## Default routing (do not depend on language)

Use plan-maker whenever the user asks for planning before coding (plan/roadmap/milestones/phases/rollout/rollback), regardless of language.

## When to use
Use plan-maker when:
- The user asks for a plan, roadmap, milestones, or an implementation plan before coding
- The task is large/ambiguous and benefits from staged execution and verification
- You need a plan artifact saved under module/integration workdocs for collaboration and handoff

Avoid plan-maker when:
- The user explicitly wants you to implement changes immediately (plan-maker is planning-only)
- A plan already exists and only minor edits are needed (update the existing plan instead)

## Required inputs
- Task goal
- Confirm intent:
  - **Plan-only** (produce `roadmap.md` and stop), or
  - **Plan + implement** (still produce `roadmap.md` first, then switch to `create-workdocs-plan` + implementation in a follow-up step/turn)
- Workdocs scope (must be explicit)
  - Module-scoped: the user provides `module_id`
  - Integration-scoped: the user confirms `integration`
- Task slug (`<task_slug>`, kebab-case), confirmed with the user

## Outputs
- Module-scoped: `modules/<module_id>/workdocs/active/<task_slug>/roadmap.md`
- Integration-scoped: `modules/integration/workdocs/active/<task_slug>/roadmap.md`

## Steps
1. Restate the goal in one sentence and confirm direction.
2. Confirm intent explicitly:
   - Ask: “Roadmap only (no code changes), or roadmap + proceed to implementation next?”
3. Identify what is unclear and ask clarifying questions.
   - Ask only what is necessary to align the plan to the goal (scope, non-goals, target environment, success criteria, constraints).
   - If the user cannot answer now, record assumptions explicitly and surface the risk.
4. Require an explicit scope from the user:
   - Module-scoped: confirm `module_id`
   - Integration-scoped: confirm `integration`
5. Propose a `<task_slug>` and confirm it with the user.
   - Use kebab-case; avoid dates unless requested.
6. Draft the roadmap using `./templates/roadmap.md`.
   - Keep it macro-level: phases, milestones, deliverables, verification, risks, rollback.
   - Only include specific file paths/APIs when you have evidence; otherwise add a discovery step.
   - Include an explicit "Open questions / Assumptions" section.
   - Include module-first considerations (affected modules, SSOT touchpoints, derived artifacts to regenerate, integration checks) with discovery steps if unknown.
7. Save the roadmap to the scoped workdocs path.
8. Return a short handoff message to the user:
   - confirmed goal
   - where the plan was saved
   - the next 3 actions to start execution (without executing them)

## Verification
- [ ] Goal is restated and (where needed) confirmed with the user
- [ ] Plan-only vs plan+implement intent is explicitly confirmed
- [ ] Ambiguities are resolved or recorded as explicit open questions/assumptions
- [ ] Roadmap includes milestones/phases and per-step deliverables
- [ ] Roadmap defines verification/acceptance criteria and a rollback strategy
- [ ] Scope (`module_id` or `integration`) is explicitly confirmed by the user
- [ ] Roadmap is saved to the correct workdocs path as `roadmap.md`
- [ ] No application/source/config files were modified

## Boundaries
- MUST NOT modify application/source code, project configuration, or database state
- MUST ask clarifying questions when the goal or constraints are ambiguous
- MUST NOT invent project-specific facts (APIs, file paths, schemas) without evidence
- SHOULD keep the roadmap macro-level; deep design details belong in `01-plan.md` or `02-architecture.md`
- SHOULD NOT include secrets (credentials, tokens, private keys) in the roadmap

## Included assets
- Template: `./templates/roadmap.md`
- Reference: `./reference/detailed-docs-convention.md` (optional file layout convention)
- Example: `./examples/sample-roadmap.md`

## Coordination with workdocs skills

| Artifact | Skill | Focus |
|----------|-------|-------|
| `roadmap.md` | **plan-maker** | Macro-level: milestones, phases, impact scope, acceptance criteria, risks, rollback |
| `01-plan.md` | `create-workdocs-plan` | Implementation-level: specific steps, file changes, current status tracking |

Typical workflow:
1. Use `plan-maker` to create `roadmap.md` for strategic alignment
2. Use `create-workdocs-plan` to create the implementation bundle (`00-overview.md` through `05-pitfalls.md`)
3. Both artifacts coexist in the same workdocs directory

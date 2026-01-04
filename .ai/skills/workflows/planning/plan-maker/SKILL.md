---
name: plan-maker
description: Create a goal-aligned implementation plan (modules/<module_id>/workdocs/active/<task_slug>/01-plan.md or modules/integration/workdocs/active/<task_slug>/01-plan.md) by asking clarifying questions when needed; planning only (no code changes).
---

# Plan Maker

## Purpose
Produce a single, goal-aligned implementation plan as a Markdown document that can guide execution without modifying the codebase.

## When to use
Use this skill when:
- The user asks for a plan, roadmap, milestones, or an implementation plan before coding
- The task is large/ambiguous and benefits from staged execution and verification
- You need a plan artifact saved under module/integration workdocs for collaboration and handoff

Avoid this skill when:
- The user explicitly wants you to implement changes immediately (this skill is planning-only)
- A plan already exists and only minor edits are needed (update the existing plan instead)

## Required inputs
- Task goal
- Workdocs scope (must be explicit)
  - Module-scoped: the user provides `module_id`
  - Integration-scoped: the user confirms `integration`
- Task slug (`<task_slug>`, kebab-case), confirmed with the user

## Outputs
- Module-scoped: `modules/<module_id>/workdocs/active/<task_slug>/01-plan.md`
- Integration-scoped: `modules/integration/workdocs/active/<task_slug>/01-plan.md`

## Steps
1. Restate the goal in one sentence and confirm direction.
2. Identify what is unclear and ask clarifying questions.
   - Ask only what is necessary to align the plan to the goal (scope, non-goals, target environment, success criteria, constraints).
   - If the user cannot answer now, record assumptions explicitly and surface the risk.
3. Require an explicit scope from the user:
   - Module-scoped: confirm `module_id`
   - Integration-scoped: confirm `integration`
4. Propose a `<task_slug>` and confirm it with the user.
   - Use kebab-case; avoid dates unless requested.
5. Draft the plan using `./templates/plan.md`.
   - Keep it macro-level: phases, milestones, deliverables, verification, risks, rollback.
   - Only include specific file paths/APIs when you have evidence; otherwise add a discovery step.
   - Include an explicit "Open questions / Assumptions" section.
   - Include module-first considerations (affected modules, SSOT touchpoints, derived artifacts to regenerate, integration checks) with discovery steps if unknown.
6. Save the plan to the scoped workdocs path.
7. Return a short handoff message to the user:
   - confirmed goal
   - where the plan was saved
   - the next 3 actions to start execution (without executing them)

## Verification
- [ ] Goal is restated and (where needed) confirmed with the user
- [ ] Ambiguities are resolved or recorded as explicit open questions/assumptions
- [ ] Plan includes milestones/phases and per-step deliverables
- [ ] Plan defines verification/acceptance criteria and a rollback strategy
- [ ] Scope (`module_id` or `integration`) is explicitly confirmed by the user
- [ ] Plan is saved to the correct workdocs path
- [ ] No application/source/config files were modified

## Boundaries
- MUST NOT modify application/source code, project configuration, or database state
- MUST ask clarifying questions when the goal or constraints are ambiguous
- MUST NOT invent project-specific facts (APIs, file paths, schemas) without evidence
- SHOULD keep the plan macro-level; deep design details belong in separate documentation artifacts
- SHOULD NOT include secrets (credentials, tokens, private keys) in the plan

## Included assets
- Template: `./templates/plan.md`
- Reference: `./reference/detailed-docs-convention.md` (optional file layout convention)
- Example: `./examples/sample-plan.md`

---
name: plan-maker
description: Create a macro-level roadmap under module/integration workdocs (`roadmap.md`); ask clarifying questions and confirm plan-only vs plan+implement (planning only, no code changes). strong signal words: make plan/roadmap/implementation plan.
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
- Requirements source (optional):
  - User-specified requirements document path (plan-maker reads and extracts key points)
  - Interactive collection (Q&A with user to capture requirements)
  - Direct goal statement (skip requirements alignment if goal is already clear)
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
- Requirements document (optional, when user requests "先对齐思路"):
  - `modules/<module_id>/workdocs/active/<task_slug>/requirement.md`

## Steps

### Step 1 — Requirements alignment (optional, recommended)
1. **Determine requirements source**:
   - If user provides a requirements document path → read and extract key points
   - If user requests interactive alignment ("先对齐思路") → use Q&A to collect
   - If goal is already clear and explicit → skip to Step 2

2. **Interactive collection** (if needed):
   - Core goal (1 sentence)
   - Main use cases (2-5)
   - Scope boundaries / non-goals
   - Key constraints

3. **Requirements document output**:
   - Default: do not generate standalone document (use directly for roadmap)
   - If user requests "先对齐思路": write to `modules/<module_id>/workdocs/active/<task_slug>/requirement.md`

4. **Confirmation gate**: Ask user to confirm requirements understanding is correct
   - If confirmed → proceed to Step 2
   - If deviation → correct and re-confirm

### Step 2 — Restate goal and confirm direction
Restate the goal in one sentence and confirm direction.

### Step 3 — Confirm intent
Ask: "Roadmap only (no code changes), or roadmap + proceed to implementation next?"

### Step 4 — Clarifying questions
Identify what is unclear and ask clarifying questions.
- Ask only what is necessary to align the plan to the goal (scope, non-goals, target environment, success criteria, constraints).
- If the user cannot answer now, record assumptions explicitly and surface the risk.

### Step 5 — Confirm scope
Require an explicit scope from the user:
- Module-scoped: confirm `module_id`
- Integration-scoped: confirm `integration`

### Step 6 — Confirm task slug
Propose a `<task_slug>` and confirm it with the user.
- Use kebab-case; avoid dates unless requested.

### Step 7 — Draft roadmap
Draft the roadmap using `./templates/roadmap.md`.
- Keep it macro-level: phases, milestones, deliverables, verification, risks, rollback.
- Only include specific file paths/APIs when you have evidence; otherwise add a discovery step.
- Include an explicit "Open questions / Assumptions" section.
- Include module-first considerations (affected modules, SSOT touchpoints, derived artifacts to regenerate, integration checks) with discovery steps if unknown.

### Step 8 — Save roadmap
Save the roadmap to the scoped workdocs path.

### Step 9 — Handoff and coordination
1. Return a short handoff message to the user:
   - confirmed goal
   - where the plan was saved
   - the next 3 actions to start execution (without executing them)

2. **Coordination checkpoint** (after user confirms roadmap is correct):
   - Ask: "Roadmap complete. Do you want me to create the implementation workdocs bundle (00-05) now?"
   - If yes: immediately invoke `create-workdocs-plan` with:
     - Same `module_id` or `integration` scope
     - Same `<task_slug>`
     - Pre-fill `00-overview.md` Goal/Non-goals from roadmap
   - If no: end with handoff message only

## Verification
- [ ] (If requirements alignment) Requirements confirmed by user before roadmap creation
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
- Template: `./templates/requirement.md` (for requirements alignment)
- Reference: `./reference/detailed-docs-convention.md` (optional file layout convention)
- Example: `./examples/sample-roadmap.md`

## Coordination with workdocs skills

| Artifact | Skill | Focus |
|----------|-------|-------|
| `requirement.md` | **plan-maker** (optional) | Requirements alignment before roadmap |
| `roadmap.md` | **plan-maker** | Macro-level: milestones, phases, impact scope, acceptance criteria, risks, rollback |
| `01-plan.md` | `create-workdocs-plan` | Implementation-level: specific steps, file changes, current status tracking |

Typical workflow:
1. (Optional) Use `plan-maker` Step 1 to align requirements first
2. Use `plan-maker` to create `roadmap.md` for strategic alignment
3. After roadmap approval, use `create-workdocs-plan` to create the implementation bundle (`00-overview.md` through `05-pitfalls.md`)
4. All artifacts coexist in the same workdocs directory

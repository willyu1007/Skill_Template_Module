---
name: plan-maker
description: Create a goal-aligned macro-level roadmap (module/integration dev-docs) by asking clarifying questions when needed; planning only (no code changes); strong signal words: make plan/roadmap/implementation plan.
---

# Plan Maker

## Purpose

Produce a single, goal-aligned macro-level roadmap as a Markdown document that can guide execution without modifying the codebase.

## When to use

Use the plan-maker skill when:
- Strong trigger: the user explicitly asks for a saved roadmap document/artifact (MUST use plan-maker unless the change is trivial: < 30 min)
- The user asks for a plan/milestones/implementation plan before coding
- The user asks to align thinking first or clarify direction before planning
- The task is large/ambiguous and benefits from staged execution and verification
- You need a roadmap artifact saved under module/integration `dev-docs/active/` for collaboration and handoff

Avoid the skill when:
- The change is trivial (< 30 min) and does not benefit from staged execution/verification
- A roadmap already exists and only minor edits are needed (update the existing roadmap instead)

## Inputs

- Task goal (required)
  - If the goal is ambiguous or missing critical constraints, you MUST ask clarifying questions before drafting the roadmap.
- Requirements source (optional):
  - Existing document: user provides a path to an existing requirements document; plan-maker reads and extracts key points
  - Interactive collection: collect requirements through Q&A with the user
  - Both: read existing document AND supplement with interactive Q&A
- Requirements alignment mode (optional):
  - If user requests align thinking first / clarify direction, generate a requirements document alongside the roadmap before creating the roadmap
  - See `./templates/requirement.md` for the requirements document template

## Outputs

- `roadmap.md` (always) at exactly one scope:
  - Module-scoped: `modules/<module_id>/dev-docs/active/<task_slug>/roadmap.md`
  - Integration-scoped: `modules/integration/dev-docs/active/<task_slug>/roadmap.md`
  - Temporary (confirmation-failure fallback): `.ai/.tmp/dev-docs/<task_slug>/roadmap.md`
- `requirement.md` (optional, when requirements alignment mode is active) at the same scope:
  - Module-scoped: `modules/<module_id>/dev-docs/active/<task_slug>/requirement.md`
  - Integration-scoped: `modules/integration/dev-docs/active/<task_slug>/requirement.md`
  - Temporary (confirmation-failure fallback): `.ai/.tmp/dev-docs/<task_slug>/requirement.md`

### Scope resolution

| Scope | Path | When to use |
|-------|------|-------------|
| Module | `modules/<module_id>/dev-docs/active/<task_slug>/` | Task is clearly about a single module |
| Integration | `modules/integration/dev-docs/active/<task_slug>/` | Task spans multiple modules or involves scenario testing |
| Temporary (default) | `.ai/.tmp/dev-docs/<task_slug>/` | Scope is unclear AND user cannot/will not confirm, OR user explicitly requests temporary location |

### Path confirmation rules (MUST)

| Scope | Human confirmation required? | Auto-create allowed? |
|-------|------------------------------|----------------------|
| Module | YES (confirm `module_id` + `task_slug`) | NO |
| Integration | YES (confirm `task_slug`) | NO |
| Temporary | NO | YES |

Critical rule: NEVER create dev-docs under `modules/` without explicit human confirmation of the full path. If confirmation is not obtained, fall back to `.ai/.tmp/dev-docs/`.

## Steps

### Phase 0 - Requirements alignment (optional; triggered by user request)

0. Check for requirements alignment request:
   - If user asks to align thinking first / clarify direction, or provides an existing requirements document:
     - Proceed to step 0a
   - Otherwise, skip to step 1

0a. Requirements source handling:
   - If user provides an existing document path:
     - Read the document and extract: goal, use cases, boundaries, constraints
     - Summarize key points and confirm understanding with user
   - If user requests interactive collection:
     - Ask structured questions to collect:
       - Core goal (1 sentence)
       - Main use cases (2-5)
       - Boundaries / non-goals
       - Key constraints
     - Summarize collected requirements and confirm with user

0b. Generate requirements document (if alignment mode is active):
   - Confirm scope (module or integration):
     - If single-module, confirm `module_id`
     - If cross-module/system-level, use `modules/integration`
   - Propose `<task_slug>` (if not yet confirmed)
   - Save aligned requirements to:
     - `modules/<module_id>/dev-docs/active/<task_slug>/requirement.md`, or
     - `modules/integration/dev-docs/active/<task_slug>/requirement.md`
   - Confirm with user: "Requirements documented. Proceed to roadmap creation?"

### Phase 1 - Roadmap drafting and save

1. Ask clarifying questions if needed (goal, constraints, scope, risks, verification).
2. Resolve scope and path:
   - Module: `modules/<module_id>/dev-docs/active/<task_slug>/`
   - Integration: `modules/integration/dev-docs/active/<task_slug>/`
   - Temporary: `.ai/.tmp/dev-docs/<task_slug>/`
3. For module/integration scope, propose the full path and wait for explicit user confirmation before creating files.
4. Draft the roadmap using `./templates/roadmap.md`.
   - Keep it macro-level: phases, deliverables, verification, risks, rollback.
   - Always include the "Project structure change preview" section from the template (may be empty).
   - Only include specific file paths/APIs when you have evidence; otherwise add a discovery step.
   - Include an "Optional detailed documentation layout (convention)" section that declares the expected dev-docs layout without creating those files.
5. Save the roadmap to the resolved scope.
6. Return a short handoff message:
   - confirmed goal
   - where the roadmap was saved
   - the next 3 actions to start execution (without executing them)

### Phase 2 - Dev-docs linkage (conditional)

7. Evaluate the dev-docs Decision Gate:
   - Apply the Decision Gate in `.ai/skills/module/dev-docs/AGENTS.md`.
   - If the task qualifies:
     - Inform user that the task qualifies for a full dev-docs bundle for context preservation and handoff.
     - Ask if they want to create the complete bundle now.
     - If user confirms, trigger `create-dev-docs-plan` with the roadmap as input (same scope + `<task_slug>`).
   - If the task does not qualify:
     - Note in the handoff message that the roadmap is sufficient for now.

## Verification

- [ ] Goal is restated and (where needed) confirmed with the user
- [ ] Ambiguities are resolved or recorded as explicit open questions/assumptions
- [ ] (If alignment mode) Requirements document saved alongside the roadmap at the chosen scope
- [ ] (If alignment mode) User confirmed requirements understanding before roadmap creation
- [ ] Roadmap includes phases and per-step deliverables
- [ ] Roadmap includes "Project structure change preview" section (may be empty)
- [ ] Roadmap defines verification/acceptance criteria and a rollback strategy
- [ ] Roadmap is saved at the chosen scope under `dev-docs/active/<task_slug>/roadmap.md` (or `.ai/.tmp/dev-docs/<task_slug>/roadmap.md` for temporary scope)
- [ ] Dev-docs Decision Gate evaluated; user prompted for full bundle if criteria met
- [ ] No application/source/config files were modified

## Boundaries

- MUST NOT modify application/source code, project configuration, or database state
- MUST ask clarifying questions when the goal or constraints are ambiguous
- MUST NOT invent project-specific facts (APIs, file paths, schemas) without evidence
- MUST use plan-maker when the user explicitly asks for a saved roadmap document/artifact (strong trigger)
- MUST NOT create roadmap under `modules/` (module or integration scope) without explicit human confirmation of the full path
- MUST fall back to `.ai/.tmp/dev-docs/` if human confirmation is not obtained for module/integration scope
- If the task meets the dev-docs Decision Gate, MUST prompt user whether to continue with `create-dev-docs-plan`
- If user confirms dev-docs bundle creation, MUST trigger `create-dev-docs-plan`
- SHOULD keep the roadmap macro-level; deep design details belong in separate documentation artifacts
- SHOULD NOT include secrets (credentials, tokens, private keys) in the roadmap
- PRODUCES macro-level roadmaps: phases, scope, impact, risks, rollback strategy
- PRODUCES requirements documents (when alignment mode is active)

## Included assets

- Templates:
  - `./templates/roadmap.md` (roadmap document)
  - `./templates/requirement.md` (requirements alignment document)
- Reference:
  - `./reference/detailed-docs-convention.md` (optional file layout convention)
- Example:
  - `./examples/sample-roadmap.md`

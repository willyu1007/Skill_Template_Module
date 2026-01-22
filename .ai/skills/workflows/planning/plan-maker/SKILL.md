---
name: plan-maker
description: Create a goal-aligned macro-level roadmap (module/integration workdocs) by asking clarifying questions when needed; planning only (no code changes); strong signal words: make plan/roadmap/implementation plan.
---

# Plan Maker

## Purpose
Produce a single, goal-aligned macro-level roadmap as a Markdown document that can guide execution without modifying the codebase.

## When to use
Use the plan-maker skill when:
- **Strong trigger**: The user explicitly asks for a saved “roadmap” document/artifact — MUST use the `plan-maker` skill unless the change is trivial (`< 30 min`)
- The user asks for a plan/milestones/implementation plan before coding
- The user asks to "align thinking first" or "clarify direction" before planning
- The task is large/ambiguous and benefits from staged execution and verification
- You need a roadmap artifact saved under module/integration `workdocs/active/` for collaboration and handoff

Avoid the skill when:
- The change is trivial (<30 min) and does not benefit from staged execution/verification
- A roadmap already exists and only minor edits are needed (update the existing roadmap instead)

## Inputs
- Task goal (required)
  - If the goal is ambiguous or missing critical constraints, you MUST ask clarifying questions before drafting the roadmap.
- Requirements source (optional):
  - **Existing document**: User provides a path to an existing requirements document; plan-maker reads and extracts key points
  - **Interactive collection**: Collect requirements through Q&A dialogue with the user
  - **Both**: Read existing document AND supplement with interactive Q&A
- Requirements alignment mode (optional):
  - If user requests "align thinking first" or "clarify direction", generate a requirements document alongside the roadmap before creating the roadmap
  - See `./templates/requirement.md` for the requirements document template

## Outputs
- `roadmap.md` (always) at exactly one scope:
  - Module-scoped: `modules/<module_id>/workdocs/active/<task_slug>/roadmap.md`
  - Integration-scoped: `modules/integration/workdocs/active/<task_slug>/roadmap.md`
  - **Temporary (default fallback)**: `.ai/.tmp/workdocs/<task_slug>/roadmap.md`
- `requirement.md` (optional, when requirements alignment mode is active) at the same scope:
  - Module-scoped: `modules/<module_id>/workdocs/active/<task_slug>/requirement.md`
  - Integration-scoped: `modules/integration/workdocs/active/<task_slug>/requirement.md`
  - **Temporary (default fallback)**: `.ai/.tmp/workdocs/<task_slug>/requirement.md`

### Scope resolution
| Scope | Path | When to use |
|-------|------|-------------|
| Module | `modules/<module_id>/workdocs/active/<task_slug>/` | Task is clearly about a single module |
| Integration | `modules/integration/workdocs/active/<task_slug>/` | Task spans multiple modules or involves scenario testing |
| **Temporary (default)** | `.ai/.tmp/workdocs/<task_slug>/` | Scope is unclear AND user cannot/will not confirm, OR user explicitly requests temporary location |

### Path confirmation rules (MUST)

| Scope | Human confirmation required? | Auto-create allowed? |
|-------|------------------------------|----------------------|
| Module | **YES** — MUST confirm `module_id` + `task_slug` | **NO** |
| Integration | **YES** — MUST confirm `task_slug` | **NO** |
| Temporary | NO — can auto-create after proposing `task_slug` | **YES** |

**Critical rule**: NEVER create workdocs under `modules/` without explicit human confirmation of the full path. If confirmation is not obtained, fall back to `.ai/.tmp/workdocs/`.

## Steps

### Phase 0 — Requirements alignment (optional, triggered by user request)

0. **Check for requirements alignment request**:
   - If user asks to "align thinking first" or "clarify direction", or provides an existing requirements document:
     - Proceed to step 0a
   - Otherwise, skip to step 1

0a. **Requirements source handling**:
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

0b. **Generate requirements document** (if alignment mode is active):
   - Confirm scope (module or integration):
     - If single-module, confirm `module_id`
     - If cross-module/system-level, use `modules/integration`
   - Propose `<task_slug>` (if not yet confirmed)
   - Save aligned requirements to `modules/<module_id>/workdocs/active/<task_slug>/requirement.md` or `modules/integration/workdocs/active/<task_slug>/requirement.md`
   - Confirm with user: "Requirements documented. Proceed to roadmap creation?"
   - If user confirms, continue to step 1
   - If user wants to refine, iterate on requirements document

### Phase 1 — Roadmap creation (core workflow)

1. Restate the goal in one sentence and confirm direction.
2. Identify what is unclear and ask clarifying questions.
   - Ask only what is necessary to align the roadmap to the goal (scope, non-goals, target environment, success criteria, constraints).
   - If the user cannot answer now, record assumptions explicitly and surface the risk.
   - If a requirements document exists at `requirement.md` in the target workdocs folder, use it as input.
3. Confirm scope and slug:
   - Confirm module-scoped vs integration-scoped vs temporary:
     - Module: `modules/<module_id>/workdocs/active/<task_slug>/`
     - Integration: `modules/integration/workdocs/active/<task_slug>/`
     - Temporary: `.ai/.tmp/workdocs/<task_slug>/`
   - Propose a `<task_slug>` (kebab-case; avoid dates unless requested).
   - If already confirmed in Phase 0, skip proposing again.
   - **For module/integration scope (MUST)**: Present the full proposed path and **wait for explicit user confirmation** before proceeding to step 4:
     ```
     Proposed path: modules/<module_id>/workdocs/active/<task_slug>/roadmap.md
     Please confirm this location, or specify a different one.
     ```
   - **For temporary scope**: May proceed without explicit confirmation (auto-create allowed).
   - **Fallback rule**: If scope is unclear and user cannot/will not confirm, or user explicitly requests a temporary location, use `.ai/.tmp/workdocs/<task_slug>/` as the default.
   - If user does not confirm within the same turn and scope is module/integration, **do NOT create files** — remind user confirmation is required, or offer to use temporary location instead.
4. Draft the roadmap using `./templates/roadmap.md`.
   - Keep the roadmap macro-level: phases, milestones, deliverables, verification, risks, rollback.
   - Always include the **Project structure change preview (may be empty)** section from the template:
     - Use it as a **non-binding alignment aid** (humans confirm expected impact early; execution may differ).
     - Prefer **directory-level** paths by default; use file-level paths only when you have clear evidence.
     - Do not guess project-specific paths or interfaces; if you have not inspected the repo, keep `(none)` or use `<TBD>`.
     - If unknown, keep `(none)` or use `<TBD>` and add/keep a **Discovery** step to confirm.
   - Only include specific file paths/APIs elsewhere when you have evidence; otherwise add a discovery step.
   - Include an "Optional detailed documentation layout (convention)" section that declares the expected workdocs layout without creating those files.
5. Save the roadmap to the resolved scope:
   - Module: `modules/<module_id>/workdocs/active/<task_slug>/roadmap.md`
   - Integration: `modules/integration/workdocs/active/<task_slug>/roadmap.md`
   - Temporary: `.ai/.tmp/workdocs/<task_slug>/roadmap.md`
6. Return a short handoff message to the user:
   - confirmed goal
   - where the roadmap was saved
   - the next 3 actions to start execution (without executing them)

### Phase 2 — workdocs linkage (conditional)

7. **Evaluate workdocs Decision Gate**:
   - Apply the Decision Gate in `.ai/skills/module/workdocs/AGENTS.md`.
   - If the task qualifies:
     - Inform user: "This task qualifies for a full workdocs task bundle for context preservation and handoff."
     - Ask: "Would you like to create the complete workdocs bundle now?"
     - If user confirms, **trigger `create-workdocs-plan`** with the roadmap as input (same scope + `<task_slug>`).
   - If the task does not qualify:
     - Note in the handoff message that the roadmap is sufficient for now.

## Verification
- [ ] Goal is restated and (where needed) confirmed with the user
- [ ] Ambiguities are resolved or recorded as explicit open questions/assumptions
- [ ] (If alignment mode) Requirements document saved alongside the roadmap at the chosen scope
- [ ] (If alignment mode) User confirmed requirements understanding before roadmap creation
- [ ] Roadmap includes milestones/phases and per-step deliverables
- [ ] Roadmap includes "Project structure change preview" section (may be empty)
- [ ] Roadmap defines verification/acceptance criteria and a rollback strategy
- [ ] Roadmap is saved at the chosen scope under `workdocs/active/<task_slug>/roadmap.md` (or `.ai/.tmp/workdocs/<task_slug>/roadmap.md` for temporary scope)
- [ ] Workdocs Decision Gate evaluated; user prompted for full bundle if criteria met
- [ ] No application/source/config files were modified

## Boundaries
- MUST NOT modify application/source code, project configuration, or database state
- MUST ask clarifying questions when the goal or constraints are ambiguous
- MUST NOT invent project-specific facts (APIs, file paths, schemas) without evidence
- **MUST use the `plan-maker` skill when the user explicitly asks for a saved “roadmap” document/artifact** (strong trigger)
- **MUST NOT** create roadmap under `modules/` (module or integration scope) without explicit human confirmation of the full path
- **MUST** fall back to `.ai/.tmp/workdocs/` if human confirmation is not obtained for module/integration scope
- If the user asks to implement immediately but the task is non-trivial, produce the roadmap first, then ask for confirmation to proceed with execution in a follow-up turn.
- If the task meets the workdocs Decision Gate, **MUST prompt user** whether to continue with `create-workdocs-plan`
- If user confirms workdocs bundle creation, **MUST trigger `create-workdocs-plan`**
- SHOULD keep the roadmap macro-level; deep design details belong in separate documentation artifacts
- SHOULD NOT include secrets (credentials, tokens, private keys) in the roadmap
- PRODUCES macro-level roadmaps: milestones, phases, scope, impact, risks, rollback strategy
- PRODUCES requirements documents (when alignment mode is active)
- DOES NOT produce implementation-level documentation (architecture diagrams, step-by-step code guides, pitfalls logs)
- The roadmap is a planning artifact; detailed implementation docs belong to a separate documentation bundle

## Included assets
- Templates:
  - `./templates/roadmap.md` (roadmap document)
  - `./templates/requirement.md` (requirements alignment document)
- Reference: `./reference/detailed-docs-convention.md` (optional file layout convention)
- Example: `./examples/sample-roadmap.md`

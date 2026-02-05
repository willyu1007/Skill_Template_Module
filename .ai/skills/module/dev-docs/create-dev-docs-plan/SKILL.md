---
name: create-dev-docs-plan
description: Create or resume a module/integration dev-docs task bundle (00-05) for non-trivial work requiring handoff or context recovery; docs only (no code changes).
---

# create-dev-docs-plan

## Purpose

Create a dev-docs task bundle that is implementation-ready and suitable for handoff (module-scoped by default).

The repository is module-first:
- Module dev-docs live under `modules/<module_id>/dev-docs/`
- Cross-module integration dev-docs live under `modules/integration/dev-docs/`

## Decision gate (MUST)

Use `create-dev-docs-plan` when any of the following is true:
- Expected duration > 2 hours, or likely to span multiple sessions
- Work requires explicit handoff / context recovery documentation
- High-risk or cross-cutting change:
  - DB / schema migration
  - Auth / security changes
  - CI / CD / infrastructure changes
  - Multi-module or API boundary changes
  - Changes to `.system/modular/` SSOT files
- Unclear scope requiring discovery before implementation
- Meaningful architectural / flow decision needed

Skip `create-dev-docs-plan` when all of the following are true:
- Trivial fix (< 30 min, well-defined scope)
- Single-file change (including adjacent tests / docs in same module)
- Simple refactor with clear scope (even if touching multiple files)
- No handoff expected

> Note: Touching multiple folders (e.g., `src/` + `tests/` + docs) is NOT a sufficient trigger by itself.

## Inputs

- Task statement
- Scope hint (if available): module id, or "integration"
- Any acceptance criteria / constraints

## Outputs

A directory with a dev-docs bundle:

- `00-overview.md`
- `01-plan.md`
- `02-architecture.md`
- `03-implementation-notes.md`
- `04-verification.md`
- `05-pitfalls.md`

## Scope resolution

Dev-docs can be placed in one of three locations:

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

## Procedure

1. Infer scope
   - If the task is clearly about a single module, treat the task as module-scoped.
   - If the task spans multiple modules (or involves scenario testing), treat the task as integration-scoped.
   - If scope is unclear:
     1. Ask the user to confirm `module_id` or `integration`.
     2. If user cannot decide or explicitly requests a temporary location, use `.ai/.tmp/dev-docs/<task_slug>/` as the fallback.
   - If user explicitly specifies `.ai/.tmp/dev-docs/` or "temporary", use that location directly without further scope confirmation.

2. Prefer resume over new creation
   - Check for existing tasks first:
     - Module: `modules/<module_id>/dev-docs/active/`
     - Integration: `modules/integration/dev-docs/active/`
     - Temporary: `.ai/.tmp/dev-docs/`
   - If an active task already matches the user's request, reuse the matching task and only update missing artifacts.
   - If you reuse an existing task, read these first before doing any work:
     - `03-implementation-notes.md`
     - `05-pitfalls.md`

3. Confirm path with user (MUST for non-temporary scope)
   - Propose a `<task_slug>` (kebab-case, e.g., `fix-auth-middleware`, `add-checkout-flag`).
   - For module/integration scope: present the full proposed path and wait for explicit user confirmation before creating any files:
     ```
     Proposed path: modules/<module_id>/dev-docs/active/<task_slug>/
     Please confirm this location, or specify a different one.
     ```
   - For temporary scope: propose the path but may proceed without waiting if user does not respond.

4. Create the dev-docs folder
   - Only after confirmation (for module/integration) or with temporary scope:
     - Module: `modules/<module_id>/dev-docs/active/<task_slug>/`
     - Integration: `modules/integration/dev-docs/active/<task_slug>/`
     - Temporary: `.ai/.tmp/dev-docs/<task_slug>/`

5. Create the bundle files from templates
   - Copy from `./templates/` into the task folder.
   - Fill in placeholders with task-specific content.
   - Set `03-implementation-notes.md`:
     - `Current status: planned`
     - `Last updated: YYYY-MM-DD`

## Notes

- Prefer linking to SSOT: module MANIFEST, `.system/modular/flow_graph.yaml`, and context registries.
- Keep dev-docs concise and operational (paths, commands, current status, concrete verification).

## Execution sync rules (what "good" looks like)

Even though `create-dev-docs-plan` is docs-only, the workflow is designed to make execution robust:
- During implementation, keep these files current:
  - `01-plan.md` (check off completed items; add newly discovered TODOs)
  - `03-implementation-notes.md` (what changed + decisions + deviations)
  - `04-verification.md` (commands run + results + blockers)
- Before context switch/handoff, run `update-dev-docs-for-handoff`.

## Verification

- Confirm the dev-docs directory exists at the intended scope:
  - Module: `modules/<module_id>/dev-docs/active/<task_slug>/`
  - Integration: `modules/integration/dev-docs/active/<task_slug>/`
  - Temporary: `.ai/.tmp/dev-docs/<task_slug>/`
- Confirm the bundle files exist and are filled in (no empty placeholders).

## Boundaries

- Do not implement code changes as part of create-dev-docs-plan. Only create/update dev-docs.
- Do not edit derived artifacts directly (e.g., `docs/context/registry.json`, `.system/modular/*_index.yaml`, `modules/integration/compiled/*`).
- If changes to SSOT are required (MANIFEST / flow_graph / scenarios), use the appropriate ctl scripts and record the change rationale in dev-docs.
- MUST NOT create dev-docs under `modules/` (module or integration scope) without explicit human confirmation of the full path.
- MUST fall back to `.ai/.tmp/dev-docs/` if human confirmation is not obtained for module/integration scope.

## Included assets

- Templates: `./templates/*.md`
- Examples: `./examples/`

## Coordination with plan-maker

| Artifact | Skill | Focus |
|----------|-------|-------|
| `roadmap.md` | `plan-maker` | Macro-level: milestones, phases, impact scope, acceptance criteria, risks, rollback strategy |
| `01-plan.md` | create-dev-docs-plan | Implementation-level: specific steps, file changes, current status tracking |

Typical workflow:
1. For tasks requiring strategic alignment first, use plan-maker to create `roadmap.md`.
2. Use create-dev-docs-plan to create the implementation bundle (`00-overview.md` through `05-pitfalls.md`).
3. Both artifacts coexist in the same dev-docs directory:

```
modules/<module_id>/dev-docs/active/<task_slug>/
  roadmap.md              # Macro-level planning (plan-maker)
  00-overview.md          # Goal, non-goals, acceptance criteria
  01-plan.md              # Implementation plan
  02-architecture.md      # Architecture design
  03-implementation-notes.md  # Current status + TODOs
  04-verification.md      # Verification commands + results
  05-pitfalls.md          # "Do not repeat" lessons
```

## Writing tips

- Write purpose + outcome first in `00-overview.md`.
- Add verification commands with expected results in `04-verification.md`.
- Before finalizing, do a reader test: can a fresh agent answer "what do I do next?" using only the dev-docs bundle?

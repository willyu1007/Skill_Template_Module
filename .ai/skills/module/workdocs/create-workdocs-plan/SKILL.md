---
name: create-workdocs-plan
description: Create or resume a module/integration workdocs task bundle (00–05) for non-trivial work requiring handoff or context recovery; docs only (no code changes).
---

# create-workdocs-plan

## Purpose

Create a workdocs task bundle that is implementation-ready and suitable for handoff (module-scoped by default).

The repository is **module-first**:
- Module workdocs live under `modules/<module_id>/workdocs/`
- Cross-module integration workdocs live under `modules/integration/workdocs/`

## Decision gate (MUST)

Use `create-workdocs-plan` when **any** of the following is true:
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

**Skip** `create-workdocs-plan` when **all** of the following are true:
- Trivial fix (< 30 min, well-defined scope)
- Single-file change (including adjacent tests / docs in same module)
- Simple refactor with clear scope (even if touching multiple files)
- No handoff expected

> **Note**: Touching multiple folders (e.g., `src/` + `tests/` + docs) is NOT a sufficient trigger by itself.

## Inputs

- Task statement
- Scope hint (if available): module id, or "integration"
- Any acceptance criteria / constraints

## Outputs

A directory with a workdocs bundle:

- `00-overview.md`
- `01-plan.md`
- `02-architecture.md`
- `03-implementation-notes.md`
- `04-verification.md`
- `05-pitfalls.md`

## Procedure

1. **Infer scope**
   - If the task is clearly about a single module, treat the task as module-scoped.
   - If the task spans multiple modules (or involves scenario testing), treat the task as integration-scoped.
   - If scope is unclear, ask the user to confirm `module_id` or `integration` before creating files.

2. **Prefer resume over new creation (robustness)**
   - Check for existing tasks first:
     - Module: `modules/<module_id>/workdocs/active/`
     - Integration: `modules/integration/workdocs/active/`
   - If an active task already matches the user's request, **reuse it** and only update missing artifacts (do not create a parallel task folder).
   - If you reuse an existing task, read these first before doing any work:
     - `03-implementation-notes.md`
     - `05-pitfalls.md`

3. **Confirm `<task_slug>` (kebab-case)**
   - Propose a slug (e.g., `fix-auth-middleware`, `add-checkout-flag`), ask the user to confirm.
   - If the user can't decide now, choose a conservative slug and record the assumption in `00-overview.md`.

4. **Create the workdocs folder**
   Use one of:
   - Module-scoped: `modules/<module_id>/workdocs/active/<task_slug>/`
   - Integration-scoped: `modules/integration/workdocs/active/<task_slug>/`

5. **Create the bundle files from templates**
   - Copy from `./templates/` into the task folder.
   - Fill in placeholders with task-specific content.
   - Set `03-implementation-notes.md`:
     - `Current status: planned`
     - `Last updated: YYYY-MM-DD`

## Notes

- Prefer linking to SSOT: module MANIFEST, `.system/modular/flow_graph.yaml`, and context registries.
- Keep workdocs concise and operational (paths, commands, current status, concrete verification).

## Execution sync rules (what "good" looks like)

Even though `create-workdocs-plan` is docs-only, it is designed to make execution **robust**:
- During implementation, keep these files current:
  - `01-plan.md` (check off completed items; add newly discovered TODOs)
  - `03-implementation-notes.md` (what changed + decisions + deviations)
  - `04-verification.md` (commands run + results + blockers)
- Before context switch/handoff, run `update-workdocs-for-handoff`.

## Verification

- Confirm the workdocs directory exists at the intended scope:
  - Module: `modules/<module_id>/workdocs/active/<task_slug>/`
  - Integration: `modules/integration/workdocs/active/<task_slug>/`
- Confirm the bundle files exist and are filled in (no empty placeholders).
- If the task touches modular SSOT (flow/manifests/scenarios), run:
  - `node .ai/scripts/flowctl.mjs lint`
  - `node .ai/scripts/integrationctl.mjs validate`
  - `node .ai/skills/features/context-awareness/scripts/contextctl.mjs verify`

## Boundaries

- Do **not** implement code changes as part of create-workdocs-plan. Only create/update workdocs.
- Do **not** edit derived artifacts (e.g., `docs/context/registry.json`, `.system/modular/*_index.yaml`, `modules/integration/compiled/*`).
- If changes to SSOT are required (MANIFEST / flow_graph / scenarios), use the appropriate ctl scripts and record the change rationale in workdocs.

## Included assets

- Templates: `./templates/*.md`
- Examples: `./examples/`

## Coordination with plan-maker

| Artifact | Skill | Focus |
|----------|-------|-------|
| `roadmap.md` | `plan-maker` | Macro-level: milestones, phases, impact scope, acceptance criteria, risks, rollback strategy |
| `01-plan.md` | **create-workdocs-plan** | Implementation-level: specific steps, file changes, current status tracking |

Typical workflow:
1. For tasks requiring strategic alignment first, use `plan-maker` to create `roadmap.md`
2. Use `create-workdocs-plan` to create the implementation bundle (`00-overview.md` through `05-pitfalls.md`)
3. Both artifacts coexist in the same workdocs directory:

```
modules/<module_id>/workdocs/active/<task_slug>/
  roadmap.md              # Macro-level planning (plan-maker)
  00-overview.md          # Goal, non-goals, acceptance criteria
  01-plan.md              # Implementation plan (create-workdocs-plan)
  02-architecture.md      # Architecture design
  03-implementation-notes.md  # Current status + TODOs
  04-verification.md      # Verification commands + results
  05-pitfalls.md          # "Do not repeat" lessons
```


## Writing and collaboration tips (borrowed)

To make workdocs usable for both humans and LLMs:

- Write **purpose + outcome first** in `00-overview.md`.
- Keep paragraphs single-intent; use headings that match the decisions the reader must make.
- Use MUST/SHOULD/MAY for constraints and invariants.
- Add verification commands with expected results (especially in `04-verification.md`).
- Before finalizing, do a quick **reader test**: can a fresh agent answer "what do I do next?" using only the workdocs bundle?

If workdocs content is also used for status updates, consider a short **3P (Progress / Plans / Problems)** summary in `handoff.md`.

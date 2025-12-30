---
name: create-dev-docs-plan
description: Create a lightweight, implementation-ready workdocs plan for a task.
---

# create-dev-docs-plan

## Purpose

Create a lightweight, implementation-ready **workdocs plan** for a task (module-scoped by default).

This repository is **module-first**:
- Module workdocs live under `modules/<module_id>/workdocs/`
- Cross-module integration workdocs live under `modules/integration/workdocs/`

## Inputs

- Task statement
- Scope hint (if available): module id, or "integration"
- Any acceptance criteria / constraints

## Outputs

A directory with a plan and supporting notes, typically:

- `plan.md` — the plan / checklist
- `context.md` — key context + links
- `decisions.md` — key decisions (lightweight ADR notes)
- `risks.md` — risks + mitigations (optional)

## Procedure

1. **Infer scope**
   - If the task is clearly about a single module, treat it as module-scoped.
   - If it spans multiple modules (or involves scenario testing), treat it as integration-scoped.

2. **Create the workdocs folder**
   Use one of:
   - Module-scoped: `modules/<module_id>/workdocs/active/<task_slug>/`
   - Integration-scoped: `modules/integration/workdocs/active/<task_slug>/`

3. **Write `plan.md`**
   Must include:
   - Goal / success criteria
   - Constraints / non-goals
   - Work breakdown (checklist)
   - Validation plan (tests, lint, scenario checks)
   - Rollback plan (if applicable)

4. **Write `context.md`**
   - Relevant files
   - Relevant scripts
   - Relevant flow nodes / interfaces (if applicable)
   - Open questions (only if truly blocking)

5. **Write `decisions.md`**
   - Record any decisions that affect module boundaries, SSOT, or interfaces.

## Notes

- Prefer linking to SSOT: module MANIFEST, `.system/modular/flow_graph.yaml`, and context registries.
- Do not use `dev/` in this template; it has been replaced by `workdocs/` and module-local `workdocs/`.

## Verification

- Confirm the workdocs directory exists at the intended scope:
  - Module: `modules/<module_id>/workdocs/active/<task_slug>/`
  - Integration: `modules/integration/workdocs/active/<task_slug>/`
- Confirm the plan includes a validation section with concrete commands.
- If the task touches modular SSOT (flow/manifests/scenarios), run:
  - `node .ai/scripts/flowctl.js lint`
  - `node .ai/scripts/integrationctl.js validate`
  - `node .ai/scripts/contextctl.js verify`

## Boundaries

- Do **not** implement code changes as part of this skill. Only create/update workdocs.
- Do **not** edit derived artifacts (e.g., `docs/context/registry.json`, `.system/modular/*_index.yaml`, `modules/integration/compiled/*`).
- Do **not** introduce project-level `dev/` docs (this template uses `workdocs/` and module-local workdocs).
- If changes to SSOT are required (MANIFEST / flow_graph / scenarios), use the appropriate ctl scripts and record the change rationale in workdocs.

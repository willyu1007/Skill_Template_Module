# create-dev-docs-plan

## Purpose

Create a lightweight, implementation-ready **workdocs plan** for a task (module-scoped by default).

This repository is **module-first**:
- Module workdocs live under `modules/<module_id>/workdocs/`
- Cross-module integration workdocs live under `modules/integration/workdocs/`
- Project-level workdocs live under `workdocs/`

## Inputs

- Task statement
- Scope hint (if available): module id, or “integration”, or “project”
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
   - Otherwise, treat it as project-scoped.

2. **Create the workdocs folder**
   Use one of:
   - Module-scoped: `modules/<module_id>/workdocs/active/<task_slug>/`
   - Integration-scoped: `modules/integration/workdocs/active/<task_slug>/`
   - Project-scoped: `workdocs/active/<task_slug>/`

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

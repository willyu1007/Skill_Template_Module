---
name: create-workdocs-plan
description: Create a workdocs task bundle for a module or integration task (overview/plan/architecture/implementation notes/verification + pitfalls).
---

# create-workdocs-plan

## Purpose

Create a workdocs task bundle that is implementation-ready and suitable for handoff (module-scoped by default).

The repository is **module-first**:
- Module workdocs live under `modules/<module_id>/workdocs/`
- Cross-module integration workdocs live under `modules/integration/workdocs/`

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

2. **Create the workdocs folder**
   Use one of:
   - Module-scoped: `modules/<module_id>/workdocs/active/<task_slug>/`
   - Integration-scoped: `modules/integration/workdocs/active/<task_slug>/`

3. **Create the bundle files from templates**
   - Copy from `./templates/` into the task folder.
   - Fill in placeholders with task-specific content.

## Notes

- Prefer linking to SSOT: module MANIFEST, `.system/modular/flow_graph.yaml`, and context registries.
- Keep workdocs concise and operational (paths, commands, current status, concrete verification).

## Verification

- Confirm the workdocs directory exists at the intended scope:
  - Module: `modules/<module_id>/workdocs/active/<task_slug>/`
  - Integration: `modules/integration/workdocs/active/<task_slug>/`
- Confirm the bundle files exist and are filled in (no empty placeholders).
- If the task touches modular SSOT (flow/manifests/scenarios), run:
  - `node .ai/scripts/flowctl.js lint`
  - `node .ai/scripts/integrationctl.js validate`
  - `node .ai/scripts/contextctl.js verify`

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

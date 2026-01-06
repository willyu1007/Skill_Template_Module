---
name: modules
purpose: Explain the module system and AI-first operating rules for module-scoped work.
---

# Module workspace

This repository is **module-first**.

- A **module instance** lives under `modules/<module_id>/`.
- The primary long-running documentation location is **module-local**: `modules/<module_id>/workdocs/`.
- Cross-module integration work lives under `modules/integration/`.

## Operating mode

When working on a specific module:

1. Prefer reading the module's `AGENTS.md` and `MANIFEST.yaml` first.
2. **Workdocs decision gate (MUST)**:
   - If the user asks for planning before coding (plan/roadmap/milestones/phases, regardless of language): use `plan-maker` to write `workdocs/active/<task_slug>/roadmap.md` first (planning-only).
   - For multi-step/multi-file work: check `workdocs/active/` for an existing task; if present, read `03-implementation-notes.md` + `05-pitfalls.md` first, otherwise create one via `create-workdocs-plan`.
   - During execution, keep `01-plan.md`, `03-implementation-notes.md`, and `04-verification.md` current.
3. Treat the module directory as the default write scope.
4. If a change impacts business flows, update `.system/modular/flow_graph.yaml` via `flowctl`.
5. After changing manifests, regenerate derived artifacts:
   - `node .ai/scripts/modulectl.js registry-build`
   - `node .ai/scripts/flowctl.js update-from-manifests`
   - `node .ai/scripts/flowctl.js lint`
6. **Before handoff / wrap-up (MUST)**: run `update-workdocs-for-handoff` so another developer/agent can resume safely.

## Directory skeleton (recommended)

```
modules/<module_id>/
  MANIFEST.yaml
  AGENTS.md
  ABILITY.md
  interact/
  config/
  src/
  tests/
  workdocs/
```

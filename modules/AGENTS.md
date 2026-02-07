---
name: modules
purpose: Explain the module system and AI-first operating rules for module-scoped work.
---

# Module workspace

This repository is **module-first**.

- A **module instance** lives under `modules/<module_id>/`.
- The primary long-running documentation location is **module-local**: `modules/<module_id>/dev-docs/`.
- Cross-module integration work lives under `modules/integration/`.

## Operating mode

When working on a specific module:

1. Prefer reading the module's `AGENTS.md` and `MANIFEST.yaml` first.
2. **Dev-docs decision gate (MUST)**:
   - If the user asks for planning before coding (plan/roadmap/milestones/phases, regardless of language): use `plan-maker` to write `dev-docs/active/<task_slug>/roadmap.md` first (planning-only).
   - For multi-step/multi-file work: check `dev-docs/active/` for an existing task; if present, read `03-implementation-notes.md` + `05-pitfalls.md` first, otherwise create one via `create-dev-docs-plan`.
   - During execution, keep `01-plan.md`, `03-implementation-notes.md`, and `04-verification.md` current.
3. Treat the module directory as the default write scope.
4. If a change impacts business flows, update `.system/modular/flow_graph.yaml` via `ctl-flow`.
5. After changing manifests, regenerate derived artifacts:
   - `node .ai/scripts/modules/ctl-module.mjs registry-build`
   - `node .ai/scripts/modules/ctl-flow.mjs update-from-manifests`
   - `node .ai/scripts/modules/ctl-flow.mjs lint`
6. **Before handoff / wrap-up (MUST)**: run `update-dev-docs-for-handoff` so another developer/agent can resume safely.

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
  dev-docs/
```

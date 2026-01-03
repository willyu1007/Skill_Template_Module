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
2. **For multi-step tasks**: Check `workdocs/active/` for existing plans or create one via `create-dev-docs-plan` skill.
3. Treat the module directory as the default write scope.
4. If a change impacts business flows, update `.system/modular/flow_graph.yaml` via `flowctl`.
5. After changing manifests, regenerate derived artifacts:
   - `node .ai/scripts/modulectl.js registry-build`
   - `node .ai/scripts/flowctl.js update-from-manifests`
   - `node .ai/scripts/flowctl.js lint`
6. **Before handoff**: Update workdocs via `update-dev-docs-for-handoff` skill if a plan exists.

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

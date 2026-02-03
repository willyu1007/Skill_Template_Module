---
name: integration
purpose: Integration scenarios and cross-module debugging workspace.
---

# Integration workspace

This directory is a **cross-module** workspace.

It holds:

- `scenarios.yaml` (SSOT; manual but validated)
- `compiled/` (derived scenario plans)
- `runs/` (derived run reports)
- `dev-docs/` (handoff/triage notes)

## Rules

- Do not edit derived assets by hand.
- Keep scenarios aligned to `.system/modular/flow_graph.yaml`.
- Validate + compile scenarios before running:
  - `node .ai/scripts/modules/integrationctl.mjs validate`
  - `node .ai/scripts/modules/integrationctl.mjs compile`

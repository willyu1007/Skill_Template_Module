---
name: maintain-flow-graph
description: Maintain `.system/modular/flow_graph.yaml` and bindings in a validated, module-first workflow.
---

# Maintain Flow Graph SSOT

## Purpose

Maintain the business flow graph SSOT and keep derived indexes/graphs in sync.

## Inputs

- Flow changes (new flow, node, edge, or status change)
- Optional binding changes for multi-implementation nodes

## Outputs

- Updated SSOT:
  - `.system/modular/flow_graph.yaml`
  - `.system/modular/flow_bindings.yaml` (when needed)
- Updated derived:
  - `.system/modular/flow_impl_index.yaml`
  - `.system/modular/graphs/*.mmd`

## Procedure

1. Edit the SSOT flow graph:

- `.system/modular/flow_graph.yaml`

Recommended structure:

- `flows[].id`
- `flows[].nodes[].id`
- `flows[].edges[].from` / `to`

2. If a node has multiple implementations, update bindings:

- `.system/modular/flow_bindings.yaml`

3. Rebuild derived index + graphs:

```bash
node .ai/scripts/flowctl.js update-from-manifests
```

4. Validate:

```bash
node .ai/scripts/flowctl.js lint --strict
```

## Notes

- Prefer stable IDs; deprecate instead of renaming.
- Keep YAML simple (no advanced YAML features) to ensure deterministic tooling.

## Examples

See `examples/` for example flow definitions:

- `user_management_flow.yaml` - User CRUD flow with nodes and edges
- `order_processing_flow.yaml` - Order lifecycle flow

Copy and adapt these to your business requirements.

## Verification

- Run `node .ai/scripts/flowctl.js lint --strict` and `node .ai/scripts/flowctl.js graph`.

## Boundaries

- Do **not** edit derived artifacts directly; use the ctl scripts to regenerate them.
- Do **not** introduce alternative SSOT files or duplicate registries (single source of truth is enforced).
- Keep changes scoped: prefer module-local updates (MANIFEST, interact registry) over project-wide edits when possible.

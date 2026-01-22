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

## LLM Execution Protocol

### Phase 0 — Clarify the change (no SSOT writes)

1. Identify what is being changed:
   - New flow, new node(s), new edge(s)
   - Status change (`planned`→`active`, `active`→`deprecated`, etc.)
   - Multi-implementation selection that requires bindings
2. Confirm naming: **flow IDs and node IDs MUST be kebab-case** (e.g., `user-management`, `create-user`).
3. Enumerate expected downstream edits (do not perform them yet):
   - Which module(s) will implement the new node(s) via `MANIFEST.yaml` `interfaces[].implements[]`
   - If a module maintains `participates_in` (non-empty), keep it consistent with the implemented flow/node set
   - Whether `flow_bindings.yaml` needs an explicit binding for multi-implementation nodes
   - Whether integration scenarios should be added/updated

### Phase 1 — Plan and request approval (no SSOT writes)

Produce a plan that includes:
- The exact `flow_graph.yaml` diff (flow/node/edge blocks)
- Any required `flow_bindings.yaml` entries
- A short impact list of other files expected to change (manifests, scenarios)

**Checkpoint**: request explicit approval before editing `.system/modular/flow_graph.yaml`.

```
[APPROVAL REQUIRED]
Flow SSOT change plan is ready.

Files to edit:
- .system/modular/flow_graph.yaml
- .system/modular/flow_bindings.yaml (only if needed)

Type "approve flow" to apply the SSOT edits.
```

### Phase 2 — Apply SSOT edits

1. Apply the approved changes to `.system/modular/flow_graph.yaml` (and `flow_bindings.yaml` if needed).
2. Rebuild derived artifacts and graphs:

```bash
node .ai/scripts/modules/flowctl.mjs update-from-manifests
node .ai/scripts/modules/flowctl.mjs graph
node .ai/scripts/modules/flowctl.mjs lint
```

### Phase 3 — Regressions (recommended)

If the repo contains integration scenarios, validate them:

```bash
node .ai/scripts/modules/integrationctl.mjs validate
node .ai/scripts/modules/integrationctl.mjs compile
```

### Failure handling

- If `flowctl lint` reports unknown nodes/edges: fix `flows[].nodes[]` / `flows[].edges[]` references first.
- If `integrationctl validate` fails after a flow change: update `flow_bindings.yaml` and/or module manifests `implements` to ensure nodes resolve.

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
node .ai/scripts/modules/flowctl.mjs update-from-manifests
```

4. Validate:

```bash
node .ai/scripts/modules/flowctl.mjs lint
```

## Notes

- Prefer stable IDs; deprecate instead of renaming.
- Keep YAML simple (no advanced YAML features) to ensure deterministic tooling.

## Examples

See `examples/` for example flow definitions:

- `user-management-flow.yaml` - User CRUD flow with nodes and edges
- `order-processing-flow.yaml` - Order lifecycle flow

Copy and adapt these to your business requirements.

## Verification

- Run `node .ai/scripts/modules/flowctl.mjs lint` and `node .ai/scripts/modules/flowctl.mjs graph`.

## Boundaries

- Do **not** edit derived artifacts directly; use the ctl scripts to regenerate them.
- Do **not** introduce alternative SSOT files or duplicate registries (single source of truth is enforced).
- Keep changes scoped: prefer module-local updates (MANIFEST, interact registry) over project-wide edits when possible.

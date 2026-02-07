---
name: manage-integration-scenarios
description: Maintain integration scenarios (SSOT) and run compile/validation/execution checks.
---

# Manage Integration Scenarios

## Purpose

Maintain cross-module integration scenarios under `modules/integration/` and ensure they are consistent with:

- `.system/modular/flow_graph.yaml` (SSOT)
- `.system/modular/flow_impl_index.yaml` (derived from manifests)

## Inputs

- Scenario intent (flow + sequence of nodes)
- Optional endpoint selections (when nodes have multiple implementations)

## Outputs

- Updated SSOT:
  - `modules/integration/scenarios.yaml`
- Updated derived:
  - `modules/integration/compiled/*.json`
  - `modules/integration/runs/*.json` (when executing)

## LLM Execution Protocol

### Phase 0 — Clarify scenario intent (no SSOT writes)

1. Confirm:
   - the target `flow_id` (MUST be kebab-case)
   - the ordered node sequence (each `node_id` MUST be kebab-case)
   - whether planned nodes are allowed (`allow_unresolved: true`)
2. Decide how endpoints are selected:
   - Prefer `use_binding` (project-level SSOT) when a node has multiple implementations
   - Use `endpoint_id` only when you need a one-off override

### Phase 1 — Plan and request approval (no SSOT writes)

Provide a plan that includes:
- the scenario id(s) to add/update (kebab-case)
- the step list (flow nodes + expected assertions)
- endpoint selection strategy (`use_binding` vs explicit `endpoint_id`)

**Checkpoint**: request explicit approval before editing `modules/integration/scenarios.yaml`.

```
[APPROVAL REQUIRED]
I am ready to edit integration scenarios SSOT:
- modules/integration/scenarios.yaml

Type "approve scenarios" to apply the change.
```

### Phase 2 — Apply and verify

1. Edit `modules/integration/scenarios.yaml`.
2. Validate and compile:

```bash
node .ai/scripts/modules/ctl-integration.mjs validate
node .ai/scripts/modules/ctl-integration.mjs compile
```

3. Optional strict mode (treat warnings as errors):

```bash
node .ai/scripts/modules/ctl-integration.mjs validate
```

### Phase 3 — Optional execution

Execution is environment-specific. If base URLs are configured, you can run:

```bash
node .ai/scripts/modules/ctl-integration.mjs run --execute
```

If base URLs are not configured, HTTP steps will be marked as SKIPPED.

## Procedure

1. Validate scenarios (fast, no execution):

```bash
node .ai/scripts/modules/ctl-integration.mjs validate
```

2. Compile scenarios into resolved plans:

```bash
node .ai/scripts/modules/ctl-integration.mjs compile
```

3. (Optional) Execute HTTP steps:

- Configure base URLs:
  - `.system/modular/runtime_endpoints.yaml`, or
  - environment variables: `MODULE_BASE_URL_<MODULE_ID_ENV>`
    - `<MODULE_ID_ENV>` is `module_id` uppercased, with `-` (and `.` if present) replaced by `_`
    - Example: module `billing-api` → `MODULE_BASE_URL_BILLING_API=http://localhost:3000`

Then run:

```bash
node .ai/scripts/modules/ctl-integration.mjs run --execute
```

## Notes

- Scenario steps must follow valid edges in the flow graph.
- Prefer adding bindings in `flow_bindings.yaml` instead of hardcoding endpoint_id in every scenario step.

## Examples

See `examples/` for example scenario definitions:

- `user-management-scenarios.yaml` - User CRUD integration scenarios

Copy and adapt these to your integration testing needs.

## Verification

- Run `node .ai/scripts/modules/ctl-integration.mjs validate` and `node .ai/scripts/modules/ctl-integration.mjs compile`.

## Boundaries

- Do **not** edit derived artifacts directly; use the ctl scripts to regenerate them.
- Do **not** introduce alternative SSOT files or duplicate registries (single source of truth is enforced).
- Keep changes scoped: prefer module-local updates (MANIFEST, interact registry) over project-wide edits when possible.

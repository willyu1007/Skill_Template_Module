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

## Procedure

1. Validate scenarios (fast, no execution):

```bash
node .ai/scripts/integrationctl.js validate
```

2. Compile scenarios into resolved plans:

```bash
node .ai/scripts/integrationctl.js compile
```

3. (Optional) Execute HTTP steps:

- Configure base URLs:
  - `.system/modular/runtime_endpoints.yaml`, or
  - environment variables: `MODULE_BASE_URL_<MODULE_ID>`
    - Example: `MODULE_BASE_URL_BILLING_API=http://localhost:3000`

Then run:

```bash
node .ai/scripts/integrationctl.js run --execute
```

## Notes

- Scenario steps must follow valid edges in the flow graph.
- Prefer adding bindings in `flow_bindings.yaml` instead of hardcoding endpoint_id in every scenario step.

## Examples

See `examples/` for example scenario definitions:

- `user_management_scenarios.yaml` - User CRUD integration scenarios

Copy and adapt these to your integration testing needs.

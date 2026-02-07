# Modular System Quickstart

The document is an end-to-end quickstart for the **module-first** (modular) system in the repository.

## Table of contents

- [Modular System Quickstart](#modular-system-quickstart)
  - [Table of contents](#table-of-contents)
  - [Key concepts](#key-concepts)
  - [ID Naming Convention](#id-naming-convention)
  - [SSOT vs derived artifacts](#ssot-vs-derived-artifacts)
  - [Create a module instance](#create-a-module-instance)
  - [Define a business flow graph](#define-a-business-flow-graph)
  - [Connect modules to flow nodes](#connect-modules-to-flow-nodes)
  - [Manage context artifacts](#manage-context-artifacts)
  - [Define integration scenarios](#define-integration-scenarios)
  - [Verification loop](#verification-loop)
  - [AI-assisted workflows (skills)](#ai-assisted-workflows-skills)
  - [More references](#more-references)

---

## Key concepts

| Concept | Meaning | Location |
|---|---|---|
| **Module instance** | The smallest durable ownership boundary (code + docs + contracts) | `modules/<module_id>/` |
| **Business flow graph** | Machine-readable BPMN-style flow graph (flows, nodes, edges) | `.system/modular/flow_graph.yaml` |
| **Interface** | A callable entrypoint a module exposes | `modules/<module_id>/MANIFEST.yaml` |
| **Bindings** | Manual selection rules when a flow node has multiple implementations | `.system/modular/flow_bindings.yaml` |
| **Integration scenarios** | End-to-end paths across flow nodes, used for validation/testing | `modules/integration/scenarios.yaml` |
| **Context artifacts** | Curated contracts (OpenAPI/DB schema/BPMN/etc.) for LLM context | `modules/<module_id>/interact/registry.json` |

---

## ID Naming Convention

All IDs in the modular system follow **kebab-case**:

- Module IDs: `user-api`, `billing-service`, `auth-module`
- Flow IDs: `user-management`, `order-fulfillment`
- Node IDs: `create-user`, `place-order`, `send-notification`
- Scenario IDs: `create-and-retrieve-user`

**Pattern**: `^[a-z0-9]+(?:-[a-z0-9]+)*$`

**Why kebab-case?**

- Compatible with directory names and URL paths
- Clear word separation without ambiguity
- Works well with environment variable name generation
- Avoids issues with different operating systems

---

## SSOT vs derived artifacts

SSOT (manually maintained, validated by scripts):

- `modules/*/MANIFEST.yaml`
- `modules/*/interact/registry.json`
- `.system/modular/flow_graph.yaml`
- `.system/modular/flow_bindings.yaml`
- `modules/integration/scenarios.yaml`

Derived (generated; do not edit by hand):

- `.system/modular/instance_registry.yaml`
- `.system/modular/flow_impl_index.yaml`
- `.system/modular/graphs/*.mmd`
- `docs/context/registry.json`
- `modules/integration/compiled/*.json`
- `modules/integration/runs/*.json`

---

## Create a module instance

Recommended (script-driven):

```bash
node .ai/scripts/modules/ctl-module.mjs init --module-id billing-api --apply
```

Optional parameters:

```bash
node .ai/scripts/modules/ctl-module.mjs init \
  --module-id billing-api \
  --module-type service \
  --description "Billing API" \
  --apply
```

`ctl-module init` will:

- create the module skeleton under `modules/<module_id>/`
- rebuild the derived instance registry (`.system/modular/instance_registry.yaml`)
- rebuild the derived flow implementation index (`.system/modular/flow_impl_index.yaml`)
- rebuild the derived context view (`docs/context/registry.json`)

If you prefer manual setup, use the recommended skeleton from `modules/AGENTS.md`.

---

## Define a business flow graph

Edit `.system/modular/flow_graph.yaml` (keep IDs stable; prefer "deprecate" over rename):

```yaml
flows:
  - id: billing-flow
    description: "Billing lifecycle"
    status: active

    nodes:
      - id: create-invoice
        description: "Create invoice"
        status: active

      - id: send-invoice
        description: "Send invoice"
        status: active

      - id: process-payment
        description: "Process payment"
        status: active

    edges:
      - from: create-invoice
        to: send-invoice
        description: "After creation, send invoice"

      - from: send-invoice
        to: process-payment
        description: "After sending, wait for payment"
```

Validate the flow graph:

```bash
node .ai/scripts/modules/ctl-flow.mjs lint
```

Generate relationship graphs (Mermaid):

```bash
node .ai/scripts/modules/ctl-flow.mjs graph
```

---

## Connect modules to flow nodes

Modules attach implementations to flow nodes via `interfaces[].implements[]` in `modules/<module_id>/MANIFEST.yaml`.

Example:

```yaml
module_id: billing-api
module_type: service
description: "Billing API"
status: active

interfaces:
  - id: http-api.create-invoice
    protocol: http
    method: POST
    path: /api/invoices
    description: "Create invoice"
    status: active
    implements:
      - flow_id: billing-flow
        node_id: create-invoice
        variant: default
```

Rebuild derived indexes after changing manifests:

```bash
node .ai/scripts/modules/ctl-module.mjs registry-build
node .ai/scripts/modules/ctl-flow.mjs update-from-manifests
node .ai/scripts/modules/ctl-flow.mjs lint --strict
```

If a node has multiple implementations, define a binding in `.system/modular/flow_bindings.yaml` and prefer `use_binding` in scenarios (instead of hardcoding `endpoint_id` everywhere).

Environment-based selection:

- set `MODULAR_ENV` (or `ENVIRONMENT` / `NODE_ENV`) so bindings can pick different endpoints per env

---

## Manage context artifacts

Context is maintained bottom-up:

- project-level SSOT: `docs/context/project.registry.json`
- module-level SSOT: `modules/<module_id>/interact/registry.json`
- derived aggregated view: `docs/context/registry.json`

Register a module-local artifact (example: OpenAPI):

```bash
node .ai/skills/features/context-awareness/scripts/ctl-context.mjs add-artifact \
  --module-id billing-api \
  --artifact-id openapi \
  --type openapi \
  --path modules/billing-api/interact/openapi.yaml \
  --mode contract
```

Rebuild and verify:

```bash
node .ai/skills/features/context-awareness/scripts/ctl-context.mjs build
node .ai/skills/features/context-awareness/scripts/ctl-context.mjs verify --strict
```

---

## Define integration scenarios

Integration assets live under `modules/integration/` as a **cross-module workspace**:

- SSOT: `modules/integration/scenarios.yaml`
- derived: `modules/integration/compiled/`, `modules/integration/runs/`

Create a scenario stub:

```bash
node .ai/scripts/modules/ctl-integration.mjs new-scenario \
  --id billing-happy-path \
  --flow-id billing-flow \
  --nodes create-invoice,send-invoice,process-payment
```

Validate and compile:

```bash
node .ai/scripts/modules/ctl-integration.mjs validate --strict
node .ai/scripts/modules/ctl-integration.mjs compile
```

Optional: execute HTTP steps (when runtime endpoints are configured)

- Configure base URLs:
  - `.system/modular/runtime_endpoints.yaml`, or
  - env vars: `MODULE_BASE_URL_<MODULE_ID_ENV>` (example: `MODULE_BASE_URL_BILLING_API=http://localhost:3000`)
    - `<MODULE_ID_ENV>` is `module_id` uppercased, with `-` replaced by `_`

Run (dry-run by default; add `--execute` to actually call):

```bash
node .ai/scripts/modules/ctl-integration.mjs run --execute
```

Scenario steps can include `expect` checks (evaluated during execution) to close the loop:

- expected status (default: 2xx)
- body contains strings
- JSON structural checks (contains / path exists / path equals)

Troubleshooting:

- If steps are `SKIPPED` with `missing_base_url`, configure `.system/modular/runtime_endpoints.yaml` or `MODULE_BASE_URL_<MODULE_ID_ENV>`.
- If steps fail with `unresolved_endpoint`, rebuild derived registries: `ctl-module registry-build` + `ctl-flow update-from-manifests`.

---

## Verification loop

After changing flows/manifests/scenarios/context:

```bash
node .ai/scripts/modules/ctl-module.mjs registry-build
node .ai/scripts/modules/ctl-flow.mjs update-from-manifests
node .ai/scripts/modules/ctl-flow.mjs lint --strict
node .ai/scripts/modules/ctl-flow.mjs graph
node .ai/scripts/modules/ctl-integration.mjs validate --strict
node .ai/scripts/modules/ctl-integration.mjs compile
node .ai/skills/features/context-awareness/scripts/ctl-context.mjs build
node .ai/skills/features/context-awareness/scripts/ctl-context.mjs verify --strict
```

---

## AI-assisted workflows (skills)

If you're using an AI assistant integrated with the repo, you can ask the assistant to run these workflows interactively via built-in skills:

- Module creation: `initialize-module-instance`
- Flow graph maintenance: `maintain-flow-graph`
- Integration scenarios: `manage-integration-scenarios`
- Modular SSOT consistency: `maintain-flow-graph` + `manage-integration-scenarios`

Example prompts you can give the assistant:

- "Use `initialize-module-instance` to create `billing-api` with an HTTP interface for `billing-flow.create-invoice`, then rebuild registries."
- "Use `maintain-flow-graph` to add `billing-flow` (nodes + edges) and run `ctl-flow lint --strict`."
- "Use `manage-integration-scenarios` to scaffold a scenario for `billing-flow` and compile it. Prefer `use_binding` if needed."
- "Register `modules/billing-api/interact/openapi.yaml` via `ctl-context add-artifact`, then rebuild `docs/context/registry.json`."

---

## More references

- Module system guide: `modules/AGENTS.md`
- Integration workspace guide: `modules/integration/AGENTS.md`

Templates / examples (for reference):

- Example module: `.ai/skills/module/initialize-module-instance/examples/example-api/`
- Example flow graphs: `.ai/skills/module/maintain-flow-graph/examples/`
- Example integration scenarios: `.ai/skills/module/manage-integration-scenarios/examples/`

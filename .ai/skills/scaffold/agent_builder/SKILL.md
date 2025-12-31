---
name: agent_builder
description: Scaffold a module-embedded agent component (agent proxy) and integrate its API/contract artifacts into module-first SSOT.
---

# Agent Builder

## Purpose

Scaffold a **production-oriented agent component** (a.k.a. agent proxy) to solve a concrete product/ops problem, and bind it to:

- an **existing module instance** (the agent is a module subcomponent, not a standalone module)
- a **business flow node** in `.system/modular/flow_graph.yaml`
- the module-first SSOT and integration toolchain (MANIFEST, module interact registry, integration scenarios)

This skill is designed for **LLM-first, human support** workflows:
- The agent_builder uses a temporary workdir, explicit approvals, deterministic scaffolding, and script-driven updates.
- It avoids implicit edits to repository SSOT that the user did not approve.

## Non-negotiable Constraints

- **Agent is a module subcomponent**: Generated code lives under `modules/<module_id>/src/agents/<agent_id>/`, not a separate module.
- **Flow binding is mandatory**: `modular.flow_node.flow_id` and `modular.flow_node.node_id` must be specified.
- **agent_builder does NOT edit flow_graph.yaml**: If flow nodes are missing, a `flow-change-request.md` is emitted and integration stops.
- **Explicit approvals required**: Stage A (integration decision) and Stage B (blueprint) require user approval before scaffolding.
- **Kill switch mandatory**: `AGENT_ENABLED` env var must be in `configuration.env_vars`.
- **API routes fixed**: Must include `run` and `health` routes.
- **No secrets in repo**: `.env.example` contains placeholders only.
- **Core/Adapters separation required**: All agents use the `core/` + `adapters/` structure.

## Inputs

- A clear problem statement + acceptance scenarios
- Target module instance id (`modules/<module_id>/MANIFEST.yaml`)
- Target business flow binding (`flow_id` + `node_id`)
- API contract details (base_path, routes, schemas, auth, budgets)

## Outputs

- Agent component scaffolded under the host module:
  - `modules/<module_id>/src/agents/<agent_id>/...`
- Module-local agent workdocs:
  - `modules/<module_id>/workdocs/active/agent-<agent_id>/...`
- Module-local agent contract artifacts (SSOT):
  - `modules/<module_id>/interact/agents/<agent_id>/blueprint.json`
  - `modules/<module_id>/interact/agents/<agent_id>/openapi.json`
- Script-driven modular integration (SSOT + derived):
  - Update `modules/<module_id>/MANIFEST.yaml` interfaces + implements
  - Optionally scaffold an integration scenario in `modules/integration/scenarios.yaml`
  - Rebuild derived registries/indexes via `modulectl`, `flowctl`, `contextctl`, `integrationctl`

---

## LLM Execution Protocol

When a user requests "I want an Agent with X capability", execute the following protocol:

### Phase 0: Requirement Parsing

**Trigger**: User describes an Agent need (explicit or implicit).

**Actions**:
1. Extract from user request:
   - Functional goal (what the agent should do)
   - Integration target (where it will be embedded — which module?)
   - Trigger type (how it will be invoked)
   - Expected output format
2. Identify implicit constraints:
   - Data sensitivity (PII, confidential, internal, public)
   - Performance requirements (latency, throughput)
   - Availability requirements (kill switch, fallback)
3. Confirm the **host module exists**: `modules/<module_id>/MANIFEST.yaml`.
4. Confirm the **flow binding exists**: `.system/modular/flow_graph.yaml` contains the target `flow_id` + `node_id`.
5. Summarize understanding and confirm with user before proceeding.

**Output**: Verbal confirmation of understanding.

### Phase 1: Stage A — Interview

**Actions**:
1. Run: `node .ai/skills/scaffold/agent_builder/scripts/agent-builder.js start`
2. Note the temporary workdir path returned.
3. Walk through `reference/decision_checklist.md` with the user (16 decision points).
4. Generate `stageA/interview-notes.md` in the workdir.
5. Generate `stageA/integration-decision.md` in the workdir (use template at `templates/stageA/`).

**Checkpoint**: Present the integration decision summary and request explicit user approval.

```
[APPROVAL REQUIRED]
Stage A complete. Please review the integration decision:
- Host module: <module_id>
- Flow binding: <flow_id>.<node_id>
- Primary embedding: API (HTTP)
- Attachments: [worker/sdk/cron/pipeline]
- Failure mode: [propagate_error/return_fallback/enqueue_retry]

Type "approve A" to proceed to Blueprint generation.
```

**On Approval**: Run `node .../agent-builder.js approve --workdir <WORKDIR> --stage A`

### Phase 2: Stage B — Blueprint

**Actions**:
1. Encode all decisions into `stageB/agent-blueprint.json` following the schema at `templates/agent-blueprint.schema.json`.
2. Ensure `modular.host_module_id` matches the target module.
3. Ensure `modular.flow_node.flow_id` and `modular.flow_node.node_id` are valid.
4. Run validation: `node .../agent-builder.js validate-blueprint --workdir <WORKDIR>`
5. If validation fails, fix errors and re-validate.

**Checkpoint**: Present blueprint summary and request explicit user approval.

```
[APPROVAL REQUIRED]
Blueprint validated successfully. Key configuration:
- Agent ID: {{agent_id}}
- Host Module: {{modular.host_module_id}}
- Flow Binding: {{modular.flow_node.flow_id}}.{{modular.flow_node.node_id}}
- Interfaces: [http, worker, ...]
- Conversation mode: {{conversation.mode}}
- Acceptance scenarios: {{scenario_count}}

Type "approve B" to proceed to scaffolding.
```

**On Approval**: Run `node .../agent-builder.js approve --workdir <WORKDIR> --stage B`

### Phase 3: Stage C — Scaffold

**Actions**:
1. Run plan first: `node .../agent-builder.js plan --workdir <WORKDIR>`
2. Present the file list to be created under the host module.
3. Run apply: `node .../agent-builder.js apply --workdir <WORKDIR> --apply`
4. Report created files and any skipped files.

**Output**: List of generated files organized by category (code, docs, config).

### Phase 4: Stage D — Implement (Manual / LLM-assisted)

> Stage D is manual; the scaffold generates placeholders that require implementation.

**Actions** (performed by developer or LLM):
1. **Implement Tools**: For each tool in `blueprint.tools.tools[]`:
   - Read tool specification (kind, schemas, timeouts, auth)
   - Implement logic in `src/core/tools.js`
   - Add required env vars to `.env.example` if not present
2. **Write Prompt Pack**: Based on `agent.summary`, `scope`, and `security`:
   - Write `prompts/system.md` with role, capabilities, boundaries
   - Write `prompts/examples.md` with in-scope and out-of-scope examples
3. **Expand Tests**: For each scenario in `acceptance.scenarios[]`:
   - Write test case in `tests/acceptance.test.js`

### Phase 5: Stage E — Verify

**Actions**:
1. Run verification: `node .../agent-builder.js verify --workdir <WORKDIR>`
2. Review generated evidence in workdir:
   - `stageE/verification-evidence.json`
   - `stageE/verification-report.md`
3. If any scenario fails, investigate and fix.

**Output**: Verification report.

### Phase 6: Stage F — Modular Integration

**Actions**:
1. Run: `node .../agent-builder.js integrate-modular --workdir <WORKDIR> --apply`
2. This will:
   - Verify the target flow/node exists in `.system/modular/flow_graph.yaml`
   - Update `modules/<module_id>/MANIFEST.yaml` with interfaces (health, run) and implements
   - Scaffold an integration scenario (optional)
   - Run ctl scripts to rebuild derived registries

**If flow/node missing**: A `flow-change-request.md` is generated. Update flow_graph.yaml first, then re-run integrate-modular.

**Output**: Confirmation that module MANIFEST is updated and registries are consistent.

### Finish — Cleanup

```bash
node .../agent-builder.js finish --workdir <WORKDIR> --apply
```

---

## Command Quick Reference

| Stage | Command |
|-------|---------|
| Start | `node .ai/skills/scaffold/agent_builder/scripts/agent-builder.js start` |
| Approve A | `node .../agent-builder.js approve --stage A --workdir <WORKDIR>` |
| Validate | `node .../agent-builder.js validate-blueprint --workdir <WORKDIR>` |
| Approve B | `node .../agent-builder.js approve --stage B --workdir <WORKDIR>` |
| Plan | `node .../agent-builder.js plan --workdir <WORKDIR>` |
| Apply | `node .../agent-builder.js apply --workdir <WORKDIR> --apply` |
| Verify | `node .../agent-builder.js verify --workdir <WORKDIR>` |
| Integrate | `node .../agent-builder.js integrate-modular --workdir <WORKDIR> --apply` |
| Finish | `node .../agent-builder.js finish --workdir <WORKDIR> --apply` |

See **LLM Execution Protocol** above for detailed step-by-step instructions.

## Verification

- `node .ai/scripts/lint-skills.cjs --strict`
- Generate a sample agent and run:
  - `agent-builder.js verify`
  - `agent-builder.js integrate-modular --apply`
  - `node .ai/scripts/modulectl.js verify --strict`
  - `node .ai/scripts/flowctl.js lint --strict`
  - `node .ai/scripts/contextctl.js verify --strict`
  - `node .ai/scripts/integrationctl.js validate --strict`

## Boundaries

- The generated agent is **not** a module instance; it must live under an existing module (`modules/<module_id>/...`).
- `agent_builder` does **not** edit `.system/modular/flow_graph.yaml`. If flow nodes are missing, it must emit a flow-change-request and stop modular integration.
- Do **not** commit workdir artifacts (Stage A/B templates). Only the scaffolded repo outputs are committed.
- Do **not** write secrets to the repo. `.env.example` must contain placeholders only.
- Do **not** edit derived registries/indexes by hand (`docs/context/registry.json`, `.system/modular/*_index.yaml`, `modules/integration/compiled/*`). Use the ctl scripts.

## Reference Documents

| Document | Purpose |
|----------|---------|
| `reference/decision_checklist.md` | 16 decision points to capture during interview |
| `reference/agent_builder_handbook.md` | Design principles, decision trees, boundary conditions |
| `reference/stage_d_implementation_guide.md` | Tool, prompt, and test implementation patterns |
| `templates/agent-blueprint.schema.json` | Blueprint JSON Schema (canonical) |
| `templates/stageA/integration-decision.template.md` | Stage A integration decision template |
| `examples/usage.md` | Operator-oriented quick start guide |

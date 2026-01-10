# `agent_builder` Usage Guide

`agent_builder` scaffolds a **module-embedded, repo-integrated agent component** (agent proxy) for a real feature request.

It produces:
- a runnable agent component under an existing module (`modules/<module_id>/src/agents/<agent_id>/`),
- module-local workdocs (`modules/<module_id>/workdocs/active/agent-<agent_id>/`),
- module-local contract artifacts (`modules/<module_id>/interact/agents/<agent_id>/{blueprint.json,openapi.json}`),
- plus a validated, versioned **blueprint** that becomes the single source of truth for subsequent implementation and modular integration.

This guide is written for human operators. An LLM can follow the same steps programmatically.

---

## 1) What `agent_builder` is for

`agent_builder` is for building production-embedded agents, not demos.

| Embedding | Types |
|-----------|-------|
| **Primary** | `api` (HTTP) |
| **Attach** | `worker`, `sdk`, `cron`, `pipeline` |

---

## 2) Deliverables

When a blueprint is applied, `agent_builder` generates:

| Deliverable | Default Path | Contents |
|-------------|--------------|----------|
| Agent component | `modules/<module_id>/src/agents/<agent_id>/` | `src/core/`, `src/adapters/`, `prompts/`, `schemas/`, `config/` |
| Agent workdocs | `modules/<module_id>/workdocs/active/agent-<agent_id>/` | `overview.md`, `integration.md`, `runbook.md`, etc. |
| Interact artifacts (managed) | `modules/<module_id>/interact/agents/<agent_id>/` | `blueprint.json`, `openapi.json` |
| Module context registry (upsert) | `modules/<module_id>/interact/registry.json` | Artifact entries for blueprint/openapi |
| Modular integration (Stage F) | `modules/<module_id>/MANIFEST.yaml` (+ optional `modules/integration/scenarios.yaml`) | Interfaces/implements + optional scenario scaffold |

> Core/Adapters separation is mandatory. See [Adapter Behaviors](adapter-behaviors.md) for runtime details.

---

## 3) Staged Flow (A–F)

| Stage | Purpose | Artifacts | Checkpoint |
|-------|---------|-----------|------------|
| **A** | Interview | `stage-a/interview-notes.md`, `stage-a/integration-decision.md` | User approval required |
| **B** | Blueprint | `stage-b/agent-blueprint.json` | User approval required |
| **C** | Scaffold | Code + docs + contracts in repo | — |
| **D** | Implement | Real domain logic in `src/core/` | — |
| **E** | Verify | Acceptance scenarios + evidence | — |
| **F** | Integrate | Update module MANIFEST + derived rebuilds | — |

**Rule:** During Stage A and Stage B, do not write anything to the repo. Artifacts live in a temporary workdir.

---

## 4) Helper Tool: `scripts/agent-builder.js`

Path: `.ai/skills/workflows/agent/agent_builder/scripts/agent-builder.js`

This script is dependency-free (Node.js only).

### Commands

| Command | Purpose |
|---------|---------|
| `start` | Create a temporary workdir and initial state |
| `status` | Show current run state and next steps |
| `approve` | Mark Stage A/B approvals (required before apply) |
| `validate-blueprint` | Validate blueprint JSON |
| `plan` | Dry-run: show files that would be created |
| `apply` | Apply scaffold into the repo |
| `verify` | Execute acceptance scenarios |
| `verify --skip-http` | Skip HTTP scenarios (for sandbox/CI) |
| `integrate-modular` | Patch module MANIFEST + rebuild derived registries |
| `finish` | Delete the temporary workdir |

> Tip: `--workdir` can be omitted if you export `AGENT_BUILDER_WORKDIR` to point at the current run workdir.

### Quickstart

```bash
# Start a new run
node .ai/skills/workflows/agent/agent_builder/scripts/agent-builder.js start

# Approve Stage A
node .../agent-builder.js approve --workdir <WORKDIR> --stage A

# Validate and approve Stage B
node .../agent-builder.js validate-blueprint --workdir <WORKDIR>
node .../agent-builder.js approve --workdir <WORKDIR> --stage B

# Apply scaffold
node .../agent-builder.js apply --workdir <WORKDIR> --repo-root . --apply

# Verify acceptance scenarios
node .../agent-builder.js verify --workdir <WORKDIR> --repo-root .

# Integrate into modular SSOT (module MANIFEST + derived rebuilds)
node .../agent-builder.js integrate-modular --workdir <WORKDIR> --repo-root . --apply

# Cleanup (--apply required to actually delete)
node .../agent-builder.js finish --workdir <WORKDIR> --apply
```

---

## 5) Operational Invariants

| Invariant | Enforcement |
|-----------|-------------|
| No secrets in repo | Only env var names in `.env.example` |
| Kill switch required | `AGENT_ENABLED` must be in `configuration.env_vars` with `required: true` |
| Core/Adapters separation | Core logic must not import adapter-specific modules |
| Module embedding required | Agent code lives under `modules/<module_id>/...` (not a standalone module) |
| Explicit approvals required | Stage A and Stage B must be approved before `apply --apply` |
| Flow binding required | `.system/modular/flow_graph.yaml` must contain the target `flow_id` + `node_id` before Stage F |

---

## 6) Post-Scaffold: Module System Integration

After Stage C (`apply --apply`), you **MUST** run Stage F to integrate the agent into the modular system:

```bash
node .ai/skills/workflows/agent/agent_builder/scripts/agent-builder.js integrate-modular --workdir <WORKDIR> --repo-root . --apply
```

This will:
- Validate the flow/node exists in `.system/modular/flow_graph.yaml` (it will not edit the flow graph).
- Update `modules/<module_id>/MANIFEST.yaml` with `run`/`health` interfaces and implements binding.
- Optionally scaffold an integration scenario in `modules/integration/scenarios.yaml`.
- Rebuild derived registries/indexes via ctl scripts (`modulectl`, `flowctl`, `contextctl`, `integrationctl`).

**Dry-run support:** omit `--apply` to preview what Stage F would change.

**If flow/node missing:** Stage F emits `flow-change-request.md` under the module’s interact dir and stops.

---

## 7) Deep Dive References

| Topic | Document |
|-------|----------|
| Blueprint schema and enums | [Blueprint Fields](blueprint-fields.md) |
| Adapter runtime behavior | [Adapter Behaviors](adapter-behaviors.md) |
| Conversation/memory strategies | [Conversation Modes](conversation-modes.md) |

---

## 8) Skill Pack Index

| Resource | Path |
|----------|------|
| Skill instructions | `SKILL.md` |
| Decision checklist | `reference/decision_checklist.md` |
| Blueprint schema | `templates/agent-blueprint.schema.json` |
| State schema | `templates/agent-builder-state.schema.json` |
| Scaffold templates | `templates/agent-kit/node/layout/` |
| Prompt pack templates | `templates/prompt-pack/` |

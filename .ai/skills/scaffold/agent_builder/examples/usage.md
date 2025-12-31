# `agent_builder` Usage Guide

`agent_builder` scaffolds a **complete, repo-integrated Agent** for a real feature request.

It produces:
- a runnable agent module (`agents/<agent_id>/`),
- maintainability docs (`agents/<agent_id>/workdocs/`),
- a project registry entry (`agents/registry.json`, includes `agent_module_map` for LLM scope),
- plus a validated, versioned **blueprint** that becomes the single source of truth for subsequent implementation.

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
| Agent module | `agents/<agent_id>/` | `src/core/`, `src/adapters/`, `prompts/`, `schemas/`, `config/` |
| Agent docs | `agents/<agent_id>/workdocs/` | `overview.md`, `integration.md`, `runbook.md`, etc. |
| Registry entry | `agents/registry.json` | Discovery index + `agent_module_map` (agent_id -> module_ids) |

> Core/Adapters separation is mandatory. See [Adapter Behaviors](adapter-behaviors.md) for runtime details.

---

## 3) Staged Flow (A–E)

| Stage | Purpose | Artifacts | Checkpoint |
|-------|---------|-----------|------------|
| **A** | Interview | `stageA/interview-notes.md`, `stageA/integration-decision.md` | User approval required |
| **B** | Blueprint | `stageB/agent-blueprint.json` | User approval required |
| **C** | Scaffold | Code + docs + registry in repo | — |
| **D** | Implement | Real domain logic in `src/core/` | — |
| **E** | Verify | Acceptance scenarios + cleanup | — |

**Rule:** During Stage A, do not write anything to the repo. Artifacts live in a temporary workdir.

---

## 4) Helper Tool: `scripts/agent-builder.js`

Path: `.ai/skills/scaffold/agent_builder/scripts/agent-builder.js`

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
| `finish` | Delete the temporary workdir |

### Quickstart

```bash
# Start a new run
node .ai/skills/scaffold/agent_builder/scripts/agent-builder.js start

# Approve Stage A
node .../agent-builder.js approve --workdir <WORKDIR> --stage A

# Validate and approve Stage B
node .../agent-builder.js validate-blueprint --workdir <WORKDIR>
node .../agent-builder.js approve --workdir <WORKDIR> --stage B

# Apply scaffold
node .../agent-builder.js apply --workdir <WORKDIR> --repo-root . --apply

# Verify acceptance scenarios
node .../agent-builder.js verify --workdir <WORKDIR> --repo-root .

# Cleanup (--apply required to actually delete)
node .../agent-builder.js finish --workdir <WORKDIR> --apply
```

---

## 5) Operational Invariants

| Invariant | Enforcement |
|-----------|-------------|
| No secrets in repo | Only env var names in `.env.example` |
| Kill switch required | `AGENT_ENABLED` must be in `configuration.env_vars` with `required: true` |
| Registry update required | `deliverables.registry_path` must be created/updated with `agent_module_map` |
| Core/Adapters separation | Core logic must not import adapter-specific modules |

---

## 6) Post-Scaffold: Module System Integration

After applying the scaffold, you **MUST** run the following commands to integrate the agent into the modular system:

Before running commands:
- Ensure `agents/registry.json` includes `agent_module_map` for LLM scope.
- Update `modules/<module_id>/MANIFEST.yaml` for each mapped module with the `run`/`health` interfaces and `implements` links if applicable.

```bash
# 1. Rebuild instance registry (registers the new module)
node .ai/scripts/modulectl.js registry-build

# 2. Update flow implementation index (associates interfaces with flow nodes)
node .ai/scripts/flowctl.js update-from-manifests

# 3. Validate flow graph consistency
node .ai/scripts/flowctl.js lint

# 4. Rebuild project context registry
node .ai/scripts/contextctl.js build
```

**Why?**

| Step | Purpose |
|------|---------|
| `modulectl.js registry-build` | Updates `.system/modular/instance_registry.yaml` |
| `flowctl.js update-from-manifests` | Links agent interfaces to business flow nodes |
| `flowctl.js lint` | Ensures flow graph and bindings are consistent |
| `contextctl.js build` | Updates project-level context for AI navigation |

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

# AI Assistant Instructions

This is an **AI-Friendly, Module-First Repository Template**.

The repository is designed for **LLM-optimized, modular development**:
- Modules are first-class (`modules/<module_id>/`)
- Business flows are explicit (SSOT under `.system/modular/`)
- Context is curated and verifiable (module registries → derived project registry)

## First Time?

Read `init/AGENTS.md` for project initialization instructions.

## Key Directories

| Directory | Purpose |
|---|---|
| `modules/` | **Module instances** + cross-module integration workspace |
| `.system/modular/` | **Modular system SSOT** (flow graph, bindings, type graph) + derived registries/graphs |
| `docs/context/` | Context registries (project SSOT + derived aggregated view) |
| `.ai/skills/` | Skill SSOT (workflows + scaffolding) |
| `.ai/scripts/` | Control scripts (module/init/context/flow/integration) |
| `.ai/llm/` | LLM engineering governance entry (see `.ai/llm/AGENTS.md`) |
| `.codex/` | Codex wrapper stubs (generated) |
| `.claude/` | Claude wrapper stubs (generated) |
| `init/` | Project initialization kit (optional to delete after init) |
| `addons/` | Optional *non-core* add-on payloads installed on-demand |

## Core Control Scripts

| Area | Script |
|---|---|
| Project state | `node .ai/scripts/projectctl.js` |
| Module instances | `node .ai/scripts/modulectl.js` |
| Flow SSOT + derived indexes/graphs | `node .ai/scripts/flowctl.js` |
| Integration scenarios | `node .ai/scripts/integrationctl.js` |
| Context registries | `node .ai/scripts/contextctl.js` |
| Skill packs + wrapper sync | `node .ai/scripts/skillsctl.js` |
| DB mirror (optional usage) | `node .ai/scripts/dbctl.js` |
| CI templates (optional usage) | `node .ai/scripts/cictl.js` |

## Optional Add-ons (installable via init pipeline)

These are kept as payloads under `addons/` and can be installed during project initialization:

| Add-on | Purpose | Control Script |
|---|---|---|
| `packaging` | Container/artifact packaging | `packctl.js` |
| `deployment` | Multi-environment deployment | `deployctl.js` |
| `release` | Version and changelog management | `releasectl.js` |
| `observability` | Metrics/logs/traces contracts | `obsctl.js` |

See `init/addon-docs/convention.md` for conventions.

## Common Tasks

### Add or Edit Skills

- Edit `.ai/skills/` only (SSOT).
- Regenerate provider wrappers with:

```bash
node .ai/scripts/sync-skills.cjs
```

### Initialize a Module Instance

```bash
node .ai/scripts/modulectl.js init --module-id <module_id> --apply
node .ai/scripts/modulectl.js registry-build
node .ai/scripts/flowctl.js update-from-manifests
node .ai/scripts/flowctl.js lint
node .ai/scripts/contextctl.js build
```

### Validate Integration Scenarios

```bash
node .ai/scripts/integrationctl.js validate
node .ai/scripts/integrationctl.js compile
node .ai/scripts/integrationctl.js run --execute   # optional; requires runtime endpoints config
```

## Task Protocol (for complex tasks)

For tasks that involve multiple steps, span multiple files, or require decisions:

1. **Check existing workdocs**: Look for active plans at `modules/<module_id>/workdocs/active/`
2. **Create a plan** (if needed): Use skill `create-workdocs-plan`
3. **Execute with tracking**: Keep `01-plan.md`, `03-implementation-notes.md`, `04-verification.md`, and `05-pitfalls.md` current
4. **Handoff**: Use skill `update-workdocs-for-handoff` before context switch

**When to use workdocs:**
- Task spans multiple files (>3)
- Task requires multiple steps (>5)
- Task involves architectural decisions
- Task may be interrupted/handed off
- Task has unclear scope requiring exploration

**Skip workdocs when:**
- Single file fix
- Simple refactor (rename, move)
- Well-defined, quick task (<30 min)

## Rules
- For LLM engineering tasks, open `.ai/llm/AGENTS.md`
- Treat `.system/modular/*` SSOT files as **manual but validated**.
- Treat derived artifacts as **overwritable**.
- Keep module documentation local: `modules/<module_id>/workdocs/`.
- Never edit `.codex/` or `.claude/` directly; they are generated.

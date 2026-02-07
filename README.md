# AI-Friendly Repository Template (Module-first)

This repository is a starter template for building **LLM-first**, **module-oriented** codebases with:

- **Module instances** under `modules/<module_id>/`
- **Business flow SSOT** under `.system/modular/`
- **Context registries** (module + project SSOT → derived project view) under `docs/context/`
- **Single Source of Truth (SSOT) skills** under `.ai/skills/`
- Generated provider wrappers under `.codex/skills/` and `.claude/skills/`
- A **verifiable initialization pipeline** under `init/`

## Quick start

| For | Action |
|-----|--------|
| **AI Assistants** | Read `AGENTS.md` and `init/AGENTS.md` |
| **Humans** | Read `init/README.md` |

## Repository layout (high-level)

```
modules/                      # Module instances + integration workspace
  integration/                # Cross-module scenarios + dev-docs
  <module_id>/                # Module-local SSOT + dev-docs

.system/modular/              # Modular SSOT (flow graph, bindings) + derived graphs/indexes

docs/context/                 # Context registries (SSOT + derived aggregated view)

init/                         # Project bootstrap kit (Stage A/B/C)

.ai/
  skills/                     # SSOT skills (edit here only)
  scripts/                    # Control scripts + sync-skills.mjs

.codex/skills/                # Generated wrappers (DO NOT EDIT)
.claude/skills/               # Generated wrappers (DO NOT EDIT)
```

## Core scripts

- `node .ai/scripts/modules/ctl-module.mjs` — module instances + instance registry build
- `node .ai/scripts/modules/ctl-flow.mjs` — flow SSOT lint + derived indexes/graphs
- `node .ai/scripts/modules/ctl-integration.mjs` — integration scenarios validate/compile/run
- `node .ai/skills/features/context-awareness/scripts/ctl-context.mjs` — context registries + derived view
- `node .ai/scripts/ctl-project-state.mjs` — project state (context mode, stage)
- `node .ai/scripts/ctl-project-governance.mjs` — project governance (progress hub: init/lint/sync/query/map)
- `node .ai/skills/_meta/ctl-skillpacks.mjs` — skill packs + wrapper sync

## Key rules (SSOT + wrappers)

- **MUST** edit skills only in `.ai/skills/`.
- **MUST NOT** edit `.codex/skills/` or `.claude/skills/` directly.
- After changing `.ai/skills/`, regenerate wrappers:

```bash
node .ai/scripts/sync-skills.mjs --scope current --providers both
```

## Optional add-ons

Optional features (packaging, deployment, release, observability, etc.) are documented under:

- `init/_tools/docs/feature-docs/README.md`

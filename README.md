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
  integration/                # Cross-module scenarios + workdocs
  <module_id>/                # Module-local SSOT + workdocs

.system/modular/              # Modular SSOT (flow graph, bindings) + derived graphs/indexes

docs/context/                 # Context registries (SSOT + derived aggregated view)

workdocs/                     # Optional project-level working docs

init/                         # Project bootstrap kit (Stage A/B/C)

.ai/
  skills/                     # SSOT skills (edit here only)
  scripts/                    # Control scripts + sync-skills.cjs

.codex/skills/                # Generated wrappers (DO NOT EDIT)
.claude/skills/               # Generated wrappers (DO NOT EDIT)
```

## Core scripts

- `node .ai/scripts/modulectl.js` — module instances + instance registry build
- `node .ai/scripts/flowctl.js` — flow SSOT lint + derived indexes/graphs
- `node .ai/scripts/integrationctl.js` — integration scenarios validate/compile/run
- `node .ai/scripts/contextctl.js` — context registries + derived view
- `node .ai/scripts/projectctl.js` — project state (context mode, stage)
- `node .ai/scripts/skillsctl.js` — skill packs + wrapper sync

## Key rules (SSOT + wrappers)

- **MUST** edit skills only in `.ai/skills/`.
- **MUST NOT** edit `.codex/skills/` or `.claude/skills/` directly.
- After changing `.ai/skills/`, regenerate wrappers:

```bash
node .ai/scripts/sync-skills.cjs --scope current --providers both
```

## Optional add-ons

Non-core add-ons are available under `addons/` (packaging, deployment, release, observability). See:

- `init/ADDONS_DIRECTORY.md`

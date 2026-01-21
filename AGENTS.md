# AI Assistant Instructions

This is an **AI-Friendly, Module-First Repository Template**.

The repository is designed for **LLM-optimized, modular development**:
- Modules are first-class (`modules/<module_id>/`)
- Business flows are explicit (SSOT under `.system/modular/`)
- Context is curated and verifiable (module registries -> derived project registry)

## First Time?

Read `init/AGENTS.md` for project initialization instructions.

## Key Directories

| Directory | Purpose |
|---|---|
| `modules/` | **Module instances** + cross-module integration workspace |
| `.system/modular/` | **Modular system SSOT** (flow graph, bindings, type graph) + derived registries/graphs |
| `docs/context/` | Context registries (project SSOT + derived aggregated view) |

## Core Control Scripts

| Area | Script |
|---|---|
| Project state | `node .ai/scripts/projectctl.mjs` |
| Module instances | `node .ai/scripts/modulectl.mjs` |
| Flow SSOT + derived indexes/graphs | `node .ai/scripts/flowctl.mjs` |
| Integration scenarios | `node .ai/scripts/integrationctl.mjs` |
| Context registries | `node .ai/skills/features/context-awareness/scripts/contextctl.mjs` |

## Coding Standards (RECOMMEND)

- **ESM (.mjs)**: All scripts in the repository use ES Modules with `.mjs` extension. Use `import`/`export` syntax, not `require()`.

## Coding Workflow (MUST)

- Before modifying code/config for a non-trivial task, apply the Decision Gate in `.ai/skills/module/workdocs/AGENTS.md` and create/update the workdocs task bundle as required.
- If the user asks for planning artifacts (plan/roadmap/milestones) before coding:
  - If the task meets the Decision Gate, use `.ai/skills/workflows/planning/plan-maker` first, then ask for confirmation to proceed with implementation.
  - If the task is trivial (< 30 min), provide an in-chat plan (do NOT create workdocs).
  - If the task needs context preservation (multi-session, handoff) or qualifies as complex, follow `.ai/skills/module/workdocs/AGENTS.md`.

## Rules
- For LLM engineering tasks, open `.ai/llm-config/AGENTS.md`
- Treat `.system/modular/*` SSOT files as **manual but validated**.
- Treat derived artifacts as **overwritable**.
- Keep module documentation local: `modules/<module_id>/workdocs/`.
- Never edit `.codex/` or `.claude/` directly; they are generated.

<!-- DB-SSOT:START -->
## Database SSOT and schema synchronization

The section is **managed by the init pipeline**. After project initialization it will contain:

- The selected DB schema SSOT mode (`none` / `repo-prisma` / `database`)
- The correct routing for DB schema change requests
- The canonical LLM-readable DB schema contract location

If the block is still in its placeholder form, run the init Stage C apply step.
<!-- DB-SSOT:END -->

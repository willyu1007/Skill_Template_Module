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
| Project state (context awareness) | `node .ai/scripts/ctl-project-ctl-project-governance.mjs` |
| Project governance (progress hub) | `node .ai/scripts/ctl-project-state.mjs` |
| Module instances | `node .ai/scripts/modules/modulectl.mjs` |
| Flow SSOT + derived indexes/graphs | `node .ai/scripts/modules/flowctl.mjs` |
| Integration scenarios | `node .ai/scripts/modules/integrationctl.mjs` |
| Context registries | `node .ai/skills/features/context-awareness/scripts/contextctl.mjs` |

## Coding Standards (RECOMMEND)

- **ESM (.mjs)**: All scripts in the repository use ES Modules with `.mjs` extension. Use `import`/`export` syntax, not `require()`.

## Coding Workflow (MUST)

 - Before modifying code/config for a non-trivial task, apply the Decision Gate in `.ai/skills/module/dev-docs/AGENTS.md` and create/update the dev-docs task bundle as required.
- If the user asks for planning artifacts (plan/roadmap/milestones) before coding:
  - If the task meets the Decision Gate, use `.ai/skills/workflows/planning/plan-maker` first, then ask for confirmation to proceed with implementation.
  - If the task is trivial (< 30 min), provide an in-chat plan (do NOT create a dev-docs bundle).
  - If the task needs context preservation (multi-session, handoff) or qualifies as complex, follow `.ai/skills/module/dev-docs/AGENTS.md`.

## Rules
- For LLM engineering tasks, open `.ai/llm-config/AGENTS.md`
- Treat `.system/modular/*` SSOT files as **manual but validated**.
- Treat derived artifacts as **overwritable**.
- Keep module documentation local: `modules/<module_id>/dev-docs/`.
- Never edit `.codex/` or `.claude/` directly; they are generated.

## Workspace Safety (MUST)

- NEVER create/copy/clone this repository into any subdirectory of itself (no nested repo copies).
- Create throwaway test repos **outside** the repo root (OS temp or a sibling directory) and delete them after verification.
- Keep temporary workspaces shallow: if a path is deeply nested or exceeds **12 path segments** total, stop and clean up instead of continuing.

<!-- DB-SSOT:START -->
## Database SSOT and schema synchronization

The section is **managed by the init pipeline**. After project initialization it will contain:

- The selected DB schema SSOT mode (`none` / `repo-prisma` / `database`)
- The correct routing for DB schema change requests
- The canonical LLM-readable DB schema contract location

If the block is still in its placeholder form, run the init Stage C apply step.
<!-- DB-SSOT:END -->

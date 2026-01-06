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
| `.ai/llm-config/` | LLM engineering governance entry (see `.ai/llm-config/AGENTS.md`) |
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

## Task Protocol (workdocs discipline)

**Decision gate (MUST)** — before editing code on non-trivial work:
- Either (A) **resume** an existing task under `modules/<module_id>/workdocs/active/` (or `modules/integration/workdocs/active/`), or
- (B) **create** a new bundle via `create-workdocs-plan`, or
- (C) explicitly state “skip workdocs” + a short reason (only acceptable for small, well-defined fixes).

**Planning vs implementation routing**
- If the user asks for a planroadmap: use `plan-maker` to write `roadmap.md` first (planning-only).
- If the task needs context preservation (multi-session, handoff) or qualifies as complex: follow with `create-workdocs-plan` (00–05) and then start coding while continuously syncing workdocs.

**Execution sync (MUST)**
- Keep these files current during execution: `01-plan.md`, `03-implementation-notes.md`, `04-verification.md`, `05-pitfalls.md`.
- Before context switch/handoff/wrap-up: run `update-workdocs-for-handoff`.

## Rules
- For LLM engineering tasks, open `.ai/llm-config/AGENTS.md`
- Treat `.system/modular/*` SSOT files as **manual but validated**.
- Treat derived artifacts as **overwritable**.
- Keep module documentation local: `modules/<module_id>/workdocs/`.
- Never edit `.codex/` or `.claude/` directly; they are generated.

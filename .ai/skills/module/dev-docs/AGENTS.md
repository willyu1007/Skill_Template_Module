# Dev Docs - AI Guidance

Dev docs is the **task documentation system** for module-first development. It provides structured artifacts for context preservation, handoff, and implementation tracking.

## Decision Gate (MUST)

Use dev docs when **any** of the following is true:
- Expected duration > 2 hours, or likely to span multiple sessions
- Work requires explicit handoff / context recovery
- High-risk or cross-cutting change:
  - DB / schema migration
  - Auth / security changes
  - CI / CD / infrastructure changes
  - Multi-module or API boundary changes
  - Changes to `.system/modular/` SSOT files
- Unclear scope requiring discovery before implementation
- Meaningful architectural / flow decision needed

Skip dev docs when **all** of the following are true:
- Trivial fix (< 30 min, well-defined scope)
- Single-file change (including adjacent tests / docs in same module)
- Simple refactor with clear scope (even if touching multiple files)
- No handoff expected

> Note: Touching multiple folders (e.g., `src/` + `tests/` + docs) is NOT a sufficient trigger by itself.

## Workflow

Before editing code (when dev docs applies):
1. Resume an existing task under `modules/<module_id>/dev-docs/active/` (or `modules/integration/dev-docs/active/`), OR
2. Create a new bundle via `create-dev-docs-plan/SKILL.md`

During execution (MUST):
- Keep dev-docs files current: `01-plan.md`, `03-implementation-notes.md`, `04-verification.md`, `05-pitfalls.md`

Before context switch / handoff / wrap-up:
- Run `update-dev-docs-for-handoff/SKILL.md`

## Available Skills

| Skill | Purpose |
|-------|---------|
| `create-dev-docs-plan/SKILL.md` | Create or resume a dev-docs task bundle (00-05) |
| `update-dev-docs-for-handoff/SKILL.md` | Finalize dev-docs for handoff or wrap-up |

## Coordination with plan-maker

| Artifact | Skill | Focus |
|----------|-------|-------|
| `roadmap.md` | `.ai/skills/workflows/planning/plan-maker` | Macro-level: milestones, phases, impact scope, risks |
| `01-plan.md` | `create-dev-docs-plan` | Implementation-level: specific steps, file changes, status tracking |

Typical workflow:
1. For tasks requiring strategic alignment first -> use `plan-maker` to create `roadmap.md`
2. For implementation tracking -> use `create-dev-docs-plan` to create the bundle (00-05)
3. Both artifacts coexist in the same dev-docs directory


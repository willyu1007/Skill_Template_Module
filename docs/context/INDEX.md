# Project context index

This directory provides a **project-level** view of curated context artifacts.

## Important

- `docs/context/registry.json` is a **DERIVED artifact**.
  - Do not edit it by hand.
  - Regenerate it with: `node .ai/skills/features/context-awareness/scripts/contextctl.mjs build`

## Sources of truth

Project context is aggregated bottom-up from:

1. Project-level registry (SSOT)
   - `docs/context/project.registry.json`
2. Module registries (SSOT)
   - `modules/<module_id>/interact/registry.json`

## What belongs in context registries

- API contracts (OpenAPI)
- Database schema mappings (normalized JSON, ERD exports)
- Business process models (BPMN)
- Interface contracts and integration notes that help LLMs reason correctly

## Rules

- Prefer script-driven updates (contextctl) over manual edits.
- Never store secrets in context artifacts.

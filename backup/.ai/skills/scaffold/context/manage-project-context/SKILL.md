---
name: manage-project-context
description: Maintain module/project context registries and derived docs/context view via contextctl so LLM context stays accurate and verifiable.
---

# Manage Context Registries (Module-first)

## Purpose

Maintain curated, verifiable context artifacts using **script-driven** registry updates.

In this module-first template:

- **SSOT registries**
  - Project registry: `docs/context/project.registry.json`
  - Module registries: `modules/<module_id>/interact/registry.json`
- **Derived registry view**
  - `docs/context/registry.json` (DO NOT edit by hand)

## When to use

Use this skill when you need to:

- add/update an API contract (OpenAPI, JSON Schema, etc.)
- add/update database schema mappings (project-level or module-level)
- add/update BPMN or other process artifacts
- ensure checksums and registry state stay consistent for CI

## Inputs

- The intended change:
  - artifact type (`openapi`, `jsonschema`, `db-schema`, `bpmn`, `markdown`, ...)
  - artifact path (repo-relative)
  - scope:
    - project-level (default)
    - or module-level (`module_id`)

## Outputs

- Updated/created artifact file(s)
- Updated SSOT registry (project or module) with refreshed checksums
- Updated derived `docs/context/registry.json`
- A verification result (pass/fail) from `contextctl verify`

## Procedure

1. Ensure context skeleton exists (idempotent):

```bash
node .ai/scripts/contextctl.js init
```

2. Register a new artifact (SSOT):

Project-level:

```bash
node .ai/scripts/contextctl.js add-artifact   --artifact-id <id>   --type <type>   --path <repo-relative-path>   --mode contract
```

Module-level:

```bash
node .ai/scripts/contextctl.js add-artifact   --module-id <module_id>   --artifact-id <id>   --type <type>   --path <repo-relative-path>   --mode contract
```

3. Edit/update the artifact file.

4. Refresh checksums (SSOT) and rebuild the derived view:

```bash
node .ai/scripts/contextctl.js build
```

5. Verify consistency (CI-ready):

```bash
node .ai/scripts/contextctl.js verify --strict
```

## Boundaries

- You MUST NOT edit `docs/context/registry.json` by hand.
- You SHOULD treat registries as SSOT and use scripts for edits.
- You MUST NOT store secrets in context artifacts or registries.

## References

- `docs/context/INDEX.md`
- `.system/modular/schemas/module_context_registry.schema.json`

## Verification

- Run `node .ai/scripts/contextctl.js verify --strict` and `node .ai/scripts/contextctl.js build`.

---
name: manage-project-state
description: Maintain .ai/project/state.json (stage and non-secret config references) via projectctl for consistent automation gates.
---

# Manage Project State

## Purpose

Provide a script-driven workflow to maintain `.ai/project/state.json` as a small, non-secret SSOT for project stage/config.

## When to use

Use this skill when you need to:

- record the project stage (`prototype`, `mvp`, `production`, ...)
- switch context strategy (`contract` vs `snapshot`)
- keep CI gates consistent with the intended stage

Do NOT use this skill to store secrets (passwords, tokens, private keys).

## Inputs

- Stage value: `prototype | mvp | production | maintenance | archived`
- Context mode: `contract | snapshot`

## Outputs

- Updated `.ai/project/state.json`
- A verification result from `projectctl verify`

## Steps

1. Initialize state (idempotent):
   - `node .ai/scripts/projectctl.js init`

2. Set stage:
   - `node .ai/scripts/projectctl.js set-stage <stage>`

3. Set context mode:
   - `node .ai/scripts/projectctl.js set-context-mode <contract|snapshot>`

4. Verify:
   - `node .ai/scripts/projectctl.js verify`

## Boundaries

- You MUST NOT store secrets in `.ai/project/state.json`.
- You SHOULD store only references (for example env var names).
- You MUST keep `state.json` schema-valid.

## References

- `reference.md`

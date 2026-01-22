---
name: manage-env-module-slices
description: Enforce module-level env ownership/requirements and sync module env slices (env.owns/env.requires in modules/<module_id>/MANIFEST.yaml) against the repo env contract. Use when adding or changing a module's env dependencies, or before/after env contract updates to detect conflicts and refresh module context slices.
---

# Manage Env Module Slices

## Purpose
Enforce **module-level env boundaries** (owns/requires) without modifying the env contract, and generate per-module env slices for LLM context.

This skill **does not** change `env/contract.yaml`. It only validates and syncs module slices.

## Required Inputs
- Module manifests: `modules/<module_id>/MANIFEST.yaml`
- Env contract: `env/contract.yaml`

## Outputs
- `modules/<module_id>/interact/env-slice.json` (default output)
- Updated module registry: `modules/<module_id>/interact/registry.json`

## Procedure

### Phase 0 — Contract readiness (mandatory)
1. Confirm `env/contract.yaml` exists and defines the required variables.
2. If the contract is missing or invalid, STOP and fix the repo env contract first.
3. If new keys are needed, update the contract via the repo-level workflow, then resume.

### Phase 1 — Declare module boundaries
1. In `modules/<module_id>/MANIFEST.yaml`, add or update:

```yaml
env:
  owns:
    - key: SERVICE_API_KEY
  requires:
    - LOG_LEVEL
```

Rules:
- Use exact keys from `env/contract.yaml`.
- Only one module may own a given key.

### Phase 2 — Preflight validation (mandatory)
1. Run strict validation:
   - `node .ai/scripts/modules/env-contractctl-module.mjs verify --strict`
2. Check ownership conflicts:
   - `node .ai/scripts/modules/env-contractctl-module.mjs conflicts`
3. If any errors or conflicts are reported, STOP and resolve:
   - Fix missing or invalid keys.
   - Resolve ownership conflicts (one owner per key).

### Phase 3 — Preview slice (recommended)
1. Export a preview slice for review:
   - `node .ai/scripts/modules/env-contractctl-module.mjs export-slice --module-id <module_id>`
2. Ask for confirmation before writing slices, especially if updating multiple modules.

### Phase 4 — Sync module slices (writes)
1. Generate slices for all modules (requires explicit approval):
   - `node .ai/scripts/modules/env-contractctl-module.mjs sync-slices`
2. Or target a single module:
   - `node .ai/scripts/modules/env-contractctl-module.mjs sync-slices --module-id <module_id>`
3. To avoid registry updates, add `--no-registry`.

## Verification
- [ ] `verify --strict` passes with no errors
- [ ] `conflicts` reports no ownership collisions
- [ ] `modules/<module_id>/interact/env-slice.json` exists and matches declared owns/requires
- [ ] Module registry updated with `env-slice` artifact (unless `--no-registry`)

## Non-negotiable constraints
- MUST NOT modify `env/contract.yaml` in this skill.
- MUST NOT store secrets in repo artifacts.
- MUST NOT treat module slices as SSOT.
- MUST resolve ownership conflicts before syncing slices.
- MUST obtain explicit approval before running `sync-slices` for all modules.

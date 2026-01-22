---
name: manage-observability-module-slices
description: Enforce module-level observability ownership/usage declarations and sync module observability slices (observability.metrics/logs owns/uses/requires in modules/<module_id>/MANIFEST.yaml) against the repo observability contracts. Use when adding or changing a module's observability dependencies, or before/after observability contract updates to detect conflicts and refresh module context slices.
---

# Manage Observability Module Slices

## Purpose
Enforce **module-level observability boundaries** (owns/uses/requires) without modifying observability contracts, and generate per-module observability slices for LLM context.

The manage-observability-module-slices workflow **does not** change `docs/context/observability/*` contracts. It only validates and syncs module slices.

## Required Inputs
- Module manifests: `modules/<module_id>/MANIFEST.yaml`
- Metrics contract: `docs/context/observability/metrics-registry.json`
- Logs contract: `docs/context/observability/logs-schema.json`

## Outputs
- `modules/<module_id>/interact/observability-slice.json` (default output)
- Updated module registry: `modules/<module_id>/interact/registry.json`

## Procedure

### Phase 0 — Contract readiness (mandatory)
1. Confirm observability contracts exist:
   - `docs/context/observability/metrics-registry.json`
   - `docs/context/observability/logs-schema.json`
2. If contracts are missing, STOP and initialize observability first, then resume this skill:
   - `node .ai/skills/features/observability/scripts/obsctl.mjs init`
3. If new metrics or log fields are needed, STOP and update contracts via the repo-level observability workflow (then resume):
   - Switch to the `obsctl` workflow under `.ai/skills/features/observability/`
   - After contracts are updated, return and continue with Phase 1.

### Phase 1 — Declare module boundaries
1. In `modules/<module_id>/MANIFEST.yaml`, add or update:

```yaml
observability:
  metrics:
    owns:
      - http_requests_total
      - name: billing_request_duration_seconds
    uses:
      - auth_login_total
  logs:
    owns:
      - billing_account_id
    requires:
      - trace_id
      - service
```

Rules:
- **metrics.owns**: Metrics the target module is responsible for emitting (must exist in metrics-registry.json)
- **metrics.uses**: Metrics the target module depends on (emitted by other modules)
- **logs.owns**: Custom log fields the target module defines (must exist in logs-schema.json)
- **logs.requires**: Log fields the target module depends on (e.g., `trace_id`, `service`)
- Use exact names from the contracts.
- Only one module may own a given metric or log field.

### Phase 2 — Preflight validation (mandatory)
1. Run validation:
   - `node .ai/scripts/modules/obsctl-module.mjs verify`
   - Optional: `node .ai/scripts/modules/obsctl-module.mjs verify --strict`
2. Check ownership conflicts:
   - `node .ai/scripts/modules/obsctl-module.mjs conflicts`
3. If any errors or conflicts are reported, STOP and resolve:
   - Fix missing or invalid metric/log-field references.
   - Resolve ownership conflicts (one owner per metric/field).

### Phase 3 — Preview slice (recommended)
1. Export a preview slice for review:
   - `node .ai/scripts/modules/obsctl-module.mjs export-slice --module-id <module_id>`
2. Ask for confirmation before writing slices, especially if updating multiple modules.


**Checkpoint**: request explicit approval before writing slices.

```
[APPROVAL REQUIRED]
I am ready to generate and write module slices.

- Command: sync-slices
- Scope: all modules (or a single module if --module-id is used)

Type "approve slices" to proceed.
```

### Phase 4 — Sync module slices (writes)
1. Generate slices for all modules (requires explicit approval):
   - `node .ai/scripts/modules/obsctl-module.mjs sync-slices`
2. Or target a single module:
   - `node .ai/scripts/modules/obsctl-module.mjs sync-slices --module-id <module_id>`
3. To avoid registry updates, add `--no-registry`.

### Phase 5 — Aggregate context (recommended)
1. After syncing slices, rebuild the derived context registry:
   - `node .ai/skills/features/context-awareness/scripts/contextctl.mjs build`
   - `node .ai/skills/features/context-awareness/scripts/contextctl.mjs verify --strict`

## Verification
- [ ] `verify` passes with no errors
- [ ] `conflicts` reports no ownership collisions
- [ ] `modules/<module_id>/interact/observability-slice.json` exists and matches declared owns/uses/requires
- [ ] Module registry updated with `observability-slice` artifact (unless `--no-registry`)
- [ ] `contextctl build` completed successfully (if applicable)

## Boundaries
- MUST NOT modify observability contracts (`docs/context/observability/*`) in the manage-observability-module-slices workflow.
- MUST NOT treat module slices as SSOT.
- MUST resolve ownership conflicts before syncing slices.
- MUST obtain explicit approval before running `sync-slices` for all modules.

## Related skills
- `manage-db-module-slices` — DB slice management (same pattern)
- `manage-env-module-slices` — Env slice management (same pattern)

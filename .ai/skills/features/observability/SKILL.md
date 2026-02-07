---
name: observability
description: Enable and operate the Observability feature (metrics/logs/traces contracts) so telemetry expectations are explicit and LLM-readable.
---

# Observability Feature

## Intent

Make observability contracts explicit and reviewable:

- Metrics registry
- Logs schema
- Tracing conventions

The Observability feature integrates with Context Awareness by placing contracts under `docs/context/observability/`.

## What gets enabled

When enabled, the feature materializes:

- `docs/context/observability/**`
- `observability/**` (configuration and runbooks)

Controller script (provided by the template SSOT):

- `node .ai/skills/features/observability/scripts/ctl-obs.mjs` — manage and verify observability contracts

## Dependency

- **Context Awareness** is mandatory in this template (do not disable it).
  - Observability requires a context root (`docs/context/**`).

## How to enable

### In an existing repo

1. Ensure Context Awareness is already enabled (`docs/context/` exists).
2. Copy templates from:
   - `.ai/skills/features/observability/templates/`
   into the repo root.
3. Initialize:

```bash
node .ai/skills/features/observability/scripts/ctl-obs.mjs init
node .ai/skills/features/observability/scripts/ctl-obs.mjs verify
```

## Verification

```bash
node .ai/skills/features/observability/scripts/ctl-obs.mjs verify
```

## Module-first integration (recommended)

If your repo uses `modules/` with `modules/<module_id>/MANIFEST.yaml` observability declarations, keep per-module slices in sync after contract changes:

```bash
node .ai/scripts/modules/ctl-obs-module.mjs verify --strict
node .ai/scripts/modules/ctl-obs-module.mjs conflicts
node .ai/scripts/modules/ctl-obs-module.mjs sync-slices
```

## Boundaries

- No secrets in repo.
- Treat `docs/context/observability/**` as a contract surface: changes should be deliberate and reviewed.

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

- `node .ai/skills/features/observability/scripts/obsctl.mjs` — manage and verify observability contracts

## Dependency

- **Context Awareness** SHOULD be enabled.
  - Init enforces the dependency (observability requires a context root).

## How to enable

### During init (recommended)

In `init/project-blueprint.json`:

- Set `features.observability = true`
- Also set `features.contextAwareness = true`

Then run:

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs apply --providers both
```

### In an existing repo

1. Ensure Context Awareness is already enabled (`docs/context/` exists).
2. Copy templates from:
   - `.ai/skills/features/observability/templates/`
   into the repo root.
3. Initialize:

```bash
node .ai/skills/features/observability/scripts/obsctl.mjs init
node .ai/skills/features/observability/scripts/obsctl.mjs verify
```

## Verification

```bash
node .ai/skills/features/observability/scripts/obsctl.mjs verify
```

## Boundaries

- No secrets in repo.
- Treat `docs/context/observability/**` as a contract surface: changes should be deliberate and reviewed.

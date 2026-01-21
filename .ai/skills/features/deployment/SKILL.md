---
name: deployment
description: Enable and operate the Deployment feature (ops/deploy conventions + deploy scripts) for multi-environment delivery.
---

# Deployment Feature

## Intent

Standardize how the repo describes and executes deployments across environments (dev/staging/prod) in an LLM-friendly, auditable way.

The repo keeps deployment artifacts under `ops/deploy/` and exposes a small set of controller scripts under `.ai/`.

## What gets enabled

When enabled, this feature materializes:

- `ops/deploy/**`
  - `ops/deploy/environments/*.yaml`
  - `ops/deploy/k8s/manifests/deployment.template.yaml`
  - `ops/deploy/scripts/healthcheck.mjs`
  - `ops/deploy/workdocs/**` (runbooks, rollback procedure)

Controller scripts (provided by the template SSOT):

- `node .ai/skills/features/deployment/scripts/deployctl.mjs` — deployment configuration management
- `node .ai/skills/features/deployment/scripts/rollback.mjs` — rollback entry point (human-run)

## How to enable

### During init (recommended)

In `init/project-blueprint.json`:

- Set `features.deployment = true`

Then run:

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs apply --providers both
```

### In an existing repo

1. Copy templates from:
   - `.ai/skills/features/deployment/templates/`
   into the repo root.
2. Initialize:

```bash
node .ai/skills/features/deployment/scripts/deployctl.mjs init
node .ai/skills/features/deployment/scripts/deployctl.mjs verify
```

## Operating rules

- Deployment and rollback are **human-executed** operations.
- Record plans and run results under `ops/deploy/workdocs/`.
- Never store secrets in repo; use environment secret managers.

## Verification

```bash
node .ai/skills/features/deployment/scripts/deployctl.mjs verify
```

## Boundaries

- Deployment/rollback are human-executed; do not run live deploy commands as the AI agent.
- Do not store secrets in repo; keep only non-secret configs/templates under `ops/deploy/**`.
- Keep changes within the declared blast radius (`ops/deploy/**` and related controller scripts).

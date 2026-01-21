---
name: packaging
description: Enable and operate the Packaging feature (ops/packaging conventions + packctl) for building runnable artifacts (usually container images).
---

# Packaging Feature

## Intent

Standardize how the repo defines build artifacts (services, jobs, apps) and how humans build them in a repeatable way.

## What gets enabled

When enabled, this feature materializes:

- `ops/packaging/**`
  - `ops/packaging/templates/Dockerfile.*`
  - `ops/packaging/scripts/docker-build.mjs`
  - `ops/packaging/workdocs/**`
- `docs/packaging/registry.json` (packaging targets registry)

Controller scripts (provided by the template SSOT):

- `node .ai/skills/features/packaging/scripts/packctl.mjs` — packaging target registry management

## How to enable

### During init (recommended)

In `init/project-blueprint.json`:

- Set `features.packaging = true`

Then run:

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs apply --providers both
```

### In an existing repo

1. Copy templates from:
   - `.ai/skills/features/packaging/templates/`
   into the repo root.
2. Initialize:

```bash
node .ai/skills/features/packaging/scripts/packctl.mjs init
node .ai/skills/features/packaging/scripts/packctl.mjs verify
```

## Operating rules

- Builds are **human-executed** (CI can be added later).
- Treat image naming/versioning/provenance as first-class.
- Record packaging plans and build logs in `ops/packaging/workdocs/`.

## Verification

```bash
node .ai/skills/features/packaging/scripts/packctl.mjs verify
```

## Boundaries

- Builds are human-executed; do not run Docker commands as the AI agent.
- Do not store credentials/tokens in `docs/packaging/registry.json` or under `ops/packaging/`.
- Keep packaging definitions within the declared blast radius (`ops/packaging/**`, `docs/packaging/**`).

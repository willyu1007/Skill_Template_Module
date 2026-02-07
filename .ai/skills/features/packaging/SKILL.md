---
name: packaging
description: Enable and operate the Packaging feature (ops/packaging conventions + ctl-pack) for building runnable artifacts (usually container images).
---

# Packaging Feature

## Intent

Standardize how the repo defines build artifacts (services, jobs, apps) and how humans build them in a repeatable way.

## What gets enabled

When enabled, this feature materializes:

- `ops/packaging/**`
  - `ops/packaging/templates/Dockerfile.*`
  - `ops/packaging/scripts/docker-build.mjs`
  - `ops/packaging/handbook/**`
- `docs/packaging/registry.json` (packaging targets registry)

Controller scripts (provided by the template SSOT):

- `node .ai/skills/features/packaging/scripts/ctl-pack.mjs` — packaging target registry management

## How to enable

### In an existing repo

1. Copy templates from:
   - `.ai/skills/features/packaging/templates/`
   into the repo root.
2. Initialize:

```bash
node .ai/skills/features/packaging/scripts/ctl-pack.mjs init
node .ai/skills/features/packaging/scripts/ctl-pack.mjs verify
```

## Operating rules

- Builds are **human-executed** (CI can be added later).
- Treat image naming/versioning/provenance as first-class.
- Record packaging plans and build logs in `ops/packaging/handbook/`.

## Module-first integration (recommended)

In module-first repos, packaging targets often map 1:1 to modules/services. Prefer aligning target ids with module ids and pointing `--module` at `modules/<module_id>/`:

```bash
node .ai/skills/features/packaging/scripts/ctl-pack.mjs add-service --id billing.api --module modules/billing.api --repo-root .
node .ai/skills/features/packaging/scripts/ctl-pack.mjs list --repo-root .
```

## Verification

```bash
node .ai/skills/features/packaging/scripts/ctl-pack.mjs verify
```

## Boundaries

- Builds are human-executed; do not run Docker commands as the AI agent.
- Do not store credentials/tokens in `docs/packaging/registry.json` or under `ops/packaging/`.
- Keep packaging definitions within the declared blast radius (`ops/packaging/**`, `docs/packaging/**`).

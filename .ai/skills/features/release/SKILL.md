---
name: release
description: Enable and operate the Release feature (release checklists + changelog conventions + ctl-release) for consistent versioning.
---

# Release Feature

## Intent

Standardize how the project versions, changelogs, and release execution are tracked.

## What gets enabled

When enabled, this feature materializes:

- `release/**` (checklists, config, templates)
- `release/.releaserc.json.template` (seed for semantic-release or similar tools)
- `release/CHANGELOG.md` (changelog maintained in-module)

Controller script (provided by the template SSOT):

- `node .ai/skills/features/release/scripts/ctl-release.mjs` — manage release configuration and checklists

## How to enable

### In an existing repo

1. Copy templates from:
   - `.ai/skills/features/release/templates/`
   into the repo root.
2. Initialize:

```bash
node .ai/skills/features/release/scripts/ctl-release.mjs init
node .ai/skills/features/release/scripts/ctl-release.mjs verify
```

## Operating rules

- Releases are **human-executed** unless CI automation is explicitly configured.
- Keep release decisions and checklists under `release/handbook/`.

## Module-first note

In module-first repos (or monorepos), decide explicitly whether versioning is repo-wide or per-module. This template feature assumes a **repo-wide** release by default; if you need per-module versioning, document the policy and adjust tooling accordingly.

## Verification

```bash
node .ai/skills/features/release/scripts/ctl-release.mjs verify
```

## Boundaries

- Release actions (tagging/publishing) are human-executed unless CI is explicitly configured.
- Do not store credentials/tokens in repo; keep release metadata/config non-secret.
- Keep changes within the declared blast radius (`release/**`).

---
name: release
description: Enable and operate the Release feature (release checklists + changelog conventions + releasectl) for consistent versioning.
---

# Release Feature

## Intent

Standardize how the project versions, changelogs, and release execution are tracked.

## What gets enabled

When enabled, this feature materializes:

- `release/**` (checklists, config, templates)
- `.releaserc.json.template` (seed for semantic-release or similar tools)

Controller script (provided by the template SSOT):

- `node .ai/skills/features/release/scripts/releasectl.mjs` — manage release configuration and checklists

## How to enable

### During init (recommended)

In `init/project-blueprint.json`:

- Set `features.release = true`

Then run:

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs apply --providers both
```

### In an existing repo

1. Copy templates from:
   - `.ai/skills/features/release/templates/`
   into the repo root.
2. Initialize:

```bash
node .ai/skills/features/release/scripts/releasectl.mjs init
node .ai/skills/features/release/scripts/releasectl.mjs verify
```

## Operating rules

- Releases are **human-executed** unless CI automation is explicitly configured.
- Keep release decisions and checklists under `release/workdocs/`.

## Verification

```bash
node .ai/skills/features/release/scripts/releasectl.mjs verify
```

## Boundaries

- Release actions (tagging/publishing) are human-executed unless CI is explicitly configured.
- Do not store credentials/tokens in repo; keep release metadata/config non-secret.
- Keep changes within the declared blast radius (`release/**`, `.releaserc.json.template`).

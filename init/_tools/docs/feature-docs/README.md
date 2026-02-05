# Feature Documentation

This directory contains human-facing docs for optional **features** that can be materialized during init **Stage C** (`apply`).

Feature assets are integrated under `.ai/`:

- Templates: usually `.ai/skills/features/<feature-id>/templates/` (some features source templates from nested skills; for database: `.ai/skills/features/database/sync-code-schema-from-db/templates/`)
- Control scripts:
  - Repo-level Node controllers: `.ai/scripts/*ctl.mjs` (and other repo controllers like `sync-skills.mjs`)
  - Feature-local tools: `.ai/skills/features/**/scripts/*` (Node `.mjs` and/or Python `.py`)
- Feature flags/state: `.ai/project/state.json` (via `.ai/scripts/projectctl.mjs`)

## Available features

| Feature ID | Blueprint control | Control script | Documentation |
|------------|------------------|----------------|---------------|
| `context-awareness` | **mandatory** (cannot be disabled) | `.ai/skills/features/context-awareness/scripts/contextctl.mjs` | [context-awareness.md](context-awareness.md) |
| `database` | `db.ssot` (`none` disables) | `.ai/skills/features/database/sync-code-schema-from-db/scripts/dbctl.mjs` (when `db.ssot=database`) | [database.md](database.md) |
| `ui` | `features.ui` (default: `true`) | `.ai/skills/features/ui/ui-system-bootstrap/scripts/ui_specctl.py` | [ui.md](ui.md) |
| `environment` | `features.environment` (default: `true`) | `.ai/skills/features/environment/env-contractctl/scripts/env_contractctl.py` | [environment.md](environment.md) |
| `packaging` | `features.packaging` (default: `true`) | `.ai/skills/features/packaging/scripts/packctl.mjs` | [packaging.md](packaging.md) |
| `deployment` | `features.deployment` (default: `true`) | `.ai/skills/features/deployment/scripts/deployctl.mjs` | [deployment.md](deployment.md) |
| `release` | `features.release` (default: `true`) | `.ai/skills/features/release/scripts/releasectl.mjs` | [release.md](release.md) |
| `ci` | `ci.provider` (`none` disables; default: `github`) | `.ai/skills/features/ci/scripts/cictl.mjs` | [ci.md](ci.md) |
| `iac` | `iac.tool` (`none` disables; default: `none`) | `.ai/skills/features/iac/scripts/iacctl.mjs` | [iac.md](iac.md) |
| `observability` | `features.observability` (default: `true`) | `.ai/skills/features/observability/scripts/obsctl.mjs` | [observability.md](observability.md) |

## How to decide (Stage B)

- Context awareness is mandatory and always installed in Stage C.
- Database is enabled/disabled by `db.ssot`:
  - `db.ssot=none` disables DB materialization.
- CI is enabled/disabled by `ci.provider`:
  - `ci.provider=none` disables CI materialization.
- IaC is enabled/disabled by `iac.tool`:
  - `iac.tool=none` (or omitted) disables IaC materialization.
- Other features are enabled by default; set `features.<id>: false` to skip materialization.
- Use the pipeline to preview effective enabled features:

```bash
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs suggest-features --repo-root .
```

Common dependency checks (enforced by `validate`):

- Observability contracts require context awareness (mandatory in this template).

## Enabling features

In `init/_work/project-blueprint.json` (legacy: `init/project-blueprint.json`):

```json
{
  "db": { "enabled": true, "ssot": "database", "kind": "postgres", "environments": ["dev", "staging", "prod"] },
  "ci": { "provider": "github" },
  "features": {
    "contextAwareness": true,
    "ui": true,
    "environment": true,
    "packaging": true,
    "deployment": true,
    "release": true,
    "observability": true
  }
}
```

Then run Stage C apply:

```bash
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs apply --repo-root . --providers both
```

## Materialization semantics (Stage C)

By default, Stage C is **non-destructive**:

- Templates are copied into the repo using **copy-if-missing** (existing files are kept).
- Each enabled feature runs its control scripts (Node and/or Python, depending on the feature).
- Disabling a feature later does NOT uninstall previously created files (manual removal only).

Useful flags:

- `--force-features`: overwrite existing files when copying templates
- `--verify-features`: run the feature verify step after init (when available)
- `--blocking-features`: fail-fast on feature errors (default is non-blocking)
- `--non-blocking-features`: (legacy) continue despite feature errors

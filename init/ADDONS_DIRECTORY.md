# /addons directory convention

This repository supports an **optional add-on mechanism** that allows *non-core* capabilities to be installed on-demand (without hard-coupling them into the base template).

## Important: Core capabilities are built-in

In the **module-first** template, these capabilities are part of the repo by default:

- Context registries (`contextctl.js`, `docs/context/*`, `modules/*/interact/registry.json`)
- Modular system controls (`modulectl.js`, `flowctl.js`, `integrationctl.js`, `.system/modular/*`)
- DB mirror tools (`dbctl.js`, `db/`)
- CI template tools (`cictl.js`, `ci/`, `.gitlab-ci/`)

They do **not** live under `addons/` anymore.

---

## Available Add-ons (non-core)

| Add-on ID | Purpose | Control Script |
|-----------|---------|----------------|
| `packaging` | Container/artifact packaging | `packctl.js` |
| `deployment` | Multi-environment deployment | `deployctl.js` |
| `release` | Version and changelog management | `releasectl.js` |
| `observability` | Metrics/logs/traces contracts | `obsctl.js` |

See individual `ADDON_*.md` files for detailed documentation.

---

## Expected structure

By default, the init pipeline expects:

```
<repoRoot>/
  addons/
    <addonId>/
      ADDON.md        # Add-on documentation
      VERSION         # Semantic version
      payload/        # Files to be merged into repoRoot (copy-if-missing)
        .ai/scripts/  # Control scripts
        docs/         # Documentation
        ...
```

You can override the add-ons root directory via:

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs apply --addons-root <path> ...
```

---

## Enabling Add-ons

Add-ons are enabled via the `project-blueprint.json`:

```json
{
  "addons": {
    "packaging": true,
    "deployment": true,
    "release": true,
    "observability": true
  }
}
```

Or via capability-specific configuration:

```json
{
  "packaging": { "enabled": true },
  "deploy": { "enabled": true },
  "release": { "enabled": true },
  "observability": { "enabled": true }
}
```

---

## Copy semantics (non-destructive)

When an add-on is enabled, Stage C `apply` will:

- copy files from `payload/` into `<repoRoot>/`
- **only when the destination file does not exist** (copy-if-missing)
- it will not overwrite existing files

This design is intentional for robustness:
- you can safely re-run `apply` without clobbering local modifications
- add-ons can be shipped as capability payloads without making upgrades destructive by default

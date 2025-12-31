# Init Add-on Documentation

This directory contains documentation for both **core capabilities** (built-in) and **optional add-ons** (installable from `addons/`).

---

## Core Capabilities (built-in)

These capabilities are **included by default** in the module-first template. No add-on installation is required.

| Document | Capability | Control Script |
|----------|------------|----------------|
| [ci-templates.md](ci-templates.md) | CI templates/tooling | `cictl.js` |
| [context-awareness.md](context-awareness.md) | Context registry system | `contextctl.js`, `projectctl.js` |
| [db-mirror.md](db-mirror.md) | DB mirror tooling | `dbctl.js` |

---

## Optional Add-ons (non-core)

These capabilities are **optional** and can be installed from `addons/` during Stage C `apply`.

| Document | Add-on ID | Control Script | Source |
|----------|-----------|----------------|--------|
| [deployment.md](deployment.md) | `deployment` | `deployctl.js` | `addons/deployment/` |
| [observability.md](observability.md) | `observability` | `obsctl.js` | `addons/observability/` |
| [packaging.md](packaging.md) | `packaging` | `packctl.js` | `addons/packaging/` |
| [release.md](release.md) | `release` | `releasectl.js` | `addons/release/` |

### Enabling Add-ons

Add-ons are enabled via `project-blueprint.json`:

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

See [convention.md](convention.md) for directory structure and copy semantics.


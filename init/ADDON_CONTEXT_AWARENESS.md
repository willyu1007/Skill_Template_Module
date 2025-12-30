# Context System (Core)

This repository includes the context registry system as a **built-in capability** (no add-on installation required).

## What you get

- Project-level context registry (SSOT): `docs/context/project.registry.json`
- Module-level context registries (SSOT): `modules/<module_id>/interact/registry.json`
- Aggregated registry view (derived): `docs/context/registry.json`
- Control scripts:
  - `node .ai/scripts/contextctl.js`
  - `node .ai/scripts/projectctl.js`

## Quick start

```bash
node .ai/scripts/projectctl.js init
node .ai/scripts/contextctl.js init
node .ai/scripts/contextctl.js build
node .ai/scripts/contextctl.js verify --strict
```

## Notes

- `docs/context/registry.json` is derived; do not edit it by hand.
- Add-ons under `addons/` are reserved for non-core capabilities (packaging/deployment/release/observability).

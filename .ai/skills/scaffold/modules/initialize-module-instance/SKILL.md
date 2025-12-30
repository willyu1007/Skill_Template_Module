---
name: initialize-module-instance
description: Create a new module instance with modulectl and register it into the modular SSOT/derived registries.
---

# Initialize a Module Instance

## Purpose

Create a new module under `modules/<module_id>/` and ensure it is correctly registered into:

- `.system/modular/instance_registry.yaml` (derived)
- `.system/modular/flow_impl_index.yaml` (derived)
- `docs/context/registry.json` (derived)

## Inputs

- `module_id` (required; recommended pattern: `^[a-z0-9][a-z0-9._-]{1,62}[a-z0-9]$`)
- `module_type` (optional; default: `service`)
- `description` (optional)

## Outputs

- Module skeleton:
  - `modules/<module_id>/MANIFEST.yaml` (SSOT)
  - `modules/<module_id>/interact/registry.json` (SSOT)
  - `modules/<module_id>/workdocs/` (module-local workdocs)
- Updated derived registries and graphs

## Procedure

1. Initialize the module skeleton:

```bash
node .ai/scripts/modulectl.js init --module-id <module_id> --module-type <module_type> --description "<desc>" --apply
```

2. Verify manifests and module-local SSOT:

```bash
node .ai/scripts/modulectl.js verify --strict
```

3. Rebuild derived registries/graphs:

```bash
node .ai/scripts/modulectl.js registry-build
node .ai/scripts/flowctl.js update-from-manifests
node .ai/scripts/flowctl.js lint
node .ai/scripts/contextctl.js build
```

4. (Optional) Add flow nodes and implementations

- Add/edit `.system/modular/flow_graph.yaml` to include new flow nodes.
- Add `implements` entries under `modules/<module_id>/MANIFEST.yaml` interfaces.
- Re-run step 3.

## Notes

- Treat MANIFEST.yaml and module context registry as SSOT.
- Treat instance_registry and flow_impl_index as derived artifacts (overwritable).

## Examples

See `examples/example.api/` for a complete module skeleton including:

- `MANIFEST.yaml` - Module metadata with interfaces and flow participation
- `AGENTS.md` - AI operating instructions
- `ABILITY.md` - Responsibility boundaries
- `interact/registry.json` - Context artifacts registry
- `interact/openapi.yaml` - OpenAPI specification
- `workdocs/` - Module work documentation

Copy and customize for your new module.

## Verification

- Run `node .ai/scripts/modulectl.js verify` and `node .ai/scripts/contextctl.js build`.

## Boundaries

- Do **not** edit derived artifacts directly; use the ctl scripts to regenerate them.
- Do **not** introduce alternative SSOT files or duplicate registries (single source of truth is enforced).
- Keep changes scoped: prefer module-local updates (MANIFEST, interact registry) over project-wide edits when possible.

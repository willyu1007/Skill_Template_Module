# Manage Context Registries — Reference

## Design goals

- **Module-first**: module registries are SSOT (`modules/<module_id>/interact/registry.json`).
- **Project view**: `docs/context/registry.json` is derived for convenient navigation.
- **Verifiable updates**: artifact checksums enable CI to detect edits that bypass scripts.
- **Tool-agnostic artifacts**: OpenAPI, BPMN 2.0, normalized DB schema mapping, etc.

## SSOT vs Derived

### SSOT (editable, but prefer scripts)

- `docs/context/project.registry.json`
- `modules/<module_id>/interact/registry.json`

### Derived (do not edit)

- `docs/context/registry.json`

Regenerate derived output with:

- `node .ai/scripts/contextctl.js build`

## Contract vs Generated artifacts

### Contract mode (recommended default)

- The artifact file itself is the authoritative contract.
- After editing the artifact, run:
  - `node .ai/scripts/contextctl.js build`
  - `node .ai/scripts/contextctl.js verify --strict`

### Generated mode

- The artifact file is generated from code/tools.
- Register with `mode=generated` and keep the generator command documented in module workdocs.
- After regeneration, run:
  - `node .ai/scripts/contextctl.js build`
  - `node .ai/scripts/contextctl.js verify --strict`

## Recommended CI gates

Minimum:

- `node .ai/scripts/contextctl.js verify --strict`
- `node .ai/scripts/projectctl.js verify`
- `node .ai/scripts/flowctl.js lint`

## Common artifact types

- `openapi`: API surface contract
- `db-schema`: normalized DB structure mapping
- `bpmn`: BPMN 2.0 process file
- `jsonschema`: message contract schema
- `markdown`: design notes intended for long-term reference

## Troubleshooting

- **Checksum mismatch**: you edited an artifact but did not run `contextctl build` (or `touch`).
- **Missing file**: registry references a path that does not exist; create the file or remove the registry entry via script.

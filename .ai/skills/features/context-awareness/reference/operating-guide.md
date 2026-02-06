# Context Awareness - Operating Guide (Reference)

## Design goals

- **Stable entry point**: `docs/context/INDEX.md` and `docs/context/registry.json` are the supported context entry points.
- **Verifiable updates**: artifact checksums enable CI to detect edits that bypass the scripts.
- **Tool-agnostic artifacts**: OpenAPI, BPMN 2.0, and a normalized DB schema mapping.

## Contract mode vs Generated mode

### Contract mode (recommended default)

- The artifact file is the authoritative contract.
- Human collaborators and LLMs edit the file directly.
- After edits, run:
  - `node .ai/skills/features/context-awareness/scripts/contextctl.mjs touch`
  - `node .ai/skills/features/context-awareness/scripts/contextctl.mjs verify --strict`

### Generated mode (opt-in)

- The artifact file is generated from external tools (e.g., OpenAPI generators, schema extractors).
- Register the artifact with `mode=generated` and optionally document the source command in `source.command` for reference.
- **contextctl does NOT execute generators automatically**. Run your generator manually, then:
  - `node .ai/skills/features/context-awareness/scripts/contextctl.mjs touch`
  - `node .ai/skills/features/context-awareness/scripts/contextctl.mjs verify --strict`
- The `source.command` field is metadata for humans/LLMs to know how to regenerate; it is not executed by contextctl.

## Recommended CI gates

Minimum:

- `node .ai/skills/features/context-awareness/scripts/contextctl.mjs verify --strict`
- `node .ai/scripts/ctl-project-ctl-project-governance.mjs verify`

Optional (if you use generated mode):

- Run your generator tool (project-specific, not managed by contextctl)
- `node .ai/skills/features/context-awareness/scripts/contextctl.mjs touch`
- `node .ai/skills/features/context-awareness/scripts/contextctl.mjs verify --strict`

## Common artifact types

- `openapi`: API surface contract (`docs/context/api/openapi.yaml`)
- `db-schema`: normalized DB structure mapping (`docs/context/db/schema.json`)
- `bpmn`: BPMN 2.0 process file (`docs/context/process/*.bpmn`)

## Troubleshooting

- **Checksum mismatch**: you edited an artifact but did not run `contextctl touch`.
- **Missing file**: registry references a path that does not exist; create the file or remove the registry entry via script.

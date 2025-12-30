# DB Mirror (Core)

This repository includes DB mirror tooling as a **built-in capability** (no add-on installation required).

## What you get

- `db/` workspace for schema snapshots and notes
- Control script: `node .ai/scripts/dbctl.js`

## Typical workflow

```bash
node .ai/scripts/dbctl.js init
node .ai/scripts/dbctl.js add-table --name users --columns "id:uuid:pk,email:string:unique"
node .ai/scripts/dbctl.js list-tables
node .ai/scripts/dbctl.js generate-migration --name add-user-roles
node .ai/scripts/dbctl.js verify
node .ai/scripts/dbctl.js sync-to-context
node .ai/scripts/contextctl.js build
node .ai/scripts/contextctl.js verify --strict
```

`sync-to-context` writes to:

- `docs/context/db/schema.json` (generated artifact)
- and registers/refreshes the corresponding entry in `docs/context/project.registry.json`

## Notes

- DB mirror is optional to use, but it ships with the base template.

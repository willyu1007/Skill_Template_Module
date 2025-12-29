# DB Mirror (Core)

Historically, the template shipped a `db-mirror` add-on.

In the **module-first** version of the template, DB mirror is a **core capability** and is already present in the repository.

## What you get

- `db/` workspace for schema snapshots and notes
- Control script: `node .ai/scripts/dbctl.js`

## Typical workflow

```bash
node .ai/scripts/dbctl.js init
node .ai/scripts/dbctl.js pull
node .ai/scripts/dbctl.js snapshot
node .ai/scripts/dbctl.js sync-to-context
node .ai/scripts/contextctl.js build
node .ai/scripts/contextctl.js verify --strict
```

`sync-to-context` writes to:

- `docs/context/db/schema.json` (generated artifact)
- and registers/refreshes the corresponding entry in `docs/context/project.registry.json`

## Notes

- DB mirror is optional to use, but it is part of the base template.

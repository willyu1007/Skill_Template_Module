# Feature: database

## Conclusions (read first)

- DB behavior is controlled by `db.ssot` (SSOT selection), not by `features.database` (deprecated/ignored).
- Default SSOT mode is `repo-prisma`.
- Provides a human interface tool (query + change drafting): `node .ai/skills/features/database/db-human-interface/scripts/dbdocctl.mjs`
- If `db.ssot=database`: materializes a repo-local DB mirror under `db/` and initializes DB tooling
- If `db.ssot=repo-prisma`: keeps `prisma/` as the schema SSOT convention anchor (no `db/` mirror)
- If `db.ssot=none`: skips DB materialization (no `db/`, no `prisma/`, no `docs/project/db-ssot.json`, no `docs/context/db/schema.json`)

## How to configure (Stage B)

In `init/project-blueprint.json`, set `db.ssot`:

### Mode: repo-prisma (schema SSOT = `prisma/schema.prisma`)

```json
{
  "db": { "enabled": true, "ssot": "repo-prisma", "kind": "postgres", "environments": ["dev", "staging", "prod"] }
}
```

### Mode: database (schema SSOT = running database)

```json
{
  "db": { "enabled": true, "ssot": "database", "kind": "postgres", "environments": ["dev", "staging", "prod"] }
}
```

### Mode: none (no managed DB SSOT)

```json
{
  "db": { "enabled": false, "ssot": "none", "kind": "other", "environments": [] }
}
```

## What Stage C `apply` does

Stage C applies DB behavior based on `db.ssot`:

1) If `db.ssot=database`:

- Copies templates from:
  - `.ai/skills/features/database/sync-code-schema-from-db/templates/`
- Runs:

```bash
node .ai/skills/features/database/sync-code-schema-from-db/scripts/dbctl.mjs init --repo-root .
```

- Optional verification (when Stage C is run with `--verify-features`):

```bash
node .ai/skills/features/database/sync-code-schema-from-db/scripts/dbctl.mjs verify --repo-root .
```

2) If `db.ssot=repo-prisma`:

- Ensures the `prisma/` directory exists (convention anchor; non-destructive)

3) If `db.ssot=none`:

- Skips DB outputs (no `db/`, no `prisma/`, no `docs/project/db-ssot.json`, no `docs/context/db/schema.json`)

## Key outputs

- `docs/project/db-ssot.json` (only when `db.ssot != none`)
- `docs/context/db/schema.json` (only when `db.ssot != none`)
- `node .ai/skills/features/database/db-human-interface/scripts/dbdocctl.mjs` (human interface)
- `db/**` (only when `db.ssot=database`)
- `prisma/**` (only when `db.ssot=repo-prisma`)

## Common commands

```bash
# Inspect SSOT mode + input sources
node .ai/skills/features/database/db-human-interface/scripts/dbdocctl.mjs status

# Query tables/columns/enums and write a human doc
node .ai/skills/features/database/db-human-interface/scripts/dbdocctl.mjs query users

# Draft a change request (writes a modify doc with a dbops block)
node .ai/skills/features/database/db-human-interface/scripts/dbdocctl.mjs modify users

# Generate a plan (+ runbook when db.ssot=database)
node .ai/skills/features/database/db-human-interface/scripts/dbdocctl.mjs plan users
```

---
name: db-workdocs
purpose: Database schema design and migration planning documentation.
---

# Database Workdocs

## Scope

Schema design decisions, migration planning, data model proposals.

## Structure

| Directory | Content |
|-----------|---------|
| `active/<task-slug>/` | Current DB tasks |
| `archive/` | Completed tasks |

## Related SSOT

- Schema: `db/schema/tables.json`
- Migrations: `db/migrations/`
- Environments: `db/config/db-environments.json`

## Workflow

1. Document schema change rationale in workdocs
2. Generate migration via `dbctl.js`
3. Request human approval for non-dev environments

## Skills

- Create: `create-workdocs-plan`
- Handoff: `update-workdocs-for-handoff`


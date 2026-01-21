# Database Mirror Feature

## Purpose

This feature provides a **repo-local mirror** of the database schema so an LLM can reason about the DB without direct access.

## SSOT rule

- The **real database** is SSOT.
- The repo stores snapshots and derived artifacts.

## Key artifact

- `db/schema/tables.json` - current-state mirror snapshot in `normalized-db-schema-v2` format.

## Practical workflow

1. Human runs `prisma db pull` against the target environment.
2. Import the Prisma schema into the mirror:
   - `node .ai/skills/features/database/sync-code-schema-from-db/scripts/dbctl.mjs import-prisma`
3. Sync into LLM context:
   - `node .ai/scripts/dbssotctl.mjs sync-to-context`

## AI/LLM guidelines

- Do NOT hand-edit `db/schema/tables.json`.
- Draft desired changes as workdocs under `db/workdocs/`.
- Humans execute DDL and migrations.

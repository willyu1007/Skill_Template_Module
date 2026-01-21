---
name: sync-db-schema-from-code
description: Sync database schema from project code to a remote DB (PostgreSQL/MySQL/SQLite) using Prisma (default migrate) or SQLAlchemy/Alembic; includes diff preview and approval gates.
---

# Sync DB Schema from Code

## Purpose
Treat the project codebase as the schema Single Source of Truth (SSOT) and safely apply schema changes to a target database (remote or local) with:
- connection preflight
- schema drift/diff preview
- an explicit approval gate before any write
- execution logging and post-verification

## When to use
Use sync-db-schema-from-code when the user asks to:
- apply schema changes from the project to a remote database
- deploy database migrations to a managed database (cloud or self-hosted)
- sync Prisma or ORM model changes to an actual database
- verify and resolve schema drift before releasing

Avoid sync-db-schema-from-code when:
- the user wants to pull/introspect schema from the database back into code (reverse direction)
- the task is primarily data migration/backfill (separate workflow)

## Inputs
- Target database type: PostgreSQL, MySQL/MariaDB, or SQLite
- Target database connection info (prefer `DATABASE_URL`)
- Target environment: dev/staging/prod (must be explicit)
- Module id (`<module_id>`): the module that owns the database schema (for workdocs scope)
- SSOT type in the repo:
  - Prisma (`prisma/schema.prisma`), or
  - SQLAlchemy models with Alembic (if present)
- Execution strategy:
  - **Default**: Prisma migrate (versioned migrations)
  - Optional (explicitly chosen): Prisma db push
- Schema filter mode (optional, PostgreSQL only):
  - **default**: include all schemas the ORM manages
  - **explicit**: user-specified list of schemas/tables to include
  - **exclude-extensions**: auto-detect and exclude extension-owned objects (recommended when extensions like PostGIS, pg_trgm, uuid-ossp are installed)

## Outputs
Create an auditable task log under `modules/<module_id>/workdocs/active/<task>/db/`:
- `00-connection-check.md` (no secrets; includes extension list if PostgreSQL)
- `01-schema-drift-report.md`
- `02-migration-plan.md`
- `02-extension-exclusion.md` (optional, if extensions detected and exclusion configured)
- `03-execution-log.md`
- `04-post-verify.md`

Optionally, store machine-readable snapshots under `modules/<module_id>/workdocs/active/<task>/db/artifacts/`.

## Steps

### Phase 0 — Confirm intent and scope
1. Confirm the user wants **code → target DB** synchronization (not reverse).
2. Confirm the target environment (dev/staging/prod) and the target DB type.
3. Confirm the `<module_id>` for workdocs scope (the module that owns the database schema).
4. Propose a `<task>` slug for `modules/<module_id>/workdocs/active/<task>/` and confirm it.

### Phase A — Read-only preflight (no DB writes)
4. Detect the SSOT approach:
   - Prisma: `prisma/schema.prisma` exists
   - Alembic: `alembic.ini` / `alembic/` exists
   - If both exist, ask which is the SSOT for the project.

5. Guide connection setup (lightweight):
   - Prefer `DATABASE_URL` in the environment (or `.env` loaded by the runtime)
   - Never ask the user to paste secrets into chat logs
   - Record a **redacted** connection summary in `00-connection-check.md`

6. Validate connectivity using the included script:
   - `python3 ./scripts/db_connect_check.py --url "$DATABASE_URL" --out "modules/<module_id>/workdocs/active/<task>/db/00-connection-check.md"`

7. Capture a schema snapshot (for SQLite; for other DBs if drivers are available):
   - `python3 ./scripts/db_schema_snapshot.py --url "$DATABASE_URL" --out "modules/<module_id>/workdocs/active/<task>/db/artifacts/schema_snapshot.json"`

8. Produce a **diff preview** (no writes):
   - Prisma (default migrate):
     - Prefer generating a reviewable migration (`--create-only`) for local/dev.
     - For remote/prod deploy: review pending `prisma/migrations/*/migration.sql`.
     - Optionally generate a SQL preview with `prisma migrate diff`.
   - Prisma (explicit push):
     - There is no native `db push --dry-run`; use `prisma migrate diff` as the preview.
     - For high-risk changes, recommend testing on a cloned/staging DB first.
   - Alembic:
     - Generate a revision with `--autogenerate` and review the script before applying.

9. Write `01-schema-drift-report.md` and `02-migration-plan.md`:
   - summarize intended schema changes
   - flag destructive operations (drop column/table, type changes)
   - define verification and rollback strategy
   - choose strategy: **migrate (default)** vs push (explicit)

### Phase A.5 — Extension detection (PostgreSQL only, optional)

> Skip this phase if the target DB is not PostgreSQL or if no extensions are installed.

10. Detect installed extensions:
    - Run: `SELECT extname, extversion FROM pg_extension WHERE extname != 'plpgsql';`
    - Record results in `00-connection-check.md`

11. If extensions are detected, ask user:
    - "Extensions detected: [list]. Should we exclude extension-owned objects from diff?"
    - Common extensions that create objects in public schema: PostGIS, pg_trgm, uuid-ossp, hstore, pgcrypto

12. If user chooses to exclude extensions:
    - **Prisma**: Configure `schemas` array in `schema.prisma` to explicitly list user schemas, or use a shadow database that mirrors extension setup
    - **Alembic**: Configure `include_object` callback in `env.py` to filter extension-owned tables/types
    - Document exclusion rules in `02-extension-exclusion.md`

13. If sync fails due to extension conflicts:
    - Identify the conflicting objects (tables, types, functions)
    - Separate user tables from extension-owned objects
    - Recommend: use a dedicated schema for user tables (e.g., `app` schema) instead of `public`
    - Update migration plan to handle schema separation

### Approval checkpoint (mandatory)
10. Ask for explicit user approval before any DB writes, confirming:
   - target environment and target DB
   - backup/snapshot readiness (or acceptance of risk)
   - chosen strategy (migrate default vs push explicit)
   - whether destructive changes are allowed

### Phase B — Apply (DB writes allowed only after approval)
11. Execute the chosen strategy and log every command in `03-execution-log.md`.

12. Post-verify and record evidence in `04-post-verify.md`:
   - rerun schema snapshot / Prisma status checks
   - confirm application compatibility (build/tests as applicable)
   - confirm no unintended destructive impact

13. SSOT maintenance:
   - If using Prisma migrate: ensure the migration files and `schema.prisma` are committed together.
   - If using push: record why, and define how/when the project will move back to versioned migrations.

## Verification
- [ ] Intent is confirmed as **code → target DB**
- [ ] Target environment and DB type are explicit
- [ ] Connectivity check completed and saved without secrets
- [ ] (PostgreSQL) Extensions detected and exclusion strategy confirmed if needed
- [ ] Diff preview produced and reviewed before applying changes
- [ ] Strategy is explicit (default migrate; push only if explicitly chosen)
- [ ] Approval gate was respected before any DB writes
- [ ] Execution log and post-verification evidence are saved under `modules/<module_id>/workdocs/active/<task>/db/`

## Boundaries
- MUST NOT run reverse sync (DB → code) as the primary workflow
- MUST NOT execute DB writes (migrations, push, DDL) without explicit user approval
- MUST default to **versioned migrations** (Prisma migrate) unless the user explicitly chooses push
- MUST NOT run `prisma migrate dev` against production databases
- MUST NOT apply destructive changes without an explicit backup/snapshot plan (or explicit risk acceptance)
- MUST NOT log or store credentials; always redact connection strings
- SHOULD prefer reviewing migration SQL in code review for remote/prod changes
- SHOULD detect and handle extension-owned objects when sync fails on PostgreSQL
- SHOULD recommend schema separation (user tables in dedicated schema) when extension conflicts are persistent

## Included assets
- Templates: `./templates/` for connection, drift, plan, execution log, and verification docs
- Reference: `./reference/` for lightweight connection and strategy guidance
- Scripts: `./scripts/` for connection checks and schema snapshots
- Tests: `./tests/` contains a SQLite smoke test harness for the scripts

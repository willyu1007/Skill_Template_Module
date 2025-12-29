# Database Mirror - AI Guidance

## Conclusions (read first)

- `db/` contains the **schema mirror** for this project's database(s).
- Real databases are the **single source of truth**; this directory holds structured descriptions.
- AI MUST use `dbctl.js` and `migrate.js` scripts for all database operations.
- Never attempt direct database connections or arbitrary SQL execution.

## Directory Structure

- `db/schema/tables.json` - Table structure definitions
- `db/migrations/` - Migration files
- `db/config/db-environments.json` - Environment configuration
- `db/samples/` - Sample/seed data
- `db/workdocs/` - Design decisions and planning

## AI Workflow

1. **Read** `db/schema/tables.json` to understand current schema
2. **Propose** changes by editing schema files
3. **Generate** migrations: `node .ai/scripts/dbctl.js generate-migration --name <name>`
4. **Document** intentions in `db/workdocs/`
5. **Request human** to apply migrations to non-dev environments

## Environment Permissions

Check `db/config/db-environments.json` for what operations are allowed:

- `dev`: Full access (migrations, seed data, queries)
- `staging`: Migrations require review
- `prod`: Migrations require formal change request

## Forbidden Actions

- Direct database connections
- Running arbitrary SQL
- Modifying production without change request
- Storing credentials in code


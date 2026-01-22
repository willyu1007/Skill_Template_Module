---
name: manage-db-module-slices
description: Enforce module-level DB ownership/usage declarations and sync module DB slices (db.owns/db.uses in modules/<module_id>/MANIFEST.yaml) against the repo DB contract. Use when adding or changing a module's DB dependencies, or before/after DB SSOT changes to detect conflicts and refresh module context slices.
---

# Manage DB Module Slices

## Purpose
Enforce **module-level DB boundaries** (owns/uses) without modifying DB SSOT, and generate per-module DB slices for LLM context.

This skill **does not** change the database or schema SSOT. It only validates and syncs module slices.

## Required Inputs
- Module manifests: `modules/<module_id>/MANIFEST.yaml`
- DB contract: `docs/context/db/schema.json`

## Outputs
- `modules/<module_id>/interact/db-slice.json` (default output)
- Updated module registry: `modules/<module_id>/interact/registry.json`

## Procedure

### Phase 0 — Contract readiness (mandatory)
1. Confirm `docs/context/db/schema.json` exists and reflects the latest DB SSOT.
2. If DB SSOT changed, refresh the contract first:
   - `node .ai/scripts/dbssotctl.mjs sync-to-context --repo-root .`
3. If the contract is missing or refresh fails, STOP and resolve DB SSOT issues first.

### Phase 1 — Declare module boundaries
1. In `modules/<module_id>/MANIFEST.yaml`, add or update:

```yaml
db:
  owns:
    - table: users
      columns: [id, email]
  uses:
    - table: orders
      columns: "*"
```

Rules:
- Use schema-qualified names if ambiguous (e.g., `public.users`).
- Use `columns: "*"` or omit `columns` to mean full table.

### Phase 2 — Preflight validation (mandatory)
1. Run strict validation:
   - `node .ai/scripts/modules/dbssotctl-module.mjs verify --strict`
2. Check ownership conflicts:
   - `node .ai/scripts/modules/dbssotctl-module.mjs conflicts`
3. If any errors or conflicts are reported, STOP and resolve:
   - Fix invalid table/column references.
   - Resolve ownership conflicts (one owner per table).

### Phase 3 — Preview slice (recommended)
1. Export a preview slice for review:
   - `node .ai/scripts/modules/dbssotctl-module.mjs export-slice --module-id <module_id>`
2. Ask for confirmation before writing slices, especially if updating multiple modules.

### Phase 4 — Sync module slices (writes)
1. Generate slices for all modules (requires explicit approval):
   - `node .ai/scripts/modules/dbssotctl-module.mjs sync-slices`
2. Or target a single module:
   - `node .ai/scripts/modules/dbssotctl-module.mjs sync-slices --module-id <module_id>`
3. To avoid registry updates, add `--no-registry`.

## Verification
- [ ] `verify --strict` passes with no errors
- [ ] `conflicts` reports no ownership collisions
- [ ] `modules/<module_id>/interact/db-slice.json` exists and matches declared owns/uses
- [ ] Module registry updated with `db-slice` artifact (unless `--no-registry`)

## Non-negotiable constraints
- MUST NOT modify DB SSOT or run migrations in this skill.
- MUST NOT treat module slices as SSOT.
- MUST resolve ownership conflicts before syncing slices.
- MUST obtain explicit approval before running `sync-slices` for all modules.

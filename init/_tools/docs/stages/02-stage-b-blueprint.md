# Stage B: Blueprint

> **SSOT**: `init/_tools/skills/initialize-project-from-requirements/SKILL.md`

## Goal

Produce and validate a project blueprint at `init/_work/project-blueprint.json`.

## Quick reference

| Task | Command |
|------|---------|
| Validate | `npm run init:validate` |
| Suggest packs | `node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs suggest-packs --repo-root .` |
| Suggest features | `node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs suggest-features --repo-root .` |
| Review packs | `node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs review-packs --repo-root .` |
| Approve | `npm run init:approve-b` |

## Key blueprint fields

| Field | Purpose |
|-------|---------|
| `repo.language` | Primary language (typescript, go, python, etc.) |
| `repo.packageManager` | Package manager (pnpm, npm, go, poetry, etc.) |
| `repo.layout` | `single` or `monorepo` |
| `db.ssot` | `none`, `repo-prisma`, or `database` |
| `ci.provider` | `none`, `github`, or `gitlab` |
| `features.*` | Override default-on features (set `false` to disable) |

## Reference templates

- `templates/project-blueprint.example.json` - Full example
- `templates/project-blueprint.min.example.json` - Minimal example
- `templates/project-blueprint.schema.json` - JSON schema

## Checkpoint

After user explicitly approves the blueprint, advance to Stage C.

See SKILL.md for complete workflow, feature semantics, and command options.

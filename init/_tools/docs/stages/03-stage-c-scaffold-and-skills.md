# Stage C: Scaffold + Skills

> **SSOT**: `init/_tools/skills/initialize-project-from-requirements/SKILL.md`

## Goal

Apply the blueprint: create scaffold, generate configs, enable skill packs, sync wrappers, materialize features.

## Quick reference

| Task | Command |
|------|---------|
| Apply all | `npm run init:apply` |
| Review skill retention | `npm run init:review-retention` |
| Update AGENTS.md | `npm run init:update-agents` |
| Approve | `npm run init:approve-c` |
| Cleanup + archive | `npm run init:cleanup` |

## What `apply` does

1. Validates blueprint
2. Creates directory scaffold (write-if-missing)
3. Generates config files (via `scaffold-configs.mjs`)
4. Materializes enabled features
5. Enables skill packs
6. Syncs provider wrappers

## Required before approval

1. **Skill retention review** - Fill `init/_work/skill-retention-table.template.md`, confirm any deletions
2. **AGENTS.md update** - Run `update-agents --apply` or explicitly skip with `--skip-agents-update`

## Checkpoint

After user explicitly approves Stage C results, init is complete.

## Post-init

Archive init kit to `docs/project/overview/` (recommended):

```bash
npm run init:cleanup
# or with options: cleanup-init --repo-root . --apply --i-understand --archive
```

See SKILL.md for complete workflow, feature details, and troubleshooting.

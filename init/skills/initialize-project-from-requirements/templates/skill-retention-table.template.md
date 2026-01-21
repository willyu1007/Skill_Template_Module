# Skill Retention Table (Template)

Use this template after Stage C to summarize available skills. This file should live at `init/skill-retention-table.template.md`.

Translate the Description column to the user's preferred language if needed.

If a retention decision is not ready, note "TBD" in the Description column.

## Workflows

| Skill | Description |
|-------|-------------|
| <skill-name> | <short description> |

## Standards

| Skill | Description |
|-------|-------------|
| <skill-name> | <short description> |

Notes:
- If multiple skills share the same name, confirm the full path before deleting.
- After the user confirms deletions, run `node .ai/scripts/sync-skills.mjs --dry-run --delete-skills "<csv>"`, then re-run with `--yes`.

## Deletion List (after confirmation)

- <skill-name>

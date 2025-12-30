# Manage Skill Packs — Reference

## Files and roles

- `.ai/skills/_meta/packs/*.json`
  - Pack definitions (same schema as `sync-manifest.json`)
- `.ai/skills/_meta/skillsctl-state.json`
  - `base`: baseline selection
  - `enabledPacks`: enabled pack ids
- `.ai/skills/_meta/sync-manifest.json`
  - Effective selection computed as: `base ∪ enabled packs`

## Why a state file exists

Without state, disabling a pack is ambiguous (you cannot know which prefixes/skills were added by which pack).
`skillsctl` persists a base selection so enable/disable is deterministic and auditable.

## Verification

- Print the effective selection:
  - `node .ai/scripts/skillsctl.js status`
- Re-generate wrappers:
  - `node .ai/scripts/skillsctl.js sync --providers both`


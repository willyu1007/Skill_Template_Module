# Release Add-on

## Conclusions (read first)

- Provides version and changelog management
- Supports semantic, calendar, and manual versioning
- AI proposes releases; humans approve and execute

## How to enable

In `project-blueprint.json`:

```json
{
  "addons": {
    "release": true
  },
  "release": {
    "enabled": true,
    "strategy": "semantic",
    "changelog": true
  }
}
```

Then run:

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs apply --blueprint docs/project/project-blueprint.json
```

## What gets installed

- `release/` - Release management root
  - `release/config.json` - Release configuration
  - `release/changelog-template.md` - Changelog template
  - `release/workdocs/` - Release planning
- `.releaserc.json.template` - semantic-release template
- `.ai/scripts/releasectl.js` - Release management

## Commands

```bash
# Check status
node .ai/scripts/releasectl.js status

# Prepare release
node .ai/scripts/releasectl.js prepare --version 1.2.0

# Generate changelog
node .ai/scripts/releasectl.js changelog

# Create tag
node .ai/scripts/releasectl.js tag --version 1.2.0
```

## See also

- `addons/release/ADDON.md` - Full documentation


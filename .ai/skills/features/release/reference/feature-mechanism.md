# Release Feature (Optional)

## Conclusions (read first)

- This feature provides **version and changelog management** infrastructure.
- Supports semantic versioning and automated changelog generation.
- AI proposes releases; humans approve and execute.

## What this feature writes (blast radius)

New files/directories (created if missing):

- `release/` (release management root)
  - `release/AGENTS.md` (LLM guidance)
- `release/config.json` (release configuration)
- `release/changelog-template.md` (changelog template)
- `release/workdocs/` (release planning)
- `.ai/skills/features/release/scripts/releasectl.mjs` (release management)
- `.releaserc.json.template` (semantic-release config template)
- `.ai/skills/features/release/` (feature documentation)

## Install

### Option A: Via init pipeline (recommended)

Enable in your blueprint:

```json
{
  "features": {
    "release": true
  },
  "release": {
    "enabled": true,
    "strategy": "semantic",
    "changelog": true
  }
}
```

Then run Stage C apply:

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs apply --blueprint init/project-blueprint.json
```

### Option B: Manual install

1. Copy templates into the repository root:
   - `.ai/skills/features/release/templates/`
2. Initialize release scaffolding:

```bash
node .ai/skills/features/release/scripts/releasectl.mjs init --strategy semantic
```

## Usage

### Initialize Release

```bash
# Initialize with semantic versioning
node .ai/skills/features/release/scripts/releasectl.mjs init --strategy semantic

# Initialize with manual versioning
node .ai/skills/features/release/scripts/releasectl.mjs init --strategy manual
```

### Prepare Release

```bash
# Prepare a new release
node .ai/skills/features/release/scripts/releasectl.mjs prepare --version 1.2.0

# Generate changelog
node .ai/skills/features/release/scripts/releasectl.mjs changelog --from v1.0.0 --to HEAD
```

### Tag Release

```bash
# Create release tag
node .ai/skills/features/release/scripts/releasectl.mjs tag --version 1.2.0

# Show release status
node .ai/skills/features/release/scripts/releasectl.mjs status
```

## Versioning Strategies

| Strategy | Description |
|----------|-------------|
| `semantic` | Semantic versioning (major.minor.patch) |
| `calendar` | Calendar versioning (YYYY.MM.DD) |
| `manual` | Manual version management |

## Verification

```bash
# Check release status
node .ai/skills/features/release/scripts/releasectl.mjs status

# Verify configuration
node .ai/skills/features/release/scripts/releasectl.mjs verify
```

## Rollback / Uninstall

Delete these paths:

- `release/`
- `.ai/skills/features/release/scripts/releasectl.mjs`
- `.releaserc.json` (if generated)
- `.ai/skills/features/release/`

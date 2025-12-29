# Release Add-on (Optional)

## Conclusions (read first)

- This add-on provides **version and changelog management** infrastructure.
- Supports semantic versioning and automated changelog generation.
- AI proposes releases; humans approve and execute.

## What this add-on writes (blast radius)

New files/directories (created if missing):

- `release/` (release management root)
  - `release/AGENTS.md` (LLM guidance)
  - `release/config.json` (release configuration)
  - `release/changelog-template.md` (changelog template)
  - `release/workdocs/` (release planning)
- `.ai/scripts/releasectl.js` (release management)
- `.releaserc.json.template` (semantic-release config template)
- `docs/addons/release/` (add-on documentation)

## Install

### Option A: Via init-pipeline (recommended)

Enable in your `project-blueprint.json`:

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

### Option B: Install manually

1. Copy payload contents into the repository root.
2. Initialize release management:
   ```bash
   node .ai/scripts/releasectl.js init --strategy semantic
   ```

## Usage

### Initialize Release

```bash
# Initialize with semantic versioning
node .ai/scripts/releasectl.js init --strategy semantic

# Initialize with manual versioning
node .ai/scripts/releasectl.js init --strategy manual
```

### Prepare Release

```bash
# Prepare a new release
node .ai/scripts/releasectl.js prepare --version 1.2.0

# Generate changelog
node .ai/scripts/releasectl.js changelog --from v1.0.0 --to HEAD
```

### Tag Release

```bash
# Create release tag
node .ai/scripts/releasectl.js tag --version 1.2.0

# Show release status
node .ai/scripts/releasectl.js status
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
node .ai/scripts/releasectl.js status

# Verify configuration
node .ai/scripts/releasectl.js verify
```

## Rollback / Uninstall

Delete these paths:

- `release/`
- `.ai/scripts/releasectl.js`
- `.releaserc.json` (if generated)
- `docs/addons/release/`


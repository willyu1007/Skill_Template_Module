# Add-on Convention

This document defines the standard structure and behavior for all add-ons in this template.

## Directory Structure

Every add-on MUST follow this structure:

```
addons/<addon-id>/
├── ADDON.md           # Add-on description and usage (required)
├── VERSION            # Semantic version string (required)
└── payload/           # Files to copy into project (required)
    ├── .ai/
    │   └── scripts/   # Management scripts (*ctl.js)
    ├── docs/          # Documentation and contracts
    └── ...            # Other files as needed
```

## Required Files

### ADDON.md

The `ADDON.md` file MUST contain:

1. **Conclusions section** - Quick summary for LLM consumption
2. **What this add-on writes** - Blast radius / affected paths
3. **Install instructions** - How to enable and initialize
4. **Verification commands** - How to check correct installation
5. **Rollback / Uninstall** - How to remove if needed

### VERSION

A single line containing the semantic version, e.g.:

```
1.0.0
```

### payload/

The `payload/` directory contains all files that will be copied into the target project. The copy follows **copy-if-missing** semantics:

- Files are copied only if they don't already exist at the destination
- Existing files are never overwritten
- This makes add-on installation safe to re-run (idempotent)

## Naming Conventions

### Add-on ID

- Use lowercase with hyphens: `context-awareness`, `db-mirror`, `ci-templates`
- Keep it short but descriptive

### Control Scripts

- Name: `<shortname>ctl.js` (e.g., `contextctl.js`, `dbctl.js`, `cictl.js`)
- Location: `payload/.ai/scripts/`
- Must support `init` command with `--repo-root` parameter

### Blueprint Toggle

In `project-blueprint.json`, add-ons are enabled via the `addons` object:

```json
{
  "addons": {
    "contextAwareness": true,
    "dbMirror": true,
    "ciTemplates": true
  }
}
```

Use camelCase for the key, matching the add-on ID without hyphens.

## Control Script Requirements

Every add-on's control script (`*ctl.js`) MUST:

1. **Support `init` command** - Initialize the add-on (idempotent)
2. **Support `--repo-root` parameter** - Allow specifying the repository root
3. **Be dependency-free** - Use only Node.js built-in modules
4. **Provide `help` command** - Show available commands and usage

Example command structure:

```bash
node .ai/scripts/<name>ctl.js init --repo-root .
node .ai/scripts/<name>ctl.js verify
node .ai/scripts/<name>ctl.js help
```

## Integration with init-pipeline.cjs

The init pipeline detects and installs add-ons based on blueprint configuration:

1. **Detection** - Check `blueprint.addons.<addonName>` or related config
2. **Payload copy** - Copy `payload/` contents to repo root (copy-if-missing)
3. **Initialization** - Run `*ctl.js init` if the script exists

## Add-on Categories

### Core Add-ons

| Add-on | ID | Purpose |
|--------|-----|---------|
| Context Awareness | `context-awareness` | API/DB/BPMN contracts for LLM |
| DB Mirror | `db-mirror` | Database schema mirroring |
| CI Templates | `ci-templates` | CI/CD configuration templates |

### DevOps Add-ons

| Add-on | ID | Purpose |
|--------|-----|---------|
| Packaging | `packaging` | Container/artifact packaging |
| Deployment | `deployment` | Multi-environment deployment |
| Release | `release` | Version and changelog management |
| Observability | `observability` | Metrics/logs/traces contracts |

## Best Practices

1. **Keep payloads minimal** - Only include what's necessary
2. **Use templates** - For files that need customization (`.template` suffix)
3. **Document everything** - LLM needs clear guidance in AGENTS.md files
4. **Provide workdocs/** - For AI to record plans and decisions
5. **Include verification** - Scripts should validate their own state
6. **Respect boundaries** - Don't modify files outside declared blast radius


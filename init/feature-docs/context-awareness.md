# Feature: context awareness

## Conclusions (read first)

- Provides stable API/DB/BPMN contracts under `docs/context/` for LLM + human collaboration
- Makes project context auditable (registries/checksums + verification)
- Recommended for most repos with an API and/or a database

## How to enable

In `init/project-blueprint.json`:

```json
{
  "features": {
    "contextAwareness": true
  }
}
```

Optional configuration (does **not** enable the feature by itself):

```json
{
  "context": {
    "mode": "contract",
    "environments": ["dev", "staging", "prod"]
  }
}
```

Supported modes:
- `contract` (authoritative files)
- `snapshot` (generated snapshots)

## What Stage C `apply` does

When enabled, Stage C:

1) Copies templates from:
- `.ai/skills/features/context-awareness/templates/`

2) Initializes project state (best-effort):

```bash
node .ai/scripts/projectctl.mjs init --repo-root .
node .ai/scripts/projectctl.mjs set features.contextAwareness true --repo-root .
node .ai/scripts/projectctl.mjs set context.enabled true --repo-root .
node .ai/scripts/projectctl.mjs set-context-mode <contract|snapshot> --repo-root .
```

3) Initializes context artifacts (idempotent):

```bash
node .ai/skills/features/context-awareness/scripts/contextctl.mjs init --repo-root .
```

4) Optional verification (when Stage C is run with `--verify-features`):

```bash
node .ai/skills/features/context-awareness/scripts/contextctl.mjs verify --repo-root .
```

## Key outputs

- `docs/context/**` (registries + contracts)
- `config/environments/**` (environment contract scaffolding, if present in templates)

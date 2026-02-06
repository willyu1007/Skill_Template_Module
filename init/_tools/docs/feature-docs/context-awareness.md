# Feature: context awareness

## Conclusions (read first)

- Provides stable API/DB/BPMN contracts under `docs/context/` for LLM + human collaboration
- Makes project context auditable (registries/checksums + verification)
- **Mandatory in this template** (installed by default during Stage C)

## How to configure (Stage B)

Context awareness is always enabled in Stage C. You MAY keep `features.contextAwareness: true` in the blueprint (or omit it), but you MUST NOT set it to `false`.

Configuration (mode/env list):

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

Stage C always:

1) Copies templates from:
- `.ai/skills/features/context-awareness/templates/`

2) Initializes project state (best-effort):

```bash
node .ai/scripts/ctl-project-ctl-project-governance.mjs init --repo-root .
node .ai/scripts/ctl-project-ctl-project-governance.mjs set features.contextAwareness true --repo-root .
node .ai/scripts/ctl-project-ctl-project-governance.mjs set context.enabled true --repo-root .
node .ai/scripts/ctl-project-ctl-project-governance.mjs set-context-mode <contract|snapshot> --repo-root .
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

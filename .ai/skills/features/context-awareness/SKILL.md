---
name: context-awareness
description: Enable and operate the Context Awareness feature (docs/context contracts + environment registry) so LLMs can work from a verified context layer instead of ad-hoc repo scans.
---

# Context Awareness Feature

## Intent

Provide a **stable, verifiable, LLM-readable context layer** under `docs/context/`.

The context-awareness feature standardizes how the project exposes:

- API contracts (OpenAPI)
- Database schema contract (LLM-readable JSON)
- Process contracts (BPMN)
- Environment registry (what exists; policies; *no secrets*)

The main outcome is that the LLM can load a small number of canonical entry points and avoid fragile whole-repo discovery.

## What gets enabled

When enabled, the feature **materializes** these paths in the repo root:

- `docs/context/**` (contracts + registry)
- `config/environments/**` (environment config templates; no secrets)

And it assumes these controller scripts exist (they are part of the template SSOT under `.ai/`):

- `node .ai/skills/features/context-awareness/scripts/ctl-context.mjs` — context artifacts + registry + environments
- `node .ai/scripts/ctl-project-state.mjs` — project state (`.ai/project/state.json`)
- `node .ai/skills/_meta/ctl-skillpacks.mjs` — skill pack switching + wrapper sync

## Canonical entry points for LLMs

1. `docs/context/INDEX.md`
2. `docs/context/registry.json`
3. `docs/context/config/environment-registry.json`

If a DB schema exists, the canonical DB contract is:

- `docs/context/db/schema.json`

That DB contract is produced by the DB SSOT workflow (see `ctl-db-ssot`, and the database workflow skills).

## How to enable

1. Copy templates from:
   - `.ai/skills/features/context-awareness/templates/`
   into the repo root.
2. Initialize:

```bash
node .ai/scripts/ctl-project-state.mjs init
node .ai/scripts/ctl-project-state.mjs set context.enabled true
node .ai/scripts/ctl-project-state.mjs set-context-mode contract
node .ai/skills/features/context-awareness/scripts/ctl-context.mjs init
node .ai/skills/features/context-awareness/scripts/ctl-context.mjs touch
```

## Operating rules

### Managing project state

Use `ctl-project-state` to maintain `.ai/project/state.json`:

```bash
node .ai/scripts/ctl-project-state.mjs init
node .ai/scripts/ctl-project-state.mjs set custom.stage <prototype|mvp|production|maintenance|archived>
node .ai/scripts/ctl-project-state.mjs set-context-mode <contract|snapshot>
node .ai/scripts/ctl-project-state.mjs verify
```

### Editing artifacts

After editing any file under `docs/context/**`:

```bash
node .ai/skills/features/context-awareness/scripts/ctl-context.mjs touch
```

### Managing environments

```bash
node .ai/skills/features/context-awareness/scripts/ctl-context.mjs list-envs
node .ai/skills/features/context-awareness/scripts/ctl-context.mjs add-env --id qa --description "QA environment"
node .ai/skills/features/context-awareness/scripts/ctl-context.mjs verify-config
```

## Module slice workflow (DB / Env / Observability)

For module-level context slices, follow the standard workflow below:

### Step 1 — Ensure repo contracts exist
- DB contract: `docs/context/db/schema.json`
- Env contract: `env/contract.yaml`
- Observability contracts: `docs/context/observability/*.json`

### Step 2 — Declare module boundaries in MANIFEST.yaml
```yaml
# modules/<module_id>/MANIFEST.yaml
db:
  owns:
    - table: users
  uses:
    - table: orders

env:
  owns:
    - SERVICE_API_KEY
  requires:
    - LOG_LEVEL

observability:
  metrics:
    owns:
      - http_requests_total
    uses:
      - auth_login_total
  logs:
    owns:
      - billing_account_id
    requires:
      - trace_id
```

### Step 3 — Validate and sync slices
```bash
# DB slices
node .ai/scripts/modules/ctl-db-ssot-module.mjs verify --strict
node .ai/scripts/modules/ctl-db-ssot-module.mjs conflicts
node .ai/scripts/modules/ctl-db-ssot-module.mjs sync-slices --module-id <module_id>

# Env slices
node .ai/scripts/modules/ctl-env-contract-module.mjs verify --strict
node .ai/scripts/modules/ctl-env-contract-module.mjs conflicts
node .ai/scripts/modules/ctl-env-contract-module.mjs sync-slices --module-id <module_id>

# Observability slices
node .ai/scripts/modules/ctl-obs-module.mjs verify --strict
node .ai/scripts/modules/ctl-obs-module.mjs conflicts
node .ai/scripts/modules/ctl-obs-module.mjs sync-slices --module-id <module_id>
```

### Step 4 — Rebuild aggregated context
```bash
node .ai/skills/features/context-awareness/scripts/ctl-context.mjs build
node .ai/skills/features/context-awareness/scripts/ctl-context.mjs verify --strict
```

### Related skills
- `manage-db-module-slices`
- `manage-env-module-slices`
- `manage-observability-module-slices`

## Verification

```bash
node .ai/skills/features/context-awareness/scripts/ctl-context.mjs verify --strict
node .ai/scripts/ctl-project-state.mjs verify
```

## References

- `reference/feature-overview.md`
- `reference/feature-mechanism.md`
- `reference/operating-guide.md`
- `reference/project-state-guide.md`

## Boundaries

- Do NOT store credentials or secrets in `docs/context/` or `config/`.
- Do NOT hand-edit generated context artifacts without re-running `ctl-context touch`.
- Use DB SSOT workflows to update `docs/context/db/schema.json`.

---
name: context-awareness
description: Enable and operate the Context Awareness feature (docs/context contracts + environment registry) so LLMs can work from a verified context layer instead of ad-hoc repo scans.
---

# Context Awareness Feature

## Intent

Provide a **stable, verifiable, LLM-readable context layer** under `docs/context/`.

This feature standardizes how the project exposes:

- API contracts (OpenAPI)
- Database schema contract (LLM-readable JSON)
- Process contracts (BPMN)
- Environment registry (what exists; policies; *no secrets*)

The main outcome is that the LLM can load a small number of canonical entry points and avoid fragile whole-repo discovery.

## What gets enabled

When enabled (typically during init), the feature **materializes** these paths in the repo root:

- `docs/context/**` (contracts + registry)
- `config/environments/**` (environment config templates; no secrets)

And it assumes these controller scripts exist (they are part of the template SSOT under `.ai/`):

- `node .ai/skills/features/context-awareness/scripts/contextctl.mjs` — context artifacts + registry + environments
- `node .ai/scripts/projectctl.mjs` — project state (`.ai/project/state.json`)
- `node .ai/skills/_meta/skillpacksctl.mjs` — skill pack switching + wrapper sync

## Canonical entry points for LLMs

1. `docs/context/INDEX.md`
2. `docs/context/registry.json`
3. `docs/context/config/environment-registry.json`

If a DB schema exists, the canonical DB contract is:

- `docs/context/db/schema.json`

That DB contract is produced by the DB SSOT workflow (see `dbssotctl`, and the database workflow skills).

## How to enable

### Path A — During init (recommended)

In `init/project-blueprint.json`:

- Set `features.contextAwareness = true`

Then run init Stage C apply:

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs apply --providers both
```

Init will:

- Copy this feature’s templates into the repo root
- Run `contextctl init` and `projectctl init`
- Record feature flags in `.ai/project/state.json`

### Path B — Enable in an existing repo

If you must enable after init, you can:

1. Copy templates from:
   - `.ai/skills/features/context-awareness/templates/`
   into the repo root.
2. Run:

```bash
node .ai/scripts/projectctl.mjs init
node .ai/scripts/projectctl.mjs set context.enabled true
node .ai/skills/features/context-awareness/scripts/contextctl.mjs init
node .ai/skills/features/context-awareness/scripts/contextctl.mjs touch
```

## Operating rules

### Managing project state

Use `projectctl` to maintain `.ai/project/state.json`:

```bash
node .ai/scripts/projectctl.mjs init
node .ai/scripts/projectctl.mjs set custom.stage <prototype|mvp|production|maintenance|archived>
node .ai/scripts/projectctl.mjs set-context-mode <contract|snapshot>
node .ai/scripts/projectctl.mjs verify
```

### Editing artifacts

After editing any file under `docs/context/**`:

```bash
node .ai/skills/features/context-awareness/scripts/contextctl.mjs touch
```

### Managing environments

```bash
node .ai/skills/features/context-awareness/scripts/contextctl.mjs list-envs
node .ai/skills/features/context-awareness/scripts/contextctl.mjs add-env --id qa --description "QA environment"
node .ai/skills/features/context-awareness/scripts/contextctl.mjs verify-config
```

## Verification

```bash
node .ai/skills/features/context-awareness/scripts/contextctl.mjs verify --strict
node .ai/scripts/projectctl.mjs verify
```

## References

- `reference/feature-overview.md`
- `reference/feature-mechanism.md`
- `reference/operating-guide.md`
- `reference/project-state-guide.md`

## Boundaries

- Do NOT store credentials or secrets in `docs/context/` or `config/`.
- Do NOT hand-edit generated context artifacts without re-running `contextctl touch`.
- Use DB SSOT workflows to update `docs/context/db/schema.json`.

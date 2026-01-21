# Init kit (robust 3-stage pipeline)

> Human-facing documentation. If you are an LLM/AI assistant, skip the file to save tokens and follow `init/AGENTS.md` instead.

The `init/` package provides a 3-stage, checkpointed workflow to bootstrap a repository from requirements:

- **Stage A**: Requirements docs (working location: `init/stage-a-docs/`)
- **Stage B**: Blueprint (working location: `init/project-blueprint.json`)
- **Stage C**: Scaffold + configs + skill packs + features + wrapper sync

It is designed for **robustness and auditability**:
- Each stage has a **validation step** (written into `init/.init-state.json`)
- Stage transitions require **explicit user approval** (`approve` command)
- Optional features are materialized **only when enabled in the blueprint** (`features.*`)

> **Working directory vs. final location**: During initialization, all working files are stored in `init/`. After completion, use `cleanup-init --archive` to move Stage A docs and blueprint to `docs/project/` for long-term retention.

---

## Quick start (run from repo root)

### 0) Initialize state
```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs start --repo-root .
```

The command creates:
- `init/stage-a-docs/` - Stage A document templates
- `init/project-blueprint.json` - Blueprint template
- `init/.init-state.json` - State tracking file

### Check progress / next checkpoint

```bash
# Current progress (prints guidance when not started yet)
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs status --repo-root .

# Next checkpoint actions (requires init state; exits non-zero if `start` was not run)
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs advance --repo-root .
```

### Preflight (recommended): terminology alignment

Before drafting Stage A docs, ask whether the user wants to align/confirm terminology now.

- If YES (sync): use `init/stage-a-docs/domain-glossary.md` as the terminology SSOT and align terms across Stage A docs.
- If NO (skip): record the decision in `init/stage-a-docs/domain-glossary.md` and continue.

See: `init/stages/00-preflight-terminology.md`.

### 1) Stage A: validate docs -> approve
```bash
# Edit templates in init/stage-a-docs/, then validate:
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs check-docs \
  --repo-root . \
  --strict

# After the user explicitly approves Stage A:
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs approve --stage A --repo-root .
```

### 2) Stage B: validate blueprint -> approve
```bash
# Edit init/project-blueprint.json, then validate:
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs validate \
  --repo-root .

# Optional: report recommended packs/features
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs suggest-packs \
  --repo-root .
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs suggest-features \
  --repo-root .

# After the user explicitly approves Stage B:
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs approve --stage B --repo-root .
```

### 3) Stage C: apply scaffold/configs/packs/features/wrappers -> approve
```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs apply \
  --repo-root . \
  --providers both

# After the user explicitly approves Stage C:
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs approve --stage C --repo-root .
```

### 4) Optional: cleanup after init

**Option A: Remove `init/` only** (Stage A docs and blueprint will be deleted)

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs cleanup-init \
  --repo-root . \
  --apply \
  --i-understand
```

**Option B: Archive to `docs/project/` + remove `init/`** (recommended for retaining docs)

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs cleanup-init \
  --repo-root . \
  --apply \
  --i-understand \
  --archive
```

The command archives Stage A docs and blueprint to `docs/project/`, then removes `init/`.

---

## Blueprint anatomy

The blueprint schema is:

- `init/skills/initialize-project-from-requirements/templates/project-blueprint.schema.json`

Key sections:

- `project.*`: name, description, and domain basics
- `db.ssot`: database schema single-source-of-truth
  - `none` | `repo-prisma` | `database`
- `context.*`: context configuration (does not enable the feature by itself)
- `capabilities.*`: informs scaffold and pack selection
- `features.*`: optional features to materialize during Stage C

## Optional features

This template does **not** ship an `addons/` directory. Feature assets are integrated under `.ai/`:

- Feature skills + templates: `.ai/skills/features/...`
- Feature controllers: `.ai/skills/features/**/scripts/*` (Node/Python)
- Cross-cutting controllers: `.ai/scripts/*` (e.g., `projectctl.mjs`, `dbssotctl.mjs`)
- Project state (feature flags): `.ai/project/state.json`

Stage C `apply` materializes a feature by copying templates into the repo (when the feature has templates) and running the corresponding control scripts (typically under `.ai/skills/features/**/scripts/`, plus cross-cutting `.ai/scripts/projectctl.mjs` for feature state).

Note (Windows): `python3` may not exist on PATH. Use `python` instead. (Stage C `apply` will try `python3` then `python`.)

| Feature | Blueprint toggle | Materializes | Control script(s) |
|---------|------------------|--------------|----------------|
| Context awareness | `features.contextAwareness` | `docs/context/**`, `config/environments/**` | `node .ai/skills/features/context-awareness/scripts/contextctl.mjs` |
| Database | `features.database` (requires `db.ssot != none`) | `db/**` (when `db.ssot=database`), `prisma/**` (when `db.ssot=repo-prisma`) | `.ai/skills/features/database/sync-code-schema-from-db/scripts/dbctl.mjs` (when `db.ssot=database`); `node .ai/skills/features/database/db-human-interface/scripts/dbdocctl.mjs` (human interface) |
| UI | `features.ui` | `ui/**`, `docs/context/ui/**` | `python3 .ai/skills/features/ui/ui-system-bootstrap/scripts/ui_specctl.py` |
| Environment | `features.environment` | `env/**` (+ generated non-secret docs when `--verify-features`) | `python3 .ai/skills/features/environment/env-contractctl/scripts/env_contractctl.py` |
| Packaging | `features.packaging` | `ops/packaging/**`, `docs/packaging/**` | `node .ai/skills/features/packaging/scripts/packctl.mjs` |
| Deployment | `features.deployment` | `ops/deploy/**` | `node .ai/skills/features/deployment/scripts/deployctl.mjs` |
| CI | `features.ci` (requires `ci.provider`) | `.github/workflows/ci.yml` (GitHub) or `.gitlab-ci.yml` (GitLab), `ci/**` | `node .ai/skills/features/ci/scripts/cictl.mjs` |
| Observability | `features.observability` (requires context awareness) | `docs/context/observability/**`, `observability/**` | `node .ai/skills/features/observability/scripts/obsctl.mjs` |
| Release | `features.release` | `release/**`, `.releaserc.json.template` | `node .ai/skills/features/release/scripts/releasectl.mjs` |

For feature-specific details, see:

- `init/feature-docs/README.md`
- `.ai/skills/features/<feature-id>/**/SKILL.md`

## Feature selection workflow (Stage B -> Stage C)

### Key rules

- You MUST set `features.<id>: true` to install a feature during Stage C.
- `context.*`, `db.*`, `packaging.*`, `deploy.*`, `release.*`, and `observability.*` are configuration only; they do not install features by themselves.
- Stage C is non-destructive: setting `features.<id>: false` later will NOT uninstall previously created files.

### Recommended steps

1) Fill `capabilities.*`, `db.*` (especially `db.ssot`), and any feature configuration sections.

2) Ask the pipeline for recommendations:

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs suggest-features --repo-root .
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs suggest-packs --repo-root .
```

3) Decide which features to keep, then set `features.*` explicitly (or safe-add via `--write`):

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs suggest-features --repo-root . --write
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs validate --repo-root .
```

## Apply flags (Stage C)

- `--force-features`: overwrite existing feature files when materializing templates
- `--verify-features`: run `*ctl.mjs verify` after `init` (fail-fast by default)
- `--non-blocking-features`: continue despite feature init/verify errors (not recommended)

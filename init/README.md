# Init kit (robust 3-stage pipeline)

> Human-facing documentation. If you are an LLM/AI assistant, skip the file to save tokens and follow `init/AGENTS.md` instead.

The `init/` package provides a 3-stage, checkpointed workflow to bootstrap a repository from requirements:

- **Stage A**: Requirements docs (working location: `init/stage-a-docs/`)
- **Stage B**: Blueprint (working location: `init/project-blueprint.json`)
- **Stage C**: Scaffold + configs + skill packs + features + wrapper sync + modular core build

It is designed for **robustness and auditability**:
- Each stage has a **validation step** (written into `init/.init-state.json`)
- Stage transitions require **explicit user approval** (`approve` command)
- Optional features are materialized **only when enabled in the blueprint** (`features.*`)

> **Working directory vs. final location**: During initialization, all working files are stored in `init/`. After completion, use `cleanup-init --archive` to archive:
> - Stage A docs → `docs/project/overview/`
> - Blueprint → `docs/project/overview/project-blueprint.json`

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

# Before Stage C approval (required): review skill retention and record it in the init state:
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs review-skill-retention --repo-root .

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

**Option B: Archive to `docs/project/overview/` + remove `init/`** (recommended for retaining docs)

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs cleanup-init \
  --repo-root . \
  --apply \
  --i-understand \
  --archive
```

The command archives Stage A docs and the blueprint to `docs/project/overview/`, then removes `init/`.

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
- `ci.provider`: CI provider selection (`none` | `github` | `gitlab`)
- `features.*`: feature overrides (default-on; set to `false` to skip materialization)

## Optional features

Feature assets are integrated under `.ai/`:

- Feature skills + templates: `.ai/skills/features/...`
- Feature controllers: `.ai/skills/features/**/scripts/*` (Node/Python)
- Cross-cutting controllers: `.ai/scripts/*` (e.g., `projectctl.mjs`, `dbssotctl.mjs`)
- Project state (feature flags): `.ai/project/state.json`

Stage C `apply` materializes a feature by copying templates into the repo (when the feature has templates) and running the corresponding control scripts (typically under `.ai/skills/features/**/scripts/`, plus cross-cutting `.ai/scripts/projectctl.mjs` for feature state).

Note (Windows): `python3` may not exist on PATH. Use `python` instead. (Stage C `apply` will try `python3` then `python`.)

| Feature | Blueprint control | Materializes | Control script(s) |
|---------|------------------|--------------|----------------|
| Context awareness | **mandatory** (cannot be disabled) | `docs/context/**`, `config/environments/**` | `node .ai/skills/features/context-awareness/scripts/contextctl.mjs` |
| Database | `db.ssot` (`none` disables) | `db/**` (when `db.ssot=database`), `prisma/**` (when `db.ssot=repo-prisma`) | `.ai/skills/features/database/sync-code-schema-from-db/scripts/dbctl.mjs` (when `db.ssot=database`); `node .ai/skills/features/database/db-human-interface/scripts/dbdocctl.mjs` (human interface) |
| UI | `features.ui` (default: `true`) | `ui/**`, `docs/context/ui/**` | `python3 .ai/skills/features/ui/ui-system-bootstrap/scripts/ui_specctl.py` |
| Environment | `features.environment` (default: `true`) | `env/**` (+ generated non-secret docs when `--verify-features`) | `python3 .ai/skills/features/environment/env-contractctl/scripts/env_contractctl.py` |
| Packaging | `features.packaging` (default: `true`) | `ops/packaging/**`, `docs/packaging/**` | `node .ai/skills/features/packaging/scripts/packctl.mjs` |
| Deployment | `features.deployment` (default: `true`) | `ops/deploy/**` | `node .ai/skills/features/deployment/scripts/deployctl.mjs` |
| CI | `ci.provider` (`none` disables; default: `github`) | `.github/workflows/ci.yml` (GitHub) or `.gitlab-ci.yml` (GitLab), `ci/**` | `node .ai/skills/features/ci/scripts/cictl.mjs` |
| Observability | `features.observability` (default: `true`) | `docs/context/observability/**`, `observability/**` | `node .ai/skills/features/observability/scripts/obsctl.mjs` |
| Release | `features.release` (default: `true`) | `release/**`, `.releaserc.json.template` | `node .ai/skills/features/release/scripts/releasectl.mjs` |

For feature-specific details, see:

- `init/feature-docs/README.md`
- `.ai/skills/features/<feature-id>/**/SKILL.md`

## Feature selection workflow (Stage B -> Stage C)

### Key rules

- Context awareness is always installed in Stage C (mandatory).
- Database enablement is controlled by `db.ssot`:
  - `db.ssot=none` skips all DB outputs
- CI enablement is controlled by `ci.provider`:
  - `ci.provider=none` skips all CI outputs
- Other features are enabled by default; set `features.<id>: false` to skip.
- Stage C is non-destructive: setting `features.<id>: false` later will NOT uninstall previously created files.

### Recommended steps

1) Fill `capabilities.*`, choose `db.ssot`, choose `ci.provider`, and set any feature overrides under `features.*` if needed.

2) Ask the pipeline for recommendations:

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs suggest-features --repo-root .
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs suggest-packs --repo-root .
```

## Apply flags (Stage C)

- `--force-features`: overwrite existing feature files when materializing templates
- `--verify-features`: run `*ctl.* verify` after `init` (respects `--blocking-features`)
- `--blocking-features`: fail-fast on feature init/verify errors (default is non-blocking)
- `--non-blocking-features`: (legacy) continue despite feature init/verify errors
- `--skip-modular`: skip modular core build (not recommended)
- `--blocking-modular`: fail-fast on modular core build errors (default is non-blocking)

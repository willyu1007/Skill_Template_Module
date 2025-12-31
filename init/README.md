# Init kit (robust 3-stage pipeline)

> Human-facing documentation. If you are an LLM/AI assistant, skip this file to save tokens and follow `init/AGENTS.md` instead.

This `init/` package provides a 3-stage, checkpointed workflow to bootstrap a repository from requirements:

- **Stage A**: Requirements docs (`init/stage-a-docs/*`)
- **Stage B**: Blueprint (`init/project-blueprint.json`)
- **Stage C**: Scaffold + configs + skill packs + add-ons + wrapper sync

It is designed for **robustness and auditability**:
- Each stage has a **validation step** (written into `init/.init-state.json`)
- Stage transitions require **explicit user approval** (`approve` command)
- Optional add-ons are installed **only when enabled in the blueprint**

### Path conventions

| Phase | Stage A docs | Blueprint |
|-------|--------------|-----------|
| **During init** (working paths) | `init/stage-a-docs/` | `init/project-blueprint.json` |
| **After archive** (final paths) | `docs/project/` | `docs/project/project-blueprint.json` |

The scripts default to working paths. Some skill docs (e.g., `SKILL.md`) reference final paths for post-init usage.

---

## Quick start (run from repo root)

### 0) Initialize state
```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs start --repo-root .
```

### 1) Stage A: validate docs → approve
```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs check-docs \
  --repo-root . \
  --strict

# After the user explicitly approves Stage A:
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs approve --stage A --repo-root .
```

### 2) Stage B: validate blueprint → approve
```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs validate \
  --repo-root .

# After the user explicitly approves Stage B:
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs approve --stage B --repo-root .
```

### 3) Stage C: apply scaffold/configs/packs/addons/wrappers → approve
```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs apply \
  --repo-root . \
  --providers both

# Optional: verify add-ons after installation (fail-fast by default).
# Use --non-blocking-addons to continue despite verify failures.
# node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs apply \
#   --repo-root . \
#   --providers both \
#   --verify-addons

# After the user explicitly approves Stage C:
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs approve --stage C --repo-root .
```

### 4) Optional: cleanup after init

**Option A: Remove `init/` only** (repo retains add-on source directories)

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs cleanup-init \
  --repo-root . \
  --apply \
  --i-understand
```

**Option B: Archive to docs/project/ then remove `init/`** (recommended)

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs cleanup-init \
  --repo-root . \
  --apply \
  --i-understand \
  --archive
```

This archives Stage A docs and Blueprint to `docs/project/` before deleting `init/`.

**Option C: Archive + prune unused add-ons**

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs cleanup-init \
  --repo-root . \
  --apply \
  --i-understand \
  --archive \
  --cleanup-addons
```

This archives to `docs/project/`, removes `init/`, and deletes add-on source directories under `addons/` that were not enabled in the blueprint.

---

## Core capabilities (built-in)

The module-first template ships these capabilities **by default** (they are not add-ons anymore):

- **Context registries** (`contextctl.js`, `docs/context/*`, `modules/*/interact/registry.json`)
- **Modular system** (`modulectl.js`, `flowctl.js`, `integrationctl.js`, `.system/modular/*`)
- **DB mirror** (`dbctl.js`, `db/`)
- **CI templates tooling** (`cictl.js`, `ci/`, `.gitlab-ci/`)

> For backward compatibility, some blueprint flags may still mention these features. In this template version, they are already present and do not need to be installed from `addons/`.

## Available Add-ons (non-core)

| Add-on | Directory | Purpose | Control Script |
|--------|----------:|---------|----------------|
| `packaging` | `addons/packaging/` | Container/artifact packaging | `packctl.js` |
| `deployment` | `addons/deployment/` | Multi-environment deployment | `deployctl.js` |
| `release` | `addons/release/` | Version/changelog tooling | `releasectl.js` |
| `observability` | `addons/observability/` | Metrics/logs/traces contracts | `obsctl.js` |

Add-ons are installed non-destructively (copy-if-missing) during Stage C `apply`. See `addon-docs/convention.md`.

Example blueprint snippet:

```json
{
  "addons": {
    "packaging": true,
    "deployment": true,
    "release": true,
    "observability": true
  }
}
```

## LLM-guided initialization (optional)

This init kit supports an AI assistant guiding a user through the entire initialization flow.

### Flow

```
Requirements interview → Tech stack selection → Blueprint generation → Add-on recommendations → Config generation → apply
```

### Supported languages

| Language | Template support | Config generation |
|----------|------------------|------------------|
| TypeScript/JavaScript | ✅ | Built-in templates |
| Go | ✅ | Built-in templates |
| C/C++ (xmake) | ✅ | Built-in templates |
| React Native | ✅ | Built-in templates |
| Python | ❌ | LLM-generated |
| Java/Kotlin | ❌ | LLM-generated |
| .NET (C#) | ❌ | LLM-generated |
| Rust | ❌ | LLM-generated |
| Other | ❌ | LLM-generated |

### Guidance docs

- `skills/initialize-project-from-requirements/templates/llm-init-guide.md` – Complete LLM guide
- `skills/initialize-project-from-requirements/templates/conversation-prompts.md` – Conversation question bank

### Handling languages without templates

When the user selects a language without a built-in template:
1. `scaffold-configs.cjs` prints guidance and suggests config files
2. The LLM generates the config files based on `llm-init-guide.md`
3. Continue running the `apply` command after user confirmation

---

## DevOps scaffold (optional)

If the blueprint indicates CI/DevOps needs, Stage C scaffolding can create an `ops/` convention folder:

- `ops/packaging/{services,jobs,apps,scripts,workdocs}/`
- `ops/deploy/{http_services,workloads,clients,scripts,workdocs}/`

When add-ons are enabled, they provide more complete implementations with management scripts.

---

## Files in this init kit

- `stages/` – stage guidance docs
- `skills/initialize-project-from-requirements/` – the skill definition and scripts
  - `templates/project-blueprint.example.json` – full example (all add-ons enabled)
  - `templates/project-blueprint.min.example.json` – minimal example (backend only)
  - `templates/llm-init-guide.md` – LLM initialization guide
  - `templates/conversation-prompts.md` – Conversation question bank and branch modules
  - `reference.md` – technical reference (SSOT for init behavior)
- `addon-docs/` – core capability and add-on documentation (including conventions)
- `.init-kit` – marker file

## References

- **SSOT for init behavior**: `skills/initialize-project-from-requirements/reference.md`
- **Stage guidance**: `stages/01-stage-a-requirements.md`, `stages/02-stage-b-blueprint.md`, `stages/03-stage-c-scaffold-and-skills.md`
- **LLM-guided initialization**: `skills/initialize-project-from-requirements/templates/llm-init-guide.md`, `skills/initialize-project-from-requirements/templates/conversation-prompts.md`
- **Core/Add-on docs**: `addon-docs/`

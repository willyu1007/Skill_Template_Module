# Stage B: Project blueprint

> **SSOT**: For the complete command reference, see `init/skills/initialize-project-from-requirements/SKILL.md`.

Stage B produces and validates a **project blueprint** that will drive Stage C scaffolding, config generation, and skill pack selection.

> **Working location**: `init/project-blueprint.json` (created by the `start` command)
> 
> **Final location**: `docs/project/project-blueprint.json` (archived by `cleanup-init --archive`)

## Prerequisite (entering Stage B)

- Stage A is validated and approved (state advanced to `stage: "B"`).
- Verify current status:

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs status --repo-root .
```

Reference templates:
- `init/skills/initialize-project-from-requirements/templates/project-blueprint.example.json`
- `init/skills/initialize-project-from-requirements/templates/project-blueprint.schema.json`

---

## What must be true before leaving Stage B

1. `init/project-blueprint.json` exists and is properly configured
2. The blueprint passes validation:
   - schema-level sanity checks
   - pack selection recommendation report (optional, but strongly recommended)
3. The user explicitly approves the blueprint (checkpoint)

---

## Validate blueprint

From repo root:

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs validate \
  --repo-root .
```

Optional: show recommended packs and whether they are installed:

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs suggest-packs \
  --repo-root .
```

## State tracking (recommended)

After reviewing `skills.packs`, record the review in `init/.init-state.json`:

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs review-packs --repo-root .
```

---

## Technology stack selection

The blueprint must specify technology-stack related fields:

### `repo` fields

```json
{
  "repo": {
    "layout": "single",           // or "monorepo"
    "language": "typescript",     // language
    "packageManager": "pnpm"      // package manager
  }
}
```

### Supported languages

| Language | Has built-in template | Recommended package manager |
|------|-----------|-------------|
| typescript | yes | pnpm |
| javascript | yes | pnpm |
| go | yes | go |
| c | yes | xmake |
| cpp | yes | xmake |
| react-native | yes | pnpm |
| python | LLM-generated | poetry |
| java | LLM-generated | gradle |
| kotlin | LLM-generated | gradle |
| dotnet | LLM-generated | dotnet |
| rust | LLM-generated | cargo |
| ruby | LLM-generated | bundler |
| php | LLM-generated | composer |
| other | LLM-generated | - |

For languages without built-in templates, the `apply` command will print guidance and the LLM should generate config files based on `templates/llm-init-guide.md`.

### LLM guidance

If you're using an AI assistant to guide initialization, refer to:
- Module E in `templates/conversation-prompts.md` (technology stack selection)
- Phase 2 and Phase 5 in `templates/llm-init-guide.md`

---


## Feature + provider configuration

Stage C behavior is driven by:

1) **Mandatory foundation**

- Context awareness is always enabled in Stage C.
- You MAY keep `features.contextAwareness: true` in the blueprint (or omit the field), but you MUST NOT set the value to `false`.

2) **Implementation selection (SSOT)**

- Database: `db.ssot` is the enablement switch:
  - `repo-prisma` (default): ensures `prisma/` as the schema SSOT anchor
  - `database`: materializes `db/` mirrors and initializes DB tooling
  - `none`: skips DB outputs (no `db/`, no `prisma/`, no `docs/project/db-ssot.json`, no `docs/context/db/schema.json`)
- CI: `ci.provider` is the enablement switch:
  - `github` (default) or `gitlab`: installs CI files
  - `none`: skips CI outputs (no `.github/`, no `.gitlab-ci.yml`, no `ci/`)

3) **Feature overrides (default-on)**

Other features are **enabled by default**. To skip, set `features.<id>: false`:

- `features.ui`
- `features.environment`
- `features.packaging`
- `features.deployment`
- `features.release`
- `features.observability`

### Recommended workflow

1) Validate the blueprint:

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs validate --repo-root .
```

2) Optional: preview the effective enabled features:

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs suggest-features --repo-root .
```

See `init/README.md` and `init/feature-docs/README.md` for feature and provider details.

---

## User approval checkpoint (advance to Stage C)

After the user explicitly approves the blueprint, record approval and advance:

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs approve --stage B --repo-root .
```

---

## Note on blueprint location

The blueprint is stored in `init/project-blueprint.json` during initialization. After Stage C completion, use `cleanup-init --archive` to archive the blueprint to `docs/project/project-blueprint.json` for long-term retention.

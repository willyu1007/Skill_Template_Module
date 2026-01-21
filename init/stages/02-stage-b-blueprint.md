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


## Feature flags (optional)

Feature flags are configured in the blueprint under `features`.

### Key rules

- You MUST set `features.<id>: true` to install a feature during Stage C.
- `context.*` (and other config sections like `db.*`, `deploy.*`, `packaging.*`, `release.*`, `observability.*`) are configuration only; they do not install features by themselves.

### Recommended workflow

1) Validate the blueprint:

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs validate --repo-root .
```

2) Ask the pipeline for recommended features:

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs suggest-features --repo-root .
```

Optional: safe-add missing recommended features into `features.*`:

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs suggest-features --repo-root . --write
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs validate --repo-root .
```

### Dependencies (common)

- `features.database=true` requires `db.ssot != "none"`.
- `features.observability=true` requires `features.contextAwareness=true`.

See `init/README.md` and `init/feature-docs/README.md` for the full feature list and behavior.

---

## User approval checkpoint (advance to Stage C)

After the user explicitly approves the blueprint, record approval and advance:

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs approve --stage B --repo-root .
```

---

## Note on blueprint location

The blueprint is stored in `init/project-blueprint.json` during initialization. After Stage C completion, use `cleanup-init --archive` to archive it to `docs/project/project-blueprint.json` for long-term retention.

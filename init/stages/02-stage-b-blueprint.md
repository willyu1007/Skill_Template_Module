# Stage B: Project blueprint

Stage B produces and validates a **project blueprint** that will drive Stage C scaffolding, config generation, and skill pack selection.

Blueprint location:
- `init/project-blueprint.json`

Reference templates:
- `init/skills/initialize-project-from-requirements/templates/project-blueprint.example.json`
- `init/skills/initialize-project-from-requirements/templates/project-blueprint.schema.json`

> **Note**: Run `start` command first to auto-create the blueprint template.

---

## What must be true before leaving Stage B

1. `init/project-blueprint.json` exists
2. The blueprint passes validation:
   - schema-level sanity checks
   - pack selection recommendation report (optional, but strongly recommended)
3. The user explicitly approves the blueprint (checkpoint)

---

## Validate blueprint

From repo root:

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs validate \
  --repo-root .
```

Optional: show recommended packs and whether they are installed:

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs suggest-packs \
  --repo-root .
```

> Default `--blueprint` is `init/project-blueprint.json`.

## State tracking (recommended)

After reviewing `skills.packs`, record the review in `init/.init-state.json`:

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs review-packs --repo-root .
```

---

## Technology stack selection

The blueprint must specify the following tech-stack fields:

### `repo` fields

```json
{
  "repo": {
    "layout": "single",           // or "monorepo"
    "language": "typescript",     // programming language
    "packageManager": "pnpm"      // package manager
  }
}
```

### Supported languages

| Language | Has template | Recommended package manager |
|----------|--------------|----------------------------|
| typescript | ✅ | pnpm |
| javascript | ✅ | pnpm |
| go | ✅ | go |
| python | ❌ (LLM-generated) | poetry |
| java | ❌ (LLM-generated) | gradle |
| dotnet | ❌ (LLM-generated) | dotnet |
| other | ❌ (LLM-generated) | - |

For languages without a template, the `apply` command will print guidance and the LLM should generate config files based on `templates/llm-init-guide.md`.

### LLM guidance

If you are using an AI assistant during initialization, see:
- `templates/conversation-prompts.md` section E (tech stack selection)
- `templates/llm-init-guide.md` Phase 2 and Phase 5

---

## Add-on flags (optional)

In the module-first template, some capabilities are **core** and already present in the repository.

### Core capability flags (backward compatible)

These flags are supported for backward compatibility, but they do not install files from `addons/` in this template version:

- `addons.contextAwareness`
  - Default: enabled
  - Set to `false` to skip context-related init steps (files remain present)
- `addons.dbMirror`

### Non-core add-ons

Non-core add-ons that *do* live under `addons/` and can be installed during Stage C:

- `addons.packaging`
- `addons.deployment`
- `addons.release`
- `addons.observability`


---

## User approval checkpoint (advance to Stage C)

After the user explicitly approves the blueprint, record approval and advance:

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs approve --stage B --repo-root .
```

# Agent guidance for the init kit

The repository includes an `init/` bootstrap kit that is intended to be executed in a **checkpointed** manner.

Key principles:

- Do not skip stages.
- Do not advance stages without explicit user approval.
- Do not hand-edit `init/.init-state.json` to change stages; use the pipeline commands.
- Do not create dev-docs task bundles during initialization; use dev-docs after init completes.

---

## Canonical command entry point

Run from repo root:

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs <command> [options]
```

---

## Stage flow (validation + approval)

### Stage A (requirements docs)

Run `start` to begin initialization. The command automatically creates all templates:

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs start --repo-root .
```

The command creates:
- `init/stage-a-docs/` - Stage A doc templates:
  - `requirements.md`
  - `non-functional-requirements.md`
  - `domain-glossary.md`
  - `risk-open-questions.md`
- `init/project-blueprint.json` - Blueprint template

1) Edit the Stage A doc templates, then validate:
```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs check-docs --repo-root . --strict
```

2) After user approval:
```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs approve --stage A --repo-root .
```

### Stage B (blueprint)

1) Edit `init/project-blueprint.json`, then validate:
```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs validate --repo-root .
```

2) After user approval:
```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs approve --stage B --repo-root .
```

### Stage C (apply)

Apply scaffold/configs/skill packs/wrapper sync:

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs apply --repo-root . --providers both
```

After user approval:
```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs approve --stage C --repo-root .
```

---

## Stage C troubleshooting (EPERM)

If Stage C `apply` fails with an `EPERM` error while writing `.codex/skills/` or `.claude/skills/`, re-run the same `apply` command in an elevated shell. Do not change the blueprint between attempts.

---

## Feature notes (context awareness)

If the blueprint enables context awareness (`features.contextAwareness: true`), Stage C `apply` will:
- copy templates from `.ai/skills/features/context-awareness/templates/` into the repo (copy-if-missing; non-destructive)
- run `.ai/skills/features/context-awareness/scripts/contextctl.mjs init`
- run `.ai/scripts/projectctl.mjs init` and `set-context-mode` (if projectctl exists)

`context.*` is configuration only and does not trigger enabling by itself.

See `.ai/skills/features/context-awareness/` for details.

---

## Post-init: Skill retention (required)

After Stage C completes, ensure `init/skill-retention-table.template.md` exists (generated from the template). Fill the table with skills from `.ai/skills/` and translate the Description column if needed. Ask the user which skills to keep/delete (record TBD if undecided).

Confirm deletions **before** running:

```bash
node .ai/scripts/sync-skills.mjs --dry-run --delete-skills "<csv>"
```

After confirmation, re-run with `--yes` to delete. Optional removals (like `agent-builder`) should go through the same flow:

```bash
node .ai/scripts/sync-skills.mjs --delete-skills "<csv>" --yes
```

---

## Post-init: Update Root README.md and AGENTS.md

After Stage C completes and skill retention is confirmed, ask the user if they want to update the root `README.md` and `AGENTS.md` with project-specific info.

### When to ask

At Stage C completion checkpoint, present option: "update agents" to record tech stack in root AGENTS.md and refresh root README.md.

### README.md update

- If `README.md` was not generated during Stage C, update it at the end alongside `AGENTS.md`.
- Use `init/project-blueprint.json` as the source of truth.
- Show a diff and request explicit user approval before writing.

### What to preserve

The root `AGENTS.md` contains template repo structure that MUST be kept:

| Section | Keep? | Reason |
|---------|-------|--------|
| Key Directories table | YES | LLM navigation |
| Routing table | YES | Task dispatch |
| Global Rules | YES | Cross-cutting constraints |
| `.ai/` reference | YES | SSOT location |
| `dev-docs/` reference | YES | Complex task pattern |

### What to add

From `init/project-blueprint.json`:

| Add | Source field | Example |
|-----|--------------|---------|
| Project Type | `project.name`, `project.description` | "my-app - E-commerce platform" |
| Tech Stack table | `repo.language`, `repo.packageManager`, `repo.layout` | TypeScript, pnpm, monorepo |
| Enabled capabilities | `capabilities.frontend.enabled`, etc. | frontend, backend, database |
| Project directories | derived from `repo.layout` | `apps/`, `packages/` or `src/` |

### How to update

1. Read current root `AGENTS.md` and treat the document as a **project doc** (not a template doc).
2. Replace the template intro paragraph (the one that says the repo is a template) with a 1-2 line project summary.
3. Update the existing `## Project Type` section body (do NOT add a duplicate section):
   - `{{project.name}} - {{project.description}}` (one line)
4. Ensure there is exactly one `## Tech Stack` section:
   - If the `## Tech Stack` section exists: replace the table with the latest values from the blueprint.
   - If the `## Tech Stack` section does not exist: insert the `## Tech Stack` section immediately after `## Project Type`.
5. Update the existing `## Key Directories` table:
   - Add project code directories first (`src/` or `apps/`/`packages/` based on `repo.layout`).
   - Preserve the template navigation rows (`.ai/`, `dev-docs/`, etc.) and their entry points.
6. Preserve `## Routing` and `## Global Rules` content unchanged (these are the critical constraints).
7. Show a diff and get explicit user approval before writing.

Idempotency: re-running the update SHOULD only refresh values and MUST NOT create duplicate sections/tables.

### Format rules

- One fact per line (semantic density)
- Use tables for structured data (tech stack, directories)
- Prefer short terms in tables ("TS" over "TypeScript" is acceptable)
- No redundant prose; headers provide context

---

## Cleanup

Only after completion and user confirmation:

**Option A: Remove `init/` only (all init files deleted)**

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs cleanup-init \
  --repo-root . --apply --i-understand
```

**Option B: Archive all to `docs/project/` + remove `init/`** (recommended if maintaining docs)

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs cleanup-init \
  --repo-root . --apply --i-understand --archive
```

The command archives Stage A docs and blueprint from `init/` to `docs/project/` before removing `init/`.


**Selective archive options:**
- `--archive` - Archive all (docs + blueprint)
- `--archive-docs` - Archive Stage A docs only
- `--archive-blueprint` - Archive blueprint only

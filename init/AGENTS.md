# Agent guidance for the init kit

The repository includes an `init/` bootstrap kit that is intended to be executed in a **checkpointed** manner.

Key principles:

- Do not skip stages.
- Do not advance stages without explicit user approval.
- Humans MUST NOT hand-edit the init state file (`init/_work/.init-state.json`, legacy: `init/.init-state.json`) to change stages; use the pipeline commands.
- Do not create dev-docs task bundles during initialization; use dev-docs after init completes.

---

## Human entry points (recommended)

- LLM gate (MUST): before any Stage A interview work, ask the user to choose **one** output language for init outputs.
  - Record it in the init state: `init/_work/.init-state.json` -> `outputLanguage`
  - Humans MUST NOT edit the state file; LLM MAY update `outputLanguage` only (do not change stages/validation flags).
- After `outputLanguage` is set, use:
  - `init/START-HERE.md` (LLM-maintained; localized; one-screen key inputs + pending questions)
  - `init/INIT-BOARD.md` (LLM-maintained; localized; concise progress board)
    - The init pipeline updates a machine snapshot block inside the file after every pipeline command.
    - LLM MUST NOT edit the machine snapshot markers/section.
- Maintain `init/START-HERE.md` and `init/INIT-BOARD.md` in the chosen output language only.

---

## Canonical command entry point

Run from repo root:

```bash
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs <command> [options]
```

---

## Stage flow (validation + approval)

### Stage A (requirements docs)

Run `start` to begin initialization. The command automatically creates all templates:

```bash
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs start --repo-root .
```

The command creates:
- `init/_work/AGENTS.md` - Workspace operating rules (copy-if-missing)
- `init/_work/.init-state.json` - Init state file (pipeline-owned)
- `init/_work/stage-a-docs/` - Stage A doc templates (legacy: `init/stage-a-docs/`):
  - `requirements.md`
  - `non-functional-requirements.md`
  - `domain-glossary.md`
  - `risk-open-questions.md`
- `init/_work/project-blueprint.json` - Blueprint template (legacy: `init/project-blueprint.json`)

After `outputLanguage` is set in the init state, the pipeline will create (copy-if-missing) the entry docs and keep the machine snapshot refreshed:

- `init/START-HERE.md` - LLM-maintained entry doc (localized; not SSOT)
- `init/INIT-BOARD.md` - LLM-maintained progress board (localized; contains a machine snapshot section)

1) Edit the Stage A doc templates, then validate:
```bash
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs check-docs --repo-root . --strict
```

Before approving Stage A, complete the must-ask checklist for the board (required by default):

```bash
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs mark-must-ask --repo-root . --key <key> --asked --answered --written-to <path>
```

2) After user approval:
```bash
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs approve --stage A --repo-root .
```

### Stage B (blueprint)

1) Edit `init/_work/project-blueprint.json` (legacy: `init/project-blueprint.json`), then validate:
```bash
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs validate --repo-root .
```

2) After user approval:
```bash
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs approve --stage B --repo-root .
```

### Stage C (apply)

Apply scaffold/configs/skill packs/wrapper sync:

```bash
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs apply --repo-root . --providers both
```

The `apply` command is Stage C only and refuses to run in earlier stages by default. Override (not recommended):

```bash
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs apply --repo-root . --providers both --force --i-understand
```

After user approval:
```bash
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs approve --stage C --repo-root .
```

---

## Stage C troubleshooting (EPERM)

If Stage C `apply` fails with an `EPERM` error while writing `.codex/skills/` or `.claude/skills/`, re-run the same `apply` command in an elevated shell. Do not change the blueprint between attempts.

---

## Feature notes (context awareness)

Context awareness is **mandatory** in the template repository. Stage C `apply` will always:
- copy templates from `.ai/skills/features/context-awareness/templates/` into the repo (copy-if-missing; non-destructive)
- run `.ai/skills/features/context-awareness/scripts/ctl-context.mjs init`
- run `.ai/scripts/ctl-project-state.mjs init` and `set-context-mode` (if ctl-project-state exists)
- initialize the project governance hub: `node .ai/scripts/ctl-project-governance.mjs init --project main` (if ctl-project-governance exists)

`features.contextAwareness` MUST NOT be set to `false` (the field may be omitted or kept as `true`).
`context.*` is configuration only (mode/env list).

See `.ai/skills/features/context-awareness/` for details.

---

## Stage C: Skill retention (required before approval)

After Stage C `apply` completes, ensure the skill retention table exists (generated by `apply`):

- `init/_work/skill-retention-table.template.md` (legacy: `init/skill-retention-table.template.md`)

Fill the table with skills from `.ai/skills/` and translate the Description column if needed. Ask the user which skills to keep/delete (record TBD if undecided).

Confirm deletions **before** running:

```bash
node .ai/scripts/sync-skills.mjs --dry-run --delete-skills "<csv>"
```

After confirmation, re-run with `--yes` to delete. Optional removals (like `agent-builder`) should go through the same flow:

```bash
node .ai/scripts/sync-skills.mjs --delete-skills "<csv>" --yes
```

After skill retention is reviewed, record the review outcome in the init state (required before `approve --stage C`):

```bash
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs review-skill-retention --repo-root .
```

---

## Stage C: Update Root README.md and AGENTS.md (required before approval)

After Stage C `apply` completes and skill retention is reviewed, you **must** either update or explicitly skip the AGENTS.md update before Stage C approval.

Updating the root `AGENTS.md` ensures LLMs see your project context (name, tech stack, key directories) in future sessions, not just the generic template description.

### When to ask

At the Stage C completion checkpoint, ask the user:

> Do you want to update the root `AGENTS.md` with project-specific info? (yes/no/skip)

**If YES**: run `update-agents` (dry-run, then apply):

```bash
# Dry-run (recommended)
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs update-agents --repo-root .

# Apply
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs update-agents --repo-root . --apply
```

**If NO/SKIP**: the user can skip the `AGENTS.md` update step during approval (not recommended):

```bash
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs approve --stage C --repo-root . --skip-agents-update
```

### README.md update

- If `README.md` was not generated during Stage C, update `README.md` at the end alongside `AGENTS.md`.
- Use the blueprint as the source of truth (`init/_work/project-blueprint.json`, legacy: `init/project-blueprint.json`).
- Show a diff and request explicit user approval before writing.

### What to preserve

The root `AGENTS.md` contains template repo structure that MUST be kept:

| Section | Keep? | Reason |
|---------|-------|--------|
| Key Directories table | YES | LLM navigation |
| Routing table | YES | Task dispatch |
| Global Rules | YES | Cross-cutting constraints |
| `.ai/` reference | YES | SSOT location |
| `dev-docs/` reference | YES | Task documentation system |

### What to add

From the blueprint (`init/_work/project-blueprint.json`, legacy: `init/project-blueprint.json`):

| Add | Source field | Example |
|-----|--------------|---------|
| Project Type | `project.name`, `project.description` | "my-app - E-commerce platform" |
| Tech Stack table | `repo.language`, `repo.packageManager`, `repo.layout` | TypeScript, pnpm, monorepo |
| Enabled capabilities | `capabilities.frontend.enabled`, etc. | frontend, backend, database |
| Project directories | derived from `repo.layout` | `apps/`, `packages/` or `src/` |

### How to update

Use `update-agents` (idempotent). It will:
- Replace the template intro line (when present) with a project summary
- Upsert `## Project Type` and `## Tech Stack` from the blueprint
- Update the `## Key Directories` table by inserting project code directories first (preserving template rows and any custom rows)

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
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs cleanup-init \
  --repo-root . --apply --i-understand
```

**Option B: Archive to `docs/project/overview/` + remove `init/`** (recommended if maintaining docs)

```bash
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs cleanup-init \
  --repo-root . --apply --i-understand --archive
```

Safety: `cleanup-init --apply` refuses when the init state indicates an incomplete stage. Override (not recommended):

```bash
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs cleanup-init --repo-root . --apply --i-understand --force
```

Archive path SSOT: See `init/_tools/skills/initialize-project-from-requirements/SKILL.md` for details.

The command archives Stage A docs and blueprint to `docs/project/overview/`, then removes `init/`.
Init state is removed (not archived).

**Selective archive options:**
- `--archive` - Archive all (Stage A docs + blueprint)
- `--archive-docs` - Archive Stage A docs only
- `--archive-blueprint` - Archive blueprint only

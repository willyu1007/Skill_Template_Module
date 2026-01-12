# Agent guidance for the init kit

The repository includes an `init/` bootstrap kit that is intended to be executed in a **checkpointed** manner.

Key principles:

- Do not skip stages.
- Do not advance stages without explicit user approval.
- Do not hand-edit `init/.init-state.json` to change stages; use the pipeline commands.

## Init workflow rules

1. **No workdocs during initialization**: Do NOT create workdocs task bundles during the init workflow. The init pipeline has its own state tracking (`init/.init-state.json`). Workdocs are for post-init development tasks only.
2. **Stage-by-stage validation**: Every stage must pass validation before advancing.
3. **User approval required**: Each stage transition requires explicit user approval.

---

## Canonical command entry point

Run from repo root:

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs <command> [options]
```

---

## Stage flow (validation + approval)

### Phase 0.5 — Domain glossary alignment (optional, before Stage A)

Before starting Stage A requirements interview, ask the user:

```
Before we define requirements, would you like to align on key domain terms?

This helps ensure we use consistent terminology throughout the project.
If yes, I'll help you build a domain glossary (domain-glossary.md).

[Yes / Skip for now]
```

**If user says Yes**:
1. Ask for key domain terms (3-10 terms):
   - "What are the key business/domain terms in this project?"
   - For each term: "How would you define <term>? Any synonyms or non-examples?"
2. Write to `init/stage-a-docs/domain-glossary.md`
3. Continue to Stage A

**If user says Skip**:
- Continue to Stage A (`domain-glossary.md` will still be created by `start` and can be filled later)

This step is **MustAsk but not blocking** — user can skip and fill in later.

### Stage A (requirements docs)
1) Run start to create templates:
```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs start --repo-root .
```

The command automatically creates:
- `init/stage-a-docs/requirements.md`
- `init/stage-a-docs/non-functional-requirements.md`
- `init/stage-a-docs/domain-glossary.md`
- `init/stage-a-docs/risk-open-questions.md`
- `init/project-blueprint.json`

2) Fill in the Stage A docs, then validate:
```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs check-docs --strict
```

3) After user approval:
```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs approve --stage A --repo-root .
```

### Stage B (blueprint)
1) Edit `init/project-blueprint.json`, then validate:
```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs validate
```

2) After user approval:
```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs approve --stage B --repo-root .
```

### Stage C (apply)
Apply scaffold/configs/skill packs/wrapper sync:

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs apply --providers both
```

After user approval:
```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs approve --stage C --repo-root .
```

---

## Core notes (context system)

In the module-first template, the context system is **built-in** (not an add-on):

- `docs/context/project.registry.json` (SSOT)
- `modules/<module_id>/interact/registry.json` (SSOT)
- `docs/context/registry.json` (derived)
- Scripts: `contextctl.js`, `projectctl.js`

The init pipeline will treat context as **enabled by default** and will:

- initialize project state via `projectctl.js`
- initialize/build context via `contextctl.js`

If you explicitly disable context in a blueprint (for unusual use cases), you can set:

```json
{
  "addons": {
    "contextAwareness": false
  }
}
```

The setting will skip context-related steps, but the files remain present (core capability).

## Add-on default behavior

All optional add-ons are **enabled by default** (opt-out model):

| Add-on | Key | Purpose |
|--------|-----|---------|
| Packaging | `packaging` | Container/artifact build |
| Deployment | `deployment` | Multi-environment deploy |
| Release | `release` | Version/changelog management |
| Observability | `observability` | Metrics/logs/traces contracts |

The LLM should ask: "Do you want to **disable** any add-ons?" (not "enable").

To disable an add-on in the blueprint:

```json
{
  "addons": {
    "packaging": false
  }
}
```

## Post-init documentation update (README.md + AGENTS.md)

After Stage C `apply` completes, update **both** `README.md` and `AGENTS.md` together.

### README.md update

Update the root `README.md` with project-specific information:
- Project name and description
- Tech stack summary
- Quick start instructions
- Key scripts / commands

### AGENTS.md update

Update `AGENTS.md` with:
- Tech Stack table
- Enabled Add-ons table

**Insert position**: Before `## Key Directories`, preserve all existing content.

See `skills/initialize-project-from-requirements/templates/llm-init-guide.md` Phase 6 for detailed template.

---

## Post-init skill retention

After documentation update, present a skill retention table so the user can decide which skills to keep.

### Flow

1. **Generate retention table**: Create `init/skill-retention-table.md` from `templates/skill-retention-table.template.md`, listing all skills from `.ai/skills/` with descriptions (translate to user's language if needed).

2. **User review**: Ask the user to review the table and list skills they want to delete.

3. **Preview deletion**: Run with `--dry-run` first:
   ```bash
   node .ai/scripts/delete-skills.cjs --skills "<csv-list>" --dry-run
   ```

4. **Execute deletion**: After user confirms the preview:
   ```bash
   node .ai/scripts/delete-skills.cjs --skills "<csv-list>" --yes
   ```

5. **Sync wrappers**: After deletion, regenerate provider wrappers:
   ```bash
   node .ai/scripts/sync-skills.cjs --scope current --providers both
   ```

### Notes

- If multiple skills share the same name, use the full path (e.g., `workflows/agent/agent_builder`).
- The `agent_builder` skill can be removed via this flow if the project does not need agent proxy scaffolding.

See `skills/initialize-project-from-requirements/templates/llm-init-guide.md` Phase 7 for detailed flow.

---

## Add-ons directory cleanup (after completion)

After Stage C approval (`approve --stage C`) and skill retention is finalized, ask the user whether to keep the add-on source directory `addons/`.

If the user chooses to remove it:

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs cleanup-addons --repo-root . --apply --i-understand
```

## Cleanup

Only after completion and user confirmation:

**Option A: Remove `init/` only (no archive)**

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs cleanup-init --repo-root . --apply --i-understand
```

**Option B: Archive to docs/project/ then remove `init/`** (recommended)

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs cleanup-init \
  --repo-root . \
  --apply \
  --i-understand \
  --archive
```

The command archives Stage A docs and Blueprint to `docs/project/` before deleting `init/`.

**Option C: Archive + prune unused add-ons**

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs cleanup-init \
  --repo-root . \
  --apply \
  --i-understand \
  --archive \
  --cleanup-addons
```

### Archive options

| Option | Effect |
|--------|--------|
| `--archive` | Archive all (Stage A docs + Blueprint) to `docs/project/` |
| `--archive-docs` | Archive Stage A docs only |
| `--archive-blueprint` | Archive Blueprint only |

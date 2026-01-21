# Stage Checkpoints (Mandatory User Approval)

> **SSOT**: For the complete command reference, see `../SKILL.md`.
> This document focuses specifically on checkpoint rules and approval workflow.

This init kit enforces a strict checkpoint policy:

- Every stage transition requires **explicit user approval**
- Do not "assume approval"
- Do not move to the next stage until the user clearly says: "approved / yes / go ahead / continue / ok" (or equivalent)

> **Note**: During initialization, working files are stored in `init/` directory:
> - Stage A docs: `init/stage-a-docs/`
> - Blueprint: `init/project-blueprint.json`
> 
> After completion, use `cleanup-init --archive` to move them to `docs/project/`.

The **technical mechanism** to advance stages is:

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs approve --stage <A|B|C> --repo-root .
```

---

## Checkpoint A → B: Requirements complete

### Preconditions

All of the following must be true:

1. Stage A docs exist under `init/stage-a-docs/`:
   - `requirements.md`
   - `non-functional-requirements.md`
   - `domain-glossary.md`
   - `risk-open-questions.md`
2. Docs pass validation:
   ```bash
   node init/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs check-docs --repo-root . --strict
   ```
3. The user reviews the docs and explicitly approves Stage A.

Optional (recommended): record the Stage A must-ask checklist to keep the state board accurate:

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs mark-must-ask \
  --repo-root . \
  --key onePurpose \
  --asked \
  --answered \
  --written-to init/stage-a-docs/requirements.md
```

See `init/skills/initialize-project-from-requirements/reference.md` for the full key list.

### Action

Record approval and advance to Stage B:

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs approve --stage A --repo-root .
```

---

## Checkpoint B → C: Blueprint approved

### Preconditions

1. `init/project-blueprint.json` exists
2. Blueprint passes validation:
   ```bash
   node init/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs validate --repo-root .
   ```
3. The user reviews the blueprint and explicitly approves Stage B.

Optional (recommended): record that packs were reviewed:

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs review-packs --repo-root .
```

### Action

Record approval and advance to Stage C:

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs approve --stage B --repo-root .
```

---

## Checkpoint C → Complete: Apply results accepted

### Preconditions

1. Stage C `apply` has been executed successfully:
   ```bash
   node init/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs apply --repo-root . --providers both
   ```
2. The user reviews the resulting changes (scaffold/configs/packs/wrappers/`README.md`) and explicitly approves.

### Action

Record approval and mark init complete:

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs approve --stage C --repo-root .
```

### Post-init options

After Stage C approval, explicitly ask whether to record key project facts in `AGENTS.md`, then present options:

> Do you want to record the project type, tech stack, and key directories in the root `AGENTS.md`? Reply `"update agents"` to proceed, or reply `"done"` to skip.

| User reply | Action |
|------------|--------|
| `"update agents"` | Update root `AGENTS.md` with project info (recommended) |
| `"cleanup init"` | Archive docs and remove the init kit |
| `"done"` | Complete initialization without further changes |

**If user says "update agents"**:

1. Read current root `AGENTS.md`
2. Preserve template repo structure (Key Directories, Routing, Global Rules, `.ai/` reference, `dev-docs/` reference)
3. Add project-specific info from blueprint:
   - Replace template intro paragraph + update Project Type section body (`project.name` + `project.description`)
   - Tech Stack table (`repo.language`, `repo.packageManager`, `repo.layout`, frameworks)
   - Update Key Directories with project-specific paths
4. Ensure idempotency: do NOT create duplicate sections/tables on re-run
5. Follow LLM-friendly doc rules: moderate semantic density, structured tables, token-efficient
6. Show diff to user before applying

Optional: remove the bootstrap kit (only after completion and user confirmation):

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs cleanup-init --repo-root . --apply --i-understand --archive
```

---

## State recovery

If a session is interrupted:

1. Check for existing state:
   - `init/.init-state.json`
2. Use `status` to see the current stage:
   ```bash
   node init/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs status --repo-root .
   ```
3. Use `advance` to see the next checkpoint action:
   ```bash
   node init/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs advance --repo-root .
   ```

Note:
- The state file is stored under `init/` and is intended as working data for initialization.
- Once the init kit is removed via `cleanup-init`, the state will be deleted as well.

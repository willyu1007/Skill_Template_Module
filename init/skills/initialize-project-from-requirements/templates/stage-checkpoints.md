# Stage Checkpoints (Mandatory User Approval)

This init kit enforces a strict checkpoint policy:

- Every stage transition requires **explicit user approval**
- Do not “assume approval”
- Do not move to the next stage until the user clearly says: “approved / 继续 / 可以 / yes / go ahead” (or equivalent)

The **technical mechanism** to advance stages is:

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs approve --stage <A|B|C> --repo-root .
```

---

## Checkpoint A → B: Requirements complete

### Preconditions

All of the following must be true:

1. Stage A docs exist under `docs/project/`:
   - `requirements.md`
   - `non-functional-requirements.md`
   - `domain-glossary.md`
   - `risk-open-questions.md`
2. Docs pass validation:
   ```bash
   node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs check-docs --repo-root . --docs-root docs/project --strict
   ```
3. The user reviews the docs and explicitly approves Stage A.

Optional (recommended): record the Stage A must-ask checklist to keep the state board accurate:

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs mark-must-ask \
  --repo-root . \
  --key onePurpose \
  --asked \
  --answered \
  --written-to docs/project/requirements.md
```

See `init/skills/initialize-project-from-requirements/reference.md` for the full key list.

### Action

Record approval and advance to Stage B:

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs approve --stage A --repo-root .
```

---

## Checkpoint B → C: Blueprint approved

### Preconditions

1. `docs/project/project-blueprint.json` exists
2. Blueprint passes validation:
   ```bash
   node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs validate --repo-root . --blueprint docs/project/project-blueprint.json
   ```
3. The user reviews the blueprint and explicitly approves Stage B.

Optional (recommended): record that packs were reviewed:

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs review-packs --repo-root .
```

### Action

Record approval and advance to Stage C:

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs approve --stage B --repo-root .
```

---

## Checkpoint C → Complete: Apply results accepted

### Preconditions

1. Stage C `apply` has been executed successfully:
   ```bash
   node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs apply --repo-root . --blueprint docs/project/project-blueprint.json --providers both
   ```
2. The user reviews the resulting changes (scaffold/configs/packs/wrappers) and explicitly approves.

### Action

Record approval and mark init complete:

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs approve --stage C --repo-root .
```

Optional: remove the bootstrap kit (only after completion and user confirmation):

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs cleanup-init --repo-root . --apply --i-understand
```

---

## State recovery

If a session is interrupted:

1. Check for existing state:
   - `init/.init-state.json`
2. Use `status` to see the current stage:
   ```bash
   node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs status --repo-root .
   ```
3. Use `advance` to see the next checkpoint action:
   ```bash
   node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs advance --repo-root .
   ```

Note:
- The state file is stored under `init/` and is intended as working data for initialization.
- Once the init kit is removed via `cleanup-init`, the state will be deleted as well.

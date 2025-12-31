# Stage A: Requirements (DoD-driven)

## Goal

Produce a verifiable set of requirement documents under `init/stage-a-docs/`.

## Outputs (files)

- `init/stage-a-docs/requirements.md`
- `init/stage-a-docs/non-functional-requirements.md`
- `init/stage-a-docs/domain-glossary.md`
- `init/stage-a-docs/risk-open-questions.md`

Templates:
- `init/skills/initialize-project-from-requirements/templates/`

> **Note**: Run `start` command first to auto-create these template files.

## Verification

From repo root:

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs check-docs \
  --repo-root .
```

Strict gate (treat warnings as errors):

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs check-docs \
  --repo-root . \
  --strict
```

> Default `--docs-root` is `init/stage-a-docs`.

## State tracking (recommended)

Use `mark-must-ask` to keep the must-ask checklist updated in `init/.init-state.json`:

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs mark-must-ask \
  --repo-root . \
  --key onePurpose \
  --asked \
  --answered \
  --written-to init/stage-a-docs/requirements.md
```

See `init/skills/initialize-project-from-requirements/reference.md` for the full key list.

## User approval checkpoint (advance to Stage B)

After the user explicitly approves the Stage A documents:

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs approve --stage A --repo-root .
```

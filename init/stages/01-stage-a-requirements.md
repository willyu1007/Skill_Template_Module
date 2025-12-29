# Stage A: Requirements (DoD-driven)

## Goal

Produce a verifiable set of requirement documents under `docs/project/`.

## Outputs (files)

- `docs/project/requirements.md`
- `docs/project/non-functional-requirements.md`
- `docs/project/domain-glossary.md`
- `docs/project/risk-open-questions.md`

Templates:
- `init/skills/initialize-project-from-requirements/templates/`

## Verification

From repo root:

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs check-docs \
  --repo-root . \
  --docs-root docs/project
```

Strict gate (treat warnings as errors):

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs check-docs \
  --repo-root . \
  --docs-root docs/project \
  --strict
```

## State tracking (recommended)

Use `mark-must-ask` to keep the must-ask checklist updated in `init/.init-state.json`:

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs mark-must-ask \
  --repo-root . \
  --key onePurpose \
  --asked \
  --answered \
  --written-to docs/project/requirements.md
```

See `init/skills/initialize-project-from-requirements/reference.md` for the full key list.

## User approval checkpoint (advance to Stage B)

After the user explicitly approves the Stage A documents:

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs approve --stage A --repo-root .
```

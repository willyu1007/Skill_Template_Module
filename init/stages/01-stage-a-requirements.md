# Stage A: Requirements (DoD-driven)

> **SSOT**: For the complete command reference, see `init/skills/initialize-project-from-requirements/SKILL.md`.

## Goal

Produce a verifiable set of requirement documents.

> **Working location**: `init/stage-a-docs/` (created by the `start` command)
> 
> **Final location**: `docs/project/` (archived by `cleanup-init --archive`)

## Pre-step (must-ask): Terminology alignment

See: `init/stages/00-preflight-terminology.md`.

Before drafting the Stage A docs, ask the user:
- whether they want to **sync/align terminology now**
- or **skip** and proceed

If they choose to sync, treat `init/stage-a-docs/domain-glossary.md` as the terminology SSOT and align terms used in `requirements.md`.
If they choose to skip, record the decision in `init/stage-a-docs/domain-glossary.md` and proceed.

## Outputs (files)

During initialization (working location):

- `init/stage-a-docs/requirements.md`
- `init/stage-a-docs/non-functional-requirements.md`
- `init/stage-a-docs/domain-glossary.md`
- `init/stage-a-docs/risk-open-questions.md`

Templates:
- `init/skills/initialize-project-from-requirements/templates/`

## Verification

From repo root:

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs check-docs \
  --repo-root .
```

Strict gate (treat warnings as errors):

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs check-docs \
  --repo-root . \
  --strict
```

## State tracking (recommended)

Use `mark-must-ask` to keep the must-ask checklist updated in `init/.init-state.json`:

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs mark-must-ask \
  --repo-root . \
  --key terminologyAlignment \
  --asked \
  --answered \
  --written-to init/stage-a-docs/domain-glossary.md
```

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs mark-must-ask \
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
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs approve --stage A --repo-root .
```

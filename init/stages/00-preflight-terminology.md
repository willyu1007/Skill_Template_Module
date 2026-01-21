# Preflight (before Stage A): Terminology alignment (optional action, must-ask question)

> **SSOT**: For init commands and state keys, see `init/skills/initialize-project-from-requirements/SKILL.md`.

## When to run

- After `start` has created `init/stage-a-docs/`, and before drafting Stage A docs.

If `init/stage-a-docs/` does not exist yet, run:

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs start --repo-root .
```

## Goal

Decide whether to align/confirm domain terminology up front.

## Must-ask question

Ask:
- "Do you want to align/confirm project terminology now?"

Outcomes:
- **Sync**: Use `init/stage-a-docs/domain-glossary.md` as the SSOT and align terms across Stage A docs.
- **Skip**: Record "skip terminology sync for now" in `init/stage-a-docs/domain-glossary.md` (under `## Purpose`) and continue to Stage A.

## State tracking (recommended)

Record the question as asked/answered:

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs mark-must-ask \
  --repo-root . \
  --key terminologyAlignment \
  --asked \
  --answered \
  --written-to init/stage-a-docs/domain-glossary.md
```

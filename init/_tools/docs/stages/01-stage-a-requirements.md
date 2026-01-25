# Stage A: Requirements

> **SSOT**: `init/_tools/skills/initialize-project-from-requirements/SKILL.md`

## Goal

Produce a verifiable set of requirement documents under `init/_work/stage-a-docs/`.

## Quick reference

| Task | Command |
|------|---------|
| Validate docs | `npm run init:check-docs` |
| Mark must-ask | `node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs mark-must-ask --repo-root . --key <key> --asked --answered --written-to <path>` |
| Approve | `npm run init:approve-a` |

## Outputs

- `init/_work/stage-a-docs/requirements.md`
- `init/_work/stage-a-docs/non-functional-requirements.md`
- `init/_work/stage-a-docs/domain-glossary.md`
- `init/_work/stage-a-docs/risk-open-questions.md`

## Pre-step: Terminology alignment

See `00-preflight-terminology.md`. Ask the user whether to sync terminology now or skip.

## Must-ask checklist

The must-ask keys are defined in `reference.md`. Complete the checklist before approval (or bypass with `--skip-must-ask`).

## Checkpoint

After user explicitly approves Stage A documents, advance to Stage B.

See SKILL.md for complete workflow and command options.

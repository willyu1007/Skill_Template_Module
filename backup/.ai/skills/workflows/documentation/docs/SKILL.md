---
name: docs
description: Router skill for documentation work: author developer docs, create a workdocs task plan, or update workdocs for handoff/archival with progressive disclosure.
---

# Docs (workflow router)

## Purpose
Select the correct documentation workflow (authoring vs planning vs handoff) and enforce portability and verifiability.

## When to use
Use this skill when you need to:
- Write or update developer-facing documentation
- Create a repeatable workdocs bundle for a task
- Update workdocs for handoff, context recovery, or archival

## Operating mode (governor)
- Select **exactly one** workflow below.
- After selecting, invoke the chosen workflow skill and follow it end-to-end.

## Routing (pick one)

| If you need... | Use this workflow skill |
|---|---|
| Author or update developer documentation (guides, APIs, runbooks) | `author-developer-documentation` |
| Create a new workdocs task bundle (overview/plan/architecture/notes/verification/pitfalls) | `create-workdocs-plan` |
| Update an existing workdocs bundle for handoff or archive | `update-workdocs-for-handoff` |

## Shared non-negotiables
1) **Progressive disclosure**
   - Keep top-level docs short; move deep detail into `reference/`, `examples/`, and `templates/`.

2) **No secrets**
   - Do not include credentials, tokens, or internal-only URLs.

3) **Actionable verification**
   - Every doc set must include concrete verification steps (commands/checks + expected results).

## Steps
1. Identify whether the intent is: (a) write docs, (b) start a task workdocs bundle, or (c) handoff/update.
2. Select exactly one workflow from the routing table.
3. State the selection explicitly.
4. Invoke the selected workflow skill and execute it end-to-end.

## Verification
- [ ] Exactly one workflow was selected and executed
- [ ] Outputs use progressive disclosure (examples/templates for long content)
- [ ] Verification steps are concrete and reproducible
- [ ] No secrets or sensitive URLs were included

## Boundaries
- MUST NOT mix multiple documentation workflows in the same execution pass
- MUST NOT include secrets/credentials/tokens in documentation
- MUST NOT publish unverifiable instructions

## Included assets
- None (router only).

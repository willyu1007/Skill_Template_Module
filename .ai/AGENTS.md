# `.ai/` Directory Guide (LLM-first)

## Conclusions (read first)

- `.ai/` stores AI/LLM workflow source content: skills, commands, templates, and maintenance scripts.
- AI/LLM MUST treat `.ai/skills/` as the Single Source of Truth (SSOT). `.codex/` and `.claude/` are synced wrappers/entry stubs and MUST NOT be edited directly.
- AI/LLM MUST NOT traverse any `.ai/` subdirectories (no recursive listing/grepping). Context loading is allowed only via guided, path-driven progressive disclosure (see "Context Loading").
- Documentation under `.ai/` MUST follow `.ai/skills/standards/documentation-guidelines/SKILL.md`.

## Directory Overview

- `.ai/skills/`: SSOT for skills and workflows (entry point is each skill's `SKILL.md`).
- `.ai/scripts/`: maintenance scripts (for example `node .ai/scripts/sync-skills.cjs`).
- `.ai/AGENTS.md`: this file; defines `.ai/` navigation and constraints.

## Context Loading (guided; no traversal)

AI/LLM MUST:
- Read `.ai/AGENTS.md` first, then open a single target file using an explicitly provided path.
- Open files in subdirectories only when the user specifies the path, or when an already-opened doc references the path explicitly.

AI/LLM MUST NOT:
- Use recursive enumeration/search to "discover" content, for example `Get-ChildItem -Recurse .ai`, `rg --files .ai`, or `tree .ai`.
- Bulk-open many files to "scan the folder"; if paths are missing, ask the user for the exact relative path first.

AI/LLM SHOULD:
- When the user provides intent but no path, request a repo-relative path (for example `.ai/skills/.../SKILL.md` before proceeding.

## Verification (How to verify)

- Inspect the `.ai/` top-level structure (non-recursive): `Get-ChildItem .ai` (PowerShell) or `ls .ai` (POSIX shell).
- Sync provider wrappers (overwrites generated artifacts): `node .ai/scripts/sync-skills.cjs`.
  - Blast radius: `.codex/skills/` and `.claude/skills/` are regenerated.
  - Idempotency: repeated runs with the same `.ai/skills/` input should produce the same stubs.
  - Rollback: restore `.codex/` / `.claude/` from VCS, or fix `.ai/skills/` and re-run the sync script.

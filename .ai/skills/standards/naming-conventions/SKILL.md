---
name: naming-conventions
description: Apply consistent naming conventions for directories, files, and identifiers - covers kebab-case rules, SSOT layout, and skill naming standards.
---

# Naming Conventions

## Purpose

Define naming conventions for directories, files, and identifiers with these goals:
- **Scriptability**: scripts can locate files reliably with fewer branches
- **Portability**: cross OS/IDE moves should require zero or minimal renaming
- **Readability**: humans and LLMs can infer purpose and scope from names

## When to use

Use this skill when:
- Creating new directories or files
- Naming skills, workflows, or commands
- Reviewing code for naming consistency
- Setting up CI checks for naming standards

## Inputs

- The item to name (directory, file, skill, identifier)
- Context (SSOT content, provider stubs, general repo files)

## Outputs

- Correctly named items following conventions
- Validation results for existing names


## Steps
1. Identify what you are naming (file, directory, module, component, hook, API surface, configuration key, or data entity).
2. Choose the most relevant convention section below and follow the MUST rules first.
3. Propose 2–3 candidates and select the one that matches existing local conventions and avoids ambiguous abbreviations.
4. Apply the chosen name consistently across declarations and references (imports, exports, docs, and tests).
5. Verify that the resulting names are searchable, unambiguous, and do not collide with existing names.

## Global Rules (MUST)

- Use **kebab-case** (lowercase + hyphens) by default: `skill-name`, `sync-skills`
- Avoid spaces and special characters (except `.`-prefixed directories)
- Recommended charset: `[a-z0-9-._]`
- Directory names express "scope/role"; file names express "type/content"
- Avoid non-maintainable buckets like `misc/` or `temp/`

## Directory Layout (MUST)

### SSOT Root

- SSOT root is fixed: `.ai/`
- SSOT subdirectories:
  - `.ai/skills/` (skills and workflows live here)
  - `.ai/scripts/` (maintenance scripts)
  - `.ai/rules/` (if using rules)

### Skill Entry Stubs

- Entry stub roots are fixed:
  - `.codex/skills/`
  - `.claude/skills/`

Notes:
- Stubs contain only `SKILL.md` pointers back to `.ai/skills/`
- Do not edit stub directories directly; regenerate with `.ai/scripts/sync-skills.cjs`

### Other Top-Level Directories (Recommended)

- `docs/project/`: project-specific documentation (requirements, blueprints)
- `scripts/`: script entrypoints (cross-platform can share the same base name with different suffixes)
- `init/`: bootstrap materials (if present)

## Skill Naming (MUST)

### Skill Directory

- Path: `.ai/skills/.../<skill-name>/SKILL.md` (taxonomy directories are allowed)
- `<skill-name>`: kebab-case; encode capability/domain/tool
- Avoid ambiguous names

Examples:
- `skill-creator`
- `repo-init`
- `doc-style-guide`

### Skill Name Field

- The `name` in SKILL.md frontmatter MUST match the **leaf** directory name
- Use capability-oriented names (verb + domain/tool)

### Supporting Files

- Use kebab-case or snake_case for filenames
- Allowed: `reference.md`, `examples.md`, `scripts/`, `templates/`
- Forbidden: `resources/` subdirectory

## Workflow Naming

- Workflows are stored as skills
- Name by intent/process: `refactor-planner`, `release-checklist`
- Path: `.ai/skills/.../<workflow-name>/SKILL.md`

## Versioning and Changes (SHOULD)

- Prefer explicit version fields / change logs for SSOT content
- If the directory structure changes, update all of:
  - Naming conventions documentation
  - Path constants/mappings in `.ai/scripts/`
  - Usage examples in `README.md`

## Verification

Check naming compliance:
- All directories use kebab-case
- No spaces or special characters in names
- Skill `name` field matches directory name
- No `resources/` directories under skills

## Boundaries

- Do NOT use spaces in directory or file names
- Do NOT create `misc/`, `temp/`, or similar catch-all directories
- Do NOT use uppercase in directory names (except for special files like `SKILL.md`, `README.md`)

## Included assets

None.

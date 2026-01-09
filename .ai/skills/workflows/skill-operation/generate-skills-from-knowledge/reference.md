# Reference: Converting Knowledge Docs into Agent Skills

## Goal
Turn “knowledge documents” (guides, runbooks, standards, architecture notes) into **capability-oriented** skills that an agent can select via the `description` signal and execute via the `Steps` section.

## Key decisions (apply in the listed order)
1. **Discovery-first**: the first sentence (`description`) must help an agent decide “use me now”.
2. **One intent per skill**: if a user can reasonably ask for two different things, split into two skills.
3. **Progressive disclosure**: keep `SKILL.md` short; move depth into `reference.md`, `examples/`, `templates/`.
4. **Portability by default**: remove provider- and repo-specific coupling unless explicitly required.

## Skill identification heuristic
A good skill is typically centered on one of these:
- a repeatable workflow (“debug X”, “migrate Y”, “write Z spec”)
- a concrete artifact (“generate a config”, “produce a report”, “create a test plan”)
- a bounded domain action (“add middleware”, “validate input”, “instrument tracing”)

Signals that a source doc should be split:
- multiple “How to …” sections with different objects
- multiple audiences (developer vs SRE vs PM)
- step sequences that share little overlap
- heavy branching (“if A then … else …”) that can be separated by trigger

Signals that multiple source docs should be merged:
- same trigger and same output, different phrasing
- one doc is prerequisites/background, another is procedure

## Writing a high-signal `description`
The description should:
- start with an action verb (“Generate…”, “Convert…”, “Debug…”, “Validate…”)
- include a discriminating noun phrase (“skills bundle”, “API route”, “deployment manifest”)
- include at least one trigger phrase that a user might say
- avoid internal jargon unless the terminology is stable and shared

Examples (style, not content):
- “Generate an API smoke-test plan for authenticated routes.”
- “Convert Markdown runbooks into portable Agent Skills.”

## Converting source content: what goes where
### `SKILL.md` (keep short)
Keep only:
- purpose + when-to-use triggers
- required inputs and expected outputs
- a numbered procedure that an agent can execute
- boundaries and verification

### `reference.md`
Put:
- rationale, tradeoffs
- fuller explanation of edge cases
- alternative approaches
- extended checklists

### `examples/`
Put:
- scenario-specific examples (one scenario per file)
- “good/bad” examples for prompts and outputs
- minimal but copy/pasteable samples

### `templates/`
Put:
- skeletons for outputs (report outline, checklist, config stub)
- reusable snippets (schema, folder layout stubs)
- anything intended to be copied and filled

## Portability and sanitization checklist
When converting from repo-specific or provider-specific docs:
- Replace hard-coded paths with **placeholders** (e.g., `<repo_root>`, `<skills_root>`).
- Replace script names with **functional descriptions** unless the script is shipped with the skill.
- Remove tool/platform instructions that require a specific vendor, unless you keep them under “Optional provider notes”.
- Remove cross-skill links (“See also”, “Related docs”). Skills should be discoverable without reading chains.

## A plan file is the contract
The conversion plan is intended to be produced by an agent (or a human) and then applied by the helper script.

Principles:
- the plan is **reviewable** before any write happens
- the plan enumerates the blast radius (directories/files that will be created)
- the plan explicitly records split/merge decisions and rationale

## Minimal prompt template (for any LLM)
Use the template when asking an LLM to generate or refine a plan:

Goal:
- Convert the provided knowledge docs into a provider-agnostic Agent Skills bundle.

Inputs:
- Source docs: <list paths>
- Constraints: <portability constraints>
- Target taxonomy: <tier1/tier2 or none>

Constraints (MUST / DON'T):
- MUST follow the SKILL.md format (YAML frontmatter with name/description).
- MUST keep SKILL.md short and move detail into examples/templates/reference.
- DON'T include cross-skill references.
- DON'T keep provider-specific instructions unless explicitly required.

Acceptance criteria:
- Each skill directory has SKILL.md and an unambiguous description.
- Examples/templates extracted into subfolders as appropriate.
- Lint passes with no errors.

## Suggested review workflow
1. Review the plan JSON for naming, taxonomy, and blast radius.
2. Run `apply`.
3. Edit generated skills.
4. Run `lint`.
5. Package (optional).

---

# Skill Authoring Standards

The section defines the skill authoring standard for the repository.

## Source of Truth (SSOT)

- You MUST edit skills only in `.ai/skills/`
- You MUST NOT edit `.codex/skills/` or `.claude/skills/` directly
- After adding or updating a skill, you MUST sync stubs:
  - Full sync (reset): `node .ai/scripts/sync-skills.cjs --scope current --providers both --mode reset --yes`
  - Incremental (one skill): `node .ai/scripts/sync-skills.cjs --scope specific --skills <skill-name> --mode update`

## Naming and Layout

### Naming (MUST)

- Skill leaf directory name MUST be kebab-case: `.ai/skills/.../<skill-name>/`
- The skill `name` in `SKILL.md` MUST match the **leaf** directory name
- Use a capability-oriented name (verb + domain/tool) and avoid ambiguous names

### Layout (MUST)

Required:
- `.ai/skills/.../<skill-name>/SKILL.md` (taxonomy directories are allowed)

Optional supporting files (recommended for progressive disclosure):
- `<skill-dir>/reference.md`
- `<skill-dir>/examples.md`
- `<skill-dir>/scripts/`
- `<skill-dir>/templates/`

Forbidden:
- You MUST NOT create `.ai/skills/<skill-name>/resources/`

## SKILL.md Format

### Frontmatter (MUST)

`SKILL.md` MUST begin with YAML frontmatter:

```yaml
---
name: skill-name
description: One sentence that helps the agent choose the skill.
---
```

Rules:
- `name` MUST be stable (changing it breaks discovery and references)
- `description` MUST be high-signal: include trigger phrases and when-to-use guidance
- Keep frontmatter compatible across platforms: use only widely supported keys unless you have a strong reason

### Optional Frontmatter Keys (SHOULD be used sparingly)

- Codex supports an optional `metadata` section (for example `metadata.short-description`)
- Claude Code supports `allowed-tools` to restrict tool access for that skill

If you use platform-specific keys (like `allowed-tools`), you MUST ensure the skill remains correct even if another platform ignores that key.

### Body Structure (SHOULD)

Write the Markdown body to be executable and token-efficient. Recommended sections:

1. `# <Human Readable Title>`
2. `## Purpose` (1-2 sentences)
3. `## When to use` (bullet triggers; include negative triggers if important)
4. `## Inputs` (what the user must provide; file paths; required context)
5. `## Outputs` (expected artifacts, file changes, or reports)
6. `## Steps` (numbered, imperative, minimal ambiguity)
7. `## Boundaries` (MUST NOT / SHOULD NOT; safety constraints)
8. `## References` (relative links to `reference.md`, `examples.md`, etc.)

## Progressive Disclosure and Size Limits

- `SKILL.md` MUST be <= 500 lines
- Put deep explanations in `reference.md` and keep `SKILL.md` focused on:
  - triggers
  - inputs/outputs
  - step-by-step procedure
  - constraints and verification

## Examples and Scripts

- Examples SHOULD be small and copy-pasteable
- If a skill requires executable helpers, place them under `scripts/` and document:
  - prerequisites (runtime, dependencies)
  - exact commands to run
  - expected output

## Language and Encoding

- Skill docs in `.ai/skills/` SHOULD be written in English for consistency and portability
- Use plain ASCII punctuation where possible to avoid encoding/display issues across environments

## Verification Checklist

Before finishing a skill change:
- `SKILL.md` has valid YAML frontmatter with `name` and `description`
- The directory name matches `name`
- No `resources/` directory exists under the skill
- `SKILL.md` is <= 500 lines and uses progressive disclosure
- `node .ai/scripts/sync-skills.cjs` has been run and stubs are up to date

## Syncing Notes

- Stub generation discovers skills by recursively finding `SKILL.md` under `.ai/skills/`
- Provider stubs are flattened by skill `name` under `.codex/skills/<skill-name>/` and `.claude/skills/<skill-name>/`
- The "current collection" is configured via `.ai/skills/_meta/sync-manifest.json` and synced with:
- Provider stubs mirror the SSOT hierarchy under `.codex/skills/` and `.claude/skills/`
- The "current collection" is configured via `.ai/skills/_meta/sync-manifest.json` and synced with:
  - `node .ai/scripts/sync-skills.cjs --scope current --providers both --mode reset --yes`

---

# Skill Design Principles (borrowed from skill-creator)

This section provides additional design guidance for creating effective skills.

## Core Principles

### Concise is Key

The context window is a shared resource. Skills share context with system prompts, conversation history, other skills' metadata, and the actual user request.

**Default assumption: the LLM is already very smart.** Only add context the LLM doesn't already have. Challenge each piece of information:
- "Does the LLM really need the detail?"
- "Does the paragraph justify its token cost?"

Prefer concise examples over verbose explanations.

### Set Appropriate Degrees of Freedom

Match the level of specificity to the task's fragility and variability:

| Freedom Level | When to Use | Example |
|---------------|-------------|---------|
| **High** (text instructions) | Multiple approaches valid, decisions depend on context | "Choose an appropriate caching strategy based on data access patterns" |
| **Medium** (pseudocode/parameterized scripts) | Preferred pattern exists, some variation acceptable | "Use the provided template, adjust timeouts as needed" |
| **Low** (specific scripts, few parameters) | Operations are fragile, consistency is critical | "Run exactly: `python migrate.py --dry-run` first" |

Think of it as exploring a path: a narrow bridge with cliffs needs specific guardrails (low freedom), while an open field allows many routes (high freedom).

## Progressive Disclosure Design

Skills use a three-level loading system to manage context efficiently:

1. **Metadata (name + description)** - Always in context (~100 words)
2. **SKILL.md body** - When skill triggers (<5k words target)
3. **Bundled resources** - As needed (unlimited, can be executed without loading)

### Progressive Disclosure Patterns

Keep SKILL.md body to essentials and under 500 lines. Split content into separate files when approaching the line limit. When splitting, **always reference the split files from SKILL.md** so the reader knows they exist.

**Pattern 1: High-level guide with references**

```markdown
# PDF Processing

## Quick start
Extract text with pdfplumber:
[code example]

## Advanced features
- **Form filling**: See [reference.md#forms](reference.md#forms) for complete guide
- **API reference**: See [reference.md#api](reference.md#api) for all methods
```

**Pattern 2: Domain-specific organization**

For skills with multiple domains, organize by domain to avoid loading irrelevant context:

```
bigquery-skill/
├── SKILL.md (overview and navigation)
└── references/
    ├── finance.md (revenue, billing metrics)
    ├── sales.md (opportunities, pipeline)
    └── product.md (API usage, features)
```

When a user asks about sales metrics, the LLM only reads `sales.md`.

**Pattern 3: Variant-specific organization**

For skills supporting multiple frameworks:

```
cloud-deploy/
├── SKILL.md (workflow + provider selection)
└── references/
    ├── aws.md (AWS patterns)
    ├── gcp.md (GCP patterns)
    └── azure.md (Azure patterns)
```

### Important Guidelines

- **Avoid deeply nested references** - Keep references one level deep from SKILL.md
- **Structure longer reference files** - For files longer than 100 lines, include a table of contents at the top

## Bundled Resources

### scripts/

Executable code for tasks requiring deterministic reliability or repeatedly rewritten.

- **When to include**: Same code rewritten repeatedly, or deterministic reliability needed
- **Benefits**: Token efficient, deterministic, may be executed without loading into context

### references/

Documentation intended to be loaded as needed into context.

- **When to include**: Documentation the LLM should reference while working
- **Examples**: Database schemas, API docs, domain knowledge, company policies
- **Best practice**: If files are large (>10k words), include grep search patterns in SKILL.md
- **Avoid duplication**: Information should live in either SKILL.md or references, not both

### templates/

Reusable snippets and skeletons for outputs.

- **When to include**: Skeletons for outputs, reusable config stubs, folder layouts
- **Examples**: Report outlines, config templates, schema stubs

### What NOT to Include

A skill should only contain essential files. Do NOT create:
- README.md (use `SKILL.md` as the entry document)
- INSTALLATION_GUIDE.md
- CHANGELOG.md
- User-facing documentation (skills are for agents, not end users)

## Skill Creation Quick Reference

### From Scratch

Use the init script:

```bash
python .ai/skills/workflows/skill-operation/generate-skills-from-knowledge/scripts/init_skill.py <skill-name> --path <target-directory>
```

### From Knowledge Docs

1. Inventory source docs (in-scope vs out-of-scope)
2. Write a conversion plan mapping capabilities → skills
3. Apply the plan to scaffold skills
4. Move large examples into `examples/` and snippets into `templates/`
5. Lint until clean

### Iteration Workflow

1. Use the skill on real tasks
2. Notice struggles or inefficiencies
3. Identify how SKILL.md or resources should be updated
4. Implement changes and test again

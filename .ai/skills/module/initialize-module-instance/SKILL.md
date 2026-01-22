---
name: initialize-module-instance
description: Create a new module instance with modulectl, including a workdocs baseline, and register the module into the modular SSOT/derived registries.
---

# Initialize a Module Instance

## Purpose

Create a new module under `modules/<module_id>/` and ensure the module is correctly registered into:

- `.system/modular/instance_registry.yaml` (derived)
- `.system/modular/flow_impl_index.yaml` (derived)
- `docs/context/registry.json` (derived)

## Inputs

- `module_id` (required; recommended pattern: `^[a-z0-9][a-z0-9._-]{1,62}[a-z0-9]$`)
- `module_type` (optional; default: `service`)
- `description` (optional)

## Outputs

`modulectl init --apply` generates the following files:

| File | Purpose |
|------|---------|
| `modules/<module_id>/MANIFEST.yaml` | Module metadata (SSOT) |
| `modules/<module_id>/AGENTS.md` | Basic operating instructions (to be enhanced in step 4) |
| `modules/<module_id>/ABILITY.md` | Placeholder for responsibility boundaries |
| `modules/<module_id>/interact/registry.json` | Context artifacts registry (SSOT) |
| `modules/<module_id>/workdocs/README.md` | Workdocs usage instructions |
| `modules/<module_id>/workdocs/AGENTS.md` | Workdocs operating rules + resume checklist |
| `modules/<module_id>/workdocs/domain-glossary.md` | (Optional) Module-specific domain terms (if Step 0.5 completed) |
| `modules/<module_id>/src/` | Source code directory |
| `modules/<module_id>/tests/` | Test directory |
| `modules/<module_id>/config/` | Configuration directory |

- Updated derived registries and graphs

## Procedure

### Step 0.5 — Domain glossary alignment (optional)

Before running `modulectl init`, ask the user:

```
Would you like to define key domain terms for the module?

The glossary helps ensure consistent terminology within the module.
If yes, I'll help you build a module-specific domain glossary.

[Yes / Skip for now]
```

**If user says Yes**:
1. Ask for key domain terms (3-10 terms) specific to the module:
   - "What are the key domain terms for the module?"
   - For each term: "How would you define <term>?"
2. After module initialization completes, write to `modules/<module_id>/workdocs/domain-glossary.md`

**If user says Skip**:
- Proceed to Step 1 (no glossary created)

The domain glossary alignment step is **MustAsk but not blocking** — user can skip and fill in later.

### Step 1 — Initialize the module skeleton

```bash
node .ai/scripts/modules/modulectl.mjs init --module-id <module_id> --module-type <module_type> --description "<desc>" --apply
```

### Step 2 — Verify manifests and module-local SSOT

```bash
node .ai/scripts/modules/modulectl.mjs verify --strict
```

### Step 3 — Rebuild derived registries/graphs

```bash
node .ai/scripts/modules/modulectl.mjs registry-build
node .ai/scripts/modules/flowctl.mjs update-from-manifests
node .ai/scripts/modules/flowctl.mjs lint
node .ai/skills/features/context-awareness/scripts/contextctl.mjs build
```

### Step 4 — Documentation confirmation (Required)

After core initialization (steps 1–3) completes, ask the user:

```
Module initialization completed. Would you like me to add boundary definitions to the module AGENTS.md?

The update will enhance the existing AGENTS.md with:
- Module boundaries (responsibilities / non-responsibilities)

The existing Operating Rules and Key Files sections will be preserved.

[Yes / No]
```

If user agrees, **update** (not overwrite) `modules/<module_id>/AGENTS.md` following the merge strategy in the "Documentation Confirmation" section below.

### Step 4.5 — Workdocs baseline (Expected)

The module skeleton should include:
- `modules/<module_id>/workdocs/AGENTS.md` (workdocs rules + resume checklist)
- `modules/<module_id>/workdocs/README.md` (structure)
- `modules/<module_id>/workdocs/domain-glossary.md` (if Step 0.5 was completed)

If either AGENTS.md or README.md is missing, create it (do not overwrite existing) and keep the content minimal and operational.

### Step 5 — (Optional) Add flow nodes and implementations

- Add/edit `.system/modular/flow_graph.yaml` to include new flow nodes.
- Add `implements` entries under `modules/<module_id>/MANIFEST.yaml` interfaces.
- Re-run step 3.

## Notes

- Treat MANIFEST.yaml and module context registry as SSOT.
- Treat instance_registry and flow_impl_index as derived artifacts (overwritable).

## Included assets

- Template: `./templates/domain-glossary.md` (for Step 0.5 domain glossary)
- Examples: `./examples/example-api/` (complete module skeleton)

## Examples

See `examples/example-api/` for a complete module skeleton including:

- `MANIFEST.yaml` - Module metadata with interfaces and flow participation
- `AGENTS.md` - AI operating instructions (includes boundaries)
- `ABILITY.md` - (Legacy) Standalone responsibility boundaries reference
- `interact/registry.json` - Context artifacts registry
- `interact/openapi.yaml` - OpenAPI specification
- `workdocs/` - Module work documentation

Copy and customize for your new module.

### Workdocs baseline (excerpt)

New modules are expected to include `modules/<module_id>/workdocs/AGENTS.md`, with headings like:
- `## When to use workdocs (MUST)`
- `## Resume checklist`

**Note**: New modules should include boundaries directly in `AGENTS.md` (see Documentation Confirmation section). The separate `ABILITY.md` is kept in examples for reference only.

## Verification

- Run `node .ai/scripts/modules/modulectl.mjs verify` and `node .ai/skills/features/context-awareness/scripts/contextctl.mjs build`.

## Boundaries

- Do **not** edit derived artifacts directly; use the ctl scripts to regenerate them.
- Do **not** introduce alternative SSOT files or duplicate registries (single source of truth is enforced).
- Keep changes scoped: prefer module-local updates (MANIFEST, interact registry) over project-wide edits when possible.

---

## Documentation Confirmation (Required)

After module initialization completes, the LLM **must** ask the user whether to add boundary definitions to the existing `AGENTS.md`.

**Important**: `modulectl init --apply` already creates a basic `AGENTS.md` with Operating Rules and Key Files. The documentation confirmation step **enhances** that file by adding boundary definitions, not replacing the existing file.

### When to ask

Immediately after core initialization (steps 1–3) completes successfully, before optional step 5.

### What to ask

1. Whether to add boundary definitions to `modules/<module_id>/AGENTS.md`
2. Module boundaries: what the module IS responsible for (DO)
3. Module boundaries: what the module is NOT responsible for (DO NOT)

### Prompt template

```
Module {{module_id}} initialized successfully.

Would you like me to add boundary definitions to the module AGENTS.md?

If yes, please provide:
1. What is the module responsible for? (2–5 items)
2. What is the module NOT responsible for? (2–5 items)

[Yes / No]
```

### Merge strategy

**DO preserve** (from existing AGENTS.md generated by modulectl):
- `## Operating rules` section
- `## Key files` section
- YAML frontmatter

**DO add/update**:
- `## Boundaries` section (add if missing; update if present)
  - `### Responsibilities (DO)`
  - `### Non-responsibilities (DO NOT)`

**Heading matching**: treat `## Key files`/`## Key Files` and `## Operating rules`/`## Operating Rules` as equivalent (case-insensitive).

**Insertion rule (no reordering)**:
- If `## Boundaries` exists: update only the DO/DO NOT lists.
- Else: insert the new `## Boundaries` section after the `# {{module_id}}` heading and before the first existing `## ...` section (typically `## Operating rules` in modulectl-generated files).

### Target AGENTS.md structure (after merge)

```markdown
---
name: {{module_id}}
purpose: Module agent instructions for {{module_id}}
---

# {{module_id}}

## Boundaries

### Responsibilities (DO)

- {{user-provided responsibility 1}}
- {{user-provided responsibility 2}}
- ...

### Non-responsibilities (DO NOT)

- {{user-provided non-responsibility 1}}
- {{user-provided non-responsibility 2}}
- ...

## Operating rules

(preserved from modulectl-generated AGENTS.md)

## Key files

(preserved from modulectl-generated AGENTS.md)

## Description

(preserved if present; modulectl appends the section by default when `--description` is provided)
```

### LLM-first documentation principles

When updating module AGENTS.md:

- **Semantic density**: Each line carries meaningful info
- **Structured format**: Use tables/lists for quick parsing
- **Token efficient**: No redundant text; key info first
- **Clear boundaries**: Explicitly state DO and DO NOT

### If user declines

Skip boundary definition addition. The module AGENTS.md (generated by modulectl) remains with basic Operating Rules and Key Files, but without explicit boundary definitions.

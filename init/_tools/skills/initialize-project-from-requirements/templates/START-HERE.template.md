# Init: Start Here (interview outline + routing map)

The init pipeline generates `init/START-HERE.md` via the `start` command (copy-if-missing). The file is intended to be the **single human entry point** for the `init/` workflow.

- Progress board (auto-generated): `init/INIT-BOARD.md`
- Pipeline command entry: `node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs <command> [options]`
- Command shortcuts: `npm run init:<command>` (see `package.json`)

---

## REQUIRED: Output language (LLM must ask first)

<!-- INIT:REQUIRED_FIELD:output_language -->

Before doing **any** Stage A interview work, the LLM **must** ask:

> "What language should I use for all outputs (choose one)?"

| Field | Value | Status |
|-------|-------|--------|
| **Output Language** | `TBD` | **REQUIRED - NOT SET** |

<!-- INIT:OUTPUT_LANGUAGE: TBD -->

---

## Current status (LLM-maintained)

- Last refreshed: `TBD`
- Current stage: `TBD`
- Next actions (max 3):
  - `TBD`
- Full status + checklists: `init/INIT-BOARD.md`

---

## Operating mode (LLM-maintained)

`init/START-HERE.md` is a living, LLM-maintained entry doc (similar to a roadmap). The goal is clear routing and low cognitive load:

- Keep the file short. Store facts/decisions in SSOT files; keep only a digest in `init/START-HERE.md`.
- Use `init/INIT-BOARD.md` for the full checklist and full progress status.

Update triggers (LLM):

- After any user input that changes Stage A docs or the blueprint
- After any init pipeline command completes (the board refresh happens automatically)
- After any stage approval (`approve --stage A|B|C`)

Update rules (LLM):

- Keep one output language for init artifacts.
- Keep "Next actions" to at most 3 items.
- Avoid raw transcripts; extract conclusions into Stage A/B SSOT.
- Keep the machine marker line `<!-- INIT:OUTPUT_LANGUAGE: ... -->` intact (do not translate the key); update only the value.

---

## 1) Where information is recorded (SSOT routing)

During init, **chat is not the source of truth**. The source of truth is:

- Stage A (human requirements SSOT): `init/_work/stage-a-docs/*`
- Stage B (machine blueprint SSOT): `init/_work/project-blueprint.json`
- Stage progression + audit trail: `init/_work/.init-state.json` (do not hand-edit; use pipeline commands)

Rule of thumb:

- If the content is a **fact** about requirements, write the fact into Stage A docs.
- If the content is a **decision** that drives scaffold/features/packs, write the decision into the blueprint.
- If the content is only discussion context, keep the discussion in chat; extract conclusions into Stage A/B.

## 2) Pre-Stage A (chat-first) extraction checklist

No external materials are stored in the repo. If you provide docs/images externally, the workflow is:

1) Provide materials in chat
2) LLM extracts key facts
3) Facts are written into `init/_work/stage-a-docs/*` and/or `init/_work/project-blueprint.json`

### 2.1) Pre-Stage A: outline confirmation (recommended)

Confirm the interview outline up front (especially for async / cross-timezone work):

- Purpose: one sentence + success criteria
- Users: primary roles + key journeys
- Scope: must-have vs. explicitly out-of-scope
- Constraints: tech / legal / timeline / security / compliance
- Domain glossary: critical nouns/verbs (terminology SSOT)
- Open questions + risks: what is unknown / blocked

When the outline is confirmed, proceed to Stage A doc drafting in `init/_work/stage-a-docs/`.

### 2.2) Change policy (avoid confusion)

- Before a stage is explicitly approved, you can edit its SSOT files freely.
- After a stage is approved, treat changes as a deliberate change request: update the SSOT, re-run validation, and re-approve if needed.

Recommended extraction outcomes (write the conclusion into the SSOT paths above):

- One-sentence purpose (what the project is for)
- Primary user roles
- Must-have requirements (MUST)
- Out of scope (explicitly)
- Key user journeys
- Constraints (tech/legal/time/budget/security)
- Success metrics
- Domain glossary (critical nouns/verbs)

## 3) Stage A interview routing (must-ask → file → state key)

Stage A templates live under `init/_work/stage-a-docs/` (created by `start`).

After each must-ask is asked/answered and written into a Stage A doc, update the init state:

```bash
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs mark-must-ask \
  --repo-root . \
  --key <key> \
  --asked --answered \
  --written-to <path>
```

Must-ask keys (SSOT list): `init/_tools/skills/initialize-project-from-requirements/reference.md`

Stage A approval requires the must-ask checklist to be complete by default. Bypass option (not recommended):

```bash
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs approve --stage A --repo-root . --skip-must-ask
```

Validate Stage A docs:

```bash
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs check-docs --repo-root . --strict
```

## 4) Stage B blueprint routing (schema-first, but human-readable)

Blueprint file (created by `start`):

- `init/_work/project-blueprint.json`

Schema reference:

- `init/_tools/skills/initialize-project-from-requirements/templates/project-blueprint.schema.json`

Validate blueprint:

```bash
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs validate --repo-root .
```

For a human-readable "what's missing / what matters" view, use:

- `init/INIT-BOARD.md` (auto-generated)

## 5) What to read (avoid information overload)

Start with:

1) `init/START-HERE.md` (entry doc)
2) `init/INIT-BOARD.md` (progress + next actions + blueprint checklist)

Deep dive only when needed:

- `init/README.md` (pipeline overview)
- `init/_tools/docs/stages/*` (stage-specific guidance)
- `init/_tools/docs/feature-docs/*` (feature details)
- `init/_tools/skills/initialize-project-from-requirements/SKILL.md` (LLM/operator SSOT)

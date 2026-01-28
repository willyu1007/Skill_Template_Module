# Conversation Prompts (Question Bank)

> **Relationship with `llm-init-guide.md`**:
> - **llm-init-guide.md**: End-to-end process guide with phase-by-phase instructions
> - **The conversation-prompts.md file**: Question bank and modular prompts for detailed interviews
> 
> Use `llm-init-guide.md` for the overall flow; use conversation-prompts.md for detailed question templates.

## Conclusions (read first)

- Use the document as a **question bank** for Stage A. Ask the **MUST-ask** set first, then use **branch modules** based on the project's capabilities.
- Every answer MUST be written into a file artifact:
  - Stage A docs under `init/_work/stage-a-docs/` during initialization (human-readable SSOT for intent; legacy: `init/stage-a-docs/`)
  - Stage B blueprint at `init/_work/project-blueprint.json` during initialization (machine-readable SSOT for scaffolding / pack selection; legacy: `init/project-blueprint.json`)
- If the user cannot decide, record it as **TBD** in `init/_work/stage-a-docs/risk-open-questions.md` with:
  - owner, options, and decision due.

> **Archive**: After initialization, run `cleanup-init --archive` to archive working files. See SKILL.md for archive paths.

## A. MUST-ask (minimal set)

Ask the following questions before writing the first draft of `init/_work/stage-a-docs/requirements.md`:

0. **Terminology alignment decision (skip or sync)**
   - "Do we need to align/confirm domain terminology now?"
   - If YES (sync): use `init/_work/stage-a-docs/domain-glossary.md` as the SSOT; align terms used in `requirements.md` to the glossary.
   - If NO (skip): explicitly record "skip terminology sync for now" in `init/_work/stage-a-docs/domain-glossary.md` (and revisit only if terms become ambiguous).

1. **One-line purpose**
   - "In one sentence, what problem does this project solve, for whom, and what is the main outcome?"

2. **Primary user roles**
   - "Who are the primary users (2-5 roles)?"
   - "Who is NOT a user?"

3. **In-scope MUST requirements (3-10)**
   - "List the MUST-have capabilities. Each MUST should be testable."

4. **Out-of-scope (explicit OUT)**
   - "List what we will NOT do in this version."

5. **Top user journeys (2-5)**
   - "Describe the top user journeys end-to-end."
   - For each journey: "What is the acceptance criterion (AC)?"

6. **Constraints**
   - "Hard constraints (compliance, security, platforms, deadlines, budget, integrations)?"
   - "Any non-negotiable tech constraints?"

7. **Success metrics**
   - "How do we measure success? (business + product + reliability)"

## B. Branch modules (ask only if relevant)

### B1. API module (if the project exposes or consumes APIs)

Ask if the project has `capabilities.api.style != "none"` or has external integrations.

- API style: REST / GraphQL / event-driven / internal only
- Authentication: none / session / JWT / OAuth2 / API key
- Error model: "How should errors be represented (codes, messages, trace IDs)?"
- Pagination / filtering / sorting conventions
- Versioning and backward compatibility expectations
- Rate limiting / abuse controls (if public)

Write to:
- Stage A: `init/_work/stage-a-docs/requirements.md` (high-level)
- Stage B: `capabilities.api.*`

### B2. Database module (if persistent data exists)

Ask if `capabilities.database.enabled == true`.

- DB kind: postgres / mysql / sqlite / document / key-value / managed service / TBD
- Data size expectations (orders of magnitude)
- Consistency expectations (strong/eventual)
- Migration strategy expectations (migrations / schema-less / TBD)
- **DB schema SSOT mode** (MUST choose one):
  - `none` (no managed SSOT in repo)
  - `repo-prisma` (SSOT = `prisma/schema.prisma`; developers manage migrations)
  - `database` (SSOT = real DB; repo keeps mirrors via introspection)

  -> Write to Stage B: `db.ssot` (DB enablement is controlled by SSOT; `db.ssot=none` disables DB materialization).
- Backup / restore requirements

Write to:
- Stage A: `init/_work/stage-a-docs/non-functional-requirements.md` + `requirements.md` (entities)
- Stage B: `capabilities.database.*`

### B3. BPMN / process module (if business workflows matter)

Ask if `capabilities.bpmn.enabled == true`.

- Process boundaries: start/end triggers
- Swimlanes: which roles/systems act
- Happy path + exception paths
- Manual steps vs automated steps
- Audit needs (who did what, when)

Write to:
- Stage A: `init/_work/stage-a-docs/requirements.md` + `risk-open-questions.md`
- Optional future artifact: `docs/context/process/*.bpmn`

### B4. CI / quality module (if the project will be maintained)

Ask if `quality.ci.enabled == true` or `quality.testing.enabled == true`.

- CI provider constraints (if any)
- What is the minimal quality gate? (lint, typecheck, unit tests, build)
- Required environments / matrix (node versions, OS)
- Test levels needed (unit/integration/e2e)
- Release cadence expectations

Write to:
- Stage A: `init/_work/stage-a-docs/non-functional-requirements.md`
- Stage B: `quality.*`

## C. Answer -> Artifact mapping cheat sheet

Use the following mapping to avoid "knowledge floating in chat":

During initialization (working location):
- Scope (MUST/OUT) -> `init/_work/stage-a-docs/requirements.md` (`## Goals`, `## Non-goals`)
- User journeys + AC -> `init/_work/stage-a-docs/requirements.md` (`## Users and user journeys`)
- Constraints/NFR -> `init/_work/stage-a-docs/non-functional-requirements.md`
- Terminology alignment decision -> `init/_work/stage-a-docs/domain-glossary.md`
- Glossary terms/entities -> `init/_work/stage-a-docs/domain-glossary.md`
- TBD decisions/risks -> `init/_work/stage-a-docs/risk-open-questions.md`
- Repo layout/pack selection decisions -> `init/_work/project-blueprint.json`

After completion (archived to):
- Stage A docs -> `docs/project/overview/`
- Blueprint -> `docs/project/overview/project-blueprint.json`

## D. Feature + provider prompts (default-on init)

The init template defaults to enabling most features during Stage C. Ask the following to choose **implementation forms** and any **override-disable** decisions.

### D1. Context Management (context-awareness)

Context awareness is **mandatory** in the init template.

Ask only for configuration:
- Context mode (`contract` vs `snapshot`)
- Environment list (`dev`, `staging`, `prod`, ...)

### D2. Database Schema Management (SSOT choice)

Decide the DB schema SSOT mode (MUST): `none` / `repo-prisma` / `database` (default: `repo-prisma`).

- If SSOT is `none`: DB outputs are skipped (no `db/`, no `prisma/`, no DB schema context files).
- Otherwise: Stage C will materialize DB conventions based on `db.ssot`.

### D3. Container/Artifact Packaging (packaging)

Ask if:
- "Will this project produce container images (Docker)?"
- "Are there other artifacts to package (CLI binaries, libraries)?"
- "What target platforms/architectures?"

-> If NO: Set `features.packaging: false`

### D4. Multi-Environment Deployment (deployment)

Ask if:
- "Does this project deploy to multiple environments (dev/staging/prod)?"
- "What deployment model? (K8s, VM, serverless, static)"
- "Are there rollback requirements?"

-> If NO: Set `features.deployment: false`

### D5. Release/Version Management (release)

Ask if:
- "Does this project need automated changelog generation?"
- "What versioning strategy? (semantic, calendar, custom)"
- "Are there release approval workflows?"

-> If NO: Set `features.release: false`

### D6. Observability Contracts (observability)

Ask if:
- "Does this project need metrics/monitoring definitions?"
- "Are there logging schema requirements?"
- "Is distributed tracing needed?"

-> If NO: Set `features.observability: false`

### D7. UI System SSOT (ui)

Ask if the project needs a stable UI/UX foundation:
- UI tokens and contract SSOT (so UI changes are deterministic)
- Generated UI context for LLMs (under `docs/context/ui/`)

-> If NO: Set `features.ui: false`

### D8. Environment Contract SSOT (environment)

Ask if the project needs a strict env var contract:
- `env/contract.yaml` as SSOT
- Generate non-secret developer artifacts (`.env.example`, `docs/env.md`, `docs/context/env/contract.json`)

-> If NO: Set `features.environment: false`

### D9. CI provider selection (ci)

CI enablement is controlled by `ci.provider` (default: `github`).

- Set `ci.provider=github` for GitHub Actions.
- Set `ci.provider=gitlab` for GitLab CI.
- Set `ci.provider=none` to disable CI materialization (no CI files generated).

Write decisions to Stage B (`init/_work/project-blueprint.json`):
- `db.ssot`
- `ci.provider`
- `features.*` (override-disable only)

Verification (run from repo root):

```bash
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs suggest-features --repo-root .
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs validate --repo-root .
```

## E. Technology Stack Selection

> **SSOT**: See "Phase 2: Technology stack selection" in `llm-init-guide.md` for the complete guide.

After the requirements interview (Sections A-D), guide the user through choosing:

1. **Primary language** - Ask: "What is the primary implementation language?"
2. **Package manager** - Ask: "Which package manager should we use?"
3. **Frontend framework** (if applicable) - Ask: "Which frontend framework?"
4. **Backend framework** (if applicable) - Ask: "Which backend framework?"
5. **Repo layout** - Ask: "Is this a single app repo or a multi-app repo?"

Write decisions to Stage B (`init/_work/project-blueprint.json`):
- `repo.layout`, `repo.language`, `repo.packageManager`
- `capabilities.frontend.framework`, `capabilities.backend.framework`

---

## F. Config Generation for Unsupported Languages

> **SSOT**: See "Phase 5: Configuration generation" in `llm-init-guide.md` for the complete guide.

When the selected language has no built-in template (Python, Java, .NET, Rust, etc.), the LLM should generate configuration files dynamically. Refer to `llm-init-guide.md` for language-specific templates.

---

## Verification

- After the interview, run Stage A validation:

```bash
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs check-docs --repo-root . --strict
```

- After generating blueprint, run Stage B validation:

```bash
node init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs validate --repo-root .
```

- For languages without templates, LLM should generate config files before running `apply`.

# Conversation Prompts (Question Bank)

> **Relationship with `llm-init-guide.md`**:
> - **llm-init-guide.md**: End-to-end process guide with phase-by-phase instructions
> - **The conversation-prompts.md file**: Question bank and modular prompts for detailed interviews
> 
> Use `llm-init-guide.md` for the overall flow; use conversation-prompts.md for detailed question templates.

## Conclusions (read first)

- Use the document as a **question bank** for Stage A. Ask the **MUST-ask** set first, then use **branch modules** based on the project's capabilities.
- Every answer MUST be written into a file artifact:
  - Stage A docs under `init/stage-a-docs/` during initialization (human-readable SSOT for intent)
  - Stage B blueprint at `init/project-blueprint.json` during initialization (machine-readable SSOT for scaffolding / pack selection)
- If the user cannot decide, record it as **TBD** in `init/stage-a-docs/risk-open-questions.md` with:
  - owner, options, and decision due.

> **Note**: After initialization completes, use `cleanup-init --archive` to move these files to `docs/project/` for long-term retention.

## A. MUST-ask (minimal set)

Ask the following questions before writing the first draft of `init/stage-a-docs/requirements.md`:

0. **Terminology alignment decision (skip or sync)**
   - "Do we need to align/confirm domain terminology now?"
   - If YES (sync): use `init/stage-a-docs/domain-glossary.md` as the SSOT; align terms used in `requirements.md` to the glossary.
   - If NO (skip): explicitly record “skip terminology sync for now” in `init/stage-a-docs/domain-glossary.md` (and revisit only if terms become ambiguous).

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
- Stage A: `init/stage-a-docs/requirements.md` (high-level)
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

  → Write to Stage B: `db.ssot` and align `features.database` accordingly.
- Backup / restore requirements

Write to:
- Stage A: `init/stage-a-docs/non-functional-requirements.md` + `requirements.md` (entities)
- Stage B: `capabilities.database.*`

### B3. BPMN / process module (if business workflows matter)

Ask if `capabilities.bpmn.enabled == true`.

- Process boundaries: start/end triggers
- Swimlanes: which roles/systems act
- Happy path + exception paths
- Manual steps vs automated steps
- Audit needs (who did what, when)

Write to:
- Stage A: `init/stage-a-docs/requirements.md` + `risk-open-questions.md`
- Optional future artifact: `docs/context/process/*.bpmn`

### B4. CI / quality module (if the project will be maintained)

Ask if `quality.ci.enabled == true` or `quality.testing.enabled == true`.

- CI provider constraints (if any)
- What is the minimal quality gate? (lint, typecheck, unit tests, build)
- Required environments / matrix (node versions, OS)
- Test levels needed (unit/integration/e2e)
- Release cadence expectations

Write to:
- Stage A: `init/stage-a-docs/non-functional-requirements.md`
- Stage B: `quality.*`

## C. Answer → Artifact mapping cheat sheet

Use this mapping to avoid "knowledge floating in chat":

During initialization (working location):
- Scope (MUST/OUT) → `init/stage-a-docs/requirements.md` (`## Goals`, `## Non-goals`)
- User journeys + AC → `init/stage-a-docs/requirements.md` (`## Users and user journeys`)
- Constraints/NFR → `init/stage-a-docs/non-functional-requirements.md`
- Terminology alignment decision → `init/stage-a-docs/domain-glossary.md`
- Glossary terms/entities → `init/stage-a-docs/domain-glossary.md`
- TBD decisions/risks → `init/stage-a-docs/risk-open-questions.md`
- Repo layout/pack selection decisions → `init/project-blueprint.json`

After completion (archived to):
- Stage A docs → `docs/project/`
- Blueprint → `docs/project/project-blueprint.json`

## D. Feature Decision Prompts (ask when determining capabilities)

After understanding the project requirements, ask the following to determine which optional features should be enabled:

### D1. Context Management (context-awareness)

Ask if the project needs:
- "Does this project have API contracts (OpenAPI/Swagger) that LLM assistants should understand?"
- "Does the project have a database schema that needs to be tracked for context?"
- "Are there business process definitions (BPMN) that describe workflows?"
- "Should LLM assistants have access to a central registry of project context artifacts?"

→ If YES to any: Enable `features.contextAwareness: true`

### D2. Database Schema Management (SSOT choice + database feature)

First decide the DB schema SSOT mode (MUST): `none` / `repo-prisma` / `database`.

Then:
- If SSOT is `none`: Keep `features.database: false`.
- Otherwise: Enable `features.database: true` (SSOT scaffolding; behavior depends on `db.ssot`).

### D3. Container/Artifact Packaging (packaging)

Ask if:
- "Will this project produce container images (Docker)?"
- "Are there other artifacts to package (CLI binaries, libraries)?"
- "What target platforms/architectures?"

→ If YES: Enable `features.packaging: true`

### D4. Multi-Environment Deployment (deployment)

Ask if:
- "Does this project deploy to multiple environments (dev/staging/prod)?"
- "What deployment model? (K8s, VM, serverless, static)"
- "Are there rollback requirements?"

→ If YES: Enable `features.deployment: true`

### D5. Release/Version Management (release)

Ask if:
- "Does this project need automated changelog generation?"
- "What versioning strategy? (semantic, calendar, custom)"
- "Are there release approval workflows?"

→ If YES: Enable `features.release: true`

### D6. Observability Contracts (observability)

Ask if:
- "Does this project need metrics/monitoring definitions?"
- "Are there logging schema requirements?"
- "Is distributed tracing needed?"

→ If YES: Enable `features.observability: true`

### D7. UI System SSOT (ui)

Ask if the project needs a stable UI/UX foundation:
- UI tokens and contract SSOT (so UI changes are deterministic)
- Generated UI context for LLMs (under `docs/context/ui/`)

→ If YES: Enable `features.ui: true`

### D8. Environment Contract SSOT (environment)

Ask if the project needs a strict env var contract:
- `env/contract.yaml` as SSOT
- Generate non-secret developer artifacts (`.env.example`, `docs/env.md`, `docs/context/env/contract.json`)

→ If YES: Enable `features.environment: true`

Write feature decisions to:
- Stage B: `features.*` section in `init/project-blueprint.json`

Verification (run from repo root):

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs suggest-features --repo-root .
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs validate --repo-root .
```

## E. Technology Stack Selection

After the requirements interview, guide the user through choosing the technology stack.

### E1. Primary language

**Ask**: "What is the primary implementation language for this project?"

| Language | Built-in template | Recommended package manager |
|----------|-------------------|-----------------------------|
| TypeScript | ✅ | pnpm |
| JavaScript | ✅ | pnpm |
| Go | ✅ | go |
| C/C++ | ✅ | xmake |
| React Native | ✅ | pnpm |
| Python | ❌ | poetry |
| Java | ❌ | gradle |
| Kotlin | ❌ | gradle |
| .NET (C#) | ❌ | dotnet |
| Rust | ❌ | cargo |
| Other | ❌ | (depends on the language) |

**Decision logic**:
- Languages marked ✅: use built-in templates to generate configs
- Languages not marked ✅: have the LLM generate configs dynamically based on `llm-init-guide.md`

**Blueprint mapping (repo.language)**:
- C/C++: `c` / `cpp` (or `c-xmake` / `cpp-xmake`), package manager `xmake`
- React Native: `react-native` (TypeScript template), package manager `pnpm`/`npm`/`yarn`

### E2. Package manager

**Ask**: "Which package manager should we use?"

Offer options based on the language:
- TypeScript/JavaScript: "pnpm (recommended), yarn, npm"
- React Native: "pnpm (recommended), yarn, npm"
- C/C++: fixed: use `xmake`
- Python: "poetry (recommended), pip, pipenv, uv"
- Java/Kotlin: "gradle (recommended), maven"
- Go: fixed: use `go`
- Rust: fixed: use `cargo`
- .NET: fixed: use `dotnet`

### E3. Frontend framework (if `capabilities.frontend.enabled: true`)

**Ask**: "Which frontend framework should we use?"

- React (recommended)
- Vue.js
- Svelte
- Angular
- Solid
- Other (please specify)

**Meta-frameworks** (optional):
- Next.js (React)
- Nuxt (Vue)
- Remix (React)
- SvelteKit (Svelte)

### E4. Backend framework (if `capabilities.backend.enabled: true`)

**Ask**: "Which backend framework should we use?"

TypeScript/JavaScript:
- Express (recommended, simple)
- Fastify (performance-first)
- NestJS (enterprise)
- Hono (edge)

Python:
- FastAPI (recommended, modern)
- Django (batteries-included)
- Flask (lightweight)

Go:
- Gin (recommended)
- Echo
- Fiber

Java/Kotlin:
- Spring Boot (recommended)
- Quarkus
- Micronaut

### E5. Repo layout

**Ask**: "Is this repo a single app or a multi-app/multi-package setup?"

- **single** - single app
  - Structure: `src/`
  - Use for: simple projects, single service
  
- **monorepo** - multiple apps/packages
  - Structure: `apps/` + `packages/`
  - Use for: frontend/backend split, shared libraries, multi-service

Write to:
- Stage B: `repo.layout`, `repo.language`, `repo.packageManager`
- Stage B: `capabilities.frontend.framework`, `capabilities.backend.framework`

---

## F. Config Generation for Unsupported Languages

When the chosen language has no built-in templates, the LLM should generate configuration files using the rules below.

**Detailed guide**: See "Phase 5: Configuration generation" in `templates/llm-init-guide.md`.

### F1. Python projects

**Must generate**:
- `pyproject.toml` - project config (including `pytest`, `ruff`, and `mypy` settings)
- Directories: `src/{{project_name}}/`, `tests/`

**Optional** (based on package manager):
- `requirements.txt` (pip)
- `Pipfile` (pipenv)

**Example `pyproject.toml`**:
```toml
[project]
name = "{{project.name}}"
version = "0.1.0"
description = "{{project.description}}"
requires-python = ">=3.11"

[tool.pytest.ini_options]
testpaths = ["tests"]

[tool.ruff]
line-length = 88
target-version = "py311"
```

### F2. Java projects

**Gradle (recommended)**:
- `build.gradle.kts`
- `settings.gradle.kts`
- Directories: `src/main/java/`, `src/test/java/`

**Maven**:
- `pom.xml`
- Directories: `src/main/java/`, `src/test/java/`

### F3. .NET projects

**Must generate**:
- `{{project.name}}.csproj`
- `global.json`
- Directories: `src/`, `tests/`

### F4. Rust projects

**Must generate**:
- `Cargo.toml`
- Directories: `src/` (containing `main.rs` or `lib.rs`)

### F5. Other languages

For other languages, the LLM should:
1. Identify the language's standard project layout
2. Generate appropriate configs (build system, linter, formatter)
3. Create a minimal directory structure
4. Add `.gitignore` rules

---

## Verification

- After the interview, run Stage A validation:

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs check-docs --repo-root . --strict
```

- After generating blueprint, run Stage B validation:

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs validate --repo-root .
```

- For languages without templates, LLM should generate config files before running `apply`.

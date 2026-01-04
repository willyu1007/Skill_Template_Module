# Conversation Prompts (Stage A requirements interview)

## Conclusions (read first)

- Use the template as a **question bank** for Stage A. Ask the **MUST-ask** set first, then use **branch modules** based on the project's capabilities.
- Every answer MUST be written into a file artifact:
  - Stage A docs under `docs/project/` (human-readable SSOT for intent)
  - Stage B blueprint at `docs/project/project-blueprint.json` (machine-readable SSOT for scaffolding / pack selection)
- If the user cannot decide, record the item as **TBD** in `docs/project/risk-open-questions.md` with:
  - owner, options, and decision due.

## A. MUST-ask (minimal set)

Ask these before writing the first draft of `docs/project/requirements.md`:

1. **One-line purpose**
   - "In one sentence, what problem does this project solve, for whom, and what is the main outcome?"

2. **Primary user roles**
   - "Who are the primary users (2–5 roles)?"
   - "Who is NOT a user?"

3. **In-scope MUST requirements (3–10)**
   - "List the MUST-have capabilities. Each MUST should be testable."

4. **Out-of-scope (explicit OUT)**
   - "List what we will NOT do in this version."

5. **Top user journeys (2–5)**
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
- Stage A: `docs/project/requirements.md` (high-level)
- Stage B: `capabilities.api.*`

### B2. Database module (if persistent data exists)

Ask if `capabilities.database.enabled == true`.

- DB kind: postgres / mysql / sqlite / document / key-value / managed service / TBD
- Data size expectations (orders of magnitude)
- Consistency expectations (strong/eventual)
- Migration strategy expectations (migrations / schema-less / TBD)
- Backup / restore requirements

Write to:
- Stage A: `docs/project/non-functional-requirements.md` + `requirements.md` (entities)
- Stage B: `capabilities.database.*`

### B3. BPMN / process module (if business workflows matter)

Ask if `capabilities.bpmn.enabled == true`.

- Process boundaries: start/end triggers
- Swimlanes: which roles/systems act
- Happy path + exception paths
- Manual steps vs automated steps
- Audit needs (who did what, when)

Write to:
- Stage A: `docs/project/requirements.md` + `risk-open-questions.md`
- Optional future artifact: `docs/context/process/*.bpmn`

### B4. CI / quality module (if the project will be maintained)

Ask if `quality.ci.enabled == true` or `quality.testing.enabled == true`.

- CI provider constraints (if any)
- What is the minimal quality gate? (lint, typecheck, unit tests, build)
- Required environments / matrix (node versions, OS)
- Test levels needed (unit/integration/e2e)
- Release cadence expectations

Write to:
- Stage A: `docs/project/non-functional-requirements.md`
- Stage B: `quality.*`

## C. Answer → Artifact mapping cheat sheet

Use the mapping to avoid "knowledge floating in chat":

- Scope (MUST/OUT) → `docs/project/requirements.md` (`## Goals`, `## Non-goals`)
- User journeys + AC → `docs/project/requirements.md` (`## Users and user journeys`)
- Constraints/NFR → `docs/project/non-functional-requirements.md`
- Glossary terms/entities → `docs/project/domain-glossary.md`
- TBD decisions/risks → `docs/project/risk-open-questions.md`
- Repo layout/pack selection decisions → `docs/project/project-blueprint.json`

## D. Add-on Decision Prompts (ask when determining capabilities)

After understanding the project requirements, ask the following to determine which optional add-ons should be enabled:

### D1. Context Management (context-awareness)

Ask if the project needs:
- "Does this project have API contracts (OpenAPI/Swagger) that LLM assistants should understand?"
- "Does the project have a database schema that needs to be tracked for context?"
- "Are there business process definitions (BPMN) that describe workflows?"
- "Should LLM assistants have access to a central registry of project context artifacts?"

→ If YES to any: Enable `addons.contextAwareness: true`

### D2. Database Schema Management (db-mirror)

Ask if:
- "Does this project need to track and mirror database schema changes?"
- "Should database migrations be managed programmatically?"
- "Is there a need for schema introspection and documentation generation?"

→ If YES: Enable `addons.dbMirror: true`

### D3. CI/CD Configuration (ci-templates)

Ask if:
- "Does this project need standardized CI/CD pipeline configuration?"
- "Which CI provider? (GitHub Actions, GitLab CI, etc.)"
- "What CI stages are needed? (lint, test, build, deploy)"

→ If YES: Enable `addons.ciTemplates: true`

### D4. Container/Artifact Packaging (packaging)

Ask if:
- "Will this project produce container images (Docker)?"
- "Are there other artifacts to package (CLI binaries, libraries)?"
- "What target platforms/architectures?"

→ If YES: Enable `addons.packaging: true`

### D5. Multi-Environment Deployment (deployment)

Ask if:
- "Does this project deploy to multiple environments (dev/staging/prod)?"
- "What deployment model? (K8s, VM, serverless, static)"
- "Are there rollback requirements?"

→ If YES: Enable `addons.deployment: true`

### D6. Release/Version Management (release)

Ask if:
- "Does this project need automated changelog generation?"
- "What versioning strategy? (semantic, calendar, custom)"
- "Are there release approval workflows?"

→ If YES: Enable `addons.release: true`

### D7. Observability Contracts (observability)

Ask if:
- "Does this project need metrics/monitoring definitions?"
- "Are there logging schema requirements?"
- "Is distributed tracing needed?"

→ If YES: Enable `addons.observability: true`

Write add-on decisions to:
- Stage B: `addons.*` section in `docs/project/project-blueprint.json`

## E. Tech stack selection

After the requirements interview, guide the user to choose the tech stack.

### E1. Programming language

**Ask**: "What is the primary programming language for this project?"

| Language | Has template | Recommended package manager |
|----------|--------------|----------------------------|
| TypeScript | ✅ | pnpm |
| JavaScript | ✅ | pnpm |
| Go | ✅ | go |
| C/C++ | ✅ | xmake |
| Python | ❌ | poetry |
| Java | ❌ | gradle |
| Kotlin | ❌ | gradle |
| .NET (C#) | ❌ | dotnet |
| Rust | ❌ | cargo |
| Other | ❌ | (depends on language) |

**Decision logic**:
- Languages marked ✅: generate config using built-in templates
- Languages marked ❌: the LLM generates config dynamically based on `llm-init-guide.md`

### E2. Package manager

**Ask**: "Which package manager should we use?"

Offer options based on the chosen language:
- TypeScript/JavaScript: "pnpm (recommended), yarn, npm"
- Python: "poetry (recommended), pip, pipenv, uv"
- Java/Kotlin: "gradle (recommended), maven"
- Go: fixed: `go`
- Rust: fixed: `cargo`
- .NET: fixed: `dotnet`

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
- NestJS (enterprise-oriented)
- Hono (edge-first)

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

**Ask**: "Is this repo a single app or a multi-app/multi-package monorepo?"

- **single** - single app
  - Directory structure: `src/`
  - Good for: simple projects, single service
  
- **monorepo** - multi-app/multi-package
  - Directory structure: `apps/` + `packages/`
  - Good for: split frontend/backend, shared libraries, multiple services

Write to:
- Stage B: `repo.layout`, `repo.language`, `repo.packageManager`
- Stage B: `capabilities.frontend.framework`, `capabilities.backend.framework`

---

## F. Config generation guidance (unsupported languages)

When the selected language does not have a built-in template, the LLM should generate config files using the rules below.

**Detailed guide**: see `templates/llm-init-guide.md`, "Phase 5: Config generation".

### F1. Python projects

**Must generate**:
- `pyproject.toml` - project configuration (including pytest, ruff, mypy settings)
- Directories: `src/{{project_name}}/`, `tests/`

**Optional** (based on the package manager):
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
- Directories: `src/` (with `main.rs` or `lib.rs`)

### F5. Other languages

For other languages, the LLM should:
1. Identify the language's standard project structure
2. Generate the corresponding config files (build system, linter, formatter)
3. Create a baseline directory structure
4. Add `.gitignore` rules

---

## Verification

- After the interview, run Stage A validation:

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs check-docs --docs-root docs/project
```

- After generating blueprint, run Stage B validation:

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs validate --blueprint docs/project/project-blueprint.json
```

- For languages without templates, LLM should generate config files before running `apply`.

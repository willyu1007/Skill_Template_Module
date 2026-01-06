# Conversation Prompts (Stage A requirements interview)

## Conclusions (read first)

- Use the template as a **question bank** for Stage A. Ask the **MUST-ask** set first, then use **branch modules** based on the project's capabilities.
- Every answer MUST be written into a file artifact:
  - Stage A docs under `init/stage-a-docs/` (working SSOT during init; archived to `docs/project/` after completion)
  - Stage B blueprint at `init/project-blueprint.json` (working SSOT during init)
- If the user cannot decide, record the item as **TBD** in `init/stage-a-docs/risk-open-questions.md` with:
  - owner, options, and decision due.

## A. MUST-ask (minimal set)

Ask these before writing the first draft of `init/stage-a-docs/requirements.md`:

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
- Stage A: `init/stage-a-docs/requirements.md` (high-level)
- Stage B: `capabilities.api.*`

### B2. Database module (if persistent data exists)

Ask if `capabilities.database.enabled == true`.

- DB kind: postgres / mysql / sqlite / document / key-value / managed service / TBD
- Data size expectations (orders of magnitude)
- Consistency expectations (strong/eventual)
- Migration strategy expectations (migrations / schema-less / TBD)
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

Use the mapping to avoid "knowledge floating in chat":

- Scope (MUST/OUT) → `init/stage-a-docs/requirements.md` (`## Goals`, `## Non-goals`)
- User journeys + AC → `init/stage-a-docs/requirements.md` (`## Users and user journeys`)
- Constraints/NFR → `init/stage-a-docs/non-functional-requirements.md`
- Glossary terms/entities → `init/stage-a-docs/domain-glossary.md`
- TBD decisions/risks → `init/stage-a-docs/risk-open-questions.md`
- Repo layout/pack selection decisions → `init/project-blueprint.json`

## D. Add-on Decision Prompts (default: all enabled)

All add-ons are **enabled by default**. Ask if the user wants to **disable** any (opt-out model).

### Default add-ons (all enabled)

| Add-on | Key | Purpose |
|--------|-----|---------|
| Packaging | `packaging` | Container/artifact build |
| Deployment | `deployment` | Multi-environment deploy |
| Release | `release` | Version/changelog management |
| Observability | `observability` | Metrics/logs/traces contracts |

**Note**: Core capabilities (context-awareness, db-mirror) are built-in and always available.

### Prompt template

```
The following add-ons will be enabled by default:

| Add-on | Purpose |
|--------|---------|
| packaging | Container/artifact packaging |
| deployment | Multi-environment deployment |
| release | Version and changelog management |
| observability | Metrics/logs/traces contracts |

Do you want to disable any of these? If so, which ones?
(Press Enter to keep all enabled)
```

### Disable conditions (only if user explicitly requests)

| Add-on | When to disable |
|--------|-----------------|
| `packaging` | Library-only project, no containers needed |
| `deployment` | CLI tool, no deployment needed |
| `release` | Internal tool, no formal release process |
| `observability` | Simple app, no metrics/logs requirements |

Write add-on decisions to:
- Stage B: `addons.*` section in `init/project-blueprint.json`

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

## G. Documentation Update Confirmation (after apply)

After `apply` completes successfully, ask the user whether to update the project `AGENTS.md`.

### When to ask

Immediately after `apply` completes, before `approve --stage C`.

### Prompt template

```
Initialization completed successfully.

Would you like me to add the tech stack information to the project AGENTS.md?

This will record:
- Programming language and package manager
- Frontend/backend frameworks
- Database type
- API style
- Enabled add-ons

The existing AGENTS.md content (Key Directories, Control Scripts, Common Tasks, Task Protocol, Rules) will be preserved.

[Yes / No]
```

### If user says Yes

Update `AGENTS.md` following these rules:

1. **Preserve existing content** - Do NOT remove:
   - Key Directories table
   - Core Control Scripts table
   - Optional Add-ons table
   - Common Tasks section
   - Task Protocol section
   - Rules section

2. **Insert position** - Add new sections **before** `## Key Directories`

3. **Content template**:

```markdown
## Tech Stack

| Category | Choice |
|----------|--------|
| Language | {{repo.language}} |
| Package Manager | {{repo.packageManager}} |
| Layout | {{repo.layout}} |
| Frontend | {{capabilities.frontend.framework or "N/A"}} |
| Backend | {{capabilities.backend.framework or "N/A"}} |
| Database | {{capabilities.database.kind or "N/A"}} |
| API Style | {{capabilities.api.style or "N/A"}} |

## Enabled Add-ons

| Add-on | Purpose |
|--------|---------|
| packaging | Container/artifact build |
| deployment | Multi-env deploy |
| release | Version/changelog |
| observability | Metrics/logs/traces |
```

### LLM-first documentation principles

- **Semantic density**: Each line carries meaningful info
- **Structured format**: Tables/lists for quick parsing
- **Token efficient**: No redundant text; key info first
- **Preserve constraints**: Never remove template repo's core rules

---

## H. Add-ons Directory Cleanup Confirmation (after approve)

After `approve --stage C` completes, ask the user whether to keep the add-on source directory `addons/`.

### Prompt template

```
Initialization is complete.

Do you want to keep the add-on sources under `addons/`? (They are not required for day-to-day project operation, but keeping them can help with future add-on re-installs or comparisons.)

[Yes / No]
```

### If user says No

Run:

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs cleanup-addons --repo-root . --apply --i-understand
```

## Verification

- After the interview, run Stage A validation:

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs check-docs --repo-root . --docs-root init/stage-a-docs --strict
```

- After generating blueprint, run Stage B validation:

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs validate --blueprint init/project-blueprint.json
```

- For languages without templates, LLM should generate config files before running `apply`.

- After apply completes, ask user about AGENTS.md update (Module G).
- After init completes (`approve --stage C`), ask user about `addons/` cleanup (Module H).

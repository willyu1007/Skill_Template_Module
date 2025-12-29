# Conversation Prompts (Stage A requirements interview)

## Conclusions (read first)

- Use this as a **question bank** for Stage A. Ask the **MUST-ask** set first, then use **branch modules** based on the project's capabilities.
- Every answer MUST be written into a file artifact:
  - Stage A docs under `docs/project/` (human-readable SSOT for intent)
  - Stage B blueprint at `docs/project/project-blueprint.json` (machine-readable SSOT for scaffolding / pack selection)
- If the user cannot decide, record it as **TBD** in `docs/project/risk-open-questions.md` with:
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

Use this mapping to avoid "knowledge floating in chat":

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

## E. 技术栈选择引导 (Technology Stack Selection)

在完成需求访谈后，引导用户选择技术栈。

### E1. 开发语言选择

**Ask**: "这个项目的主要开发语言是什么？"

| 语言 | 有预置模板 | 推荐包管理器 |
|------|-----------|-------------|
| TypeScript | ✅ | pnpm |
| JavaScript | ✅ | pnpm |
| Go | ✅ | go |
| C/C++ | ✅ | xmake |
| Python | ❌ | poetry |
| Java | ❌ | gradle |
| Kotlin | ❌ | gradle |
| .NET (C#) | ❌ | dotnet |
| Rust | ❌ | cargo |
| Other | ❌ | (根据语言) |

**决策逻辑**:
- 有 ✅ 标记的语言：使用预置模板生成配置
- 无 ✅ 标记的语言：LLM 根据 `llm-init-guide.md` 动态生成配置

### E2. 包管理器选择

**Ask**: "使用哪个包管理器？"

根据语言给出选项：
- TypeScript/JavaScript: "pnpm（推荐）、yarn、npm"
- Python: "poetry（推荐）、pip、pipenv、uv"
- Java/Kotlin: "gradle（推荐）、maven"
- Go: 固定使用 `go`
- Rust: 固定使用 `cargo`
- .NET: 固定使用 `dotnet`

### E3. 前端框架选择（如果 `capabilities.frontend.enabled: true`）

**Ask**: "前端使用什么框架？"

- React (推荐)
- Vue.js
- Svelte
- Angular
- Solid
- 其他（请说明）

**元框架**（可选）:
- Next.js (React)
- Nuxt (Vue)
- Remix (React)
- SvelteKit (Svelte)

### E4. 后端框架选择（如果 `capabilities.backend.enabled: true`）

**Ask**: "后端使用什么框架？"

TypeScript/JavaScript:
- Express (推荐，简单)
- Fastify (性能优先)
- NestJS (企业级)
- Hono (边缘计算)

Python:
- FastAPI (推荐，现代)
- Django (全功能)
- Flask (轻量)

Go:
- Gin (推荐)
- Echo
- Fiber

Java/Kotlin:
- Spring Boot (推荐)
- Quarkus
- Micronaut

### E5. Repo 布局选择

**Ask**: "项目是单一应用还是多应用/多包？"

- **single** - 单一应用
  - 目录结构: `src/`
  - 适用: 简单项目、单一服务
  
- **monorepo** - 多应用/多包
  - 目录结构: `apps/` + `packages/`
  - 适用: 前后端分离、共享库、多服务

Write to:
- Stage B: `repo.layout`, `repo.language`, `repo.packageManager`
- Stage B: `capabilities.frontend.framework`, `capabilities.backend.framework`

---

## F. 配置文件生成引导 (Config Generation for Unsupported Languages)

当用户选择的语言没有预置模板时，LLM 应根据以下规则生成配置文件。

**详细指南**: 参考 `templates/llm-init-guide.md` 的 "Phase 5: 配置文件生成" 章节。

### F1. Python 项目

**必须生成**:
- `pyproject.toml` - 项目配置（包含 pytest, ruff, mypy 配置）
- 目录: `src/{{project_name}}/`, `tests/`

**可选**（根据包管理器）:
- `requirements.txt` (pip)
- `Pipfile` (pipenv)

**示例 pyproject.toml**:
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

### F2. Java 项目

**Gradle（推荐）**:
- `build.gradle.kts`
- `settings.gradle.kts`
- 目录: `src/main/java/`, `src/test/java/`

**Maven**:
- `pom.xml`
- 目录: `src/main/java/`, `src/test/java/`

### F3. .NET 项目

**必须生成**:
- `{{project.name}}.csproj`
- `global.json`
- 目录: `src/`, `tests/`

### F4. Rust 项目

**必须生成**:
- `Cargo.toml`
- 目录: `src/`（包含 `main.rs` 或 `lib.rs`）

### F5. 其他语言

对于其他语言，LLM 应：
1. 识别该语言的标准项目结构
2. 生成对应的配置文件（build system, linter, formatter）
3. 创建基础目录结构
4. 添加 `.gitignore` 规则

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

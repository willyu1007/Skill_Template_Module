# LLM Initialization Guide

The document provides step-by-step guidance for an AI assistant to help a user complete the project initialization workflow.

---

## Contents

1. [Workflow overview](#workflow-overview)
2. [Phase 0.5: Domain glossary alignment](#phase-05-domain-glossary-alignment-optional)
3. [Phase 1: Requirements interview](#phase-1-requirements-interview)
4. [Phase 2: Tech stack selection](#phase-2-tech-stack-selection)
5. [Phase 3: Blueprint generation](#phase-3-blueprint-generation)
6. [Phase 4: Add-on recommendations](#phase-4-add-on-recommendations)
7. [Phase 5: Config generation](#phase-5-config-generation)
8. [Phase 6: Documentation update (README.md + AGENTS.md)](#phase-6-documentation-update-readmemd--agentsmd)
9. [Phase 7: Skill retention confirmation](#phase-7-skill-retention-confirmation)
10. [Decision tree reference](#decision-tree-reference)

---

## Workflow overview

```
User starts initialization
       │
       ▼
┌─────────────────────────────┐
│ Phase 0.5: Domain glossary   │  ← optional, align terminology first
│ alignment (optional)         │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ Phase 1: Requirements        │  ← use conversation-prompts.md modules A/B
│ interview                    │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ Phase 2: Tech stack selection│  ← choose language/framework/package manager
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ Phase 3: Blueprint generation│  ← generate project-blueprint.json
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ Phase 4: Add-on config       │  ← all add-ons enabled by default
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ Phase 5: Config generation   │  ← templates or LLM-generated + run apply
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ Phase 6: Doc update          │  ← update README.md + AGENTS.md
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ Phase 7: Skill retention     │  ← review/prune skills for project needs
└────────┬────────────────────┘
         │
         ▼
   Initialization complete
```

---

## Phase 0.5: Domain glossary alignment (optional)

Before starting Phase 1 (requirements interview), ask the user whether they want to align on domain terminology first.

### When to ask

At the very beginning of the initialization process, before any requirements questions.

### LLM action

```
Before we define requirements, would you like to align on key domain terms?

This helps ensure we use consistent terminology throughout the project.
If yes, I'll help you build a domain glossary (domain-glossary.md).

[Yes / Skip for now]
```

### If user says Yes

1. Ask for key domain terms (3-10 terms):
   - "What are the key business/domain terms in this project?"
   - For each term: "How would you define <term>?"
   - "Any synonyms or non-examples for <term>?"

2. Write to `init/stage-a-docs/domain-glossary.md` using the file template created by `start` (keep the file placeholder-free so `check-docs --strict` can pass):
   ```markdown
   # Domain Glossary
   
   ## Purpose
   Define domain terms used across requirements and implementation.
   
   ## Terms
   
   ### Term name
   - Definition: Write a one-sentence definition.
   - Synonyms: List synonyms, or write "none".
   - Non-examples: List non-examples, or write "none".
   - Notes: Optional.
   ```

3. Continue to Phase 1

### If user says Skip

- Continue to Phase 1 (`domain-glossary.md` will still be created by `start` and can be filled later)

This step is **MustAsk but not blocking** — user can skip and fill in later.

---

## Phase 1: Requirements interview

### Must-ask checklist

Ask these questions in order (see module A in `conversation-prompts.md`):

1. **One-line purpose**: "In one sentence, what problem does this project solve, for whom, and what is the main outcome?"
2. **Primary user roles**: "Who are the primary users (2–5 roles)? Who is NOT a user?"
3. **Must-have capabilities**: "List 3–10 MUST-have capabilities. Each MUST should be testable."
4. **Explicit OUT-of-scope**: "What will we explicitly NOT do in this version?"
5. **User journeys**: "Describe 2–5 core user journeys end-to-end. What is the acceptance criterion (AC) for each?"
6. **Constraints**: "Any hard constraints (compliance, security, platforms, deadlines, budget, integrations)? Any non-negotiable tech constraints?"
7. **Success metrics**: "How do we measure success (business + product + reliability)?"

### Output requirements

Write answers to the following files (working SSOT during init):
- `init/stage-a-docs/requirements.md` - primary requirements
- `init/stage-a-docs/non-functional-requirements.md` - NFRs
- `init/stage-a-docs/domain-glossary.md` - glossary
- `init/stage-a-docs/risk-open-questions.md` - TBDs / risks / open questions

**Note**: After init completes, use `cleanup-init --archive` to archive to `docs/project/`.

---

## Phase 2: Tech stack selection

### 2.1 Programming language

**Ask**: "What is the primary programming language for this project?"

| Language | Has template | Package manager options |
|----------|--------------|-------------------------|
| TypeScript | ✅ | pnpm, npm, yarn |
| JavaScript | ✅ | pnpm, npm, yarn |
| Go | ✅ | go |
| C/C++ | ✅ | xmake |
| Python | ❌ (LLM-generated) | pip, poetry, pipenv, uv |
| Java | ❌ (LLM-generated) | maven, gradle |
| Kotlin | ❌ (LLM-generated) | maven, gradle |
| .NET (C#) | ❌ (LLM-generated) | dotnet |
| Rust | ❌ (LLM-generated) | cargo |
| Ruby | ❌ (LLM-generated) | bundler |
| PHP | ❌ (LLM-generated) | composer |

### 2.2 Framework selection (based on language)

**TypeScript/JavaScript frontend**:
- React, Vue, Svelte, Angular, Solid
- Next.js, Nuxt, Remix, Astro

**TypeScript/JavaScript backend**:
- Express, Fastify, Hono, NestJS, Koa

**Python**:
- FastAPI, Django, Flask, Litestar

**Go**:
- Gin, Echo, Fiber, Chi

**Java/Kotlin**:
- Spring Boot, Quarkus, Micronaut

### 2.3 Repo layout

**Ask**: "Is this repo a single app or a monorepo?"

- `single` - single app (`src/` structure)
- `monorepo` - multi-app/multi-package (`apps/` + `packages/` structure)

---

## Phase 3: Blueprint generation

Based on information from Phase 1 and Phase 2, generate `init/project-blueprint.json`.

### Minimal blueprint template

```json
{
  "version": 1,
  "project": {
    "name": "<project name, kebab-case>",
    "description": "<project description>"
  },
  "repo": {
    "layout": "<single|monorepo>",
    "language": "<language>",
    "packageManager": "<package manager>"
  },
  "capabilities": {
    "frontend": { "enabled": <true|false>, "framework": "<framework>" },
    "backend": { "enabled": <true|false>, "framework": "<framework>" },
    "api": { "style": "<rest|graphql|rpc|none>", "auth": "<auth method>" },
    "database": { "enabled": <true|false>, "kind": "<database kind>" }
  },
  "quality": {
    "testing": { "unit": true },
    "ci": { "enabled": <true|false> }
  },
  "skills": {
    "packs": ["workflows"]
  },
  "addons": {}
}
```

### `skills.packs` auto-recommendation rules

| Condition | Recommended pack |
|----------|-------------------|
| Always | `workflows` |
| `capabilities.backend.enabled: true` | `backend` |
| `capabilities.frontend.enabled: true` | `frontend` |
| Code conventions needed | `standards` |
| `addons.contextAwareness: true` | `context-core` (provided by add-on) |

---

## Phase 4: Add-on recommendations

### Default behavior: all add-ons enabled

By default, the following add-ons are **enabled** in the blueprint:

| Add-on | Key | Purpose |
|--------|-----|---------|
| Packaging | `packaging` | Container/artifact build |
| Deployment | `deployment` | Multi-environment deploy |
| Release | `release` | Version/changelog management |
| Observability | `observability` | Metrics/logs/traces contracts |

**Note**: Core capabilities (context-awareness, db-mirror) are built-in and do not require add-on installation.

### LLM action

Ask the user if they want to **disable** any add-ons (opt-out model):

```
The following add-ons will be enabled by default:

| Add-on | Purpose |
|--------|---------|
| packaging | Container/artifact packaging |
| deployment | Multi-environment deployment |
| release | Version and changelog management |
| observability | Metrics/logs/traces contracts |

Do you want to disable any of these? (If not, press Enter to continue)
```

### Disable rules

Only disable an add-on if the user explicitly requests it or if the project clearly does not need it:

| Condition | Can disable |
|-----------|-------------|
| CLI tool only, no deployment | `deployment` |
| Library package, no containers | `packaging` |
| Internal tool, no release process | `release` |
| Simple app, no observability needs | `observability` |

---

## Phase 5: Config generation

### 5.1 Languages with built-in templates

For languages with built-in templates (TypeScript, Go, C/C++, etc.), `scaffold-configs.cjs` generates config files automatically.

### 5.2 Languages without templates (LLM-generated)

When the selected language does not have a built-in template, the LLM should generate config files using the rules below.

#### Python projects

**Must-generate files**:

```toml
# pyproject.toml
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

[tool.mypy]
python_version = "3.11"
strict = true
```

**Optional files** (based on the package manager):
- `requirements.txt` (pip)
- `Pipfile` (pipenv)
- Poetry: add a `[tool.poetry]` section to `pyproject.toml`

**Directory structure**:
```
src/
  {{project.name.replace('-', '_')}}/
    __init__.py
tests/
  __init__.py
  test_placeholder.py
```

#### Java projects (Maven)

**Must-generate files**:

```xml
<!-- pom.xml -->
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
    <modelVersion>4.0.0</modelVersion>
    <groupId>com.example</groupId>
    <artifactId>{{project.name}}</artifactId>
    <version>0.1.0-SNAPSHOT</version>
    <packaging>jar</packaging>
    
    <properties>
        <java.version>21</java.version>
        <maven.compiler.source>${java.version}</maven.compiler.source>
        <maven.compiler.target>${java.version}</maven.compiler.target>
    </properties>
</project>
```

**Directory structure**:
```
src/
  main/
    java/
      com/example/{{project.name}}/
        Application.java
    resources/
  test/
    java/
```

#### Java projects (Gradle)

**Must-generate files**:

```kotlin
// build.gradle.kts
plugins {
    java
    application
}

group = "com.example"
version = "0.1.0-SNAPSHOT"

java {
    toolchain {
        languageVersion.set(JavaLanguageVersion.of(21))
    }
}

repositories {
    mavenCentral()
}

dependencies {
    testImplementation("org.junit.jupiter:junit-jupiter:5.10.0")
}

tasks.test {
    useJUnitPlatform()
}
```

```kotlin
// settings.gradle.kts
rootProject.name = "{{project.name}}"
```

#### .NET projects

**Must-generate files**:

```xml
<!-- {{project.name}}.csproj -->
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
  </PropertyGroup>
</Project>
```

```json
// global.json
{
  "sdk": {
    "version": "8.0.0",
    "rollForward": "latestFeature"
  }
}
```

#### Rust projects

**Must-generate files**:

```toml
# Cargo.toml
[package]
name = "{{project.name}}"
version = "0.1.0"
edition = "2021"

[dependencies]

[dev-dependencies]
```

**Directory structure**:
```
src/
  main.rs  # or lib.rs
```

---

## Phase 6: Documentation update (README.md + AGENTS.md)

After `apply` completes successfully, the LLM **must** ask the user whether to update **both** the root `README.md` and `AGENTS.md` with project-specific and tech stack information.

### When to ask

Ask immediately after `apply` completes and before running `approve --stage C`.

### LLM action

```
Initialization completed. Would you like me to update the project documentation?

I will update:
1. README.md - with project name, description, tech stack summary, and quick start
2. AGENTS.md - with tech stack table and enabled add-ons

The existing AGENTS.md structure (Key Directories, Control Scripts, etc.) will be preserved.

[Yes / No]
```

### README.md update rules

1. **Overwrite allowed**: The root `README.md` can be fully replaced with project-specific content.

2. **Content to include**:

```markdown
# {{project.name}}

{{project.description}}

## Tech Stack

| Category | Choice |
|----------|--------|
| Language | {{repo.language}} |
| Package Manager | {{repo.packageManager}} |
| Frontend | {{capabilities.frontend.framework or "N/A"}} |
| Backend | {{capabilities.backend.framework or "N/A"}} |
| Database | {{capabilities.database.kind or "N/A"}} |

## Quick Start

\`\`\`bash
# Install dependencies
{{packageManagerInstallCommand}}

# Start development
{{packageManagerDevCommand}}
\`\`\`

## Project Structure

Brief description of key directories based on the scaffolded layout.

## AI Assistants

Read `AGENTS.md` for AI-specific guidance.
```

### AGENTS.md update rules

1. **Preserve existing content**: Do NOT overwrite or remove:
   - Key Directories table
   - Core Control Scripts table
   - Optional Add-ons table
   - Common Tasks section
   - Task Protocol section
   - Rules section

2. **Insert position**: Add new sections **before** `## Key Directories`

3. **Content to add**:

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

When updating documentation, follow these principles:

- **Semantic density**: Each line should carry meaningful information
- **Structured format**: Use tables and lists for quick LLM parsing
- **Token efficient**: Avoid redundant descriptions; key info first
- **Preserve constraints**: Never remove template repo's core rules in AGENTS.md

---

## Phase 7: Skill retention confirmation

After documentation update (Phase 6), present a skill retention table so the user can decide which skills to keep for their project.

### When to ask

Ask after Phase 6 documentation update completes and before cleanup steps.

### LLM action

1. **Generate retention table**: Create `init/skill-retention-table.md` from the template `templates/skill-retention-table.template.md`, listing all skills from `.ai/skills/` with descriptions.

2. **Present to user**:

```
Here are the available skills in this project. Please review and let me know which ones you want to remove.

[Display the generated skill-retention-table.md content]

List the skill names you want to delete (comma-separated), or press Enter to keep all.
```

3. **If user provides skills to delete**:

   a. Preview first (dry-run):
   ```bash
   node .ai/scripts/delete-skills.cjs --skills "<csv-list>" --dry-run
   ```

   b. Show preview output and ask for confirmation:
   ```
   These skills will be deleted:
   [list from dry-run output]

   Confirm deletion? [Yes / No]
   ```

   c. If user confirms, execute deletion:
   ```bash
   node .ai/scripts/delete-skills.cjs --skills "<csv-list>" --yes
   ```

   d. Regenerate provider wrappers:
   ```bash
   node .ai/scripts/sync-skills.cjs --scope current --providers both
   ```

4. **If user keeps all skills**: Continue to next step (cleanup).

### Retention table format

The generated `init/skill-retention-table.md` should follow this structure:

```markdown
# Skill Retention Table

Review the skills below and decide which to keep for your project.

## Workflows

| Skill | Description |
|-------|-------------|
| plan-maker | Create implementation plans and roadmaps |
| create-workdocs-plan | Create module/integration workdocs task bundles |
| agent_builder | Scaffold module-embedded agent components |
| ... | ... |

## Standards

| Skill | Description |
|-------|-------------|
| naming-conventions | Apply consistent naming conventions |
| git-commit-conventions | Apply Git commit/branch/PR conventions |
| ... | ... |

## Scaffold

| Skill | Description |
|-------|-------------|
| initialize-module-instance | Create new module instances |
| manage-project-context | Maintain context registries |
| ... | ... |
```

### Notes

- Translate descriptions to the user's preferred language if needed.
- If multiple skills share the same name, display the full path to avoid ambiguity.
- The `agent_builder` skill can be removed if the project does not need agent proxy scaffolding.

---

## Decision tree reference

### Language → package manager decision tree

```
Choose language
├── TypeScript/JavaScript
│   └── Recommended: pnpm > yarn > npm
├── Python
│   └── Recommended: poetry > pip > uv
├── Go
│   └── Fixed: go
├── Java/Kotlin
│   └── Recommended: gradle > maven
├── .NET
│   └── Fixed: dotnet
├── Rust
│   └── Fixed: cargo
└── C/C++
    └── Recommended: xmake > cmake
```

### Capabilities → add-on decision tree

```
Check capabilities
├── api.style != "none"
│   └── Recommend: contextAwareness
├── database.enabled
│   ├── Recommend: contextAwareness
│   └── Recommend: dbMirror
├── bpmn.enabled
│   └── Recommend: contextAwareness
└── DevOps needs
    ├── Containerization → packaging
    ├── Multi-environment → deployment
    └── Release management → release
```

---

## Complete guided conversation example

```
AI: Let's start initializing your project. First, in one sentence: what problem does the project solve, and for whom?

User: This is an inventory management system for small businesses to track products and orders.

AI: Got it. A few follow-up questions:
1. Who are the primary users?
2. What are the must-have capabilities?
3. What will we explicitly NOT do in this version?

User: Warehouse managers and buyers. Must-have: inbound, outbound, inventory lookup, low-stock alerts. Not included: accounting, supplier management.

AI: Great. Now let's determine the tech stack:
1. What's the preferred programming language?
2. Do you need a web frontend?
3. Any database preference?

User: TypeScript, React for the frontend, and PostgreSQL for the database.

AI: Thanks. I'll generate the project blueprint. Based on your answers:

- Language: TypeScript + pnpm
- Layout: single
- Frontend: React
- Backend: Express
- API: REST + JWT
- Database: PostgreSQL

The following add-ons will be enabled by default:
- packaging (container builds)
- deployment (multi-environment)
- release (version/changelog)
- observability (metrics/logs/traces)

Do you want to disable any of these? (Press Enter to keep all enabled)

User: [Enter]

AI: Great, all add-ons enabled. Running apply...

[apply completes]

AI: Initialization completed. Would you like me to update the project documentation?

I will update:
1. README.md - with project name, description, tech stack summary, and quick start
2. AGENTS.md - with tech stack table and enabled add-ons

User: Yes

AI: Done. Documentation updated:
- README.md: project info, tech stack, quick start
- AGENTS.md: Tech Stack table, Enabled Add-ons table

Now let's review the available skills. Here's the retention table:

[displays skill-retention-table.md content]

List the skill names you want to delete (comma-separated), or press Enter to keep all.

User: agent_builder

AI: Previewing deletion...

[runs: node .ai/scripts/delete-skills.cjs --skills "agent_builder" --dry-run]

These skills will be deleted:
- workflows/agent/agent_builder (SSOT + provider stubs)

Confirm deletion? [Yes / No]

User: Yes

AI: Deleting skills and syncing wrappers...

[runs: node .ai/scripts/delete-skills.cjs --skills "agent_builder" --yes]
[runs: node .ai/scripts/sync-skills.cjs --scope current --providers both]

Done. Skills pruned and wrappers synced.

Next: run `approve --stage C` to complete initialization.

User: [runs approve --stage C]

AI: Initialization is complete. Do you want to keep the add-on sources under `addons/`? If not, I can remove `addons/` now (it is not required for day-to-day project operation).

[Yes / No]

If the user chooses **No**, run:
`node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs cleanup-addons --repo-root . --apply --i-understand`
```

---

## Notes

1. **Do not skip phases**: complete each phase in order
2. **No workdocs during init**: do NOT create workdocs task bundles during initialization; the init pipeline has its own state tracking
3. **Write to files**: record every decision and answer in the corresponding docs
4. **Validate outputs**: use `check-docs` and `validate` to validate artifacts
5. **Get explicit approval**: the user must explicitly approve each stage before advancing
6. **Add-ons default ON**: all add-ons are enabled by default; ask user to disable if needed
7. **Documentation update (Phase 6)**: always ask user about README.md + AGENTS.md update after apply completes
8. **Skill retention (Phase 7)**: always generate retention table and let user prune unwanted skills before finalizing
9. **Add-ons directory cleanup**: after skill retention completes, ask whether to keep `addons/`; if not, run `cleanup-addons`

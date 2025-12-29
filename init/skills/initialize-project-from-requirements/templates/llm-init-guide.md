# LLM 初始化引导指南

本文档为 AI 助手提供分步引导，帮助用户完成项目初始化流程。

---

## 目录

1. [引导流程概览](#引导流程概览)
2. [Phase 1: 需求访谈](#phase-1-需求访谈)
3. [Phase 2: 技术栈选择](#phase-2-技术栈选择)
4. [Phase 3: Blueprint 生成](#phase-3-blueprint-生成)
5. [Phase 4: Add-ons 推荐](#phase-4-add-ons-推荐)
6. [Phase 5: 配置文件生成](#phase-5-配置文件生成)
7. [决策树参考](#决策树参考)

---

## 引导流程概览

```
用户开始初始化
       │
       ▼
┌──────────────────┐
│ Phase 1: 需求访谈 │  ← 使用 conversation-prompts.md A/B 模块
└────────┬─────────┘
         │
         ▼
┌──────────────────────┐
│ Phase 2: 技术栈选择   │  ← 确定语言/框架/包管理器
└────────┬─────────────┘
         │
         ▼
┌──────────────────────┐
│ Phase 3: Blueprint   │  ← 生成 project-blueprint.json
└────────┬─────────────┘
         │
         ▼
┌──────────────────────┐
│ Phase 4: Add-ons     │  ← 根据能力推荐 add-ons
└────────┬─────────────┘
         │
         ▼
┌──────────────────────┐
│ Phase 5: 配置文件     │  ← 模板或 LLM 生成
└────────┬─────────────┘
         │
         ▼
    执行 apply 命令
```

---

## Phase 1: 需求访谈

### 必问问题清单

按顺序询问以下问题（参考 `conversation-prompts.md` A 模块）：

1. **一句话目的**: "用一句话描述这个项目要解决什么问题，为谁解决，主要成果是什么？"
2. **主要用户角色**: "主要用户有哪些（2-5个角色）？哪些人不是用户？"
3. **必须功能**: "列出3-10个必须实现的功能，每个功能应该是可测试的"
4. **明确排除**: "这个版本明确不做什么？"
5. **用户旅程**: "描述2-5个核心用户旅程，每个旅程的验收标准是什么？"
6. **约束条件**: "有哪些硬性约束（合规、安全、平台、截止日期、预算、集成）？"
7. **成功指标**: "如何衡量成功（业务+产品+可靠性指标）？"

### 输出要求

将回答写入以下文件：
- `docs/project/requirements.md` - 主要需求
- `docs/project/non-functional-requirements.md` - 非功能需求
- `docs/project/domain-glossary.md` - 领域术语
- `docs/project/risk-open-questions.md` - 待定事项

---

## Phase 2: 技术栈选择

### 2.1 开发语言选择

**询问**: "这个项目的主要开发语言是什么？"

| 语言 | 有预置模板 | 包管理器选项 |
|------|-----------|-------------|
| TypeScript | ✅ | pnpm, npm, yarn |
| JavaScript | ✅ | pnpm, npm, yarn |
| Go | ✅ | go |
| C/C++ | ✅ | xmake |
| Python | ❌ (LLM生成) | pip, poetry, pipenv, uv |
| Java | ❌ (LLM生成) | maven, gradle |
| Kotlin | ❌ (LLM生成) | maven, gradle |
| .NET (C#) | ❌ (LLM生成) | dotnet |
| Rust | ❌ (LLM生成) | cargo |
| Ruby | ❌ (LLM生成) | bundler |
| PHP | ❌ (LLM生成) | composer |

### 2.2 框架选择（根据语言）

**TypeScript/JavaScript 前端**:
- React, Vue, Svelte, Angular, Solid
- Next.js, Nuxt, Remix, Astro

**TypeScript/JavaScript 后端**:
- Express, Fastify, Hono, NestJS, Koa

**Python**:
- FastAPI, Django, Flask, Litestar

**Go**:
- Gin, Echo, Fiber, Chi

**Java/Kotlin**:
- Spring Boot, Quarkus, Micronaut

### 2.3 Repo 布局选择

**询问**: "项目是单一应用还是多应用？"

- `single` - 单一应用（src/ 结构）
- `monorepo` - 多应用/多包（apps/ + packages/ 结构）

---

## Phase 3: Blueprint 生成

根据前两个阶段的信息，生成 `docs/project/project-blueprint.json`。

### 最小 Blueprint 模板

```json
{
  "version": 1,
  "project": {
    "name": "<项目名称，kebab-case>",
    "description": "<项目描述>"
  },
  "repo": {
    "layout": "<single|monorepo>",
    "language": "<语言>",
    "packageManager": "<包管理器>"
  },
  "capabilities": {
    "frontend": { "enabled": <true|false>, "framework": "<框架>" },
    "backend": { "enabled": <true|false>, "framework": "<框架>" },
    "api": { "style": "<rest|graphql|rpc|none>", "auth": "<认证方式>" },
    "database": { "enabled": <true|false>, "kind": "<数据库类型>" }
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

### skills.packs 自动推荐规则

| 条件 | 推荐 Pack |
|------|-----------|
| 总是 | `workflows` |
| `capabilities.backend.enabled: true` | `backend` |
| `capabilities.frontend.enabled: true` | `frontend` |
| 需要代码规范 | `standards` |
| `addons.contextAwareness: true` | `context-core` (由 addon 提供) |

---

## Phase 4: Add-ons 推荐

### 推荐决策规则

根据 Blueprint 中的 capabilities 自动推荐 add-ons：

| 条件 | 推荐 Add-on |
|------|------------|
| `api.style != "none"` 或 `database.enabled` 或 `bpmn.enabled` | `contextAwareness` |
| `database.enabled: true` | `dbMirror` |
| `quality.ci.enabled: true` | `ciTemplates` |
| 需要容器化 | `packaging` |
| 需要多环境部署 | `deployment` |
| 需要版本管理 | `release` |
| 需要监控/日志 | `observability` |

### 询问示例

```
根据您的项目需求，我推荐以下 add-ons：

1. ✅ context-awareness - 您的项目有 API 和数据库，这个 add-on 可以帮助 LLM 理解项目的 API 契约和数据库结构
2. ✅ db-mirror - 数据库 schema 管理和迁移支持
3. ❓ ci-templates - 是否需要 CI/CD 配置？

是否启用这些 add-ons？
```

---

## Phase 5: 配置文件生成

### 5.1 有预置模板的语言

对于 TypeScript、Go、C/C++ 等有预置模板的语言，`scaffold-configs.cjs` 会自动生成配置文件。

### 5.2 无预置模板的语言（LLM 生成）

当用户选择的语言没有预置模板时，LLM 应根据以下规则生成配置文件。

#### Python 项目

**必须生成的文件**:

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

**可选文件** (根据包管理器):
- `requirements.txt` (pip)
- `Pipfile` (pipenv)
- Poetry: 在 `pyproject.toml` 中添加 `[tool.poetry]` 节

**目录结构**:
```
src/
  {{project.name.replace('-', '_')}}/
    __init__.py
tests/
  __init__.py
  test_placeholder.py
```

#### Java 项目 (Maven)

**必须生成的文件**:

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

**目录结构**:
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

#### Java 项目 (Gradle)

**必须生成的文件**:

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

#### .NET 项目

**必须生成的文件**:

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

#### Rust 项目

**必须生成的文件**:

```toml
# Cargo.toml
[package]
name = "{{project.name}}"
version = "0.1.0"
edition = "2021"

[dependencies]

[dev-dependencies]
```

**目录结构**:
```
src/
  main.rs  # 或 lib.rs
```

---

## 决策树参考

### 语言 → 包管理器决策树

```
选择语言
├── TypeScript/JavaScript
│   └── 推荐: pnpm > yarn > npm
├── Python
│   └── 推荐: poetry > pip > uv
├── Go
│   └── 固定: go
├── Java/Kotlin
│   └── 推荐: gradle > maven
├── .NET
│   └── 固定: dotnet
├── Rust
│   └── 固定: cargo
└── C/C++
    └── 推荐: xmake > cmake
```

### 能力 → Add-on 决策树

```
检查 capabilities
├── api.style != "none"
│   └── 推荐: contextAwareness
├── database.enabled
│   ├── 推荐: contextAwareness
│   └── 推荐: dbMirror
├── bpmn.enabled
│   └── 推荐: contextAwareness
├── quality.ci.enabled
│   └── 推荐: ciTemplates
└── devops 需求
    ├── 容器化 → packaging
    ├── 多环境 → deployment
    └── 版本管理 → release
```

---

## 完整引导对话示例

```
AI: 让我们开始初始化您的项目。首先，用一句话描述这个项目要解决什么问题，为谁解决？

User: 这是一个面向小型企业的库存管理系统，帮助他们跟踪商品和订单。

AI: 明白了。接下来几个问题：
1. 主要用户有哪些？
2. 必须实现的核心功能有哪些？
3. 这个版本不做什么？

User: 用户是仓库管理员和采购员。核心功能：商品入库、出库、库存查询、低库存预警。不做：财务模块、供应商管理。

AI: 了解。现在让我们确定技术栈：
1. 首选开发语言是什么？
2. 需要 Web 前端吗？
3. 数据库类型偏好？

User: 用 TypeScript，需要前端用 React，数据库用 PostgreSQL。

AI: 好的，我来生成项目蓝图。根据您的需求，我推荐以下配置：

- 语言: TypeScript + pnpm
- 布局: single (单一应用)
- 前端: React
- 后端: Express
- API: REST + JWT
- 数据库: PostgreSQL

推荐的 Add-ons:
- ✅ context-awareness (API/数据库契约管理)
- ✅ db-mirror (数据库 schema 管理)
- ❓ ci-templates (CI/CD 配置)

是否确认这个配置？
```

---

## 注意事项

1. **不要跳过阶段**: 按顺序完成每个 Phase
2. **记录到文件**: 所有决策和回答都要写入对应的文档文件
3. **验证输入**: 使用 `check-docs` 和 `validate` 命令验证输出
4. **用户确认**: 每个阶段完成后需要用户明确确认再推进


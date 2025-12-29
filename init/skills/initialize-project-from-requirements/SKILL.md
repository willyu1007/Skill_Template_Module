# Skill: initialize-project-from-requirements

本技能用于把“需求文档 → 项目蓝图 → 目录骨架/配置 → skills 同步”串起来，并在流程中记录可审计的初始化状态，确保每个阶段都有明确的“验证 + 用户批准”关口。

目标：稳健、可重复、可回滚的初始化流程（而不是追求最快的增强）。

---

## 输入

### Stage A（需求文档，必需）
位于 `docs/project/`（或你指定的 `--docs-root`）：

- `docs/project/requirements.md`
- `docs/project/non-functional-requirements.md`
- `docs/project/domain-glossary.md`
- `docs/project/risk-open-questions.md`

### Stage B（蓝图，必需）
- `docs/project/project-blueprint.json`

### 核心能力：Context System（内置）

在 module-first 模板中，Context System 是**内置能力**（不再从 `addons/context-awareness` 安装）。

默认行为：
- 除非 blueprint 显式禁用 `addons.contextAwareness: false`，否则会执行：
  - `node .ai/scripts/projectctl.js init`
  - `node .ai/scripts/projectctl.js set-context-mode <contract|snapshot>`
  - `node .ai/scripts/contextctl.js init`
  - `node .ai/scripts/contextctl.js build`


---

## 主要输出（落盘产物）

### Stage A
- 需求文档（`docs/project/*`）
- 初始化状态文件：`init/.init-state.json`

### Stage B
- 蓝图：`docs/project/project-blueprint.json`

### Stage C
- 目录骨架（示例）：
  - `src/` 或 `apps/` + `packages/`（由 `repo.layout` 决定）
  - `docs/diagrams/`（如果启用 diagram 能力）
  - `ops/`（如果启用 DevOps scaffold，见下文）
- 配置文件（由 `scripts/scaffold-configs.cjs` 生成）：例如 `.gitignore`、lint/test/format 配置等（视蓝图而定）
- Skills 选择（SSOT）：
  - `.ai/skills/_meta/sync-manifest.json`（扁平 schema：`version/includePrefixes/includeSkills/excludeSkills`）
  - Add-on 模式：若存在 `.ai/scripts/skillsctl.js`，则 pack 开关必须通过 skillsctl（scheme A）执行
- Provider wrappers 生成/更新：
  - `node .ai/scripts/sync-skills.cjs`（支持 `--providers`）

### 可选：Context Awareness Add-on 产物
当启用 Context Awareness 并执行 `apply` 后，通常会出现：

- `.ai/scripts/contextctl.js`
- `.ai/scripts/projectctl.js`
- `docs/context/`（上下文 registry、工作流等，视 add-on 实现而定）

---

## 关键流程规则（必须遵守）

1. 所有阶段推进必须有“验证 + 用户批准”。
   - 验证由脚本命令写入 `init/.init-state.json`
   - 推进阶段必须显式执行 `approve` 命令（不允许手工编辑 state 文件来跳阶段）
2. 严禁在未获用户批准的情况下跨阶段推进。
3. Add-on（Context Awareness）按需安装：
   - 仅当 `blueprint.addons.contextAwareness: true` 时才会尝试从 `/addons/<addonId>/payload` 安装
   - `blueprint.context.*` 仅作为配置使用，不会触发安装
4. manifest schema 统一为“扁平 schema”。
   - 不再使用 `collections.current` 之类结构
5. 配置生成单一入口：`scripts/scaffold-configs.cjs` 是配置生成的单一事实来源（SSOT）。

---

## 标准工作流（从 repo root 执行）

下面所有命令路径都假设你在 repo root 运行。

### 0) 初始化 state
```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs start --repo-root .
```

### 1) Stage A：校验需求文档 → 用户批准
```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs check-docs \
  --repo-root . \
  --docs-root docs/project \
  --strict
```

可选：更新必问清单（用于状态看板；完整 key 见 `init/skills/initialize-project-from-requirements/reference.md`）：
```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs mark-must-ask \
  --repo-root . \
  --key onePurpose \
  --asked \
  --answered \
  --written-to docs/project/requirements.md
```

用户审阅 Stage A 文档并明确说“批准/approved”后，执行：
```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs approve --stage A --repo-root .
```

### 2) Stage B：校验蓝图 → 用户批准
```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs validate \
  --repo-root . \
  --blueprint docs/project/project-blueprint.json
```

可选：标记 packs 审查已完成（用于状态看板）：
```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs review-packs --repo-root .
```

用户审阅蓝图并明确批准后，执行：
```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs approve --stage B --repo-root .
```

### 3) Stage C：落盘 scaffold/configs/packs/wrappers → 用户批准
```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs apply \
  --repo-root . \
  --blueprint docs/project/project-blueprint.json \
  --providers both
```

用户审阅落盘结果并明确批准后，执行：
```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs approve --stage C --repo-root .
```

### 4) 可选：清理 init 包
当用户确认不再需要 init/ 引导套件：
```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs cleanup-init \
  --repo-root . \
  --apply \
  --i-understand
```

---

## Context system（内置）说明要点

在 module-first 模板中，Context System 是**内置能力**，不再从 `addons/context-awareness` 安装。

关键点：
- `docs/context/project.registry.json` 是项目级 SSOT
- `modules/<module_id>/interact/registry.json` 是模块级 SSOT
- `docs/context/registry.json` 是派生聚合视图（不可手改）
- 主要脚本：
  - `node .ai/scripts/contextctl.js`
  - `node .ai/scripts/projectctl.js`


## /addons 目录约定（如需）

`addons/` 目录仅用于**非核心**能力的可选安装（如 packaging/deployment/release/observability）。

目录结构与约定请参考：

- `init/ADDONS_DIRECTORY.md`


## DevOps scaffold（参考 init/stages/03-stage-c-scaffold-and-skills.md）

当满足以下任一条件时，会在 Stage C scaffold 中额外创建 `ops/` 目录骨架：
- `blueprint.quality.ci.enabled: true`
- `blueprint.quality.devops.*` 相关字段开启
- `blueprint.devops.enabled: true`（或其子开关）

典型结构：
- `ops/packaging/{services,jobs,apps,scripts,workdocs}/`
- `ops/deploy/{http_services,workloads,clients,scripts,workdocs}/`

这些内容默认是占位 scaffold（不绑定具体云厂商/CI 平台），以便后续按项目情况稳健扩展。

---

## LLM 引导式初始化流程

本技能支持 LLM（AI 助手）引导用户完成整个初始化流程，无需用户手动编辑配置文件。

### 引导文档

- **`templates/llm-init-guide.md`** - LLM 初始化完整引导指南
- **`templates/conversation-prompts.md`** - 对话问题库和分支模块

### LLM 引导流程概览

```
Phase 1: 需求访谈 → Phase 2: 技术栈选择 → Phase 3: Blueprint 生成
    → Phase 4: Add-ons 推荐 → Phase 5: 配置文件生成 → apply 命令
```

### Phase 1-4: 使用对话引导

LLM 应按照 `conversation-prompts.md` 中的问题顺序进行访谈：

1. **A 模块**: 必问问题（需求、用户、约束）
2. **B 模块**: 分支模块（API、数据库、BPMN、CI）
3. **D 模块**: Add-on 决策
4. **E 模块**: 技术栈选择（语言、框架、包管理器）

### Phase 5: 配置文件生成

#### 有预置模板的语言

以下语言有预置模板，`apply` 命令会自动生成配置：

| 语言 | 模板目录 |
|------|---------|
| TypeScript/JavaScript | `scaffold-configs/typescript-pnpm/` |
| Go | `scaffold-configs/go/` |
| C/C++ | `scaffold-configs/cpp-xmake/` |
| React Native | `scaffold-configs/react-native-typescript/` |

#### 无预置模板的语言（LLM 生成）

以下语言需要 LLM 根据 `llm-init-guide.md` 生成配置：

- Python → `pyproject.toml`, 目录结构
- Java → `build.gradle.kts` 或 `pom.xml`
- Kotlin → `build.gradle.kts`
- .NET → `*.csproj`, `global.json`
- Rust → `Cargo.toml`
- 其他语言 → LLM 根据语言标准生成

**LLM 生成流程**:

1. `apply` 命令检测到无模板，输出提示信息
2. LLM 根据 blueprint 中的语言/框架信息
3. 参考 `llm-init-guide.md` Phase 5 章节
4. 生成对应的配置文件和目录结构
5. 用户确认后继续执行

### 示例对话流程

```
AI: 让我们开始初始化您的项目。首先，用一句话描述这个项目。

User: 一个面向小企业的库存管理系统。

AI: 好的。主要用户有哪些？必须实现的核心功能？

User: 仓库管理员。功能：入库、出库、库存查询、预警。

AI: 明白。技术栈方面，首选开发语言是什么？

User: Python

AI: Python 项目没有预置模板，我来为您生成配置文件...
[LLM 根据 llm-init-guide.md 生成 pyproject.toml 等]

AI: 配置文件已生成。现在执行 apply 命令：
node init/.../init-pipeline.cjs apply --blueprint docs/project/project-blueprint.json
```

---

## 参考文档

- `templates/llm-init-guide.md` - LLM 引导完整指南
- `templates/conversation-prompts.md` - 对话问题库
- `templates/project-blueprint.schema.json` - Blueprint JSON Schema
- `templates/project-blueprint.example.json` - 完整示例
- `templates/project-blueprint.min.example.json` - 最小示例
- `reference.md` - 技术参考

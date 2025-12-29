# Init kit (robust 3-stage pipeline)

This `init/` package provides a 3-stage, checkpointed workflow to bootstrap a repository from requirements:

- **Stage A**: Requirements docs (`docs/project/*`)
- **Stage B**: Blueprint (`docs/project/project-blueprint.json`)
- **Stage C**: Scaffold + configs + skill packs + add-ons + wrapper sync

It is designed for **robustness and auditability**:
- Each stage has a **validation step** (written into `init/.init-state.json`)
- Stage transitions require **explicit user approval** (`approve` command)
- Optional add-ons are installed **only when enabled in the blueprint**

---

## Quick start (run from repo root)

### 0) Initialize state
```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs start --repo-root .
```

### 1) Stage A: validate docs → approve
```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs check-docs \
  --repo-root . \
  --docs-root docs/project \
  --strict

# After the user explicitly approves Stage A:
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs approve --stage A --repo-root .
```

### 2) Stage B: validate blueprint → approve
```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs validate \
  --repo-root . \
  --blueprint docs/project/project-blueprint.json

# After the user explicitly approves Stage B:
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs approve --stage B --repo-root .
```

### 3) Stage C: apply scaffold/configs/packs/addons/wrappers → approve
```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs apply \
  --repo-root . \
  --blueprint docs/project/project-blueprint.json \
  --providers both

# Optional: verify add-ons after installation (fail-fast by default).
# Use --non-blocking-addons to continue despite verify failures.
# node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs apply \
#   --repo-root . \
#   --blueprint docs/project/project-blueprint.json \
#   --providers both \
#   --verify-addons

# After the user explicitly approves Stage C:
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs approve --stage C --repo-root .
```

### 4) Optional: cleanup after init

**Option A: Remove `init/` only** (repo retains add-on source directories)

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs cleanup-init \
  --repo-root . \
  --apply \
  --i-understand
```

**Option B: Remove `init/` + prune unused add-ons** (recommended for minimal final repo)

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs cleanup-init \
  --repo-root . \
  --apply \
  --i-understand \
  --cleanup-addons \
  --blueprint docs/project/project-blueprint.json
```

This removes the `init/` directory and deletes add-on source directories under `addons/` that were not enabled in the blueprint.

---

## Core capabilities (built-in)

The module-first template ships these capabilities **by default** (they are not add-ons anymore):

- **Context registries** (`contextctl.js`, `docs/context/*`, `modules/*/interact/registry.json`)
- **Modular system** (`modulectl.js`, `flowctl.js`, `integrationctl.js`, `.system/modular/*`)
- **DB mirror** (`dbctl.js`, `db/`)
- **CI templates tooling** (`cictl.js`, `ci/`, `.gitlab-ci/`)

> For backward compatibility, some blueprint flags may still mention these features. In this template version, they are already present and do not need to be installed from `addons/`.

## Available Add-ons (non-core)

| Add-on | Directory | Purpose | Control Script |
|--------|----------:|---------|----------------|
| `packaging` | `addons/packaging/` | Container/artifact packaging | `packctl.js` |
| `deployment` | `addons/deployment/` | Multi-environment deployment | `deployctl.js` |
| `release` | `addons/release/` | Version/changelog tooling | `releasectl.js` |
| `observability` | `addons/observability/` | Metrics/logs/traces contracts | `obsctl.js` |

Add-ons are installed non-destructively (copy-if-missing) during Stage C `apply`. See `ADDONS_DIRECTORY.md`.

Example blueprint snippet:

```json
{
  "addons": {
    "packaging": true,
    "deployment": true,
    "release": true,
    "observability": true
  }
}
```


## LLM 引导式初始化 (LLM-Guided Initialization)

本 init kit 支持 AI 助手引导用户完成整个初始化流程。

### 引导流程

```
需求访谈 → 技术栈选择 → Blueprint 生成 → Add-ons 推荐 → 配置文件生成 → apply
```

### 支持的语言

| 语言 | 模板支持 | 配置生成方式 |
|------|---------|-------------|
| TypeScript/JavaScript | ✅ | 预置模板 |
| Go | ✅ | 预置模板 |
| C/C++ (xmake) | ✅ | 预置模板 |
| React Native | ✅ | 预置模板 |
| Python | ❌ | LLM 生成 |
| Java/Kotlin | ❌ | LLM 生成 |
| .NET (C#) | ❌ | LLM 生成 |
| Rust | ❌ | LLM 生成 |
| 其他 | ❌ | LLM 生成 |

### 引导文档

- `skills/initialize-project-from-requirements/templates/llm-init-guide.md` – LLM 完整引导指南
- `skills/initialize-project-from-requirements/templates/conversation-prompts.md` – 对话问题库

### 无模板语言的处理

当用户选择没有预置模板的语言时：
1. `scaffold-configs.cjs` 会输出提示信息和配置文件建议
2. LLM 根据 `llm-init-guide.md` 中的规则生成配置文件
3. 用户确认后继续执行 `apply` 命令

---

## DevOps scaffold (optional)

If the blueprint indicates CI/DevOps needs, Stage C scaffolding can create an `ops/` convention folder:

- `ops/packaging/{services,jobs,apps,scripts,workdocs}/`
- `ops/deploy/{http_services,workloads,clients,scripts,workdocs}/`

When add-ons are enabled, they provide more complete implementations with management scripts.

---

## Files in this init kit

- `stages/` – stage guidance docs
- `skills/initialize-project-from-requirements/` – the skill definition and scripts
  - `templates/project-blueprint.example.json` – full example (all add-ons enabled)
  - `templates/project-blueprint.min.example.json` – minimal example (backend only)
  - `templates/llm-init-guide.md` – LLM 初始化引导指南
  - `templates/conversation-prompts.md` – 对话问题库和分支模块
- `reference.md` – end-to-end reference
- `ADDON_*.md` – individual add-on documentation
- `ADDONS_DIRECTORY.md` – add-on conventions
- `.init-kit` – marker file

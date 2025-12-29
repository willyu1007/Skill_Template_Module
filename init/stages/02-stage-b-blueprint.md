# Stage B: Project blueprint

Stage B produces and validates a **project blueprint** that will drive Stage C scaffolding, config generation, and skill pack selection.

Blueprint location:
- `docs/project/project-blueprint.json`

Reference templates:
- `init/skills/initialize-project-from-requirements/templates/project-blueprint.example.json`
- `init/skills/initialize-project-from-requirements/templates/project-blueprint.schema.json`

---

## What must be true before leaving Stage B

1. `docs/project/project-blueprint.json` exists
2. The blueprint passes validation:
   - schema-level sanity checks
   - pack selection recommendation report (optional, but strongly recommended)
3. The user explicitly approves the blueprint (checkpoint)

---

## Validate blueprint

From repo root:

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs validate \
  --repo-root . \
  --blueprint docs/project/project-blueprint.json
```

Optional: show recommended packs and whether they are installed:

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs suggest-packs \
  --repo-root . \
  --blueprint docs/project/project-blueprint.json
```

## State tracking (recommended)

After reviewing `skills.packs`, record the review in `init/.init-state.json`:

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs review-packs --repo-root .
```

---

## 技术栈选择 (Technology Stack Selection)

Blueprint 中需要指定技术栈相关字段：

### repo 字段

```json
{
  "repo": {
    "layout": "single",           // 或 "monorepo"
    "language": "typescript",     // 开发语言
    "packageManager": "pnpm"      // 包管理器
  }
}
```

### 支持的语言

| 语言 | 有预置模板 | 推荐包管理器 |
|------|-----------|-------------|
| typescript | ✅ | pnpm |
| javascript | ✅ | pnpm |
| go | ✅ | go |
| python | ❌ (LLM生成) | poetry |
| java | ❌ (LLM生成) | gradle |
| dotnet | ❌ (LLM生成) | dotnet |
| other | ❌ (LLM生成) | - |

对于没有预置模板的语言，`apply` 命令会输出提示，LLM 应根据 `templates/llm-init-guide.md` 生成配置文件。

### LLM 引导

如果使用 AI 助手进行初始化，可参考：
- `templates/conversation-prompts.md` 中的 E 模块（技术栈选择引导）
- `templates/llm-init-guide.md` 中的 Phase 2 和 Phase 5

---

## Add-on flags (optional)

In the module-first template, some capabilities are **core** and already present in the repository.

### Core capability flags (backward compatible)

These flags are supported for backward compatibility, but they do not install files from `addons/` in this template version:

- `addons.contextAwareness`
  - Default: enabled
  - Set to `false` to skip context-related init steps (files remain present)
- `addons.dbMirror`
- `addons.ciTemplates`

### Non-core add-ons

Non-core add-ons that *do* live under `addons/` and can be installed during Stage C:

- `addons.packaging`
- `addons.deployment`
- `addons.release`
- `addons.observability`


---

## User approval checkpoint (advance to Stage C)

After the user explicitly approves the blueprint, record approval and advance:

```bash
node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs approve --stage B --repo-root .
```

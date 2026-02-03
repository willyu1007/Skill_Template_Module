# Dev-docs / Handbook 命名统一（模板仓库）

## 结论

- 任务型上下文目录统一为 `dev-docs/`（替代旧命名，不并存）。
- Feature 产出的运行手册/清单/证据目录统一为 `handbook/`（替代旧命名，不做兼容检测）。
- 目标：模板仓库内一致性；允许一次性迁移；不设兼容期。

## 目录约定

- 模块任务文档：`modules/<module_id>/dev-docs/`
- 集成任务文档：`modules/integration/dev-docs/`
- 临时任务产物：`.ai/.tmp/dev-docs/`
- Feature 输出示例：
  - `ci/handbook/`
  - `ops/packaging/handbook/`
  - `ops/deploy/handbook/`
  - `release/handbook/`
  - `observability/handbook/`
  - `db/handbook/`

## 待确认问题（已确认）

1. `dev-docs/` 的语义与旧命名一致；维护两套命名反而更麻烦。
2. 可以接受一次性迁移。
3. 不需要兼容期。
4. modules 继续使用 `modules/<module_id>/dev-docs/`。
5. features 的 `handbook/` 统一层级。
6. 目标是模板仓库内一致性。

## 维护者验证

- `node .ai/scripts/lint-skills.mjs --strict`
- `node .ai/scripts/sync-skills.mjs --scope current --providers both --mode reset --yes`
- 内容搜索（应为 0）：`rg --hidden -n "<legacy-token>" -i .`
- 路径搜索（应为空）：`Get-ChildItem -Recurse -Force | ? { $_.FullName -match '(?i)<legacy-token>' }`

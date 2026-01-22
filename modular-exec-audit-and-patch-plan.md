# 模块化执行链条审计与修改策略（模板 repo）

> 目标：以“模块是起点 → 功能开发 → 冲突检验 → 维护项目级 SSOT → 回到模块”这一**执行链条**为主线，梳理本次对 `.ai/skills/module/`、`.ai/skills/features/`、`.ai/scripts/` 的系统性发现与修改策略，并记录关键共识，支撑后续多轮讨论。

- 基于仓库：`Skill_Template_Module`
- 生成日期：2026-01-22

---

## 0. 已确认决策（本次讨论的约束）

1. **ID 命名规范统一为 `kebab-case`**  
   - 目标：消除 snake_case / dot.separated 等混用带来的歧义、脚本分支复杂度与目录命名冲突。
2. **lint 不作为默认 CI gate（模板 repo）**  
   - `--strict` 模式由使用者**手动选择**；默认模式允许 warning，不应阻断模板使用。
3. **`participates_in` 升级为工具链一等公民**  
   - 当 `participates_in` **非空**时，必须参与一致性检验；为空时不强制。

---

## 1. 执行链条总览（工具/SSOT/派生物）

### 1.1 链条与对应资产

| 执行环节 | 人/LLM动作起点 | SSOT | 派生物（可覆盖生成） | 关键工具 |
|---|---|---|---|---|
| 模块为起点 | `modules/<module_id>/` | `modules/<module_id>/MANIFEST.yaml`、`modules/<module_id>/interact/registry.json` | `.system/modular/instance_registry.yaml`、`docs/context/registry.json` | `modulectl`、`contextctl` |
| 功能开发 | 在模块内增量迭代接口/实现 | `MANIFEST.yaml`（interfaces/implements/participates_in 等） | `.system/modular/flow_impl_index.yaml`、graphs | `modulectl registry-build`、`flowctl update-from-manifests` |
| 冲突检验 | DB/Env/Obs slice 维护 | `docs/context/*`（contracts）+ `MANIFEST.yaml`（slice 声明） | `modules/<id>/interact/*-slice.json` | `dbssotctl-module` / `env-contractctl-module` / `obsctl-module` |
| 维护项目级 SSOT | 更新 flow_graph/bindings/scenarios | `.system/modular/flow_graph.yaml`、`.system/modular/flow_bindings.yaml`、`modules/integration/scenarios.yaml` | `.system/modular/flow_impl_index.yaml`、`modules/integration/compiled/*.json` | `flowctl lint`、`integrationctl validate/compile` |
| 回到模块 | 归档、回填、对齐边界 | 模块 workdocs / AGENTS / ABILITY | graphs/reports | `update-workdocs-for-handoff`（如果启用） |

---

## 2. 阶段一：模块为起点（Module-first）——发现与修改策略

### 2.1 发现：ID 规范冲突导致“起点不稳定”

**现象与证据**

- 目前 `module_id` 推荐正则为：`^[a-z0-9][a-z0-9._-]{1,62}[a-z0-9]$`  
  - 来源：  
    - `.ai/scripts/lib/modular.mjs`（`isValidModuleId`）  
    - `.ai/scripts/modules/modulectl.mjs` usage/error 文案  
    - `.ai/skills/module/initialize-module-instance/SKILL.md` Inputs
- 示例/文档中大量使用 `billing.api` / `example.api`（dot.separated）：
  - `QUICKSTART.md`
  - `.ai/skills/module/initialize-module-instance/examples/example-api/**`
  - `.ai/skills/features/context-awareness/scripts/contextctl.mjs` 示例命令
- 但是仓库内的文档目录命名 lint（`lint-docs.mjs`）默认强制 **kebab-case**（目录），dot 不适合作为模块目录名：  
  - 这会让“模块目录名（modules/<id>）”和“脚本允许的 module_id”之间产生**规范漂移**。

**影响**

- LLM 在 `modulectl init` 的第一步就面临：
  - 文档示例建议 `billing.api`
  - 但 repo 的目录命名规范偏向 `kebab-case`
- 在模块化系统里，`module_id` 同时是：
  - 目录名（路径 SSOT）
  - endpoint_id 前缀（`<module_id>:<interface_id>`）
  - runtime env key 的输入（`MODULE_BASE_URL_<SANITIZED>`）
  - 多处脚本/技能的索引键  
  任何不一致都会放大 LLM 的不确定性，降低执行鲁棒性。

### 2.2 修改策略（落地到代码/文档/示例）

**策略 A：统一 ID 的“原子形态”为 kebab-case**

- 建议统一规则（可落地为一个公共校验函数）：
  - **kebab-case 原子 ID**：`^[a-z0-9]+(?:-[a-z0-9]+)*$`
  - 建议长度约束：`3..64`（与现有约束接近）
- 适用范围（建议全部统一，以减少“半统一”造成的认知成本）：
  - `module_id`
  - `flow_id`
  - `node_id`
  - `scenario.id`
  - `binding.id`
  - `artifactId`（context registry）
  - `environment.id`（如 `dev`、`qa`、`staging`）

**策略 B：对“复合引用”允许 `.` 作为分隔符，但分隔的每一段都必须是 kebab-case**

- 例如 `flow_node: <flow_id>.<node_id>` 仍可使用点分割（因为它不是原子 id，而是复合引用格式）。
- 该策略不与“原子 ID kebab-case”冲突，且保留可读性。

**需要修改的关键位置（P0）**

- `.ai/scripts/lib/modular.mjs`
  - 更新 `isValidModuleId`（或重命名为 `isValidKebabId` 并统一引用）
  - 更新 `validateManifest` 的错误信息中展示的 regex
- `.ai/scripts/modules/modulectl.mjs`
  - usage 中 `billing.api` → `billing-api`
  - `--module-id` 校验错误提示 regex 更新
- `.ai/scripts/modules/integrationctl.mjs`
  - 当前用 `isValidModuleId` 校验 **scenario id** 与 **flow id**（语义上不严谨）
  - 建议：引入通用 `isValidKebabId`，分别用于 `scenarioId / flowId`
- `.ai/skills/module/initialize-module-instance/SKILL.md`
  - Inputs 中 pattern 更新为 kebab-case
  - 文中示例命令/路径全部更新为 kebab-case
- `QUICKSTART.md`
  - `billing.api`、`billing_flow`、`create_invoice` 等示例更新（详见第 5 节）
- `.system/modular/flow_graph.yaml`、`.system/modular/flow_bindings.yaml` 文件头注释示例（模板 SSOT）
  - 当前指南允许 snake_case/dot.separated，需要更新为 kebab-case

**兼容与迁移建议（P1）**

- 如果已有用户 repo 存在 dot/snake_case：
  - 提供迁移 checklist（改目录名、改 manifest module_id、重建 registry/index、更新 scenarios/bindings）。
  - 模板 repo 可以提供一个“迁移说明段落”，不一定要提供自动迁移脚本。

---

## 3. 阶段二：功能开发（接口实现、参与流）——发现与修改策略

### 3.1 发现：`participates_in` 目前“写了等于没写”

**现象与证据**

- `participates_in` 仅在示例 manifest 中出现：  
  - `.ai/skills/module/initialize-module-instance/examples/example-api/MANIFEST.yaml`
- 工具链当前完全不读取/不校验 `participates_in`：
  - `.ai/scripts/lib/modular.mjs` 的 `validateManifest` **不验证**该字段
  - `.ai/scripts/modules/modulectl.mjs registry-build` **不输出**该字段到 `.system/modular/instance_registry.yaml`
  - `.ai/scripts/modules/flowctl.mjs` 的 lint/update-from-manifests **不会引用**该字段

**影响**

- LLM 被技能/示例引导去填写 `participates_in`，但工具链无法给任何反馈：
  - 容易产生“我做了正确动作但系统无响应”的挫败感
  - 增加“模块化是装饰品”风险：字段长期漂移、无人维护，最终失去价值

### 3.2 修改策略：把 `participates_in` 纳入一致性闭环（仅非空时）

> 目标：让 LLM 在“写 SSOT → 跑工具 → 得反馈”链条里，能对 `participates_in` 的正确性形成可执行闭环。

**建议定义：`participates_in` 的语义**

- 定位：**模块级快速索引（quick lookup）**，描述模块参与哪些 flow/node、扮演何种角色（primary/secondary/consumer等）
- 规则（与决策 3 对齐）：
  - 为空：允许，不参与一致性检验
  - 非空：必须满足：
    1) 每个条目引用的 `flow_id/node_id` 在 `flow_graph.yaml` 中存在  
    2) 每个条目在本模块 `interfaces[].implements[]` 中至少有一个对应实现（同一 flow/node）  
       - 这是“participates_in 与 implements 的一致性”  
    3) role（如存在）必须是允许集合之一（建议：`primary|secondary|consumer|producer|observer`，或先不做枚举只做 string，但要一致）

**落地建议：在哪些工具里做检查**

- `modulectl verify`（模块级）
  - 校验：manifest 内部一致性  
    - `participates_in` 非空时：每条必须能在 `interfaces[].implements[]` 中找到匹配 flow/node
- `modulectl registry-build`（派生 registry）
  - 生成：将 `participates_in` 写入 `.system/modular/instance_registry.yaml`  
    - 便于后续 flowctl lint 做项目级一致性校验
- `flowctl lint`（项目级）
  - 校验：跨 SSOT 一致性  
    - `participates_in` 引用的 flow/node 必须存在于 `flow_graph.yaml`
    - （可选增强）该 flow/node 在 `flow_impl_index.yaml` 中应能找到该 module 的至少一个 endpoint 实现

**需要修改的关键位置（P0）**

- `.ai/scripts/lib/modular.mjs`
  - `validateManifest()` 增加 `participates_in` 结构校验（仅当字段存在且非空）
  - 建议新增 helper：`normalizeParticipatesInEntry`
- `.ai/scripts/modules/modulectl.mjs`
  - `registry-build` 输出增加 `participates_in`
  - `verify` 增加 `participates_in` 与 `implements` 的一致性检查（非空才启用）
- `.ai/scripts/modules/flowctl.mjs`
  - `lint` 读取 instance_registry 中的 `participates_in`，对照 flow_graph 校验（非空才启用）

**文档/示例同步（P0）**

- 更新示例：
  - `example.api` → `example-api`
  - `user_management` → `user-management`
  - `create_user` → `create-user`
- 明确：推荐优先维护 `interfaces[].implements[]`，`participates_in` 是“摘要索引”，不允许与实现漂移。

---

## 4. 阶段三：冲突检验（DB / Env / Observability slices）——发现与修改策略

### 4.1 发现：模块级技能与 lint 规范不一致，strict 下会阻断

**现象（已复现实测）**

- 执行 `node .ai/scripts/lint-skills.mjs --strict` 会失败（warnings treated as errors）：
  - `module/manage-db-module-slices/` ⚠ Missing `## Boundaries`
  - `module/manage-env-module-slices/` ⚠ Missing `## Boundaries`
  - `module/manage-observability-module-slices/` ⚠ Missing `## Boundaries`

**影响**

- 模板 repo 若默认在 CI 里使用 strict lint，会让用户在“还没开始写业务”时就被阻断。  
- 即便决策 2 已明确“lint 不作为默认 CI gate”，但在 **LLM 执行视角**下：
  - LLM 往往会自发跑 `--strict` 作为“自证正确性”，一旦失败会产生不必要的回滚/犹豫。

### 4.2 修改策略：补齐 Boundaries + 明确缺失契约时的下一步

**P0：补齐三份技能的 `## Boundaries`**

- 将现有 `## Non-negotiable constraints` 内容：
  - 直接改名为 `## Boundaries`，或
  - 保留原段落，同时新增 `## Boundaries` 并迁移关键约束（推荐：统一为 Boundaries）

**P0：当契约缺失时，技能必须给出“下一条可执行命令”**

- `manage-env-module-slices` 当前要求 `env/contract.yaml`，但模板 repo 默认并不包含该文件  
  - 正确的“下一步可执行命令”应指向 `env-contractctl init`（见 `.ai/skills/features/environment/env-contractctl/SKILL.md`）
- 建议在 `manage-env-module-slices` 的 Phase 0 增补：
  - 若 `docs/project/env-ssot.json` 缺失：先用 env-contractctl init scaffold
  - 然后再回到 module slice
- `manage-db-module-slices` 已给出 `dbssotctl sync-to-context`，但建议明确“该命令会生成 docs/context/db/schema.json”（让 LLM 更有把握）
- `manage-observability-module-slices` 已给出 init/verify/conflicts 命令链，结构较好；仅需补 Boundaries 与少量措辞优化（见 4.3）

### 4.3 发现：`lint-docs --strict` 在两处技能文档会失败（“this” 过多）

**现象（已复现实测）**

- `node .ai/scripts/lint-docs.mjs --strict` warnings：
  - `.ai/skills/features/context-awareness/SKILL.md`：Frequent use of vague reference "this"
  - `.ai/skills/module/manage-observability-module-slices/SKILL.md`：同上

**修改策略（P1，低成本）**

- 将多处 “this …” 改为更明确的名词短语（the feature / the module / the workflow）
- 目的：即便 strict 不作为默认 gate，也避免 LLM 在“自检”时被无意义阻断。

### 4.4 发现：Observability ownership 冲突检测可能出现“指标名/字段名同名”误报

**现象与根因**

- `.ai/scripts/modules/obsctl-module.mjs` 将 metrics 与 logs 的 owns 合并在同一 `owns` 数组：
  - `owns: [...metricsOwns, ...logsOwns]`
- `slice-controller` 的 ownership 冲突检测按 `key` 去重；如果存在：
  - metric 名称 = log field 名称（例如都叫 `requests_total`），会被判定为“多个 owner”，属于 **跨命名空间误报**。

**修改策略（P2，增强鲁棒性）**

- 对 owns key 做命名空间隔离：
  - metric 采用 `metric:<name>`
  - log field 采用 `log:<name>`
- 同时让 conflicts 输出在报表中保留原始类型信息，避免排查成本。

---

## 5. 阶段四：维护项目级 SSOT（flow_graph / bindings / scenarios）——发现与修改策略

### 5.1 发现：项目 SSOT 的命名指南与决策 1 冲突

**现象**

- `.system/modular/flow_graph.yaml` 文件头写明：
  - “IDs are stable, machine-friendly (snake_case or dot.separated)”
- `.system/modular/flow_bindings.yaml` 示例使用 `order.place_order_default`、`order_fulfillment`、`place_order` 等
- 维护 flow 的 skill 示例也使用 snake_case：
  - `.ai/skills/module/maintain-flow-graph/examples/user_management_flow.yaml`
- integration scenarios 示例同样使用 snake_case：
  - `.ai/skills/module/manage-integration-scenarios/examples/user_management_scenarios.yaml`

**影响**

- “项目级 SSOT”是模块化系统的中心索引。若这里的命名不统一：
  - LLM 在 implements / bindings / scenarios 的交叉引用上容易出错（拼写、下划线/连字符混用）
  - 造成工具链错误（unknown node/flow），并降低对模块化的信任感

### 5.2 修改策略：全链路改为 kebab-case，并补齐校验

**P0：更新所有模板/示例到 kebab-case**

- flow_id：`user-management`、`order-fulfillment`
- node_id：`create-user`、`place-order`
- scenario id：`create-and-retrieve-user`（替代 `create_and_retrieve_user`）
- binding id：`order-place-order-default`（替代 dot/snake_case）

**P0：在 `flowctl lint` 增加命名校验（推荐）**

- 目前 `validateFlowGraph` 不检查命名格式，仅检查重复和引用存在性
- 建议增加 “kebab-case” 格式校验：
  - 对 flows[].id、nodes[].id、edges.from/to
- 与决策 2 不冲突：  
  - 默认 lint 不作为 CI gate，但它仍然是 LLM 执行的“确定性反馈工具”。

### 5.3 发现：integrationctl 的 new-scenario 校验函数语义不匹配

**现象**

- `.ai/scripts/modules/integrationctl.mjs new-scenario` 使用 `isValidModuleId` 校验：
  - scenarioId
  - flowId

**影响**

- 语义上会让 LLM 误以为：
  - scenario id / flow id 与 module id 使用不同命名规范或受限范围不同
- 未来若 `isValidModuleId` 收紧（kebab-case），这个复用会变得更“偶然正确”，但语义仍不清晰。

**修改策略（P0）**

- 引入并使用 `isValidKebabId`（或 `isValidId`）：
  - `scenarioId`、`flowId`、（建议新增）`nodeId` 校验
- 同时在 `new-scenario --nodes` 的 best-effort 校验中，也提示 kebab-case。

### 5.4 发现：skills 默认使用 `--strict`，与决策 2 不一致

**具体位置**

- `.ai/skills/module/maintain-flow-graph/SKILL.md`
  - Procedure Step 4：`flowctl lint --strict`
  - Verification：`lint --strict`
- `.ai/skills/module/manage-integration-scenarios/SKILL.md`
  - Verification：`integrationctl validate --strict`
- `.ai/skills/module/initialize-module-instance/SKILL.md`
  - Step 2：`modulectl verify --strict`
  - Step 3：未标 strict，但包含 lint

**修改策略（P0）**

- 将默认命令改为非 strict：
  - `flowctl lint`
  - `integrationctl validate`
  - `modulectl verify`
- 在同一段落追加：
  - “如需把 warning 当错误处理，可加 `--strict`（适合成熟 repo 或 CI）”

---

## 6. 阶段五：回到模块（收敛、再进入下一轮）——发现与修改策略

### 6.1 发现：模块初始化流程中存在“重复命令/不必要命令链”风险

**现象**

- `modulectl init --apply` 内部已经做了：
  - `registry-build`（quiet）
  - `contextctl build`
  - `flowctl update-from-manifests`
- 但 `initialize-module-instance` skill 的 Step 3 又要求手动执行：
  - `modulectl registry-build`
  - `flowctl update-from-manifests`
  - `flowctl lint`
  - `contextctl build`

**影响**

- LLM 可能把“重复命令链”当作必须，增加执行成本和噪声
- 更关键的是：当命令链出现任何一处非零（例如 lint warnings），LLM 可能对“模块初始化是否成功”产生误判

**修改策略（P1）**

- 在 `initialize-module-instance` skill 的 Step 3 明确拆分：
  - **必须**：`flowctl lint`（因为 init 内部未 lint）
  - **条件执行**：如果 init 后又改了 manifest/flow，则再跑 `registry-build`/`update-from-manifests`/`contextctl build`
- 目标：让 LLM 能“最短路径”完成闭环。

---

## 7. 变更清单（按目录归档，便于落地）

> 这里按你指定的三个目录为主进行归档，同时列出少量必需的 SSOT 示例文件修改点。

### 7.1 `.ai/scripts/`（P0 优先）

- `.ai/scripts/lib/modular.mjs`
  - [ ] ID regex：kebab-case
  - [ ] `validateManifest` 增加 `participates_in` 校验（仅非空）
- `.ai/scripts/modules/modulectl.mjs`
  - [ ] usage 文案、错误提示、示例 module_id 更新为 kebab-case
  - [ ] `registry-build` 输出增加 `participates_in`
  - [ ] `verify` 增加 participates_in ↔ implements 一致性校验（仅非空）
- `.ai/scripts/modules/flowctl.mjs`
  - [ ] `lint` 增加 flow/node id kebab-case 校验
  - [ ] `lint` 增加 participates_in（来自 instance_registry）的存在性校验（仅非空）
- `.ai/scripts/modules/integrationctl.mjs`
  - [ ] `new-scenario` 使用通用 ID 校验函数，避免复用 `isValidModuleId`
- `.ai/scripts/modules/obsctl-module.mjs`（P2）
  - [ ] ownership key namespace 化，避免 metric/log 同名误报

### 7.2 `.ai/skills/module/`（P0 优先）

- `initialize-module-instance/SKILL.md`
  - [ ] module_id pattern/示例全面改为 kebab-case
  - [ ] 默认命令去除 `--strict`（或标注为可选）
  - [ ] Step 3 精简为“必要与条件命令”
- `maintain-flow-graph/SKILL.md`
  - [ ] 默认 lint 命令去 strict，strict 作为可选
  - [ ] 文档中强调 flow/node id kebab-case
- `maintain-flow-graph/examples/*.yaml`
  - [ ] `user_management` 等改为 kebab-case
- `manage-integration-scenarios/SKILL.md` + examples
  - [ ] scenario/flow/node/endpoint 示例改为 kebab-case
  - [ ] 默认 validate 去 strict，strict 可选
- `manage-*-module-slices/SKILL.md`（DB/Env/Obs）
  - [ ] 补齐 `## Boundaries`
  - [ ] “契约缺失时的下一步命令”补齐（尤其 env）
  - [ ] 消除 lint-docs strict 的 “this” 触发点（P1）

### 7.3 `.ai/skills/features/`（P0/P1）

- `features/context-awareness/SKILL.md`
  - [ ] 轻量改写，避免 “this” 在 strict 下触发（P1）
  - [ ] 明确“environments（部署环境）”与“env contract（环境变量契约）”的区别（P1）
- `features/context-awareness/scripts/contextctl.mjs`
  - [ ] 示例命令中的 `billing.api` 改为 `billing-api`
  - [ ] （可选）统一 ID 校验函数到 `.ai/scripts/lib/modular.mjs` 的 kebab-case 规则（P1）
- `features/ci/*`
  - [ ] 文档中不要把 lint 作为默认 gate（与决策 2 对齐）
  - [ ] `--strict` 标注为“成熟 repo/用户选择项”

### 7.4 必需的 SSOT 模板文件（虽不在三目录内，但必须同步）

- `.system/modular/flow_graph.yaml`
  - [ ] 注释/指南改为 kebab-case
- `.system/modular/flow_bindings.yaml`
  - [ ] 示例改为 kebab-case
- `QUICKSTART.md`
  - [ ] 所有示例 id 改为 kebab-case

---

## 8. 手动验收清单（不作为默认 CI gate，但供模板使用者/LLM自检）

> 与决策 2 对齐：默认不 strict；严格模式由使用者选择。

### 8.1 默认（推荐）

```bash
node .ai/scripts/lint-skills.mjs
node .ai/scripts/lint-docs.mjs

node .ai/scripts/modules/modulectl.mjs verify
node .ai/scripts/modules/modulectl.mjs registry-build
node .ai/scripts/modules/flowctl.mjs update-from-manifests
node .ai/scripts/modules/flowctl.mjs lint

node .ai/scripts/modules/integrationctl.mjs validate
node .ai/scripts/modules/integrationctl.mjs compile
```

### 8.2 严格模式（用户选择）

```bash
node .ai/scripts/lint-skills.mjs --strict
node .ai/scripts/lint-docs.mjs --strict

node .ai/scripts/modules/modulectl.mjs verify --strict
node .ai/scripts/modules/flowctl.mjs lint --strict
node .ai/scripts/modules/integrationctl.mjs validate --strict
```

---

## 9. 关键共识记录（用于后续讨论）

- **共识 1**：ID 统一 kebab-case 是模块化成功的“低成本高收益”基础改动  
  - 涉及：模块目录、flow/node 引用、bindings、scenarios、脚本校验、示例一致性
- **共识 2**：模板 repo 的“默认体验”必须是**不被 lint 阻断**  
  - strict 属于“成熟项目/用户选择”，而不是模板开箱 gate
- **共识 3**：`participates_in` 如果保留在 MANIFEST（SSOT），必须进入工具链校验闭环  
  - 否则会变成漂移字段，降低模块化系统的可信度

---

## 10. 下一轮讨论建议（可选议题）

1. **ID 规则的边界**：interface_id 是否也要求纯 kebab-case（不含 `.`）？还是允许“kebab-case 分段 + 分隔符”？  
2. **participates_in 的维护策略**：是否允许工具自动从 implements 反推并生成（避免人为漂移）？  
3. **obs namespace 的冲突策略**：是否需要更强的“类型系统/namespace”机制，扩展到 db/env 的 owns/uses 统一模型？


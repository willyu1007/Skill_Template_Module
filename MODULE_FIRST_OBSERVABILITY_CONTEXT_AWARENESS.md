---
title: Observability 模块化增强方案 & Context Awareness 流程规范
status: draft
audience: repo maintainers / module owners / LLM agents
---

# Observability 模块化增强方案 & Context Awareness 流程规范

本文档给出两部分内容：
1) **Observability 的模块化增强方案**（参照 DB/Env 的 owns/uses + slice 机制，粒度适中）。  
2) **Context Awareness 的规范化/流程增强方案**（强化“模块边界 + 上下文加载”目标，减少漂移）。

> 约束：`workdocs/` 不是 SSOT，可能归档/删除；本文所有 SSOT 设计均落在 `docs/context/**`、`modules/<module_id>/MANIFEST.yaml`、`modules/<module_id>/interact/registry.json` 等长期路径。

---

## 术语与原则（统一口径）

### 术语

- **SSOT**：Single Source of Truth（长期、可验证、不可随意覆盖的来源）。
- **Derived**：派生/聚合产物（可覆盖/可再生成）。
- **Module Slice**：从 repo 级合同/SSOT 抽取的“模块相关子集”，用于 LLM 上下文高密度加载；**不是 SSOT**。
- **Module Registry**：`modules/<module_id>/interact/registry.json`（模块级 SSOT：声明该模块有哪些上下文产物）。

### 总原则（与 DB/Env 一致）

1. **合同/标准在 repo 级**（可全局验证、可 CI 门禁）。  
2. **模块只声明“边界 + 依赖”**（owns/uses/requires），并输出 slice（给 LLM 用）。  
3. **冲突要可检测**（例如同一指标/字段被多个模块宣称 owns）。  
4. **slice 与 workdocs/evidence 解耦**：slice 落在 `modules/<module_id>/interact/`，而非 `workdocs/`。

---

# Part A — Observability 模块化增强方案（建议落地）

## A1. 目标（Goals）

- 让每个模块显式声明自己在 Observability 合同中的 **owns / uses / requires**（边界语义清晰）。
- 能在合并前自动发现 **归属冲突**（同一 metric/log-field 被多个模块 owns）。
- 为 LLM 生成每个模块的 **observability-slice**，降低全量合同加载成本。

## A2. 非目标（Non-goals）

- 不在本方案中强制校验“代码是否真的打点/打日志”（那需要语言/框架层的静态检查或运行时探针）。
- 不把 slice 当成 SSOT；slice 永远可再生成。
- 不改变现有 `obsctl` 的职责：`obsctl` 仍用于维护 repo 级合同（指标/日志字段/trace 配置）。

## A3. SSOT 边界与目录结构（建议保持清晰）

### Repo 级（合同 / SSOT）

- `docs/context/observability/metrics-registry.json`（指标合同）
- `docs/context/observability/logs-schema.json`（结构化日志字段合同）
- `docs/context/observability/traces-config.json`（trace 配置合同）
- 维护工具：`node .ai/skills/features/observability/scripts/obsctl.mjs ...`

### Module 级（边界声明 / SSOT）

- `modules/<module_id>/MANIFEST.yaml`（新增 `observability.*` 声明）
- `modules/<module_id>/interact/registry.json`（登记 slice 产物）

### Module 级（slice / 非 SSOT）

- `modules/<module_id>/interact/observability-slice.json`（建议默认输出）

## A4. MANIFEST.yaml 扩展（粒度适中）

> 设计目标：**低摩擦**（支持 string/object 两种写法）、**可验证**（名字必须存在于合同）、**可冲突检测**（owns 唯一）。

建议在 `modules/<module_id>/MANIFEST.yaml` 增加：

```yaml
observability:
  metrics:
    owns:
      - http_requests_total
      - name: billing_request_duration_seconds
    uses:
      - auth_login_total
  logs:
    owns:
      - billing_account_id
    requires:
      - trace_id
      - service
```

规则（MUST/SHOULD）：
- `observability.metrics.owns` 中的每个 metric **MUST** 存在于 `docs/context/observability/metrics-registry.json`。
- `observability.logs.owns/requires` 中的每个字段 **MUST** 存在于 `docs/context/observability/logs-schema.json`。
- 同一 `metric` 或 `log field` **MUST NOT** 被多个模块同时声明为 `owns`（所有权唯一）。
- `uses/requires` 可以被多个模块引用；这是依赖关系，不冲突。

> Trace 的模块化：本方案先不引入 `traces.owns/uses`（避免过度设计）。Trace 合同仍为全局共享；模块可通过 `logs.requires` 明确要求 `trace_id` 等关键字段，达到“模块边界内可观测性最低标准”的目的。

## A5. 新增工具脚本（建议）

参照 `dbssotctl-module` / `env-contractctl-module` 的模式，建议新增：

- `.ai/scripts/modules/obsctl-module.mjs`

职责（与 DB/Env 同构）：

| 命令 | 作用 |
|---|---|
| `status` | 概览：合同是否存在、模块声明数量、owner 统计 |
| `verify [--strict]` | 校验声明引用的 metric/log-field 是否存在、结构是否正确 |
| `conflicts` | 输出 owns 冲突（同名 metric/field 多 owner） |
| `export-slice --module-id <id> [--out <path>]` | 生成单模块 slice（stdout 或文件） |
| `sync-slices [--module-id <id>] [--out-dir <path>] [--no-registry]` | 批量写入 `modules/<id>/interact/observability-slice.json` 并（可选）更新 registry |

默认输出（建议与现有 DB/Env 一致）：
- slice：`modules/<module_id>/interact/observability-slice.json`
- registry 更新：写入 `artifactId = "observability-slice"`（type=`json`，mode=`generated`）

## A6. Slice 结构（建议）

`modules/<module_id>/interact/observability-slice.json`（示例结构）：

```json
{
  "version": 1,
  "moduleId": "billing.api",
  "updatedAt": "2026-01-22T00:00:00.000Z",
  "contract": {
    "metrics": "docs/context/observability/metrics-registry.json",
    "logs": "docs/context/observability/logs-schema.json",
    "traces": "docs/context/observability/traces-config.json"
  },
  "metrics": {
    "owns": ["http_requests_total"],
    "uses": ["auth_login_total"]
  },
  "logs": {
    "owns": ["billing_account_id"],
    "requires": ["trace_id", "service"]
  }
}
```

> 注意：slice 的内容可以“引用合同文件路径”，但不要复制全量合同；目标是让 LLM 在模块内只加载与模块相关的少量条目。

## A7. 标准流程（Happy Path）

### 场景 1：模块要新增一个 metric 或 log field

1. **先改合同（repo 级 SSOT）**：  
   - `node .ai/skills/features/observability/scripts/obsctl.mjs add-metric ...` 或 `add-log-field ...`
2. **模块声明边界**：在 `modules/<module_id>/MANIFEST.yaml` 里把新增项加入 `observability.metrics.owns` / `observability.logs.owns`。
3. **验证与冲突检查（必须）**：  
   - `node .ai/scripts/modules/obsctl-module.mjs verify --strict`  
   - `node .ai/scripts/modules/obsctl-module.mjs conflicts`
4. **生成 slice（写入）**：  
   - `node .ai/scripts/modules/obsctl-module.mjs sync-slices --module-id <module_id>`
5. **聚合上下文（建议）**：  
   - `node .ai/skills/features/context-awareness/scripts/contextctl.mjs build`  
   - `node .ai/skills/features/context-awareness/scripts/contextctl.mjs verify --strict`

### 场景 2：模块仅依赖其他模块的指标/字段（不新增合同）

1. 在 `MANIFEST.yaml` 里更新 `observability.metrics.uses` / `observability.logs.requires`。
2. `verify --strict` + `sync-slices --module-id ...`。

## A8. 建议新增 Skill（强约束流程）

为让 LLM/团队可重复执行，建议新增：

- `.ai/skills/module/manage-observability-module-slices/SKILL.md`

内容结构可与 `manage-db-module-slices`、`manage-env-module-slices` 保持一致（Phase 0-4、冲突门禁、sync-slices 需显式批准等）。

## A9. 可验证清单（Verification）

- [ ] `docs/context/observability/*` 合同存在且 `obsctl verify` 通过  
- [ ] `obsctl-module verify --strict` 无错误  
- [ ] `obsctl-module conflicts` 无 owns 冲突  
- [ ] `modules/<module_id>/interact/observability-slice.json` 生成并被 registry 收录  
- [ ] `contextctl build` 后，派生 `docs/context/registry.json` 覆盖该 slice（如果聚合策略包含模块 registry）

---

# Part B — Context Awareness 规范化 / 流程增强方案（建议落地）

## B1. 现状基线（以实现为准）

`contextctl` 的 SSOT/派生结构（以 `.ai/skills/features/context-awareness/scripts/contextctl.mjs` 注释为准）：

- **Project 级 SSOT registry**：`docs/context/project.registry.json`
- **Module 级 SSOT registry**：`modules/<module_id>/interact/registry.json`
- **Derived 聚合 registry**：`docs/context/registry.json`

LLM 的 canonical 入口（已有约定）：
- `docs/context/INDEX.md`
- `docs/context/registry.json`

## B2. 核心规范（必须统一）

### 规范 1：产物落点（Where）

- **模块相关产物**（API/openapi、db/env/obs slice、模块流程图、模块 config 摘要等）**SHOULD** 落在：  
  - `modules/<module_id>/interact/**`
- **项目级产物**（跨模块流程、全局标准、全局合同）**SHOULD** 落在：  
  - `docs/context/**`

### 规范 2：登记机制（Registry First）

任何新产物加入后，必须登记到 registry（否则 LLM/CI 无法可靠发现）：

- 模块产物：登记到 `modules/<module_id>/interact/registry.json`  
  - `node .ai/skills/features/context-awareness/scripts/contextctl.mjs add-artifact --module-id <module_id> ...`
- 项目产物：登记到 `docs/context/project.registry.json`（默认 `--module-id project`）  
  - `node .ai/skills/features/context-awareness/scripts/contextctl.mjs add-artifact ...`

### 规范 3：派生文件不可手改（Derived is Overwritable）

- `docs/context/registry.json` 是派生文件：**MUST NOT** 手工编辑。  
  - 只能通过：`node .ai/skills/features/context-awareness/scripts/contextctl.mjs build`

### 规范 4：checksum 门禁（Touch after edit）

任何 `docs/context/**` 或 `modules/<module_id>/interact/**` 的 artifact 文件被修改后：

- **MUST**：`node .ai/skills/features/context-awareness/scripts/contextctl.mjs touch`（或带 `--module-id` 只触摸某模块）
- **MUST**：`node .ai/skills/features/context-awareness/scripts/contextctl.mjs verify --strict`

## B3. 标准工作流（Happy Path）

### 工作流 1：模块新增/更新一个 interact 产物（例如 openapi、slice）

1. 把文件写入：`modules/<module_id>/interact/<artifact>`  
2. 登记/更新 registry：  
   - `contextctl add-artifact --module-id <module_id> --artifact-id <id> --type <type> --path modules/<module_id>/interact/<artifact>`
3. touch + verify：  
   - `contextctl touch --module-id <module_id>`  
   - `contextctl verify --strict`
4. （可选）全局聚合：  
   - `contextctl build`

### 工作流 2：项目级 docs/context 产物变更

1. 修改 `docs/context/**` 的文件（合同/文档）
2. `contextctl touch` + `contextctl verify --strict`
3. `contextctl build`（更新派生 registry）

### 工作流 3：模块 slice 的推荐顺序（DB/Env/Obs 同构）

1. 确保合同/SSOT 已更新（repo 级）。  
2. 模块在 `MANIFEST.yaml` 声明 owns/uses/requires。  
3. 执行 module-ctl：`verify --strict` → `conflicts` → `export-slice`（预览）→ `sync-slices`（写入）。  
4. `contextctl build`（聚合）→ `contextctl verify --strict`。

## B4. CI 门禁建议（与模块边界一致）

最小门禁（推荐）：

- `node .ai/skills/features/context-awareness/scripts/contextctl.mjs verify --strict`
- `node .ai/scripts/projectctl.mjs verify`

如果启用了模块化脚本（推荐逐步纳入）：
- `node .ai/scripts/modules/modulectl.mjs verify --strict`
- `node .ai/scripts/modules/flowctl.mjs lint --strict`
- `node .ai/scripts/modules/integrationctl.mjs validate --strict`
- `node .ai/scripts/modules/dbssotctl-module.mjs verify --strict`
- `node .ai/scripts/modules/env-contractctl-module.mjs verify --strict`
- `node .ai/scripts/modules/obsctl-module.mjs verify --strict`（落地后）

## B5. “Generated mode / update” 文档漂移（需要决策）

当前 `context-awareness` 的 reference 文档提到：
- `contextctl.mjs update --allow-shell`

但 `contextctl.mjs` 实现中**没有** `update` 命令（以 `--help` 为准）。

建议二选一（MUST 做出决策，否则会持续误导）：
1) **实现 `update`**：支持对 registry 中 `mode=generated` 的 artifact 执行 `source.command`（需要强安全门禁，默认禁用 shell）。  
2) **移除/降级 generated mode 文档**：在 docs 中明确“生成型 artifact 由外部工具生成，contextctl 仅负责登记+checksum+verify”，不再提 `update`。

## B6. 故障排查（Troubleshooting）

- **Checksum mismatch**：你改了 artifact，但没跑 `contextctl touch`；或 registry 指向了错误文件。
- **Derived registry 不更新**：你手改了 `docs/context/registry.json`（不允许）；请改 SSOT registry 并 `contextctl build`。
- **模块产物 LLM 找不到**：没有登记到 `modules/<module_id>/interact/registry.json`；用 `contextctl add-artifact --module-id <module_id>` 修复。

---

## 附录：建议的 artifact-id 约定（可选但推荐）

为减少歧义，建议使用稳定命名：

- `openapi`（模块 API 合同）
- `db-slice`（模块 DB slice）
- `env-slice`（模块 Env slice）
- `observability-slice`（模块 Observability slice）

并通过 tags 保留可检索性（示例）：
- `tags: "module,slice,observability"`


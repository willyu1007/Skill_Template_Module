# 环境/凭证/IaC 策略对齐记录（工作文档）

> 用途：记录我们对“环境目录（`env/`）如何维护、如何生成配置、AK vs 角色冲突如何处理、IAM/角色权限如何通过 IaC 落地”的一致结论，并在后续讨论中持续更新。
>
> 状态：草案（随交流迭代）
>
> 最近更新：2026-02-03
>
> 注意：本文件是**对齐过程记录**，可能包含阶段性示例与已调整的字段。当前规范与实现以 `ENVIRONMENT-MANAGEMENT.md` 为准（例如：IaC tool 的选择已收敛到 init blueprint 的 `iac.tool`，`docs/project/policy.yaml` 不再隐式指定 IaC tool）。

## 目标（我们已达成一致）

1. 在 repo 中形成一个**明确的环境维护目录**（目标为 `env/` 体系），具备：
   - 完整的环境配置生成能力（本地 `.env.*.local` 等）
   - 明确的冲突解决机制（例如 AK vs 角色）
   - 支持多应用/多场景（开发阶段 vs 部署阶段、不同功能权限、多个角色等）
2. 接入并优先使用**基于角色的访问**（例如阿里云 RAM Role），并保证鲁棒性（可审计、可预测、可失败保护）。
3. IAM/角色权限配置采用 **IaC + plan/apply** 的方式落地（可评审、可回滚、可漂移检查）。

## 当前机制（基线事实）

- 现有 `env-*` 技能的核心是“配置契约 + 非密值 + secret 引用（`secret_ref`）”，而不是“默认 AK”。
- `env-localctl` 的 secret 解析目前支持本地化 backend（`mock/env/file`），可用于“secrets 本地维护 + 生成本地运行环境文件”。
- `env-cloudctl` 的参考实现目前只支持 `mockcloud`，且明确将 **IAM/Identity 变更**（角色/策略/信任关系）排除在自动 apply 之外；IAM 需要走独立流程。

## 已决策（我们已达成一致）

### A. ECS（生产）强制 `role-only`

- 在 ECS 生产环境中，对“云厂商资源访问（OSS/RDS/日志等）”**强制使用实例角色/STS 链路**。
- **禁止 AK fallback**：发现云厂商 AK 被注入（或可能被 SDK 默认链路读取）时，应该失败（fail-fast），避免“悄悄绕过角色”的风险。

### B. 允许存在 AK 的环境：允许 fallback（受控）

- 对“确实需要填写 AK 的环境”，允许 AK fallback，但必须是**显式策略**（不是隐式“谁先读到用谁”）。
- 建议通过“模式开关 + 冲突矩阵”固化规则，例如：`dev/staging=auto`（角色优先、必要时才 fallback）。

### C. 第三方 key（例如大模型调用）保留，但与云身份链隔离

- 仍需要保留第三方 key（例如 LLM API key）。
- 这类 key 不属于云厂商身份链，不应与云厂商 AK 同命名/同位配置；应使用按用途命名（例如 `LLM_API_KEY`）避免污染云 SDK 默认凭证链。

### D. IAM/角色权限配置走 IaC（SSOT），并使用 plan/apply 流程运营

- `env/` 体系负责“应用配置键/非密值/secret 引用与本地注入”。
- IAM/角色/策略/信任关系等 **Identity/IAM** 变更走 IaC 的 SSOT 与 plan/apply（人审批准后执行），不由 `env-cloudctl` 自动 apply。

### E. IaC 选型策略（项目级二选一）

- **阿里云单一云（aliyun-only）**：优先使用 ROS（贴近云原生能力）。
- **多云/需要跨云一致工作流**：优先使用 Terraform/OpenTofu。
- 选型建议为**项目级二选一**；避免在同一项目中同时用 ROS 与 Terraform 管理同一类资源（否则 SSOT/漂移/迁移成本高）。

### F. dev(local) 与 staging(ECS) 的默认 workload 与凭证基线（矩阵建模）

我们认可用一个**压缩矩阵**表达规则：用 `runtime_target` 建基线，再用少量 override 表达例外，避免“全笛卡尔积表”带来的维护成本。

#### 默认 workload 列表（可按项目增删）

- `api`：HTTP 服务（对外/对内 API）
- `worker`：异步/队列消费（MQ/事件/任务）
- `cron`：定时任务（清理/对账/同步）
- `migrate`：一次性作业（DB migrate/seed/repair）
- `admin`：运维/管理脚本（人工触发的一次性操作）
- `iac`：IaC 执行器（ROS/Terraform 的 plan/apply/drift）
- （可选）`tests`：集成/冒烟测试执行器（CI/临时容器）

#### 凭证规则（按“运行时 vs 控制面”拆分）

- `dev(local)`：运行时 workload 默认 `auto`（prefer-role/STS；允许 AK fallback，但必须是显式策略；同时存在时 prefer-role 并告警/记录）。
- `staging(local)`（staging-local 联调）：倾向**更少 fallback**，默认按“staging 语义”执行：
  - 运行时仍以 `role/STS` 为准（尽量模拟 `role-only`），不允许直接用云厂商 AK 访问资源。
  - 允许存在“bootstrap 凭证”仅用于获取 STS/assume-role 的临时凭证；生成/运行时只注入临时凭证，不注入长期 AK。
  - 若无法获取 STS 临时凭证，则默认失败（不允许 break-glass 例外）。
- `staging(ECS)`：运行时 workload 强制 `role-only`；检测到云厂商 AK/可能污染默认凭证链的注入时 fail-fast（禁止 AK fallback）。
- `workload=iac`：允许使用 AK（受控、单独执行器/流程），但**禁止将 AK 注入到 staging 运行时容器环境变量**里；运行时仍按 `role-only` 执行。

> 备注：如果未来出现 “dev 也上云跑（ECS/集群）” 的需求，建议直接沿用 `runtime_target=ecs => role-only` 基线，而不是为 dev 单独引入 AK 例外。

### G. 多应用/多角色建模：选方案 B（单 env + workload/app 维度）

- **结论**：采用“单 env（`dev/staging/prod`）+ workload/app 维度拆分”的建模方式（方案 B）。
- **原因**：
  - 保持环境语义稳定（`APP_ENV` 仍是 `dev/staging/prod`，不被 `dev-api` 这类命名稀释）。
  - 共享配置与覆盖更自然（同一 env 内按 workload/app 做增量覆盖）。
  - 更利于 LLM/脚本做确定性合并与校验（降低误判/漏配）。
- **落地建议**：用机器可读策略文件（`docs/project/policy.yaml`）表达：
  - workload/app 列表
  - 每个 workload/app 的 `auth_mode`（role-only/auto/ak-only）
  - 冲突策略（fail/warn/priority）与覆盖优先级
  - 所需 secrets 组、角色/权限包（IAM 由 IaC SSOT 落地，env 只引用）

### H. 冲突检测：生成时 fail + 启动前 preflight（双保险）

- **结论**：对所有 `role-only` 场景启用“双保险”：
  - 生成本地/部署用环境文件时做冲突检测并 fail-fast
  - 应用启动前做 preflight 检测并 fail-fast（防止容器/系统注入覆盖默认凭证链）
- **适用范围（当前一致）**：
  - `prod(ECS)=role-only`（强制）
  - `staging(ECS)=role-only`（强制）
  - `staging(local)`（尽量模拟 role-only，拿不到 STS 临时凭证即失败）
- **`auto` 场景**（如 `dev(local)`）：仍建议至少做 preflight 告警/记录，避免“无感 fallback”。

### I. IaC 目录与留痕：使用 `ops/iac/` + `ops/iac/handbook/`

- **结论**：IaC SSOT 目录使用 `ops/iac/`。
- **留痕归档**：plan/apply/审批记录等证据统一归档到 `ops/iac/handbook/`。
- **与 env 的边界**：`env/` 管配置契约/非密值/secret 引用；`ops/iac/` 管 IAM/角色/策略/信任关系与资源编排（plan/apply/drift）。

### J. 策略 SSOT：使用 `docs/project/policy.yaml`（分 `policy.env` / `policy.iac`）

- **结论**：使用中立位置的单一策略 SSOT：`docs/project/policy.yaml`。
- **分区**：用两个 section 明确边界：
  - `policy.env`：凭证矩阵/冲突策略/preflight 等“环境与运行时策略”
  - `policy.iac`：IaC 选型/执行身份约束/留痕规范等“运营与 IaC 策略”
- **好处**：避免 `env/` 与 `ops/iac/` 各自维护策略文件导致的合并/覆盖漂移；更利于脚本与 LLM 做确定性校验。

### K. 模板仓库的生成策略：仅在 init Stage C 启用后生成 `docs/project/policy.yaml`

由于当前 repo 是**模板仓库**，我们不在模板根目录里常驻 `docs/project/policy.yaml`，而是：

- **生成时机**：在 init Stage C `apply` 启用环境体系后生成（copy-if-missing）。
- **触发条件**：当 `features.environment=true` 且 Stage C 执行环境 feature 初始化时生成。
- **实现落点（计划）**：
  - 扩展 `.ai/skills/features/environment/env-contractctl/scripts/env_contractctl.py` 的 `init`（`run_init()`）：
    - scaffold `docs/project/policy.yaml`（包含 `policy.env` / `policy.iac` 两个 section 的最小骨架）
    - 默认不覆盖，只有 `--force` 才覆盖（与现有 `env-ssot.json`、`env/contract.yaml` 一致的保守行为）
  - init pipeline 已在 Stage C 启用 environment feature 时调用 `env_contractctl.py init`，因此可保证文件**只在启用后出现**。

### L. `docs/project/policy.yaml`（v1）最小 schema 设计建议（可执行 + 可扩展）

我们认可先落一个“最小可执行 + 可扩展”的 schema：核心目标是 **确定性合并** + **强枚举可校验**，避免隐式默认与策略漂移。

#### 顶层结构（建议）

- `version`：策略 schema 版本（整数）。
- `policy.env`：环境/运行时策略（凭证矩阵、冲突策略、preflight 规范）。
- `policy.iac`：运营/IaC 策略（ROS vs Terraform/OpenTofu 选型、执行身份约束、留痕规范）。

#### 维度范围（当前一致）

- 规则匹配 `policy.env.rules[].match` 暂不把 `app` 作为一等维度；先以：
  - `env`（dev/staging/prod）
  - `runtime_target`（local/ecs）
  - `workload`（api/worker/cron/migrate/admin/iac/tests）
  为主。
- 后续如需多应用支持，再按版本化方式引入 `app` 维度（保持 backward-compatible）。

#### 合并规则（确定性）

建议采用：
- `most-specific-wins`：命中字段越多（env/runtime_target/workload）优先级越高。
- 同 specificity 冲突处理：
  - 关键字段冲突（如 `auth_mode`）=> **报错**（拒绝生成/启动，避免“静默选一个”）。
  - 非关键字段可采用“后写覆盖”（但必须可追溯：输出 explain/trace）。

#### 字段枚举（强约束）

建议至少固化枚举：
- `runtime_target`: `local | ecs`
- `auth_mode`: `role-only | auto | ak-only`
- `preflight.mode`: `fail | warn | off`

#### `auth_mode` 行为定义（写死，避免歧义）

- `role-only`：
  - 运行时禁止长期 AK（以及可能污染云 SDK 默认链路的凭证注入）。
  - 仅允许角色/STS 临时凭证链路；检测到 AK 注入 => fail-fast。
- `auto`：
  - 优先 role/STS；仅在策略显式允许条件满足时才 fallback 到 AK。
  - fallback 必须 warn + record（写入留痕/日志，避免“无感 fallback”）。
- `ak-only`：
  - 仅用于遗留/不支持角色的少数场景（默认不推荐）。

#### 未知字段的处理（校验严格度）

- `policy.env`：**严格**（unknown fields 直接报错）。
- `policy.iac`：**宽松**（unknown fields warn + ignore），便于演进与跨团队扩展。

#### v1 可机器校验 schema（字段清单 / 必填项 / 默认值）

> 目标：让 Stage C 生成的 `docs/project/policy.yaml` **具备稳定结构**，并且脚本/LLM 可以对其做确定性校验与解释（explain/trace）。

必填（v1）：
- `version`：`1`
- `policy.env.merge.strategy`：`most-specific-wins`
- `policy.env.merge.tie_breaker`：`error`（同优先级冲突直接失败）
- `policy.env.defaults.auth_mode`：默认 `auto`
- `policy.env.defaults.preflight.mode`：默认 `warn`
- `policy.env.evidence.fallback_dir`：默认 `.ai/.tmp/env/fallback`（实际单次运行写入 `.ai/.tmp/env/fallback/<run-id>/`）
- `policy.env.preflight.detect.providers`：map（可为空，但建议至少包含你实际使用的云厂商）
- `policy.env.rules`：list（可为空，但模板建议内置最小安全规则：ECS=>role-only、prod(ECS)=>role-only、staging(local)=>role-only+sts、dev(local)=>auto）
- `policy.iac.cloud_scope`：`aliyun-only | multi-cloud`
- `policy.iac.tool`：`ros | terraform | opentofu`
- `policy.iac.evidence_dir`：默认 `ops/iac/handbook`
- `policy.iac.identity.allow_ak`：默认 `true`（仅限 `workload=iac` 受控执行器；禁止注入运行时）
- `policy.iac.identity.forbid_runtime_injection`：默认 `true`

可选（v1；按需启用）：
- `policy.env.rules[].match.env`：`dev | staging | prod`
- `policy.env.rules[].match.runtime_target`：`local | ecs`
- `policy.env.rules[].match.workload`：`api | worker | cron | migrate | admin | iac | tests`
- `policy.env.rules[].set.sts_bootstrap.*`：用于 staging(local) 的“bootstrap->STS”约束表达
- `policy.env.rules[].set.ak_fallback.*`：用于 dev(local) 的 AK fallback 显式允许与留痕开关

#### v1 骨架（通用做法；后续由 Stage C 生成到 `docs/project/policy.yaml`）

> 说明：
> - 这是“最小可执行”的通用骨架，用于冻结 v1 的结构与关键字段语义。
> - 具体的 preflight 检测项（env vars / credential files）可按云厂商补充；这里给出的是跨厂商的常见示例。

```yaml
version: 1

policy:
  env:
    # Deterministic merge:
    # - Pick the rule with the most match keys satisfied.
    # - If two rules have the same specificity and set conflicting critical fields, error out.
    merge:
      strategy: most-specific-wins
      tie_breaker: error

    # Baseline defaults (can be overridden by rules)
    defaults:
      auth_mode: auto
      preflight:
        mode: warn

    evidence:
      # Fallback evidence base dir (ignored by git). Per-run output goes under: <fallback_dir>/<run-id>/
      fallback_dir: .ai/.tmp/env/fallback

    # Preflight detects credential-chain signals and classifies them (ak vs sts vs files).
    # Enforcement (fail/warn/off) is governed by auth_mode + runtime_target + rule overrides.
    preflight:
      detect:
        # Providers are optional; populate the ones you actually use.
        # Classification rule (generic):
        # - If id+secret present and token present => sts_env
        # - If id+secret present and token missing => ak_env
        providers:
          aws:
            env_credential_sets:
              - id_vars: [AWS_ACCESS_KEY_ID]
                secret_vars: [AWS_SECRET_ACCESS_KEY]
                token_vars: [AWS_SESSION_TOKEN]
            credential_files:
              paths:
                - "~/.aws/credentials"
                - "~/.aws/config"
          aliyun:
            env_credential_sets:
              - id_vars: [ALIBABA_CLOUD_ACCESS_KEY_ID, ALICLOUD_ACCESS_KEY_ID, ALICLOUD_ACCESS_KEY]
                secret_vars: [ALIBABA_CLOUD_ACCESS_KEY_SECRET, ALICLOUD_ACCESS_KEY_SECRET, ALICLOUD_SECRET_KEY]
                token_vars: [ALIBABA_CLOUD_SECURITY_TOKEN, ALICLOUD_SECURITY_TOKEN]
            credential_files:
              paths:
                - "~/.alibabacloud/credentials"
          gcp:
            env_var_presence:
              - GOOGLE_APPLICATION_CREDENTIALS
            credential_files:
              paths:
                - "~/.config/gcloud/application_default_credentials.json"

    rules:
      # ECS baseline: role-only + fail-fast preflight
      - id: ecs-default
        match: { runtime_target: ecs }
        set:
          auth_mode: role-only
          preflight: { mode: fail }

      # Production is explicit (can add stricter checks later)
      - id: prod-ecs
        match: { env: prod, runtime_target: ecs }
        set:
          auth_mode: role-only
          preflight: { mode: fail }

      # Staging on local: prefer STS/role-only semantics; no break-glass.
      # Bootstrap credentials are only for obtaining short-lived STS, never for direct resource access.
      - id: staging-local
        match: { env: staging, runtime_target: local }
        set:
          auth_mode: role-only
          preflight: { mode: fail }
          sts_bootstrap:
            allowed: true
            allow_ak_for_sts_only: true

      # Dev on local: allow auto (prefer role/STS; controlled AK fallback)
      - id: dev-local
        match: { env: dev, runtime_target: local }
        set:
          auth_mode: auto
          preflight: { mode: warn }
          ak_fallback:
            allowed: true
            require_explicit_policy: true
            record: true  # writes to: policy.env.evidence.fallback_dir/<run-id>/

  iac:
    # Project-level choice (one of): aliyun-only => ros; multi-cloud => terraform/opentofu
    cloud_scope: aliyun-only
    tool: ros
    evidence_dir: ops/iac/handbook

    # Identity constraints for IaC execution (AK can exist here, but must not leak into runtime workloads).
    identity:
      allow_ak: true
      forbid_runtime_injection: true
```

#### `auto` 的通用规则（建议写死为可验证行为）

- **显式允许**：`ak_fallback` 必须由策略显式允许（默认不允许），避免“默认凭证链悄悄兜底”。
- **先 role/STS**：只有当 role/STS 获取失败（或不满足“可用”判定）时，才允许走 AK fallback（且仅限 `dev(local)`）。
- **必须留痕**：每次 fallback 至少记录：`env`、`runtime_target`、`workload`、触发原因（为什么 role/STS 不可用）、采用了哪条 rule（`id`）。
- **留痕路径**：统一写入 `.ai/.tmp/env/fallback/<run-id>/`（不进 git；只写元信息，不写任何 secret/AK 值）。
- **禁止渗透**：AK 只允许出现在 `workload=iac` 或 `dev(local)` 的受控场景；对 `staging/prod` 运行时一律禁止注入。

#### 可机器校验 schema：通用落地建议（结构校验 + 语义校验）

> 目标：让 Stage C 生成出来的 `docs/project/policy.yaml` 不只是“长得像”，而是能被脚本做**确定性校验 + 可解释合并**；并且后续迭代不会把规范“说不清”。

- **双层校验**：
  - 结构校验：字段类型/必填项/枚举/unknown-field 策略。
  - 语义校验：跨字段约束（例如 `cloud_scope` 与 `tool` 的可选组合）、规则冲突（同 specificity 设置关键字段不同）、以及 `auth_mode` 与 `preflight` 的一致性约束。
- **schema 文件与版本绑定**：建议为每个版本生成/维护对应 schema（例如 `docs/project/policy.schema.v1.json`），并提供一个稳定入口（例如 `docs/project/policy.schema.json` 指向当前版本）。
- **扩展口（不放宽主体校验）**：建议仅允许在 `policy.env.extensions` / `policy.iac.extensions` 这样的“显式扩展区”里自由扩展；其它位置仍保持 `policy.env` 严格校验（fail-closed）。
- **默认值策略**：新增字段必须有默认值（或显式标为 required），并保证旧版本策略文件在升级工具链后仍可被解释/合并（backward-compatible）。
- **可解释输出**：建议校验/合并时输出 `explain`（命中哪些 rule、最终 effective 值、为何 fail/warn），作为 LLM/人审的主要依据。

#### preflight：通用规范建议（生成时 + 启动前）

> 目标：用同一套可配置的检测项，识别“AK 注入/凭证污染默认链路/role 链路不可用”，并按 `auth_mode` 选择 fail-fast 或 warn+record。

- **统一实现、两处执行**：
  - 生成环境文件时执行（阻止把 AK 写进 `.env.*` 或产生不符合策略的运行配置）。
  - 应用启动前执行（阻止容器/系统在生成后又注入 AK/credentials 文件，绕过 role-only 约束）。
- **检测面（建议至少覆盖）**：
  - 环境变量：按 `id_vars + secret_vars + token_vars` 的组合分类（`ak_env` / `sts_env`）。
  - 凭证文件：常见 credentials/profile 文件（注意容器内 `HOME`/用户不同导致路径变化）。
  - 元数据服务（可选主动探测）：对 ECS/IMDS 的可达性做短超时探测（可配置开关与超时），用于判断 role 链路是否可用。
- **输出与留痕（建议结构化）**：
  - 生成一个结构化报告（如 `preflight.json`）：记录 provider、检测到的信号（变量名/文件路径的“存在性”，不写值）、分类、命中 rule id、最终 decision（pass/warn/fail）与原因。
  - `auto` 触发 AK fallback 时，必须写入 `.ai/.tmp/env/fallback/<run-id>/`（已确定）。
  - （v1 约束）**只固定 fallback 留痕路径**；preflight 报告是否落盘与落盘目录不纳入 v1 约束（如需留痕，可在后续版本引入 `.ai/.tmp/env/preflight/<run-id>/`）。
- **fail-fast 边界建议（写死为可验证行为）**：
  - `role-only`：发现 `ak_env` 或可能污染默认凭证链的 credentials/profile 文件 => fail；同时如果 role/STS 链路不可用（例如元数据不可达且无 `sts_env`）=> fail。
  - `auto`：默认 warn；若策略未显式允许 fallback，则在 role/STS 链路不可用时 fail（避免无意间使用 AK）。

### M. secrets 值 SSOT：外部统一（v1：Bitwarden Secrets Manager），支持 shared secrets/roles

- **结论（已对齐）**：secrets 的“值”以 **repo 外部** 的 secrets 系统为 SSOT（优先便利性与多项目复用）。v1 选择 **Bitwarden Secrets Manager**；repo 侧只维护契约与引用（`secret_ref` / 逻辑名 / 元数据），不存明文。
- **取值/注入策略（已对齐）**：
  - `dev(local)`：开发者从 Bitwarden **pull** 仅 `dev + shared` 范围的 secrets，渲染生成 `.env.local`（gitignore + 权限收紧）后启动；启动前执行 preflight（避免 AK 注入/缺失关键 secret）。
  - `staging/prod(ECS)`：ECS 运行时不直接访问 Bitwarden；由运维机/部署机从 Bitwarden **pull**，在“部署时”**push 注入**（生成 env-file/配置并重启服务）。ECS 运行时仍严格 `role-only` 访问云资源（RAM Role/STS），不依赖 Bitwarden token/AK。
- **部署形态建议（v1）**：ECS 上优先 `docker compose`，并用 `systemd` 托管 compose（开机自启/自动重启）；注入文件优先使用 compose 的 `env_file`（例如 `/etc/<org>/<project>/<env>.env`）。
- **shared**：
  - 允许存在 shared secrets 与 shared roles，但前提是云端侧保证**权限要求一致**（否则应拆回项目级 secrets，避免“共享导致最小权限被抬高”）。
  - shared secrets 默认采用**全局一份**（一个逻辑 secret/一个值，跨环境复用）；如果未来需要区分环境值，应拆回项目/环境级 secret，而不是在 shared 下做隐式分叉（避免误用）。
  - 建议在命名空间层面区分 `project` vs `shared`（具体命名规则后续补齐到策略/IaC 规范）。
- **关于“本地是否还需要维护 SSOT”**：
  - 即使 secrets 与 roles 都在云端“存在”，本地仍需要维护 *配置接口层* 的 SSOT：配置契约（有哪些键/哪些是 secret）、secret 引用（`secret_ref`）、以及策略（AK vs role、preflight、合并规则）。否则就只能把这些“规则/映射”迁移到云端的另一套配置系统（引入 bootstrap 依赖与可审计性成本）。
- 因此我们建议的清晰边界是“**SSOT 分层**”：外部 secrets SSOT（secrets 值与审计/版本；v1=Bitwarden）+ repo SSOT（契约/引用/策略）+ IaC SSOT（角色/权限/信任关系，以代码表达并 apply 到云端）。

#### secrets 命名规范（建议；dev/staging/prod 分层 + 多项目复用）

> 目标：让同一套 `secret_ref` 在多个项目里复用，并且能用**可推导的命名与分层**做最小权限与可审计访问控制（不绑定具体 secrets 产品）。

**1) 统一的“secret 逻辑路径”模板（推荐）**

- `project` secrets（按 env 分层）：
  - `/<org>/<project>/<env>/<secret_ref>`
- `shared` secrets（全局一份，不分 env）：
  - `/<org>/shared/<secret_ref>`

> 说明：
> - 这里的 `/` 是“分隔符语义”，即便底层产品把它当作普通字符，也不影响模板/权限前缀设计。
> - `shared` 只用于“确实全局一份值也合理”的 secrets（例如某些第三方 key）。需要按环境隔离的 secrets 一律放 `project/<env>/...`。

**2) `secret_ref` 的书写规范（repo 内统一）**

- 采用 **kebab-case + `/` 分段** 表达域与名字：`<domain>/<name>` 或 `<domain>/<subdomain>/<name>`
  - 示例：`db/password`、`db/url`、`llm/api-key`、`oauth/client-secret`
- 字符集建议：`a-z 0-9 / -`（尽量避免大写、空格、`.`），保证跨云/跨工具兼容。
- 不把 `env` 编进 `secret_ref`（由模板中的 `<env>` 分层承载）。

**3) 访问控制（最小权限，按分层约束）**

- `dev-reader (local)`：允许读取 `/<org>/<project>/dev/*` + 必要的 `/<org>/shared/*`
- `ops-deploy (staging/prod)`：允许读取 `/<org>/<project>/(staging|prod)/*` + 必要的 `/<org>/shared/*`
- `secrets-writer/rotator`（运维）：“写入/轮换”权限与“读取/部署”权限分离；写入侧按需覆盖对应前缀（避免把 writer 能力发到运行时）。
- `runtime (ECS)`：v1 不授予读取 Bitwarden 的能力（避免在运行时引入新 token/解密钥）；运行时只通过已注入的 env/config 读取业务 secrets。

#### Bitwarden Secrets Manager（v1）映射约定（Projects/Secret Key）

> 目标：让脚本/LLM 可以确定性地“按 `env + secret_ref` 拉取”，并生成 `.env.local` 或部署注入物；同时保证将来迁移到 1Password 只需要改适配层，不改业务代码与 `secret_ref`。

**1) Projects（v1 固定 3 个；受 Bitwarden 限制）**

- `<org>-<project>-dev`
- `<org>-<project>-staging`
- `<org>-<project>-prod`

> 说明：由于项目数上限，v1 不单独创建 `<org>-shared` 项目；`shared` 以 **key 前缀命名空间**表达（见下文）。

**2) Secrets（key 规则；v1）**

- 每个 secret 在对应 Project 下创建 1 条记录。
- `secret.key` 采用“命名空间前缀 + secret_ref”形式：
  - `project/<env>/<secret_ref>`：环境隔离（`<env>` 为 `dev|staging|prod`）
  - `shared/<secret_ref>`：全局共享（跨 env；**物理上需在 dev/staging/prod 三个 Project 里各存一份相同的值**，以避免部署侧被迫访问“别的 env 的 Project”）
- 说明：这里的 `project` 是**固定命名空间前缀**，不是 Bitwarden 的 Project 名，也不是你的实际项目名；你的实际项目名体现在 Bitwarden 的 Project（如 `mr-common-dev`）上。
- `secret_ref` 的规范不变：`kebab-case + /` 分段、全小写、不包含 env（由 `project/<env>/...` 承载）。
- `secret.key` 允许包含 `/`（已在当前项目验证可保存），因此 v1 直接按上述规则落地；无需引入 key 归一化规则。
- 注：我们**不依赖** Bitwarden CLI 的 “run->环境变量名=key” 直接注入能力；由 `ops/secrets`/环境工具把 `secret_ref` 映射到实际环境变量名（如 `DB_PASSWORD`）后生成 `.env.local`/部署注入物。
  - 背景：Bitwarden Secrets Manager CLI 文档提到，非 POSIX 的 key 在 `env` 输出格式下可能会被注释掉；我们绕开该限制，直接渲染 `.env.local` / env-file（key 由 repo 的变量名决定）。

**3) 权限/令牌（v1 最小建议）**

- 人员（2 人测试期）：两位开发者都加入 Organization，并拥有管理 `Projects/Secrets` 的权限（可先从简单开始）。
- 机器身份（可后置，但建议尽早）：按用途发 Machine Account + Access Token：
  - `dev-local`：只读 `<org>-<project>-dev`（在该 Project 内读取 `project/dev/*` + `shared/*`）
  - `staging-deploy`：只读 `<org>-<project>-staging`（在该 Project 内读取 `project/staging/*` + `shared/*`）
  - `prod-deploy`：只读 `<org>-<project>-prod`（在该 Project 内读取 `project/prod/*` + `shared/*`）
  - `secrets-writer`（可选）：写入/轮换（限制在必要项目范围内）；只在运维机使用
- 强约束：Access Token **不进入 ECS 运行时环境**；只允许存在于开发者本机或运维/部署机的安全存储中。
- **命名建议（v1）**：
  - Machine Account：`<project>-<env>-<purpose>`（示例：`common-dev-local`、`common-staging-deploy`）
  - Access Token：`<machine-account>-<scope>-<yyyymmdd>`（示例：`common-dev-local-read-dev-20260204`）

#### Bitwarden Secrets Manager（v1）设置清单（交互式）

1. 创建/确认 Organization（你已完成）。
2. 在 Secrets Manager 中创建 3 个 Projects（按上文命名）。
3. 做一次 key 兼容性测试（确认 `secret.key` 是否允许 `/`）：
   - 在 `<org>-<project>-dev` 创建 1 条 secret：
     - `key=shared/llm/example/chat/api-key`
     - `value` 随便填临时值
   - （已验证）当前项目允许保存包含 `/` 的 key；v1 不需要 key 归一化。
4. 为每个 env 建立第一批 secrets（建议先从最小集开始：DB、LLM、OAuth 等），并按 v1 规则填 `secret.key`：
   - `project/<env>/<secret_ref>` 或 `shared/<secret_ref>`
5. 选择权限策略：
   - 2 人测试期可先用“人账号直接管理”跑通；
   - 或者创建 Machine Accounts（`dev-local` / `staging-deploy` / `prod-deploy`），生成 Access Tokens 并分别配置到开发者机器/运维机。
6. 本地开发验证（dev）：
   - 从 Bitwarden pull `dev + shared` → 生成 `.env.local` → preflight → 启动应用。
7. 云端部署验证（staging/prod）：
   - 运维机从 Bitwarden pull `staging|prod + shared` → 生成 env-file（`/etc/<org>/<project>/<env>.env`）→ `docker compose` 重启 → 验证服务。

#### Bitwarden Secrets Manager CLI（bws）最小验证命令（v1）

> 目标：验证 Machine Account + Access Token 能正常读取对应 Project 的 secrets。
>
> 注意：不要把 Access Token 写进 repo；不要粘贴到文档或聊天记录里。

- 安装（Windows，推荐本机安装）：
  - 从 Bitwarden 官方文档页面下载 `bws`（Secrets Manager CLI）Windows 版本压缩包并解压。
    - 注意：你需要下载的是 **bws CLI** 的发布包（文件名类似 `bws-x86_64-pc-windows-msvc-<version>.zip`），不是 `Bitwarden.Secrets.Sdk.*.nupkg`（那是 .NET SDK 包）。
  - 将 `bws.exe` 放到固定目录（示例：`C:\Tools\bws\`）。
  - （可选）解除下载阻止：`Unblock-File C:\Tools\bws\bws.exe`
  - 将目录加入 PATH：
    - 仅当前 PowerShell 会话：`$env:Path += ';C:\Tools\bws'`
    - 永久（当前用户）：`[Environment]::SetEnvironmentVariable('Path', $env:Path + ';C:\Tools\bws', 'User')`（重开终端生效）
  - 验证：`bws --help`
- PowerShell（会话内临时设置）：
  - 设置 token：`$env:BWS_ACCESS_TOKEN = "<your-access-token>"`
  - 列出 projects：`bws project list`
  - 列出某个 project 下的 secrets（⚠️ 原始输出包含 `value`，不要直接打印/粘贴）：`bws secret list <PROJECT_ID> --output json --color no`
  - 只显示 `id/key`（推荐，用于验证权限与命名）：`bws secret list <PROJECT_ID> --output json --color no | ConvertFrom-Json | Select-Object id,key`
  - 只显示 key（最安全的验证方式）：`bws secret list <PROJECT_ID> --output json --color no | ConvertFrom-Json | Select-Object -ExpandProperty key`
  - 获取单条 secret（会输出 value；只在本机自查，避免出现在共享屏幕/日志里）：`bws secret get <SECRET_ID> --output json --color no`

> 备注：Bitwarden 提供 `--output env` / `bws run` 这类“直接把 key 当环境变量名”的能力，但我们的 key 包含 `/`，在 POSIX 约束下可能会被注释或不可用；v1 选择由脚本/环境工具渲染 `.env.local`/env-file（环境变量名以 repo 的变量名为准）。

#### Bitwarden（v1）示例：以阿里云 RAM Role 为基线，哪些需要 secrets？

> 关键原则：**云厂商访问凭证（AK/Secret）不进入运行时**（staging/prod(ECS) 强制 `role-only`）。因此很多“云资源”本身不需要 secrets；需要的是业务层面的账号/口令/第三方 key。

- **RDS（通常需要）**：
  - `project/<env>/db/password`：数据库密码（secret）
  - `project/<env>/db/username`：数据库用户名（是否视为 secret 由你们决定；保守起见可按 secret）
  - **多个 DB 的命名（v1 建议）**：
    - 主库/默认库保持现有键：`project/<env>/db/password`、`project/<env>/db/username`（兼容你们已创建的 secrets）
    - 新增第二个及以上 DB：引入 DB 别名维度：`project/<env>/db/<db_alias>/password`、`project/<env>/db/<db_alias>/username`（可选 `url`）
      - 例：`project/dev/db/analytics/password`、`project/prod/db/auth/url`
      - `db_alias` 建议用用途/域名（如 `main`/`auth`/`analytics`），避免用随机编号
  - 非 secret 建议放 `env/values` / IaC outputs：`DB_HOST`、`DB_PORT`、`DB_NAME`、`DB_SSL_MODE` 等
  - 若你们习惯用 “DATABASE_URL（包含口令）”：则将其作为 secret，例如 `project/<env>/db/url`
- **OSS（role-only 下通常不需要 secrets）**：
  - 不存 AK；SDK 走实例 RAM Role/STS 即可
  - bucket 名/region 等属于非 secret，建议来自 IaC outputs 或 `env/values`
- **ECS（role-only 下通常不需要 secrets）**：
  - 运行时不需要 secrets 来“访问 ECS”；访问云 API 也应走 RAM Role
  - 例外：若运维/部署机需要 SSH 私钥去 push（部署注入），这是 **ops secret**，不应注入运行时；建议用 `shared/ops/ssh/private-key`（并限制只在运维机可读）
- **验证服务（按你们实现方式）**：
  - 如果调用阿里云验证相关 API 且 SDK 支持 role：通常不需要 secrets（无 AK）；只需要非 secret 配置（如 signName/templateCode 等）放 `env/values`
  - 如果接第三方验证供应商：将其 API key/secret 作为 secrets（推荐按功能拆 `verify/<capability>/api-key`）

#### Bitwarden 里是否需要填真实 value？我需要你提供 UUID 吗？

- **value 是否必须真实**：可以先用临时值跑通流程；但一旦进入真实联调/部署，value 就是“真实 secret 值”（例如 DB 密码、第三方 API key）。请不要把真实 value 粘贴到仓库或聊天记录里。
- **value 是否等于 API key**：是的。对“第三方 API key”这类 secret，value 就是供应商给你的那串 key（或 token/secret）。
- **我是否需要 Project UUID/Secret UUID**：不需要你发给我。我们 v1 约定以 `Projects + secret.key` 做稳定映射；UUID 只在你们本地/运维机用 CLI 时会用到，建议记录在 `ops/secrets/handbook/<run-id>/meta.yaml` 或运维机本地配置中，不要提交到模板仓库。

#### 当前项目（v1）已创建的最小 secrets（对齐记录）

> 仅记录 key，不记录 value。并且注意：`shared/*` 在 v1 需要在 dev/staging/prod 三个 Project 中各存一份相同 key（值保持一致），避免部署侧跨 Project 读取。

- `project/<env>/db/password`
- `project/<env>/db/username`
- `shared/llm/<provider>/chat/api-key`

> 更新（已对齐）：LLM 相关 secrets 从 v1 起固定使用：
>
> `shared/llm/<provider>/<function>/api-key`
>
> 其中 `<function>` 推荐从 `chat|embeddings|moderation` 起步；`<provider>` 与 `env/values/<env>.yaml` 的 provider 选择保持一致（例如 `LLM_CHAT_PROVIDER=openai` 对应 `shared/llm/openai/chat/api-key`）。

**4) 可选的 shared 权限边界（仅在需要时）**

如果未来 shared 下出现权限不一致的需求（例如部分 shared secrets 只允许 ops/iac 使用），建议拆分二级命名空间：

- `/<org>/shared/runtime/<secret_ref>`（允许运行时读取）
- `/<org>/shared/ops/<secret_ref>`（仅 ops/iac 读取）

**4.1) shared：第三方 LLM API key（v1 默认）**

- v1 默认将第三方 LLM 的 API key 放入 `shared`，便于跨项目复用与统一轮换。
- 建议按 provider + 功能拆分对应的 `secret_ref`（与上文 LLM v1 最小集一致）：
  - `llm/<provider>/chat/api-key`
  - `llm/<provider>/embeddings/api-key`
  - `llm/<provider>/moderation/api-key`
- 若更偏向“最简复用”，也可以只维护一个 `llm/api-key` 并在三个功能上共用；后续再按功能拆分也保持兼容（新增 secret_ref，不影响旧配置）。

**5) LLM 使用指引（如何提问更稳定）**

为了避免 LLM “凭感觉猜命名”，建议提问时总是显式给出：`org`、`project`、`env`、`secret_ref`（或你想让它生成的 secret_ref 列表），并要求它“按本文档规范输出”。

示例提问：

```text
请按 ENVIRONMENT-STRATEGY.md 的 secrets 命名规范：
1) 为以下配置键生成 secret_ref（kebab-case + / 分段，不含 env）；
2) 给出每个 secret 的逻辑路径（project 按 dev/staging/prod 分层；shared 全局一份）；
3) 给出 Bitwarden Secrets Manager v1 的映射（Project 名 + secret.key）；
4) 给出 dev/local 与 staging/prod 的最小读取权限范围（按 Project 粒度，不写具体值）。

org=acme
project=tinder
envs=[dev, staging, prod]
keys=[DB_PASSWORD, LLM_API_KEY, OAUTH_CLIENT_SECRET]
哪些 key 应该进入 shared 也请说明理由。
```

### N. 多账号：逻辑配置复用，运行时按账号隔离（默认策略）

- **可复用的“逻辑配置”**：`env/` 契约、`secret_ref`、`docs/project/policy.yaml`（策略/合并/校验规则）在多账号场景下仍可保持一致；不同账号只是在“物理落点”（账号/地域/资源 ID）层面不同。
- **角色不可跨账号复用（对象级）**：RAM Role 是账号级资源；ECS 实例角色也只能绑定本账号 Role。多账号复用的正确方式是：用 IaC 在每个账号里创建**同名/同策略**的“逻辑 role”（对象不同、能力一致）。
- **跨账号 AssumeRole 的边界**：
  - 默认只允许用于控制面（如 `workload=iac`、`secrets-writer/rotator`），并要求显式配置与留痕。
  - `staging/prod` 运行时 workload 默认不走跨账号（降低信任关系复杂度与 blast radius），遵循 `role-only + fail-fast`。
- **shared secrets 的多账号语义**：shared secrets 默认“全局一份”是指**单账号内全局**；多账号时建议在每个账号里复制一份 shared secrets（保持相同命名路径），而不是让运行时跨账号读取。

### O. v1 runtime 角色粒度：每个 env 一个 runtime role（后续可按 workload 细分）

- **结论**：`staging/prod(ECS)` 的运行时默认采用“每个 env 一个 runtime role”（所有运行时 workloads 共享），以降低复杂度与治理门槛；后续如有最小权限要求升级，再按 workload 拆分。
- **边界**：
  - 该决定只针对**运行时**（`api/worker/cron/migrate/admin` 等）；`workload=iac` 必须使用单独的执行身份/role（控制面），不复用运行时 role。
  - 多账号时在每个账号内创建同名/同策略的 runtime roles（对象不同、能力一致），不做运行时跨账号 AssumeRole。

### P. roles 命名规范（多账号一致）

- **结论**：roles 命名在多账号场景下保持一致（同名/同策略），便于复用 IaC 模块与权限审计。
- **运行时（runtime）**：每个 env 一个 role：
  - `<org>-<project>-runtime-<env>`（`<env>` ∈ `dev|staging|prod`）
- **控制面（ops/iac）**：
  - IaC 执行器：`<org>-<project>-iac-executor`
  - secrets 写入/轮换：`<org>-<project>-secrets-writer`

### Q. v1 runtime 权限包：最小权限白名单（OSS/RDS/验证/大模型/MQ）

- **结论**：runtime roles（`<org>-<project>-runtime-<env>`）对 OSS、RDS、验证服务、大模型接口、MQ 采用**最小权限白名单**。
- **原则**：
  - **先“默认不需要”**：如果应用只需要“访问数据面”（例如通过 DB 连接串访问 RDS），通常不需要授予 RDS 控制面 API 权限；优先把权限留给 secrets 与业务必须的云 API。
  - **按 env 资源隔离**：权限按 `dev/staging/prod` 对应资源前缀/资源集隔离（例如 bucket/topic/group 按 env 分开），role 只授予本 env 资源集合 + 必要 shared（见上文 secrets 命名规范）。
  - **按能力拆包**：用 IaC 维护“权限包/托管策略”（可复用），runtime role 只挂需要的包；后续按 workload 拆 role 时可以直接复用/复写包组合。

#### v1 默认取值（已对齐）

- OSS：runtime 默认 **read-only**（list/get），不授予 write（put/delete）；写入类数据优先落在 RDS（通过 DB 权限控制），避免 runtime role 同时具备对象存储写权限。
- OSS bucket：**每个 env 1 个**，按 `<org>-<project>-<env>` 命名（或等价模板）；权限白名单只覆盖本项目/本环境 bucket，不做 object prefix 白名单。
- MQ：暂未定型，v1 默认采用 **MNS（Topic/Subscription）**（配置简单）：
  - 资源命名约束：所有 topic/subscription 名称必须以 `<org>-<project>-<env>-` 为前缀（便于用前缀做白名单授权）。
  - 允许多个 topic（按功能/域拆分）；subscription 命名不强制包含 workload。
  - 权限白名单：按 `<org>-<project>-<env>-*` 的 topic/subscription 命名空间限制；由于 v1 runtime role 按 env 共享，默认授予该 env 的 **publish + subscribe**（后续按 workload 拆 role 后再收紧到 publish-only / subscribe-only）。
- 验证服务：默认按 **阿里云 API** 侧能力授权（最小动作集白名单）；后续可按具体验证能力（短信/邮件/验证码/人机验证等）拆更细的权限包。
- 大模型接口：
  - 允许**第三方 LLM** 与 **阿里云服务**并存；并按“具体功能”拆分。
  - v1 功能最小集：`chat` / `embeddings` / `moderation`（后续再扩展 `rerank`、`image`、`audio` 等）。
  - 第三方 LLM：通常不需要云端 IAM 权限，走 secrets（API key）即可；v1 默认将第三方 LLM 的 API key 放在 `shared`（跨项目复用）。
  - 阿里云 LLM：走 role 的最小动作集白名单（按功能拆包，便于最小权限与替换）。
  - **provider 不设默认**：provider 选择与实际工作流程强相关，v1 不给出默认 provider；要求在项目/部署流程中显式指定（允许同一 env 内按功能混用不同 provider）。
  - **多 provider（建议做法）**：
    - provider 选择属于非敏感配置，放 `env/values/<env>.yaml`（例如 `LLM_CHAT_PROVIDER` / `LLM_EMBEDDINGS_PROVIDER` / `LLM_MODERATION_PROVIDER`）。
    - secrets 仍以功能为单位：如果同一功能需要支持多个 provider，建议用 `shared/llm/<provider>/<function>/api-key` 的 `secret_ref` 命名空间（例如 `shared/llm/openai/chat/api-key`、`shared/llm/aliyun/chat/api-key`），并由运行时配置选择其中一个（避免“一个 key 同时服务多个 provider”的隐式耦合）。

#### v1 建议的权限包拆分（概念级；具体 Action/Resource 由 IaC 生成）

- `secrets:read`：
  - （适用于“运行时直接从云端 secrets 拉取”的方案）允许读取 `/<org>/<project>/<env>/*` + 必要的 `/<org>/shared/*`（或 `shared/runtime/*`，若启用）。
  - （v1=Bitwarden Secrets Manager）运行时不直接访问 Bitwarden，因此不需要给 runtime 侧配置该类“secrets:read”能力；读取权限由 Bitwarden 的 Projects/Machine Accounts 控制，部署时注入到 env/config。
- `oss:app-buckets`：
  - 只允许访问指定 bucket（v1 不做 object prefix 白名单）
  - 最小动作集一般是：`list`（限定前缀）、`get`（v1 默认 read-only；如后续确需写入，建议通过拆 workload/拆 role 的方式新增 write 包）
- `mq:topics`：
  - v1 默认 MNS（Topic/Subscription）：只允许对指定 topic/subscription 的 publish/subscribe（按 `<org>-<project>-<env>-*` 前缀白名单；topic/subscription 名必须满足前缀约束）
- `verify:api`（验证服务）：
  - 覆盖“短信/邮件/验证码/人机验证”等能力的最小动作集白名单（不含管理/配置类 API）
  - 结构上建议保留子包（便于后续最小化）：`verify:sms`、`verify:email`、`verify:captcha`、`verify:human`（v1 runtime 默认可直接挂 `verify:api` 覆盖全部）
- `llm:api`（大模型接口）：
  - 如果是第三方 LLM：通常不需要云端 IAM 权限，走 secrets（API key）即可。
  - 如果是云厂商 LLM 服务：按 `verify:api` 的方式做最小动作集白名单。
  - 结构上建议保留子包（便于后续最小化）：`llm:chat`、`llm:embeddings`、`llm:moderation`（v1 功能最小集；按需挂载）
- `rds:control-plane`（可选；默认不挂）：
  - 只有当应用运行时确实需要调用 RDS 控制面 API（例如动态发现实例/账号管理）时才启用；否则建议不授予。

### R. secrets 运维流程 v1：人工在本地/运维机执行，独立 `ops/secrets/`

- **执行方式（v1）**：secrets 的写入/轮换由人工在本地/运维机执行（而非默认走 CI），以降低误触发与权限外溢风险。
- **目录与留痕（v1）**：
  - 运营目录：`ops/secrets/`
  - 留痕归档：`ops/secrets/handbook/`（只存元信息与证据，不存 secret 值）
- **与 IaC 的边界**：
  - `ops/iac/`：创建/管理 secrets 容器、roles、权限策略、信任关系（不写 secret 值）。
  - `ops/secrets/`：写入/轮换 secret 值（v1=Bitwarden）、多账号分发/同步（如需要），并留痕。

### S. IaC 执行模型 v1：`plan` 走 CI，`apply` 走人工

- **结论**：IaC 的变更预演（`plan`/ROS ChangeSet）在 CI 执行；变更落地（`apply`/执行 ChangeSet）由人工在本地/运维机执行。
- **意图**：CI 提供一致的可审阅变更预览；人工执行降低误操作与权限外溢（尤其是生产）。
- **建议的最低约束**：
  - CI 执行 `plan` **强制使用 OIDC→STS/RAM Role**（不使用/不注入 AK），并限制为只读/plan 所需最小权限。
  - `apply` 必须基于已审阅的 `plan`/ChangeSet（同一次变更输入），避免“plan 与 apply 不一致”。
  - 证据归档：CI 产出 `plan` 结果作为 artifact；人工在 `apply` 前后将“plan 证据链接/摘要 + apply 结果”归档到 `ops/iac/handbook/`（不写任何 secret 值）。

### T. `dev(local)` 拉取外部 secrets（v1=Bitwarden）：以便利性为主的本地注入（`.env.local`）

- **目标**：让开发者“开箱即用”获取 `dev` 与 `shared` 的业务 secrets，并把它们稳定注入到 `.env.local`；同时不把任何云厂商长期 AK 注入到运行时/项目环境文件里。
- **基本流程（v1）**：
  1. 开发者登录 Bitwarden（桌面端/浏览器插件/CLI 均可），拥有 `dev + shared` 的只读权限。
  2. 执行 `ops/secrets` 的渲染脚本：按 `secret_ref` 清单拉取值并生成 `.env.local`（确保 gitignore + 权限收紧）。
  3. 启动应用；启动前执行 preflight（避免把 AK/credentials 文件注入到 role-only 场景；同时检查必需 secret_ref 是否齐全）。
- **访问边界（v1 默认）**：
  - 开发者只拿到 `dev + shared` 的读取权限；不允许读取 `staging/prod` 值。
  - `staging/prod(ECS)` 的值只由运维/部署机在部署时拉取并注入；运行时不直接访问 Bitwarden。
- **本地缓存/凭证存放（v1 原则）**：
  - Bitwarden 的登录态/会话 token 只保留在开发者机器的标准位置（由 Bitwarden 工具管理），不写入 repo。
  - `.env.local` 只存业务 secrets（第三方 key/连接串等），不注入云厂商长期 AK；云资源访问统一走 role/STS 链路。

### U. `ops/*/handbook/` 留痕模板：常见字段（v1 默认）

> 目标：每一次 IaC 变更与 secrets 写入/轮换都能“可审计、可回放、可追责”，并且不泄露任何敏感值。

#### 共同字段（IaC 与 secrets 通用）

- `run_id`：本次操作唯一 ID（建议用目录名：`<yyyymmdd-hhmmssZ>-<actor>-<short>`）。
- `kind`：`iac-plan | iac-apply | secrets-write | secrets-rotate | secrets-sync | drift-check`。
- `created_at` / `finished_at`：时间戳（ISO8601）。
- `actor`：操作者（name/role/contact）。
- `approvals`：审批/工单信息（ticket、reviewer、approved_at）。
- `repo_ref`：变更来源（repo、branch、commit、PR/link）。
- `context`：执行上下文（`org`、`project`、`env`、`cloud`、`account_alias`、`regions`）。
- `identity`：执行身份（`method`：`oidc-sts | sso-sts | ramuser-sts | instance-role`；`role_name`/`role_arn`；可选 `profile`）。
- `scope`：影响范围（模块/资源/secret 列表摘要，不写值）。
- `artifacts`：证据指针（CI run、artifact URL、本地文件名）。
- `result`：`success | failed | canceled` + 失败原因（不含敏感信息）。
- `verification`：验证步骤与结果（例如 smoke checks/drift checks）。
- `rollback`：回滚策略与指针（例如回滚到某 commit、回退到某个 secret version id）。
- `notes`：补充说明（允许链接与非敏感摘要）。

> 安全红线：`ops/*/handbook/` **不写任何 secret 值、AK、token、连接串、私钥、planfile 明文中的敏感片段**。只写“存在性/名称/版本号/摘要 hash/链接”。

#### IaC 专用字段（建议）

- `iac.tool`：`ros | terraform | opentofu`
- `iac.path`：IaC 目录（如 `ops/iac/` 下具体路径）
- `iac.workspace_or_stack`：workspace/stack 名
- `iac.plan_digest`：plan/changeset 的摘要（sha256 等）
- `iac.summary.changes`：create/update/delete 计数（尽量结构化）
- `iac.ci.plan_run`：CI plan 的 run id / url / artifact
- `iac.apply.executor`：人工 apply 的执行点（运维机标识/用户名/时间）

#### secrets 专用字段（建议）

- `secrets.operation`：`write | rotate | sync | disable | rollback`
- `secrets.items[]`：每项至少记录：
  - `secret_ref`
  - `cloud_path`（如 `/<org>/<project>/<env>/<secret_ref>` 或 `/<org>/shared/<secret_ref>`）
  - `scope`：`project | shared`
  - `version_before` / `version_after`（仅版本号/ID，不写值）
  - `reason`（轮换原因/变更原因）
- `secrets.targets`：分发/同步目标（accounts/regions）
- `secrets.verification`：验证（例如运行时能读到新版本、回滚验证）
- `secrets.next_rotation_at`：下次轮换时间（可选）

#### 文件布局建议（便于脚本/LLM 稳定读取）

- `ops/iac/handbook/<run_id>/meta.yaml` + `plan.txt`（或链接文件）+ `apply.txt`（或链接文件）
- `ops/secrets/handbook/<run_id>/meta.yaml` + `changes.json`（只含 ref/path/version）+ `verify.txt`

#### `meta.yaml` 示例（仅示意）

```yaml
run_id: 20260203-153012Z-ops-jdoe-3f2a1c
kind: iac-apply
created_at: 2026-02-03T15:30:12Z
finished_at: 2026-02-03T15:42:01Z
actor: { name: "jdoe", role: "ops", contact: "jdoe@example.com" }
approvals: { ticket: "OPS-123", reviewer: "alice", approved_at: "2026-02-03T15:10:00Z" }
repo_ref: { repo: "git@...", branch: "main", commit: "abc1234", pr: "https://..." }
context: { org: "acme", project: "tinder", env: "prod", cloud: "aliyun", account_alias: "acme-prod", regions: ["cn-hangzhou"] }
identity: { method: "ramuser-sts", role_name: "acme-tinder-iac-executor", profile: "acme-prod" }
iac:
  tool: "ros"
  path: "ops/iac/ros"
  workspace_or_stack: "tinder-prod"
  plan_digest: "sha256:..."
  summary: { create: 2, update: 1, delete: 0 }
artifacts:
  plan: { ci_run: "ci-987", artifact_url: "https://...", file: "plan.txt" }
  apply: { file: "apply.txt" }
result: { status: "success" }
rollback: { strategy: "revert-commit", ref: "abc1234" }
notes: "Applied after review; no secrets included."
```

### V. 线上资源清单 SSOT（v1 建议）：以 IaC outputs 为准（避免二次 SSOT）

> 背景：`env/inventory/<env>.yaml` 这类文件一旦“承载真实资源清单”，就会变成第二套 SSOT，长期最容易漂移。

- **推荐结论**：云端资源清单（ECS/RDS/OSS/MNS 等）以 **IaC（代码 + state）为准**，并通过 **outputs**（ROS Stack Outputs / Terraform remote state outputs）对外提供“应用需要的少量信息”（endpoint、bucket/topic 名、DNS、region 等）。
- **为什么更“自动化且干净”**：
  - IaC 已经是资源生命周期的 SSOT：plan/apply/drift 都围绕它运转，避免重复维护。
  - outputs 是“显式接口”：可以刻意只暴露非敏感、稳定的字段；比解析整份 state 更安全、更可控。
  - 多账号也可复用：同一套命名规范 + 不同账号的 stack/workspace 对应不同 outputs。
- **需要注意的坑**：
  - **不要把 secrets 写进 IaC/state/outputs**（secrets 值 SSOT=v1 Bitwarden；IaC 只管容器与权限），否则 state 会变成敏感数据载体。
  - outputs 仍可能包含敏感元信息（如内部域名/资源 ID），需要按最小可用原则输出，并限制读取权限（主要给 CI plan 与 ops apply）。
- **`env/inventory/<env>.yaml` 的定位（建议）**：
  - 不作为 SSOT；仅在“资源不由 IaC 管理”或“迁移/过渡期”作为临时 overlay（并明确过期/删除计划）。
  - 更推荐把“可读快照”做成**生成物**（例如归档到 `ops/iac/handbook/` 或 `.ai/.tmp/`），而不是进 repo 成为长期维护项。

> **结论（已对齐）**：稳态不生成/不维护任何 `<env>.yaml` 形式的“资源清单文件”；云端资源清单以 IaC state+outputs 为准。环境目标描述/生成输入统一放到 `docs/project/policy.yaml`（`policy.env`）里。

### W. 非敏感 values（v1 选择 A）：写入 `env/values/<env>.yaml`（从 IaC outputs 生成）

> 目标：实现“环境一键复用”，避免本地/运维每次都手工找实例名、endpoint、bucket、region 等非敏感值。

- **SSOT**：非敏感值以 **IaC outputs** 为准（与 V 一致），`env/values/<env>.yaml` 是可再生的“派生缓存”。
- **内容边界**：只放非敏感值（endpoint/host/port/region/bucket/topic 名等）；任何包含口令/密钥/token 的值一律走 Bitwarden secrets（例如 `DATABASE_URL` 若包含密码，应作为 secret）。
- **生成方式（约定）**：
  - `dev(local)`：从 dev 环境的 IaC outputs 拉取 → 生成/刷新 `env/values/dev.yaml`。
  - `staging/prod(ECS)`：从对应环境 IaC outputs 拉取 → 生成/刷新 `env/values/<env>.yaml`（可在部署机侧生成，也可作为 CI plan 的可读产物，不作为 secrets 承载）。
- **与策略 SSOT 的关系**：`docs/project/policy.yaml` 仍是“目标/策略/合并规则”的 SSOT；`env/values/<env>.yaml` 仅承载派生的非敏感运行参数，不承载“环境目标描述/选择”。

## 建议的“首次搭建选型确认门”（需要后续落地到流程/脚本）

在第一次启用环境体系时，引导并记录以下选择（机器可读）：

1. 凭证策略：
   - `prod(ECS)=role-only`（已确认）
   - `runtime_target=local => auto`（我们当前的 dev 基线）
   - `runtime_target=ecs => role-only`（staging/prod 基线；staging 在 ECS 时适用）
   - 冲突策略（同时存在 AK 与角色信息时）：fail / warn+prefer-role / prefer-ak（建议 prod fail）
2. IaC 工具：
   - `aliyun-only => ROS`
   - `multi-cloud => Terraform/OpenTofu`
3. IAM SSOT 路由：
   - 明确“角色/权限 = IaC 管理；env 系统不自动改 IAM”
4. v1 runtime 角色粒度（运行时）：
   - 默认：每个 env 一个 runtime role（后续可按 workload 细分）
5. roles 命名规范：
   - runtime：`<org>-<project>-runtime-<env>`
   - 控制面：`<org>-<project>-iac-executor`、`<org>-<project>-secrets-writer`
6. secrets 运维（写入/轮换）：
   - v1 默认人工在本地/运维机执行；SSOT 使用 Bitwarden；留痕归档到 `ops/secrets/handbook/`
7. IaC 执行模型：
   - `plan` 走 CI；`apply` 走人工（本地/运维机）
8. `dev(local)` bootstrap 身份：
   - v1 推荐 SSO→STS；无 SSO 则 RAM User→STS（不把长期 AK 注入项目运行配置，允许缓存短期 STS）

> 记录位置候选（待定）：扩展 `docs/project/env-ssot.json` 或新增 `docs/project/env-strategy.json` / `docs/project/iac-ssot.json`。
>
> 更新：策略 SSOT 已统一为 `docs/project/policy.yaml`（见上文 “J”）；`docs/project/env-ssot.json` 仅用于声明 env SSOT 模式（如 `repo-env-contract`）。

## 线上实例是否可以“本地文件维护 secrets”（可选方案；默认外部 SSOT=v1 Bitwarden）

可以，但在我们已决定“secrets 值外部 SSOT（v1 Bitwarden）”的前提下，它更适合作为**特殊场景/过渡方案**；并且需要作为运维系统能力对待：

- 需要明确：分发方式、文件权限（0600/属主）、轮换机制、审计与回滚、实例扩缩容一致性。
- 现有本地 secret backend（`file`/`mock`）可以承接“本地文件有值”的形态，但不会替代分发/轮换/审计流程。

## 本轮建议（待确认）

### 1) dev/staging/prod：哪些场景允许云厂商 AK

这里的“AK”仅指**云厂商身份凭证**（AccessKey/Secret/STS 一类）。第三方 key（如大模型 API key）不在此列，按业务需要作为 secrets 维护即可。

- `dev`：允许 AK（受控），建议默认 `auto`（角色优先，缺角色时才允许 AK）。
- `staging`：运行时与生产对齐（`role-only`，禁止 AK fallback）；AK 仅允许出现在 `workload=iac` 的受控执行器/流程中，且禁止注入到运行时容器环境变量。
- `prod(ECS)`：强制 `role-only`；发现 AK 直接 fail-fast（已达成一致）。

### 2) 多应用/多角色：是否用策略文档管理（以及两种建模对比）

（已决策）采用方案 B：单 env + workload/app 维度拆分，见上文 “G”。

### 3) 冲突检测：只在“生成 env 文件”时 fail 是否够

（已决策）采用双保险：生成时 fail + 启动前 preflight，见上文 “H”。

### 4) IaC 目录：是否与运营同目录（`ops/iac`）

（已决策）使用 `ops/iac/`，留痕归档到 `ops/iac/handbook/`，见上文 “I”。

## 待澄清问题（后续讨论补齐）

1. 策略 SSOT 的落点与归属：
   - （已决策）统一为 `docs/project/policy.yaml`，并分 `policy.env` / `policy.iac` 两个 section（见上文 “J”）。
2. `docs/project/policy.yaml` 的最小 schema 与合并规则：
   - 具体字段清单（v1 必需字段 vs 可选字段）与默认值（见上文 “L”，仍需落成可机器校验的 schema）。
   - `auto` 的 fallback 允许条件与“必须留痕”的最小字段集（记录到哪里、记录什么）。
3. preflight 的“AK 注入”判定与执行点：
   - 要检测哪些来源（环境变量/常见凭证文件/容器注入）？
   - 在 `role-only` 的 fail-fast 与 `auto` 的 warn/record 的边界怎么写死？
4. secrets（外部 SSOT）的产品与流程细节（便利性 + 多项目复用）：
   - （已对齐）v1 使用 Bitwarden Secrets Manager，并采用：`dev(local)=pull`，`staging/prod(ECS)=pull+push 注入`；ECS 运行时不直接访问 Bitwarden。
   - Bitwarden 中如何稳定映射 `secret_ref`：Projects + `secret.key` 的约定（已在上文 “M” 给出；仍需把它落入 `docs/project/policy.yaml` 的可机器校验 schema）。
   - （已对齐）`dev(local)` bootstrap 身份链与缓存策略（以便利性为主：SSO/RAM User→STS；允许缓存短期 STS；禁止长期 AK 注入项目运行配置）
   - （已对齐）`dev-reader` 最小读权限：`/<org>/<project>/dev/*` + `/<org>/shared/*`；多账号 profile：`<org>-<account-alias>`（不编码 env）
   - （已对齐）写入/轮换执行方式：人工在本地/运维机执行；留痕目录：`ops/secrets/handbook/`
   - 轮换/审计/回滚：谁能写入、如何分发版本、如何快速回滚
5. CI 与 IaC 执行身份：
   - （已对齐）CI 执行 `plan` 强制使用 OIDC→STS/RAM Role（禁用 AK）；`apply` 走人工。
   - （已对齐）证据归档：CI artifact 保存 plan；人工将“plan 链接/摘要 + apply 结果”归档到 `ops/iac/handbook/`。
6. “线上实例是否在本地文件维护”的边界：
   - （已对齐）不生成 `env/inventory/<env>.yaml`；资源清单以 IaC state+outputs 为准；环境目标描述/生成输入放 `docs/project/policy.yaml`（`policy.env`）。
7. runtime roles 的命名与权限包引用方式：
   - （命名已确认）runtime：`<org>-<project>-runtime-<env>`；控制面：`<org>-<project>-iac-executor`、`<org>-<project>-secrets-writer`。
   - （仍需补齐）权限如何与 secrets 命名空间/服务资源绑定（最小前缀授权 + 明确可审计）。
8. 资源命名与“白名单边界”：
   - OSS bucket：每 env 1 个，不做 object prefix 白名单（命名模板已在上文 v1 默认取值对齐）。
   - （范围已对齐）MNS（v1 默认 Topic/Subscription）：允许多个 topic（按功能/域拆分），topic/subscription 强制前缀 `<org>-<project>-<env>-`，subscription 不强制包含 workload；v1 runtime role 共享时默认 publish+subscribe（拆 workload 后再收紧）。
9. 验证服务/大模型“功能列表”：
   - （范围已对齐）验证服务覆盖短信/邮件/验证码/人机验证等；仍需补齐：是否存在无法资源级约束的 API（只能 action 级最小化）。
   - （范围已对齐）LLM v1 功能最小集：`chat` / `embeddings` / `moderation`；第三方 LLM API key 默认放 `shared`。
   - （仍需补齐）provider 的“显式配置位置”与校验策略（不设默认；按功能可混用），以及 shared secrets 是否需要拆 `shared/runtime` vs `shared/ops` 的权限边界。

## 下一步（建议）

1. 固化 `docs/project/policy.yaml` v1 schema（字段清单 + 枚举 + 合并规则 + unknown-field 策略，见上文 “L”）。
2. 出一份最小 `docs/project/policy.yaml` 草案（按 v1 schema；暂不引入 `app` 维度）。
3. 定义 preflight 规范（检测项清单 + role-only 的 fail-fast 规则 + auto 的 warn/record 规则）。
4. 明确 secrets 外部 SSOT（v1=Bitwarden）的命名/权限/写入与拉取流程（含 shared 边界），并补齐轮换/审计/回滚最小规范。
5. 明确 IaC 执行身份与运行位置（优先 role/STS；AK 仅限 `workload=iac` 且不注入运行时），并约定 `ops/iac/handbook/` 留痕模板。
6. 固化 v1 运行时 roles 的命名与最小权限包（按 env 粒度），并确定后续按 workload 拆分的升级路径。

---

## 变更记录（人工维护）

- 2026-02-02：创建本文档，记录“ECS prod 强制 role-only、第三方 key 隔离、IAM 走 IaC、aliyun-only=>ROS / multi-cloud=>Terraform 的选型策略、首次选型确认门”的一致结论。
- 2026-02-03：补齐 secrets SSOT 与命名规范（project/env 分层 + shared 全局）、多账号默认隔离策略、v1 runtime role 粒度与命名、以及 v1 最小权限白名单的默认取值（OSS read-only、MQ 默认 MNS、验证服务默认阿里云 API、LLM 支持第三方/阿里云并按功能拆分）。
- 2026-02-03：补齐 OSS bucket（每 env 1 个、无 object prefix 白名单）、MNS（Topic/Subscription、多 topic、命名前缀白名单、v1 runtime 默认 publish+subscribe）、以及验证服务覆盖范围（短信/邮件/验证码/人机验证）。
- 2026-02-03：补齐 LLM v1 功能最小集（chat/embeddings/moderation）与第三方 LLM API key 默认放 shared（并给出对应 secret_ref 建议）。
- 2026-02-03：补齐 secrets 运维流程 v1（人工本地/运维机执行）与目录留痕约定（`ops/secrets/` + `ops/secrets/handbook/`）。
- 2026-02-03：补齐 IaC 执行模型 v1（`plan` 走 CI，`apply` 走人工）。
- 2026-02-03：补齐 IaC `plan` 的 CI 身份约束（OIDC→STS/RAM Role，禁用 AK）与证据归档策略（CI artifact + `ops/iac/handbook/` 归档）。
- 2026-02-03：补齐 `dev(local)` 拉取 secrets 的身份链与缓存策略（以便利性为主：SSO/RAM User→STS，允许缓存短期 STS，禁止长期 AK 注入项目运行配置）。
- 2026-02-04：对齐 secrets SSOT v1：采用 Bitwarden Secrets Manager；`dev(local)` 使用 `.env.local` 并由开发者 pull；`staging/prod(ECS)` 由运维机/部署机 pull 并在部署时 push 注入；ECS 运行时不直接访问 Bitwarden；ECS 部署形态推荐 `docker compose` + `systemd` 托管。
- 2026-02-03：补齐 `dev-reader` 最小读权限前缀与多账号 profile 命名（`<org>-<account-alias>`）。
- 2026-02-03：补齐 `ops/iac/handbook/` 与 `ops/secrets/handbook/` 的 v1 默认留痕字段（meta.yaml 模板）。
- 2026-02-03：对齐“不再生成任何 `<env>.yaml`”：资源清单以 IaC state+outputs 为准，环境目标描述/生成输入统一放 `docs/project/policy.yaml`（`policy.env`）。

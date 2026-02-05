# 环境管理（repo-env-contract + policy SSOT）v1

> 本文是**模板仓库**的环境管理“规范 + 实现说明”（面向 LLM 与自动化工具）。  
> 对齐记录/讨论过程见：`ENVIRONMENT-STRATEGY.md`；Bitwarden 细节见：`BITWARDEN-SECRETS-BACKEND.md`。

## TL;DR（结论先读）

- Repo 的环境 SSOT 采用 **repo-env-contract**：
  - `env/contract.yaml`：变量/类型/是否 secret 的契约 SSOT
  - `env/values/<env>.yaml`：非密值 SSOT（严格只允许非 secret）
  - `env/secrets/<env>.ref.yaml`：secret 引用 SSOT（**只存引用**，不存值）
- 策略/路由 SSOT 统一收敛到 `docs/project/policy.yaml`（避免双 SSOT）：
  - auth/preflight（role-only/auto）
  - secrets backend 约定（v1 默认 Bitwarden `bws`）
  - 云端注入 targets（`provider=envfile`；`transport=local|ssh`）
- IaC SSOT（`iac` feature）：
  - 仅支持 `ros` 与 `terraform`，且项目初始化时必须二选一（默认 `none` 表示不启用）
  - Stage C materialize `ops/iac/<tool>/`（IaC SSOT）并生成 `docs/context/iac/overview.json`（无敏上下文）
- 本地注入：`env-localctl compile` 生成 `.env.local`（或 `.env.<env>.local`）+ `docs/context/env/effective-<env>.json`（redacted）；支持 `--runtime-target` 与 `--env-file --no-context`
- 云端注入：`env-cloudctl apply` 使用 `envfile` 注入（`local|ssh`）；`ssh` 传输必须显式 `--approve-remote`，可选 `--remote --approve-remote` 进行远端哈希校验
- **彻底移除** `env/inventory/*`：所有 cloud routing/targets 由 `policy.yaml` 提供（避免双 SSOT/漂移）

## 设计目标与边界

### 目标

- 低成本优先：默认 ECS + docker compose（未来可扩展 serverless）
- 可维护：强 SSOT、强校验、少入口文件、确定性合并
- 同时覆盖：
  - 本地开发机注入（生成 `.env.local`）
  - 云端部署期注入（生成远端 `<env>.env`）
- 安全：
  - secret 值不进 repo / docs / evidence
  - 运行时容器不接触 Bitwarden token（只在部署机拉取并注入）

### 非目标（v1）

- 不自动 apply IAM/Identity（角色/策略/信任关系走 IaC plan/apply）
- 不在运行时容器中动态拉取 Bitwarden secrets（只做部署期注入）
- 不提供 serverless provider（只预留扩展点）

## 变更摘要（相对于旧模板）

- 移除 `env/inventory/*`：不再允许 “inventory 作为路由/资源清单” 漂移成第二 SSOT
- 新增/启用 `docs/project/policy.yaml`：
  - 作为 auth/preflight + secrets backend 约定 + cloud targets 的唯一策略入口
  - `env-contractctl init` 会（copy-if-missing）scaffold 最小 v1 骨架
- secrets ref schema 收敛为单一结构化格式：
  - 强制 `env/secrets/<env>.ref.yaml` 顶层 `secrets:` mapping
  - **不再支持** `ref: bws://...`、`env://...`、`file:...` 等 URI 语法（脚本将报错；避免双语义）
  - **禁止** `value` 字段（防止 secret 值写入 repo）
- `env-localctl`：
  - 增加 `bws`（Bitwarden Secrets Manager）backend
  - 按 `policy.env` 执行 preflight（role-only fail-fast / auto warn+record）
  - 新增 `--runtime-target` 与 `--env-file --no-context`（部署机编译）
- `env-cloudctl`：
  - 从 `policy.env.cloud.targets` 选择目标（替代 inventory）
  - 使用 `provider=envfile`（legacy alias：`ecs-envfile` / `ssh`）
  - `transport=local|ssh`；任何远程命令必须 `--approve-remote`
  - `plan/verify` 默认只读本地状态；`--remote --approve-remote` 才读远端 meta / 做远端哈希校验
  - 远端状态缓存：`.ai/.tmp/env-cloud/<env>/state.json`
  - `--workload`（可选）用于 target/rules 精确匹配
- 新增 `iac` feature（只保留 ros/terraform）：
  - init blueprint 新增 `iac.tool: none|ros|terraform`（缺省/none → 不启用）
  - 移除 policy scaffold 中的 IaC 隐式默认 tool（避免未选择时“误启用”）
  - `iacctl` 生成 `docs/context/iac/overview.json` 并写入 context registry（LLM 可发现 IaC SSOT）
- 对齐文档与测试：
  - 统一生成产物路径为 `env/.env.example`
  - 更新并通过测试：`node .ai/tests/run.mjs --suite environment`、`node .ai/tests/run.mjs --suite iac`

## SSOT 与目录约定（模板仓库前提）

本仓库是模板：

- `env/` 与 `docs/project/policy.yaml` **不常驻**，仅在启用 environment feature（init Stage C）或显式运行 `env-contractctl init` 后生成。
- `ops/iac/**` **不常驻**，仅在启用 `iac` feature（init Stage C，且 `iac.tool!=none`）后生成。

### 关键文件（职责分离）

- `docs/project/env-ssot.json`：SSOT gate（必须为 `repo-env-contract`）
- `docs/project/policy.yaml`：**策略/路由 SSOT**
  - `policy.env`：auth/preflight、secrets backend 约定、cloud targets
  - `policy.iac`：IaC 运营/身份约束（v1 skeleton；不选 tool；不由 env 工具自动 apply）
- `env/contract.yaml`：变量契约（类型、required、secret_ref 等）
- `env/values/<env>.yaml`：非密值（严格禁止 secret 变量）
- `env/secrets/<env>.ref.yaml`：secret 引用（只存 backend + locator，不存值）
- `ops/iac/<tool>/`：IaC SSOT（由 `iac.tool` 选择；只允许 `ros` 或 `terraform` 二选一）

### 生成/产物（非 SSOT）

- `env/.env.example`（由 `env-contractctl generate` 生成）
- `.env.local` / `.env.<env>.local`（由 `env-localctl compile` 生成；建议 gitignored）
- `docs/context/env/contract.json`（由 `env-contractctl generate` 生成）
- `docs/context/env/effective-<env>.json`（由 `env-localctl` 生成；redacted）
- `docs/context/env/effective-cloud-<env>.json`（由 `env-cloudctl` 生成；redacted）
- `.ai/.tmp/env-cloud/<env>/state.json`（`envfile` provider 本地状态缓存；非 SSOT）
- `docs/context/iac/overview.json`（由 `iacctl init` 生成；无敏；记录 tool 与 IaC SSOT 目录）
- 远端（provider=envfile + transport=ssh）：
  - `<target>`（0600；包含密值）
  - `<target_dir>/.envctl/<env>.meta.json`（0600；不含密值；含 sha256/bytes + secret refs（`stable_ref`）等元信息）

## 为什么既有 YAML（SSOT）又要生成 `.env` 文件？

结论：YAML 是**结构化 SSOT**（可校验/可合并/LLM 可推理），`.env` 是**运行时注入产物**（docker compose / 应用框架常用输入），两者职责不同，不能互相替代。

- `env/values/<env>.yaml` / `env/secrets/<env>.ref.yaml`：
  - 适合做 SSOT：结构明确、可做类型校验、可表达 “secret 引用而非值”
  - 便于工具生成/合并（避免手写 `.env` 带来顺序/重复/引号/转义问题）
- `.env.local` / 远端 `<env>.env`：
  - 适合做注入：扁平 `KEY=VALUE`，是 docker compose 与大量运行时的事实输入格式
  - 在本方案中始终是 **generated artifact**（非 SSOT），由工具从 SSOT 编译出来

## `env/secrets/<env>.ref.yaml`（结构化格式 v1）

> v1 只保留一种写法：顶层 `secrets:` mapping（LLM 视角更确定；避免“同一信息两种语法”）。

```yaml
version: 1
secrets:
  db_url:
    backend: mock

  api_key:
    backend: env
    env_var: MY_API_KEY

  webhook_secret:
    backend: file
    path: ./.secrets/webhook_secret

  llm_api_key:
    backend: bws
    scope: project  # or: shared
```

支持 backends（v1）：

- `mock`：从 `env/.secrets-store/<env>/<secret_ref>` 读取（用于 tests/demo）
- `env`：从当前进程环境变量读取（`env_var`）
- `file`：从本机文件读取（`path` 可绝对或 repo 相对路径；建议 gitignored）
- `bws`：Bitwarden Secrets Manager（CLI）读取（需 `BWS_ACCESS_TOKEN`）
  - 必填：`scope: project|shared`
  - 可选 override：`project_id` / `project_name` / `key`（默认按 policy 约定推导）

## `docs/project/policy.yaml`（policy SSOT v1）

> policy 是 routing + 安全策略的单入口：**用它替代 inventory，避免双 SSOT**。

### 关键字段

- `policy.env.defaults`：默认 auth/preflight
- `policy.env.rules[]`：按 `env/runtime_target/workload` 选择 `auth_mode` + preflight 行为
- `policy.env.preflight.detect.providers`：AK/STS 污染信号检测规则（仅记录“是否存在/命中项”，不记录值）
- `policy.env.secrets.backends.bws`：Bitwarden projects 与 key 前缀约定
- `policy.env.cloud.defaults`：远端 env-file 命名与默认 runtime
- `policy.env.cloud.targets[]`：env/workload → provider/runtime/injection/health（`provider=envfile` 时用 `injection`）
- `policy.iac`：IaC 策略 skeleton（用于运营对齐；不由 env 工具自动 apply）

### cloud targets（替代 inventory）

最小可用示例（mockcloud，用于离线测试）：

```yaml
version: 1
policy:
  env:
    cloud:
      defaults:
        env_file_name: "{env}.env"
        runtime: docker-compose
      targets:
        - id: staging-mock
          match:
            env: staging
          set:
            provider: mockcloud
            runtime: mock
```

ECS + docker compose（provider=envfile, transport=ssh）示例：

```yaml
version: 1
policy:
  env:
    cloud:
      targets:
        - id: prod-ecs
          match:
            env: prod
          set:
            provider: envfile
            runtime: docker-compose
            injection:
              transport: ssh
              target: /opt/myapp/{env}.env
              write:
                mode: "600"
                remote_tmp_dir: /tmp
                sudo: true
              ssh:
                hosts:
                  - "ubuntu@1.2.3.4"
                options:
                  - "StrictHostKeyChecking=accept-new"
              post_commands:
                - "cd /opt/myapp && docker compose --env-file /opt/myapp/prod.env up -d"
            health_url: "https://example.com/health"
            health_timeout_ms: 30000
```

行为（provider=envfile + transport=ssh）：

1. 在部署机解析 secret 值（例如 `bws`），组装完整 env map（含密值）
2. SSH 写入远端 env-file：`<target>`（原子写 + chmod 0600）
3. SSH 写入远端 meta：`<target_dir>/.envctl/<env>.meta.json`（不含密值；含 sha256/bytes + secret refs（`stable_ref`）等元信息）
   - 注：meta 中使用 `stable_ref` 字段存放“稳定的 secret 引用标识”（避免与 `env/secrets/<env>.ref.yaml` 的 legacy `ref:` 语法混淆）。
4. SSH 执行：按 `post_commands` 运行（例如 `docker compose --env-file <target> up -d`）
5. 可选 healthcheck：从部署机对 `health_url` 做 HTTP 检查直到超时

## 工具入口（本地/云端）

### 初始化（Stage C / 手动）

```bash
python3 -B -S .ai/skills/features/environment/env-contractctl/scripts/env_contractctl.py init --root .
```

该命令会（copy-if-missing）生成：

- `docs/project/env-ssot.json`
- `docs/project/policy.yaml`
- `env/contract.yaml`
- `env/values/<env>.yaml`
- `env/secrets/<env>.ref.yaml`

### 本地注入（env-localctl）

```bash
# 环境诊断（会读取 policy 做 preflight；doctor 在“环境机本身”上做检查）
python3 -B -S .ai/skills/features/environment/env-localctl/scripts/env_localctl.py doctor --root . --env dev

# 生成本地 .env 文件（会解析 secrets；输出不含密值）
python3 -B -S .ai/skills/features/environment/env-localctl/scripts/env_localctl.py compile --root . --env dev

# 部署机编译（自定义 env-file + 不写 context）
python3 -B -S .ai/skills/features/environment/env-localctl/scripts/env_localctl.py compile --root . --env staging --runtime-target ecs --workload api --env-file ops/deploy/env-files/staging.env --no-context
```

产物：

- `.env.local`（dev）或 `.env.<env>.local`（0600）
- `docs/context/env/effective-<env>.json`（redacted）

### 云端注入（env-cloudctl）

```bash
# 计划（diff；只比较非密 config + secret refs）
python3 -B -S .ai/skills/features/environment/env-cloudctl/scripts/env_cloudctl.py plan --root . --env staging

# 应用（写 env-file；需要显式 approve；ssh 传输需 --approve-remote）
python3 -B -S .ai/skills/features/environment/env-cloudctl/scripts/env_cloudctl.py apply --root . --env staging --approve --approve-remote

# 校验（默认只读本地状态；ssh 传输可选远端哈希校验）
python3 -B -S .ai/skills/features/environment/env-cloudctl/scripts/env_cloudctl.py verify --root . --env staging
python3 -B -S .ai/skills/features/environment/env-cloudctl/scripts/env_cloudctl.py verify --root . --env staging --remote --approve-remote
```

注意：

- `rotate/decommission` 在模板实现中仅支持 `mockcloud`（用于离线测试/演示）。
- 真实项目的 secret rotation 应在 secret backend（如 Bitwarden）完成，然后再 `apply` 重新注入。
- 任何 SSH/SCP 远程命令必须显式 `--approve-remote`。

### IaC（iacctl）

> IaC 的 `plan/apply` 仍由人/CI 执行；`iacctl` 只负责 **结构一致性 + context 集成 + 防双 SSOT**。

启用方式（init Stage B）：

```json
{ "iac": { "tool": "terraform" } }
```

当 `iac.tool` 缺省或为 `none` 时，IaC feature 不启用，也不会生成 `ops/iac/**`。

Stage C apply（启用时）会运行（至少）：

```bash
node .ai/skills/features/iac/scripts/iacctl.mjs init --tool terraform --repo-root .
```

当 Stage C 使用 `--verify-features` 时，还会运行：

```bash
node .ai/skills/features/iac/scripts/iacctl.mjs verify --repo-root .
```

## 安全与 preflight（role-only / auto）

- `policy.env.rules` 决定不同 `env/runtime_target/workload` 的 `auth_mode`：
  - `role-only`：检测到 AK/凭证文件等污染信号时 fail-fast（建议用于 `staging/prod` on ECS）
  - `auto`：允许存在 AK 信号但会 warn；可选记录“无敏证据”（不含值）
- `env-localctl doctor`：对**开发机环境**做 preflight（包含检测 credential files）
- `env-cloudctl`：对“有效 env map（redacted）”做 policy preflight（默认不检查本机 credential files）

## 从旧版 `env/inventory/*` 迁移（如果你已有项目）

1. 将原 inventory 中的路由信息迁移到 `docs/project/policy.yaml` → `policy.env.cloud.targets`
2. 删除 `env/inventory/*`
3. 运行 `env-cloudctl plan` 确认路由与行为一致

## 覆盖度：是否满足你的 3 个需求？

| 需求 | 当前模板状态 | 说明 |
|---|---|---|
| 云端 secret SSOT | ✅ 满足 | secret 值 SSOT 外置（v1=Bitwarden `bws`）；运行时不接触 Bitwarden token，只接受部署期注入的 env-file |
| IaC 作为 SSOT | ✅ 满足 | `ops/iac/<tool>/` 是 IaC SSOT（只允许 `ros|terraform` 二选一）；`docs/context/iac/overview.json` 让 LLM 可发现 “当前 tool + SSOT 位置 + 边界”。IaC plan/apply 由人/CI 执行（本模板不自动 apply） |
| 方便注入本地 + 云端 | ✅ 满足 | 本地 `env-localctl compile`；云端 `env-cloudctl apply`（ssh+compose）统一按 contract/values/secrets/policy 驱动 |

### 完整性评估（以“模板 repo + 方案A工具自动执行”为前提）

当前 repo 形态在 v1 目标下可以认为 **完全满足**，但存在几个“前置条件/非阻断依赖”（需要在真实项目按需补齐）：

- 依赖（本地/CI/部署机需具备）：
  - Node（执行 `contextctl` / `iacctl` / init pipeline）
  - Python（执行 `env-*-ctl`）
  - `bws` CLI（当选择 Bitwarden backend 时；否则可用 mock/env/file）
  - 云端注入额外依赖：SSH 可达 + 远端已有 docker compose（`docker compose` 或兼容命令）
- 能力边界（明确不在 env/iac 工具职责内）：
  - IAM/Identity 的创建与变更：由 IaC SSOT（ROS/Terraform）负责；env 工具只做 preflight/注入
  - secret rotation：由 secret backend（Bitwarden 等）负责；env 工具通过 apply 重新注入

## 改动与波及面（含生成物）检查清单（v1）

- 语义一致性：
  - env 路由唯一 SSOT：`docs/project/policy.yaml`（无 `env/inventory/*`）
  - IaC tool 选择唯一入口：`iac.tool`（无 `features.iac`；policy 不隐式指定 tool）
  - secret refs 只有一种结构：`env/secrets/<env>.ref.yaml` 顶层 `secrets:`
  - 禁止 legacy `ref:` 字段（例如 `ref: bws://...`；脚本 fail-fast）
  - 禁止 `value` 字段（防止把 secret 值写入 repo）
  - `provider=envfile` 为标准（legacy alias：`ecs-envfile`/`ssh`；仅兼容）
  - 远端执行必须 `--approve-remote`；远端读/哈希需 `--remote --approve-remote`
- 生成物边界清晰：
  - 本地：`.env.local` / `.env.<env>.local`（0600；非 SSOT）
  - Context：`docs/context/env/effective-*.json`、`docs/context/iac/overview.json`（redacted/无敏；generated）
  - 本地状态缓存：`.ai/.tmp/env-cloud/<env>/state.json`（非 SSOT）
  - 远端（ssh）：`<target>`（含密；0600）与 `<target_dir>/.envctl/<env>.meta.json`（无密；0600）
- 自动化校验（模板 repo 当前通过）：
  - `node .ai/scripts/lint-skills.mjs --strict`
  - `node .ai/tests/run.mjs --suite environment`
  - `node .ai/tests/run.mjs --suite iac`
  - `node .ai/tests/run.mjs --suite context-awareness`

## 相关实现位置（便于 code review）

- policy scaffold + 移除 inventory：`.ai/skills/features/environment/env-contractctl/scripts/env_contractctl.py`
- 本地注入 + bws backend + preflight：`.ai/skills/features/environment/env-localctl/scripts/env_localctl.py`
- 云端注入（policy targets + envfile adapter）：`.ai/skills/features/environment/env-cloudctl/scripts/env_cloudctl.py`
- IaC feature（ros/terraform + context）：`.ai/skills/features/iac/**`、`init/_tools/docs/feature-docs/iac.md`、`init/_tools/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs`
- 文档/引用：`.ai/skills/features/environment/**/references/*.md`、`init/_tools/docs/feature-docs/environment.md`

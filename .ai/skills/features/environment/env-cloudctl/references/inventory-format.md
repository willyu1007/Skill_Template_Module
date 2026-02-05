# Policy cloud targets format (v1)

`env/inventory/*` has been removed to avoid dual SSOT. Cloud routing and injection are declared in:

- `docs/project/policy.yaml` → `policy.env.cloud.targets`

## Goals

- Keep **policy/routing** centralized (auth/preflight + cloud injection targets).
- Make `env-cloudctl` deterministic: `env + workload -> target`.

## Minimal structure

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

## Target shape

Each entry under `policy.env.cloud.targets`:

- `id` (optional but recommended): stable identifier for explain/debug
- `match` (required mapping):
  - `env` (required)
  - `workload` (optional)
- `set` (required mapping):
  - `provider` (required): `mockcloud | envfile` (legacy aliases: `ecs-envfile`, `ssh`)
  - `runtime` (optional): e.g. `mock | docker-compose`
  - `env_file_name` (optional): default is `"{env}.env"` (templated)
  - `injection` (optional but recommended for `envfile`):
    - `transport`: `local | ssh`
    - `target`: target env-file path (templated with `{env}`)
    - `write`:
      - `mode`: octal file mode (default `600`)
      - `remote_tmp_dir`: temp dir for ssh writes (optional)
      - `sudo`: `true|false` (optional; ssh transport only)
    - `ssh` (ssh transport only): `host` or `hosts`/`hosts_file`, plus optional `user/port/identity_file/options`
      - `hosts_file` supports JSON/YAML list or plain text (one host per line)
    - `pre_commands` / `post_commands`: shell commands to run before/after writing env-file (never print secrets)

## Provider: envfile (local transport)

```yaml
version: 1
policy:
  env:
    cloud:
      targets:
        - id: staging-local-compose
          match:
            env: staging
          set:
            provider: envfile
            runtime: docker-compose
            injection:
              transport: local
              target: /opt/myapp/{env}.env
              post_commands:
                - "cd /opt/myapp && docker compose --env-file /opt/myapp/staging.env up -d"
```

## Provider: envfile (ssh transport)

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
                  - "ubuntu@1.2.3.5"
                options:
                  - "StrictHostKeyChecking=accept-new"
              post_commands:
                - "cd /opt/myapp && docker compose --env-file /opt/myapp/prod.env up -d"
```

Behavior (envfile + ssh):

- Writes remote env-file: `<target>` (chmod `0600`)
- Writes remote meta (no secrets): `<target_dir>/.envctl/<env>.meta.json`
- Optional `pre_commands` / `post_commands` run on each host (must not output secrets)
- `plan/verify` default to local state; pass `--remote --approve-remote` to read remote meta / verify remote hash

# Bitwarden Secrets Manager (`bws`) backend for env tools

## Purpose

Enable using **Bitwarden Secrets Manager** as the **external SSOT for secret values** while keeping the repo as SSOT for:
- env contract / variable names
- values / secret references (`secret_ref`)
- generation + injection tooling (`env-localctl`, `env-cloudctl`)

This is designed for the v1 environment strategy where:
- `staging/prod` runtime workloads are **role-only** (no AK fallback at runtime)
- secret values are **never committed** to the repo or written into docs/context/evidence; they are only written into **generated injection artifacts** (local `.env.local` / remote `<env>.env`) with strict file permissions (0600)

## Motivation

- **Convenience + multi-project reuse**: Bitwarden can be the shared secret store across projects without tying SSOT to one cloud vendor.
- **Security boundary**: keep secret values out of Git and out of IaC state/outputs.
- **Operational clarity**: use a pull-based workflow to generate `.env.local` (dev) or deployment env-files (ops), rather than giving runtime workloads access to Bitwarden.

## Solution (high level)

- Add a new secrets backend: `backend: bws`.
- Resolve secrets via the **Bitwarden Secrets Manager CLI** (`bws`) using an access token provided at runtime:
  - `BWS_ACCESS_TOKEN` environment variable (shell / CI secret store only)
- Use **policy conventions** for project + key naming so teams don’t hand-maintain per-secret locator strings.

## Security invariants (MUST)

- **Do not commit tokens**: `BWS_ACCESS_TOKEN` must be provided via the user shell / CI secret store only.
- **Do not print secret values**: `env_localctl.py` must not log or echo values returned by `bws`.
- **Prefer read-only tokens**: Machine Accounts used for `compile` should typically be read-only for their target Project.
- **No runtime Bitwarden access**: in the recommended deployment model, ECS/runtime does not receive Bitwarden tokens; env/config is injected during deploy.

## Config format

### Secret refs file (`env/secrets/<env>.ref.yaml`)

`env/secrets/<env>.ref.yaml` contains **refs only** (no values). For `bws` you declare:

```yaml
version: 1
secrets:
  db/password:
    backend: bws
    scope: project   # or: shared
    hint: "Bitwarden Secrets Manager secret (resolved via policy conventions)"
```

### Policy conventions (`docs/project/policy.yaml`)

The tooling derives Bitwarden Project name + secret key from policy:

```yaml
version: 1
policy:
  env:
    secrets:
      backends:
        bws:
          projects:
            dev: "<org>-<project>-dev"
            staging: "<org>-<project>-staging"
            prod: "<org>-<project>-prod"
          keys:
            project_prefix: "project/{env}/"
            shared_prefix: "shared/"
```

Resolution:

- `scope: project` → key = `project_prefix.replace("{env}", <env>) + <secret_ref>`
- `scope: shared` → key = `shared_prefix + <secret_ref>`
- Project:
  - if `project_id` is provided in the secret cfg → use it
  - else if `project_name` is provided → use it
  - else → use `policy.env.secrets.backends.bws.projects.<env>`

Optional overrides (avoid unless you have to):

```yaml
secrets:
  legacy/secret:
    backend: bws
    scope: project
    project_name: "some-other-project"
    key: "custom/key/name"
```

### Code

`env-localctl` and `env-cloudctl` support:

- `backend == "bws"`:
  - validates `BWS_ACCESS_TOKEN` exists
  - resolves Project ID (direct or via `bws project list`)
  - resolves Secret ID (via `bws secret list <projectId>`)
  - fetches value (via `bws secret get <secretId>`)
  - caches lookups in-memory for the current run

CLI safety choices:
- Always pass `--color no` to avoid ANSI noise in JSON output.
- Avoid including `stdout` in errors for `bws secret list` failures (because some CLIs may print sensitive content on error).

### Docs

The reference docs for env contracts now list `bws` as a supported backend and include examples.

## What changed (files)

- `.ai/skills/features/environment/env-localctl/scripts/env_localctl.py`
  - Add `bws` backend support and safe CLI runner.
- `.ai/skills/features/environment/env-localctl/references/secrets-backends.md`
  - Document `bws` backend usage and prerequisites.
- `.ai/skills/features/environment/env-contractctl/references/values-and-secrets-format.md`
  - Document `bws` backend in the contract format reference.

## How to verify (no secrets printed)

1. Ensure `bws` is installed and in `PATH`.
2. Export the access token (shell):
   - `export BWS_ACCESS_TOKEN="<token>"`
3. Confirm you can list Projects and Secret keys (IDs only; no values):
   - `bws project list --output json --color no`
   - `bws secret list <PROJECT_ID> --output json --color no`
4. Run env tooling (no values printed):
   - `python .ai/skills/features/environment/env-localctl/scripts/env_localctl.py doctor --env dev`
   - `python .ai/skills/features/environment/env-localctl/scripts/env_localctl.py compile --env dev`

## Non-goals (v1)

- Automatically creating Bitwarden Projects / secrets from the repo.
- Runtime fetching secrets from Bitwarden (dynamic secrets injection at runtime).
- Cloud-provider-specific secret manager integration (e.g., Alibaba Cloud KMS/Credentials Manager).

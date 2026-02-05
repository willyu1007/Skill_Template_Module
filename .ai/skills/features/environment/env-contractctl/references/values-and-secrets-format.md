# env/values and env/secrets reference formats

## env/values/<env>.yaml

- Contains only **non-secret** values.
- Keys must exist in `env/contract.yaml`.
- Must not include any variable marked `secret: true` in contract.

Example:

```yaml
SERVICE_NAME: demo
PORT: 8000
FEATURE_X_ENABLED: true
```

## env/secrets/<env>.ref.yaml

- Contains **secret references only**; no secret values.
- A variable in `env/contract.yaml` with `secret_ref: db_url` requires a matching entry in this file.
- Do not use the legacy `ref:` URI field (e.g. `ref: bws://...`); it is intentionally not supported to avoid dual semantics.
- Do not include a `value` field; secret values must never be stored in repo files.

Supported structure:

```yaml
version: 1
secrets:
  db_url:
    backend: mock
    # mock backend reads from: env/.secrets-store/<env>/db_url
```

Backends:

- `mock`: for tests and local demos (reads from `env/.secrets-store/<env>/<secret_ref>`)
- `env`: read from an environment variable named by `env_var`
- `file`: read from a local file path named by `path` (absolute or repo-relative)
- `bws`: Bitwarden Secrets Manager (CLI) backend (recommended for shared secret SSOT)

Example:

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

Any backend not implemented should fail fast with a clear action request.

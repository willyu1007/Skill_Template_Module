# Secret backend resolution (local)

`env_localctl.py compile` resolves secret variables via secret references.

## Backend: mock

Use for local demos/tests.

- Secret ref example:

```yaml
version: 1
secrets:
  db_url:
    backend: mock
```

- Provide secret material by creating:

```
env/.secrets-store/dev/db_url
```

The file contents are treated as the secret value.

## Backend: env

Use when the secret is already in the process environment:

- Secret ref example:

```yaml
version: 1
secrets:
  api_key:
    backend: env
    env_var: MY_API_KEY
```

## Backend: file

Use when the secret is stored in a local file (gitignored):

```yaml
version: 1
secrets:
  api_key:
    backend: file
    path: ./.secrets/api_key
```

## Backend: bws (Bitwarden Secrets Manager)

Use when secret values live in Bitwarden Secrets Manager, and the repo only stores **secret refs**.

Prereqs:

- Install `bws` CLI
- Provide `BWS_ACCESS_TOKEN` via your shell / CI secret store (never commit it)
- Configure `docs/project/policy.yaml`:
  - `policy.env.secrets.backends.bws.projects.<env>`
  - `policy.env.secrets.backends.bws.keys.project_prefix` / `shared_prefix`

Secret ref example:

```yaml
version: 1
secrets:
  llm_api_key:
    backend: bws
    scope: project   # key = project/{env}/llm_api_key
  sentry_dsn:
    backend: bws
    scope: shared    # key = shared/sentry_dsn
```

## Unsupported backend

If a backend is not implemented, the script fails fast with a clear action request.

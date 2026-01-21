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
    ref: "mock://dev/db_url"
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
    ref: "env://MY_API_KEY"
```

## Backend: file

Use when the secret is stored in a local file (gitignored):

```yaml
version: 1
secrets:
  api_key:
    backend: file
    ref: "file:./.secrets/api_key"
```

## Unsupported backend

If a backend is not implemented, the script fails fast with a clear action request.

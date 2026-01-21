# env/inventory/<env>.yaml format

## Goals

- Provide a single place to declare "where" an environment lives.
- Enable adapter routing (provider/runtime) at execution time.

## Minimal required fields

```yaml
version: 1
env: staging
provider: mockcloud
runtime: mock
```

## Recommended fields

- `account` / `project` / `subscription`
- `region`
- `cluster` / `namespace`
- `...` (provider-specific)

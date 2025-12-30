---
name: example.api
purpose: Module agent instructions for example.api
---

# example.api

Example API module demonstrating the module-first template structure.

## Operating rules

- Read this file first when working inside this module.
- Keep changes local to this module unless explicitly cross-cutting.
- If you change this module's manifest, run:
  - `node .ai/scripts/modulectl.js registry-build`
  - `node .ai/scripts/flowctl.js update-from-manifests`
  - `node .ai/scripts/flowctl.js lint`

## Key files

| File | Purpose |
|------|---------|
| `MANIFEST.yaml` | Module metadata (SSOT) |
| `interact/registry.json` | Context artifacts registry (SSOT) |
| `workdocs/` | Long-running module notes |
| `src/` | Source code |
| `tests/` | Unit/integration tests |
| `config/` | Module configuration |

## Description

This module provides a simple user management HTTP API:

- `POST /api/users` - Create a new user
- `GET /api/users/:id` - Get user by ID
- `GET /api/users` - List all users
- `GET /health` - Health check

## Business flows

This module participates in the `user_management` flow:

```
create_user → get_user
           → list_users
```

## Context artifacts

The module maintains its own context registry at `interact/registry.json`.
To add an artifact (e.g., OpenAPI spec):

```bash
node .ai/scripts/contextctl.js add-artifact \
  --artifact-id openapi \
  --type openapi \
  --path modules/example.api/interact/openapi.yaml \
  --module-id example.api
```

## Testing

For integration testing, scenarios are defined in `modules/integration/scenarios.yaml`.
Run validation and execution:

```bash
node .ai/scripts/integrationctl.js validate
node .ai/scripts/integrationctl.js compile
node .ai/scripts/integrationctl.js run --execute
```


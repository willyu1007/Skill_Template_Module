---
name: example.api
purpose: Module agent instructions for example.api
---

# example.api

Example API module demonstrating the module-first template structure.

## Boundaries

### Responsibilities (DO)

- **User CRUD operations**: Create, read, update, delete user records
- **User validation**: Validate user input data before persistence
- **User serialization**: Transform user data for API responses
- **Health reporting**: Expose service health status

### Non-responsibilities (DO NOT)

- **Authentication/Authorization**: Handled by a separate auth module
- **User notifications**: Handled by a notification service
- **Audit logging**: Handled by infrastructure/middleware
- **Rate limiting**: Handled by API gateway/infrastructure

## Key files

| File | Purpose |
|------|---------|
| `MANIFEST.yaml` | Module metadata (SSOT) |
| `interact/registry.json` | Context artifacts (SSOT) |
| `workdocs/` | Task tracking |
| `src/` | Source code |
| `tests/` | Unit/integration tests |
| `config/` | Module configuration |

## Operating rules

- Keep changes local to module unless cross-cutting
- After manifest changes, run:
  - `node .ai/scripts/modulectl.mjs registry-build`
  - `node .ai/scripts/flowctl.mjs update-from-manifests`
  - `node .ai/scripts/flowctl.mjs lint`
- Use workdocs for multi-step tasks (see `workdocs/README.md`)

## Description

The module provides a simple user management HTTP API:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/users` | POST | Create a new user |
| `/api/users/:id` | GET | Get user by ID |
| `/api/users` | GET | List all users |
| `/health` | GET | Health check |

## Business flows

Participates in `user_management` flow:

```
create_user → get_user
           → list_users
```

## Context artifacts

Registry: `interact/registry.json`

Add artifact example:

```bash
node .ai/skills/features/context-awareness/scripts/contextctl.mjs add-artifact \
  --artifact-id openapi \
  --type openapi \
  --path modules/example.api/interact/openapi.yaml \
  --module-id example.api
```

## Testing

Scenarios: `modules/integration/scenarios.yaml`

```bash
node .ai/scripts/integrationctl.mjs validate
node .ai/scripts/integrationctl.mjs compile
node .ai/scripts/integrationctl.mjs run --execute
```

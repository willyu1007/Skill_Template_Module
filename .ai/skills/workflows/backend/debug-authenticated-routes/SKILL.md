---
name: debug-authenticated-routes
description: Debug authenticated API route failures (401/403/404) by reproducing requests, inspecting auth middleware, route registration, and permission logic.
---

# Debug Authenticated Routes

## Purpose
Systematically diagnose and fix failures on protected API routes, especially `401 Unauthorized`, `403 Forbidden`, and “route not found” issues that only occur under authentication.

## When to use
Use this skill when:
- A protected endpoint returns `401` even after login
- A protected endpoint returns `403` unexpectedly (permission mismatch)
- A route returns `404` despite being implemented (registration/prefix mismatch)
- Cookie/session or bearer token authentication behaves inconsistently
- An auth middleware change causes broad regressions

## Inputs
Provide (or collect) the following:
- Endpoint: method + path
- A failing request example:
  - headers (redact secrets)
  - cookie names (redact values)
  - body/query/params
- Observed response:
  - status code
  - response body
- Expected behavior:
  - required user role/permission
  - expected status code and response shape
- Environment context:
  - local vs staging vs production
  - reverse proxy / gateway presence (if any)

## Outputs
- A root-cause diagnosis (what layer is failing and why)
- A minimal fix plan (code/config changes)
- Verification steps (how to confirm the fix)
- Optional: a regression-prevention recommendation (test/monitoring)

## Steps

### 1. Reproduce with a known-good auth context
- Obtain a valid session/token for a test user with the expected permissions.
- Repeat the request using a deterministic HTTP client (curl, Postman, integration test).
- Confirm the auth context is actually attached:
  - cookie present and sent
  - `Authorization: Bearer …` present and formatted correctly

### 2. Classify the failure by status code
- `401`: authentication not established or not recognized
- `403`: authentication established, but permission rule denies
- `404`: route not registered, wrong prefix, wrong method, or being shadowed
- `5xx`: unhandled exception or downstream dependency failure

### 3. Trace the request through the HTTP stack
1. Request parsing (body parser / content-type)
2. Authentication middleware
3. Authorization middleware (roles/permissions)
4. Validation middleware (if any)
5. Route matching (path + method + prefix)
6. Controller and service execution

### 4. Common root causes (and what to check)

#### Cookie/session auth issues
- Cookie flags (`Secure`, `SameSite`, domain/path) prevent the cookie from being sent.
- Reverse proxy strips or rewrites headers.
- Session store mismatch between instances/environments.

#### Bearer token issues
- Token is expired, malformed, or signed with a different key.
- Token is valid but missing required claims/scopes.

#### Permission issues (`403`)
- Route requires a role that the test user does not have.
- Permission check uses the wrong identifier (tenant/project/org mismatch).
- Service enforces stricter rules than controller/middleware (or vice versa).

#### Route “not found” issues (`404`)
- Route prefix differs between registration and expectation (e.g., `/api` vs no prefix).
- HTTP method mismatch (calling `POST` while the code only registers `PUT`).
- An earlier, more generic route pattern intercepts the request.

### 5. Apply a minimal fix
- Prefer fixing the root cause (middleware order, route prefix, permission rule).
- Avoid adding bypasses except in controlled dev-only scenarios.

### 6. Verify
- Re-run the failing request using the same auth context.
- Run one additional check:
  - invalid auth → should return `401`
  - insufficient permission → should return `403`
- Confirm logs/metrics show expected status codes.

## Verification

- [ ] Root cause is identified (which layer is failing and why)
- [ ] Fix resolves the original failure
- [ ] Re-running the failing request returns expected status
- [ ] Invalid auth returns 401
- [ ] Insufficient permission returns 403
- [ ] Logs/metrics show expected status codes after fix

## Boundaries

- MUST NOT paste real tokens or session cookies into documentation
- MUST NOT weaken production auth checks to "make the request work"
- MUST NOT introduce auth bypasses in production code
- SHOULD add a regression test when the issue was systemic (middleware order, shared auth logic)
- SHOULD NOT skip verification after applying fixes
- SHOULD NOT assume cookie/token is attached without confirming

## Included assets
- Templates: `./templates/` contains a debugging checklist and a request capture template.
- Examples: `./examples/` includes typical 401/403/404 triage notes.

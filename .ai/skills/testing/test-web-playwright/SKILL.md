---
name: test-web-playwright
description: Playwright Web UI E2E automation: bootstrap, author specs, run/debug, and triage failures with consistent artifacts and CI hooks.
---

# Playwright Web UI Automation (workflow)

## Operating mode (token-efficient)
- Treat this skill as a **router + governor**.
- Do **not** load multiple procedures. Select exactly **one** procedure below and follow it end-to-end.
- Prefer **small, reviewable changes**; keep tests deterministic.

## Routing (pick one procedure)

| Task | Open this procedure | Optional examples |
|---|---|---|
| Bootstrap Playwright in a repo | `reference/procedures/bootstrap.md` | `reference/examples/playwright.config.ts` |
| Add a new E2E test/spec | `reference/procedures/add-test.md` | `reference/examples/smoke.spec.ts`, `reference/examples/auth-setup.ts` |
| Run locally (debug) | `reference/procedures/run-local.md` | — |
| Triage failures / reduce flaky | `reference/procedures/triage-failures.md` | — |

## Shared non-negotiables (apply to all procedures)
1) **Stable selectors**
   - Prefer `data-testid` / `data-test` attributes or role-based locators.
   - Avoid brittle CSS/XPath tied to layout.

2) **No fixed sleeps**
   - Do not use arbitrary `waitForTimeout` as a primary strategy.
   - Use Playwright auto-wait + explicit assertions (`expect(...)`) with timeouts.

3) **Test isolation**
   - Each test must be runnable independently.
   - Use API-level setup for test data when feasible; avoid shared mutable state.

4) **Artifact contract (for CI + triage)**
   - Standardize under: `artifacts/playwright/`
   - Must include (at least on failure): `trace`, `screenshot`, and a machine-readable result (e.g., JUnit).

5) **No secrets in repo**
   - Credentials must come from CI secrets / local env vars.
   - Never commit tokens, cookies, or real user passwords.

## Minimal inputs you should capture before changing code
- Target environment(s): local / dev / staging
- Base URL and navigation entry point(s)
- Auth model: none / basic / cookie / SSO (and how to bypass for tests)
- Target browser matrix (Chromium-only vs cross-browser)
- Test data strategy (seeded fixtures, dedicated test tenant)

## Verification
- If you changed **skills**:
  - Prefer host-repo tooling if present:
    - `node .ai/scripts/lint-skills.cjs --strict`
  - Always run the local validator:
    - `node .ai/skills/testing/test-web-playwright/scripts/validate-skill.cjs`

- If you changed **tests/config**:
  - `npx playwright --version`
  - `npx playwright test`
  - If reports are generated:
    - `npx playwright show-report artifacts/playwright/report` (path may vary by config)

## Boundaries
- Do not edit `.codex/skills/` or `.claude/skills/` directly (generated).
- Do not introduce new test frameworks if Playwright already exists.
- Do not rely on production data or production credentials.
- Do not disable assertions to "make tests pass"; fix the underlying determinism issue.


## Reconnaissance-then-action workflow (borrowed)

When debugging or authoring UI automation, prefer a two-phase loop:

1. **Reconnaissance**
   - Confirm the target app is running (or start it using existing repo scripts).
   - Navigate to the target page and wait for the app to become idle (Playwright auto-wait + explicit `expect` assertions; avoid fixed sleeps).
   - Inspect the rendered DOM and identify stable selectors (role-based locators or `data-testid`).
   - Capture artifacts early when triaging (screenshot/trace/logs) so failures are actionable.

2. **Action**
   - Implement the interaction using the discovered selectors.
   - Assert on outcomes (URL change, visible text, network response, saved state) rather than implementation details.

**Static HTML shortcut:** if you are automating a static HTML page, you can inspect the file contents to find stable selectors first.

### If Cypress and Playwright skills are both loaded

- Do not attempt to use both frameworks in the same test suite.
- Choose the framework already present in the repo (or explicitly requested by the user) and proceed with that skill's procedures.

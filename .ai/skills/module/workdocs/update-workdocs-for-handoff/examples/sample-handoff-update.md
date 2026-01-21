# Example: Handoff update (blocked task)

## `03-implementation-notes.md` update (sketch)
- Current status: blocked
- Blocker: waiting for schema access approval
- Next steps:
  1) Once access is granted, run migrations
  2) Re-run verification
  3) Update `04-verification.md` with results

## `01-plan.md` update (sketch)
- [x] Milestone 1: ...
- [ ] Milestone 2: ... (blocked)

## `04-verification.md` update (sketch)
- [x] Typecheck/build
- [ ] Integration tests (blocked by missing environment variable)
- Notes: ...

## `05-pitfalls.md` update (sketch)
- Do not attempt to run integration tests without env var `FOO_API_KEY`; tests will fail with <error>.

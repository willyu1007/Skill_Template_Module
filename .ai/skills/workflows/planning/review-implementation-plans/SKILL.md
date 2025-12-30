---
name: review-implementation-plans
description: Review implementation plans for completeness, feasibility, risks, dependencies, and verification criteria before execution.
---

# Review Implementation Plans

## Purpose
Improve delivery outcomes by reviewing plans for missing steps, hidden risks, and unclear verification.

## When to use
Use this skill when:
- A technical plan or design doc is drafted
- A refactor plan needs validation before execution
- Work is complex and spans multiple modules/services
- You want to reduce rework and integration failures

## Inputs
- The plan (goals, scope, steps)
- Constraints (timeline, team, must-not-change areas)
- Known dependencies (services, APIs, schemas)
- Non-functional requirements (performance, security, reliability)

## Outputs
- A review report with:
  - must-fix gaps
  - recommended improvements
  - explicit acceptance criteria
  - verification plan
- A revised plan outline if the original is incomplete

## Review checklist
- Goals and non-goals are explicit.
- Scope is bounded and realistic.
- Dependencies are identified (data, APIs, infra).
- Risks are listed with mitigations.
- Migration/rollout plan exists (if needed).
- Verification is concrete:
  - tests
  - manual checks
  - monitoring/alerts
- Backout/rollback is possible.

## Steps
1. Restate the goal in one sentence.
2. Identify missing pre-work (schema changes, migrations, permissions).
3. Identify integration points and failure modes.
4. Ensure tasks are ordered and parallelizable where possible.
5. Add acceptance criteria for each milestone.
6. Ensure verification and rollout/backout are included.

## Verification

- [ ] Goals and non-goals are explicit in the plan
- [ ] Scope is bounded and realistic
- [ ] Dependencies are identified and verified
- [ ] Risks are listed with mitigations
- [ ] Verification criteria are concrete and testable
- [ ] Rollback/backout strategy exists for user-facing changes

## Boundaries

- MUST NOT approve plans that lack explicit verification criteria
- MUST NOT approve plans without a rollback strategy for user-facing changes
- MUST NOT skip risk assessment for plans involving data migrations or breaking changes
- MUST NOT assume dependencies are stable without verifying
- SHOULD NOT approve plans with unbounded scope or vague success criteria
- SHOULD NOT skip review of integration points and failure modes

## Included assets
- Templates: `./templates/` includes a plan review rubric.

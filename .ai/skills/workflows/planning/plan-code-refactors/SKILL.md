---
name: plan-code-refactors
description: Plan code refactors by defining goals, mapping dependencies, sequencing steps, and defining verification/rollback checkpoints.
---

# Plan Code Refactors

## Purpose
Create a refactor plan that reduces risk and avoids breaking builds by sequencing changes, defining checkpoints, and clarifying success criteria.

## When to use
Use this skill when:
- A module/component has grown unmanageable
- You need to reorganize folders or boundaries
- You want to standardize repeated patterns across the codebase
- You are preparing a large dependency or framework upgrade

## Inputs
- The refactor motivation (what pain it addresses)
- Current structure and known pain points
- Constraints (time, risk tolerance, compatibility requirements)
- Verification tools (build, tests, lint, e2e)

## Outputs
- A phased refactor plan with checkpoints
- A dependency map for the refactor scope
- A risk register with mitigations
- Clear acceptance criteria and verification actions per phase

## Steps
1. Define goals and non-goals.
2. Inventory the scope:
   - files/modules involved
   - external callers
3. Identify refactor strategy:
   - extract modules
   - rename/restructure
   - introduce new abstractions
4. Sequence steps:
   - small, buildable increments
   - define rollback points
5. Define verification for each step:
   - typecheck
   - unit tests
   - integration tests
6. Define rollout/backout (if user-facing behavior changes).

## Verification

- [ ] Refactor goals and non-goals are explicitly defined
- [ ] All affected dependencies are identified
- [ ] Plan includes buildable checkpoints between phases
- [ ] Each phase has defined verification actions
- [ ] Risk register includes mitigations
- [ ] Rollback points are defined for each phase

## Boundaries

- MUST NOT plan refactors without identifying all affected dependencies first
- MUST NOT plan changes that leave the codebase in a non-buildable state
- MUST NOT mix behavior changes with structural refactors in the same phase
- MUST NOT skip verification checkpoints between phases
- SHOULD NOT plan "big bang" refactors; prefer incremental, reversible steps
- SHOULD NOT skip rollback/backout planning for user-facing changes

## Included assets
- Templates: `./templates/` includes a phased refactor plan outline.

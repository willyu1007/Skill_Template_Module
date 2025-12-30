---
name: execute-code-refactor
description: Execute safe, dependency-aware code refactors (file moves, component extraction, import rewrites) with verification at each step.
---

# Execute Code Refactor

## Purpose
Perform non-trivial refactors without breaking builds by planning dependency changes, applying incremental edits, and verifying continuously.

## When to use
Use this skill when:
- Reorganizing file/folder structures
- Breaking large modules/components into smaller units
- Standardizing repeated patterns across the codebase
- Updating imports after moves
- Replacing inconsistent patterns (e.g., loading indicators, error handling)

## Inputs
- Refactor goal and success criteria (what should improve)
- Scope (which modules/features are in scope)
- Constraints (minimal diff, no behavior change, deadlines)
- Verification tools available (TypeScript build, tests, lint)

## Outputs
- A refactor plan with ordered steps and rollback points
- A dependency map (what imports what) for files being moved/renamed
- A sequence of changes that keeps the codebase buildable
- Verification notes (what was run and passed)

## Core rules
- Before moving/renaming, you MUST identify all import sites.
- Refactors SHOULD be incremental; keep the code buildable after each step.
- Behavior-changing refactors MUST be separated from structural refactors when possible.
- Verification MUST be continuous (build/tests at checkpoints).

## Steps
1. Define the refactor objective and boundaries.
2. Inventory dependencies:
   - incoming imports (who depends on this file/module)
   - outgoing imports (what it depends on)
3. Choose a target structure:
   - feature-based, layer-based, or hybrid (match codebase conventions)
4. Apply changes incrementally:
   - move one module at a time
   - update imports
   - run build/tests
5. Extract repeated patterns carefully:
   - introduce a new abstraction
   - migrate call sites gradually
   - keep behavior stable
6. Final verification:
   - build clean
   - tests pass
   - no circular deps introduced

## Verification

- [ ] Build passes after each incremental step
- [ ] All import sites are updated after moves/renames
- [ ] No circular dependencies introduced
- [ ] Tests pass after refactor completion
- [ ] Behavior is unchanged (no functional regressions)
- [ ] Refactor plan milestones are documented and tracked

## Boundaries

- MUST NOT move files without updating all import sites
- MUST NOT mix behavior changes with structural refactors
- MUST NOT skip verification after each incremental step
- MUST NOT introduce circular dependencies
- SHOULD NOT refactor large scopes in a single change (break into incremental steps)
- SHOULD NOT bypass tests to expedite refactor completion

## Included assets
- Templates: `./templates/` includes a refactor checklist and dependency mapping worksheet.
- Examples: `./examples/` includes a "large component extraction" playbook.

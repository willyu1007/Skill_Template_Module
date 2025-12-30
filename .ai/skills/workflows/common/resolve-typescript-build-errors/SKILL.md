---
name: resolve-typescript-build-errors
description: Resolve TypeScript compilation errors by triaging diagnostics, fixing root causes, and verifying via a clean compile.
---

# Resolve TypeScript Build Errors

## Purpose
Fix TypeScript compilation errors efficiently by grouping diagnostics, addressing root causes first, and verifying with a clean compile.

## When to use
Use this skill when:
- `tsc` (or your build) fails with type errors
- A refactor introduced widespread type breakage
- You upgraded dependencies and type definitions changed
- CI fails on TypeScript checks

## Inputs
- The full TypeScript diagnostic output (copy/paste is fine)
- The command used to reproduce the errors (or the CI step)
- The scope of the change (which packages/modules were modified)
- Any constraints (do not refactor, minimal fix, etc.)

## Outputs
- A prioritized error list grouped by root cause
- Code changes that resolve the errors with minimal collateral changes
- Verification notes: which command(s) now pass

## Core rules
- You MUST fix root causes before chasing downstream errors.
- You SHOULD avoid `@ts-ignore` and unsafe casts; if used, you MUST justify and isolate them.
- You MUST verify by re-running the TypeScript check until it is clean.

## Steps
1. **Collect diagnostics**
   - Capture the full error output (not just the first error).
   - Identify which compilation target is failing (app, server, library).

2. **Group errors**
   - missing exports/imports
   - incompatible types (assignment/signature mismatch)
   - property does not exist (shape mismatch)
   - `unknown`/`any` escapes
   - generic constraints failures

3. **Prioritize root causes**
   - start with missing types/exports
   - then address broad interface/type definition mismatches
   - then address local typing issues

4. **Apply minimal fixes**
   - align interfaces and function signatures
   - correct imports and module exports
   - improve type narrowing for `unknown`
   - add explicit return types at boundaries if inference becomes ambiguous

5. **Verify**
   - re-run the same TypeScript check
   - repeat until there are no errors
   - optionally run unit tests if changes were non-trivial

## Verification

- [ ] TypeScript build completes with zero errors
- [ ] No `@ts-ignore` or unsafe casts introduced without justification
- [ ] Root cause errors are fixed (not just downstream symptoms)
- [ ] Unit tests pass after fixes (if applicable)
- [ ] CI TypeScript checks pass
- [ ] Changes are minimal and targeted (no unrelated refactors)

## Boundaries

- MUST NOT use `@ts-ignore` without explicit justification
- MUST NOT use `as any` to silence errors
- MUST NOT fix downstream errors before root causes
- MUST NOT introduce new type unsafety to resolve errors
- SHOULD NOT refactor unrelated code while fixing type errors
- SHOULD NOT skip verification after each batch of fixes

## Included assets
- Templates: `./templates/` includes a triage worksheet and common fix patterns.
- Examples: `./examples/` includes a sample error-to-fix mapping.

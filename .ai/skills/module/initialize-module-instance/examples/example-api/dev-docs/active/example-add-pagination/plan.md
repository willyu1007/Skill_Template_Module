# Add Pagination to User List API

## Goal

Add cursor-based pagination to `GET /api/users` endpoint to handle large user datasets efficiently.

## Success Criteria

- [ ] `GET /api/users` accepts `?cursor=<string>&limit=<int>` query params
- [ ] Response includes `nextCursor` field when more results exist
- [ ] Default limit is 20, max limit is 100
- [ ] Backward compatible: existing clients without pagination params get first page
- [ ] Unit tests cover pagination logic
- [ ] Integration test validates cursor continuity

## Constraints / Non-goals

- **Non-goal**: Offset-based pagination (cursor is preferred for consistency)
- **Constraint**: No breaking changes to existing response shape
- **Constraint**: Must work with current in-memory data store

## Work Breakdown

### Phase 1: Core Implementation
- [x] Define pagination types (`PaginationParams`, `PaginatedResponse<T>`)
- [x] Implement cursor encoding/decoding utility
- [ ] Update `listUsers` service method to accept pagination
- [ ] Update controller to parse query params and call service

### Phase 2: Validation & Edge Cases
- [ ] Add input validation for `limit` (1-100 range)
- [ ] Handle invalid cursor gracefully (return 400)
- [ ] Handle empty result set

### Phase 3: Testing
- [ ] Unit tests for cursor utility
- [ ] Unit tests for paginated service method
- [ ] Integration test for full request flow

### Phase 4: Documentation
- [ ] Update OpenAPI spec with pagination params
- [ ] Update module MANIFEST if interface changes

## Validation Plan

```bash
# Type check
npx tsc --noEmit

# Unit tests
npm test -- --grep "pagination"

# Integration test (if scenarios exist)
node .ai/scripts/modules/ctl-integration.mjs validate
node .ai/scripts/modules/ctl-integration.mjs compile

# Lint
npm run lint
```

## Rollback Plan

- Revert commits in reverse order
- Pagination is additive; no data migration needed
- Existing clients unaffected (default pagination applied)

## Progress Log

| Date | Status | Notes |
|------|--------|-------|
| 2025-01-02 | Started | Created dev-docs bundle, defined types |
| 2025-01-02 | In Progress | Cursor utility implemented |

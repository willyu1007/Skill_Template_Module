# Decisions: Add Pagination

## Decision 1: Cursor Type

**Question**: Should we use opaque cursors or timestamp/ID-based cursors?

**Options**:
1. Opaque base64-encoded cursor containing internal state
2. Visible timestamp cursor (e.g., `?after=2025-01-01T00:00:00Z`)
3. Visible ID cursor (e.g., `?after_id=user_123`)

**Decision**: Option 1 — Opaque base64-encoded cursor

**Rationale**:
- Allows internal implementation changes without breaking clients
- Can encode multiple fields (id + timestamp) for stable sorting
- Prevents clients from manipulating cursor values

**Trade-offs**:
- Less debuggable than visible cursors
- Requires encoding/decoding logic

---

## Decision 2: Default Page Size

**Question**: What should the default and maximum page sizes be?

**Decision**: Default 20, Maximum 100

**Rationale**:
- 20 is a common default that balances payload size and roundtrips
- 100 max prevents abuse while allowing reasonable bulk fetches
- Consistent with common API conventions (GitHub, Stripe)

---

## Decision 3: Response Shape

**Question**: How to structure the paginated response?

**Options**:
1. Wrap in envelope: `{ data: [...], pagination: { nextCursor, hasMore } }`
2. Flat with fields: `{ users: [...], nextCursor, hasMore }`
3. Link-based (HATEOAS): `{ users: [...], links: { next: "..." } }`

**Decision**: Option 2 — Flat structure

**Rationale**:
- Simpler for clients to consume
- Backward compatible (just adds new fields)
- `nextCursor` is null when no more results (self-documenting)

**Example Response**:
```json
{
  "users": [...],
  "nextCursor": "eyJpZCI6InVzZXJfMTIzIn0=",
  "hasMore": true
}
```

---

## Decision 4: Empty Cursor Handling

**Question**: What happens when cursor is invalid or expired?

**Decision**: Return HTTP 400 with clear error message

**Rationale**:
- Invalid input should fail fast
- Clients can recover by starting from beginning
- Better than silent fallback which could cause confusion


# Context: Add Pagination

## Relevant Files

| File | Purpose | Status |
|------|---------|--------|
| `src/controllers/users.ts` | HTTP handler for /api/users | To modify |
| `src/services/userService.ts` | Business logic for user operations | To modify |
| `src/types/pagination.ts` | Pagination type definitions | New file |
| `src/utils/cursor.ts` | Cursor encoding/decoding | New file |
| `tests/pagination.test.ts` | Pagination unit tests | New file |
| `interact/openapi.yaml` | API specification | To update |

## Relevant Scripts

```bash
# Build and type check
npm run build

# Run tests
npm test

# Update module registry after manifest changes
node .ai/scripts/modulectl.mjs registry-build
node .ai/skills/features/context-awareness/scripts/contextctl.mjs build
```

## Related Flow Nodes

- `user_management.list_users` — affected by pagination changes

## External References

- [Cursor Pagination Best Practices](https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination)
- Module MANIFEST: `modules/example.api/MANIFEST.yaml`

## Open Questions

1. ~~Should we use opaque cursors or timestamp-based?~~ → **Decided**: Opaque base64-encoded cursor (see decisions.md)
2. ~~What's the default page size?~~ → **Decided**: 20 items

## Dependencies

- No external package dependencies added
- Uses built-in `Buffer` for base64 encoding

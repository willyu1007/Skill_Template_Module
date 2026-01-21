# Extension Exclusion Configuration

## Task
- Task slug: `<task_slug>`
- Module: `<module_id>`
- Date: `<YYYY-MM-DD>`

## Detected Extensions

| Extension | Version | Creates objects in public? |
|-----------|---------|---------------------------|
| `<extname>` | `<version>` | Yes/No |

## Extension-owned objects

### Tables (in public schema)
- `<table_name>` (owned by: `<extension>`)

### Types
- `<type_name>` (owned by: `<extension>`)

### Functions
- `<function_name>` (owned by: `<extension>`)

## Exclusion strategy

### Chosen approach
- [ ] **Option A**: Exclude extension-owned objects from diff (filter in ORM config)
- [ ] **Option B**: Move user tables to dedicated schema (e.g., `app`)
- [ ] **Option C**: Accept extension objects in diff (manual review required)

### Configuration changes

#### Prisma (`schema.prisma`)
```prisma
// If using Option B (dedicated schema):
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  schemas  = ["app"]  // Only manage 'app' schema
}

generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["multiSchema"]
}

model User {
  // ...
  @@schema("app")
}
```

#### Alembic (`env.py`)
```python
# If using Option A (filter extension objects):
def include_object(object, name, type_, reflected, compare_to):
    # Exclude extension-owned tables
    extension_tables = {'spatial_ref_sys', 'geometry_columns', 'geography_columns'}
    if type_ == 'table' and name in extension_tables:
        return False
    return True

context.configure(
    # ...
    include_object=include_object,
)
```

## Verification
- [ ] Exclusion config applied to ORM
- [ ] Diff preview no longer shows extension-owned objects
- [ ] User tables are correctly included in migrations
- [ ] Shadow database (if used) has matching extension setup

## Notes
- <Any additional notes about the exclusion strategy>

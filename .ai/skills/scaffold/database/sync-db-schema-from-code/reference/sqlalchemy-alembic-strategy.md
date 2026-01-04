# SQLAlchemy + Alembic strategy (if present)

If the project uses SQLAlchemy models and Alembic for migrations, treat the ORM models (and Alembic configuration) as the schema SSOT.

## Preview (no writes)
- Generate a new revision script using autogeneration (this compares current DB schema vs ORM metadata).
- Review the generated revision script carefully, focusing on destructive operations and type changes.

## Apply (after approval)
- Apply migrations via `alembic upgrade head` (or the project's deployment mechanism) and record the execution log.

## Notes
- Autogeneration is a starting point; you may need to hand-edit migrations for complex changes.
- Keep migration scripts versioned in the repo.

# Tests (SQLite smoke)

These tests are intended as a lightweight sanity check for the included scripts.

## What is covered
- `scripts/db_connect_check.py` against a local SQLite database
- `scripts/db_schema_snapshot.py` against a local SQLite database

## How to run
From this skill directory:

```bash
bash ./tests/run_smoke_tests.sh
```

If you want to inspect the generated artifacts, the script prints the temp directory path.

#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPTS_DIR="$ROOT_DIR/scripts"

TMP_DIR="$(mktemp -d)"
DB_PATH="$TMP_DIR/test.db"

python3 - <<'PY' "$DB_PATH"
import sqlite3
import sys

db_path = sys.argv[1]
conn = sqlite3.connect(db_path)
cur = conn.cursor()

cur.execute("CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE, created_at TEXT)")
cur.execute("CREATE TABLE posts (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, title TEXT, FOREIGN KEY(user_id) REFERENCES users(id))")
conn.commit()
conn.close()
print(f"Created sqlite DB at: {db_path}")
PY

# For absolute paths, the canonical form is sqlite:////tmp/...
DB_URL="sqlite:////${DB_PATH#/}"

echo "TMP_DIR: $TMP_DIR"
echo "DB_URL:  $DB_URL"

echo "Running db_connect_check.py..."
python3 "$SCRIPTS_DIR/db_connect_check.py" --url "$DB_URL" --out "$TMP_DIR/connection.md"

# Ensure the output indicates PASS.
if ! grep -q "Status: \*\*PASS\*\*" "$TMP_DIR/connection.md"; then
  echo "Expected PASS in connection.md" >&2
  cat "$TMP_DIR/connection.md" >&2
  exit 1
fi

echo "Running db_schema_snapshot.py..."
python3 "$SCRIPTS_DIR/db_schema_snapshot.py" --url "$DB_URL" --out "$TMP_DIR/snapshot.json" --include-sql

# Validate expected tables exist in the snapshot.
if ! grep -q '"users"' "$TMP_DIR/snapshot.json"; then
  echo "Expected 'users' table in snapshot.json" >&2
  cat "$TMP_DIR/snapshot.json" >&2
  exit 1
fi
if ! grep -q '"posts"' "$TMP_DIR/snapshot.json"; then
  echo "Expected 'posts' table in snapshot.json" >&2
  cat "$TMP_DIR/snapshot.json" >&2
  exit 1
fi

echo "All smoke tests passed. Artifacts at: $TMP_DIR"

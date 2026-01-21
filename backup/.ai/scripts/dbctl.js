#!/usr/bin/env node
/**
 * dbctl.js
 *
 * Database schema mirror management for the db-mirror add-on.
 * The real database is the source of truth; this manages structured mirrors.
 *
 * Commands:
 *   init              Initialize db/ directory skeleton (idempotent)
 *   add-table         Add a table to the schema mirror
 *   remove-table      Remove a table from the schema mirror
 *   list-tables       List tables in the schema
 *   verify            Verify schema mirror consistency
 *   generate-migration  Generate a new migration file
 *   sync-to-context   Sync schema to docs/context/ (if context-awareness enabled)
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// ============================================================================
// CLI Argument Parsing
// ============================================================================

function usage(exitCode = 0) {
  const msg = `
Usage:
  node .ai/scripts/dbctl.js <command> [options]

Commands:
  init
    --repo-root <path>          Repo root (default: cwd)
    --dry-run                   Show what would be created without writing
    Initialize db/ directory skeleton (idempotent).

  add-table
    --name <string>             Table name (required)
    --columns <string>          Column definitions: "name:type[:constraint],..." (required)
    --repo-root <path>          Repo root (default: cwd)
    Add a table to the schema mirror.

  remove-table
    --name <string>             Table name (required)
    --repo-root <path>          Repo root (default: cwd)
    Remove a table from the schema mirror.

  list-tables
    --repo-root <path>          Repo root (default: cwd)
    --format <text|json>        Output format (default: text)
    List tables in the schema.

  verify
    --repo-root <path>          Repo root (default: cwd)
    --env <string>              Environment to verify against (optional)
    Verify schema mirror consistency.

  generate-migration
    --name <string>             Migration name (required)
    --repo-root <path>          Repo root (default: cwd)
    Generate a new migration file.

  sync-to-context
    --repo-root <path>          Repo root (default: cwd)
    Sync schema to docs/context/db/ (requires context-awareness).

Examples:
  node .ai/scripts/dbctl.js init
  node .ai/scripts/dbctl.js add-table --name users --columns "id:uuid:pk,email:string:unique,created_at:timestamp"
  node .ai/scripts/dbctl.js list-tables
  node .ai/scripts/dbctl.js generate-migration --name add-user-roles
  node .ai/scripts/dbctl.js verify --env dev
`;
  console.log(msg.trim());
  process.exit(exitCode);
}

function die(msg, exitCode = 1) {
  console.error(msg);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  if (args.length === 0 || args[0] === '-h' || args[0] === '--help') usage(0);

  const command = args.shift();
  const opts = {};
  const positionals = [];

  while (args.length > 0) {
    const token = args.shift();
    if (token === '-h' || token === '--help') usage(0);

    if (token.startsWith('--')) {
      const key = token.slice(2);
      if (args.length > 0 && !args[0].startsWith('--')) {
        opts[key] = args.shift();
      } else {
        opts[key] = true;
      }
    } else {
      positionals.push(token);
    }
  }

  return { command, opts, positionals };
}

// ============================================================================
// File Utilities
// ============================================================================

function readJson(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    return { op: 'mkdir', path: dirPath };
  }
  return { op: 'skip', path: dirPath, reason: 'exists' };
}

function writeFileIfMissing(filePath, content) {
  if (fs.existsSync(filePath)) {
    return { op: 'skip', path: filePath, reason: 'exists' };
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  return { op: 'write', path: filePath };
}

// ============================================================================
// Database Schema Management
// ============================================================================

function getDbDir(repoRoot) {
  return path.join(repoRoot, 'db');
}

function getSchemaPath(repoRoot) {
  return path.join(getDbDir(repoRoot), 'schema', 'tables.json');
}

function getEnvConfigPath(repoRoot) {
  return path.join(getDbDir(repoRoot), 'config', 'db-environments.json');
}

function getMigrationsDir(repoRoot) {
  return path.join(getDbDir(repoRoot), 'migrations');
}

function loadSchema(repoRoot) {
  const schemaPath = getSchemaPath(repoRoot);
  const data = readJson(schemaPath);
  if (!data) {
    return {
      version: 1,
      lastUpdated: new Date().toISOString(),
      tables: []
    };
  }
  return data;
}

function saveSchema(repoRoot, schema) {
  schema.lastUpdated = new Date().toISOString();
  writeJson(getSchemaPath(repoRoot), schema);
}

function loadEnvConfig(repoRoot) {
  const configPath = getEnvConfigPath(repoRoot);
  const data = readJson(configPath);
  if (!data) {
    return {
      environments: []
    };
  }
  return data;
}

function parseColumnDef(colDef) {
  const parts = colDef.split(':');
  if (parts.length < 2) {
    return null;
  }
  return {
    name: parts[0],
    type: parts[1],
    constraints: parts.slice(2)
  };
}

// ============================================================================
// Commands
// ============================================================================

function cmdInit(repoRoot, dryRun) {
  const dbDir = getDbDir(repoRoot);
  const actions = [];

  // Create directory structure
  const dirs = [
    dbDir,
    path.join(dbDir, 'schema'),
    path.join(dbDir, 'migrations'),
    path.join(dbDir, 'config'),
    path.join(dbDir, 'samples'),
    path.join(dbDir, 'workdocs')
  ];

  for (const dir of dirs) {
    if (dryRun) {
      actions.push({ op: 'mkdir', path: dir, mode: 'dry-run' });
    } else {
      actions.push(ensureDir(dir));
    }
  }

  // Create AGENTS.md
  const agentsPath = path.join(dbDir, 'AGENTS.md');
  const agentsContent = `# Database Mirror (LLM-first)

## Conclusions (read first)

- Real databases are the **source of truth**; this directory holds structured mirrors.
- AI/LLM uses these mirrors to understand schema and propose changes.
- All database operations go through scripts - no direct database manipulation.

## Directory Structure

| Path | Purpose |
|------|---------|
| \`schema/tables.json\` | Table structure definitions |
| \`migrations/\` | Migration files (timestamped) |
| \`config/\` | Environment-specific DB config |
| \`samples/\` | Sample/seed data |
| \`workdocs/\` | Design decisions and plans |

## Commands

\`\`\`bash
# Add a table
node .ai/scripts/dbctl.js add-table --name users --columns "id:uuid:pk,email:string:unique"

# List tables
node .ai/scripts/dbctl.js list-tables

# Generate migration
node .ai/scripts/dbctl.js generate-migration --name add-user-roles

# Verify schema
node .ai/scripts/dbctl.js verify
\`\`\`

## AI/LLM Guidelines

1. **Read** \`schema/tables.json\` to understand current schema
2. **Propose** schema changes by editing mirror files
3. **Generate** migrations via \`dbctl generate-migration\`
4. **Document** intentions in \`workdocs/\`
5. **Never** directly connect to databases or run arbitrary SQL

Humans execute migrations and handle credentials.
`;

  if (dryRun) {
    actions.push({ op: 'write', path: agentsPath, mode: 'dry-run' });
  } else {
    actions.push(writeFileIfMissing(agentsPath, agentsContent));
  }

  // Create tables.json
  const schemaPath = getSchemaPath(repoRoot);
  if (!fs.existsSync(schemaPath) && !dryRun) {
    const schema = {
      version: 1,
      lastUpdated: new Date().toISOString(),
      tables: []
    };
    writeJson(schemaPath, schema);
    actions.push({ op: 'write', path: schemaPath });
  } else if (dryRun) {
    actions.push({ op: 'write', path: schemaPath, mode: 'dry-run' });
  } else {
    actions.push({ op: 'skip', path: schemaPath, reason: 'exists' });
  }

  // Create db-environments.json
  const envConfigPath = getEnvConfigPath(repoRoot);
  if (!fs.existsSync(envConfigPath) && !dryRun) {
    const envConfig = {
      environments: [
        {
          id: 'dev',
          description: 'Local development',
          connectionTemplate: 'postgresql://${DB_USER}:${DB_PASSWORD}@localhost:5432/${DB_NAME}',
          permissions: {
            migrations: true,
            seedData: true,
            directQueries: true
          }
        },
        {
          id: 'staging',
          description: 'Staging environment',
          connectionTemplate: 'postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:5432/${DB_NAME}',
          permissions: {
            migrations: true,
            seedData: true,
            directQueries: false
          }
        },
        {
          id: 'prod',
          description: 'Production environment',
          connectionTemplate: 'postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:5432/${DB_NAME}',
          permissions: {
            migrations: true,
            seedData: false,
            directQueries: false
          }
        }
      ]
    };
    writeJson(envConfigPath, envConfig);
    actions.push({ op: 'write', path: envConfigPath });
  } else if (dryRun) {
    actions.push({ op: 'write', path: envConfigPath, mode: 'dry-run' });
  } else {
    actions.push({ op: 'skip', path: envConfigPath, reason: 'exists' });
  }

  // Create workdocs README
  const workdocsReadmePath = path.join(dbDir, 'workdocs', 'README.md');
  const workdocsContent = `# Database Workdocs

Use this directory for:
- Schema design decisions
- Migration planning
- Data modeling discussions
- Change history and rationale
`;

  if (dryRun) {
    actions.push({ op: 'write', path: workdocsReadmePath, mode: 'dry-run' });
  } else {
    actions.push(writeFileIfMissing(workdocsReadmePath, workdocsContent));
  }

  console.log('[ok] Database mirror initialized.');
  for (const action of actions) {
    const mode = action.mode ? ` (${action.mode})` : '';
    const reason = action.reason ? ` [${action.reason}]` : '';
    console.log(`  ${action.op}: ${path.relative(repoRoot, action.path)}${mode}${reason}`);
  }
}

function cmdAddTable(repoRoot, name, columnsStr) {
  if (!name) die('[error] --name is required');
  if (!columnsStr) die('[error] --columns is required');

  const schema = loadSchema(repoRoot);

  // Check if table exists
  if (schema.tables.find(t => t.name === name)) {
    die(`[error] Table "${name}" already exists. Use remove-table first.`);
  }

  // Parse columns
  const columnDefs = columnsStr.split(',').map(c => c.trim());
  const columns = [];
  for (const colDef of columnDefs) {
    const col = parseColumnDef(colDef);
    if (!col) {
      die(`[error] Invalid column definition: ${colDef}. Format: name:type[:constraint,...]`);
    }
    columns.push(col);
  }

  schema.tables.push({
    name,
    columns,
    createdAt: new Date().toISOString()
  });

  saveSchema(repoRoot, schema);
  console.log(`[ok] Added table: ${name} (${columns.length} columns)`);
  for (const col of columns) {
    const constraints = col.constraints.length > 0 ? ` [${col.constraints.join(', ')}]` : '';
    console.log(`  - ${col.name}: ${col.type}${constraints}`);
  }
}

function cmdRemoveTable(repoRoot, name) {
  if (!name) die('[error] --name is required');

  const schema = loadSchema(repoRoot);
  const index = schema.tables.findIndex(t => t.name === name);

  if (index === -1) {
    die(`[error] Table "${name}" not found.`);
  }

  schema.tables.splice(index, 1);
  saveSchema(repoRoot, schema);
  console.log(`[ok] Removed table: ${name}`);
}

function cmdListTables(repoRoot, format) {
  const schema = loadSchema(repoRoot);

  if (format === 'json') {
    console.log(JSON.stringify(schema, null, 2));
    return;
  }

  console.log(`Database Schema (${schema.tables.length} tables):`);
  console.log(`Last updated: ${schema.lastUpdated || 'unknown'}\n`);

  if (schema.tables.length === 0) {
    console.log('  (no tables defined)');
    return;
  }

  for (const table of schema.tables) {
    console.log(`  [${table.name}]`);
    for (const col of table.columns || []) {
      const constraints = col.constraints?.length > 0 ? ` [${col.constraints.join(', ')}]` : '';
      console.log(`    - ${col.name}: ${col.type}${constraints}`);
    }
    console.log('');
  }
}

function cmdVerify(repoRoot, env) {
  const errors = [];
  const warnings = [];
  const dbDir = getDbDir(repoRoot);

  // Check db directory exists
  if (!fs.existsSync(dbDir)) {
    errors.push('db/ directory does not exist. Run: dbctl init');
  }

  // Check schema exists
  const schemaPath = getSchemaPath(repoRoot);
  if (!fs.existsSync(schemaPath)) {
    errors.push('schema/tables.json does not exist. Run: dbctl init');
  } else {
    const schema = loadSchema(repoRoot);

    // Verify tables have valid structure
    for (const table of schema.tables) {
      if (!table.name) {
        errors.push('Found table without name');
      }
      if (!table.columns || table.columns.length === 0) {
        warnings.push(`Table "${table.name}" has no columns defined`);
      }
    }
  }

  // Check environment config if env specified
  if (env) {
    const envConfig = loadEnvConfig(repoRoot);
    const envEntry = envConfig.environments?.find(e => e.id === env);
    if (!envEntry) {
      errors.push(`Environment "${env}" not found in db-environments.json`);
    }
  }

  // Check migrations directory
  const migrationsDir = getMigrationsDir(repoRoot);
  if (!fs.existsSync(migrationsDir)) {
    warnings.push('migrations/ directory does not exist');
  }

  // Report results
  if (errors.length > 0) {
    console.log('\nErrors:');
    for (const e of errors) console.log(`  - ${e}`);
  }

  if (warnings.length > 0) {
    console.log('\nWarnings:');
    for (const w of warnings) console.log(`  - ${w}`);
  }

  const ok = errors.length === 0;
  if (ok) {
    console.log('[ok] Database schema verification passed.');
  } else {
    console.log('[error] Database schema verification failed.');
    process.exit(1);
  }
}

function cmdGenerateMigration(repoRoot, name) {
  if (!name) die('[error] --name is required');

  const migrationsDir = getMigrationsDir(repoRoot);
  ensureDir(migrationsDir);

  // Generate timestamp-based filename
  const timestamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
  const safeName = name.replace(/[^a-z0-9-_]/gi, '-').toLowerCase();
  const filename = `${timestamp}_${safeName}.sql`;
  const filePath = path.join(migrationsDir, filename);

  const content = `-- Migration: ${name}
-- Generated: ${new Date().toISOString()}
-- 
-- Instructions:
-- 1. Fill in the UP migration below
-- 2. Add DOWN migration for rollback
-- 3. Test in dev environment first
-- 4. Have a human execute in staging/prod

-- ============================================================================
-- UP Migration
-- ============================================================================

-- TODO: Add your schema changes here

-- ============================================================================
-- DOWN Migration (Rollback)
-- ============================================================================

-- TODO: Add rollback statements here
`;

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`[ok] Generated migration: ${filename}`);
  console.log(`     Path: ${path.relative(repoRoot, filePath)}`);
}

function cmdSyncToContext(repoRoot) {
  const contextDbPath = path.join(repoRoot, 'docs', 'context', 'db', 'schema.json');
  const contextDir = path.dirname(contextDbPath);

  // Ensure context layer exists
  if (!fs.existsSync(path.join(repoRoot, 'docs', 'context'))) {
    die('[error] Context layer not found. Run: node .ai/scripts/contextctl.js init');
  }

  // Load schema
  const schema = loadSchema(repoRoot);

  // Ensure context db directory exists
  ensureDir(contextDir);

  // Write a schema file into docs/context
  writeJson(contextDbPath, {
    source: 'db-mirror',
    syncedAt: new Date().toISOString(),
    schema: schema
  });

  console.log(`[ok] Synced schema to ${path.relative(repoRoot, contextDbPath)}`);

  // Register/refresh project context registry entry (SSOT)
  try {
    const projectRegistryPath = path.join(repoRoot, 'docs', 'context', 'project.registry.json');
    const rel = path.relative(repoRoot, contextDbPath).split(path.sep).join('/');
    const checksum = crypto.createHash('sha256').update(fs.readFileSync(contextDbPath)).digest('hex');

    let reg;
    if (fs.existsSync(projectRegistryPath)) {
      reg = JSON.parse(fs.readFileSync(projectRegistryPath, 'utf8'));
    } else {
      reg = { version: 1, moduleId: 'project', updatedAt: new Date().toISOString(), artifacts: [] };
    }

    reg.artifacts = Array.isArray(reg.artifacts) ? reg.artifacts : [];

    const artifactId = 'db-schema';
    const now = new Date().toISOString();
    const existing = reg.artifacts.find((a) => (a.artifactId ?? a.id) === artifactId);

    const record = {
      artifactId,
      type: 'db-schema',
      path: rel,
      mode: 'generated',
      format: 'json',
      tags: ['database'],
      checksumSha256: checksum,
      lastUpdated: now
    };

    if (existing) {
      Object.assign(existing, record);
    } else {
      reg.artifacts.push(record);
    }

    reg.updatedAt = now;
    fs.writeFileSync(projectRegistryPath, JSON.stringify(reg, null, 2) + '\n', 'utf8');
    console.log(`[ok] Registered project context artifact "${artifactId}" in ${path.relative(repoRoot, projectRegistryPath)}`);
  } catch (e) {
    console.log(`[warn] Failed to register DB schema in project registry: ${e.message}`);
  }

  // Build derived registry
  console.log('     Run: node .ai/scripts/contextctl.js build');
}

// ============================================================================
// Main
// ============================================================================

function main() {
  const { command, opts } = parseArgs(process.argv);
  const repoRoot = path.resolve(opts['repo-root'] || process.cwd());
  const format = (opts['format'] || 'text').toLowerCase();

  switch (command) {
    case 'init':
      cmdInit(repoRoot, !!opts['dry-run']);
      break;
    case 'add-table':
      cmdAddTable(repoRoot, opts['name'], opts['columns']);
      break;
    case 'remove-table':
      cmdRemoveTable(repoRoot, opts['name']);
      break;
    case 'list-tables':
      cmdListTables(repoRoot, format);
      break;
    case 'verify':
      cmdVerify(repoRoot, opts['env']);
      break;
    case 'generate-migration':
      cmdGenerateMigration(repoRoot, opts['name']);
      break;
    case 'sync-to-context':
      cmdSyncToContext(repoRoot);
      break;
    default:
      console.error(`[error] Unknown command: ${command}`);
      usage(1);
  }
}

main();

#!/usr/bin/env node
/**
 * packctl.js
 *
 * Packaging configuration management for the packaging add-on.
 *
 * Commands:
 *   init              Initialize packaging configuration (idempotent)
 *   list              List packaging targets
 *   add               Add a packaging target
 *   remove            Remove a packaging target
 *   verify            Verify packaging configuration
 *   status            Show packaging status
 */

import fs from 'node:fs';
import path from 'node:path';

// ============================================================================
// CLI Argument Parsing
// ============================================================================

function usage(exitCode = 0) {
  const msg = `
Usage:
  node .ai/scripts/packctl.js <command> [options]

Commands:
  init
    --repo-root <path>          Repo root (default: cwd)
    --dry-run                   Show what would be created
    Initialize packaging configuration.

  list
    --repo-root <path>          Repo root (default: cwd)
    --format <text|json>        Output format (default: text)
    List packaging targets.

  add
    --name <string>             Target name (required)
    --type <service|job|app>    Target type (required)
    --repo-root <path>          Repo root (default: cwd)
    Add a packaging target.

  remove
    --name <string>             Target name (required)
    --repo-root <path>          Repo root (default: cwd)
    Remove a packaging target.

  verify
    --repo-root <path>          Repo root (default: cwd)
    Verify packaging configuration.

  status
    --repo-root <path>          Repo root (default: cwd)
    --format <text|json>        Output format (default: text)
    Show packaging status.

Examples:
  node .ai/scripts/packctl.js init
  node .ai/scripts/packctl.js add --name api-server --type service
  node .ai/scripts/packctl.js list
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
    }
  }

  return { command, opts };
}

// ============================================================================
// File Utilities
// ============================================================================

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
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

// ============================================================================
// Packaging Management
// ============================================================================

function getPackagingDir(repoRoot) {
  return path.join(repoRoot, 'ops', 'packaging');
}

function getRegistryPath(repoRoot) {
  return path.join(repoRoot, 'docs', 'packaging', 'registry.json');
}

function loadRegistry(repoRoot) {
  return readJson(getRegistryPath(repoRoot)) || {
    version: 1,
    targets: []
  };
}

function saveRegistry(repoRoot, registry) {
  registry.lastUpdated = new Date().toISOString();
  writeJson(getRegistryPath(repoRoot), registry);
}

// ============================================================================
// Commands
// ============================================================================

function cmdInit(repoRoot, dryRun) {
  const packagingDir = getPackagingDir(repoRoot);
  const actions = [];

  const dirs = [
    packagingDir,
    path.join(packagingDir, 'services'),
    path.join(packagingDir, 'jobs'),
    path.join(packagingDir, 'apps'),
    path.join(packagingDir, 'scripts'),
    path.join(packagingDir, 'workdocs'),
    path.join(repoRoot, 'docs', 'packaging')
  ];

  for (const dir of dirs) {
    if (dryRun) {
      actions.push({ op: 'mkdir', path: dir, mode: 'dry-run' });
    } else {
      actions.push(ensureDir(dir));
    }
  }

  const registryPath = getRegistryPath(repoRoot);
  if (!fs.existsSync(registryPath) && !dryRun) {
    saveRegistry(repoRoot, { version: 1, targets: [] });
    actions.push({ op: 'write', path: registryPath });
  }

  console.log('[ok] Packaging configuration initialized.');
  for (const a of actions) {
    const mode = a.mode ? ` (${a.mode})` : '';
    const reason = a.reason ? ` [${a.reason}]` : '';
    console.log(`  ${a.op}: ${path.relative(repoRoot, a.path)}${mode}${reason}`);
  }
}

function cmdList(repoRoot, format) {
  const registry = loadRegistry(repoRoot);

  if (format === 'json') {
    console.log(JSON.stringify(registry, null, 2));
    return;
  }

  console.log(`Packaging Targets (${registry.targets.length}):\n`);
  if (registry.targets.length === 0) {
    console.log('  (no targets defined)');
    return;
  }

  for (const target of registry.targets) {
    console.log(`  [${target.type}] ${target.name}`);
  }
}

function cmdAdd(repoRoot, name, type) {
  if (!name) die('[error] --name is required');
  if (!type) die('[error] --type is required');

  const validTypes = ['service', 'job', 'app'];
  if (!validTypes.includes(type)) {
    die(`[error] --type must be one of: ${validTypes.join(', ')}`);
  }

  const registry = loadRegistry(repoRoot);
  if (registry.targets.find(t => t.name === name)) {
    die(`[error] Target "${name}" already exists`);
  }

  registry.targets.push({ name, type, addedAt: new Date().toISOString() });
  saveRegistry(repoRoot, registry);

  // Create target directory
  const targetDir = path.join(getPackagingDir(repoRoot), `${type}s`, name);
  ensureDir(targetDir);

  console.log(`[ok] Added packaging target: ${name} (${type})`);
}

function cmdRemove(repoRoot, name) {
  if (!name) die('[error] --name is required');

  const registry = loadRegistry(repoRoot);
  const index = registry.targets.findIndex(t => t.name === name);
  if (index === -1) {
    die(`[error] Target "${name}" not found`);
  }

  registry.targets.splice(index, 1);
  saveRegistry(repoRoot, registry);
  console.log(`[ok] Removed packaging target: ${name}`);
}

function cmdVerify(repoRoot) {
  const errors = [];
  const warnings = [];

  if (!fs.existsSync(getPackagingDir(repoRoot))) {
    errors.push('ops/packaging/ not found. Run: packctl init');
  }

  const registry = loadRegistry(repoRoot);
  if (registry.targets.length === 0) {
    warnings.push('No packaging targets defined');
  }

  if (errors.length > 0) {
    console.log('\nErrors:');
    for (const e of errors) console.log(`  - ${e}`);
  }
  if (warnings.length > 0) {
    console.log('\nWarnings:');
    for (const w of warnings) console.log(`  - ${w}`);
  }

  const ok = errors.length === 0;
  console.log(ok ? '[ok] Packaging configuration verified.' : '[error] Verification failed.');
  process.exit(ok ? 0 : 1);
}

function cmdStatus(repoRoot, format) {
  const registry = loadRegistry(repoRoot);
  const status = {
    initialized: fs.existsSync(getPackagingDir(repoRoot)),
    targets: registry.targets.length,
    lastUpdated: registry.lastUpdated
  };

  if (format === 'json') {
    console.log(JSON.stringify(status, null, 2));
    return;
  }

  console.log('Packaging Status:');
  console.log(`  Initialized: ${status.initialized ? 'yes' : 'no'}`);
  console.log(`  Targets: ${status.targets}`);
  console.log(`  Last updated: ${status.lastUpdated || 'never'}`);
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
    case 'list':
      cmdList(repoRoot, format);
      break;
    case 'add':
      cmdAdd(repoRoot, opts['name'], opts['type']);
      break;
    case 'remove':
      cmdRemove(repoRoot, opts['name']);
      break;
    case 'verify':
      cmdVerify(repoRoot);
      break;
    case 'status':
      cmdStatus(repoRoot, format);
      break;
    default:
      console.error(`[error] Unknown command: ${command}`);
      usage(1);
  }
}

main();

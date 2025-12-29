#!/usr/bin/env node
/**
 * releasectl.js
 *
 * Release management for the release add-on.
 *
 * Commands:
 *   init              Initialize release configuration (idempotent)
 *   status            Show release status
 *   prepare           Prepare a new release
 *   verify            Verify release configuration
 */

import fs from 'node:fs';
import path from 'node:path';

// ============================================================================
// CLI Argument Parsing
// ============================================================================

function usage(exitCode = 0) {
  const msg = `
Usage:
  node .ai/scripts/releasectl.js <command> [options]

Commands:
  init
    --repo-root <path>          Repo root (default: cwd)
    --dry-run                   Show what would be created
    Initialize release configuration.

  status
    --repo-root <path>          Repo root (default: cwd)
    --format <text|json>        Output format (default: text)
    Show release status.

  prepare
    --version <string>          Version to prepare (required)
    --repo-root <path>          Repo root (default: cwd)
    Prepare a new release.

  verify
    --repo-root <path>          Repo root (default: cwd)
    Verify release configuration.

Examples:
  node .ai/scripts/releasectl.js init
  node .ai/scripts/releasectl.js prepare --version 1.0.0
  node .ai/scripts/releasectl.js status
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

function writeFileIfMissing(filePath, content) {
  if (fs.existsSync(filePath)) {
    return { op: 'skip', path: filePath, reason: 'exists' };
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  return { op: 'write', path: filePath };
}

// ============================================================================
// Release Management
// ============================================================================

function getReleaseDir(repoRoot) {
  return path.join(repoRoot, 'release');
}

function getConfigPath(repoRoot) {
  return path.join(getReleaseDir(repoRoot), 'config.json');
}

function loadConfig(repoRoot) {
  return readJson(getConfigPath(repoRoot)) || {
    version: 1,
    currentVersion: null,
    releases: []
  };
}

function saveConfig(repoRoot, config) {
  config.lastUpdated = new Date().toISOString();
  writeJson(getConfigPath(repoRoot), config);
}

// ============================================================================
// Commands
// ============================================================================

function cmdInit(repoRoot, dryRun) {
  const releaseDir = getReleaseDir(repoRoot);
  const actions = [];

  const dirs = [releaseDir, path.join(releaseDir, 'workdocs')];
  for (const dir of dirs) {
    if (dryRun) {
      actions.push({ op: 'mkdir', path: dir, mode: 'dry-run' });
    } else {
      actions.push(ensureDir(dir));
    }
  }

  // Create config
  const configPath = getConfigPath(repoRoot);
  if (!fs.existsSync(configPath) && !dryRun) {
    saveConfig(repoRoot, { version: 1, currentVersion: null, releases: [] });
    actions.push({ op: 'write', path: configPath });
  }

  // Create AGENTS.md
  const agentsPath = path.join(releaseDir, 'AGENTS.md');
  const agentsContent = `# Release Management (LLM-first)

## Commands

\`\`\`bash
node .ai/scripts/releasectl.js init
node .ai/scripts/releasectl.js status
node .ai/scripts/releasectl.js prepare --version 1.0.0
\`\`\`

## Guidelines

- Use semantic versioning (MAJOR.MINOR.PATCH)
- Document changes in CHANGELOG.md
- Create release notes before tagging
`;

  if (dryRun) {
    actions.push({ op: 'write', path: agentsPath, mode: 'dry-run' });
  } else {
    actions.push(writeFileIfMissing(agentsPath, agentsContent));
  }

  // Create changelog template
  const changelogPath = path.join(releaseDir, 'changelog-template.md');
  const changelogContent = `# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added
### Changed
### Deprecated
### Removed
### Fixed
### Security
`;

  if (dryRun) {
    actions.push({ op: 'write', path: changelogPath, mode: 'dry-run' });
  } else {
    actions.push(writeFileIfMissing(changelogPath, changelogContent));
  }

  console.log('[ok] Release configuration initialized.');
  for (const a of actions) {
    const mode = a.mode ? ` (${a.mode})` : '';
    const reason = a.reason ? ` [${a.reason}]` : '';
    console.log(`  ${a.op}: ${path.relative(repoRoot, a.path)}${mode}${reason}`);
  }
}

function cmdStatus(repoRoot, format) {
  const config = loadConfig(repoRoot);
  const status = {
    initialized: fs.existsSync(getReleaseDir(repoRoot)),
    currentVersion: config.currentVersion,
    totalReleases: config.releases.length,
    lastUpdated: config.lastUpdated
  };

  if (format === 'json') {
    console.log(JSON.stringify(status, null, 2));
    return;
  }

  console.log('Release Status:');
  console.log(`  Initialized: ${status.initialized ? 'yes' : 'no'}`);
  console.log(`  Current version: ${status.currentVersion || '(none)'}`);
  console.log(`  Total releases: ${status.totalReleases}`);
  console.log(`  Last updated: ${status.lastUpdated || 'never'}`);
}

function cmdPrepare(repoRoot, version) {
  if (!version) die('[error] --version is required');

  // Validate semver format (basic)
  if (!/^\d+\.\d+\.\d+/.test(version)) {
    die('[error] Version must follow semantic versioning (e.g., 1.0.0)');
  }

  const config = loadConfig(repoRoot);
  
  if (config.releases.find(r => r.version === version)) {
    die(`[error] Version ${version} already exists`);
  }

  config.releases.push({
    version,
    preparedAt: new Date().toISOString(),
    status: 'prepared'
  });
  config.currentVersion = version;
  saveConfig(repoRoot, config);

  console.log(`[ok] Prepared release: ${version}`);
  console.log('\nNext steps:');
  console.log('  1. Update CHANGELOG.md with release notes');
  console.log('  2. Review and test the release');
  console.log('  3. Tag and publish when ready');
}

function cmdVerify(repoRoot) {
  const errors = [];
  const warnings = [];

  if (!fs.existsSync(getReleaseDir(repoRoot))) {
    errors.push('release/ not found. Run: releasectl init');
  }

  const config = loadConfig(repoRoot);
  if (!config.currentVersion) {
    warnings.push('No current version set');
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
  console.log(ok ? '[ok] Release configuration verified.' : '[error] Verification failed.');
  process.exit(ok ? 0 : 1);
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
    case 'status':
      cmdStatus(repoRoot, format);
      break;
    case 'prepare':
      cmdPrepare(repoRoot, opts['version']);
      break;
    case 'verify':
      cmdVerify(repoRoot);
      break;
    default:
      console.error(`[error] Unknown command: ${command}`);
      usage(1);
  }
}

main();

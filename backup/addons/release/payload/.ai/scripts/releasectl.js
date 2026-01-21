#!/usr/bin/env node
/**
 * releasectl.js
 *
 * Release management for the release add-on.
 *
 * Manages:
 * - `release/config.json` (strategy, versions, release history)
 * - Release planning templates and verification
 *
 * Tagging is a human-run operation (uses git locally; does not push).
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// ============================================================================
// CLI
// ============================================================================

function usage(exitCode = 0) {
  const msg = `
Usage:
  node .ai/scripts/releasectl.js <command> [options]

Commands:
  help
    Show this help.

  init
    --repo-root <path>                 Repo root (default: cwd)
    --strategy <semantic|calendar|manual>  Versioning strategy (default: semantic)
    --dry-run                          Show what would be created/updated
    Initialize release configuration (idempotent).

  status
    --repo-root <path>                 Repo root (default: cwd)
    --format <text|json>               Output format (default: text)
    Show release status.

  prepare
    --version <string>                 Version to prepare (required)
    --repo-root <path>                 Repo root (default: cwd)
    Prepare a new release.

  changelog
    --from <ref>                       Git ref to start from (optional)
    --to <ref>                         Git ref to end at (default: HEAD)
    --repo-root <path>                 Repo root (default: cwd)
    Generate a changelog snippet from git history (prints to stdout).

  tag
    --version <string>                 Version to tag (required)
    --message <string>                 Tag message (optional)
    --repo-root <path>                 Repo root (default: cwd)
    Create an annotated git tag (local only).

  verify
    --repo-root <path>                 Repo root (default: cwd)
    Verify release configuration.

Examples:
  node .ai/scripts/releasectl.js init --strategy semantic
  node .ai/scripts/releasectl.js prepare --version 1.2.0
  node .ai/scripts/releasectl.js changelog --from v1.0.0 --to HEAD
  node .ai/scripts/releasectl.js tag --version 1.2.0
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
  if (args.length === 0) usage(0);

  const command = args.shift();
  const opts = { _: [] };

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
      opts._.push(token);
    }
  }

  return { command, opts };
}

// ============================================================================
// Schema / Files
// ============================================================================

const VALID_STRATEGIES = ['semantic', 'calendar', 'manual'];

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
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
  if (fs.existsSync(filePath)) return { op: 'skip', path: filePath, reason: 'exists' };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  return { op: 'write', path: filePath };
}

function getReleaseDir(repoRoot) {
  return path.join(repoRoot, 'release');
}

function getConfigPath(repoRoot) {
  return path.join(getReleaseDir(repoRoot), 'config.json');
}

function normalizeConfig(raw, { strategy } = {}) {
  const config = raw && typeof raw === 'object' ? { ...raw } : {};

  if (typeof config.version !== 'number') config.version = 1;

  if (!config.updatedAt && typeof config.lastUpdated === 'string') config.updatedAt = config.lastUpdated;
  delete config.lastUpdated;

  const desired = strategy && VALID_STRATEGIES.includes(strategy) ? strategy : 'semantic';
  if (typeof config.strategy !== 'string' || !VALID_STRATEGIES.includes(config.strategy)) {
    config.strategy = desired;
  }

  if (typeof config.currentVersion !== 'string' && config.currentVersion !== null) {
    config.currentVersion = config.currentVersion == null ? null : String(config.currentVersion);
  }

  if (typeof config.changelog !== 'boolean') config.changelog = true;
  if (!config.branches || typeof config.branches !== 'object') config.branches = { main: 'main', develop: 'develop' };

  if (!Array.isArray(config.releases)) config.releases = [];
  config.releases = config.releases
    .filter((r) => r && typeof r === 'object' && typeof r.version === 'string')
    .map((r) => ({
      version: r.version,
      preparedAt: typeof r.preparedAt === 'string' ? r.preparedAt : undefined,
      taggedAt: typeof r.taggedAt === 'string' ? r.taggedAt : undefined,
      status: typeof r.status === 'string' ? r.status : 'prepared'
    }));

  return config;
}

function loadConfig(repoRoot, normalizeOpts) {
  return normalizeConfig(readJson(getConfigPath(repoRoot)), normalizeOpts);
}

function saveConfig(repoRoot, config) {
  const next = normalizeConfig(config);
  next.updatedAt = new Date().toISOString();
  writeJson(getConfigPath(repoRoot), next);
  return next;
}

function validateVersion(strategy, version) {
  if (!version || typeof version !== 'string') return false;
  if (strategy === 'semantic') return /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version);
  if (strategy === 'calendar') return /^\d{4}\.\d{2}\.\d{2}$/.test(version);
  return version.trim() !== '';
}

function runGit(repoRoot, args) {
  const res = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
  if (res.error) return { ok: false, error: res.error.message, stdout: '', stderr: '' };
  if (res.status !== 0) return { ok: false, error: res.stderr || `git exit ${res.status}`, stdout: res.stdout || '', stderr: res.stderr || '' };
  return { ok: true, stdout: res.stdout || '', stderr: res.stderr || '' };
}

// ============================================================================
// Commands
// ============================================================================

function cmdInit(repoRoot, { dryRun, strategy }) {
  const actions = [];

  const releaseDir = getReleaseDir(repoRoot);
  const dirs = [releaseDir, path.join(releaseDir, 'workdocs')];
  for (const dir of dirs) {
    if (dryRun) actions.push({ op: 'mkdir', path: dir, mode: 'dry-run' });
    else actions.push(ensureDir(dir));
  }

  const configPath = getConfigPath(repoRoot);
  const existing = readJson(configPath);
  const normalized = normalizeConfig(existing, { strategy });
  if (dryRun) actions.push({ op: 'write', path: configPath, mode: 'dry-run' });
  else {
    saveConfig(repoRoot, normalized);
    actions.push({ op: 'write', path: configPath });
  }

  const agentsPath = path.join(releaseDir, 'AGENTS.md');
  const agentsContent = `# Release Management - AI Guidance\n\n## Workflow\n\n1. Prepare: \`node .ai/scripts/releasectl.js prepare --version <version>\`\n2. Generate changelog: \`node .ai/scripts/releasectl.js changelog\`\n3. Request human approval\n4. Tag: \`node .ai/scripts/releasectl.js tag --version <version>\`\n\n## Strategies\n\n- semantic: major.minor.patch\n- calendar: YYYY.MM.DD\n- manual: custom\n\n## Forbidden Actions\n\n- Skipping release approval\n- Tagging without verification\n`;
  if (dryRun) actions.push({ op: 'write', path: agentsPath, mode: 'dry-run' });
  else actions.push(writeFileIfMissing(agentsPath, agentsContent));

  const changelogTemplatePath = path.join(releaseDir, 'changelog-template.md');
  const changelogContent = `# Changelog\n\nAll notable changes to this project will be documented in this file.\n\n## [Unreleased]\n\n### Added\n### Changed\n### Deprecated\n### Removed\n### Fixed\n### Security\n`;
  if (dryRun) actions.push({ op: 'write', path: changelogTemplatePath, mode: 'dry-run' });
  else actions.push(writeFileIfMissing(changelogTemplatePath, changelogContent));

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
    strategy: config.strategy,
    currentVersion: config.currentVersion,
    totalReleases: Array.isArray(config.releases) ? config.releases.length : 0,
    updatedAt: config.updatedAt
  };

  if (format === 'json') {
    console.log(JSON.stringify(status, null, 2));
    return;
  }

  console.log('Release Status:');
  console.log(`  Initialized: ${status.initialized ? 'yes' : 'no'}`);
  console.log(`  Strategy: ${status.strategy}`);
  console.log(`  Current version: ${status.currentVersion || '(none)'}`);
  console.log(`  Total prepared releases: ${status.totalReleases}`);
  console.log(`  Updated: ${status.updatedAt || 'never'}`);
}

function cmdPrepare(repoRoot, version) {
  if (!version) die('[error] --version is required');

  const config = loadConfig(repoRoot);
  if (!validateVersion(config.strategy, version)) {
    die(`[error] Version "${version}" does not match strategy "${config.strategy}"`);
  }

  const releases = Array.isArray(config.releases) ? config.releases : [];
  if (releases.find((r) => r.version === version)) die(`[error] Version ${version} already exists`);

  releases.push({ version, preparedAt: new Date().toISOString(), status: 'prepared' });
  config.releases = releases;
  config.currentVersion = version;
  saveConfig(repoRoot, config);

  console.log(`[ok] Prepared release: ${version}`);
  console.log('\nNext steps:');
  console.log('  1. Run verification/tests');
  console.log('  2. Generate/update changelog');
  console.log('  3. Tag when approved');
}

function cmdChangelog(repoRoot, { from, to }) {
  const toRef = to || 'HEAD';

  // Prefer an explicit range if provided, otherwise attempt to use the latest tag.
  let range = null;
  if (from) {
    range = `${from}..${toRef}`;
  } else {
    const lastTag = runGit(repoRoot, ['describe', '--tags', '--abbrev=0']);
    if (lastTag.ok && lastTag.stdout.trim()) {
      range = `${lastTag.stdout.trim()}..${toRef}`;
    }
  }

  const logArgs = ['log'];
  if (range) logArgs.push(range);
  logArgs.push('--no-merges', '--pretty=format:%h %s');

  const log = runGit(repoRoot, logArgs);
  if (!log.ok) {
    die(`[error] Failed to read git log: ${log.error}`);
  }

  const lines = log.stdout
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const title = range ? `Changes (${range})` : 'Changes';
  console.log(`# ${title}\n`);
  if (lines.length === 0) {
    console.log('- (no commits found)');
    return;
  }
  for (const l of lines) console.log(`- ${l}`);
}

function cmdTag(repoRoot, { version, message }) {
  if (!version) die('[error] --version is required');

  const config = loadConfig(repoRoot);
  if (!validateVersion(config.strategy, version.replace(/^v/, ''))) {
    // Allow passing v-prefixed version; validate the numeric portion for semantic strategy.
    const trimmed = version.startsWith('v') ? version.slice(1) : version;
    if (!validateVersion(config.strategy, trimmed)) {
      die(`[error] Version "${version}" does not match strategy "${config.strategy}"`);
    }
  }

  const tagName = version.startsWith('v') ? version : `v${version}`;
  const msg = message || `Release ${tagName}`;

  // Verify git repo
  const isRepo = runGit(repoRoot, ['rev-parse', '--is-inside-work-tree']);
  if (!isRepo.ok) die('[error] Not a git repository (missing .git).');

  // Check tag existence
  const exists = runGit(repoRoot, ['rev-parse', '-q', '--verify', `refs/tags/${tagName}`]);
  if (exists.ok) die(`[error] Tag already exists: ${tagName}`);

  const tagRes = runGit(repoRoot, ['tag', '-a', tagName, '-m', msg]);
  if (!tagRes.ok) die(`[error] Failed to create tag: ${tagRes.error}`);

  // Update config history
  const trimmedVersion = tagName.startsWith('v') ? tagName.slice(1) : tagName;
  const releases = Array.isArray(config.releases) ? [...config.releases] : [];
  const idx = releases.findIndex((r) => r.version === trimmedVersion);
  if (idx >= 0) {
    releases[idx] = { ...releases[idx], taggedAt: new Date().toISOString(), status: 'tagged' };
  } else {
    releases.push({ version: trimmedVersion, taggedAt: new Date().toISOString(), status: 'tagged' });
  }
  config.releases = releases;
  config.currentVersion = trimmedVersion;
  saveConfig(repoRoot, config);

  console.log(`[ok] Created tag: ${tagName}`);
  console.log(`Next: git push origin ${tagName}`);
}

function cmdVerify(repoRoot) {
  const errors = [];
  const warnings = [];

  if (!fs.existsSync(getReleaseDir(repoRoot))) errors.push('release/ not found. Run: releasectl init');
  if (!fs.existsSync(getConfigPath(repoRoot))) errors.push('release/config.json not found. Run: releasectl init');

  const config = loadConfig(repoRoot);
  if (!VALID_STRATEGIES.includes(config.strategy)) errors.push(`Invalid strategy: ${String(config.strategy)}`);
  if (!config.currentVersion) warnings.push('No currentVersion set');

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
  const format = String(opts.format || 'text').toLowerCase();

  if (command === 'help') usage(0);

  switch (command) {
    case 'init': {
      const strategy = opts.strategy ? String(opts.strategy).toLowerCase() : 'semantic';
      if (!VALID_STRATEGIES.includes(strategy)) {
        die(`[error] --strategy must be one of: ${VALID_STRATEGIES.join(', ')}`);
      }
      cmdInit(repoRoot, { dryRun: !!opts['dry-run'], strategy });
      break;
    }
    case 'status':
      cmdStatus(repoRoot, format);
      break;
    case 'prepare':
      cmdPrepare(repoRoot, opts.version);
      break;
    case 'changelog':
      cmdChangelog(repoRoot, { from: opts.from, to: opts.to });
      break;
    case 'tag':
      cmdTag(repoRoot, { version: opts.version, message: opts.message });
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

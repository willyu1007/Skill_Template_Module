#!/usr/bin/env node
/**
 * cictl.js
 *
 * CI/CD configuration management (core capability).
 *
 * SSOT:
 * - ci/config.json
 *
 * Templates:
 * - .gitlab-ci/gitlab-ci.yaml.template (optional; for GitLab CI)
 *
 * Generated (DERIVED):
 * - .gitlab-ci.yml
 * - .github/workflows/ci.yml
 */

import fs from 'node:fs';
import path from 'node:path';

import { dumpYaml, loadYamlFile } from './lib/yaml.js';

const SUPPORTED_PLATFORMS = ['github-actions', 'gitlab-ci'];
const KNOWN_FEATURES = ['lint', 'test', 'build', 'security', 'release', 'deploy'];
const DEFAULT_FEATURES = ['lint', 'test', 'build'];
const PLATFORM_SUPPORTED_FEATURES = {
  'github-actions': ['lint', 'test', 'build'],
  'gitlab-ci': ['lint', 'test', 'build']
};

function usage(exitCode = 0) {
  const msg = `
Usage:
  node .ai/scripts/cictl.js <command> [options]

Commands:
  init
    --platform <github-actions|gitlab-ci>   Default: github-actions
    --repo-root <path>                      Default: cwd
    --dry-run                               Do not write files
    Initialize the CI config skeleton (idempotent).

  list
    --format <text|json>                    Default: text
    List supported platforms and features.

  enable-feature <feature>
    --repo-root <path>                      Default: cwd
    Enable a CI feature flag (updates ci/config.json).

  disable-feature <feature>
    --repo-root <path>                      Default: cwd
    Disable a CI feature flag (updates ci/config.json).

  generate
    --platform <github-actions|gitlab-ci>   Override config platform
    --repo-root <path>                      Default: cwd
    --dry-run                               Do not write files
    Generate provider files from templates (DERIVED).

  verify
    --repo-root <path>                      Default: cwd
    Verify CI config and generated outputs exist.

  status
    --format <text|json>                    Default: text
    --repo-root <path>                      Default: cwd
    Show current CI status.

Examples:
  node .ai/scripts/cictl.js init
  node .ai/scripts/cictl.js enable-feature lint
  node .ai/scripts/cictl.js enable-feature test
  node .ai/scripts/cictl.js generate
  node .ai/scripts/cictl.js status
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
      if (args.length > 0 && !args[0].startsWith('--')) opts[key] = args.shift();
      else opts[key] = true;
    } else {
      positionals.push(token);
    }
  }

  return { command, opts, positionals };
}

function isoNow() {
  return new Date().toISOString();
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function writeText(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf8');
}

function normalizePlatform(v) {
  if (typeof v !== 'string') return null;
  const p = v.trim().toLowerCase();
  return p.length > 0 ? p : null;
}

function normalizeFeature(v) {
  if (typeof v !== 'string') return null;
  const f = v.trim().toLowerCase();
  return f.length > 0 ? f : null;
}

function getCiDir(repoRoot) {
  return path.join(repoRoot, 'ci');
}

function getConfigPath(repoRoot) {
  return path.join(getCiDir(repoRoot), 'config.json');
}

function loadConfig(repoRoot) {
  const raw = readJson(getConfigPath(repoRoot));
  return raw && typeof raw === 'object' ? raw : null;
}

function normalizeConfig(raw, platformOverride = null) {
  const platform = platformOverride ?? normalizePlatform(raw?.platform) ?? 'github-actions';
  const features = Array.isArray(raw?.features)
    ? raw.features.filter(f => typeof f === 'string' && f.trim().length > 0).map(f => f.trim())
    : [];

  return {
    version: 1,
    updatedAt: typeof raw?.updatedAt === 'string' ? raw.updatedAt : isoNow(),
    platform,
    features: [...new Set(features)],
    generated: raw?.generated === true
  };
}

function requireConfig(repoRoot) {
  const cfg = loadConfig(repoRoot);
  if (!cfg) die('[error] ci/config.json not found. Run: node .ai/scripts/cictl.js init');
  return normalizeConfig(cfg);
}

function saveConfig(repoRoot, cfg) {
  cfg.updatedAt = isoNow();
  writeJson(getConfigPath(repoRoot), cfg);
}

function effectiveFeatures(list) {
  const features = Array.isArray(list) ? list : [];
  return features.length > 0 ? [...new Set(features)] : DEFAULT_FEATURES;
}

function warnUnknownFeatures(features) {
  const unknown = features.filter(f => !KNOWN_FEATURES.includes(f));
  if (unknown.length > 0) console.warn(`[warn] unknown feature(s): ${unknown.join(', ')}`);
}

function generatedFilesForPlatform(platform) {
  if (platform === 'gitlab-ci') return ['.gitlab-ci.yml'];
  if (platform === 'github-actions') return ['.github/workflows/ci.yml'];
  return [];
}

function cmdInit(repoRoot, opts) {
  const dryRun = !!opts['dry-run'];
  const platformOpt = opts.platform ? normalizePlatform(opts.platform) : null;
  if (platformOpt && !SUPPORTED_PLATFORMS.includes(platformOpt)) die(`[error] unknown platform: ${platformOpt}`);

  const ciDir = getCiDir(repoRoot);
  const configPath = getConfigPath(repoRoot);

  if (dryRun) {
    console.log('[plan] init ci/');
    console.log(`  - mkdir: ${path.relative(repoRoot, ciDir)}`);
    console.log(`  - mkdir: ${path.relative(repoRoot, path.join(ciDir, 'workdocs'))}`);
    console.log(`  - write: ${path.relative(repoRoot, configPath)} (if missing)`);
    return;
  }

  ensureDir(ciDir);
  ensureDir(path.join(ciDir, 'workdocs'));

  const existing = loadConfig(repoRoot);
  const isNew = !existing;
  const cfg = normalizeConfig(existing || {}, platformOpt);
  if (isNew) cfg.features = [...DEFAULT_FEATURES];

  saveConfig(repoRoot, cfg);

  console.log('[ok] CI config initialized.');
  console.log(`- config: ${path.relative(repoRoot, configPath)}`);
  console.log(`- platform: ${cfg.platform}`);
  console.log(`- features: ${cfg.features.length > 0 ? cfg.features.join(', ') : '(none)'}`);
}

function cmdList(format) {
  if (format === 'json') {
    console.log(JSON.stringify({ platforms: SUPPORTED_PLATFORMS, features: KNOWN_FEATURES }, null, 2));
    return;
  }

  console.log('Supported CI platforms:\n');
  for (const p of SUPPORTED_PLATFORMS) console.log(`  - ${p}`);
  console.log('\nKnown feature flags:\n');
  for (const f of KNOWN_FEATURES) console.log(`  - ${f}`);
}

function cmdEnableFeature(repoRoot, feature) {
  const f = normalizeFeature(feature);
  if (!f) die('[error] feature is required');

  const cfg = requireConfig(repoRoot);
  if (!KNOWN_FEATURES.includes(f)) console.warn(`[warn] unknown feature: ${f}`);

  if (!cfg.features.includes(f)) cfg.features.push(f);
  cfg.features = [...new Set(cfg.features)].sort();
  cfg.generated = false;
  saveConfig(repoRoot, cfg);

  console.log(`[ok] enabled feature: ${f}`);
}

function cmdDisableFeature(repoRoot, feature) {
  const f = normalizeFeature(feature);
  if (!f) die('[error] feature is required');

  const cfg = requireConfig(repoRoot);
  cfg.features = cfg.features.filter(x => x !== f);
  cfg.generated = false;
  saveConfig(repoRoot, cfg);

  console.log(`[ok] disabled feature: ${f}`);
}

function generateGitlabCi(repoRoot, cfg, features, dryRun) {
  const templatePath = path.join(repoRoot, '.gitlab-ci', 'gitlab-ci.yaml.template');
  if (!fs.existsSync(templatePath)) {
    die(`[error] gitlab template not found: ${path.relative(repoRoot, templatePath)}`);
  }

  const doc = loadYamlFile(templatePath);
  const supported = PLATFORM_SUPPORTED_FEATURES['gitlab-ci'];
  const enabled = new Set(features.filter(f => supported.includes(f)));

  const unsupported = features.filter(f => !supported.includes(f));
  if (unsupported.length > 0) console.warn(`[warn] gitlab-ci ignores unsupported features: ${unsupported.join(', ')}`);

  if (enabled.size === 0) {
    die(`[error] no supported features enabled for gitlab-ci (supported: ${supported.join(', ')})`);
  }

  if (Array.isArray(doc.stages)) {
    doc.stages = doc.stages.filter(s => enabled.has(String(s)));
  } else {
    doc.stages = supported.filter(s => enabled.has(s));
  }

  for (const f of supported) {
    if (!enabled.has(f) && Object.prototype.hasOwnProperty.call(doc, f)) delete doc[f];
  }

  const outPath = path.join(repoRoot, '.gitlab-ci.yml');
  const yaml = dumpYaml(doc);
  if (dryRun) {
    console.log(`[plan] write: ${path.relative(repoRoot, outPath)}`);
    return { outPath, written: false };
  }
  writeText(outPath, yaml);
  return { outPath, written: true };
}

function generateGithubActions(repoRoot, cfg, features, dryRun) {
  const supported = PLATFORM_SUPPORTED_FEATURES['github-actions'];
  const enabled = new Set(features.filter(f => supported.includes(f)));

  const unsupported = features.filter(f => !supported.includes(f));
  if (unsupported.length > 0) console.warn(`[warn] github-actions ignores unsupported features: ${unsupported.join(', ')}`);

  if (enabled.size === 0) {
    die(`[error] no supported features enabled for github-actions (supported: ${supported.join(', ')})`);
  }

  const steps = [
    { uses: 'actions/checkout@v4' },
    { uses: 'actions/setup-node@v4', with: { 'node-version': '20', cache: 'npm' } },
    { name: 'Install', run: 'npm ci' }
  ];

  if (enabled.has('lint')) steps.push({ name: 'Lint', run: 'npm run lint' });
  if (enabled.has('test')) steps.push({ name: 'Test', run: 'npm test' });
  if (enabled.has('build')) steps.push({ name: 'Build', run: 'npm run build' });

  const workflow = {
    name: 'CI',
    on: {
      push: { branches: ['main'] },
      pull_request: {}
    },
    jobs: {
      ci: {
        'runs-on': 'ubuntu-latest',
        steps
      }
    }
  };

  const outPath = path.join(repoRoot, '.github', 'workflows', 'ci.yml');
  const yaml = dumpYaml(workflow);
  if (dryRun) {
    console.log(`[plan] write: ${path.relative(repoRoot, outPath)}`);
    return { outPath, written: false };
  }
  writeText(outPath, yaml);
  return { outPath, written: true };
}

function cmdGenerate(repoRoot, opts) {
  const dryRun = !!opts['dry-run'];
  const cfg = requireConfig(repoRoot);

  const platformOpt = opts.platform ? normalizePlatform(opts.platform) : null;
  const platform = platformOpt ?? cfg.platform;
  if (!SUPPORTED_PLATFORMS.includes(platform)) die(`[error] unsupported platform: ${platform}`);

  const features = effectiveFeatures(cfg.features);
  warnUnknownFeatures(features);

  let res = null;
  if (platform === 'gitlab-ci') res = generateGitlabCi(repoRoot, cfg, features, dryRun);
  if (platform === 'github-actions') res = generateGithubActions(repoRoot, cfg, features, dryRun);
  if (!res) die(`[error] unsupported platform: ${platform}`);

  if (!dryRun) {
    cfg.platform = platform;
    cfg.generated = true;
    cfg.features = [...new Set(features)].sort();
    saveConfig(repoRoot, cfg);
  }

  console.log(dryRun ? '[plan] generate complete.' : '[ok] generate complete.');
  console.log(`- platform: ${platform}`);
  console.log(`- features: ${features.join(', ')}`);
  console.log(`- output: ${path.relative(repoRoot, res.outPath)}`);
}

function cmdVerify(repoRoot) {
  const cfg = requireConfig(repoRoot);
  const warnings = [];
  const errors = [];

  if (!SUPPORTED_PLATFORMS.includes(cfg.platform)) errors.push(`Unsupported platform: ${cfg.platform}`);
  if (cfg.version !== 1) warnings.push(`Unexpected version (expected 1): ${cfg.version}`);

  const unknown = (cfg.features || []).filter(f => !KNOWN_FEATURES.includes(f));
  if (unknown.length > 0) warnings.push(`Unknown features in config: ${unknown.join(', ')}`);

  const expected = generatedFilesForPlatform(cfg.platform).map(p => path.join(repoRoot, ...p.split('/')));
  for (const p of expected) {
    if (!fs.existsSync(p)) {
      const rel = path.relative(repoRoot, p);
      if (cfg.generated) errors.push(`Missing generated file (config.generated=true): ${rel}`);
      else warnings.push(`Missing generated file: ${rel} (run: cictl generate)`);
    }
  }

  if (warnings.length > 0) {
    console.log(`Warnings (${warnings.length}):`);
    for (const w of warnings) console.log(`- ${w}`);
  }
  if (errors.length > 0) {
    console.log(`\nErrors (${errors.length}):`);
    for (const e of errors) console.log(`- ${e}`);
    process.exit(1);
  }

  console.log('\n[ok] CI verification passed.');
}

function cmdStatus(repoRoot, format) {
  const cfg = loadConfig(repoRoot);
  const normalized = cfg ? normalizeConfig(cfg) : null;

  const status = {
    initialized: fs.existsSync(getCiDir(repoRoot)),
    config: normalized,
    generatedFiles: normalized
      ? generatedFilesForPlatform(normalized.platform).map(p => ({
          path: p,
          exists: fs.existsSync(path.join(repoRoot, ...p.split('/')))
        }))
      : []
  };

  if (format === 'json') {
    console.log(JSON.stringify(status, null, 2));
    return;
  }

  console.log('CI Status:');
  console.log(`  Initialized: ${status.initialized ? 'yes' : 'no'}`);
  console.log(`  Config: ${normalized ? 'yes' : 'no'}`);
  if (normalized) {
    console.log(`  Platform: ${normalized.platform}`);
    console.log(`  Features: ${normalized.features.length > 0 ? normalized.features.join(', ') : '(none)'}`);
    console.log(`  Generated flag: ${normalized.generated ? 'true' : 'false'}`);
  }
  for (const f of status.generatedFiles) {
    console.log(`  Output: ${f.path} (${f.exists ? 'present' : 'missing'})`);
  }
}

function main() {
  const { command, opts, positionals } = parseArgs(process.argv);
  const repoRoot = path.resolve(opts['repo-root'] || process.cwd());
  const format = String(opts.format || 'text').toLowerCase();

  switch (command) {
    case 'init':
      cmdInit(repoRoot, opts);
      break;
    case 'list':
      cmdList(format);
      break;
    case 'enable-feature':
      cmdEnableFeature(repoRoot, positionals[0] || opts.feature);
      break;
    case 'disable-feature':
      cmdDisableFeature(repoRoot, positionals[0] || opts.feature);
      break;
    case 'generate':
      cmdGenerate(repoRoot, opts);
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

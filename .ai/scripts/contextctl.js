#!/usr/bin/env node
/**
 * contextctl.js
 *
 * Project context registry management for a module-first repository.
 *
 * SSOT:
 * - docs/context/project.registry.json                 (project-level registry)
 * - modules/<module_id>/interact/registry.json         (module-level registries)
 *
 * Derived:
 * - docs/context/registry.json                         (project-level aggregated view)
 *
 * Notes:
 * - The derived registry is aggregated bottom-up.
 * - Checksums are SHA-256 (hex) of the referenced file content.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

function usage(exitCode = 0) {
  const msg = `
Usage:
  node .ai/scripts/contextctl.js <command> [options]

Commands:
  init
    Ensure docs/context SSOT + schemas exist.

  add-artifact
    --artifact-id <id>          Required (module-scoped id, e.g. api-openapi)
    --type <type>               Required (openapi|jsonschema|db-schema|bpmn|markdown|...)
    --path <path>               Required (repo-relative)
    --mode <contract|generated> Default: contract
    --format <format>           Optional (json|yaml|sql|md|...)
    --tags <a,b,c>              Optional
    --module-id <id>            Target module registry (default: project)
    Add an artifact entry to a registry (SSOT), computing checksum.

  remove-artifact
    --artifact-id <id>          Required
    --module-id <id>            Target module registry (default: project)
    Remove an artifact entry from a registry.

  touch
    --module-id <id>            If set, only touch that registry (default: all)
    Recompute checksums and update updatedAt in SSOT registries.

  build
    --no-refresh                Do not modify SSOT registries (skip touch)
    Build docs/context/registry.json (DERIVED).

  verify
    --strict                    Fail on warnings
    Validate registries and (optionally) checksums without modifying files.

Examples:
  node .ai/scripts/contextctl.js init
  node .ai/scripts/contextctl.js add-artifact --artifact-id api --type openapi --path modules/billing.api/interact/openapi.json --module-id billing.api
  node .ai/scripts/contextctl.js build
`;
  console.log(msg.trim());
  process.exit(exitCode);
}

function die(msg, code = 1) {
  console.error(msg);
  process.exit(code);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  if (args.length === 0 || args[0] === '-h' || args[0] === '--help') usage(0);
  const command = args.shift();
  const opts = {};
  while (args.length > 0) {
    const t = args.shift();
    if (t === '-h' || t === '--help') usage(0);
    if (t.startsWith('--')) {
      const k = t.slice(2);
      if (args.length > 0 && !args[0].startsWith('--')) opts[k] = args.shift();
      else opts[k] = true;
    } else {
      // ignore positionals
    }
  }
  return { command, opts };
}

function isoNow() {
  return new Date().toISOString();
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function readText(p) {
  return fs.readFileSync(p, 'utf8');
}

function writeText(p, content) {
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, content, 'utf8');
}

function readJson(p) {
  return JSON.parse(readText(p));
}

function writeJson(p, data) {
  writeText(p, JSON.stringify(data, null, 2) + '\n');
}

function sha256File(absPath) {
  const buf = fs.readFileSync(absPath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function isValidId(id) {
  return /^[a-z0-9][a-z0-9._-]{0,62}[a-z0-9]$/.test(id);
}

function registryPathForModule(repoRoot, moduleId) {
  if (!moduleId || moduleId === 'project') return path.join(repoRoot, 'docs', 'context', 'project.registry.json');
  return path.join(repoRoot, 'modules', moduleId, 'interact', 'registry.json');
}

function discoverModuleRegistryPaths(repoRoot) {
  const modulesDir = path.join(repoRoot, 'modules');
  if (!fs.existsSync(modulesDir)) return [];
  const entries = fs.readdirSync(modulesDir, { withFileTypes: true });
  const out = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (e.name === 'integration') continue;
    const p = path.join(modulesDir, e.name, 'interact', 'registry.json');
    if (fs.existsSync(p)) out.push(p);
  }
  return out.sort();
}

function loadRegistry(absPath) {
  try {
    const r = readJson(absPath);
    return { ok: true, registry: r, warnings: [], errors: [] };
  } catch (e) {
    return { ok: false, registry: null, warnings: [], errors: [`Failed to read JSON: ${absPath} (${e.message})`] };
  }
}

function validateRegistryStructure(reg, absPath) {
  const warnings = [];
  const errors = [];

  if (!reg || typeof reg !== 'object') {
    errors.push(`Registry is not an object: ${absPath}`);
    return { warnings, errors };
  }
  if (reg.version !== 1) warnings.push(`Unexpected version in ${absPath} (expected 1)`);
  if (!reg.moduleId || typeof reg.moduleId !== 'string') errors.push(`Missing moduleId in ${absPath}`);
  if (!Array.isArray(reg.artifacts)) errors.push(`Missing artifacts list in ${absPath}`);

  if (Array.isArray(reg.artifacts)) {
    const seen = new Set();
    for (const a of reg.artifacts) {
      if (!a || typeof a !== 'object') {
        errors.push(`Artifact entry must be an object: ${absPath}`);
        continue;
      }
      const aid = a.artifactId ?? a.id;
      if (!aid || typeof aid !== 'string') errors.push(`Artifact missing artifactId: ${absPath}`);
      else {
        if (seen.has(aid)) errors.push(`Duplicate artifactId "${aid}" in ${absPath}`);
        seen.add(aid);
        if (!isValidId(aid)) warnings.push(`artifactId "${aid}" has unusual characters (recommended: /^[a-z0-9][a-z0-9._-]{0,62}[a-z0-9]$/)`);
      }
      if (!a.type || typeof a.type !== 'string') errors.push(`Artifact "${aid}" missing type in ${absPath}`);
      if (!a.path || typeof a.path !== 'string') errors.push(`Artifact "${aid}" missing path in ${absPath}`);
      if (a.mode && !['contract', 'generated'].includes(a.mode)) warnings.push(`Artifact "${aid}" has unknown mode "${a.mode}" in ${absPath}`);
    }
  }

  return { warnings, errors };
}

function touchRegistry(repoRoot, absPath, opts = { strict: false, apply: true }) {
  const { ok, registry, errors: loadErrs } = loadRegistry(absPath);
  const warnings = [];
  const errors = [...loadErrs];

  if (!ok) return { warnings, errors, changed: false };

  const v = validateRegistryStructure(registry, absPath);
  warnings.push(...v.warnings);
  errors.push(...v.errors);

  let changed = false;

  if (Array.isArray(registry.artifacts)) {
    for (const a of registry.artifacts) {
      const aid = a.artifactId ?? a.id;
      const rel = a.path;
      if (!rel) continue;
      const abs = path.join(repoRoot, rel);
      if (!fs.existsSync(abs)) {
        warnings.push(`[${registry.moduleId}] artifact missing file: ${rel} (artifactId: ${aid})`);
        continue;
      }
      const actual = sha256File(abs);
      if (a.checksumSha256 !== actual) {
        warnings.push(`[${registry.moduleId}] checksum mismatch for ${aid} (will ${opts.apply ? 'update' : 'not update'})`);
        if (opts.apply) {
          a.checksumSha256 = actual;
          a.lastUpdated = isoNow();
          changed = true;
        }
      }
    }
  }

  if (opts.apply) {
    registry.updatedAt = isoNow();
    if (changed) {
      writeJson(absPath, registry);
    } else {
      // Still refresh updatedAt for consistency
      writeJson(absPath, registry);
    }
  }

  if (opts.strict && warnings.length > 0) {
    errors.push(`Strict mode: warnings present for ${absPath}`);
  }

  return { warnings, errors, changed };
}

function buildDerivedRegistry(repoRoot, opts = { refresh: true }) {
  const warnings = [];
  const errors = [];

  const registries = [];

  const projectPath = path.join(repoRoot, 'docs', 'context', 'project.registry.json');
  if (!fs.existsSync(projectPath)) {
    errors.push(`Missing project registry: ${projectPath}`);
  } else {
    registries.push(projectPath);
  }

  registries.push(...discoverModuleRegistryPaths(repoRoot));

  const touched = [];
  if (opts.refresh) {
    for (const p of registries) {
      const t = touchRegistry(repoRoot, p, { strict: false, apply: true });
      warnings.push(...t.warnings);
      errors.push(...t.errors);
      touched.push({ path: p, changed: t.changed });
    }
  } else {
    // Just validate structure
    for (const p of registries) {
      const l = loadRegistry(p);
      if (!l.ok) {
        errors.push(...l.errors);
        continue;
      }
      const v = validateRegistryStructure(l.registry, p);
      warnings.push(...v.warnings);
      errors.push(...v.errors);
    }
  }

  const artifacts = [];
  for (const p of registries) {
    const l = loadRegistry(p);
    if (!l.ok) continue;
    const reg = l.registry;
    const moduleId = reg.moduleId;
    for (const a of reg.artifacts || []) {
      const artifactId = a.artifactId ?? a.id;
      const id = `${moduleId}:${artifactId}`;
      artifacts.push({
        id,
        moduleId,
        artifactId,
        type: a.type,
        path: a.path,
        mode: a.mode ?? 'contract',
        format: a.format ?? null,
        tags: a.tags ?? [],
        checksumSha256: a.checksumSha256 ?? null,
        lastUpdated: a.lastUpdated ?? null,
        source: a.source ?? null
      });
    }
  }

  artifacts.sort((a, b) => (a.id || '').localeCompare(b.id || ''));

  const derived = {
    version: 1,
    updatedAt: isoNow(),
    artifacts
  };

  return { derived, warnings, errors, touched };
}

function cmdInit(repoRoot) {
  const dir = path.join(repoRoot, 'docs', 'context');
  ensureDir(dir);

  const indexPath = path.join(dir, 'INDEX.md');
  if (!fs.existsSync(indexPath)) {
    writeText(indexPath, '# Project context index\n\nSee docs/context/project.registry.json (SSOT) and modules/*/interact/registry.json (SSOT).\n\nDo not edit docs/context/registry.json by hand; it is derived.\n');
    console.log('[ok] created docs/context/INDEX.md');
  }

  const projectRegPath = path.join(dir, 'project.registry.json');
  if (!fs.existsSync(projectRegPath)) {
    writeJson(projectRegPath, { version: 1, moduleId: 'project', updatedAt: isoNow(), artifacts: [] });
    console.log('[ok] created docs/context/project.registry.json');
  }

  const derivedPath = path.join(dir, 'registry.json');
  if (!fs.existsSync(derivedPath)) {
    writeJson(derivedPath, { version: 1, updatedAt: '1970-01-01T00:00:00Z', artifacts: [] });
    console.log('[ok] created docs/context/registry.json');
  }
}

function cmdAddArtifact(repoRoot, opts) {
  const artifactId = opts['artifact-id'];
  const type = opts.type;
  const relPath = opts.path;
  const mode = opts.mode || 'contract';
  const format = opts.format || null;
  const tags = (opts.tags ? String(opts.tags).split(',').map(s => s.trim()).filter(Boolean) : []);
  const moduleId = opts['module-id'] || 'project';

  if (!artifactId || !isValidId(artifactId)) die('[error] --artifact-id is required (recommended pattern: /^[a-z0-9][a-z0-9._-]{0,62}[a-z0-9]$/)');
  if (!type) die('[error] --type is required');
  if (!relPath) die('[error] --path is required');
  if (!['contract', 'generated'].includes(mode)) die('[error] --mode must be contract|generated');

  const registryPath = registryPathForModule(repoRoot, moduleId);
  if (!fs.existsSync(registryPath)) die(`[error] registry not found: ${registryPath} (run module init or contextctl init)`);

  const reg = readJson(registryPath);
  reg.artifacts = Array.isArray(reg.artifacts) ? reg.artifacts : [];
  if (reg.artifacts.find(a => (a.artifactId ?? a.id) === artifactId)) die(`[error] artifactId already exists: ${artifactId}`);

  const absArtifact = path.join(repoRoot, relPath);
  let checksum = null;
  if (fs.existsSync(absArtifact)) checksum = sha256File(absArtifact);

  reg.artifacts.push({
    artifactId,
    type,
    path: relPath,
    mode,
    format,
    tags,
    checksumSha256: checksum,
    lastUpdated: isoNow()
  });

  reg.updatedAt = isoNow();
  writeJson(registryPath, reg);

  console.log(`[ok] added artifact "${artifactId}" to ${registryPath}`);

  // Refresh derived
  cmdBuild(repoRoot, { 'no-refresh': true });
}

function cmdRemoveArtifact(repoRoot, opts) {
  const artifactId = opts['artifact-id'];
  const moduleId = opts['module-id'] || 'project';
  if (!artifactId) die('[error] --artifact-id is required');

  const registryPath = registryPathForModule(repoRoot, moduleId);
  if (!fs.existsSync(registryPath)) die(`[error] registry not found: ${registryPath}`);

  const reg = readJson(registryPath);
  reg.artifacts = Array.isArray(reg.artifacts) ? reg.artifacts : [];
  const before = reg.artifacts.length;
  reg.artifacts = reg.artifacts.filter(a => (a.artifactId ?? a.id) !== artifactId);

  if (reg.artifacts.length === before) die(`[error] artifactId not found: ${artifactId}`);

  reg.updatedAt = isoNow();
  writeJson(registryPath, reg);

  console.log(`[ok] removed artifact "${artifactId}" from ${registryPath}`);

  cmdBuild(repoRoot, { 'no-refresh': true });
}

function cmdTouch(repoRoot, opts) {
  const moduleId = opts['module-id'] || null;

  const targets = [];
  if (moduleId) {
    targets.push(registryPathForModule(repoRoot, moduleId));
  } else {
    targets.push(path.join(repoRoot, 'docs', 'context', 'project.registry.json'));
    targets.push(...discoverModuleRegistryPaths(repoRoot));
  }

  const warnings = [];
  const errors = [];
  let changedAny = false;

  for (const p of targets) {
    if (!fs.existsSync(p)) {
      warnings.push(`Missing registry: ${p}`);
      continue;
    }
    const t = touchRegistry(repoRoot, p, { strict: false, apply: true });
    warnings.push(...t.warnings);
    errors.push(...t.errors);
    if (t.changed) changedAny = true;
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

  console.log(`[ok] touch complete (changed: ${changedAny})`);
}

function cmdBuild(repoRoot, opts) {
  const refresh = !opts['no-refresh'];

  const outPath = path.join(repoRoot, 'docs', 'context', 'registry.json');
  const prev = fs.existsSync(outPath) ? readJson(outPath) : null;

  const { derived, warnings, errors, touched } = buildDerivedRegistry(repoRoot, { refresh });

  writeJson(outPath, derived);

  const changed = prev ? JSON.stringify(prev) !== JSON.stringify(derived) : true;

  const reportPath = path.join(repoRoot, '.system', 'modular', 'reports', 'context_registry.diff.json');
  ensureDir(path.dirname(reportPath));
  writeJson(reportPath, {
    generatedAt: isoNow(),
    out: 'docs/context/registry.json',
    changed,
    refresh,
    touched: touched.map(t => ({ path: t.path.replace(repoRoot + path.sep, ''), changed: t.changed })),
    warnings,
    errors
  });

  console.log(`[ok] wrote docs/context/registry.json (changed: ${changed})`);
  console.log(`[ok] wrote ${path.relative(repoRoot, reportPath)}`);

  if (warnings.length > 0) {
    console.log(`\nWarnings (${warnings.length}):`);
    for (const w of warnings) console.log(`- ${w}`);
  }
  if (errors.length > 0) {
    console.log(`\nErrors (${errors.length}):`);
    for (const e of errors) console.log(`- ${e}`);
    process.exitCode = 1;
  }
}

function cmdVerify(repoRoot, opts) {
  const strict = !!opts.strict;

  const paths = [
    path.join(repoRoot, 'docs', 'context', 'project.registry.json'),
    ...discoverModuleRegistryPaths(repoRoot)
  ];

  const warnings = [];
  const errors = [];

  for (const p of paths) {
    if (!fs.existsSync(p)) {
      warnings.push(`Missing registry: ${p}`);
      continue;
    }
    const l = loadRegistry(p);
    if (!l.ok) {
      errors.push(...l.errors);
      continue;
    }
    const v = validateRegistryStructure(l.registry, p);
    warnings.push(...v.warnings);
    errors.push(...v.errors);

    // Verify checksum if present
    for (const a of l.registry.artifacts || []) {
      const rel = a.path;
      if (!rel) continue;
      const abs = path.join(repoRoot, rel);
      if (!fs.existsSync(abs)) {
        warnings.push(`[${l.registry.moduleId}] missing file: ${rel}`);
        continue;
      }
      if (a.checksumSha256) {
        const actual = sha256File(abs);
        if (actual !== a.checksumSha256) warnings.push(`[${l.registry.moduleId}] checksum mismatch: ${(a.artifactId ?? a.id)}`);
      }
    }
  }

  if (warnings.length > 0) {
    console.log(`Warnings (${warnings.length}):`);
    for (const w of warnings) console.log(`- ${w}`);
  }
  if (errors.length > 0) {
    console.log(`\nErrors (${errors.length}):`);
    for (const e of errors) console.log(`- ${e}`);
  }

  if (errors.length > 0) process.exit(1);
  if (strict && warnings.length > 0) process.exit(1);

  console.log('\n[ok] context verification passed.');
}

function main() {
  const { command, opts } = parseArgs(process.argv);
  const repoRoot = path.resolve(opts['repo-root'] || process.cwd());

  switch (command) {
    case 'init':
      cmdInit(repoRoot);
      break;
    case 'add-artifact':
      cmdAddArtifact(repoRoot, opts);
      break;
    case 'remove-artifact':
      cmdRemoveArtifact(repoRoot, opts);
      break;
    case 'touch':
      cmdTouch(repoRoot, opts);
      break;
    case 'build':
      cmdBuild(repoRoot, opts);
      break;
    case 'verify':
      cmdVerify(repoRoot, opts);
      break;
    default:
      die(`[error] Unknown command: ${command}`);
  }
}

main();

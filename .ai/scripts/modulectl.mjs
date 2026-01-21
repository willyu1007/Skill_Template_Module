#!/usr/bin/env node
/**
 * modulectl.mjs
 *
 * Module instance management + derived registry build.
 *
 * Module instance SSOT:
 * - modules/<module_id>/MANIFEST.yaml
 * - modules/<module_id>/interact/registry.json
 *
 * Derived artifacts:
 * - .system/modular/instance_registry.yaml
 *
 * Philosophy:
 * - Manifests are SSOT, derived registries are overwritable.
 * - Prefer script-driven changes and deterministic output ordering.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

import { loadYamlFile, saveYamlFile, dumpYaml, parseYaml } from './lib/yaml.mjs';
import { normalizeImplementsEntry } from './lib/modular.mjs';

// =============================================================================
// CLI
// =============================================================================

function usage(exitCode = 0) {
  const msg = `
Usage:
  node .ai/scripts/modulectl.mjs <command> [options]

Options:
  --repo-root <path>          Repo root (default: cwd)

Commands:
  init
    --module-id <id>            Module id (e.g., billing.api)
    --module-type <type>        e.g., service|library|job (default: service)
    --description <text>        Optional
    --apply                     Actually write files (default: dry-run)
    --force                     Overwrite existing files (dangerous)
    Initialize a new module instance skeleton.

  list
    --format <text|json>        Output format (default: text)
    List detected modules.

  registry-build
    --modules-dir <path>        Default: modules
    --out <path>                Default: .system/modular/instance_registry.yaml
    --format <text|json>        Output format (default: text)
    Build instance registry from module manifests (DERIVED).

  verify
    --modules-dir <path>        Default: modules
    --strict                    Fail on warnings
    Verify module manifests and module-local SSOT.

Examples:
  node .ai/scripts/modulectl.mjs init --module-id billing.api --apply
  node .ai/scripts/modulectl.mjs registry-build
  node .ai/scripts/modulectl.mjs verify --strict
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

function isoNow() {
  return new Date().toISOString();
}

function repoRootFromOpts(opts) {
  return path.resolve(opts['repo-root'] || process.cwd());
}

// =============================================================================
// Validation helpers
// =============================================================================

function isString(x) {
  return typeof x === 'string';
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function safeRel(repoRoot, p) {
  const abs = path.resolve(p);
  const rr = path.resolve(repoRoot);
  if (!abs.startsWith(rr)) return p;
  return path.relative(rr, abs);
}

function readText(p) {
  return fs.readFileSync(p, 'utf8');
}

function writeText(p, content) {
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, content, 'utf8');
}

function readJson(p) {
  try {
    return JSON.parse(readText(p));
  } catch {
    return null;
  }
}

function writeJson(p, data) {
  writeText(p, JSON.stringify(data, null, 2) + '\n');
}

function sha256File(absPath) {
  const buf = fs.readFileSync(absPath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function isValidModuleId(id) {
  // Align with `.system/modular/schemas/module_context_registry.schema.json`
  return /^[a-z0-9][a-z0-9._-]{1,62}[a-z0-9]$/.test(id);
}

function validateManifest(manifest, manifestPath) {
  const warnings = [];
  const errors = [];

  if (!manifest || typeof manifest !== 'object') {
    errors.push(`Manifest is not a mapping: ${manifestPath}`);
    return { warnings, errors };
  }

  const moduleId = manifest.module_id ?? manifest.moduleId;
  if (!isString(moduleId) || !isValidModuleId(moduleId)) {
    errors.push(`Missing/invalid module_id in ${manifestPath} (expected pattern: /^[a-z0-9][a-z0-9._-]{1,62}[a-z0-9]$/)`);
  }

  const moduleType = manifest.module_type ?? manifest.moduleType;
  if (!isString(moduleType)) warnings.push(`Missing module_type in ${manifestPath}`);

  if (manifest.interfaces && !Array.isArray(manifest.interfaces)) {
    errors.push(`interfaces must be a list in ${manifestPath}`);
  }

  if (Array.isArray(manifest.interfaces)) {
    const seen = new Set();
    for (const it of manifest.interfaces) {
      if (!it || typeof it !== 'object') {
        errors.push(`interfaces item must be a mapping in ${manifestPath}`);
        continue;
      }
      const id = it.id;
      if (!isString(id) || id.trim().length === 0) {
        errors.push(`interfaces[].id missing in ${manifestPath}`);
      } else {
        if (seen.has(id)) errors.push(`Duplicate interface id "${id}" in ${manifestPath}`);
        seen.add(id);
      }
      if (it.implements && !Array.isArray(it.implements)) {
        errors.push(`interfaces[].implements must be a list in ${manifestPath} (interface ${id})`);
      }

      if (Array.isArray(it.implements)) {
        for (const imp of it.implements) {
          if (!imp || typeof imp !== 'object') {
            errors.push(`interfaces[].implements item must be a mapping in ${manifestPath} (interface ${id})`);
            continue;
          }
          const norm = normalizeImplementsEntry(imp);
          if (!isString(norm.flow_id) || !isString(norm.node_id)) {
            warnings.push(`implements entries should include flow_id/node_id in ${manifestPath} (interface ${id})`);
          }
          if (imp.variant != null && !isString(imp.variant)) {
            errors.push(`interfaces[].implements[].variant must be string in ${manifestPath} (interface ${id})`);
          }
        }
      }
      if (it.protocol && !isString(it.protocol)) errors.push(`interfaces[].protocol must be string in ${manifestPath} (interface ${id})`);
      if (it.protocol === 'http') {
        if (!isString(it.method) || !isString(it.path)) {
          warnings.push(`http interface should include method and path in ${manifestPath} (interface ${id})`);
        }
      }
    }
  }

  return { warnings, errors };
}

// =============================================================================
// Module discovery
// =============================================================================

function getModulesDir(repoRoot, modulesDirOpt) {
  return path.join(repoRoot, modulesDirOpt || 'modules');
}

function discoverModules(repoRoot, modulesDirOpt) {
  const modulesDir = getModulesDir(repoRoot, modulesDirOpt);
  if (!fs.existsSync(modulesDir)) return [];
  const entries = fs.readdirSync(modulesDir, { withFileTypes: true });
  const mods = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (e.name === 'integration') continue;
    const dir = path.join(modulesDir, e.name);
    const manifestPath = path.join(dir, 'MANIFEST.yaml');
    if (fs.existsSync(manifestPath)) {
      mods.push({
        dir,
        id: e.name,
        manifestPath
      });
    }
  }
  return mods.sort((a, b) => a.id.localeCompare(b.id));
}

// =============================================================================
// Commands
// =============================================================================

function templateAgentsMd(moduleId, moduleType, description) {
  const desc = description ? `\n\n## Description\n\n${description}\n` : '';
  return `---\nname: ${moduleId}\npurpose: Module agent instructions for ${moduleId}\n---\n\n# ${moduleId}\n\n## Operating rules\n\n- Read this file first when working inside this module.\n- Keep changes local to this module unless explicitly cross-cutting.\n- For multi-step/multi-file work: create/resume \`workdocs/active/<task_slug>/\` and keep workdocs synced (see \`workdocs/AGENTS.md\`).\n- If you change this module's manifest, run:\n  - node .ai/scripts/modulectl.mjs registry-build\n  - node .ai/scripts/flowctl.mjs update-from-manifests\n  - node .ai/scripts/flowctl.mjs lint\n\n## Key files\n\n- MANIFEST.yaml (SSOT)\n- interact/registry.json (SSOT)\n- workdocs/AGENTS.md (how to use workdocs)\n- workdocs/ (long-running module notes)\n${desc}`;
}

function templateWorkdocsAgentsMd(moduleId) {
  return `---\nname: ${moduleId}-workdocs\npurpose: Workdocs operating rules for ${moduleId}\n---\n\n# ${moduleId} — workdocs\n\n## Scope\n\nLong-running task tracking, design decisions, and handoff documentation for this module.\n\n## Operating rules (MUST)\n\n- Do not start non-trivial implementation without a task folder under \`active/<task_slug>/\`.\n- Prefer **resume over new**: if a related task already exists in \`active/\`, reuse it.\n- Before doing any work in an existing task, read:\n  - \`03-implementation-notes.md\`\n  - \`05-pitfalls.md\`\n- Keep execution synced during work:\n  - \`01-plan.md\` (checklist + newly discovered TODOs)\n  - \`03-implementation-notes.md\` (what changed + decisions + deviations)\n  - \`04-verification.md\` (commands run + results + blockers)\n- Before context switch / handoff / wrap-up: run \`update-workdocs-for-handoff\` and ensure \`handoff.md\` is present and actionable.\n\n## Structure\n\n| Directory | Content |\n|---|---|\n| \`active/<task-slug>/\` | Current tasks |\n| \`archive/<task-slug>/\` | Completed tasks |\n\n## Workflow\n\n1. If the user asks for planning before coding, write \`active/<task_slug>/roadmap.md\` via \`plan-maker\` (planning-only).\n2. Create (or resume) the task bundle via \`create-workdocs-plan\`.\n3. Execute work while continuously syncing \`01-plan.md\`, \`03-implementation-notes.md\`, and \`04-verification.md\`.\n4. Before handoff: use \`update-workdocs-for-handoff\`.\n5. On completion: move the folder to \`archive/\`.\n`;
}

function templateAbilityMd(moduleId) {
  return `# ${moduleId} — Ability\n\nDescribe what this module is responsible for, and what it is NOT responsible for.\n\n## Responsibilities\n- TBD\n\n## Non-responsibilities\n- TBD\n\n## External dependencies\n- TBD\n`;
}

function defaultManifest(moduleId, moduleType, description) {
  const manifest = {
    module_id: moduleId,
    module_type: moduleType || 'service'
  };
  if (description) manifest.description = description;
  manifest.status = 'planned';
  manifest.interfaces = [];
  manifest.dependencies = [];
  return manifest;
}

function defaultModuleContextRegistry(moduleId) {
  return {
    version: 1,
    moduleId,
    updatedAt: isoNow(),
    artifacts: []
  };
}

function cmdInit(repoRoot, opts) {
  const moduleId = opts['module-id'];
  const moduleType = opts['module-type'] || 'service';
  const description = opts['description'] || '';
  const apply = !!opts['apply'];
  const force = !!opts['force'];

  if (!moduleId || !isValidModuleId(moduleId)) {
    die(`[error] --module-id is required and must match /^[a-z0-9][a-z0-9._-]{1,62}[a-z0-9]$/`);
  }

  const modulesDir = getModulesDir(repoRoot, 'modules');
  const moduleDir = path.join(modulesDir, moduleId);

  const filesToWrite = [];

  const manifestPath = path.join(moduleDir, 'MANIFEST.yaml');
  const agentsPath = path.join(moduleDir, 'AGENTS.md');
  const abilityPath = path.join(moduleDir, 'ABILITY.md');
  const registryPath = path.join(moduleDir, 'interact', 'registry.json');
  const workdocsReadmePath = path.join(moduleDir, 'workdocs', 'README.md');
  const workdocsAgentsPath = path.join(moduleDir, 'workdocs', 'AGENTS.md');

  const manifestObj = defaultManifest(moduleId, moduleType, description);
  const manifestYaml = dumpYaml(manifestObj);

  const workdocsReadme = `# ${moduleId} — workdocs\n\nThis folder contains long-running notes for the module.\n\nRead first:\n- workdocs/AGENTS.md (how to use workdocs)\n\nRecommended structure:\n\n- active/ — current tasks\n- archive/ — closed tasks\n\nFor integration-related work, prefer writing in modules/integration/workdocs/.\n`;

  filesToWrite.push({ path: manifestPath, content: manifestYaml });
  filesToWrite.push({ path: agentsPath, content: templateAgentsMd(moduleId, moduleType, description) });
  filesToWrite.push({ path: abilityPath, content: templateAbilityMd(moduleId) });
  filesToWrite.push({ path: registryPath, content: JSON.stringify(defaultModuleContextRegistry(moduleId), null, 2) + '\n' });
  filesToWrite.push({ path: workdocsReadmePath, content: workdocsReadme });
  filesToWrite.push({ path: workdocsAgentsPath, content: templateWorkdocsAgentsMd(moduleId) });

  const dirsToEnsure = [
    path.join(moduleDir, 'interact'),
    path.join(moduleDir, 'config'),
    path.join(moduleDir, 'src'),
    path.join(moduleDir, 'tests'),
    path.join(moduleDir, 'workdocs', 'active'),
    path.join(moduleDir, 'workdocs', 'archive')
  ];

  if (!apply) {
    console.log('[plan] Module init (dry-run)');
    console.log(`  module: ${moduleId}`);
    console.log(`  dir:    ${safeRel(repoRoot, moduleDir)}`);
    for (const d of dirsToEnsure) console.log(`  mkdir:  ${safeRel(repoRoot, d)}`);
    for (const f of filesToWrite) console.log(`  write:  ${safeRel(repoRoot, f.path)}`);
    console.log('\nRun again with --apply to write files.');
    return;
  }

  if (fs.existsSync(moduleDir) && !force) {
    die(`[error] Module dir already exists: ${safeRel(repoRoot, moduleDir)} (use --force to overwrite)`);
  }

  for (const d of dirsToEnsure) ensureDir(d);

  for (const f of filesToWrite) {
    if (!force && fs.existsSync(f.path)) {
      die(`[error] Refusing to overwrite existing file: ${safeRel(repoRoot, f.path)} (use --force)`);
    }
    writeText(f.path, f.content);
  }

  console.log(`[ok] Initialized module: ${moduleId}`);

  // Register bottom-up (derived)
  cmdRegistryBuild(repoRoot, { 'modules-dir': 'modules', out: '.system/modular/instance_registry.yaml', format: 'text' }, { quiet: true });

  // Rebuild project context registry (derived)
  const ctx = spawnSync('node', ['.ai/scripts/contextctl.mjs', 'build'], { cwd: repoRoot, stdio: 'inherit' });
  if (ctx.status !== 0) {
    console.error('[warn] contextctl build failed (module created, but project context registry not updated).');
  }

  // Update flow implementation index (derived)
  const flow = spawnSync('node', ['.ai/scripts/flowctl.mjs', 'update-from-manifests'], { cwd: repoRoot, stdio: 'inherit' });
  if (flow.status !== 0) {
    console.error('[warn] flowctl update-from-manifests failed (module created, but flow implementation index not updated).');
  }
}

function cmdList(repoRoot, opts) {
  const format = (opts.format || 'text').toLowerCase();
  const mods = discoverModules(repoRoot, opts['modules-dir']);

  if (format === 'json') {
    console.log(JSON.stringify({ modules: mods.map(m => ({ id: path.basename(m.dir), dir: safeRel(repoRoot, m.dir) })) }, null, 2));
    return;
  }

  if (mods.length === 0) {
    console.log('[info] No modules found.');
    return;
  }

  console.log('Modules:');
  for (const m of mods) {
    console.log(`- ${path.basename(m.dir)}  (${safeRel(repoRoot, m.dir)})`);
  }
}

function buildInstanceRegistry(repoRoot, modulesDirOpt) {
  const mods = discoverModules(repoRoot, modulesDirOpt);
  const modules = [];

  const warnings = [];
  const errors = [];

  for (const m of mods) {
    const manifestRaw = readText(m.manifestPath);
    let manifest;
    try {
      manifest = parseYaml(manifestRaw);
    } catch (e) {
      errors.push(`Failed to parse YAML: ${safeRel(repoRoot, m.manifestPath)} (${e.message})`);
      continue;
    }

    const v = validateManifest(manifest, safeRel(repoRoot, m.manifestPath));
    warnings.push(...v.warnings.map(w => `[${path.basename(m.dir)}] ${w}`));
    errors.push(...v.errors.map(er => `[${path.basename(m.dir)}] ${er}`));

    const moduleId = manifest.module_id ?? manifest.moduleId ?? path.basename(m.dir);
    const moduleType = manifest.module_type ?? manifest.moduleType ?? null;

    const rec = {
      module_id: moduleId,
      module_type: moduleType,
      path: safeRel(repoRoot, m.dir),
      status: manifest.status ?? null,
      description: manifest.description ?? null,
      interfaces: []
    };

    if (Array.isArray(manifest.interfaces)) {
      for (const it of manifest.interfaces) {
        const entry = {
          id: it.id,
          protocol: it.protocol ?? null,
          description: it.description ?? null,
          status: it.status ?? null
        };

        if (it.protocol === 'http') {
          entry.method = it.method ?? null;
          entry.path = it.path ?? null;
        }

        if (Array.isArray(it.implements)) {
          entry.implements = it.implements.map((imp) => {
            const norm = normalizeImplementsEntry(imp);
            return {
              flow_id: norm.flow_id,
              node_id: norm.node_id,
              variant: norm.variant ?? null,
              role: norm.role ?? null
            };
          });
        }

        rec.interfaces.push(entry);
      }
    }

    modules.push(rec);
  }

  // Deterministic ordering
  modules.sort((a, b) => (a.module_id || '').localeCompare(b.module_id || ''));

  return {
    registry: {
      version: 1,
      updatedAt: isoNow(),
      modules
    },
    warnings,
    errors
  };
}

function diffSummary(prev, next) {
  try {
    const prevStr = dumpYaml(prev);
    const nextStr = dumpYaml(next);
    if (prevStr === nextStr) return { changed: false };
  } catch {
    // ignore
  }
  return { changed: true };
}

function cmdRegistryBuild(repoRoot, opts, internal = { quiet: false }) {
  const modulesDirOpt = opts['modules-dir'] || 'modules';
  const outPath = path.join(repoRoot, opts.out || '.system/modular/instance_registry.yaml');
  const format = (opts.format || 'text').toLowerCase();

  const prev = fs.existsSync(outPath) ? loadYamlFile(outPath) : null;
  const { registry, warnings, errors } = buildInstanceRegistry(repoRoot, modulesDirOpt);

  ensureDir(path.dirname(outPath));
  saveYamlFile(outPath, registry);

  const diff = diffSummary(prev, registry);
  const reportPath = path.join(repoRoot, '.system', 'modular', 'reports', 'instance_registry.diff.json');
  ensureDir(path.dirname(reportPath));
  writeJson(reportPath, {
    generatedAt: isoNow(),
    out: safeRel(repoRoot, outPath),
    changed: diff.changed,
    warnings,
    errors
  });

  if (internal.quiet) return;

  if (format === 'json') {
    console.log(JSON.stringify({ out: safeRel(repoRoot, outPath), ...registry, warnings, errors }, null, 2));
    return;
  }

  console.log(`[ok] Wrote ${safeRel(repoRoot, outPath)}`);
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
  const mods = discoverModules(repoRoot, opts['modules-dir']);

  const warnings = [];
  const errors = [];

  if (mods.length === 0) warnings.push('No modules found (this may be OK for a new repository).');

  for (const m of mods) {
    const manifestRaw = readText(m.manifestPath);
    let manifest;
    try {
      manifest = parseYaml(manifestRaw);
    } catch (e) {
      errors.push(`Failed to parse YAML: ${safeRel(repoRoot, m.manifestPath)} (${e.message})`);
      continue;
    }

    const v = validateManifest(manifest, safeRel(repoRoot, m.manifestPath));
    warnings.push(...v.warnings.map(w => `[${path.basename(m.dir)}] ${w}`));
    errors.push(...v.errors.map(er => `[${path.basename(m.dir)}] ${er}`));

    const registryPath = path.join(m.dir, 'interact', 'registry.json');
    if (!fs.existsSync(registryPath)) {
      warnings.push(`[${path.basename(m.dir)}] Missing interact/registry.json (module context registry SSOT)`);
    } else {
      const reg = readJson(registryPath);
      if (!reg || typeof reg !== 'object') {
        errors.push(`[${path.basename(m.dir)}] interact/registry.json is not valid JSON`);
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

  console.log('\n[ok] Module verification passed.');
}

// =============================================================================
// Main
// =============================================================================

function main() {
  const { command, opts } = parseArgs(process.argv);
  const repoRoot = repoRootFromOpts(opts);

  switch (command) {
    case 'init':
      cmdInit(repoRoot, opts);
      break;
    case 'list':
      cmdList(repoRoot, opts);
      break;
    case 'registry-build':
      cmdRegistryBuild(repoRoot, opts);
      break;
    case 'verify':
      cmdVerify(repoRoot, opts);
      break;
    default:
      die(`[error] Unknown command: ${command}`);
  }
}

main();

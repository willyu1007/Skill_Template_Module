#!/usr/bin/env node
/**
 * packctl.js
 *
 * Packaging configuration management for the packaging add-on.
 *
 * This script manages:
 * - `docs/packaging/registry.json` (targets registry)
 * - `ops/packaging/**` scaffolding and Dockerfile locations
 *
 * It does NOT execute builds directly; it can invoke helper scripts for humans.
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
  node .ai/scripts/packctl.js <command> [options]

Commands:
  help
    Show this help.

  init
    --repo-root <path>          Repo root (default: cwd)
    --dry-run                   Show what would be created/updated
    Initialize packaging configuration (idempotent).

  list
    --repo-root <path>          Repo root (default: cwd)
    --format <text|json>        Output format (default: text)
    List packaging targets.

  add-service | add-job | add-app
    --id <string>               Target ID (required)
    --module <path>             Source module path (recommended)
    --template <node|python|go>  Optional Dockerfile template to copy
    --repo-root <path>          Repo root (default: cwd)
    Register a packaging target.

  add
    --id <string>               Target ID (required)
    --type <service|job|app>    Target type (required)
    --module <path>             Source module path (recommended)
    --template <node|python|go>  Optional Dockerfile template to copy
    --repo-root <path>          Repo root (default: cwd)
    Backward-compatible form of add-* commands.

  remove
    --id <string>               Target ID (required)
    --repo-root <path>          Repo root (default: cwd)
    Remove a packaging target.

  build
    --target <id>               Target ID (required)
    --tag <tag>                 Image tag (default: latest)
    --context <path>            Docker build context (default: .)
    --dry-run                   Print docker command only
    --repo-root <path>          Repo root (default: cwd)
    Build a single target (human-run).

  build-all
    --tag <tag>                 Image tag (default: latest)
    --context <path>            Docker build context (default: .)
    --dry-run                   Print docker command only
    --repo-root <path>          Repo root (default: cwd)
    Build all targets (human-run).

  verify
    --repo-root <path>          Repo root (default: cwd)
    Verify packaging configuration.

  status
    --repo-root <path>          Repo root (default: cwd)
    --format <text|json>        Output format (default: text)
    Show packaging status.

Examples:
  node .ai/scripts/packctl.js init
  node .ai/scripts/packctl.js add-service --id api --module apps/backend --template node
  node .ai/scripts/packctl.js list
  node .ai/scripts/packctl.js build --target api --tag v1.0.0
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
// Paths / Registry schema
// ============================================================================

const VALID_TYPES = ['service', 'job', 'app'];
const VALID_TEMPLATES = ['node', 'python', 'go'];

function getPackagingDir(repoRoot) {
  return path.join(repoRoot, 'ops', 'packaging');
}

function getRegistryPath(repoRoot) {
  return path.join(repoRoot, 'docs', 'packaging', 'registry.json');
}

function getDockerBuildScriptPath(repoRoot) {
  return path.join(getPackagingDir(repoRoot), 'scripts', 'docker-build.js');
}

function getTemplatePath(repoRoot, template) {
  return path.join(getPackagingDir(repoRoot), 'templates', `Dockerfile.${template}`);
}

function dockerfilePathFor(type, id) {
  const dir = type === 'job' ? 'jobs' : type === 'app' ? 'apps' : 'services';
  // Keep forward slashes in registry entries for cross-platform readability.
  return path.posix.join('ops', 'packaging', dir, `${id}.Dockerfile`);
}

// ============================================================================
// File Utilities
// ============================================================================

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

function normalizeRegistry(raw) {
  const registry = raw && typeof raw === 'object' ? { ...raw } : {};

  if (typeof registry.version !== 'number') registry.version = 1;

  if (!registry.updatedAt && typeof registry.lastUpdated === 'string') {
    registry.updatedAt = registry.lastUpdated;
  }
  delete registry.lastUpdated;

  if (!Array.isArray(registry.targets)) registry.targets = [];
  registry.targets = registry.targets
    .filter((t) => t && typeof t === 'object')
    .map((t) => {
      const id = typeof t.id === 'string' && t.id ? t.id : typeof t.name === 'string' ? t.name : '';
      const type = VALID_TYPES.includes(t.type) ? t.type : null;
      const modulePath = typeof t.module === 'string' ? t.module : '';
      const dockerfile = typeof t.dockerfile === 'string' && t.dockerfile ? t.dockerfile : type && id ? dockerfilePathFor(type, id) : '';
      return {
        id,
        type,
        module: modulePath,
        dockerfile,
        addedAt: typeof t.addedAt === 'string' ? t.addedAt : undefined
      };
    })
    .filter((t) => t.id && t.type);

  return registry;
}

function loadRegistry(repoRoot) {
  return normalizeRegistry(readJson(getRegistryPath(repoRoot)));
}

function saveRegistry(repoRoot, registry) {
  const normalized = normalizeRegistry(registry);
  normalized.updatedAt = new Date().toISOString();
  writeJson(getRegistryPath(repoRoot), normalized);
  return normalized;
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
    path.join(packagingDir, 'templates'),
    path.join(packagingDir, 'scripts'),
    path.join(packagingDir, 'workdocs'),
    path.join(repoRoot, 'docs', 'packaging')
  ];

  for (const dir of dirs) {
    if (dryRun) actions.push({ op: 'mkdir', path: dir, mode: 'dry-run' });
    else actions.push(ensureDir(dir));
  }

  const registryPath = getRegistryPath(repoRoot);
  const existing = readJson(registryPath);
  const normalized = normalizeRegistry(existing);
  if (dryRun) {
    actions.push({ op: 'write', path: registryPath, mode: 'dry-run' });
  } else {
    saveRegistry(repoRoot, normalized || { version: 1, targets: [] });
    actions.push({ op: 'write', path: registryPath });
  }

  const agentsPath = path.join(packagingDir, 'AGENTS.md');
  const agentsContent = `# Packaging - AI Guidance\n\n## Conclusions (read first)\n\n- \`ops/packaging/\` contains all containerization artifacts.\n- Use \`packctl.js\` to manage packaging configuration.\n- AI proposes changes; humans execute builds.\n\n## AI Workflow\n\n1. Register targets: \`node .ai/scripts/packctl.js add-service --id <id> --module <path>\`\n2. Customize Dockerfile (copy from templates)\n3. Document in \`ops/packaging/workdocs/\`\n4. Request human to build/push\n\n## Registry\n\nAll targets are tracked in \`docs/packaging/registry.json\`.\n`;
  if (dryRun) actions.push({ op: 'write', path: agentsPath, mode: 'dry-run' });
  else actions.push(writeFileIfMissing(agentsPath, agentsContent));

  console.log('[ok] Packaging configuration initialized.');
  for (const a of actions) {
    const mode = a.mode ? ` (${a.mode})` : '';
    const reason = a.reason ? ` [${a.reason}]` : '';
    console.log(`  ${a.op}: ${path.relative(repoRoot, a.path)}${mode}${reason}`);
  }
}

function cmdList(repoRoot, format) {
  const registry = loadRegistry(repoRoot) || { version: 1, targets: [] };

  if (format === 'json') {
    console.log(JSON.stringify(registry, null, 2));
    return;
  }

  console.log(`Packaging Targets (${registry.targets.length}):\n`);
  if (registry.targets.length === 0) {
    console.log('  (no targets defined)');
    return;
  }

  for (const t of registry.targets) {
    const moduleStr = t.module ? ` module=${t.module}` : '';
    console.log(`  [${t.type}] ${t.id}${moduleStr}`);
  }
}

function copyTemplateIfRequested(repoRoot, template, dockerfileRel) {
  if (!template) return { op: 'skip', path: dockerfileRel, reason: 'no-template' };
  const t = String(template).toLowerCase();
  if (!VALID_TEMPLATES.includes(t)) die(`[error] --template must be one of: ${VALID_TEMPLATES.join(', ')}`);

  const templatePath = getTemplatePath(repoRoot, t);
  if (!fs.existsSync(templatePath)) {
    return { op: 'skip', path: dockerfileRel, reason: `missing-template ${templatePath}` };
  }

  const content = fs.readFileSync(templatePath, 'utf8');
  const header = `# Generated from template: ${path.relative(repoRoot, templatePath).replaceAll('\\', '/')}\n`;
  return writeFileIfMissing(path.join(repoRoot, dockerfileRel), header + content);
}

function cmdAddTarget(repoRoot, { id, type, modulePath, template }) {
  if (!id) die('[error] --id is required');
  if (!type) die('[error] --type is required');
  if (!VALID_TYPES.includes(type)) die(`[error] --type must be one of: ${VALID_TYPES.join(', ')}`);

  const registry = loadRegistry(repoRoot);
  if (!registry) die('[error] Registry not found. Run: packctl init');

  if (registry.targets.find((t) => t.id === id)) {
    die(`[error] Target "${id}" already exists`);
  }

  const dockerfile = dockerfilePathFor(type, id);
  registry.targets.push({
    id,
    type,
    module: modulePath || '',
    dockerfile,
    addedAt: new Date().toISOString()
  });
  saveRegistry(repoRoot, registry);

  // Optionally create Dockerfile from template.
  const dockerfileDiskPath = path.join(repoRoot, dockerfile);
  if (template) {
    copyTemplateIfRequested(repoRoot, template, dockerfile);
  } else if (!fs.existsSync(dockerfileDiskPath)) {
    const placeholder = `# ${id} (${type}) Dockerfile\n# Copy a template from ops/packaging/templates/ and customize.\n`;
    writeFileIfMissing(dockerfileDiskPath, placeholder);
  }

  console.log(`[ok] Added packaging target: ${id} (${type})`);
  console.log(`  dockerfile: ${dockerfile}`);
}

function cmdRemove(repoRoot, id) {
  if (!id) die('[error] --id is required');

  const registry = loadRegistry(repoRoot);
  if (!registry) die('[error] Registry not found. Run: packctl init');

  const idx = registry.targets.findIndex((t) => t.id === id);
  if (idx === -1) die(`[error] Target "${id}" not found`);

  registry.targets.splice(idx, 1);
  saveRegistry(repoRoot, registry);
  console.log(`[ok] Removed packaging target: ${id}`);
}

function runDockerBuild(repoRoot, { dockerfile, tag, context, dryRun }) {
  const scriptPath = getDockerBuildScriptPath(repoRoot);
  if (!fs.existsSync(scriptPath)) {
    die(`[error] Missing build helper: ${path.relative(repoRoot, scriptPath)}`);
  }

  const args = ['--dockerfile', dockerfile, '--tag', tag, '--context', context || '.'];
  if (dryRun) args.push('--dry-run');

  const res = spawnSync('node', [scriptPath, ...args], {
    stdio: 'inherit',
    cwd: repoRoot
  });

  if (typeof res.status === 'number') return res.status;
  return 1;
}

function cmdBuild(repoRoot, { targetId, tag, context, dryRun }) {
  if (!targetId) die('[error] --target is required');

  const registry = loadRegistry(repoRoot);
  if (!registry) die('[error] Registry not found. Run: packctl init');

  const target = registry.targets.find((t) => t.id === targetId);
  if (!target) die(`[error] Target "${targetId}" not found`);

  const dockerfile = target.dockerfile;
  if (!dockerfile) die(`[error] Target "${targetId}" has no dockerfile path in registry`);

  const imageTag = `${target.id}:${tag || 'latest'}`;
  return runDockerBuild(repoRoot, { dockerfile, tag: imageTag, context, dryRun });
}

function cmdBuildAll(repoRoot, { tag, context, dryRun }) {
  const registry = loadRegistry(repoRoot);
  if (!registry) die('[error] Registry not found. Run: packctl init');

  if (registry.targets.length === 0) {
    console.log('[ok] No targets to build.');
    return 0;
  }

  for (const t of registry.targets) {
    const code = cmdBuild(repoRoot, { targetId: t.id, tag, context, dryRun });
    if (code !== 0) return code;
  }
  return 0;
}

function cmdVerify(repoRoot) {
  const errors = [];
  const warnings = [];

  if (!fs.existsSync(getPackagingDir(repoRoot))) {
    errors.push('ops/packaging/ not found. Run: packctl init');
  }

  const registryPath = getRegistryPath(repoRoot);
  if (!fs.existsSync(registryPath)) {
    errors.push('docs/packaging/registry.json not found. Run: packctl init');
  }

  const registry = loadRegistry(repoRoot) || { version: 1, targets: [] };
  if (registry.targets.length === 0) warnings.push('No packaging targets defined');

  for (const t of registry.targets) {
    const dockerfileDisk = path.join(repoRoot, t.dockerfile);
    if (!fs.existsSync(dockerfileDisk)) {
      warnings.push(`Dockerfile missing for target "${t.id}": ${t.dockerfile}`);
    }
  }

  if (!fs.existsSync(getDockerBuildScriptPath(repoRoot))) {
    warnings.push('Build helper missing: ops/packaging/scripts/docker-build.js');
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
  const registry = loadRegistry(repoRoot) || { targets: [] };
  const status = {
    initialized: fs.existsSync(getPackagingDir(repoRoot)),
    targets: registry.targets.length,
    updatedAt: registry.updatedAt
  };

  if (format === 'json') {
    console.log(JSON.stringify(status, null, 2));
    return;
  }

  console.log('Packaging Status:');
  console.log(`  Initialized: ${status.initialized ? 'yes' : 'no'}`);
  console.log(`  Targets: ${status.targets}`);
  console.log(`  Updated: ${status.updatedAt || 'never'}`);
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
    case 'init':
      cmdInit(repoRoot, !!opts['dry-run']);
      break;
    case 'list':
      cmdList(repoRoot, format);
      break;
    case 'add-service':
      cmdAddTarget(repoRoot, {
        id: opts.id,
        type: 'service',
        modulePath: opts.module,
        template: opts.template
      });
      break;
    case 'add-job':
      cmdAddTarget(repoRoot, {
        id: opts.id,
        type: 'job',
        modulePath: opts.module,
        template: opts.template
      });
      break;
    case 'add-app':
      cmdAddTarget(repoRoot, {
        id: opts.id,
        type: 'app',
        modulePath: opts.module,
        template: opts.template
      });
      break;
    case 'add':
      cmdAddTarget(repoRoot, {
        id: opts.id || opts.name,
        type: opts.type ? String(opts.type).toLowerCase() : undefined,
        modulePath: opts.module,
        template: opts.template
      });
      break;
    case 'remove':
      cmdRemove(repoRoot, opts.id || opts.name);
      break;
    case 'build': {
      const code = cmdBuild(repoRoot, {
        targetId: opts.target,
        tag: opts.tag,
        context: opts.context,
        dryRun: !!opts['dry-run']
      });
      process.exit(code);
      break;
    }
    case 'build-all': {
      const code = cmdBuildAll(repoRoot, {
        tag: opts.tag,
        context: opts.context,
        dryRun: !!opts['dry-run']
      });
      process.exit(code);
      break;
    }
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


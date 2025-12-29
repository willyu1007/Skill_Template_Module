#!/usr/bin/env node
/**
 * deployctl.js
 *
 * Deployment configuration management for the deployment add-on.
 *
 * Commands:
 *   init              Initialize deployment configuration (idempotent)
 *   list-envs         List deployment environments
 *   add-env           Add a deployment environment
 *   verify            Verify deployment configuration
 *   status            Show deployment status
 */

import fs from 'node:fs';
import path from 'node:path';

// ============================================================================
// CLI Argument Parsing
// ============================================================================

function usage(exitCode = 0) {
  const msg = `
Usage:
  node .ai/scripts/deployctl.js <command> [options]

Commands:
  init
    --repo-root <path>          Repo root (default: cwd)
    --dry-run                   Show what would be created
    Initialize deployment configuration.

  list-envs
    --repo-root <path>          Repo root (default: cwd)
    --format <text|json>        Output format (default: text)
    List deployment environments.

  add-env
    --id <string>               Environment ID (required)
    --description <string>      Description (optional)
    --repo-root <path>          Repo root (default: cwd)
    Add a deployment environment.

  verify
    --repo-root <path>          Repo root (default: cwd)
    Verify deployment configuration.

  status
    --repo-root <path>          Repo root (default: cwd)
    --format <text|json>        Output format (default: text)
    Show deployment status.

Examples:
  node .ai/scripts/deployctl.js init
  node .ai/scripts/deployctl.js add-env --id qa --description "QA environment"
  node .ai/scripts/deployctl.js list-envs
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
// Deployment Management
// ============================================================================

function getDeployDir(repoRoot) {
  return path.join(repoRoot, 'ops', 'deploy');
}

function getEnvsDir(repoRoot) {
  return path.join(getDeployDir(repoRoot), 'environments');
}

function getConfigPath(repoRoot) {
  return path.join(getDeployDir(repoRoot), 'config.json');
}

function loadConfig(repoRoot) {
  return readJson(getConfigPath(repoRoot)) || {
    version: 1,
    environments: []
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
  const deployDir = getDeployDir(repoRoot);
  const actions = [];

  const dirs = [
    deployDir,
    path.join(deployDir, 'environments'),
    path.join(deployDir, 'http_services'),
    path.join(deployDir, 'workloads'),
    path.join(deployDir, 'clients'),
    path.join(deployDir, 'scripts'),
    path.join(deployDir, 'workdocs'),
    path.join(deployDir, 'workdocs', 'runbooks')
  ];

  for (const dir of dirs) {
    if (dryRun) {
      actions.push({ op: 'mkdir', path: dir, mode: 'dry-run' });
    } else {
      actions.push(ensureDir(dir));
    }
  }

  // Create config with default environments
  const configPath = getConfigPath(repoRoot);
  if (!fs.existsSync(configPath) && !dryRun) {
    saveConfig(repoRoot, {
      version: 1,
      environments: [
        { id: 'dev', description: 'Development', canDeploy: true },
        { id: 'staging', description: 'Staging', canDeploy: true },
        { id: 'prod', description: 'Production', canDeploy: true, requiresApproval: true }
      ]
    });
    actions.push({ op: 'write', path: configPath });
  }

  // Create AGENTS.md
  const agentsPath = path.join(deployDir, 'AGENTS.md');
  const agentsContent = `# Deployment (LLM-first)

## Commands

\`\`\`bash
node .ai/scripts/deployctl.js init
node .ai/scripts/deployctl.js list-envs
node .ai/scripts/deployctl.js verify
\`\`\`

## Directory Structure

- \`environments/\` - Environment-specific configs
- \`http_services/\` - Service deployment descriptors
- \`workloads/\` - Job/batch deployment descriptors
- \`clients/\` - Client app deployment descriptors
- \`scripts/\` - Deploy/rollback scripts
- \`workdocs/runbooks/\` - Operational runbooks
`;

  if (dryRun) {
    actions.push({ op: 'write', path: agentsPath, mode: 'dry-run' });
  } else {
    actions.push(writeFileIfMissing(agentsPath, agentsContent));
  }

  console.log('[ok] Deployment configuration initialized.');
  for (const a of actions) {
    const mode = a.mode ? ` (${a.mode})` : '';
    const reason = a.reason ? ` [${a.reason}]` : '';
    console.log(`  ${a.op}: ${path.relative(repoRoot, a.path)}${mode}${reason}`);
  }
}

function cmdListEnvs(repoRoot, format) {
  const config = loadConfig(repoRoot);

  if (format === 'json') {
    console.log(JSON.stringify({ environments: config.environments }, null, 2));
    return;
  }

  console.log(`Deployment Environments (${config.environments.length}):\n`);
  for (const env of config.environments) {
    const flags = [];
    if (env.requiresApproval) flags.push('requires-approval');
    if (!env.canDeploy) flags.push('deploy-disabled');
    const flagStr = flags.length > 0 ? ` [${flags.join(', ')}]` : '';
    console.log(`  [${env.id}] ${env.description || ''}${flagStr}`);
  }
}

function cmdAddEnv(repoRoot, id, description) {
  if (!id) die('[error] --id is required');

  const config = loadConfig(repoRoot);
  if (config.environments.find(e => e.id === id)) {
    die(`[error] Environment "${id}" already exists`);
  }

  config.environments.push({
    id,
    description: description || `${id} environment`,
    canDeploy: true,
    addedAt: new Date().toISOString()
  });
  saveConfig(repoRoot, config);

  // Create environment config file
  const envFile = path.join(getEnvsDir(repoRoot), `${id}.yaml`);
  if (!fs.existsSync(envFile)) {
    const content = `# ${id} environment configuration
# Generated: ${new Date().toISOString()}

environment: ${id}
# Add environment-specific settings here
`;
    fs.mkdirSync(path.dirname(envFile), { recursive: true });
    fs.writeFileSync(envFile, content, 'utf8');
  }

  console.log(`[ok] Added environment: ${id}`);
}

function cmdVerify(repoRoot) {
  const errors = [];
  const warnings = [];

  if (!fs.existsSync(getDeployDir(repoRoot))) {
    errors.push('ops/deploy/ not found. Run: deployctl init');
  }

  const config = loadConfig(repoRoot);
  if (config.environments.length === 0) {
    warnings.push('No environments defined');
  }

  // Check environment config files exist
  for (const env of config.environments) {
    const envFile = path.join(getEnvsDir(repoRoot), `${env.id}.yaml`);
    if (!fs.existsSync(envFile)) {
      warnings.push(`Environment config missing: ${env.id}.yaml`);
    }
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
  console.log(ok ? '[ok] Deployment configuration verified.' : '[error] Verification failed.');
  process.exit(ok ? 0 : 1);
}

function cmdStatus(repoRoot, format) {
  const config = loadConfig(repoRoot);
  const status = {
    initialized: fs.existsSync(getDeployDir(repoRoot)),
    environments: config.environments.length,
    lastUpdated: config.lastUpdated
  };

  if (format === 'json') {
    console.log(JSON.stringify(status, null, 2));
    return;
  }

  console.log('Deployment Status:');
  console.log(`  Initialized: ${status.initialized ? 'yes' : 'no'}`);
  console.log(`  Environments: ${status.environments}`);
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
    case 'list-envs':
      cmdListEnvs(repoRoot, format);
      break;
    case 'add-env':
      cmdAddEnv(repoRoot, opts['id'], opts['description']);
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

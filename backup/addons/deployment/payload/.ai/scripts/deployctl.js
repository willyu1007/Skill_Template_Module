#!/usr/bin/env node
/**
 * deployctl.js
 *
 * Deployment configuration management for the deployment add-on.
 *
 * This script manages:
 * - `ops/deploy/config.json` (model, environments, services, history)
 * - `ops/deploy/**` scaffolding and descriptor files
 *
 * It does NOT execute deployments; it only generates plans and guidance.
 */

import fs from 'node:fs';
import path from 'node:path';

// ============================================================================
// CLI
// ============================================================================

function usage(exitCode = 0) {
  const msg = `
Usage:
  node .ai/scripts/deployctl.js <command> [options]

Commands:
  help
    Show this help.

  init
    --repo-root <path>                 Repo root (default: cwd)
    --model <k8s|serverless|vm|paas>   Deployment model (default: k8s)
    --k8s-tool <helm|kustomize|manifests>  K8s sub-mode (default: helm)
    --dry-run                          Show what would be created/updated
    Initialize deployment configuration (idempotent).

  add-service
    --id <string>                      Service ID (required)
    --kind <http|workload|client>      Service kind (default: http)
    --artifact <string>                Artifact reference (optional)
    --description <string>             Description (optional)
    --repo-root <path>                 Repo root (default: cwd)
    Register a service for planning.

  list
    --repo-root <path>                 Repo root (default: cwd)
    --format <text|json>               Output format (default: text)
    List registered services.

  plan
    --service <id>                     Service ID (required)
    --env <env>                        Environment ID (required)
    --tag <tag>                        Optional tag override (recorded in history)
    --repo-root <path>                 Repo root (default: cwd)
    --format <text|json>               Output format (default: text)
    Generate a deployment plan (no execution).

  history
    --service <id>                     Filter by service ID (optional)
    --env <env>                        Filter by environment (optional)
    --limit <n>                        Limit entries (optional)
    --repo-root <path>                 Repo root (default: cwd)
    --format <text|json>               Output format (default: text)
    Show deployment planning history.

  status
    --env <env>                        Show env-specific status (optional)
    --repo-root <path>                 Repo root (default: cwd)
    --format <text|json>               Output format (default: text)
    Show deployment status.

  list-envs
    --repo-root <path>                 Repo root (default: cwd)
    --format <text|json>               Output format (default: text)
    List deployment environments.

  add-env
    --id <string>                      Environment ID (required)
    --description <string>             Description (optional)
    --repo-root <path>                 Repo root (default: cwd)
    Add a deployment environment.

  verify
    --repo-root <path>                 Repo root (default: cwd)
    Verify deployment configuration.

Examples:
  node .ai/scripts/deployctl.js init --model k8s --k8s-tool helm
  node .ai/scripts/deployctl.js add-service --id api --artifact api:v1.2.3
  node .ai/scripts/deployctl.js list
  node .ai/scripts/deployctl.js plan --service api --env staging
  node .ai/scripts/deployctl.js history --service api
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
// Paths
// ============================================================================

function getDeployDir(repoRoot) {
  return path.join(repoRoot, 'ops', 'deploy');
}

function getConfigPath(repoRoot) {
  return path.join(getDeployDir(repoRoot), 'config.json');
}

function getEnvsDir(repoRoot) {
  return path.join(getDeployDir(repoRoot), 'environments');
}

function getWorkdocsDir(repoRoot) {
  return path.join(getDeployDir(repoRoot), 'workdocs');
}

function getServiceDescriptorPath(repoRoot, kind, id) {
  const kindDir =
    kind === 'workload'
      ? 'workloads'
      : kind === 'client'
        ? 'clients'
        : 'http_services';
  return path.join(getDeployDir(repoRoot), kindDir, `${id}.yaml`);
}

// ============================================================================
// Config Schema (normalize for backward compatibility)
// ============================================================================

const VALID_MODELS = ['k8s', 'serverless', 'vm', 'paas'];
const VALID_K8S_TOOLS = ['helm', 'kustomize', 'manifests'];
const VALID_SERVICE_KINDS = ['http', 'workload', 'client'];

function normalizeConfig(raw, { model, k8sTool } = {}) {
  const config = raw && typeof raw === 'object' ? { ...raw } : {};

  if (typeof config.version !== 'number') config.version = 1;

  if (!config.updatedAt && typeof config.lastUpdated === 'string') {
    config.updatedAt = config.lastUpdated;
  }
  delete config.lastUpdated;

  if (typeof config.model !== 'string' || config.model.trim() === '') {
    config.model = model || 'k8s';
  }
  if (!VALID_MODELS.includes(config.model)) {
    config.model = model && VALID_MODELS.includes(model) ? model : 'k8s';
  }

  if (!config.k8s || typeof config.k8s !== 'object') config.k8s = {};
  if (typeof config.k8s.tool !== 'string' || !VALID_K8S_TOOLS.includes(config.k8s.tool)) {
    if (k8sTool && VALID_K8S_TOOLS.includes(k8sTool)) {
      config.k8s.tool = k8sTool;
    } else {
      config.k8s.tool = 'helm';
    }
  }

  if (!Array.isArray(config.environments)) config.environments = [];
  config.environments = config.environments
    .filter((e) => e && typeof e === 'object' && typeof e.id === 'string' && e.id.trim() !== '')
    .map((e) => ({
      id: e.id,
      description: typeof e.description === 'string' ? e.description : `${e.id} environment`,
      canDeploy: typeof e.canDeploy === 'boolean' ? e.canDeploy : true,
      requiresApproval: typeof e.requiresApproval === 'boolean' ? e.requiresApproval : false,
      addedAt: typeof e.addedAt === 'string' ? e.addedAt : undefined
    }));

  if (!Array.isArray(config.services)) config.services = [];
  config.services = config.services
    .filter((s) => s && typeof s === 'object' && typeof s.id === 'string' && s.id.trim() !== '')
    .map((s) => ({
      id: s.id,
      kind: VALID_SERVICE_KINDS.includes(s.kind) ? s.kind : 'http',
      artifact: typeof s.artifact === 'string' ? s.artifact : '',
      description: typeof s.description === 'string' ? s.description : '',
      addedAt: typeof s.addedAt === 'string' ? s.addedAt : undefined
    }));

  if (!Array.isArray(config.history)) config.history = [];
  config.history = config.history.filter((h) => h && typeof h === 'object');

  return config;
}

function loadConfig(repoRoot, normalizeOpts) {
  const configPath = getConfigPath(repoRoot);
  const raw = readJson(configPath);
  return normalizeConfig(raw, normalizeOpts);
}

function saveConfig(repoRoot, config) {
  const normalized = normalizeConfig(config);
  normalized.updatedAt = new Date().toISOString();
  writeJson(getConfigPath(repoRoot), normalized);
  return normalized;
}

// ============================================================================
// Commands
// ============================================================================

function cmdInit(repoRoot, { dryRun, model, k8sTool }) {
  const actions = [];
  const deployDir = getDeployDir(repoRoot);

  const dirList = [
    deployDir,
    path.join(deployDir, 'environments'),
    path.join(deployDir, 'http_services'),
    path.join(deployDir, 'workloads'),
    path.join(deployDir, 'clients'),
    path.join(deployDir, 'scripts'),
    path.join(deployDir, 'workdocs'),
    path.join(deployDir, 'workdocs', 'active'),
    path.join(deployDir, 'workdocs', 'archive'),
    path.join(deployDir, 'workdocs', 'runbooks')
  ];

  if (model === 'k8s') {
    dirList.push(
      path.join(deployDir, 'k8s'),
      path.join(deployDir, 'k8s', 'helm'),
      path.join(deployDir, 'k8s', 'kustomize'),
      path.join(deployDir, 'k8s', 'manifests')
    );
  }

  for (const dir of dirList) {
    if (dryRun) actions.push({ op: 'mkdir', path: dir, mode: 'dry-run' });
    else actions.push(ensureDir(dir));
  }

  const configPath = getConfigPath(repoRoot);
  const existing = readJson(configPath);
  const normalized = normalizeConfig(existing, { model, k8sTool });

  // Default environments if empty
  if (normalized.environments.length === 0) {
    normalized.environments = [
      {
        id: 'dev',
        description: 'Development environment',
        canDeploy: true,
        requiresApproval: false,
        addedAt: new Date().toISOString()
      },
      {
        id: 'staging',
        description: 'Staging environment',
        canDeploy: true,
        requiresApproval: true,
        addedAt: new Date().toISOString()
      },
      {
        id: 'prod',
        description: 'Production environment',
        canDeploy: true,
        requiresApproval: true,
        addedAt: new Date().toISOString()
      }
    ];
  }

  // Ensure env yaml stubs exist (copy-if-missing)
  for (const env of normalized.environments) {
    const envFile = path.join(getEnvsDir(repoRoot), `${env.id}.yaml`);
    const content = `# ${env.id} environment configuration\n# Generated: ${new Date().toISOString()}\n\nenvironment: ${env.id}\n# Add environment-specific settings here\n`;
    if (dryRun) actions.push({ op: 'write', path: envFile, mode: 'dry-run' });
    else actions.push(writeFileIfMissing(envFile, content));
  }

  // Create config (or migrate) and do not overwrite unknown keys.
  if (dryRun) {
    actions.push({ op: 'write', path: configPath, mode: 'dry-run' });
  } else {
    saveConfig(repoRoot, normalized);
    actions.push({ op: 'write', path: configPath });
  }

  // Create a default AGENTS.md only if missing (payload usually provides one).
  const agentsPath = path.join(deployDir, 'AGENTS.md');
  const agentsContent = `# Deployment - AI Guidance\n\n## Conclusions (read first)\n\n- \`ops/deploy/\` contains all deployment configuration.\n- Use \`deployctl.js\` to manage deployments.\n- AI plans deployments; humans execute and approve.\n\n## AI Workflow\n\n1. Register services: \`node .ai/scripts/deployctl.js add-service --id <id>\`\n2. Plan deployment: \`node .ai/scripts/deployctl.js plan --service <id> --env <env>\`\n3. Document in \`ops/deploy/workdocs/\`\n4. Request human approval to execute\n\n## Forbidden Actions\n\n- Direct deployment execution\n- Credential handling\n- Production changes without approval\n`;
  if (dryRun) actions.push({ op: 'write', path: agentsPath, mode: 'dry-run' });
  else actions.push(writeFileIfMissing(agentsPath, agentsContent));

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
  if (config.environments.find((e) => e.id === id)) {
    die(`[error] Environment "${id}" already exists`);
  }

  config.environments.push({
    id,
    description: description || `${id} environment`,
    canDeploy: true,
    requiresApproval: id !== 'dev',
    addedAt: new Date().toISOString()
  });
  saveConfig(repoRoot, config);

  const envFile = path.join(getEnvsDir(repoRoot), `${id}.yaml`);
  if (!fs.existsSync(envFile)) {
    const content = `# ${id} environment configuration\n# Generated: ${new Date().toISOString()}\n\nenvironment: ${id}\n# Add environment-specific settings here\n`;
    fs.mkdirSync(path.dirname(envFile), { recursive: true });
    fs.writeFileSync(envFile, content, 'utf8');
  }

  console.log(`[ok] Added environment: ${id}`);
}

function cmdAddService(repoRoot, { id, kind, artifact, description }) {
  if (!id) die('[error] --id is required');

  const serviceKind = kind || 'http';
  if (!VALID_SERVICE_KINDS.includes(serviceKind)) {
    die(`[error] --kind must be one of: ${VALID_SERVICE_KINDS.join(', ')}`);
  }

  const config = loadConfig(repoRoot);
  if (config.services.find((s) => s.id === id)) {
    die(`[error] Service "${id}" already exists`);
  }

  config.services.push({
    id,
    kind: serviceKind,
    artifact: artifact || '',
    description: description || '',
    addedAt: new Date().toISOString()
  });
  saveConfig(repoRoot, config);

  const descriptorPath = getServiceDescriptorPath(repoRoot, serviceKind, id);
  const descriptorContent = `# ${id} (${serviceKind})\n# Generated: ${new Date().toISOString()}\n\nid: ${id}\nkind: ${serviceKind}\nartifact: ${artifact || ''}\ndescription: ${description || ''}\n`;
  writeFileIfMissing(descriptorPath, descriptorContent);

  console.log(`[ok] Added service: ${id} (${serviceKind})`);
}

function cmdListServices(repoRoot, format) {
  const config = loadConfig(repoRoot);

  if (format === 'json') {
    console.log(JSON.stringify({ services: config.services }, null, 2));
    return;
  }

  console.log(`Registered Services (${config.services.length}):\n`);
  if (config.services.length === 0) {
    console.log('  (no services registered)');
    return;
  }

  for (const s of config.services) {
    const artifact = s.artifact ? ` - ${s.artifact}` : '';
    const desc = s.description ? ` - ${s.description}` : '';
    console.log(`  [${s.kind}] ${s.id}${artifact}${desc}`);
  }
}

function buildPlanText({ model, k8sTool, service, env, tag }) {
  const header = `# Deployment Plan\n\n- Service: ${service.id}\n- Kind: ${service.kind}\n- Environment: ${env.id}\n- Model: ${model}${model === 'k8s' ? ` (${k8sTool})` : ''}\n- Artifact: ${service.artifact || '(not set)'}\n- Tag override: ${tag || '(none)'}\n\n## Notes\n\n- This plan does NOT execute deployment.\n- Staging/prod require human review/approval.\n\n## Steps\n`;

  if (model !== 'k8s') {
    return (
      header +
      `1. Review environment config: \`ops/deploy/environments/${env.id}.yaml\`\n2. Confirm artifact reference for \`${service.id}\`.\n3. Follow your ${model} runbook in \`ops/deploy/workdocs/runbooks/\`.\n4. Run health check:\n   - \`node ops/deploy/scripts/healthcheck.js --url <health-url>\`\n`
    );
  }

  if (k8sTool === 'helm') {
    return (
      header +
      `1. Ensure Helm chart exists for \`${service.id}\`.\n   - Template available at \`ops/deploy/k8s/helm/chart-template/\`\n2. Deploy (human-run):\n   - \`helm upgrade --install ${service.id} ops/deploy/k8s/helm/<chart> -n ${env.id} \\\\\n       --values ops/deploy/environments/${env.id}.yaml\`\n3. Verify rollout (human-run):\n   - \`kubectl rollout status deployment/${service.id} -n ${env.id}\`\n4. Run health check:\n   - \`node ops/deploy/scripts/healthcheck.js --url <health-url>\`\n5. Rollback (if needed): see \`ops/deploy/workdocs/runbooks/rollback-procedure.md\`\n`
    );
  }

  if (k8sTool === 'kustomize') {
    return (
      header +
      `1. Ensure Kustomize overlays exist.\n2. Deploy (human-run):\n   - \`kubectl apply -k ops/deploy/k8s/kustomize/<overlay>\`\n3. Verify rollout (human-run):\n   - \`kubectl rollout status deployment/${service.id} -n ${env.id}\`\n4. Run health check:\n   - \`node ops/deploy/scripts/healthcheck.js --url <health-url>\`\n5. Rollback (if needed): see \`ops/deploy/workdocs/runbooks/rollback-procedure.md\`\n`
    );
  }

  return (
    header +
    `1. Ensure manifests exist.\n2. Deploy (human-run):\n   - \`kubectl apply -f ops/deploy/k8s/manifests/\`\n3. Verify rollout (human-run):\n   - \`kubectl rollout status deployment/${service.id} -n ${env.id}\`\n4. Run health check:\n   - \`node ops/deploy/scripts/healthcheck.js --url <health-url>\`\n5. Rollback (if needed): see \`ops/deploy/workdocs/runbooks/rollback-procedure.md\`\n`
  );
}

function cmdPlan(repoRoot, { serviceId, envId, tag, format }) {
  if (!serviceId) die('[error] --service is required');
  if (!envId) die('[error] --env is required');

  const config = loadConfig(repoRoot);
  const service = config.services.find((s) => s.id === serviceId);
  if (!service) {
    die(`[error] Unknown service "${serviceId}". Register it first: deployctl add-service --id ${serviceId}`);
  }

  const env = config.environments.find((e) => e.id === envId);
  if (!env) {
    die(`[error] Unknown environment "${envId}". Add it first: deployctl add-env --id ${envId}`);
  }

  const plan = {
    generatedAt: new Date().toISOString(),
    service: service.id,
    env: env.id,
    model: config.model,
    k8sTool: config.model === 'k8s' ? config.k8s?.tool : undefined,
    artifact: service.artifact || null,
    tagOverride: tag || null
  };

  config.history.push({ ...plan, action: 'plan' });
  saveConfig(repoRoot, config);

  if (format === 'json') {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  const text = buildPlanText({
    model: config.model,
    k8sTool: config.k8s?.tool || 'helm',
    service,
    env,
    tag
  });
  console.log(text.trimEnd());
}

function cmdHistory(repoRoot, { serviceId, envId, limit, format }) {
  const config = loadConfig(repoRoot);
  let entries = Array.isArray(config.history) ? [...config.history] : [];
  entries = entries.filter((e) => e && typeof e === 'object');

  if (serviceId) entries = entries.filter((e) => e.service === serviceId);
  if (envId) entries = entries.filter((e) => e.env === envId);

  entries.sort((a, b) => String(b.generatedAt || '').localeCompare(String(a.generatedAt || '')));

  const lim = Number.isFinite(Number(limit)) ? Number(limit) : null;
  if (lim && lim > 0) entries = entries.slice(0, lim);

  if (format === 'json') {
    console.log(JSON.stringify({ history: entries }, null, 2));
    return;
  }

  console.log(`History (${entries.length}):\n`);
  if (entries.length === 0) {
    console.log('  (no history)');
    return;
  }

  for (const e of entries) {
    const when = e.generatedAt || e.at || '(unknown time)';
    const modelStr = e.model ? ` model=${e.model}` : '';
    const tagStr = e.tagOverride ? ` tag=${e.tagOverride}` : '';
    console.log(`  - ${when} action=${e.action || 'unknown'} service=${e.service} env=${e.env}${modelStr}${tagStr}`);
  }
}

function cmdStatus(repoRoot, { envId, format }) {
  const config = loadConfig(repoRoot);

  const status = {
    initialized: fs.existsSync(getDeployDir(repoRoot)),
    model: config.model,
    environments: config.environments.length,
    services: config.services.length,
    updatedAt: config.updatedAt,
    env: null
  };

  if (envId) {
    const env = config.environments.find((e) => e.id === envId);
    status.env = env
      ? {
          id: env.id,
          description: env.description,
          configFile: path.relative(repoRoot, path.join(getEnvsDir(repoRoot), `${env.id}.yaml`)),
          configFileExists: fs.existsSync(path.join(getEnvsDir(repoRoot), `${env.id}.yaml`))
        }
      : { id: envId, exists: false };
  }

  if (format === 'json') {
    console.log(JSON.stringify(status, null, 2));
    return;
  }

  console.log('Deployment Status:');
  console.log(`  Initialized: ${status.initialized ? 'yes' : 'no'}`);
  console.log(`  Model: ${status.model}`);
  console.log(`  Environments: ${status.environments}`);
  console.log(`  Services: ${status.services}`);
  console.log(`  Updated: ${status.updatedAt || 'never'}`);
  if (status.env) {
    if (status.env.exists === false) {
      console.log(`  Env: ${envId} (not defined)`);
    } else {
      console.log(`  Env: ${status.env.id} (${status.env.configFileExists ? 'config ok' : 'missing config'})`);
    }
  }
}

function cmdVerify(repoRoot) {
  const errors = [];
  const warnings = [];

  if (!fs.existsSync(getDeployDir(repoRoot))) {
    errors.push('ops/deploy/ not found. Run: deployctl init');
  }

  const configPath = getConfigPath(repoRoot);
  if (!fs.existsSync(configPath)) {
    errors.push('ops/deploy/config.json not found. Run: deployctl init');
  }

  const config = loadConfig(repoRoot);
  if (!VALID_MODELS.includes(config.model)) {
    errors.push(`Invalid model in config.json: ${String(config.model)}`);
  }

  if (config.environments.length === 0) warnings.push('No environments defined');
  if (config.services.length === 0) warnings.push('No services registered');

  for (const env of config.environments) {
    const envFile = path.join(getEnvsDir(repoRoot), `${env.id}.yaml`);
    if (!fs.existsSync(envFile)) {
      warnings.push(`Environment config missing: environments/${env.id}.yaml`);
    }
  }

  for (const svc of config.services) {
    const descriptorPath = getServiceDescriptorPath(repoRoot, svc.kind, svc.id);
    if (!fs.existsSync(descriptorPath)) {
      warnings.push(`Service descriptor missing: ${path.relative(repoRoot, descriptorPath)}`);
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

// ============================================================================
// Main
// ============================================================================

function main() {
  const { command, opts } = parseArgs(process.argv);
  const repoRoot = path.resolve(opts['repo-root'] || process.cwd());
  const format = String(opts['format'] || 'text').toLowerCase();

  if (command === 'help') usage(0);
  if (command === '-h' || command === '--help') usage(0);

  switch (command) {
    case 'init': {
      const model = opts.model ? String(opts.model).toLowerCase() : 'k8s';
      if (!VALID_MODELS.includes(model)) {
        die(`[error] --model must be one of: ${VALID_MODELS.join(', ')}`);
      }
      const k8sTool = opts['k8s-tool'] ? String(opts['k8s-tool']).toLowerCase() : undefined;
      if (k8sTool && !VALID_K8S_TOOLS.includes(k8sTool)) {
        die(`[error] --k8s-tool must be one of: ${VALID_K8S_TOOLS.join(', ')}`);
      }
      cmdInit(repoRoot, { dryRun: !!opts['dry-run'], model, k8sTool });
      break;
    }
    case 'add-service':
      cmdAddService(repoRoot, {
        id: opts.id,
        kind: opts.kind ? String(opts.kind).toLowerCase() : undefined,
        artifact: opts.artifact,
        description: opts.description
      });
      break;
    case 'list':
      cmdListServices(repoRoot, format);
      break;
    case 'plan':
      cmdPlan(repoRoot, {
        serviceId: opts.service,
        envId: opts.env,
        tag: opts.tag,
        format
      });
      break;
    case 'history':
      cmdHistory(repoRoot, {
        serviceId: opts.service,
        envId: opts.env,
        limit: opts.limit,
        format
      });
      break;
    case 'status':
      cmdStatus(repoRoot, { envId: opts.env, format });
      break;
    case 'list-envs':
      cmdListEnvs(repoRoot, format);
      break;
    case 'add-env':
      cmdAddEnv(repoRoot, opts.id, opts.description);
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


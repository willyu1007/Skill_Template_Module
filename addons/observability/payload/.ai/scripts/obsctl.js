#!/usr/bin/env node
/**
 * obsctl.js
 *
 * Observability configuration management for the observability add-on.
 *
 * Commands:
 *   init              Initialize observability configuration (idempotent)
 *   status            Show observability status
 *   verify            Verify observability configuration
 *   add-metric        Add a metric definition
 *   list-metrics      List defined metrics
 */

import fs from 'node:fs';
import path from 'node:path';

// ============================================================================
// CLI Argument Parsing
// ============================================================================

function usage(exitCode = 0) {
  const msg = `
Usage:
  node .ai/scripts/obsctl.js <command> [options]

Commands:
  init
    --repo-root <path>          Repo root (default: cwd)
    --dry-run                   Show what would be created
    Initialize observability configuration.

  status
    --repo-root <path>          Repo root (default: cwd)
    --format <text|json>        Output format (default: text)
    Show observability status.

  verify
    --repo-root <path>          Repo root (default: cwd)
    Verify observability configuration.

  add-metric
    --name <string>             Metric name (required)
    --type <counter|gauge|histogram>  Metric type (required)
    --description <string>      Description (optional)
    --repo-root <path>          Repo root (default: cwd)
    Add a metric definition.

  list-metrics
    --repo-root <path>          Repo root (default: cwd)
    --format <text|json>        Output format (default: text)
    List defined metrics.

Examples:
  node .ai/scripts/obsctl.js init
  node .ai/scripts/obsctl.js add-metric --name http_requests_total --type counter
  node .ai/scripts/obsctl.js list-metrics
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
// Observability Management
// ============================================================================

function getObsDir(repoRoot) {
  return path.join(repoRoot, 'observability');
}

function getContextObsDir(repoRoot) {
  return path.join(repoRoot, 'docs', 'context', 'observability');
}

function getConfigPath(repoRoot) {
  return path.join(getObsDir(repoRoot), 'config.json');
}

function getMetricsPath(repoRoot) {
  return path.join(getContextObsDir(repoRoot), 'metrics-registry.json');
}

function loadConfig(repoRoot) {
  return readJson(getConfigPath(repoRoot)) || {
    version: 1,
    initialized: false
  };
}

function saveConfig(repoRoot, config) {
  config.lastUpdated = new Date().toISOString();
  writeJson(getConfigPath(repoRoot), config);
}

function loadMetrics(repoRoot) {
  return readJson(getMetricsPath(repoRoot)) || {
    version: 1,
    metrics: []
  };
}

function saveMetrics(repoRoot, metrics) {
  metrics.lastUpdated = new Date().toISOString();
  writeJson(getMetricsPath(repoRoot), metrics);
}

// ============================================================================
// Commands
// ============================================================================

function cmdInit(repoRoot, dryRun) {
  const obsDir = getObsDir(repoRoot);
  const contextObsDir = getContextObsDir(repoRoot);
  const actions = [];

  const dirs = [
    obsDir,
    path.join(obsDir, 'workdocs'),
    path.join(obsDir, 'workdocs', 'alert-runbooks'),
    contextObsDir
  ];

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
    saveConfig(repoRoot, { version: 1, initialized: true });
    actions.push({ op: 'write', path: configPath });
  }

  // Create metrics registry
  const metricsPath = getMetricsPath(repoRoot);
  if (!fs.existsSync(metricsPath) && !dryRun) {
    saveMetrics(repoRoot, { version: 1, metrics: [] });
    actions.push({ op: 'write', path: metricsPath });
  }

  // Create AGENTS.md
  const agentsPath = path.join(obsDir, 'AGENTS.md');
  const agentsContent = `# Observability (LLM-first)

## Commands

\`\`\`bash
node .ai/scripts/obsctl.js init
node .ai/scripts/obsctl.js add-metric --name http_requests_total --type counter
node .ai/scripts/obsctl.js list-metrics
node .ai/scripts/obsctl.js verify
\`\`\`

## Directory Structure

- \`observability/config.json\` - Configuration
- \`observability/workdocs/alert-runbooks/\` - Alert runbooks
- \`docs/context/observability/\` - Metrics/logs/traces contracts

## Metric Types

- counter: Monotonically increasing value
- gauge: Value that can go up or down
- histogram: Distribution of values
`;

  if (dryRun) {
    actions.push({ op: 'write', path: agentsPath, mode: 'dry-run' });
  } else {
    actions.push(writeFileIfMissing(agentsPath, agentsContent));
  }

  // Create logs schema
  const logsSchemaPath = path.join(contextObsDir, 'logs-schema.json');
  if (!fs.existsSync(logsSchemaPath) && !dryRun) {
    writeJson(logsSchemaPath, {
      version: 1,
      fields: [
        { name: 'timestamp', type: 'datetime', required: true },
        { name: 'level', type: 'string', enum: ['debug', 'info', 'warn', 'error'] },
        { name: 'message', type: 'string', required: true },
        { name: 'service', type: 'string' },
        { name: 'trace_id', type: 'string' }
      ]
    });
    actions.push({ op: 'write', path: logsSchemaPath });
  }

  // Create traces config
  const tracesConfigPath = path.join(contextObsDir, 'traces-config.json');
  if (!fs.existsSync(tracesConfigPath) && !dryRun) {
    writeJson(tracesConfigPath, {
      version: 1,
      sampling: { default: 0.1, errors: 1.0 },
      propagation: ['tracecontext', 'baggage']
    });
    actions.push({ op: 'write', path: tracesConfigPath });
  }

  console.log('[ok] Observability configuration initialized.');
  for (const a of actions) {
    const mode = a.mode ? ` (${a.mode})` : '';
    const reason = a.reason ? ` [${a.reason}]` : '';
    console.log(`  ${a.op}: ${path.relative(repoRoot, a.path)}${mode}${reason}`);
  }
}

function cmdStatus(repoRoot, format) {
  const config = loadConfig(repoRoot);
  const metrics = loadMetrics(repoRoot);
  const status = {
    initialized: fs.existsSync(getObsDir(repoRoot)),
    metricsCount: metrics.metrics.length,
    lastUpdated: config.lastUpdated
  };

  if (format === 'json') {
    console.log(JSON.stringify(status, null, 2));
    return;
  }

  console.log('Observability Status:');
  console.log(`  Initialized: ${status.initialized ? 'yes' : 'no'}`);
  console.log(`  Metrics defined: ${status.metricsCount}`);
  console.log(`  Last updated: ${status.lastUpdated || 'never'}`);
}

function cmdVerify(repoRoot) {
  const errors = [];
  const warnings = [];

  if (!fs.existsSync(getObsDir(repoRoot))) {
    errors.push('observability/ not found. Run: obsctl init');
  }

  if (!fs.existsSync(getContextObsDir(repoRoot))) {
    warnings.push('docs/context/observability/ not found');
  }

  const metrics = loadMetrics(repoRoot);
  if (metrics.metrics.length === 0) {
    warnings.push('No metrics defined');
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
  console.log(ok ? '[ok] Observability configuration verified.' : '[error] Verification failed.');
  process.exit(ok ? 0 : 1);
}

function cmdAddMetric(repoRoot, name, type, description) {
  if (!name) die('[error] --name is required');
  if (!type) die('[error] --type is required');

  const validTypes = ['counter', 'gauge', 'histogram'];
  if (!validTypes.includes(type)) {
    die(`[error] --type must be one of: ${validTypes.join(', ')}`);
  }

  const metrics = loadMetrics(repoRoot);
  if (metrics.metrics.find(m => m.name === name)) {
    die(`[error] Metric "${name}" already exists`);
  }

  metrics.metrics.push({
    name,
    type,
    description: description || '',
    addedAt: new Date().toISOString()
  });
  saveMetrics(repoRoot, metrics);

  console.log(`[ok] Added metric: ${name} (${type})`);
}

function cmdListMetrics(repoRoot, format) {
  const metrics = loadMetrics(repoRoot);

  if (format === 'json') {
    console.log(JSON.stringify(metrics, null, 2));
    return;
  }

  console.log(`Metrics (${metrics.metrics.length}):\n`);
  if (metrics.metrics.length === 0) {
    console.log('  (no metrics defined)');
    return;
  }

  for (const m of metrics.metrics) {
    console.log(`  [${m.type}] ${m.name}`);
    if (m.description) {
      console.log(`    ${m.description}`);
    }
  }
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
    case 'verify':
      cmdVerify(repoRoot);
      break;
    case 'add-metric':
      cmdAddMetric(repoRoot, opts['name'], opts['type'], opts['description']);
      break;
    case 'list-metrics':
      cmdListMetrics(repoRoot, format);
      break;
    default:
      console.error(`[error] Unknown command: ${command}`);
      usage(1);
  }
}

main();

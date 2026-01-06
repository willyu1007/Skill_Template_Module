#!/usr/bin/env node
/**
 * obsctl.js
 *
 * Observability configuration management for the observability add-on.
 *
 * Manages backend-agnostic contracts for:
 * - Metrics: `docs/context/observability/metrics-registry.json`
 * - Logs: `docs/context/observability/logs-schema.json`
 * - Traces: `docs/context/observability/traces-config.json`
 *
 * This script does not add runtime instrumentation; it manages contracts and hints.
 */

import fs from 'node:fs';
import path from 'node:path';

// ============================================================================
// CLI
// ============================================================================

function usage(exitCode = 0) {
  const msg = `
Usage:
  node .ai/scripts/obsctl.js <command> [options]

Commands:
  help
    Show this help.

  init
    --repo-root <path>          Repo root (default: cwd)
    --dry-run                   Show what would be created/updated
    Initialize observability configuration (idempotent).

  status
    --repo-root <path>          Repo root (default: cwd)
    --format <text|json>        Output format (default: text)
    Show observability status.

  verify
    --repo-root <path>          Repo root (default: cwd)
    Verify observability configuration.

  add-metric
    --name <string>             Metric name (required)
    --type <counter|gauge|histogram|summary>  Metric type (required)
    --unit <string>             Unit (optional)
    --labels <csv>              Labels list (optional)
    --description <string>      Description (optional)
    --repo-root <path>          Repo root (default: cwd)
    Add a metric definition.

  list-metrics
    --repo-root <path>          Repo root (default: cwd)
    --format <text|json>        Output format (default: text)
    List defined metrics.

  add-log-field
    --name <string>             Field name (required)
    --type <string>             Field type (required)
    --required                  Mark field required (optional)
    --description <string>      Description (optional)
    --format <string>           Format hint (optional)
    --enum <csv>                Enum values (optional)
    --repo-root <path>          Repo root (default: cwd)
    Add a log schema field.

  list-log-fields
    --repo-root <path>          Repo root (default: cwd)
    --format <text|json>        Output format (default: text)
    List defined log fields.

  generate-instrumentation
    --lang <typescript>         Language (required)
    --repo-root <path>          Repo root (default: cwd)
    Generate instrumentation hints (prints to stdout).

Examples:
  node .ai/scripts/obsctl.js init
  node .ai/scripts/obsctl.js add-metric --name http_requests_total --type counter --unit requests
  node .ai/scripts/obsctl.js add-log-field --name correlation_id --type string
  node .ai/scripts/obsctl.js generate-instrumentation --lang typescript
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
// Files / Schema
// ============================================================================

const VALID_METRIC_TYPES = ['counter', 'gauge', 'histogram', 'summary'];

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

function writeFileIfMissing(filePath, content) {
  if (fs.existsSync(filePath)) return { op: 'skip', path: filePath, reason: 'exists' };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  return { op: 'write', path: filePath };
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    return { op: 'mkdir', path: dirPath };
  }
  return { op: 'skip', path: dirPath, reason: 'exists' };
}

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

function getLogsSchemaPath(repoRoot) {
  return path.join(getContextObsDir(repoRoot), 'logs-schema.json');
}

function getTracesConfigPath(repoRoot) {
  return path.join(getContextObsDir(repoRoot), 'traces-config.json');
}

function normalizeUpdatedAt(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (!obj.updatedAt && typeof obj.lastUpdated === 'string') obj.updatedAt = obj.lastUpdated;
  if (obj.lastUpdated) delete obj.lastUpdated;
  return obj;
}

function loadConfig(repoRoot) {
  const raw = normalizeUpdatedAt(readJson(getConfigPath(repoRoot))) || {};
  return {
    version: typeof raw.version === 'number' ? raw.version : 1,
    updatedAt: raw.updatedAt,
    metrics: typeof raw.metrics === 'boolean' ? raw.metrics : true,
    logs: typeof raw.logs === 'boolean' ? raw.logs : true,
    traces: typeof raw.traces === 'boolean' ? raw.traces : true,
    platform: raw.platform ?? null
  };
}

function saveConfig(repoRoot, config) {
  const next = {
    version: typeof config.version === 'number' ? config.version : 1,
    updatedAt: new Date().toISOString(),
    metrics: !!config.metrics,
    logs: !!config.logs,
    traces: !!config.traces,
    platform: config.platform ?? null
  };
  writeJson(getConfigPath(repoRoot), next);
  return next;
}

function loadMetrics(repoRoot) {
  const raw = normalizeUpdatedAt(readJson(getMetricsPath(repoRoot))) || {};
  const metrics = Array.isArray(raw.metrics) ? raw.metrics : [];
  return {
    version: typeof raw.version === 'number' ? raw.version : 1,
    updatedAt: raw.updatedAt,
    metrics: metrics.filter((m) => m && typeof m === 'object' && typeof m.name === 'string')
  };
}

function saveMetrics(repoRoot, data) {
  const next = {
    version: typeof data.version === 'number' ? data.version : 1,
    updatedAt: new Date().toISOString(),
    metrics: Array.isArray(data.metrics) ? data.metrics : []
  };
  writeJson(getMetricsPath(repoRoot), next);
  return next;
}

function loadLogsSchema(repoRoot) {
  const raw = normalizeUpdatedAt(readJson(getLogsSchemaPath(repoRoot))) || {};
  return {
    version: typeof raw.version === 'number' ? raw.version : 1,
    updatedAt: raw.updatedAt,
    format: typeof raw.format === 'string' ? raw.format : 'json',
    levels: Array.isArray(raw.levels) ? raw.levels : ['debug', 'info', 'warn', 'error'],
    fields: Array.isArray(raw.fields) ? raw.fields : []
  };
}

function saveLogsSchema(repoRoot, data) {
  const next = {
    version: typeof data.version === 'number' ? data.version : 1,
    updatedAt: new Date().toISOString(),
    format: typeof data.format === 'string' ? data.format : 'json',
    levels: Array.isArray(data.levels) ? data.levels : ['debug', 'info', 'warn', 'error'],
    fields: Array.isArray(data.fields) ? data.fields : []
  };
  writeJson(getLogsSchemaPath(repoRoot), next);
  return next;
}

function loadTracesConfig(repoRoot) {
  const raw = normalizeUpdatedAt(readJson(getTracesConfigPath(repoRoot))) || {};
  return {
    version: typeof raw.version === 'number' ? raw.version : 1,
    updatedAt: raw.updatedAt,
    sampling: raw.sampling || null,
    spanNaming: raw.spanNaming || null,
    requiredAttributes: Array.isArray(raw.requiredAttributes) ? raw.requiredAttributes : [],
    conventions: raw.conventions || null
  };
}

// ============================================================================
// Commands
// ============================================================================

function cmdInit(repoRoot, dryRun) {
  const actions = [];

  const obsDir = getObsDir(repoRoot);
  const contextDir = getContextObsDir(repoRoot);

  const dirs = [
    obsDir,
    path.join(obsDir, 'workdocs'),
    contextDir,
    path.join(repoRoot, 'docs', 'context')
  ];

  for (const dir of dirs) {
    if (dryRun) actions.push({ op: 'mkdir', path: dir, mode: 'dry-run' });
    else actions.push(ensureDir(dir));
  }

  const configPath = getConfigPath(repoRoot);
  if (dryRun) actions.push({ op: 'write', path: configPath, mode: 'dry-run' });
  else if (!fs.existsSync(configPath)) {
    saveConfig(repoRoot, { version: 1, metrics: true, logs: true, traces: true, platform: null });
    actions.push({ op: 'write', path: configPath });
  }

  const agentsPath = path.join(obsDir, 'AGENTS.md');
  const agentsContent = `# Observability - AI Guidance\n\n## Conclusions (read first)\n\n- Observability contracts are defined in \`docs/context/observability/\`.\n- Use \`obsctl.js\` to manage metrics, logs, and traces definitions.\n- AI proposes instrumentation; humans implement.\n\n## Workflow\n\n1. Review existing contracts\n2. Add metrics/log fields via obsctl\n3. Generate instrumentation hints\n4. Document in workdocs\n\n## Forbidden Actions\n\n- Logging sensitive data\n- High-cardinality metric labels\n`;
  if (dryRun) actions.push({ op: 'write', path: agentsPath, mode: 'dry-run' });
  else actions.push(writeFileIfMissing(agentsPath, agentsContent));

  const metricsPath = getMetricsPath(repoRoot);
  if (dryRun) actions.push({ op: 'write', path: metricsPath, mode: 'dry-run' });
  else if (!fs.existsSync(metricsPath)) {
    saveMetrics(repoRoot, { version: 1, metrics: [] });
    actions.push({ op: 'write', path: metricsPath });
  }

  const logsPath = getLogsSchemaPath(repoRoot);
  if (dryRun) actions.push({ op: 'write', path: logsPath, mode: 'dry-run' });
  else if (!fs.existsSync(logsPath)) {
    saveLogsSchema(repoRoot, {
      version: 1,
      format: 'json',
      levels: ['debug', 'info', 'warn', 'error'],
      fields: [
        {
          name: 'timestamp',
          type: 'string',
          format: 'iso8601',
          required: true,
          description: 'Log timestamp in ISO 8601 format'
        },
        { name: 'level', type: 'string', enum: ['debug', 'info', 'warn', 'error'], required: true, description: 'Log level' },
        { name: 'message', type: 'string', required: true, description: 'Log message' },
        { name: 'service', type: 'string', required: true, description: 'Service name' },
        { name: 'trace_id', type: 'string', required: false, description: 'Distributed tracing ID' }
      ]
    });
    actions.push({ op: 'write', path: logsPath });
  }

  const tracesPath = getTracesConfigPath(repoRoot);
  if (dryRun) actions.push({ op: 'write', path: tracesPath, mode: 'dry-run' });
  else if (!fs.existsSync(tracesPath)) {
    writeJson(tracesPath, {
      version: 1,
      updatedAt: new Date().toISOString(),
      sampling: { default: 0.1, errorRate: 1.0 },
      requiredAttributes: ['service.name', 'service.version', 'deployment.environment']
    });
    actions.push({ op: 'write', path: tracesPath });
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
  const logs = loadLogsSchema(repoRoot);

  const status = {
    initialized: fs.existsSync(getObsDir(repoRoot)),
    metricsEnabled: config.metrics,
    logsEnabled: config.logs,
    tracesEnabled: config.traces,
    metricsCount: metrics.metrics.length,
    logFieldsCount: logs.fields.length,
    updatedAt: config.updatedAt
  };

  if (format === 'json') {
    console.log(JSON.stringify(status, null, 2));
    return;
  }

  console.log('Observability Status:');
  console.log(`  Initialized: ${status.initialized ? 'yes' : 'no'}`);
  console.log(`  Metrics: ${status.metricsEnabled ? 'enabled' : 'disabled'} (${status.metricsCount})`);
  console.log(`  Logs: ${status.logsEnabled ? 'enabled' : 'disabled'} (${status.logFieldsCount} fields)`);
  console.log(`  Traces: ${status.tracesEnabled ? 'enabled' : 'disabled'}`);
  console.log(`  Updated: ${status.updatedAt || 'never'}`);
}

function cmdVerify(repoRoot) {
  const errors = [];
  const warnings = [];

  if (!fs.existsSync(getObsDir(repoRoot))) errors.push('observability/ not found. Run: obsctl init');
  if (!fs.existsSync(getContextObsDir(repoRoot))) warnings.push('docs/context/observability/ not found');

  if (!fs.existsSync(getConfigPath(repoRoot))) warnings.push('observability/config.json missing');
  if (!fs.existsSync(getMetricsPath(repoRoot))) warnings.push('metrics-registry.json missing');
  if (!fs.existsSync(getLogsSchemaPath(repoRoot))) warnings.push('logs-schema.json missing');
  if (!fs.existsSync(getTracesConfigPath(repoRoot))) warnings.push('traces-config.json missing');

  const metrics = loadMetrics(repoRoot);
  if (metrics.metrics.length === 0) warnings.push('No metrics defined');

  const logs = loadLogsSchema(repoRoot);
  if (logs.fields.length === 0) warnings.push('No log fields defined');

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

function cmdAddMetric(repoRoot, { name, type, unit, labels, description }) {
  if (!name) die('[error] --name is required');
  if (!type) die('[error] --type is required');
  const metricType = String(type).toLowerCase();
  if (!VALID_METRIC_TYPES.includes(metricType)) {
    die(`[error] --type must be one of: ${VALID_METRIC_TYPES.join(', ')}`);
  }

  const data = loadMetrics(repoRoot);
  if (!fs.existsSync(getMetricsPath(repoRoot))) die('[error] Metrics registry missing. Run: obsctl init');

  if (data.metrics.find((m) => m.name === name)) die(`[error] Metric "${name}" already exists`);

  const labelsList =
    typeof labels === 'string' && labels.trim() !== ''
      ? labels
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined;

  const metric = {
    name,
    type: metricType,
    description: description || '',
    ...(labelsList ? { labels: labelsList } : {}),
    ...(unit ? { unit } : {})
  };

  data.metrics.push(metric);
  saveMetrics(repoRoot, data);
  console.log(`[ok] Added metric: ${name} (${metricType})`);
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
    const unit = m.unit ? ` unit=${m.unit}` : '';
    console.log(`  [${m.type}] ${m.name}${unit}`);
    if (m.description) console.log(`    ${m.description}`);
  }
}

function cmdAddLogField(repoRoot, { name, type, required, description, format, enumCsv }) {
  if (!name) die('[error] --name is required');
  if (!type) die('[error] --type is required');

  const data = loadLogsSchema(repoRoot);
  if (!fs.existsSync(getLogsSchemaPath(repoRoot))) die('[error] Logs schema missing. Run: obsctl init');

  if (data.fields.find((f) => f && typeof f === 'object' && f.name === name)) {
    die(`[error] Log field "${name}" already exists`);
  }

  const field = {
    name,
    type,
    required: !!required,
    ...(description ? { description } : {}),
    ...(format ? { format } : {})
  };

  if (enumCsv && typeof enumCsv === 'string') {
    const values = enumCsv
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (values.length > 0) field.enum = values;
  }

  data.fields.push(field);
  saveLogsSchema(repoRoot, data);
  console.log(`[ok] Added log field: ${name} (${type})`);
}

function cmdListLogFields(repoRoot, format) {
  const logs = loadLogsSchema(repoRoot);

  if (format === 'json') {
    console.log(JSON.stringify(logs, null, 2));
    return;
  }

  console.log(`Log Fields (${logs.fields.length}):\n`);
  if (logs.fields.length === 0) {
    console.log('  (no log fields defined)');
    return;
  }

  for (const f of logs.fields) {
    const req = f.required ? ' required' : '';
    console.log(`  - ${f.name} (${f.type})${req}`);
    if (f.description) console.log(`    ${f.description}`);
  }
}

function cmdGenerateInstrumentation(repoRoot, { lang }) {
  const l = String(lang || '').toLowerCase();
  if (!l) die('[error] --lang is required');
  if (l !== 'typescript') die('[error] Only --lang typescript is supported in this template');

  const metrics = loadMetrics(repoRoot);
  const logs = loadLogsSchema(repoRoot);
  const traces = loadTracesConfig(repoRoot);

  const lines = [];
  lines.push('# Instrumentation Hints (TypeScript)');
  lines.push('');
  lines.push('This output is generated from observability contracts:');
  lines.push('- docs/context/observability/metrics-registry.json');
  lines.push('- docs/context/observability/logs-schema.json');
  lines.push('- docs/context/observability/traces-config.json');
  lines.push('');
  lines.push('## Metrics');
  lines.push('');
  if (metrics.metrics.length === 0) {
    lines.push('- (no metrics defined)');
  } else {
    for (const m of metrics.metrics) {
      const unit = m.unit ? ` [${m.unit}]` : '';
      lines.push(`- ${m.name} (${m.type})${unit}${m.description ? ` - ${m.description}` : ''}`);
    }
  }
  lines.push('');
  lines.push('Example (OpenTelemetry metrics):');
  lines.push('```ts');
  lines.push("import { metrics } from '@opentelemetry/api';");
  lines.push("const meter = metrics.getMeter('service-name');");
  lines.push("// const counter = meter.createCounter('http_requests_total');");
  lines.push('// counter.add(1, { method, path, status });');
  lines.push('```');
  lines.push('');
  lines.push('## Logs');
  lines.push('');
  lines.push('Recommended structured fields:');
  for (const f of logs.fields) lines.push(`- ${f.name}${f.required ? ' (required)' : ''}`);
  lines.push('');
  lines.push('Example (structured JSON log):');
  lines.push('```ts');
  lines.push('console.log(JSON.stringify({');
  lines.push("  timestamp: new Date().toISOString(),");
  lines.push("  level: 'info',");
  lines.push("  message: '...',");
  lines.push("  service: 'service-name',");
  lines.push("  trace_id: '...',");
  lines.push('}));');
  lines.push('```');
  lines.push('');
  lines.push('## Traces');
  lines.push('');
  if (traces.requiredAttributes.length > 0) {
    lines.push('Required resource/span attributes:');
    for (const a of traces.requiredAttributes) lines.push(`- ${a}`);
    lines.push('');
  }
  lines.push('Example (OpenTelemetry tracing):');
  lines.push('```ts');
  lines.push("import { trace } from '@opentelemetry/api';");
  lines.push("const tracer = trace.getTracer('service-name');");
  lines.push("await tracer.startActiveSpan('operation', async (span) => {");
  lines.push('  try {');
  lines.push('    // ...');
  lines.push('  } finally {');
  lines.push('    span.end();');
  lines.push('  }');
  lines.push('});');
  lines.push('```');

  console.log(lines.join('\n'));
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
    case 'status':
      cmdStatus(repoRoot, format);
      break;
    case 'verify':
      cmdVerify(repoRoot);
      break;
    case 'add-metric':
      cmdAddMetric(repoRoot, {
        name: opts.name,
        type: opts.type,
        unit: opts.unit,
        labels: opts.labels,
        description: opts.description
      });
      break;
    case 'list-metrics':
      cmdListMetrics(repoRoot, format);
      break;
    case 'add-log-field':
      cmdAddLogField(repoRoot, {
        name: opts.name,
        type: opts.type,
        required: !!opts.required,
        description: opts.description,
        format: opts.format,
        enumCsv: opts.enum
      });
      break;
    case 'list-log-fields':
      cmdListLogFields(repoRoot, format);
      break;
    case 'generate-instrumentation':
      cmdGenerateInstrumentation(repoRoot, { lang: opts.lang });
      break;
    default:
      console.error(`[error] Unknown command: ${command}`);
      usage(1);
  }
}

main();


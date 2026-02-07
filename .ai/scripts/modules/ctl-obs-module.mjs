#!/usr/bin/env node
/**
 * ctl-obs-module.mjs
 *
 * Module-level Observability slice validation + conflict detection.
 *
 * Reads:
 * - modules/<module_id>/MANIFEST.yaml (observability.metrics/logs owns/uses/requires)
 * - docs/context/observability/metrics-registry.json (Metrics contract)
 * - docs/context/observability/logs-schema.json (Logs contract)
 *
 * Does NOT change Observability SSOT; only validates module slices and can
 * export/sync per-module observability slices for LLM context.
 */

import path from 'node:path';

import { parseArgs, createUsage, die, isoNow, repoRootFromOpts } from '../lib/cli.mjs';
import { safeRel, fileExists, readJson } from '../lib/fs-utils.mjs';
import { loadYamlFile } from '../lib/yaml.mjs';
import { discoverModules, isValidModuleId } from '../lib/modular.mjs';
import { createSliceController } from '../lib/slice-controller.mjs';

// =============================================================================
// CLI
// =============================================================================

const usageText = `
Usage:
  node .ai/scripts/modules/ctl-obs-module.mjs <command> [options]

Options:
  --repo-root <path>          Repo root (default: cwd)
  --modules-dir <path>        Modules root (default: modules)
  --metrics-contract <path>   Metrics contract (default: docs/context/observability/metrics-registry.json)
  --logs-contract <path>      Logs contract (default: docs/context/observability/logs-schema.json)
  --format <text|json>        Output format (default: text)
  --strict                    Treat warnings as errors (verify)

Commands:
  status
    Summary of module observability declarations and contract presence.

  verify
    Validate module observability.metrics/logs against the contracts.

  conflicts
    Report ownership conflicts (same metric/log-field owned by multiple modules).

  export-slice
    --module-id <id>           Module id (required)
    --out <path>               Optional output file (default: stdout)
    Export a module-specific observability slice from the contracts.

  sync-slices
    --out-dir <path>           Optional base dir for outputs
    --module-id <id>           Optional (sync only one module)
    --no-registry              Do not update module interact/registry.json
    Generate slices and write them to module interact/ (or out-dir).
`;

const usage = createUsage(usageText);

// =============================================================================
// Observability-specific helpers
// =============================================================================

function normalizeObsEntries(raw, kind, moduleId, manifestPath) {
  const entries = [];
  const warnings = [];
  const errors = [];
  if (raw == null) return { entries, warnings, errors };
  if (!Array.isArray(raw)) {
    errors.push(`[${moduleId}] observability.${kind} must be a list in ${manifestPath}`);
    return { entries, warnings, errors };
  }
  for (const item of raw) {
    if (typeof item === 'string') {
      const key = item.trim();
      if (!key) {
        errors.push(`[${moduleId}] observability.${kind} entry missing name in ${manifestPath}`);
        continue;
      }
      entries.push({ moduleId, kind, key, raw: item });
      continue;
    }
    if (item && typeof item === 'object') {
      const key = String(item.name || item.key || '').trim();
      if (!key) {
        errors.push(`[${moduleId}] observability.${kind} entry missing name in ${manifestPath}`);
        continue;
      }
      entries.push({ moduleId, kind, key, raw: item });
      continue;
    }
    errors.push(`[${moduleId}] observability.${kind} entry must be string or object in ${manifestPath}`);
  }
  return { entries, warnings, errors };
}

function loadMetricsContract(repoRoot, contractPathOpt) {
  const contractPath = path.resolve(repoRoot, contractPathOpt || path.join('docs', 'context', 'observability', 'metrics-registry.json'));
  const contract = readJson(contractPath);
  return { contractPath, contract };
}

function loadLogsContract(repoRoot, contractPathOpt) {
  const contractPath = path.resolve(repoRoot, contractPathOpt || path.join('docs', 'context', 'observability', 'logs-schema.json'));
  const contract = readJson(contractPath);
  return { contractPath, contract };
}

function indexMetrics(contract) {
  const metrics = Array.isArray(contract?.metrics) ? contract.metrics : [];
  const index = new Map();
  for (const m of metrics) {
    const name = String(m?.name || '').trim();
    if (name) index.set(name, m);
  }
  return index;
}

function indexLogFields(contract) {
  const fields = Array.isArray(contract?.fields) ? contract.fields : [];
  const index = new Map();
  for (const f of fields) {
    const name = String(f?.name || '').trim();
    if (name) index.set(name, f);
  }
  return index;
}

// =============================================================================
// Slice controller
// =============================================================================

const controller = createSliceController({
  name: 'Observability',
  sliceFilename: 'observability-slice.json',
  tags: ['observability', 'slice'],
  cmdLabel: 'ctl-obs-module sync-slices',
  usesLabel: 'Uses/Requires',

  loadContract(repoRoot, opts) {
    const { contractPath: metricsPath, contract: metricsContract } = loadMetricsContract(repoRoot, opts['metrics-contract']);
    const { contractPath: logsPath, contract: logsContract } = loadLogsContract(repoRoot, opts['logs-contract']);
    return {
      metricsPath,
      metricsContract,
      logsPath,
      logsContract
    };
  },

  collectData(repoRoot, opts) {
    const warnings = [];
    const errors = [];
    const modules = [];

    const { contractPath: metricsPath, contract: metricsContract } = loadMetricsContract(repoRoot, opts['metrics-contract']);
    const { contractPath: logsPath, contract: logsContract } = loadLogsContract(repoRoot, opts['logs-contract']);

    if (!metricsContract || typeof metricsContract !== 'object') {
      errors.push(`Metrics contract not found or invalid: ${safeRel(repoRoot, metricsPath)}`);
    }
    if (!logsContract || typeof logsContract !== 'object') {
      errors.push(`Logs contract not found or invalid: ${safeRel(repoRoot, logsPath)}`);
    }

    const metricsIndex = indexMetrics(metricsContract || {});
    const logFieldsIndex = indexLogFields(logsContract || {});

    const manifests = discoverModules(repoRoot, opts['modules-dir']);
    for (const m of manifests) {
      let manifest;
      try {
        manifest = loadYamlFile(m.manifestPath);
      } catch (e) {
        errors.push(`Failed to parse YAML: ${safeRel(repoRoot, m.manifestPath)} (${e.message})`);
        continue;
      }

      const moduleId = manifest?.module_id || manifest?.moduleId || path.basename(m.dir);
      if (!isValidModuleId(moduleId)) {
        warnings.push(`Invalid module_id "${moduleId}" in ${safeRel(repoRoot, m.manifestPath)}`);
      }

      const obs = manifest?.observability || {};
      const metricsSection = obs.metrics || {};
      const logsSection = obs.logs || {};

      // Metrics owns/uses
      const metricsOwnsRes = normalizeObsEntries(metricsSection.owns, 'metrics.owns', moduleId, safeRel(repoRoot, m.manifestPath));
      const metricsUsesRes = normalizeObsEntries(metricsSection.uses, 'metrics.uses', moduleId, safeRel(repoRoot, m.manifestPath));
      warnings.push(...metricsOwnsRes.warnings, ...metricsUsesRes.warnings);
      errors.push(...metricsOwnsRes.errors, ...metricsUsesRes.errors);

      // Logs owns/requires
      const logsOwnsRes = normalizeObsEntries(logsSection.owns, 'logs.owns', moduleId, safeRel(repoRoot, m.manifestPath));
      const logsRequiresRes = normalizeObsEntries(logsSection.requires, 'logs.requires', moduleId, safeRel(repoRoot, m.manifestPath));
      warnings.push(...logsOwnsRes.warnings, ...logsRequiresRes.warnings);
      errors.push(...logsOwnsRes.errors, ...logsRequiresRes.errors);

      const metricsOwns = [];
      const metricsUses = [];
      const logsOwns = [];
      const logsRequires = [];

      // Validate metrics
      for (const entry of metricsOwnsRes.entries) {
        if (!metricsIndex.has(entry.key)) {
          errors.push(`[${moduleId}] metrics.owns not in contract: ${entry.key}`);
          continue;
        }
        metricsOwns.push({ key: entry.key });
      }
      for (const entry of metricsUsesRes.entries) {
        if (!metricsIndex.has(entry.key)) {
          errors.push(`[${moduleId}] metrics.uses not in contract: ${entry.key}`);
          continue;
        }
        metricsUses.push({ key: entry.key });
      }

      // Validate log fields
      for (const entry of logsOwnsRes.entries) {
        if (!logFieldsIndex.has(entry.key)) {
          errors.push(`[${moduleId}] logs.owns field not in contract: ${entry.key}`);
          continue;
        }
        logsOwns.push({ key: entry.key });
      }
      for (const entry of logsRequiresRes.entries) {
        if (!logFieldsIndex.has(entry.key)) {
          errors.push(`[${moduleId}] logs.requires field not in contract: ${entry.key}`);
          continue;
        }
        logsRequires.push({ key: entry.key });
      }

      modules.push({
        moduleId,
        manifestPath: safeRel(repoRoot, m.manifestPath),
        owns: [...metricsOwns, ...logsOwns],
        uses: [...metricsUses],
        requires: [...logsRequires],
        metrics: { owns: metricsOwns.map(e => e.key), uses: metricsUses.map(e => e.key) },
        logs: { owns: logsOwns.map(e => e.key), requires: logsRequires.map(e => e.key) }
      });
    }

    const metricsCount = metricsContract?.metrics?.length || 0;
    const logFieldsCount = logsContract?.fields?.length || 0;

    return {
      contract: {
        path: `${safeRel(repoRoot, metricsPath)}, ${safeRel(repoRoot, logsPath)}`,
        metricsPath: safeRel(repoRoot, metricsPath),
        logsPath: safeRel(repoRoot, logsPath),
        metrics: metricsCount,
        logFields: logFieldsCount
      },
      modules,
      warnings,
      errors,
      keyField: 'key',
      usageField: 'uses',
      // Store for slice building
      _metricsIndex: metricsIndex,
      _logFieldsIndex: logFieldsIndex,
      _metricsContract: metricsContract,
      _logsContract: logsContract,
      _metricsPath: metricsPath,
      _logsPath: logsPath
    };
  },

  buildSlice(report, moduleId, repoRoot, opts) {
    const module = report.modules.find((m) => m.moduleId === moduleId);
    if (!module) die(`[error] Module not found: ${moduleId}`);

    const { metricsPath, metricsContract } = loadMetricsContract(repoRoot, opts['metrics-contract']);
    const { logsPath, logsContract } = loadLogsContract(repoRoot, opts['logs-contract']);

    if (!metricsContract || typeof metricsContract !== 'object') die(`[error] Metrics contract not found: ${safeRel(repoRoot, metricsPath)}`);
    if (!logsContract || typeof logsContract !== 'object') die(`[error] Logs contract not found: ${safeRel(repoRoot, logsPath)}`);

    const metricsIndex = indexMetrics(metricsContract);
    const logFieldsIndex = indexLogFields(logsContract);

    // Build metrics slice
    const allMetricKeys = new Set([
      ...(module.metrics?.owns || []),
      ...(module.metrics?.uses || [])
    ]);
    const metricsSlice = [];
    for (const key of allMetricKeys) {
      const m = metricsIndex.get(key);
      if (m) metricsSlice.push(m);
    }

    // Build logs slice
    const allLogFieldKeys = new Set([
      ...(module.logs?.owns || []),
      ...(module.logs?.requires || [])
    ]);
    const logFieldsSlice = [];
    for (const key of allLogFieldKeys) {
      const f = logFieldsIndex.get(key);
      if (f) logFieldsSlice.push(f);
    }

    return {
      version: 1,
      moduleId,
      generatedAt: isoNow(),
      contract: {
        metrics: safeRel(repoRoot, metricsPath),
        logs: safeRel(repoRoot, logsPath)
      },
      metrics: {
        owns: module.metrics?.owns || [],
        uses: module.metrics?.uses || []
      },
      logs: {
        owns: module.logs?.owns || [],
        requires: module.logs?.requires || []
      },
      // Include full definitions for LLM context
      metricsDefinitions: metricsSlice,
      logFieldDefinitions: logFieldsSlice
    };
  }
});

// Override renderSliceSummary for observability-specific display
function cmdStatusCustom(repoRoot, opts) {
  const format = String(opts.format || 'text').toLowerCase();
  const data = controller.buildReport(repoRoot, opts);

  if (format === 'json') {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  let metricsOwnsCount = 0;
  let metricsUsesCount = 0;
  let logsOwnsCount = 0;
  let logsRequiresCount = 0;

  for (const m of data.modules) {
    metricsOwnsCount += m.metrics?.owns?.length || 0;
    metricsUsesCount += m.metrics?.uses?.length || 0;
    logsOwnsCount += m.logs?.owns?.length || 0;
    logsRequiresCount += m.logs?.requires?.length || 0;
  }

  console.log('Observability Module Status');
  console.log('');
  console.log(`  Metrics contract: ${data.contract?.metricsPath || 'N/A'}`);
  console.log(`  Logs contract:    ${data.contract?.logsPath || 'N/A'}`);
  console.log(`  Modules:          ${data.modules.length}`);
  console.log(`  Metrics (owns):   ${metricsOwnsCount}`);
  console.log(`  Metrics (uses):   ${metricsUsesCount}`);
  console.log(`  Logs (owns):      ${logsOwnsCount}`);
  console.log(`  Logs (requires):  ${logsRequiresCount}`);
  console.log(`  Conflicts:        ${data.ownership?.conflicts?.length || 0}`);
}

// =============================================================================
// Main
// =============================================================================

function main() {
  const { command, opts } = parseArgs(process.argv, { usageFn: usage });
  const repoRoot = repoRootFromOpts(opts);

  switch (command) {
    case 'help':
      usage(0);
      break;
    case 'status':
      cmdStatusCustom(repoRoot, opts);
      break;
    case 'verify':
      controller.cmdVerify(repoRoot, opts);
      break;
    case 'conflicts':
      controller.cmdConflicts(repoRoot, opts);
      break;
    case 'export-slice':
      controller.cmdExportSlice(repoRoot, opts);
      break;
    case 'sync-slices':
      controller.cmdSyncSlices(repoRoot, opts);
      break;
    default:
      usage(1);
  }
}

main();

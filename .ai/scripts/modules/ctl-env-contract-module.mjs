#!/usr/bin/env node
/**
 * ctl-env-contract-module.mjs
 *
 * Module-level env slice validation + conflict detection.
 *
 * Reads:
 * - modules/<module_id>/MANIFEST.yaml (env.owns / env.requires declarations)
 * - env/contract.yaml (repo-env-contract SSOT)
 *
 * Does NOT change SSOT; validates module slices and can export/sync
 * per-module env slices for LLM context.
 */

import path from 'node:path';

import { parseArgs, createUsage, die, isoNow, repoRootFromOpts } from '../lib/cli.mjs';
import { safeRel, fileExists } from '../lib/fs-utils.mjs';
import { loadYamlFile } from '../lib/yaml.mjs';
import { discoverModules, isValidModuleId } from '../lib/modular.mjs';
import { createSliceController } from '../lib/slice-controller.mjs';

// =============================================================================
// CLI
// =============================================================================

const usageText = `
Usage:
  node .ai/scripts/modules/ctl-env-contract-module.mjs <command> [options]

Options:
  --repo-root <path>          Repo root (default: cwd)
  --modules-dir <path>        Modules root (default: modules)
  --contract <path>           Env contract (default: env/contract.yaml)
  --format <text|json>        Output format (default: text)
  --strict                    Treat warnings as errors (verify)

Commands:
  status
    Summary of module env declarations and contract presence.

  verify
    Validate module env.owns/env.requires against the contract.

  conflicts
    Report ownership conflicts (same key owned by multiple modules).

  export-slice
    --module-id <id>           Module id (required)
    --out <path>               Optional output file (default: stdout)
    Export a module-specific env slice from the contract.

  sync-slices
    --out-dir <path>           Optional base dir for outputs
    --module-id <id>           Optional (sync only one module)
    --no-registry              Do not update module interact/registry.json
    Generate slices and write them to module interact/ (or out-dir).
`;

const usage = createUsage(usageText);

// =============================================================================
// Env-specific helpers
// =============================================================================

function normalizeEnvEntries(raw, kind, moduleId, manifestPath) {
  const entries = [];
  const warnings = [];
  const errors = [];
  if (raw == null) return { entries, warnings, errors };
  if (!Array.isArray(raw)) {
    errors.push(`[${moduleId}] env.${kind} must be a list in ${manifestPath}`);
    return { entries, warnings, errors };
  }
  for (const item of raw) {
    if (typeof item === 'string') {
      const key = item.trim();
      if (!key) {
        errors.push(`[${moduleId}] env.${kind} entry missing key in ${manifestPath}`);
        continue;
      }
      entries.push({ moduleId, kind, key, raw: item });
      continue;
    }
    if (item && typeof item === 'object') {
      const key = String(item.key || item.name || '').trim();
      if (!key) {
        errors.push(`[${moduleId}] env.${kind} entry missing key in ${manifestPath}`);
        continue;
      }
      entries.push({ moduleId, kind, key, raw: item });
      continue;
    }
    errors.push(`[${moduleId}] env.${kind} entry must be string or object in ${manifestPath}`);
  }
  return { entries, warnings, errors };
}

function loadEnvContract(repoRoot, contractPathOpt) {
  const contractPath = path.resolve(repoRoot, contractPathOpt || path.join('env', 'contract.yaml'));
  let contract = null;
  try {
    if (fileExists(contractPath)) {
      contract = loadYamlFile(contractPath);
    }
  } catch {
    contract = null;
  }
  return { contractPath, contract };
}

// =============================================================================
// Slice controller
// =============================================================================

const controller = createSliceController({
  name: 'Env',
  sliceFilename: 'env-slice.json',
  tags: ['env', 'slice'],
  cmdLabel: 'ctl-env-contract-module sync-slices',
  usesLabel: 'Requires',

  loadContract(repoRoot, opts) {
    return loadEnvContract(repoRoot, opts.contract);
  },

  collectData(repoRoot, opts) {
    const warnings = [];
    const errors = [];
    const modules = [];

    const { contractPath, contract } = loadEnvContract(repoRoot, opts.contract);
    const variables = contract?.variables && typeof contract.variables === 'object' ? contract.variables : null;
    if (!contract || !variables) {
      errors.push(`Env contract not found or invalid: ${safeRel(repoRoot, contractPath)}`);
    }

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

      const env = manifest?.env || {};
      const ownsRes = normalizeEnvEntries(env.owns, 'owns', moduleId, safeRel(repoRoot, m.manifestPath));
      const reqRes = normalizeEnvEntries(env.requires, 'requires', moduleId, safeRel(repoRoot, m.manifestPath));
      warnings.push(...ownsRes.warnings, ...reqRes.warnings);
      errors.push(...ownsRes.errors, ...reqRes.errors);

      const owns = [];
      const requires = [];

      for (const entry of ownsRes.entries) {
        if (variables && !variables[entry.key]) {
          errors.push(`[${moduleId}] env.owns key not in contract: ${entry.key}`);
          continue;
        }
        if (variables && variables[entry.key]?.deprecated) {
          warnings.push(`[${moduleId}] env.owns key is deprecated: ${entry.key}`);
        }
        owns.push({ key: entry.key });
      }

      for (const entry of reqRes.entries) {
        if (variables && !variables[entry.key]) {
          errors.push(`[${moduleId}] env.requires key not in contract: ${entry.key}`);
          continue;
        }
        if (variables && variables[entry.key]?.deprecated) {
          warnings.push(`[${moduleId}] env.requires key is deprecated: ${entry.key}`);
        }
        requires.push({ key: entry.key });
      }

      modules.push({
        moduleId,
        manifestPath: safeRel(repoRoot, m.manifestPath),
        owns,
        requires
      });
    }

    const varCount = variables ? Object.keys(variables).length : 0;

    return {
      contract: { path: safeRel(repoRoot, contractPath), version: contract?.version || null, variables: varCount },
      modules: modules.map((m) => ({
        moduleId: m.moduleId,
        manifestPath: m.manifestPath,
        owns: m.owns.map((e) => e.key),
        requires: m.requires.map((e) => e.key)
      })),
      warnings,
      errors,
      keyField: 'key',
      usageField: 'requires',
      // Store for slice building
      _contract: contract,
      _contractPath: contractPath
    };
  },

  buildSlice(report, moduleId, repoRoot, opts) {
    const module = report.modules.find((m) => m.moduleId === moduleId);
    if (!module) die(`[error] Module not found: ${moduleId}`);

    const { contractPath, contract } = loadEnvContract(repoRoot, opts.contract);
    if (!contract || !contract.variables) die(`[error] Env contract not found: ${safeRel(repoRoot, contractPath)}`);

    const variables = {};
    const keys = new Set([...module.owns, ...module.requires]);
    for (const key of keys) {
      if (contract.variables[key]) {
        variables[key] = contract.variables[key];
      }
    }

    return {
      version: 1,
      moduleId,
      generatedAt: isoNow(),
      source: {
        contract: safeRel(repoRoot, contractPath),
        version: contract.version || null
      },
      owns: module.owns,
      requires: module.requires,
      variables
    };
  }
});

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
      controller.cmdStatus(repoRoot, opts);
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

/**
 * Slice controller framework for module-level SSOT management
 *
 * Provides a generic framework for:
 * - Module slice validation (db, env, etc.)
 * - Ownership conflict detection
 * - Slice export and sync
 *
 * Usage:
 *   import { createSliceController, updateModuleRegistry } from './lib/slice-controller.mjs';
 */

import fs from 'node:fs';
import path from 'node:path';

import { isoNow } from './cli.mjs';
import { safeRel, readJson, writeJson, ensureDir } from './fs-utils.mjs';
import { discoverModules, isValidModuleId } from './modular.mjs';
import { loadYamlFile } from './yaml.mjs';

/**
 * Update a module's interact/registry.json with a new artifact entry.
 *
 * @param {string} repoRoot - Repository root
 * @param {string} moduleId - Module ID
 * @param {string} artifactId - Artifact identifier (e.g., 'db-slice', 'env-slice')
 * @param {string} artifactPath - Path to the artifact file
 * @param {string} cmdLabel - Command label for source tracking
 * @param {{ tags?: string[] }} opts - Options
 */
export function updateModuleRegistry(repoRoot, moduleId, artifactId, artifactPath, cmdLabel, opts = {}) {
  const registryPath = path.join(repoRoot, 'modules', moduleId, 'interact', 'registry.json');
  if (!fs.existsSync(registryPath)) {
    console.warn(`[warn] Module registry not found: ${safeRel(repoRoot, registryPath)}`);
    return;
  }

  const registry = readJson(registryPath);
  if (!registry || typeof registry !== 'object') {
    console.warn(`[warn] Failed to read module registry: ${safeRel(repoRoot, registryPath)}`);
    return;
  }

  if (!Array.isArray(registry.artifacts)) {
    registry.artifacts = [];
  }

  const relPath = safeRel(repoRoot, artifactPath);
  const now = isoNow();

  const entry = {
    artifactId,
    type: artifactId,
    path: relPath,
    mode: 'generated',
    format: 'json',
    tags: opts.tags || [],
    lastUpdated: now,
    source: {
      kind: 'command',
      command: cmdLabel,
      cwd: '.'
    }
  };

  const idx = registry.artifacts.findIndex(a => a && (a.artifactId === artifactId || a.id === artifactId));
  if (idx >= 0) {
    registry.artifacts[idx] = { ...registry.artifacts[idx], ...entry };
  } else {
    registry.artifacts.push(entry);
  }

  registry.updatedAt = now;
  writeJson(registryPath, registry);
}

/**
 * Compute ownership from module entries.
 *
 * @param {Array<{ moduleId: string, owns: Array<{ key: string }> }>} modules - Module data
 * @param {string} keyField - Field name for the key (e.g., 'key', 'tableKey')
 * @returns {{ ownersByKey: Map<string, Set<string>>, conflicts: Array<{ key: string, owners: string[] }> }}
 */
export function computeOwnership(modules, keyField = 'key') {
  const ownersByKey = new Map();

  for (const m of modules) {
    for (const entry of m.owns || []) {
      const key = entry[keyField] || entry.key;
      if (!key) continue;
      if (!ownersByKey.has(key)) ownersByKey.set(key, new Set());
      ownersByKey.get(key).add(m.moduleId);
    }
  }

  const conflicts = [];
  for (const [key, owners] of ownersByKey.entries()) {
    if (owners.size > 1) {
      conflicts.push({ key, owners: Array.from(owners).sort() });
    }
  }

  return { ownersByKey, conflicts };
}

/**
 * Find keys that are used but not owned by any module.
 *
 * @param {Array<{ moduleId: string, uses?: Array<{ key: string }>, requires?: Array<{ key: string }> }>} modules
 * @param {Map<string, Set<string>>} ownersByKey - Ownership map
 * @param {string} keyField - Field name for the key
 * @param {string} usageField - Field name for usage array ('uses' or 'requires')
 * @returns {string[]} Warning messages
 */
export function findUnownedUsage(modules, ownersByKey, keyField = 'key', usageField = 'uses') {
  const warnings = [];
  const usedKeys = new Set();

  for (const m of modules) {
    const usage = m[usageField] || [];
    for (const entry of usage) {
      const key = entry[keyField] || entry.key;
      if (key) usedKeys.add(key);
    }
  }

  for (const key of usedKeys) {
    if (!ownersByKey.has(key)) {
      warnings.push(`No module owns "${key}" (${usageField} by at least one module)`);
    }
  }

  return warnings;
}

/**
 * Resolve output path for a slice file.
 *
 * @param {string} repoRoot - Repository root
 * @param {string | undefined} outDirOpt - Optional output directory
 * @param {string} moduleId - Module ID
 * @param {string} filename - Output filename
 * @returns {string} Resolved output path
 */
export function resolveSliceOutPath(repoRoot, outDirOpt, moduleId, filename) {
  if (!outDirOpt) {
    return path.join(repoRoot, 'modules', moduleId, 'interact', filename);
  }
  const base = outDirOpt.includes('<module_id>')
    ? outDirOpt.replace(/<module_id>/g, moduleId)
    : path.join(outDirOpt, moduleId);
  return path.resolve(repoRoot, base, filename);
}

/**
 * Render a summary for slice controller status.
 *
 * @param {object} report - Report object
 * @param {{ name: string, ownsLabel?: string, usesLabel?: string }} opts - Display options
 */
export function renderSliceSummary(report, opts) {
  const { name, ownsLabel = 'Owns', usesLabel = 'Uses' } = opts;
  const ownsCount = report.modules.reduce((acc, m) => acc + (m.owns?.length || 0), 0);
  const usesCount = report.modules.reduce((acc, m) => acc + (m.uses?.length || m.requires?.length || 0), 0);

  console.log(`${name} Module Status`);
  console.log('');
  console.log(`  Contract: ${report.contract?.path || 'N/A'}`);
  console.log(`  Modules:  ${report.modules.length}`);
  console.log(`  ${ownsLabel}:     ${ownsCount}`);
  console.log(`  ${usesLabel}:     ${usesCount}`);
  console.log(`  Conflicts:${report.ownership?.conflicts?.length || 0}`);
}

/**
 * Render issues (errors and warnings).
 *
 * @param {{ errors?: string[], warnings?: string[] }} report - Report object
 */
export function renderSliceIssues(report) {
  if (report.errors?.length > 0) {
    console.error('Errors:');
    for (const e of report.errors) console.error(`  - ${e}`);
  }
  if (report.warnings?.length > 0) {
    console.warn('Warnings:');
    for (const w of report.warnings) console.warn(`  - ${w}`);
  }
}

/**
 * Determine if a report should cause a failure.
 *
 * @param {{ errors?: string[], warnings?: string[] }} report - Report object
 * @param {boolean} strict - Treat warnings as errors
 * @returns {boolean}
 */
export function shouldSliceFail(report, strict = false) {
  if (report.errors?.length > 0) return true;
  if (strict && report.warnings?.length > 0) return true;
  return false;
}

/**
 * Create a slice controller with standard commands.
 *
 * @param {object} config - Controller configuration
 * @param {string} config.name - Controller name (e.g., 'DB', 'Env')
 * @param {string} config.sliceFilename - Output filename for slices
 * @param {string[]} config.tags - Tags for registry entries
 * @param {string} config.cmdLabel - Command label for registry
 * @param {(repoRoot: string, opts: object) => object} config.loadContract - Contract loader
 * @param {(repoRoot: string, opts: object) => object} config.collectData - Data collector
 * @param {(report: object, moduleId: string, repoRoot: string, opts: object) => object} config.buildSlice - Slice builder
 * @returns {object} Controller with standard command handlers
 */
export function createSliceController(config) {
  const {
    name,
    sliceFilename,
    tags,
    cmdLabel,
    loadContract,
    collectData,
    buildSlice
  } = config;

  function buildReport(repoRoot, opts) {
    const data = collectData(repoRoot, opts);
    const { ownersByKey, conflicts } = computeOwnership(data.modules, data.keyField || 'key');

    const usageField = data.usageField || 'uses';
    const unownedWarnings = findUnownedUsage(data.modules, ownersByKey, data.keyField || 'key', usageField);

    const warnings = [...(data.warnings || []), ...unownedWarnings];
    const errors = [...(data.errors || [])];

    if (conflicts.length > 0) {
      for (const c of conflicts) {
        errors.push(`Ownership conflict for ${c.key}: ${c.owners.join(', ')}`);
      }
    }

    return {
      version: 1,
      generatedAt: isoNow(),
      contract: data.contract,
      modules: data.modules,
      ownership: { conflicts },
      errors,
      warnings
    };
  }

  return {
    buildReport,

    cmdStatus(repoRoot, opts) {
      const report = buildReport(repoRoot, opts);
      if (String(opts.format || 'text').toLowerCase() === 'json') {
        console.log(JSON.stringify(report, null, 2));
        return;
      }
      renderSliceSummary(report, { name, ownsLabel: 'Owns', usesLabel: config.usesLabel || 'Uses' });
    },

    cmdVerify(repoRoot, opts) {
      const report = buildReport(repoRoot, opts);
      const format = String(opts.format || 'text').toLowerCase();
      if (format === 'json') {
        console.log(JSON.stringify(report, null, 2));
      } else {
        renderSliceSummary(report, { name, ownsLabel: 'Owns', usesLabel: config.usesLabel || 'Uses' });
        renderSliceIssues(report);
      }
      if (shouldSliceFail(report, !!opts.strict)) process.exit(1);
    },

    cmdConflicts(repoRoot, opts) {
      const report = buildReport(repoRoot, opts);
      const format = String(opts.format || 'text').toLowerCase();
      if (format === 'json') {
        console.log(JSON.stringify(report.ownership.conflicts, null, 2));
      } else if (report.ownership.conflicts.length === 0) {
        console.log('No ownership conflicts detected.');
      } else {
        console.log('Ownership conflicts:');
        for (const c of report.ownership.conflicts) {
          console.log(`  - ${c.key}: ${c.owners.join(', ')}`);
        }
      }
      if (report.ownership.conflicts.length > 0) process.exit(1);
    },

    cmdExportSlice(repoRoot, opts) {
      const moduleId = opts['module-id'];
      if (!moduleId) {
        console.error('[error] --module-id is required');
        process.exit(1);
      }
      const report = buildReport(repoRoot, opts);
      const slice = buildSlice(report, moduleId, repoRoot, opts);
      const out = opts.out;
      if (out) {
        const abs = path.resolve(repoRoot, out);
        writeJson(abs, slice);
        console.log(`[ok] Wrote slice: ${safeRel(repoRoot, abs)}`);
        return;
      }
      console.log(JSON.stringify(slice, null, 2));
    },

    cmdSyncSlices(repoRoot, opts) {
      const report = buildReport(repoRoot, opts);
      const moduleIdFilter = opts['module-id'];
      const outDir = opts['out-dir'];
      const noRegistry = !!opts['no-registry'];

      const targets = moduleIdFilter
        ? report.modules.filter(m => m.moduleId === moduleIdFilter)
        : report.modules;

      if (targets.length === 0) {
        console.error('[error] No matching modules found.');
        process.exit(1);
      }

      for (const m of targets) {
        const slice = buildSlice(report, m.moduleId, repoRoot, opts);
        const outPath = resolveSliceOutPath(repoRoot, outDir, m.moduleId, sliceFilename);
        writeJson(outPath, slice);
        console.log(`[ok] ${m.moduleId}: ${safeRel(repoRoot, outPath)}`);
        if (!noRegistry) {
          updateModuleRegistry(repoRoot, m.moduleId, sliceFilename.replace('.json', ''), outPath, cmdLabel, { tags });
        }
      }
    }
  };
}

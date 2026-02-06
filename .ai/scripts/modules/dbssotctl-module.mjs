#!/usr/bin/env node
/**
 * dbssotctl-module.mjs
 *
 * Module-level DB slice validation + conflict detection.
 *
 * Reads:
 * - modules/<module_id>/MANIFEST.yaml (db.owns / db.uses declarations)
 * - docs/context/db/schema.json (DB contract; produced by ctl-db-ssot)
 *
 * Does NOT change DB SSOT; only validates module slices and can export/sync
 * per-module slices for LLM context.
 */

import fs from 'node:fs';
import path from 'node:path';

import { parseArgs, createUsage, die, isoNow, repoRootFromOpts } from '../lib/cli.mjs';
import { safeRel, readJson } from '../lib/fs-utils.mjs';
import { loadYamlFile } from '../lib/yaml.mjs';
import { discoverModules, isValidModuleId } from '../lib/modular.mjs';
import { createSliceController } from '../lib/slice-controller.mjs';

// =============================================================================
// CLI
// =============================================================================

const usageText = `
Usage:
  node .ai/scripts/modules/dbssotctl-module.mjs <command> [options]

Options:
  --repo-root <path>          Repo root (default: cwd)
  --modules-dir <path>        Modules root (default: modules)
  --db-contract <path>        DB contract (default: docs/context/db/schema.json)
  --format <text|json>        Output format (default: text)
  --strict                    Treat warnings as errors (verify)

Commands:
  status
    Summary of module DB declarations and contract presence.

  verify
    Validate module db.owns/db.uses against the DB contract.

  conflicts
    Report ownership conflicts (same table owned by multiple modules).

  export-slice
    --module-id <id>           Module id (required)
    --out <path>               Optional output file (default: stdout)
    Export a module-specific DB slice from the contract.

  sync-slices
    --out-dir <path>           Optional base dir for outputs
    --module-id <id>           Optional (sync only one module)
    --no-registry              Do not update module interact/registry.json
    Generate slices and write them to module interact/ (or out-dir).
`;

const usage = createUsage(usageText);

// =============================================================================
// DB-specific helpers
// =============================================================================

function parseTableRef(rawTable, rawSchema) {
  let schema = rawSchema ? String(rawSchema).trim() : null;
  let table = rawTable ? String(rawTable).trim() : '';
  if (!schema && table.includes('.')) {
    const [s, t] = table.split('.', 2);
    schema = s || null;
    table = t || '';
  }
  return { schema, table };
}

function normalizeColumns(raw, errors, label) {
  if (raw == null) return null;
  if (Array.isArray(raw)) {
    const cols = raw.filter((c) => typeof c === 'string' && c.trim().length > 0);
    return cols.length > 0 ? cols : null;
  }
  if (typeof raw === 'string') {
    const s = raw.trim();
    if (!s || s === '*') return null;
    const parts = s.split(',').map((p) => p.trim()).filter(Boolean);
    return parts.length > 0 ? parts : null;
  }
  errors.push(`${label} columns must be a list or string`);
  return null;
}

function normalizeDbEntries(raw, kind, moduleId, manifestPath) {
  const entries = [];
  const warnings = [];
  const errors = [];
  if (raw == null) return { entries, warnings, errors };
  if (!Array.isArray(raw)) {
    errors.push(`[${moduleId}] db.${kind} must be a list in ${manifestPath}`);
    return { entries, warnings, errors };
  }
  for (const item of raw) {
    if (typeof item === 'string') {
      const ref = parseTableRef(item, null);
      if (!ref.table) {
        errors.push(`[${moduleId}] db.${kind} entry missing table name in ${manifestPath}`);
        continue;
      }
      entries.push({
        moduleId,
        kind,
        table: ref.table,
        schema: ref.schema,
        columns: null,
        raw: item
      });
      continue;
    }
    if (item && typeof item === 'object') {
      const tableRaw = item.table || item.name || '';
      const ref = parseTableRef(tableRaw, item.schema || null);
      if (!ref.table) {
        errors.push(`[${moduleId}] db.${kind} entry missing table name in ${manifestPath}`);
        continue;
      }
      const cols = normalizeColumns(item.columns, errors, `[${moduleId}] db.${kind}.${ref.table}`);
      entries.push({
        moduleId,
        kind,
        table: ref.table,
        schema: ref.schema,
        columns: cols,
        raw: item
      });
      continue;
    }
    errors.push(`[${moduleId}] db.${kind} entry must be string or object in ${manifestPath}`);
  }
  return { entries, warnings, errors };
}

function loadDbContract(repoRoot, contractPathOpt) {
  const contractPath = path.resolve(repoRoot, contractPathOpt || path.join('docs', 'context', 'db', 'schema.json'));
  const contract = readJson(contractPath);
  return { contractPath, contract };
}

function indexContractTables(contract) {
  const tables = Array.isArray(contract?.tables) ? contract.tables : [];
  const tableIndex = new Map();
  const nameIndex = new Map();
  for (const t of tables) {
    const name = String(t?.name || '').trim();
    if (!name) continue;
    const schema = t?.schema ? String(t.schema).trim() : null;
    const key = schema ? `${schema}.${name}` : name;
    tableIndex.set(key, t);
    if (!nameIndex.has(name)) nameIndex.set(name, []);
    nameIndex.get(name).push({ key, table: t });
  }
  return { tableIndex, nameIndex };
}

function resolveTable(entry, tableIndex, nameIndex, errors) {
  if (entry.schema) {
    const key = `${entry.schema}.${entry.table}`;
    const table = tableIndex.get(key);
    if (!table) {
      errors.push(`[${entry.moduleId}] ${entry.kind} table not found: ${key}`);
      return null;
    }
    return { key, table };
  }

  const matches = nameIndex.get(entry.table) || [];
  if (matches.length === 0) {
    errors.push(`[${entry.moduleId}] ${entry.kind} table not found: ${entry.table}`);
    return null;
  }
  if (matches.length > 1) {
    const schemas = matches.map((m) => m.table?.schema || 'default').join(', ');
    errors.push(`[${entry.moduleId}] ${entry.kind} table "${entry.table}" is ambiguous across schemas (${schemas}); specify schema`);
    return null;
  }
  return { key: matches[0].key, table: matches[0].table };
}

function validateColumns(entry, table, errors) {
  if (!entry.columns || entry.columns.length === 0) return;
  const colNames = new Set((table.columns || []).map((c) => String(c?.name || '').trim()).filter(Boolean));
  for (const c of entry.columns) {
    if (!colNames.has(c)) {
      errors.push(`[${entry.moduleId}] ${entry.kind} column not found: ${entry.table}.${c}`);
    }
  }
}

// =============================================================================
// Slice controller
// =============================================================================

const controller = createSliceController({
  name: 'DB',
  sliceFilename: 'db-slice.json',
  tags: ['db', 'slice'],
  cmdLabel: 'dbssotctl-module sync-slices',
  usesLabel: 'Uses',

  loadContract(repoRoot, opts) {
    return loadDbContract(repoRoot, opts['db-contract']);
  },

  collectData(repoRoot, opts) {
    const warnings = [];
    const errors = [];
    const modules = [];

    const { contractPath, contract } = loadDbContract(repoRoot, opts['db-contract']);
    if (!contract || typeof contract !== 'object') {
      errors.push(`DB contract not found or invalid: ${safeRel(repoRoot, contractPath)}`);
    }

    const { tableIndex, nameIndex } = indexContractTables(contract || {});

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

      const db = manifest?.db || {};
      const ownsRes = normalizeDbEntries(db.owns, 'owns', moduleId, safeRel(repoRoot, m.manifestPath));
      const usesRes = normalizeDbEntries(db.uses, 'uses', moduleId, safeRel(repoRoot, m.manifestPath));
      warnings.push(...ownsRes.warnings, ...usesRes.warnings);
      errors.push(...ownsRes.errors, ...usesRes.errors);

      const owns = [];
      const uses = [];

      for (const entry of ownsRes.entries) {
        const resolved = resolveTable(entry, tableIndex, nameIndex, errors);
        if (!resolved) continue;
        validateColumns(entry, resolved.table, errors);
        owns.push({
          key: resolved.key,
          table: resolved.key,
          columns: entry.columns || null,
          resolvedTable: resolved.table
        });
      }
      for (const entry of usesRes.entries) {
        const resolved = resolveTable(entry, tableIndex, nameIndex, errors);
        if (!resolved) continue;
        validateColumns(entry, resolved.table, errors);
        uses.push({
          key: resolved.key,
          table: resolved.key,
          columns: entry.columns || null,
          resolvedTable: resolved.table
        });
      }

      modules.push({
        moduleId,
        manifestPath: safeRel(repoRoot, m.manifestPath),
        owns,
        uses
      });
    }

    const contractMode = contract?.ssot?.mode || 'unknown';
    const tableCount = Array.isArray(contract?.tables) ? contract.tables.length : 0;

    return {
      contract: { path: safeRel(repoRoot, contractPath), mode: contractMode, tables: tableCount },
      modules: modules.map((m) => ({
        moduleId: m.moduleId,
        manifestPath: m.manifestPath,
        owns: m.owns,
        uses: m.uses
      })),
      warnings,
      errors,
      keyField: 'key',
      usageField: 'uses',
      // Store for slice building
      _tableIndex: tableIndex,
      _nameIndex: nameIndex,
      _contract: contract,
      _contractPath: contractPath
    };
  },

  buildSlice(report, moduleId, repoRoot, opts) {
    const module = report.modules.find((m) => m.moduleId === moduleId);
    if (!module) die(`[error] Module not found: ${moduleId}`);

    const { contractPath, contract } = loadDbContract(repoRoot, opts['db-contract']);
    if (!contract || typeof contract !== 'object') die(`[error] DB contract not found: ${safeRel(repoRoot, contractPath)}`);

    const { tableIndex, nameIndex } = indexContractTables(contract);

    const entryList = [
      ...module.owns.map((e) => ({ ...e, kind: 'owns' })),
      ...module.uses.map((e) => ({ ...e, kind: 'uses' }))
    ];
    const byTable = new Map();

    for (const entry of entryList) {
      const ref = parseTableRef(entry.table, null);
      const resolved = resolveTable(
        { moduleId, kind: entry.kind, table: ref.table, schema: ref.schema, columns: entry.columns || null },
        tableIndex,
        nameIndex,
        []
      );
      if (!resolved) continue;
      const key = resolved.key;
      if (!byTable.has(key)) byTable.set(key, { table: resolved.table, all: false, columns: new Set() });
      const slot = byTable.get(key);
      if (!entry.columns || entry.columns.length === 0) {
        slot.all = true;
      } else {
        for (const c of entry.columns) slot.columns.add(c);
      }
    }

    const tables = [];
    for (const [key, data] of byTable.entries()) {
      const cols = Array.isArray(data.table.columns) ? data.table.columns : [];
      const columns = data.all
        ? cols
        : cols.filter((c) => data.columns.has(String(c?.name || '').trim()));
      tables.push({
        name: data.table.name,
        schema: data.table.schema || null,
        dbName: data.table.dbName || null,
        columns
      });
    }

    return {
      version: 1,
      moduleId,
      generatedAt: isoNow(),
      source: {
        contract: safeRel(repoRoot, contractPath),
        ssotMode: contract?.ssot?.mode || 'unknown'
      },
      owns: module.owns,
      uses: module.uses,
      tables
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

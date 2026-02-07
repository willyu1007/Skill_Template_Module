#!/usr/bin/env node
/**
 * ctl-flow.mjs
 *
 * Flow SSOT + derived implementation index + graphs.
 *
 * SSOT (manual, validated):
 * - .system/modular/flow_graph.yaml
 * - .system/modular/flow_bindings.yaml
 * - .system/modular/type_graph.yaml (optional)
 *
 * Derived (overwritable):
 * - .system/modular/flow_impl_index.yaml
 * - .system/modular/graphs/*.mmd
 */

import fs from 'node:fs';
import path from 'node:path';

import { parseArgs, createUsage, die, isoNow, repoRootFromOpts, printDiagnostics } from '../lib/cli.mjs';
import { ensureDir, safeRel, fileExists, writeJson } from '../lib/fs-utils.mjs';
import { loadYamlFile, saveYamlFile, dumpYaml } from '../lib/yaml.mjs';
import {
  getModularEnv,
  normalizeBindingsDoc,
  normalizeFlowImplIndex,
  normalizeImplementsEntry,
  resolveBindingEndpoint,
  normalizeFlowGraph,
  validateFlowGraph,
  normalizeTypeGraph,
  validateTypeGraph,
  isValidKebabId,
  normalizeParticipatesInEntry
} from '../lib/modular.mjs';

// =============================================================================
// CLI
// =============================================================================

const usageText = `
Usage:
  node .ai/scripts/modules/ctl-flow.mjs <command> [options]

Options:
  --repo-root <path>          Repo root (default: cwd)

Commands:
  init
    Ensure the modular SSOT skeleton exists.

  update-from-manifests
    --flow-graph <path>        Default: .system/modular/flow_graph.yaml
    --flow-bindings <path>     Default: .system/modular/flow_bindings.yaml
    --instance-registry <path> Default: .system/modular/instance_registry.yaml
    --out <path>               Default: .system/modular/flow_impl_index.yaml
    Build the flow implementation index (DERIVED) from the instance registry.

  lint
    --flow-graph <path>        Default: .system/modular/flow_graph.yaml
    --flow-bindings <path>     Default: .system/modular/flow_bindings.yaml
    --type-graph <path>        Default: .system/modular/type_graph.yaml
    --instance-registry <path> Default: .system/modular/instance_registry.yaml
    --flow-impl-index <path>   Default: .system/modular/flow_impl_index.yaml
    --strict                   Fail on warnings
    Validate flow_graph/bindings + derived index.

  graph
    --flow-graph <path>        Default: .system/modular/flow_graph.yaml
    --flow-bindings <path>     Default: .system/modular/flow_bindings.yaml
    --flow-impl-index <path>   Default: .system/modular/flow_impl_index.yaml
    --format <mermaid>         Default: mermaid
    Render graphs into .system/modular/graphs/

Notes:
  - The tools operate on a minimal YAML subset; keep SSOT files simple.
`;

const usage = createUsage(usageText);

// =============================================================================
// Helpers
// =============================================================================

function readYamlOrDie(absPath, label) {
  if (!fileExists(absPath)) die(`[error] Missing ${label}: ${absPath}`);
  try {
    return loadYamlFile(absPath);
  } catch (e) {
    die(`[error] Failed to parse ${label}: ${absPath} (${e.message})`);
  }
}

function loadInstanceRegistry(absPath) {
  if (!fileExists(absPath)) {
    return { version: 1, updatedAt: isoNow(), modules: [] };
  }
  return loadYamlFile(absPath);
}

function readBindings(repoRoot, opts) {
  const bindingsPath = path.join(repoRoot, opts['flow-bindings'] || '.system/modular/flow_bindings.yaml');
  if (!fileExists(bindingsPath)) return { bindings: [] };
  return loadYamlFile(bindingsPath);
}

function normalizeBindings(raw) {
  return normalizeBindingsDoc(raw);
}

// =============================================================================
// Build flow implementation index
// =============================================================================

function buildFlowImplIndex(flowGraph, instanceRegistry) {
  const { flows, warnings: fgWarn, errors: fgErr } = validateFlowGraph(flowGraph);
  const warnings = [...fgWarn];
  const errors = [...fgErr];

  // Build a map for fast node existence checks
  const nodeMap = new Map(); // flowId -> Set(nodeId)
  for (const f of flows) {
    nodeMap.set(f.id, new Set(f.nodes.map(n => n.id).filter(Boolean)));
  }

  // Gather implementations by flow_id/node_id
  const implMap = new Map(); // key: `${flow_id}::${node_id}` -> Map(endpoint_id -> entry with variants Set)
  const modules = Array.isArray(instanceRegistry.modules) ? instanceRegistry.modules : [];

  for (const m of modules) {
    const moduleId = m.module_id ?? m.moduleId;
    if (!moduleId) continue;
    const ifaces = Array.isArray(m.interfaces) ? m.interfaces : [];
    for (const it of ifaces) {
      const ifaceId = it.id;
      const endpointId = `${moduleId}:${ifaceId}`;
      const impls = Array.isArray(it.implements) ? it.implements : [];
      for (const imp of impls) {
        if (!imp || typeof imp !== 'object') continue;

        const norm = normalizeImplementsEntry(imp);
        const flowId = norm.flow_id;
        const nodeId = norm.node_id;
        const variant = norm.variant ?? 'default';

        if (!flowId || !nodeId) {
          warnings.push(`[${endpointId}] implements entry missing flow_id/node_id`);
          continue;
        }
        const nodeSet = nodeMap.get(flowId);
        if (!nodeSet) {
          errors.push(`[${endpointId}] implements unknown flow: ${flowId}`);
          continue;
        }
        if (!nodeSet.has(nodeId)) {
          errors.push(`[${endpointId}] implements unknown node: ${flowId}.${nodeId}`);
          continue;
        }

        const key = `${flowId}::${nodeId}`;
        if (!implMap.has(key)) implMap.set(key, new Map());
        const byEndpoint = implMap.get(key);
        if (!byEndpoint.has(endpointId)) {
          byEndpoint.set(endpointId, {
            endpoint_id: endpointId,
            module_id: moduleId,
            interface_id: ifaceId,
            protocol: it.protocol ?? null,
            status: it.status ?? null,
            role: norm.role ?? null,
            variants: new Set()
          });
        }
        const entry = byEndpoint.get(endpointId);
        if (variant) entry.variants.add(variant);
        if (!entry.role && norm.role) entry.role = norm.role;
      }
    }
  }

  // Deterministic ordering
  const nodes = [];
  const flowIds = flows.map(f => f.id).filter(Boolean).sort();
  for (const flowId of flowIds) {
    const f = flows.find(x => x.id === flowId);
    const nodeIds = (f?.nodes || []).map(n => n.id).filter(Boolean).sort();
    for (const nodeId of nodeIds) {
      const key = `${flowId}::${nodeId}`;
      const byEndpoint = implMap.get(key) || new Map();
      const impls = Array.from(byEndpoint.values()).map((it) => ({
        endpoint_id: it.endpoint_id,
        module_id: it.module_id,
        interface_id: it.interface_id,
        protocol: it.protocol,
        status: it.status,
        role: it.role ?? null,
        variants: Array.from(it.variants || []).sort()
      }));
      impls.sort((a, b) => (a.endpoint_id || '').localeCompare(b.endpoint_id || ''));
      nodes.push({
        flow_id: flowId,
        node_id: nodeId,
        implementations: impls
      });
      const nodeDef = (f?.nodes || []).find(n => n.id === nodeId);
      const status = nodeDef?.status ?? null;
      if ((status === 'active' || status === 'stable') && impls.length === 0) {
        warnings.push(`[${flowId}.${nodeId}] active node has no implementations`);
      }
    }
  }

  return {
    flowImplIndex: {
      version: 1,
      updatedAt: isoNow(),
      nodes
    },
    warnings,
    errors
  };
}

// =============================================================================
// Primary implementation selection
// =============================================================================

function pickPrimaryImplementation(flowImplIndex, bindingsRaw) {
  const env = getModularEnv();
  const bindings = normalizeBindings(bindingsRaw);
  const byKey = new Map();
  for (const b of bindings) {
    if (!b.flow_id || !b.node_id) continue;
    byKey.set(`${b.flow_id}::${b.node_id}`, b);
  }
  const primary = new Map(); // key -> endpoint_id

  for (const entry of normalizeFlowImplIndex(flowImplIndex)) {
    const key = `${entry.flow_id}::${entry.node_id}`;
    const impls = Array.isArray(entry.implementations) ? entry.implementations : [];
    if (impls.length === 0) continue;

    const binding = byKey.get(key);
    if (binding) {
      const desired = resolveBindingEndpoint(binding, env);
      const found = desired ? impls.find(i => i.endpoint_id === desired) : null;
      if (found) primary.set(key, desired);
      else primary.set(key, impls[0].endpoint_id);
    } else {
      primary.set(key, impls[0].endpoint_id);
    }
  }

  return { primary, bindings };
}

// =============================================================================
// Graph rendering
// =============================================================================

function writeMermaidGraphs(repoRoot, flowGraph, flowImplIndex, bindingsRaw) {
  const graphsDir = path.join(repoRoot, '.system', 'modular', 'graphs');
  ensureDir(graphsDir);

  const flows = normalizeFlowGraph(flowGraph);
  const { primary } = pickPrimaryImplementation(flowImplIndex, bindingsRaw);

  // Flow graph rendering
  const flowLines = [];
  flowLines.push('%% Auto-generated by ctl-flow.mjs');
  flowLines.push('%% (Do not edit manually)');
  for (const f of flows) {
    if (!f.id) continue;
    flowLines.push('');
    flowLines.push(`subgraph ${f.id}`);
    const nodeIds = new Set((f.nodes || []).map(n => n.id).filter(Boolean));
    for (const n of f.nodes || []) {
      if (!n.id) continue;
      const label = (n.title || n.description || n.name || n.id).replaceAll('"', '\\"');
      flowLines.push(`  ${f.id}_${n.id}["${label}"]`);
    }
    for (const e of f.edges || []) {
      if (!e.from || !e.to) continue;
      if (!nodeIds.has(e.from) || !nodeIds.has(e.to)) continue;
      flowLines.push(`  ${f.id}_${e.from} --> ${f.id}_${e.to}`);
    }
    flowLines.push('end');
  }
  const flowMmd = ['graph TD', ...flowLines].join('\n') + '\n';
  fs.writeFileSync(path.join(graphsDir, 'flows.mmd'), flowMmd, 'utf8');

  // Module relationship graph (primary impl)
  const moduleEdges = new Map(); // key from->to
  const moduleNodes = new Set();

  // Build lookup endpoint_id -> module_id
  const endpointToModule = new Map();
  for (const entry of normalizeFlowImplIndex(flowImplIndex)) {
    for (const impl of entry.implementations || []) {
      endpointToModule.set(impl.endpoint_id, impl.module_id);
    }
  }

  for (const f of flows) {
    const nodeIds = new Set((f.nodes || []).map(n => n.id).filter(Boolean));
    for (const e of f.edges || []) {
      if (!e.from || !e.to) continue;
      if (!nodeIds.has(e.from) || !nodeIds.has(e.to)) continue;

      const fromKey = `${f.id}::${e.from}`;
      const toKey = `${f.id}::${e.to}`;
      const fromEp = primary.get(fromKey);
      const toEp = primary.get(toKey);
      const fromMod = fromEp ? endpointToModule.get(fromEp) : null;
      const toMod = toEp ? endpointToModule.get(toEp) : null;
      if (!fromMod || !toMod) continue;
      moduleNodes.add(fromMod);
      moduleNodes.add(toMod);
      const key = `${fromMod}::${toMod}`;
      moduleEdges.set(key, { from: fromMod, to: toMod });
    }
  }

  const modLines = [];
  modLines.push('%% Auto-generated by ctl-flow.mjs');
  modLines.push('%% (Primary impl selection uses flow_bindings.yaml when present)');
  for (const m of Array.from(moduleNodes).sort()) {
    const safe = m.replaceAll('.', '_').replaceAll('-', '_');
    modLines.push(`  ${safe}["${m}"]`);
  }
  for (const e of Array.from(moduleEdges.values()).sort((a, b) => (`${a.from}::${a.to}`).localeCompare(`${b.from}::${b.to}`))) {
    const fromSafe = e.from.replaceAll('.', '_').replaceAll('-', '_');
    const toSafe = e.to.replaceAll('.', '_').replaceAll('-', '_');
    modLines.push(`  ${fromSafe} --> ${toSafe}`);
  }
  const modMmd = ['graph TD', ...modLines].join('\n') + '\n';
  fs.writeFileSync(path.join(graphsDir, 'modules.mmd'), modMmd, 'utf8');

  return {
    flowGraphPath: safeRel(repoRoot, path.join(graphsDir, 'flows.mmd')),
    modulesGraphPath: safeRel(repoRoot, path.join(graphsDir, 'modules.mmd'))
  };
}

// =============================================================================
// Commands
// =============================================================================

function cmdInit(repoRoot) {
  const base = path.join(repoRoot, '.system', 'modular');
  ensureDir(base);
  ensureDir(path.join(base, 'schemas'));
  ensureDir(path.join(base, 'reports'));
  ensureDir(path.join(base, 'graphs'));

  const ensureFile = (relPath, content) => {
    const abs = path.join(repoRoot, relPath);
    if (!fileExists(abs)) {
      ensureDir(path.dirname(abs));
      fs.writeFileSync(abs, content, 'utf8');
      console.log(`[ok] created ${relPath}`);
    }
  };

  ensureFile('.system/modular/flow_graph.yaml', '# SSOT: Business flow graph\n\nflows: []\n');
  ensureFile('.system/modular/flow_bindings.yaml', '# Manual bindings for multi-implementation nodes\n\nbindings: []\n');
  ensureFile('.system/modular/type_graph.yaml', '# Optional: module-type compatibility rules\n\ntypes: []\n');
  ensureFile('.system/modular/instance_registry.yaml', '# Derived: module instance registry\n\nversion: 1\nupdatedAt: "1970-01-01T00:00:00Z"\nmodules: []\n');
  ensureFile('.system/modular/flow_impl_index.yaml', '# Derived: flow implementation index\n\nversion: 1\nupdatedAt: "1970-01-01T00:00:00Z"\nnodes: []\n');
}

function cmdUpdateFromManifests(repoRoot, opts) {
  const flowGraphPath = path.join(repoRoot, opts['flow-graph'] || '.system/modular/flow_graph.yaml');
  const instancePath = path.join(repoRoot, opts['instance-registry'] || '.system/modular/instance_registry.yaml');
  const outPath = path.join(repoRoot, opts.out || '.system/modular/flow_impl_index.yaml');

  const flowGraph = readYamlOrDie(flowGraphPath, 'flow graph');
  const instanceRegistry = loadInstanceRegistry(instancePath);

  const prev = fileExists(outPath) ? loadYamlFile(outPath) : null;
  const { flowImplIndex, warnings, errors } = buildFlowImplIndex(flowGraph, instanceRegistry);

  ensureDir(path.dirname(outPath));
  saveYamlFile(outPath, flowImplIndex);

  const reportPath = path.join(repoRoot, '.system', 'modular', 'reports', 'flow_impl_index.diff.json');
  ensureDir(path.dirname(reportPath));
  writeJson(reportPath, {
    generatedAt: isoNow(),
    out: safeRel(repoRoot, outPath),
    changed: prev ? dumpYaml(prev) !== dumpYaml(flowImplIndex) : true,
    warnings,
    errors
  });

  const bindingsRaw = readBindings(repoRoot, opts);
  const graphs = writeMermaidGraphs(repoRoot, flowGraph, flowImplIndex, bindingsRaw);

  console.log(`[ok] wrote ${safeRel(repoRoot, outPath)}`);
  console.log(`[ok] wrote ${graphs.flowGraphPath}`);
  console.log(`[ok] wrote ${graphs.modulesGraphPath}`);

  const { shouldExit } = printDiagnostics({ warnings, errors });
  if (shouldExit) process.exitCode = 1;
}

function cmdLint(repoRoot, opts) {
  const strict = !!opts.strict;

  const flowGraphPath = path.join(repoRoot, opts['flow-graph'] || '.system/modular/flow_graph.yaml');
  const bindingsPath = path.join(repoRoot, opts['flow-bindings'] || '.system/modular/flow_bindings.yaml');
  const typeGraphPath = path.join(repoRoot, opts['type-graph'] || '.system/modular/type_graph.yaml');
  const instancePath = path.join(repoRoot, opts['instance-registry'] || '.system/modular/instance_registry.yaml');
  const implIndexPath = path.join(repoRoot, opts['flow-impl-index'] || '.system/modular/flow_impl_index.yaml');

  const flowGraph = readYamlOrDie(flowGraphPath, 'flow graph');
  const bindingsRaw = fileExists(bindingsPath) ? loadYamlFile(bindingsPath) : { bindings: [] };
  const typeGraph = fileExists(typeGraphPath) ? loadYamlFile(typeGraphPath) : { types: [] };
  const instanceRegistry = loadInstanceRegistry(instancePath);
  const implIndex = fileExists(implIndexPath) ? loadYamlFile(implIndexPath) : { version: 1, updatedAt: isoNow(), nodes: [] };

  const { warnings, errors, flows } = validateFlowGraph(flowGraph);

  // Validate kebab-case IDs for flows and nodes
  for (const f of flows) {
    if (f.id && !isValidKebabId(f.id)) {
      errors.push(
        `[${f.id}] flow id must be kebab-case\n` +
        `  Required format: lowercase letters, digits, hyphens only\n` +
        `  Examples: user-management, order-fulfillment\n` +
        `  Pattern: ^[a-z0-9]+(?:-[a-z0-9]+)*$`
      );
    }

    for (const n of f.nodes || []) {
      if (n.id && !isValidKebabId(n.id)) {
        errors.push(
          `[${f.id}.${n.id}] node id must be kebab-case\n` +
          `  Required format: lowercase letters, digits, hyphens only\n` +
          `  Examples: create-user, place-order\n` +
          `  Pattern: ^[a-z0-9]+(?:-[a-z0-9]+)*$`
        );
      }
    }
  }

  // Validate type graph (optional)
  const tg = validateTypeGraph(typeGraph);
  warnings.push(...tg.warnings);
  errors.push(...tg.errors);
  const typeIds = new Set((tg.types || []).map(t => t.id).filter(Boolean));
  if (typeIds.size > 0) {
    for (const m of instanceRegistry.modules || []) {
      const moduleId = m.module_id ?? m.moduleId;
      const moduleType = m.module_type ?? m.moduleType ?? null;
      if (!moduleType) {
        warnings.push(`type_graph: module "${moduleId}" has no module_type`);
        continue;
      }
      if (!typeIds.has(moduleType)) {
        errors.push(`type_graph: module "${moduleId}" uses unknown module_type: ${moduleType}`);
      }
    }
  }

  // Validate bindings
  const { primary, bindings } = pickPrimaryImplementation(implIndex, bindingsRaw);
  const implByKey = new Map();
  for (const entry of normalizeFlowImplIndex(implIndex)) {
    implByKey.set(`${entry.flow_id}::${entry.node_id}`, entry);
  }

  const bindingIds = new Set();
  for (const b of bindings) {
    if (b.id) {
      if (bindingIds.has(b.id)) errors.push(`Binding id is duplicated: ${b.id}`);
      bindingIds.add(b.id);
    } else {
      warnings.push('Binding missing id (recommended for stable references)');
    }

    if (!b.flow_id || !b.node_id) {
      errors.push('Binding missing flow_id/node_id');
      continue;
    }

    const hasSelection = !!b.primary || (Array.isArray(b.candidates) && b.candidates.length > 0);
    if (!hasSelection) {
      errors.push(`Binding for ${b.flow_id}.${b.node_id} must include primary or candidates`);
      continue;
    }

    const flow = flows.find(f => f.id === b.flow_id);
    if (!flow) {
      errors.push(`Binding references unknown flow: ${b.flow_id}`);
      continue;
    }
    const node = (flow.nodes || []).find(n => n.id === b.node_id);
    if (!node) {
      errors.push(`Binding references unknown node: ${b.flow_id}.${b.node_id}`);
      continue;
    }
    const entry = implByKey.get(`${b.flow_id}::${b.node_id}`);
    if (!entry) {
      errors.push(`flow_impl_index missing entry for ${b.flow_id}.${b.node_id} (run: node .ai/scripts/modules/ctl-flow.mjs update-from-manifests)`);
      continue;
    }
    const impls = Array.isArray(entry?.implementations) ? entry.implementations : [];
    if (impls.length <= 1) {
      warnings.push(`Binding for ${b.flow_id}.${b.node_id} is redundant (<=1 implementation)`);
      continue;
    }

    const endpointSet = new Set(impls.map(i => i.endpoint_id).filter(Boolean));

    if (b.primary && !endpointSet.has(b.primary)) {
      errors.push(`Binding primary endpoint not found for ${b.flow_id}.${b.node_id}: ${b.primary}`);
    }

    for (const c of b.candidates || []) {
      if (!endpointSet.has(c.endpoint_id)) {
        errors.push(`Binding candidate endpoint not found for ${b.flow_id}.${b.node_id}: ${c.endpoint_id}`);
      }
    }
    for (const cond of b.conditions || []) {
      for (const c of cond.override || []) {
        if (!endpointSet.has(c.endpoint_id)) {
          errors.push(`Binding override endpoint not found for ${b.flow_id}.${b.node_id}: ${c.endpoint_id}`);
        }
      }
    }
  }

  // Check derived index against instance registry (soft)
  const endpointSet = new Set();
  for (const m of instanceRegistry.modules || []) {
    const moduleId = m.module_id ?? m.moduleId;
    for (const it of m.interfaces || []) {
      endpointSet.add(`${moduleId}:${it.id}`);
    }
  }
  for (const entry of normalizeFlowImplIndex(implIndex)) {
    for (const impl of entry.implementations || []) {
      if (!endpointSet.has(impl.endpoint_id)) {
        warnings.push(`flow_impl_index references unknown endpoint_id: ${impl.endpoint_id}`);
      }
    }
  }

  // Validate participates_in references in instance_registry
  // Check that referenced flow/node pairs exist in the flow graph
  const flowNodeSet = new Set();
  for (const f of flows) {
    if (!f.id) continue;
    for (const n of f.nodes || []) {
      if (n.id) flowNodeSet.add(`${f.id}.${n.id}`);
    }
  }

  for (const m of instanceRegistry.modules || []) {
    const moduleId = m.module_id ?? m.moduleId;
    const participatesIn = Array.isArray(m.participates_in) ? m.participates_in : [];
    
    for (const entry of participatesIn) {
      const norm = normalizeParticipatesInEntry(entry);
      if (!norm.flow_id || !norm.node_id) continue;
      
      const key = `${norm.flow_id}.${norm.node_id}`;
      
      // Check if flow exists
      const flowExists = flows.some(f => f.id === norm.flow_id);
      if (!flowExists) {
        warnings.push(`[${moduleId}] participates_in references unknown flow: ${norm.flow_id}`);
        continue;
      }
      
      // Check if node exists in flow
      if (!flowNodeSet.has(key)) {
        warnings.push(`[${moduleId}] participates_in references unknown node: ${key}`);
      }
    }
  }

  const { shouldExit } = printDiagnostics({ warnings, errors }, { strict });

  if (shouldExit) process.exit(1);
  console.log('\n[ok] flow lint passed.');
}

function cmdGraph(repoRoot, opts) {
  const flowGraphPath = path.join(repoRoot, opts['flow-graph'] || '.system/modular/flow_graph.yaml');
  const implIndexPath = path.join(repoRoot, opts['flow-impl-index'] || '.system/modular/flow_impl_index.yaml');
  const bindingsRaw = readBindings(repoRoot, opts);

  const flowGraph = readYamlOrDie(flowGraphPath, 'flow graph');
  const implIndex = fileExists(implIndexPath) ? loadYamlFile(implIndexPath) : { version: 1, updatedAt: isoNow(), nodes: [] };

  const graphs = writeMermaidGraphs(repoRoot, flowGraph, implIndex, bindingsRaw);
  console.log(`[ok] wrote ${graphs.flowGraphPath}`);
  console.log(`[ok] wrote ${graphs.modulesGraphPath}`);
}

// =============================================================================
// Main
// =============================================================================

function main() {
  const { command, opts } = parseArgs(process.argv, { usageFn: usage });
  const repoRoot = repoRootFromOpts(opts);

  switch (command) {
    case 'init':
      cmdInit(repoRoot);
      break;
    case 'update-from-manifests':
      cmdUpdateFromManifests(repoRoot, opts);
      break;
    case 'lint':
      cmdLint(repoRoot, opts);
      break;
    case 'graph':
      cmdGraph(repoRoot, opts);
      break;
    default:
      die(`[error] Unknown command: ${command}`);
  }
}

main();

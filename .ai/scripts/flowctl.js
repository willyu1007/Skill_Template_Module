#!/usr/bin/env node
/**
 * flowctl.js
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
import { loadYamlFile, saveYamlFile, dumpYaml, parseYaml } from './lib/yaml.js';
import {
  getModularEnv,
  normalizeBindingsDoc,
  normalizeFlowImplIndex,
  normalizeImplementsEntry,
  resolveBindingEndpoint
} from './lib/modular.js';

function usage(exitCode = 0) {
  const msg = `
Usage:
  node .ai/scripts/flowctl.js <command> [options]

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
  console.log(msg.trim());
  process.exit(exitCode);
}

function die(msg, code = 1) {
  console.error(msg);
  process.exit(code);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  if (args.length === 0 || args[0] === '-h' || args[0] === '--help') usage(0);
  const command = args.shift();
  const opts = {};
  const positionals = [];
  while (args.length > 0) {
    const t = args.shift();
    if (t === '-h' || t === '--help') usage(0);
    if (t.startsWith('--')) {
      const k = t.slice(2);
      if (args.length > 0 && !args[0].startsWith('--')) opts[k] = args.shift();
      else opts[k] = true;
    } else {
      positionals.push(t);
    }
  }
  return { command, opts, positionals };
}

function isoNow() {
  return new Date().toISOString();
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function safeRel(repoRoot, p) {
  const abs = path.resolve(p);
  const rr = path.resolve(repoRoot);
  if (!abs.startsWith(rr)) return p;
  return path.relative(rr, abs);
}

function readYamlOrDie(absPath, label) {
  if (!fs.existsSync(absPath)) die(`[error] Missing ${label}: ${absPath}`);
  try {
    return loadYamlFile(absPath);
  } catch (e) {
    die(`[error] Failed to parse ${label}: ${absPath} (${e.message})`);
  }
}

function normalizeFlowGraph(flowGraph) {
  const flows = Array.isArray(flowGraph.flows) ? flowGraph.flows : [];
  const norm = [];
  for (const f of flows) {
    if (!f || typeof f !== 'object') continue;
    const flowId = f.id ?? f.flow_id ?? f.flowId;
    norm.push({
      id: flowId,
      name: f.name ?? f.description ?? null,
      status: f.status ?? null,
      nodes: Array.isArray(f.nodes) ? f.nodes : [],
      edges: Array.isArray(f.edges) ? f.edges : []
    });
  }
  return norm;
}

function normalizeTypeGraph(typeGraph) {
  const types = Array.isArray(typeGraph?.types) ? typeGraph.types : [];
  return types
    .filter(t => t && typeof t === 'object')
    .map(t => ({
      id: t.id ?? t.type_id ?? t.typeId,
      outbound: Array.isArray(t.outbound) ? t.outbound : []
    }));
}

function validateTypeGraph(typeGraph) {
  const warnings = [];
  const errors = [];

  const types = normalizeTypeGraph(typeGraph);
  const ids = new Set();

  for (const t of types) {
    if (!t.id || typeof t.id !== 'string') {
      errors.push('type_graph: type missing id');
      continue;
    }
    if (ids.has(t.id)) errors.push(`type_graph: duplicate type id: ${t.id}`);
    ids.add(t.id);
  }

  for (const t of types) {
    for (const out of t.outbound || []) {
      if (typeof out !== 'string' || out.trim().length === 0) continue;
      if (!ids.has(out)) errors.push(`type_graph: unknown outbound type "${out}" referenced by "${t.id}"`);
    }
  }

  return { warnings, errors, types };
}

function validateFlowGraph(flowGraph) {
  const warnings = [];
  const errors = [];

  const flows = normalizeFlowGraph(flowGraph);
  const flowIds = new Set();

  for (const f of flows) {
    if (!f.id || typeof f.id !== 'string') {
      errors.push(`Flow missing id`);
      continue;
    }
    if (flowIds.has(f.id)) errors.push(`Duplicate flow id: ${f.id}`);
    flowIds.add(f.id);

    const nodeIds = new Set();
    for (const n of f.nodes) {
      if (!n || typeof n !== 'object') {
        errors.push(`[${f.id}] node must be mapping`);
        continue;
      }
      if (!n.id || typeof n.id !== 'string') {
        errors.push(`[${f.id}] node missing id`);
        continue;
      }
      if (nodeIds.has(n.id)) errors.push(`[${f.id}] duplicate node id: ${n.id}`);
      nodeIds.add(n.id);
    }

    for (const e of f.edges) {
      if (!e || typeof e !== 'object') {
        errors.push(`[${f.id}] edge must be mapping`);
        continue;
      }
      const from = e.from;
      const to = e.to;
      if (!from || !to) {
        errors.push(`[${f.id}] edge missing from/to`);
        continue;
      }
      if (!nodeIds.has(from)) errors.push(`[${f.id}] edge.from references unknown node: ${from}`);
      if (!nodeIds.has(to)) errors.push(`[${f.id}] edge.to references unknown node: ${to}`);
    }

    // Warnings for empty flows
    if (f.nodes.length === 0) warnings.push(`[${f.id}] flow has no nodes`);
  }

  return { warnings, errors, flows };
}

function loadInstanceRegistry(absPath) {
  if (!fs.existsSync(absPath)) {
    return { version: 1, updatedAt: isoNow(), modules: [] };
  }
  return loadYamlFile(absPath);
}

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

function readBindings(repoRoot, opts) {
  const bindingsPath = path.join(repoRoot, opts['flow-bindings'] || '.system/modular/flow_bindings.yaml');
  if (!fs.existsSync(bindingsPath)) return { bindings: [] };
  return loadYamlFile(bindingsPath);
}

function normalizeBindings(raw) {
  return normalizeBindingsDoc(raw);
}

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

function writeMermaidGraphs(repoRoot, flowGraph, flowImplIndex, bindingsRaw) {
  const graphsDir = path.join(repoRoot, '.system', 'modular', 'graphs');
  ensureDir(graphsDir);

  const flows = normalizeFlowGraph(flowGraph);
  const { primary } = pickPrimaryImplementation(flowImplIndex, bindingsRaw);

  // Flow graph rendering
  const flowLines = [];
  flowLines.push('%% Auto-generated by flowctl.js');
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
  modLines.push('%% Auto-generated by flowctl.js');
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

  return { flowGraphPath: safeRel(repoRoot, path.join(graphsDir, 'flows.mmd')), modulesGraphPath: safeRel(repoRoot, path.join(graphsDir, 'modules.mmd')) };
}

function cmdInit(repoRoot) {
  const base = path.join(repoRoot, '.system', 'modular');
  ensureDir(base);
  ensureDir(path.join(base, 'schemas'));
  ensureDir(path.join(base, 'reports'));
  ensureDir(path.join(base, 'graphs'));

  const ensureFile = (relPath, content) => {
    const abs = path.join(repoRoot, relPath);
    if (!fs.existsSync(abs)) {
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

  const prev = fs.existsSync(outPath) ? loadYamlFile(outPath) : null;
  const { flowImplIndex, warnings, errors } = buildFlowImplIndex(flowGraph, instanceRegistry);

  ensureDir(path.dirname(outPath));
  saveYamlFile(outPath, flowImplIndex);

  const reportPath = path.join(repoRoot, '.system', 'modular', 'reports', 'flow_impl_index.diff.json');
  ensureDir(path.dirname(reportPath));
  fs.writeFileSync(reportPath, JSON.stringify({
    generatedAt: isoNow(),
    out: safeRel(repoRoot, outPath),
    changed: prev ? dumpYaml(prev) !== dumpYaml(flowImplIndex) : true,
    warnings,
    errors
  }, null, 2) + '\n', 'utf8');

  const bindingsRaw = readBindings(repoRoot, opts);
  const graphs = writeMermaidGraphs(repoRoot, flowGraph, flowImplIndex, bindingsRaw);

  console.log(`[ok] wrote ${safeRel(repoRoot, outPath)}`);
  console.log(`[ok] wrote ${graphs.flowGraphPath}`);
  console.log(`[ok] wrote ${graphs.modulesGraphPath}`);

  if (warnings.length > 0) {
    console.log(`\nWarnings (${warnings.length}):`);
    for (const w of warnings) console.log(`- ${w}`);
  }
  if (errors.length > 0) {
    console.log(`\nErrors (${errors.length}):`);
    for (const e of errors) console.log(`- ${e}`);
    process.exitCode = 1;
  }
}

function cmdLint(repoRoot, opts) {
  const strict = !!opts.strict;

  const flowGraphPath = path.join(repoRoot, opts['flow-graph'] || '.system/modular/flow_graph.yaml');
  const bindingsPath = path.join(repoRoot, opts['flow-bindings'] || '.system/modular/flow_bindings.yaml');
  const typeGraphPath = path.join(repoRoot, opts['type-graph'] || '.system/modular/type_graph.yaml');
  const instancePath = path.join(repoRoot, opts['instance-registry'] || '.system/modular/instance_registry.yaml');
  const implIndexPath = path.join(repoRoot, opts['flow-impl-index'] || '.system/modular/flow_impl_index.yaml');

  const flowGraph = readYamlOrDie(flowGraphPath, 'flow graph');
  const bindingsRaw = fs.existsSync(bindingsPath) ? loadYamlFile(bindingsPath) : { bindings: [] };
  const typeGraph = fs.existsSync(typeGraphPath) ? loadYamlFile(typeGraphPath) : { types: [] };
  const instanceRegistry = loadInstanceRegistry(instancePath);
  const implIndex = fs.existsSync(implIndexPath) ? loadYamlFile(implIndexPath) : { version: 1, updatedAt: isoNow(), nodes: [] };

  const { warnings, errors, flows } = validateFlowGraph(flowGraph);

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
      errors.push(`flow_impl_index missing entry for ${b.flow_id}.${b.node_id} (run: node .ai/scripts/flowctl.js update-from-manifests)`);
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

  if (warnings.length > 0) {
    console.log(`Warnings (${warnings.length}):`);
    for (const w of warnings) console.log(`- ${w}`);
  }
  if (errors.length > 0) {
    console.log(`\nErrors (${errors.length}):`);
    for (const e of errors) console.log(`- ${e}`);
  }

  if (errors.length > 0) process.exit(1);
  if (strict && warnings.length > 0) process.exit(1);

  console.log('\n[ok] flow lint passed.');
}

function cmdGraph(repoRoot, opts) {
  const flowGraphPath = path.join(repoRoot, opts['flow-graph'] || '.system/modular/flow_graph.yaml');
  const implIndexPath = path.join(repoRoot, opts['flow-impl-index'] || '.system/modular/flow_impl_index.yaml');
  const bindingsRaw = readBindings(repoRoot, opts);

  const flowGraph = readYamlOrDie(flowGraphPath, 'flow graph');
  const implIndex = fs.existsSync(implIndexPath) ? loadYamlFile(implIndexPath) : { version: 1, updatedAt: isoNow(), nodes: [] };

  const graphs = writeMermaidGraphs(repoRoot, flowGraph, implIndex, bindingsRaw);
  console.log(`[ok] wrote ${graphs.flowGraphPath}`);
  console.log(`[ok] wrote ${graphs.modulesGraphPath}`);
}

function main() {
  const { command, opts } = parseArgs(process.argv);
  const repoRoot = path.resolve(opts['repo-root'] || process.cwd());

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

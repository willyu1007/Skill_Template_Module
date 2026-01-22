/**
 * Modular system utilities
 *
 * Provides helper functions for the modular architecture system:
 * - Flow/node reference normalization
 * - Binding resolution
 * - Implementation indexing
 * - Module discovery and validation
 *
 * Usage:
 *   import {
 *     normalizeImplementsEntry,
 *     getModularEnv,
 *     normalizeBindingsDoc,
 *     normalizeFlowImplIndex,
 *     resolveBindingEndpoint,
 *     firstString,
 *     indexImplsByFlowNode,
 *     normalizeFlowNodeRef,
 *     isValidModuleId,
 *     discoverModules,
 *     getModulesDir,
 *     validateManifest,
 *     normalizeFlowGraph
 *   } from './lib/modular.mjs';
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * Get the first string value from an object given a list of candidate keys.
 *
 * @param {object} obj - Source object
 * @param {string[]} keys - Candidate keys in priority order
 * @returns {string | null}
 */
export function firstString(obj, keys) {
  if (!obj || typeof obj !== 'object') return null;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim().length > 0) {
      return v.trim();
    }
  }
  return null;
}

/**
 * Normalize an implements entry to a standard form.
 *
 * Handles variations:
 * - { flow_id, node_id }
 * - { flowId, nodeId }
 * - { flow, node }
 * - { flow_node } (format: "flow_id.node_id")
 *
 * @param {object} entry - Raw implements entry
 * @returns {{ flow_id: string | null, node_id: string | null, variant: string | null, role: string | null }}
 */
export function normalizeImplementsEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    return { flow_id: null, node_id: null, variant: null, role: null };
  }

  let flowId = firstString(entry, ['flow_id', 'flowId', 'flow']);
  let nodeId = firstString(entry, ['node_id', 'nodeId', 'node']);

  // Handle flow_node format: "flow_id.node_id"
  const flowNode = firstString(entry, ['flow_node', 'flowNode']);
  if (flowNode && flowNode.includes('.')) {
    const [f, n] = flowNode.split('.', 2);
    if (!flowId) flowId = f;
    if (!nodeId) nodeId = n;
  }

  const variant = firstString(entry, ['variant']);
  const role = firstString(entry, ['role']);

  return { flow_id: flowId, node_id: nodeId, variant, role };
}

/**
 * Normalize a flow node reference.
 *
 * @param {object} ref - Raw reference object
 * @param {{ defaultFlowId?: string }} opts - Options
 * @returns {{ flow_id: string | null, node_id: string | null }}
 */
export function normalizeFlowNodeRef(ref, opts = {}) {
  if (!ref || typeof ref !== 'object') {
    return { flow_id: opts.defaultFlowId || null, node_id: null };
  }

  let flowId = firstString(ref, ['flow_id', 'flowId', 'flow']);
  let nodeId = firstString(ref, ['node_id', 'nodeId', 'node']);

  // Handle flow_node format
  const flowNode = firstString(ref, ['flow_node', 'flowNode']);
  if (flowNode) {
    if (flowNode.includes('.')) {
      const [f, n] = flowNode.split('.', 2);
      if (!flowId) flowId = f;
      if (!nodeId) nodeId = n;
    } else {
      // Just node_id, use default flow
      if (!nodeId) nodeId = flowNode;
    }
  }

  if (!flowId && opts.defaultFlowId) {
    flowId = opts.defaultFlowId;
  }

  return { flow_id: flowId, node_id: nodeId };
}

/**
 * Get the modular environment identifier.
 *
 * Checks in order: MODULAR_ENV, ENVIRONMENT, NODE_ENV
 *
 * @param {object} runtimeCfg - Optional runtime config with env override
 * @returns {string | null}
 */
export function getModularEnv(runtimeCfg) {
  if (runtimeCfg?.env) return runtimeCfg.env;
  return process.env.MODULAR_ENV || process.env.ENVIRONMENT || process.env.NODE_ENV || null;
}

/**
 * Normalize a bindings document.
 *
 * @param {object} doc - Raw bindings document
 * @returns {Array<{
 *   id: string | null,
 *   flow_id: string | null,
 *   node_id: string | null,
 *   primary: string | null,
 *   candidates: Array<{ endpoint_id: string, priority?: number }>,
 *   conditions: Array<{ env: string[], override: Array<{ endpoint_id: string, priority?: number }> }>
 * }>}
 */
export function normalizeBindingsDoc(doc) {
  const raw = Array.isArray(doc?.bindings) ? doc.bindings : [];
  return raw
    .filter(b => b && typeof b === 'object')
    .map(b => {
      const ref = normalizeFlowNodeRef(b);
      const candidates = Array.isArray(b.candidates)
        ? b.candidates
            .filter(c => c && typeof c === 'object')
            .map(c => ({
              endpoint_id: firstString(c, ['endpoint_id', 'endpointId', 'endpoint']) || '',
              priority: typeof c.priority === 'number' ? c.priority : 0
            }))
        : [];

      const conditions = Array.isArray(b.conditions)
        ? b.conditions
            .filter(c => c && typeof c === 'object')
            .map(c => ({
              env: Array.isArray(c.env) ? c.env.filter(e => typeof e === 'string') : [],
              override: Array.isArray(c.override)
                ? c.override
                    .filter(o => o && typeof o === 'object')
                    .map(o => ({
                      endpoint_id: firstString(o, ['endpoint_id', 'endpointId', 'endpoint']) || '',
                      priority: typeof o.priority === 'number' ? o.priority : 0
                    }))
                : []
            }))
        : [];

      return {
        id: firstString(b, ['id', 'binding_id', 'bindingId']),
        flow_id: ref.flow_id,
        node_id: ref.node_id,
        primary: firstString(b, ['primary', 'default']),
        candidates,
        conditions
      };
    });
}

/**
 * Resolve a binding to an endpoint_id based on environment.
 *
 * Resolution order:
 * 1. Check conditions for matching env
 * 2. Use primary if specified
 * 3. Use first candidate
 *
 * @param {object} binding - Normalized binding
 * @param {string | null} env - Current environment
 * @returns {string | null}
 */
export function resolveBindingEndpoint(binding, env) {
  if (!binding) return null;

  // Check conditions for env match
  if (env && Array.isArray(binding.conditions)) {
    for (const cond of binding.conditions) {
      if (Array.isArray(cond.env) && cond.env.includes(env)) {
        const overrides = cond.override || [];
        if (overrides.length > 0) {
          // Sort by priority descending
          const sorted = [...overrides].sort((a, b) => (b.priority || 0) - (a.priority || 0));
          return sorted[0].endpoint_id || null;
        }
      }
    }
  }

  // Use primary
  if (binding.primary) {
    return binding.primary;
  }

  // Use first candidate
  if (Array.isArray(binding.candidates) && binding.candidates.length > 0) {
    const sorted = [...binding.candidates].sort((a, b) => (b.priority || 0) - (a.priority || 0));
    return sorted[0].endpoint_id || null;
  }

  return null;
}

/**
 * Normalize a flow implementation index.
 *
 * @param {object} index - Raw flow_impl_index
 * @returns {Array<{
 *   flow_id: string,
 *   node_id: string,
 *   implementations: Array<{
 *     endpoint_id: string,
 *     module_id: string,
 *     interface_id: string,
 *     protocol: string | null,
 *     status: string | null,
 *     role: string | null,
 *     variants: string[]
 *   }>
 * }>}
 */
export function normalizeFlowImplIndex(index) {
  const raw = Array.isArray(index?.nodes) ? index.nodes : [];
  return raw
    .filter(n => n && typeof n === 'object')
    .map(n => {
      const ref = normalizeFlowNodeRef(n);
      const implementations = Array.isArray(n.implementations)
        ? n.implementations
            .filter(i => i && typeof i === 'object')
            .map(i => ({
              endpoint_id: firstString(i, ['endpoint_id', 'endpointId']) || '',
              module_id: firstString(i, ['module_id', 'moduleId']) || '',
              interface_id: firstString(i, ['interface_id', 'interfaceId']) || '',
              protocol: firstString(i, ['protocol']),
              status: firstString(i, ['status']),
              role: firstString(i, ['role']),
              variants: Array.isArray(i.variants) ? i.variants.filter(v => typeof v === 'string') : []
            }))
        : [];

      return {
        flow_id: ref.flow_id || firstString(n, ['flow_id', 'flowId']) || '',
        node_id: ref.node_id || firstString(n, ['node_id', 'nodeId']) || '',
        implementations
      };
    });
}

/**
 * Index implementations by flow_id::node_id key.
 *
 * @param {object} flowImplIndex - Raw or normalized flow_impl_index
 * @returns {Map<string, Array<{ endpoint_id: string, module_id: string, interface_id: string, protocol: string | null, status: string | null }>>}
 */
export function indexImplsByFlowNode(flowImplIndex) {
  const normalized = normalizeFlowImplIndex(flowImplIndex);
  const map = new Map();

  for (const entry of normalized) {
    const key = `${entry.flow_id}::${entry.node_id}`;
    map.set(key, entry.implementations);
  }

  return map;
}

// =============================================================================
// Module discovery and validation
// =============================================================================

/**
 * Validate a module ID against the standard pattern.
 *
 * Pattern: lowercase letters, digits, dots, hyphens, underscores
 * Length: 3-64 characters (first and last must be alphanumeric)
 *
 * @param {string} id - Module ID to validate
 * @returns {boolean}
 */
export function isValidModuleId(id) {
  if (typeof id !== 'string') return false;
  return /^[a-z0-9][a-z0-9._-]{1,62}[a-z0-9]$/.test(id);
}

/**
 * Get the modules directory path.
 *
 * @param {string} repoRoot - Repository root path
 * @param {string} [modulesDirOpt] - Optional modules directory name (default: 'modules')
 * @returns {string} Absolute path to modules directory
 */
export function getModulesDir(repoRoot, modulesDirOpt) {
  return path.join(repoRoot, modulesDirOpt || 'modules');
}

/**
 * Discover all module instances in the repository.
 *
 * Scans the modules directory for subdirectories containing MANIFEST.yaml.
 * Excludes the 'integration' directory.
 *
 * @param {string} repoRoot - Repository root path
 * @param {string} [modulesDirOpt] - Optional modules directory name (default: 'modules')
 * @returns {Array<{ dir: string, id: string, manifestPath: string }>}
 */
export function discoverModules(repoRoot, modulesDirOpt) {
  const modulesDir = getModulesDir(repoRoot, modulesDirOpt);
  if (!fs.existsSync(modulesDir)) return [];

  const entries = fs.readdirSync(modulesDir, { withFileTypes: true });
  const mods = [];

  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (e.name === 'integration') continue;

    const dir = path.join(modulesDir, e.name);
    const manifestPath = path.join(dir, 'MANIFEST.yaml');

    if (fs.existsSync(manifestPath)) {
      mods.push({
        dir,
        id: e.name,
        manifestPath
      });
    }
  }

  return mods.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Validate a module manifest.
 *
 * @param {object} manifest - Parsed manifest object
 * @param {string} manifestPath - Path to manifest (for error messages)
 * @returns {{ warnings: string[], errors: string[] }}
 */
export function validateManifest(manifest, manifestPath) {
  const warnings = [];
  const errors = [];

  if (!manifest || typeof manifest !== 'object') {
    errors.push(`Manifest is not a mapping: ${manifestPath}`);
    return { warnings, errors };
  }

  const moduleId = firstString(manifest, ['module_id', 'moduleId']);
  if (!moduleId || !isValidModuleId(moduleId)) {
    errors.push(`Missing/invalid module_id in ${manifestPath} (expected pattern: /^[a-z0-9][a-z0-9._-]{1,62}[a-z0-9]$/)`);
  }

  const moduleType = firstString(manifest, ['module_type', 'moduleType']);
  if (!moduleType) {
    warnings.push(`Missing module_type in ${manifestPath}`);
  }

  if (manifest.interfaces && !Array.isArray(manifest.interfaces)) {
    errors.push(`interfaces must be a list in ${manifestPath}`);
  }

  if (Array.isArray(manifest.interfaces)) {
    const seen = new Set();
    for (const it of manifest.interfaces) {
      if (!it || typeof it !== 'object') {
        errors.push(`interfaces item must be a mapping in ${manifestPath}`);
        continue;
      }

      const id = it.id;
      if (typeof id !== 'string' || id.trim().length === 0) {
        errors.push(`interfaces[].id missing in ${manifestPath}`);
      } else {
        if (seen.has(id)) errors.push(`Duplicate interface id "${id}" in ${manifestPath}`);
        seen.add(id);
      }

      if (it.implements && !Array.isArray(it.implements)) {
        errors.push(`interfaces[].implements must be a list in ${manifestPath} (interface ${id})`);
      }

      if (Array.isArray(it.implements)) {
        for (const imp of it.implements) {
          if (!imp || typeof imp !== 'object') {
            errors.push(`interfaces[].implements item must be a mapping in ${manifestPath} (interface ${id})`);
            continue;
          }
          const norm = normalizeImplementsEntry(imp);
          if (!norm.flow_id || !norm.node_id) {
            warnings.push(`implements entries should include flow_id/node_id in ${manifestPath} (interface ${id})`);
          }
          if (imp.variant != null && typeof imp.variant !== 'string') {
            errors.push(`interfaces[].implements[].variant must be string in ${manifestPath} (interface ${id})`);
          }
        }
      }

      if (it.protocol && typeof it.protocol !== 'string') {
        errors.push(`interfaces[].protocol must be string in ${manifestPath} (interface ${id})`);
      }
      if (it.protocol === 'http') {
        if (typeof it.method !== 'string' || typeof it.path !== 'string') {
          warnings.push(`http interface should include method and path in ${manifestPath} (interface ${id})`);
        }
      }
    }
  }

  return { warnings, errors };
}

/**
 * Normalize a flow graph document.
 *
 * @param {object} flowGraph - Raw flow graph
 * @returns {Array<{ id: string, name: string | null, status: string | null, nodes: object[], edges: object[] }>}
 */
export function normalizeFlowGraph(flowGraph) {
  const flows = Array.isArray(flowGraph?.flows) ? flowGraph.flows : [];
  const norm = [];

  for (const f of flows) {
    if (!f || typeof f !== 'object') continue;
    const flowId = firstString(f, ['id', 'flow_id', 'flowId']);
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

/**
 * Validate a flow graph document.
 *
 * @param {object} flowGraph - Raw flow graph
 * @returns {{ warnings: string[], errors: string[], flows: Array }}
 */
export function validateFlowGraph(flowGraph) {
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

/**
 * Normalize a type graph document.
 *
 * @param {object} typeGraph - Raw type graph
 * @returns {Array<{ id: string, outbound: string[] }>}
 */
export function normalizeTypeGraph(typeGraph) {
  const types = Array.isArray(typeGraph?.types) ? typeGraph.types : [];
  return types
    .filter(t => t && typeof t === 'object')
    .map(t => ({
      id: firstString(t, ['id', 'type_id', 'typeId']),
      outbound: Array.isArray(t.outbound) ? t.outbound : []
    }));
}

/**
 * Validate a type graph document.
 *
 * @param {object} typeGraph - Raw type graph
 * @returns {{ warnings: string[], errors: string[], types: Array }}
 */
export function validateTypeGraph(typeGraph) {
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

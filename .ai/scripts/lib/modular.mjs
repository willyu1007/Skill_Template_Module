/**
 * Modular system utilities
 *
 * Provides helper functions for the modular architecture system:
 * - Flow/node reference normalization
 * - Binding resolution
 * - Implementation indexing
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
 *     normalizeFlowNodeRef
 *   } from './lib/modular.mjs';
 */

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

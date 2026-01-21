/**
 * Helpers for the module-first "modular system" files.
 *
 * Goals:
 * - Accept both legacy keys (flow/node) and spec keys (flow_id/node_id).
 * - Keep parsing/normalization deterministic and dependency-free.
 */

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

export function firstString(obj, keys) {
  for (const k of keys) {
    if (!obj || typeof obj !== 'object') return null;
    // eslint-disable-next-line no-prototype-builtins
    if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
    const v = obj[k];
    if (isNonEmptyString(v)) return v.trim();
  }
  return null;
}

export function normalizeFlowNodeRef(obj, opts = {}) {
  const defaultFlowId = opts.defaultFlowId ?? null;
  const flow_id =
    firstString(obj, ['flow_id', 'flow', 'flowId', 'flowID']) ??
    (isNonEmptyString(defaultFlowId) ? defaultFlowId.trim() : null);
  const node_id = firstString(obj, [
    'node_id',
    'node',
    'nodeId',
    'nodeID',
    'flow_node',
    'flowNode',
    'flow_node_id',
    'flowNodeId'
  ]);
  return { flow_id, node_id };
}

export function normalizeImplementsEntry(raw) {
  const { flow_id, node_id } = normalizeFlowNodeRef(raw);
  const variant = firstString(raw, ['variant', 'variant_id', 'variantId']);
  const role = firstString(raw, ['role']);
  return { flow_id, node_id, variant, role };
}

export function normalizeFlowImplIndex(doc) {
  const list = Array.isArray(doc?.nodes) ? doc.nodes : Array.isArray(doc?.index) ? doc.index : [];
  return list
    .filter(e => e && typeof e === 'object')
    .map(e => ({
      flow_id: firstString(e, ['flow_id', 'flow', 'flowId', 'flowID']),
      node_id: firstString(e, ['node_id', 'node', 'nodeId', 'nodeID']),
      implementations: Array.isArray(e.implementations) ? e.implementations : []
    }))
    .filter(e => !!e.flow_id && !!e.node_id);
}

export function indexImplsByFlowNode(flowImplIndexDoc) {
  const byNode = new Map(); // key flow_id::node_id -> list
  for (const entry of normalizeFlowImplIndex(flowImplIndexDoc)) {
    byNode.set(`${entry.flow_id}::${entry.node_id}`, entry.implementations);
  }
  return byNode;
}

function normalizeWeight(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim().length > 0) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

export function normalizeCandidates(list) {
  const arr = Array.isArray(list) ? list : [];
  return arr
    .filter(c => c && typeof c === 'object')
    .map(c => ({
      endpoint_id: firstString(c, ['endpoint_id', 'endpointId', 'endpoint']),
      weight: normalizeWeight(c.weight)
    }))
    .filter(c => !!c.endpoint_id);
}

export function normalizeBindingEntry(raw) {
  const id = firstString(raw, ['id', 'binding_id', 'bindingId']);
  const { flow_id, node_id } = normalizeFlowNodeRef(raw);
  const primary = firstString(raw, ['primary', 'endpoint_id', 'endpointId']);
  const candidates = normalizeCandidates(raw?.candidates);

  const conditions = Array.isArray(raw?.conditions)
    ? raw.conditions
        .filter(c => c && typeof c === 'object')
        .map(c => {
          const envRaw = c.env;
          const env = Array.isArray(envRaw)
            ? envRaw.filter(isNonEmptyString).map(s => s.trim())
            : isNonEmptyString(envRaw)
              ? [envRaw.trim()]
              : null;
          return {
            env,
            override: normalizeCandidates(c.override)
          };
        })
    : [];

  return { id, flow_id, node_id, primary, candidates, conditions };
}

export function normalizeBindingsDoc(doc) {
  const list = Array.isArray(doc?.bindings) ? doc.bindings : [];
  return list.filter(b => b && typeof b === 'object').map(normalizeBindingEntry);
}

export function getModularEnv(runtimeCfg = null) {
  const fromFile = firstString(runtimeCfg, ['environment', 'env']);
  if (fromFile) return fromFile;
  if (isNonEmptyString(process.env.MODULAR_ENV)) return process.env.MODULAR_ENV.trim();
  if (isNonEmptyString(process.env.ENVIRONMENT)) return process.env.ENVIRONMENT.trim();
  if (isNonEmptyString(process.env.NODE_ENV)) return process.env.NODE_ENV.trim();
  return null;
}

function pickHighestWeight(candidates) {
  const list = Array.isArray(candidates) ? candidates : [];
  if (list.length === 0) return null;
  const sorted = [...list].sort((a, b) => {
    const dw = (b.weight ?? 0) - (a.weight ?? 0);
    if (dw !== 0) return dw;
    return (a.endpoint_id || '').localeCompare(b.endpoint_id || '');
  });
  return sorted[0]?.endpoint_id ?? null;
}

export function resolveBindingEndpoint(binding, env) {
  if (!binding || typeof binding !== 'object') return null;
  if (binding.primary) return binding.primary;

  let candidates = binding.candidates || [];
  if (env) {
    for (const c of binding.conditions || []) {
      if (!c || typeof c !== 'object') continue;
      if (!Array.isArray(c.env) || c.env.length === 0) continue;
      if (!c.env.includes(env)) continue;
      if (Array.isArray(c.override) && c.override.length > 0) {
        candidates = c.override;
      }
      break;
    }
  }
  return pickHighestWeight(candidates);
}


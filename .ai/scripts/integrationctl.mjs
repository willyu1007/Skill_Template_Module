#!/usr/bin/env node
/**
 * integrationctl.mjs
 *
 * Integration scenario validation + compilation + optional execution.
 *
 * SSOT:
 * - modules/integration/scenarios.yaml
 *
 * Inputs:
 * - .system/modular/flow_graph.yaml
 * - .system/modular/flow_bindings.yaml
 * - .system/modular/flow_impl_index.yaml
 * - .system/modular/instance_registry.yaml
 * - .system/modular/runtime_endpoints.yaml (optional; execution config)
 *
 * Derived:
 * - modules/integration/compiled/*.json
 * - modules/integration/runs/*.json
 */

import fs from 'node:fs';
import path from 'node:path';

import { loadYamlFile, dumpYaml } from './lib/yaml.mjs';
import {
  firstString,
  getModularEnv,
  indexImplsByFlowNode,
  normalizeBindingsDoc,
  normalizeFlowNodeRef,
  resolveBindingEndpoint
} from './lib/modular.mjs';

function usage(exitCode = 0) {
  const msg = `
Usage:
  node .ai/scripts/integrationctl.mjs <command> [options]

Options:
  --repo-root <path>          Repo root (default: cwd)

Commands:
  init
    Ensure modules/integration skeleton exists.

  new-scenario
    --id <id>                   Scenario id (required)
    --flow-id <flow_id>         Flow id (required)
    --nodes <n1,n2,...>         Optional (comma-separated flow node ids)
    Scaffold a new scenario stub into modules/integration/scenarios.yaml.

  validate
    --scenarios <path>          Default: modules/integration/scenarios.yaml
    --strict                    Fail on warnings
    Validate scenario definitions against flow graph and implementation index.

  compile
    --scenarios <path>          Default: modules/integration/scenarios.yaml
    --out-dir <path>            Default: modules/integration/compiled
    --no-clean                  Do not delete existing compiled *.json before writing
    Compile scenarios into resolved step plans (DERIVED).

  run
    --scenario <id>             Run a single scenario (default: all)
    --execute                   Execute HTTP steps (default: dry-run)
    --out-dir <path>            Default: modules/integration/runs
    Execute compiled plans (or do a dry-run) and write run reports.

Notes:
  - Execution is optional and environment-specific.
  - If base URLs are not configured, HTTP steps will be marked as SKIPPED.
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
  while (args.length > 0) {
    const t = args.shift();
    if (t === '-h' || t === '--help') usage(0);
    if (t.startsWith('--')) {
      const k = t.slice(2);
      if (args.length > 0 && !args[0].startsWith('--')) opts[k] = args.shift();
      else opts[k] = true;
    } else {
      // ignore positional
    }
  }
  return { command, opts };
}

function isoNow() {
  return new Date().toISOString();
}

function cleanJsonFilesInDir(dirPath) {
  if (!fs.existsSync(dirPath)) return;
  for (const ent of fs.readdirSync(dirPath, { withFileTypes: true })) {
    if (!ent.isFile()) continue;
    if (!ent.name.endsWith('.json')) continue;
    fs.unlinkSync(path.join(dirPath, ent.name));
  }
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function readText(p) {
  return fs.readFileSync(p, 'utf8');
}

function writeText(p, content) {
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, content, 'utf8');
}

function readYamlIfExists(absPath, fallback) {
  if (!fs.existsSync(absPath)) return fallback;
  return loadYamlFile(absPath);
}

function loadFlowGraph(repoRoot) {
  const p = path.join(repoRoot, '.system', 'modular', 'flow_graph.yaml');
  return readYamlIfExists(p, { flows: [] });
}

function normalizeFlowGraph(flowGraph) {
  const flows = Array.isArray(flowGraph.flows) ? flowGraph.flows : [];
  return flows
    .filter(f => f && typeof f === 'object')
    .map(f => ({
      id: f.id ?? f.flow_id ?? f.flowId,
      nodes: Array.isArray(f.nodes) ? f.nodes : [],
      edges: Array.isArray(f.edges) ? f.edges : []
    }))
    .filter(f => !!f.id);
}

function buildAdjacency(flowGraph) {
  const flows = normalizeFlowGraph(flowGraph);
  const adj = new Map(); // flow -> Set("from::to")
  const nodes = new Map(); // flow -> Set(nodeId)

  for (const f of flows) {
    const nodeSet = new Set((f.nodes || []).map(n => n.id).filter(Boolean));
    nodes.set(f.id, nodeSet);
    const set = new Set();
    for (const e of f.edges || []) {
      if (!e?.from || !e?.to) continue;
      if (!nodeSet.has(e.from) || !nodeSet.has(e.to)) continue;
      set.add(`${e.from}::${e.to}`);
    }
    adj.set(f.id, set);
  }
  return { adj, nodes, flows };
}

function loadImplIndex(repoRoot) {
  const p = path.join(repoRoot, '.system', 'modular', 'flow_impl_index.yaml');
  return readYamlIfExists(p, { version: 1, updatedAt: isoNow(), nodes: [] });
}

function loadBindings(repoRoot) {
  const p = path.join(repoRoot, '.system', 'modular', 'flow_bindings.yaml');
  return readYamlIfExists(p, { bindings: [] });
}

function loadInstanceRegistry(repoRoot) {
  const p = path.join(repoRoot, '.system', 'modular', 'instance_registry.yaml');
  return readYamlIfExists(p, { version: 1, updatedAt: isoNow(), modules: [] });
}

function loadRuntimeEndpoints(repoRoot) {
  const p = path.join(repoRoot, '.system', 'modular', 'runtime_endpoints.yaml');
  return readYamlIfExists(p, { version: 1, updatedAt: isoNow(), modules: {} });
}

function sanitizeEnvKey(moduleId) {
  return moduleId.toUpperCase().replaceAll('.', '_').replaceAll('-', '_');
}

function getBaseUrl(runtimeCfg, moduleId) {
  const byFile = runtimeCfg?.modules?.[moduleId]?.http_base;
  if (byFile) return byFile;
  const envKey = `MODULE_BASE_URL_${sanitizeEnvKey(moduleId)}`;
  if (process.env[envKey]) return process.env[envKey];
  return null;
}

function loadScenarios(repoRoot, scenariosPathOpt) {
  const p = path.join(repoRoot, scenariosPathOpt || 'modules/integration/scenarios.yaml');
  if (!fs.existsSync(p)) die(`[error] scenarios file not found: ${p}`);
  return { absPath: p, doc: loadYamlFile(p) };
}

function loadScenariosText(repoRoot, scenariosPathOpt) {
  const p = path.join(repoRoot, scenariosPathOpt || 'modules/integration/scenarios.yaml');
  if (!fs.existsSync(p)) die(`[error] scenarios file not found: ${p}`);
  return { absPath: p, raw: readText(p) };
}

function extractLeadingCommentBlock(raw) {
  const lines = raw.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const t = lines[i].trim();
    if (t === '' || t.startsWith('#')) i++;
    else break;
  }
  const header = lines.slice(0, i).join('\n').replace(/\s+$/, '');
  return header.length > 0 ? header + '\n\n' : '';
}

function isValidId(id) {
  return typeof id === 'string' && /^[a-z0-9][a-z0-9._-]{0,62}[a-z0-9]$/.test(id);
}

function normalizeScenarios(doc) {
  const list = Array.isArray(doc.scenarios) ? doc.scenarios : [];
  return list
    .filter(s => s && typeof s === 'object')
    .map(s => {
      const id = firstString(s, ['id', 'scenario_id', 'scenarioId']);
      const flow_id = firstString(s, ['flow_id', 'flowId', 'flow']);
      const stepsRaw = Array.isArray(s.steps) ? s.steps : [];
      const steps = stepsRaw
        .filter(st => st && typeof st === 'object')
        .map((st, idx) => {
          const stepId = firstString(st, ['id', 'name']) ?? `step${idx + 1}`;
          const ref = normalizeFlowNodeRef(st, { defaultFlowId: flow_id });
          return {
            id: stepId,
            flow_id: ref.flow_id,
            node_id: ref.node_id,
            endpoint_id: firstString(st, ['endpoint_id', 'endpointId']),
            use_binding: firstString(st, ['use_binding', 'useBinding', 'binding_id', 'bindingId']),
            input: st.input ?? null,
            expect: st.expect ?? null,
            allow_unresolved: st.allow_unresolved === true
          };
        });
      return {
        id,
        name: s.name ?? null,
        description: s.description ?? null,
        status: s.status ?? null,
        flow_id,
        allow_unresolved: s.allow_unresolved === true,
        steps
      };
    });
}

function buildBindingMaps(bindingsDoc, warnings) {
  const bindings = normalizeBindingsDoc(bindingsDoc);
  const byId = new Map();
  const byKey = new Map(); // flow_id::node_id -> binding

  for (const b of bindings) {
    if (b.id) {
      if (byId.has(b.id)) warnings.push(`Duplicate binding id: ${b.id} (last one wins)`);
      byId.set(b.id, b);
    }
    if (b.flow_id && b.node_id) {
      byKey.set(`${b.flow_id}::${b.node_id}`, b);
    }
  }

  return { bindings, byId, byKey };
}

function resolveEndpointForStep(step, implsByNode, bindingsById, bindingsByKey, env) {
  const explicit = step.endpoint_id ?? null;
  if (explicit) return { endpoint_id: explicit, binding_id: null, resolution: 'explicit' };

  const key = `${step.flow_id}::${step.node_id}`;
  const impls = implsByNode.get(key) || [];

  const bindingId = step.use_binding ?? null;
  if (bindingId) {
    const binding = bindingsById.get(bindingId);
    if (!binding) return { endpoint_id: null, binding_id: bindingId, resolution: 'missing_binding' };
    const picked = resolveBindingEndpoint(binding, env);
    if (picked && impls.find(i => i.endpoint_id === picked)) {
      return { endpoint_id: picked, binding_id: bindingId, resolution: 'binding' };
    }
    return { endpoint_id: null, binding_id: bindingId, resolution: 'binding_unresolved' };
  }

  const binding = bindingsByKey.get(key);
  if (binding) {
    const picked = resolveBindingEndpoint(binding, env);
    const effectiveBindingId = binding.id ?? null;
    if (picked && impls.find(i => i.endpoint_id === picked)) {
      return { endpoint_id: picked, binding_id: effectiveBindingId, resolution: 'default_binding' };
    }
    return { endpoint_id: null, binding_id: effectiveBindingId, resolution: 'default_binding_unresolved' };
  }

  if (impls.length === 1) return { endpoint_id: impls[0].endpoint_id, binding_id: null, resolution: 'single_impl' };
  if (impls.length > 1) return { endpoint_id: null, binding_id: null, resolution: 'ambiguous' };
  return { endpoint_id: null, binding_id: null, resolution: 'no_impl' };
}

function validate(repoRoot, scenariosDoc, opts = {}) {
  const strict = !!opts.strict;
  const warnings = [];
  const errors = [];

  const flowGraph = loadFlowGraph(repoRoot);
  const { adj, nodes, flows } = buildAdjacency(flowGraph);
  const flowImplIndex = loadImplIndex(repoRoot);
  const implsByNode = indexImplsByFlowNode(flowImplIndex);

  const bindingsDoc = loadBindings(repoRoot);
  const { bindings, byId: bindingsById, byKey: bindingsByKey } = buildBindingMaps(bindingsDoc, warnings);

  const env = getModularEnv();
  if (!env) {
    const hasConditional = bindings.some(b => (b.conditions || []).some(c => Array.isArray(c.env) && c.env.length > 0));
    if (hasConditional) {
      warnings.push('Bindings include env conditions, but no MODULAR_ENV/ENVIRONMENT/NODE_ENV is set; using default candidates.');
    }
  }

  const scenarios = normalizeScenarios(scenariosDoc);
  const seenScenarioIds = new Set();

  for (const sc of scenarios) {
    if (!sc.id || typeof sc.id !== 'string') {
      errors.push('Scenario missing id');
      continue;
    }
    if (seenScenarioIds.has(sc.id)) errors.push(`Duplicate scenario id: ${sc.id}`);
    seenScenarioIds.add(sc.id);

    if (sc.steps.length === 0) warnings.push(`[${sc.id}] scenario has no steps`);

    const allowUnresolved = sc.allow_unresolved === true || (typeof sc.status === 'string' && sc.status.toLowerCase() === 'draft');

    // Validate each step basic fields + endpoint resolvability
    for (const st of sc.steps) {
      const stepId = st.id;
      const flowId = st.flow_id;
      const nodeId = st.node_id;

      if (!flowId || !nodeId) {
        errors.push(`[${sc.id}.${stepId}] step missing flow_id/node_id (or scenario.flow_id + step.flow_node)`);
        continue;
      }

      const nodeSet = nodes.get(flowId);
      if (!nodeSet) {
        errors.push(`[${sc.id}.${stepId}] unknown flow: ${flowId}`);
        continue;
      }
      if (!nodeSet.has(nodeId)) {
        errors.push(`[${sc.id}.${stepId}] unknown node: ${flowId}.${nodeId}`);
        continue;
      }

      const key = `${flowId}::${nodeId}`;
      const impls = implsByNode.get(key) || [];
      const endpointSet = new Set(impls.map(i => i.endpoint_id).filter(Boolean));

      // Explicit endpoint_id must be valid for this node
      if (st.endpoint_id) {
        if (!endpointSet.has(st.endpoint_id)) {
          errors.push(`[${sc.id}.${stepId}] endpoint_id not found for ${flowId}.${nodeId}: ${st.endpoint_id}`);
        }
      }

      // use_binding must exist and match this node (and must reference valid endpoints)
      if (st.use_binding) {
        const b = bindingsById.get(st.use_binding);
        if (!b) {
          errors.push(`[${sc.id}.${stepId}] unknown binding id: ${st.use_binding}`);
        } else {
          if ((b.flow_id && b.flow_id !== flowId) || (b.node_id && b.node_id !== nodeId)) {
            errors.push(`[${sc.id}.${stepId}] binding "${st.use_binding}" does not match ${flowId}.${nodeId}`);
          }
          if (b.primary && !endpointSet.has(b.primary)) {
            errors.push(`[${sc.id}.${stepId}] binding primary endpoint not found for ${flowId}.${nodeId}: ${b.primary}`);
          }
          for (const c of b.candidates || []) {
            if (!endpointSet.has(c.endpoint_id)) {
              errors.push(`[${sc.id}.${stepId}] binding candidate endpoint not found for ${flowId}.${nodeId}: ${c.endpoint_id}`);
            }
          }
          for (const cond of b.conditions || []) {
            for (const c of cond.override || []) {
              if (!endpointSet.has(c.endpoint_id)) {
                errors.push(`[${sc.id}.${stepId}] binding override endpoint not found for ${flowId}.${nodeId}: ${c.endpoint_id}`);
              }
            }
          }
          const picked = resolveBindingEndpoint(b, env);
          if (picked && !endpointSet.has(picked)) {
            errors.push(`[${sc.id}.${stepId}] binding "${st.use_binding}" resolves to unknown endpoint for ${flowId}.${nodeId}: ${picked}`);
          }
        }
      }

      // Deterministic resolution check (warn-only unless strict)
      if (!st.endpoint_id) {
        const resolved = resolveEndpointForStep(st, implsByNode, bindingsById, bindingsByKey, env);
        if (!resolved.endpoint_id) {
          const msg = `[${sc.id}.${stepId}] unresolved endpoint for ${flowId}.${nodeId} (${resolved.resolution})`;
          if (allowUnresolved || st.allow_unresolved === true) warnings.push(msg);
          else {
            warnings.push(msg);
            if (strict) errors.push(`Strict mode: ${msg}`);
          }
        }
      }
    }

    // Validate edge adjacency (business validity)
    for (let i = 0; i < sc.steps.length - 1; i++) {
      const a = sc.steps[i];
      const b = sc.steps[i + 1];
      if (a.flow_id !== b.flow_id) {
        errors.push(`[${sc.id}] step transition crosses flows (${a.flow_id} -> ${b.flow_id}). Split scenario or add explicit bridging rules.`);
        continue;
      }
      const set = adj.get(a.flow_id) || new Set();
      const key = `${a.node_id}::${b.node_id}`;
      if (!set.has(key)) {
        errors.push(`[${sc.id}] invalid step transition: ${a.flow_id}.${a.node_id} -> ${b.flow_id}.${b.node_id} (no such edge)`);
      }
    }

    // Optional: flow-level hint
    if (sc.flow_id && !flows.find(f => f.id === sc.flow_id)) {
      errors.push(`[${sc.id}] scenario.flow_id references unknown flow: ${sc.flow_id}`);
    }
  }

  return { warnings, errors, scenarios };
}

function compile(repoRoot, scenariosDoc, outDirOpt, compileOpts = {}) {
  const outDir = path.join(repoRoot, outDirOpt || 'modules/integration/compiled');
  ensureDir(outDir);
  const doClean = compileOpts.clean !== false;
  if (doClean) cleanJsonFilesInDir(outDir);

  const { warnings, errors, scenarios } = validate(repoRoot, scenariosDoc, { strict: false });

  const flowImplIndex = loadImplIndex(repoRoot);
  const implsByNode = indexImplsByFlowNode(flowImplIndex);

  const bindingsDoc = loadBindings(repoRoot);
  const { bindings, byId: bindingsById, byKey: bindingsByKey } = buildBindingMaps(bindingsDoc, warnings);

  const env = getModularEnv();
  if (!env) {
    const hasConditional = bindings.some(b => (b.conditions || []).some(c => Array.isArray(c.env) && c.env.length > 0));
    if (hasConditional) {
      warnings.push('Bindings include env conditions, but no MODULAR_ENV/ENVIRONMENT/NODE_ENV is set; compiling with default candidates.');
    }
  }

  const plans = [];
  for (const sc of scenarios) {
    const steps = [];
    for (const st of sc.steps) {
      const resolved = resolveEndpointForStep(st, implsByNode, bindingsById, bindingsByKey, env);
      const allowUnresolved =
        sc.allow_unresolved === true ||
        st.allow_unresolved === true ||
        (typeof sc.status === 'string' && sc.status.toLowerCase() === 'draft');

      if (!resolved.endpoint_id) {
        const msg = `[${sc.id}.${st.id}] unresolved endpoint for ${st.flow_id}.${st.node_id} (${resolved.resolution})`;
        if (!allowUnresolved) warnings.push(msg);
      }

      steps.push({
        id: st.id,
        flow_id: st.flow_id,
        node_id: st.node_id,
        endpoint_id: resolved.endpoint_id,
        binding_id: resolved.binding_id,
        resolution: resolved.resolution,
        input: st.input ?? null,
        expect: st.expect ?? null,
        allow_unresolved: st.allow_unresolved === true
      });
    }

    const plan = {
      id: sc.id,
      name: sc.name,
      description: sc.description,
      flow_id: sc.flow_id ?? null,
      compiledAt: isoNow(),
      env: env ?? null,
      steps
    };

    const outPath = path.join(outDir, `${sc.id}.json`);
    fs.writeFileSync(outPath, JSON.stringify(plan, null, 2) + '\n', 'utf8');
    plans.push({ id: sc.id, path: outPath });
  }

  const indexPath = path.join(outDir, 'index.json');
  fs.writeFileSync(indexPath, JSON.stringify({
    compiledAt: isoNow(),
    env: env ?? null,
    scenarios: plans.map(p => ({ id: p.id, file: path.basename(p.path) }))
  }, null, 2) + '\n', 'utf8');

  return { warnings, errors, plans, outDir, indexPath };
}

function lookupInterface(instanceRegistry, endpointId) {
  if (!endpointId) return null;
  const [moduleId, ifaceId] = endpointId.split(':');
  if (!moduleId || !ifaceId) return null;
  const mods = Array.isArray(instanceRegistry.modules) ? instanceRegistry.modules : [];
  const mod = mods.find(m => (m.module_id ?? m.moduleId) === moduleId);
  if (!mod) return null;
  const iface = (mod.interfaces || []).find(i => i.id === ifaceId);
  if (!iface) return null;
  return { moduleId, ifaceId, iface };
}

function toStrList(v) {
  if (typeof v === 'string' && v.trim().length > 0) return [v.trim()];
  if (Array.isArray(v)) return v.filter(s => typeof s === 'string' && s.trim().length > 0).map(s => s.trim());
  return [];
}

function toStatusList(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return [v];
  if (typeof v === 'string' && v.trim().length > 0) {
    const n = Number(v);
    if (Number.isFinite(n)) return [n];
  }
  if (Array.isArray(v)) return v.map(Number).filter(n => Number.isFinite(n));
  return [];
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
    return true;
  }
  if (typeof a === 'object') {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    for (const k of ka) {
      if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
      if (!deepEqual(a[k], b[k])) return false;
    }
    return true;
  }
  return false;
}

function deepContains(actual, expected) {
  if (expected === null || expected === undefined) return actual === expected;
  if (typeof expected !== 'object') return actual === expected;
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) return false;
    if (actual.length < expected.length) return false;
    for (let i = 0; i < expected.length; i++) if (!deepContains(actual[i], expected[i])) return false;
    return true;
  }
  if (!actual || typeof actual !== 'object') return false;
  for (const [k, v] of Object.entries(expected)) {
    if (!Object.prototype.hasOwnProperty.call(actual, k)) return false;
    if (!deepContains(actual[k], v)) return false;
  }
  return true;
}

function getByDotPath(obj, dotPath) {
  if (!dotPath || typeof dotPath !== 'string') return undefined;
  const parts = dotPath.split('.').filter(Boolean);
  let cur = obj;
  for (const p of parts) {
    if (cur === null || cur === undefined) return undefined;
    if (Array.isArray(cur)) {
      const idx = Number(p);
      if (!Number.isInteger(idx) || idx < 0 || idx >= cur.length) return undefined;
      cur = cur[idx];
      continue;
    }
    if (typeof cur !== 'object') return undefined;
    cur = cur[p];
  }
  return cur;
}

function evaluateExpect(httpStatus, bodyText, expect) {
  const default2xx = httpStatus >= 200 && httpStatus < 300;
  if (!expect || typeof expect !== 'object') {
    return { ok: default2xx, reason: default2xx ? null : `http_status_${httpStatus}`, checks: [] };
  }

  const checks = [];

  const allowedStatuses = [
    ...toStatusList(expect.status),
    ...toStatusList(expect.status_in)
  ];
  const statusOk = allowedStatuses.length > 0 ? allowedStatuses.includes(httpStatus) : default2xx;
  checks.push({ kind: 'status', ok: statusOk, expected: allowedStatuses.length > 0 ? allowedStatuses : '2xx', actual: httpStatus });
  if (!statusOk) return { ok: false, reason: `expect_status_${httpStatus}`, checks };

  const contains = toStrList(expect.body_contains);
  if (contains.length > 0) {
    const missing = contains.filter(s => !bodyText.includes(s));
    const ok = missing.length === 0;
    checks.push({ kind: 'body_contains', ok, missing, count: contains.length });
    if (!ok) return { ok: false, reason: 'expect_body_contains', checks };
  }

  const needsJson =
    expect.json_contains !== undefined ||
    expect.json_path_exists !== undefined ||
    expect.json_path_equals !== undefined;

  if (needsJson) {
    let parsed;
    try {
      parsed = JSON.parse(bodyText);
    } catch (e) {
      checks.push({ kind: 'json_parse', ok: false, error: String(e) });
      return { ok: false, reason: 'expect_json_parse', checks };
    }

    if (expect.json_contains !== undefined) {
      const ok = deepContains(parsed, expect.json_contains);
      checks.push({ kind: 'json_contains', ok });
      if (!ok) return { ok: false, reason: 'expect_json_contains', checks };
    }

    const exists = toStrList(expect.json_path_exists);
    if (exists.length > 0) {
      const missing = exists.filter(p => getByDotPath(parsed, p) === undefined);
      const ok = missing.length === 0;
      checks.push({ kind: 'json_path_exists', ok, missing });
      if (!ok) return { ok: false, reason: 'expect_json_path_exists', checks };
    }

    if (expect.json_path_equals && typeof expect.json_path_equals === 'object') {
      const failures = [];
      for (const [p, expected] of Object.entries(expect.json_path_equals)) {
        const actual = getByDotPath(parsed, p);
        if (!deepEqual(actual, expected)) failures.push({ path: p, expected, actual });
      }
      const ok = failures.length === 0;
      checks.push({ kind: 'json_path_equals', ok, failures: failures.slice(0, 5) });
      if (!ok) return { ok: false, reason: 'expect_json_path_equals', checks };
    }
  }

  return { ok: true, reason: null, checks };
}

async function execStep(repoRoot, runtimeCfg, instanceRegistry, step, execute) {
  const endpoint = lookupInterface(instanceRegistry, step.endpoint_id);
  if (!endpoint) {
    return { status: 'SKIPPED', reason: 'unresolved_endpoint', details: null };
  }

  const { moduleId, ifaceId, iface } = endpoint;
  const protocol = iface.protocol;

  if (!execute) {
    return { status: 'SKIPPED', reason: 'dry_run', details: { moduleId, ifaceId, protocol } };
  }

  if (protocol !== 'http') {
    return { status: 'SKIPPED', reason: `unsupported_protocol:${protocol}`, details: { moduleId, ifaceId, protocol } };
  }

  const base = getBaseUrl(runtimeCfg, moduleId);
  if (!base) {
    return { status: 'SKIPPED', reason: 'missing_base_url', details: { moduleId, env: `MODULE_BASE_URL_${sanitizeEnvKey(moduleId)}` } };
  }

  const url = base.replace(/\/+$/, '') + (iface.path || '/');
  const method = (iface.method || 'GET').toUpperCase();

  const headers = { 'content-type': 'application/json' };
  const body = step.input ? JSON.stringify(step.input) : undefined;

  try {
    const res = await fetch(url, { method, headers, body });
    const text = await res.text();
    const exp = evaluateExpect(res.status, text, step.expect);
    const ok = exp.ok;
    return {
      status: ok ? 'PASS' : 'FAIL',
      reason: ok ? null : exp.reason,
      details: {
        url,
        method,
        status: res.status,
        bodyPreview: text.slice(0, 500),
        checks: exp.checks
      }
    };
  } catch (e) {
    return {
      status: 'FAIL',
      reason: 'fetch_error',
      details: { message: String(e) }
    };
  }
}

async function runPlans(repoRoot, scenarioIdOpt, execute, outDirOpt) {
  const outDir = path.join(repoRoot, outDirOpt || 'modules/integration/runs');
  ensureDir(outDir);

  const compiledDir = path.join(repoRoot, 'modules/integration/compiled');
  if (!fs.existsSync(compiledDir)) die(`[error] compiled dir not found: ${compiledDir} (run compile first)`);

  const instanceRegistry = loadInstanceRegistry(repoRoot);
  const runtimeCfg = loadRuntimeEndpoints(repoRoot);

  // Runtime resolution (in case endpoint_id was not compiled, or env differs)
  const flowImplIndex = loadImplIndex(repoRoot);
  const implsByNode = indexImplsByFlowNode(flowImplIndex);
  const bindingsDoc = loadBindings(repoRoot);
  const bindWarnings = [];
  const { byId: bindingsById, byKey: bindingsByKey } = buildBindingMaps(bindingsDoc, bindWarnings);
  const env = getModularEnv(runtimeCfg);

  const loadPlan = (id) => {
    const p = path.join(compiledDir, `${id}.json`);
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  };

  const plans = [];
  const idx = path.join(compiledDir, 'index.json');
  if (!fs.existsSync(idx)) die(`[error] compiled index missing: ${idx} (run compile first)`);
  const indexDoc = JSON.parse(fs.readFileSync(idx, 'utf8'));
  const allowed = new Set((indexDoc.scenarios || []).map(s => s.id));

  if (scenarioIdOpt) {
    if (!allowed.has(scenarioIdOpt)) {
      die(`[error] scenario not present in compiled index: ${scenarioIdOpt} (run compile first)`);
    }
    const plan = loadPlan(scenarioIdOpt);
    if (!plan) die(`[error] compiled plan not found for scenario: ${scenarioIdOpt} (expected ${compiledDir}/${scenarioIdOpt}.json)`);
    plans.push(plan);
  } else {
    for (const sc of indexDoc.scenarios || []) {
      const plan = loadPlan(sc.id);
      if (plan) plans.push(plan);
    }
  }

  const runId = isoNow().replaceAll(':', '-').replaceAll('.', '-');
  const summary = {
    runId,
    startedAt: isoNow(),
    execute: !!execute,
    scenarios: []
  };

  for (const plan of plans) {
    const scRes = {
      id: plan.id,
      compiledAt: plan.compiledAt,
      startedAt: isoNow(),
      steps: [],
      status: 'PASS'
    };

    for (const step of plan.steps || []) {
      const stepRef = {
        flow_id: step.flow_id ?? step.flow,
        node_id: step.node_id ?? step.node,
        endpoint_id: step.endpoint_id ?? null,
        use_binding: step.binding_id ?? step.use_binding ?? null
      };

      let effectiveEndpointId = step.endpoint_id ?? null;
      let effectiveBindingId = step.binding_id ?? null;
      let effectiveResolution = step.resolution ?? null;

      if (!effectiveEndpointId && stepRef.flow_id && stepRef.node_id) {
        const resolved = resolveEndpointForStep(stepRef, implsByNode, bindingsById, bindingsByKey, env);
        effectiveEndpointId = resolved.endpoint_id;
        effectiveBindingId = resolved.binding_id ?? effectiveBindingId;
        effectiveResolution = resolved.resolution ?? effectiveResolution;
      }

      const r = await execStep(
        repoRoot,
        runtimeCfg,
        instanceRegistry,
        { ...step, endpoint_id: effectiveEndpointId, binding_id: effectiveBindingId, resolution: effectiveResolution },
        execute
      );
      scRes.steps.push({
        id: step.id,
        flow_id: stepRef.flow_id,
        node_id: stepRef.node_id,
        endpoint_id: effectiveEndpointId,
        binding_id: effectiveBindingId,
        resolution: effectiveResolution,
        ...r
      });
      if (r.status === 'FAIL') scRes.status = 'FAIL';
    }

    scRes.finishedAt = isoNow();
    summary.scenarios.push(scRes);

    const outPath = path.join(outDir, `${runId}__${plan.id}.json`);
    fs.writeFileSync(outPath, JSON.stringify(scRes, null, 2) + '\n', 'utf8');
  }

  summary.finishedAt = isoNow();

  const summaryPath = path.join(outDir, `${runId}__SUMMARY.json`);
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2) + '\n', 'utf8');

  // Write triage doc stub
  const triagePath = path.join(repoRoot, 'modules', 'integration', 'workdocs', `run_${runId}.md`);
  ensureDir(path.dirname(triagePath));
  const failures = summary.scenarios.flatMap(s => s.steps.filter(st => st.status === 'FAIL').map(st => ({ scenario: s.id, ...st })));
  const triageMd = [
    `# Integration run ${runId}`,
    ``,
    `- startedAt: ${summary.startedAt}`,
    `- finishedAt: ${summary.finishedAt}`,
    `- execute: ${summary.execute}`,
    ``,
    `## Failures`,
    failures.length === 0 ? `- None` : failures.map(f => `- **${f.scenario}.${f.id}** - ${f.reason || 'unknown'} (endpoint: ${f.endpoint_id || 'n/a'})`).join('\n'),
    ``,
    `## Next actions`,
    `- If failures are deterministic, create module-local workdocs under the owning module(s) and link them here.`,
    `- If failures are environment/config related, update .system/modular/runtime_endpoints.yaml or relevant module config.`,
    ``
  ].join('\n');
  fs.writeFileSync(triagePath, triageMd, 'utf8');

  return { summaryPath, triagePath, summary };
}

function cmdInit(repoRoot) {
  const dir = path.join(repoRoot, 'modules', 'integration');
  ensureDir(dir);
  ensureDir(path.join(dir, 'workdocs'));
  ensureDir(path.join(dir, 'compiled'));
  ensureDir(path.join(dir, 'runs'));

  const scenariosPath = path.join(dir, 'scenarios.yaml');
  if (!fs.existsSync(scenariosPath)) {
    fs.writeFileSync(scenariosPath, '# SSOT: Integration scenarios\n\nscenarios: []\n', 'utf8');
    console.log('[ok] created modules/integration/scenarios.yaml');
  }
}

function cmdNewScenario(repoRoot, opts) {
  cmdInit(repoRoot);

  const scenarioId = opts.id || null;
  const flowId = opts['flow-id'] || null;
  const nodes = String(opts.nodes || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  if (!scenarioId) die('[error] --id is required');
  if (!flowId) die('[error] --flow-id is required');
  if (!isValidId(scenarioId)) die(`[error] invalid scenario id: ${scenarioId}`);
  if (!isValidId(flowId)) die(`[error] invalid flow id: ${flowId}`);

  const { absPath, doc } = loadScenarios(repoRoot, opts.scenarios);
  const existing = normalizeScenarios(doc);
  if (existing.some(s => s.id === scenarioId)) die(`[error] scenario id already exists: ${scenarioId}`);

  // Best-effort validation against flow graph
  const flowGraph = loadFlowGraph(repoRoot);
  const { nodes: nodesByFlow, flows } = buildAdjacency(flowGraph);
  const knownFlow = flows.find(f => f.id === flowId);
  if (!knownFlow) {
    console.warn(`[warn] flow_id not found in .system/modular/flow_graph.yaml: ${flowId}`);
  } else if (nodes.length > 0) {
    const nodeSet = nodesByFlow.get(flowId) || new Set();
    const missing = nodes.filter(n => !nodeSet.has(n));
    if (missing.length > 0) console.warn(`[warn] unknown node(s) for flow ${flowId}: ${missing.join(', ')}`);
  }

  const scenario = {
    id: scenarioId,
    description: opts.description ?? null,
    flow_id: flowId,
    status: 'draft',
    steps: nodes.map(n => ({ name: n, flow_node: n }))
  };

  doc.scenarios = Array.isArray(doc.scenarios) ? doc.scenarios : [];
  doc.scenarios.push(scenario);

  const { raw } = loadScenariosText(repoRoot, opts.scenarios);
  const header = extractLeadingCommentBlock(raw);
  writeText(absPath, header + dumpYaml(doc));

  console.log(`[ok] added scenario: ${scenarioId}`);
  console.log(`[ok] updated ${path.relative(repoRoot, absPath)}`);
}

async function main() {
  const { command, opts } = parseArgs(process.argv);
  const repoRoot = path.resolve(opts['repo-root'] || process.cwd());

  switch (command) {
    case 'init': {
      cmdInit(repoRoot);
      break;
    }
    case 'new-scenario': {
      cmdNewScenario(repoRoot, opts);
      break;
    }
    case 'validate': {
      const { doc } = loadScenarios(repoRoot, opts.scenarios);
      const strict = !!opts.strict;
      const { warnings, errors } = validate(repoRoot, doc, { strict });
      if (warnings.length > 0) {
        console.log(`Warnings (${warnings.length}):`);
        for (const w of warnings) console.log(`- ${w}`);
      }
      if (errors.length > 0) {
        console.log(`\nErrors (${errors.length}):`);
        for (const e of errors) console.log(`- ${e}`);
        process.exit(1);
      }
      if (strict && warnings.length > 0) process.exit(1);
      console.log('\n[ok] scenario validation passed.');
      break;
    }
    case 'compile': {
      const { doc } = loadScenarios(repoRoot, opts.scenarios);
      const clean = !opts['no-clean'];
      const { warnings, errors, plans, outDir, indexPath } = compile(repoRoot, doc, opts['out-dir'], { clean });
      console.log(`[ok] wrote compiled scenarios to ${outDir}`);
      console.log(`[ok] wrote ${indexPath}`);
      if (warnings.length > 0) {
        console.log(`\nWarnings (${warnings.length}):`);
        for (const w of warnings) console.log(`- ${w}`);
      }
      if (errors.length > 0) {
        console.log(`\nErrors (${errors.length}):`);
        for (const e of errors) console.log(`- ${e}`);
        process.exit(1);
      }
      break;
    }
    case 'run': {
      const scenarioId = opts.scenario || null;
      const execute = !!opts.execute;
      const { summaryPath, triagePath, summary } = await runPlans(repoRoot, scenarioId, execute, opts['out-dir']);
      console.log(`[ok] wrote run summary: ${summaryPath}`);
      console.log(`[ok] wrote triage doc:  ${triagePath}`);
      const failures = summary.scenarios.filter(s => s.status === 'FAIL').length;
      console.log(`[info] scenarios: ${summary.scenarios.length}, failures: ${failures}`);
      if (failures > 0) process.exitCode = 1;
      break;
    }
    default:
      die(`[error] Unknown command: ${command}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

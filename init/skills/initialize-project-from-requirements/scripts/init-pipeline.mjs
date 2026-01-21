#!/usr/bin/env node
/**
 * init-pipeline.mjs
 *
 * Dependency-free helper for a 3-stage, verifiable init pipeline:
 *
 *   Stage A: requirements docs under `init/stage-a-docs/` (archived to `docs/project/` via cleanup-init --archive)
 *   Stage B: blueprint JSON at `init/project-blueprint.json` (archived to `docs/project/project-blueprint.json` via cleanup-init --archive)
 *   Stage C: minimal scaffold + skill pack manifest update + wrapper sync
 *
 * Commands:
 *   - start          Initialize state file and show next steps
 *   - status         Show current initialization progress
 *   - advance        Print the next checkpoint actions for the current stage
 *   - approve        Record explicit user approval and advance to the next stage
 *   - validate       Validate a blueprint JSON (no writes)
 *   - check-docs     Validate Stage A docs (structure + template placeholders)
 *   - mark-must-ask  Update Stage A must-ask checklist state
 *   - review-packs   Mark Stage B packs review as completed
 *   - suggest-packs  Recommend skill packs from blueprint capabilities (warn-only by default)
 *   - suggest-features Recommend features from blueprint capabilities
 *   - scaffold       Plan or apply a minimal directory scaffold from the blueprint
 *   - apply          validate + (optional) check-docs + scaffold + configs + pack enable + wrapper sync
 *   - cleanup-init   Remove the `init/` bootstrap kit (opt-in, guarded)
 *
 * This script is intentionally framework-agnostic. It avoids generating code.
 */

import fs from 'fs';
import path from 'path';
import childProcess from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function usage(exitCode = 0) {
  const msg = `
Usage:
  node init/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs <command> [options]

Commands:
  start
    --repo-root <path>          Repo root (default: cwd)
    Initialize state file and show next steps.

  status
    --repo-root <path>          Repo root (default: cwd)
    --format <text|json>        Output format (default: text)
    Show current initialization progress.

  advance
    --repo-root <path>          Repo root (default: cwd)
    Print the next checkpoint actions for the current stage.

  approve
    --repo-root <path>          Repo root (default: cwd)
    --stage <A|B|C>             Stage to approve (default: current state.stage)
    --note <text>               Optional audit note
    Record explicit user approval and advance state to the next stage.

  validate
    --blueprint <path>          Blueprint JSON path (default: init/project-blueprint.json)
    --repo-root <path>          Repo root (default: cwd)
    --format <text|json>        Output format (default: text)

  check-docs
    --docs-root <path>          Stage A docs root (default: <repo-root>/init/stage-a-docs)
    --repo-root <path>          Repo root (default: cwd)
    --strict                    Treat warnings as errors (exit non-zero)
    --format <text|json>        Output format (default: text)

  mark-must-ask
    --key <id>                  Must-ask key (required)
    --asked                     Mark as asked
    --answered                  Mark as answered
    --written-to <path>         Record where the answer was written
    --repo-root <path>          Repo root (default: cwd)

  review-packs
    --repo-root <path>          Repo root (default: cwd)
    --note <text>               Optional audit note

  suggest-packs
    --blueprint <path>          Blueprint JSON path (default: init/project-blueprint.json)
    --repo-root <path>          Repo root (default: cwd)
    --format <text|json>        Output format (default: text)
    --write                     Add missing recommended packs into blueprint (safe-add only)

  suggest-features
    --blueprint <path>          Blueprint JSON path (default: init/project-blueprint.json)
    --repo-root <path>          Repo root (default: cwd)
    --format <text|json>        Output format (default: text)
    --write                     Add missing recommended features into blueprint (safe-add only)

  scaffold
    --blueprint <path>          Blueprint JSON path (default: init/project-blueprint.json)
    --repo-root <path>          Repo root (default: cwd)
    --apply                     Actually create directories/files (default: dry-run)

  apply
    --blueprint <path>          Blueprint JSON path (default: init/project-blueprint.json)
    --repo-root <path>          Repo root (default: cwd)
    --providers <both|codex|claude|codex,claude>
    --require-stage-a           Refuse apply if Stage A docs invalid
    --skip-configs              Do not generate config files
    --cleanup-init              Run cleanup-init after apply

    Feature install controls:
    --force-features            Overwrite existing feature files when materializing templates
    --verify-features           Run feature verify commands after installation (when available)
    --non-blocking-features     Continue on feature errors (default: fail-fast)

    --format <text|json>        Output format (default: text)

  cleanup-init
    --repo-root <path>          Repo root (default: cwd)
    --apply                     Actually remove init/ (default: dry-run)
    --i-understand              Required acknowledgement (refuses without it)
    --archive                   Archive all (Stage A docs + blueprint) to docs/project/
    --archive-docs              Archive Stage A docs only to docs/project/
    --archive-blueprint         Archive blueprint only to docs/project/

Examples:
  node .../init-pipeline.mjs start
  node .../init-pipeline.mjs status
  node .../init-pipeline.mjs check-docs --strict
  node .../init-pipeline.mjs validate
  node .../init-pipeline.mjs apply --providers both
  node .../init-pipeline.mjs cleanup-init --apply --i-understand --archive
  node .../init-pipeline.mjs approve --stage A
`;
  console.log(msg.trim());
  process.exit(exitCode);
}

function die(msg, exitCode = 1) {
  console.error(msg);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  if (args.length === 0 || args[0] === 'help' || args[0] === '-h' || args[0] === '--help') usage(0);

  const command = args.shift();
  const opts = {};
  const positionals = [];

  while (args.length > 0) {
    const token = args.shift();
    if (token === '-h' || token === '--help') usage(0);

    if (token.startsWith('--')) {
      const key = token.slice(2);
      if (args.length > 0 && !args[0].startsWith('--')) {
        opts[key] = args.shift();
      } else {
        opts[key] = true;
      }
    } else {
      positionals.push(token);
    }
  }

  return { command, opts, positionals };
}

function resolvePath(base, p) {
  if (!p) return null;
  if (path.isAbsolute(p)) return p;
  return path.resolve(base, p);
}

function readJson(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    die(`[error] Failed to read JSON: ${filePath}\n${e.message}`);
  }
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function uniq(arr) {
  return Array.from(new Set(arr));
}

function isInteractiveTty() {
  return !!(process.stdin && process.stdin.isTTY && process.stdout && process.stdout.isTTY);
}

function readLineSync(prompt) {
  process.stdout.write(prompt);
  const buf = Buffer.alloc(1);
  let line = '';
  while (true) {
    let bytes = 0;
    try {
      bytes = fs.readSync(0, buf, 0, 1, null);
    } catch {
      break;
    }
    if (bytes === 0) break;
    const ch = buf.toString('utf8', 0, bytes);
    if (ch === '\n') break;
    if (ch === '\r') continue;
    line += ch;
  }
  return line.trim();
}

function promptYesNoSync(question, defaultYes) {
  const suffix = defaultYes ? ' [Y/n] ' : ' [y/N] ';
  for (let i = 0; i < 3; i += 1) {
    const ans = readLineSync(`${question}${suffix}`).toLowerCase();
    if (!ans) return defaultYes;
    if (ans === 'y' || ans === 'yes') return true;
    if (ans === 'n' || ans === 'no') return false;
    console.log('[info] Please answer: y/yes or n/no.');
  }
  return defaultYes;
}

function ensurePathWithinRepo(repoRoot, targetPath, label) {
  const rr = path.resolve(repoRoot);
  const tp = path.resolve(targetPath);
  if (tp === rr || !tp.startsWith(rr + path.sep)) {
    die(`[error] Refusing to operate outside repo root for ${label}: ${tp}`);
  }
}

function removeDirRecursive(dirPath) {
  try {
    fs.rmSync(dirPath, { recursive: true, force: true });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ============================================================================
// State Management
// ============================================================================

const SCRIPT_DIR = __dirname;
const TEMPLATES_DIR = path.join(SCRIPT_DIR, '..', 'templates');

function getStatePath(repoRoot) {
  return path.join(repoRoot, 'init', '.init-state.json');
}

function createInitialState() {
  return {
    version: 1,
    stage: 'A',
    createdAt: new Date().toISOString(),
    'stage-a': {
      mustAsk: {
        terminologyAlignment: { asked: false, answered: false, writtenTo: null },
        onePurpose: { asked: false, answered: false, writtenTo: null },
        userRoles: { asked: false, answered: false, writtenTo: null },
        mustRequirements: { asked: false, answered: false, writtenTo: null },
        outOfScope: { asked: false, answered: false, writtenTo: null },
        userJourneys: { asked: false, answered: false, writtenTo: null },
        constraints: { asked: false, answered: false, writtenTo: null },
        successMetrics: { asked: false, answered: false, writtenTo: null }
      },
      docsWritten: {
        requirements: false,
        nfr: false,
        glossary: false,
        riskQuestions: false
      },
      validated: false,
      userApproved: false
    },
    'stage-b': {
      drafted: false,
      validated: false,
      packsReviewed: false,
      userApproved: false
    },
    'stage-c': {
      scaffoldApplied: false,
      configsGenerated: false,
      manifestUpdated: false,
      wrappersSynced: false,
      userApproved: false
    },
    history: []
  };
}

function loadState(repoRoot) {
  const statePath = getStatePath(repoRoot);
  if (!fs.existsSync(statePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(statePath, 'utf8'));
  } catch (e) {
    console.error(`[warn] Failed to parse state file: ${e.message}`);
    return null;
  }
}

function saveState(repoRoot, state) {
  const statePath = getStatePath(repoRoot);
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n', 'utf8');
}

function addHistoryEvent(state, event, details) {
  state.history = state.history || [];
  state.history.push({
    timestamp: new Date().toISOString(),
    event,
    details
  });
}

function getStageProgress(state) {
  const stage_a = state['stage-a'] || {};
  const stage_b = state['stage-b'] || {};
  const stage_c = state['stage-c'] || {};

  const mustAskKeys = Object.keys(stage_a.mustAsk || {});
  const mustAskAnswered = mustAskKeys.filter(k => stage_a.mustAsk[k]?.answered).length;

  const docsKeys = ['requirements', 'nfr', 'glossary', 'riskQuestions'];
  const docsWritten = docsKeys.filter(k => stage_a.docsWritten?.[k]).length;

  return {
    stage: state.stage,
    'stage-a': {
      mustAskTotal: mustAskKeys.length,
      mustAskAnswered,
      docsTotal: docsKeys.length,
      docsWritten,
      validated: !!stage_a.validated,
      userApproved: !!stage_a.userApproved
    },
    'stage-b': {
      drafted: !!stage_b.drafted,
      validated: !!stage_b.validated,
      packsReviewed: !!stage_b.packsReviewed,
      userApproved: !!stage_b.userApproved
    },
    'stage-c': {
      scaffoldApplied: !!stage_c.scaffoldApplied,
      configsGenerated: !!stage_c.configsGenerated,
      manifestUpdated: !!stage_c.manifestUpdated,
      wrappersSynced: !!stage_c.wrappersSynced,
      userApproved: !!stage_c.userApproved
    }
  };
}

function printStatus(state, repoRoot) {
  const progress = getStageProgress(state);
  const stageNames = { A: 'Requirements', B: 'Blueprint', C: 'Scaffold', complete: 'Complete' };
  const stage_a = progress['stage-a'] || {};
  const stage_b = progress['stage-b'] || {};
  const stage_c = progress['stage-c'] || {};

  console.log('');
  console.log('┌─────────────────────────────────────────────────────────┐');
  console.log('│  Init Status                                            │');
  console.log('├─────────────────────────────────────────────────────────┤');
  console.log(`│  Current stage: Stage ${progress.stage} - ${stageNames[progress.stage] || progress.stage}`);
  console.log('│');

  if (progress.stage === 'A' || progress.stage === 'B' || progress.stage === 'C') {
    console.log('│  Stage A progress:');
    console.log(`│    Must-ask checklist: ${stage_a.mustAskAnswered}/${stage_a.mustAskTotal} complete`);
    console.log(`│    Docs written: ${stage_a.docsWritten}/${stage_a.docsTotal} complete`);
    console.log(`│    Validation: ${stage_a.validated ? '✓ validated' : '✗ not validated'}`);
    console.log(`│    User approval: ${stage_a.userApproved ? '✓ approved' : '✗ not approved'}`);
  }

  if (progress.stage === 'B' || progress.stage === 'C') {
    console.log('│');
    console.log('│  Stage B progress:');
    console.log(`│    Drafted: ${stage_b.drafted ? '✓' : '✗'}`);
    console.log(`│    Validated: ${stage_b.validated ? '✓' : '✗'}`);
    console.log(`│    Packs reviewed: ${stage_b.packsReviewed ? '✓' : '✗'}`);
    console.log(`│    User approval: ${stage_b.userApproved ? '✓' : '✗'}`);
  }

  if (progress.stage === 'C' || progress.stage === 'complete') {
    console.log('│');
    console.log('│  Stage C progress:');
    console.log(`│    Scaffold applied: ${stage_c.scaffoldApplied ? '✓' : '✗'}`);
    console.log(`│    Configs generated: ${stage_c.configsGenerated ? '✓' : '✗'}`);
    console.log(`│    Manifest updated: ${stage_c.manifestUpdated ? '✓' : '✗'}`);
    console.log(`│    Wrappers synced: ${stage_c.wrappersSynced ? '✓' : '✗'}`);
  }

  console.log('│');
  console.log('│  Next steps:');
  if (progress.stage === 'A') {
    if (!stage_a.validated) {
      console.log('│    1. Complete the requirements interview and write the docs');
      console.log('│    2. Run: check-docs --strict');
    } else if (!stage_a.userApproved) {
      console.log('│    Have the user review the Stage A docs and explicitly approve');
      console.log('│    Then run: advance');
    }
  } else if (progress.stage === 'B') {
    if (!stage_b.validated) {
      console.log('│    1. Edit init/project-blueprint.json');
      console.log('│    2. Run: validate --blueprint init/project-blueprint.json');
    } else if (!stage_b.userApproved) {
      console.log('│    Have the user review the blueprint and explicitly approve');
      console.log('│    Then run: advance');
    }
  } else if (progress.stage === 'C') {
    if (!stage_c.wrappersSynced) {
      console.log('│    Run: apply --blueprint init/project-blueprint.json');
    } else if (!stage_c.userApproved) {
      console.log('│    Initialization is mostly complete; ask the user to confirm');
      console.log('│    Then optionally run: cleanup-init --apply --i-understand');
    }
  } else if (progress.stage === 'complete') {
    console.log('│    Initialization complete!');
  }

  console.log('└─────────────────────────────────────────────────────────┘');
  console.log('');
}

// ============================================================================
// Config File Generation
// ============================================================================

// Import from scaffold-configs.mjs (single source of truth)
import { generateConfigFiles as genConfigFiles } from './scaffold-configs.mjs';

function generateConfigFiles(repoRoot, blueprint, apply) {
  return genConfigFiles(repoRoot, blueprint, apply);
}

function packPrefixMap() {
  // Must match actual .ai/skills/ directory structure
  return {
    workflows: 'workflows/',
    standards: 'standards/',
    testing: 'testing/',
    'context-core': 'features/context-awareness',
    backend: 'backend/',
    frontend: 'frontend/'
  };
}

function packOrder() {
  // Base packs available in template (matches .ai/skills/_meta/packs/)
  return ['workflows', 'standards', 'testing', 'context-core', 'backend', 'frontend'];
}

function normalizePackList(packs) {
  const cleaned = (packs || [])
    .filter((p) => typeof p === 'string')
    .map((p) => p.trim())
    .filter(Boolean);

  const order = packOrder();
  const ordered = [];
  for (const p of order) {
    if (cleaned.includes(p)) ordered.push(p);
  }
  for (const p of cleaned) {
    if (!ordered.includes(p)) ordered.push(p);
  }
  return uniq(ordered);
}

function validateBlueprint(blueprint) {
  const errors = [];
  const warnings = [];

  if (!blueprint || typeof blueprint !== 'object') {
    errors.push('Blueprint must be a JSON object.');
    return { ok: false, errors, warnings };
  }

  if (!Number.isInteger(blueprint.version) || blueprint.version < 1) {
    errors.push('Blueprint.version must be an integer >= 1.');
  }

  // Feature flags
  if (blueprint.features !== undefined) {
    if (blueprint.features === null || Array.isArray(blueprint.features) || typeof blueprint.features !== 'object') {
      errors.push('features must be an object when present.');
    }
  }
  if (blueprint.addons !== undefined) {
    errors.push('addons is not supported. Use features.* instead.');
  }

  const project = blueprint.project || {};
  if (!project.name || typeof project.name !== 'string') errors.push('project.name is required (string).');
  if (!project.description || typeof project.description !== 'string') errors.push('project.description is required (string).');

  const repo = blueprint.repo || {};
  const validLayouts = ['single', 'monorepo'];
  if (!repo.layout || !validLayouts.includes(repo.layout)) {
    errors.push(`repo.layout is required and must be one of: ${validLayouts.join(', ')}`);
  }
  if (!repo.language || typeof repo.language !== 'string') {
    errors.push('repo.language is required (string).');
  }
  if (!repo.packageManager || typeof repo.packageManager !== 'string') {
    errors.push('repo.packageManager is required (string).');
  }

  // Capabilities sanity checks (warn-only unless obviously inconsistent)
  const caps = blueprint.capabilities || {};
  if (caps.database && caps.database.enabled) {
    if (!caps.database.kind || typeof caps.database.kind !== 'string') warnings.push('capabilities.database.enabled=true but capabilities.database.kind is missing.');
  }
  if (caps.api && caps.api.style && typeof caps.api.style !== 'string') warnings.push('capabilities.api.style should be a string.');
  if (caps.bpmn && typeof caps.bpmn.enabled !== 'boolean') warnings.push('capabilities.bpmn.enabled should be boolean when present.');



  // DB SSOT mode checks (mutually exclusive DB schema workflows)
  const db = blueprint.db || {};
  const validSsot = ['none', 'repo-prisma', 'database'];
  if (typeof db.enabled !== 'boolean') {
    errors.push('db.enabled is required (boolean).');
  }
  if (!db.ssot || typeof db.ssot !== 'string' || !validSsot.includes(db.ssot)) {
    errors.push(`db.ssot is required and must be one of: ${validSsot.join(', ')}`);
  }

  const flags = featureFlags(blueprint);
  if (Object.prototype.hasOwnProperty.call(flags, 'dbMirror')) {
    errors.push('features.dbMirror is not supported. Use features.database instead.');
  }

  const databaseEnabled = isDatabaseEnabled(blueprint);

  if (db.ssot !== 'none' && !databaseEnabled) {
    errors.push('db.ssot != none requires features.database=true (Database feature).');
  }
  if (db.ssot === 'none' && databaseEnabled) {
    errors.push('features.database=true is only valid when db.ssot != none.');
  }

  // Feature dependencies
  if (isObservabilityEnabled(blueprint) && !isContextAwarenessEnabled(blueprint)) {
    errors.push('features.observability=true requires features.contextAwareness=true (observability contracts live under docs/context/).');
  }

  // CI feature requirements
  if (isCiEnabled(blueprint)) {
    const provider = ciProvider(blueprint);
    if (!provider) {
      const ci = blueprint.ci && typeof blueprint.ci === 'object' ? blueprint.ci : {};
      const platform = String(ci.platform || '').toLowerCase();
      const hint =
        platform === 'github-actions' ? ' (hint: set ci.provider=\"github\")'
        : platform === 'gitlab-ci' ? ' (hint: set ci.provider=\"gitlab\")'
        : '';
      errors.push(`features.ci=true requires ci.provider to be \"github\" or \"gitlab\".${hint}`);
    }
  }

  if ((caps.database && caps.database.enabled) && db.ssot === 'none') {
    warnings.push('capabilities.database.enabled=true but db.ssot=none. The template will not manage schema synchronization.');
  }
  if ((!caps.database || !caps.database.enabled) && db.ssot !== 'none') {
    warnings.push('db.ssot is not none, but capabilities.database.enabled is false. Ensure this is intentional.');
  }
  const skills = blueprint.skills || {};
  if (skills.packs && !Array.isArray(skills.packs)) errors.push('skills.packs must be an array of strings when present.');

  const packs = normalizePackList(skills.packs || []);
  if (!packs.includes('workflows')) warnings.push('skills.packs does not include "workflows". This is usually required.');
  if (!packs.includes('standards')) warnings.push('skills.packs does not include "standards". This is usually recommended.');

  const ok = errors.length === 0;
  return { ok, errors, warnings, packs };
}

function featureFlags(blueprint) {
  if (!blueprint || typeof blueprint !== 'object') return {};
  const features = blueprint.features;
  if (!features || Array.isArray(features) || typeof features !== 'object') return {};
  return features;
}

function isContextAwarenessEnabled(blueprint) {
  const flags = featureFlags(blueprint);
  // Only feature flags trigger materialization; context.* is configuration only
  return flags.contextAwareness === true;
}


function recommendedPacksFromBlueprint(blueprint) {
  const rec = new Set(['workflows', 'standards']);
  const caps = blueprint.capabilities || {};

  if (caps.backend && caps.backend.enabled) rec.add('backend');
  if (caps.frontend && caps.frontend.enabled) rec.add('frontend');

  // Optional packs can be added explicitly via blueprint.skills.packs.
  // (This function only computes recommendations; it does NOT mutate the blueprint.)

  const ordered = [];
  for (const p of packOrder()) {
    if (rec.has(p)) ordered.push(p);
  }
  return ordered;
}

function recommendedFeaturesFromBlueprint(blueprint) {
  const rec = [];
  const caps = blueprint.capabilities || {};
  const q = blueprint.quality || {};
  const devops = blueprint.devops || {};

  // context-awareness: enabled when API/database/BPMN are enabled
  // Note: api.style is checked because schema uses api.style (not api.enabled)
  const needsContext =
    (caps.api && (caps.api.enabled || (caps.api.style && caps.api.style !== 'none'))) ||
    (caps.database && caps.database.enabled) ||
    (caps.bpmn && caps.bpmn.enabled);
  if (needsContext) rec.push('contextAwareness');

  // database: enable when DB SSOT is managed (repo-prisma or database)
  const db = blueprint.db || {};
  if (db.ssot && db.ssot !== 'none') rec.push('database');

  // ui: enable when a frontend capability exists
  if (caps.frontend && caps.frontend.enabled) rec.push('ui');

  // packaging: enabled when containerization/packaging is configured
  const packagingEnabled =
    (blueprint.packaging && blueprint.packaging.enabled) ||
    (devops.packaging && devops.packaging.enabled) ||
    devops.enabled === true ||
    (q.devops && (q.devops.enabled || q.devops.containerize || q.devops.packaging));
  if (packagingEnabled) rec.push('packaging');

  // deployment: enabled when deployment is configured
  const deploymentEnabled =
    (devops.deploy && devops.deploy.enabled) ||
    devops.enabled === true ||
    (blueprint.deploy && blueprint.deploy.enabled) ||
    (q.devops && (q.devops.enabled || q.devops.deployment));
  if (deploymentEnabled) rec.push('deployment');

  // environment: recommend when the project likely needs env var contracts
  const envLikely =
    (caps.backend && caps.backend.enabled) ||
    packagingEnabled ||
    deploymentEnabled ||
    (blueprint.observability && blueprint.observability.enabled);
  if (envLikely) rec.push('environment');

  // release: enabled when release management is configured
  const releaseEnabled =
    (blueprint.release && blueprint.release.enabled);
  if (releaseEnabled) rec.push('release');

  // ci: recommend when CI is explicitly configured/enabled
  const ciCfg = blueprint.ci && typeof blueprint.ci === 'object' ? blueprint.ci : {};
  const ciRecommended =
    ciCfg.enabled === true ||
    (q.ci && typeof q.ci === 'object' && q.ci.enabled === true);
  if (ciRecommended) rec.push('ci');

  // observability: enabled when observability is configured
  const observabilityEnabled =
    (blueprint.observability && blueprint.observability.enabled);
  if (observabilityEnabled) rec.push('observability');

  return rec;
}

function getEnabledFeatures(blueprint) {
  const enabled = [];
  
  if (isContextAwarenessEnabled(blueprint)) enabled.push('contextAwareness');
  if (isDatabaseEnabled(blueprint)) enabled.push('database');
  if (isUiEnabled(blueprint)) enabled.push('ui');
  if (isEnvironmentEnabled(blueprint)) enabled.push('environment');
  if (isPackagingEnabled(blueprint)) enabled.push('packaging');
  if (isDeploymentEnabled(blueprint)) enabled.push('deployment');
  if (isReleaseEnabled(blueprint)) enabled.push('release');
  if (isCiEnabled(blueprint)) enabled.push('ci');
  if (isObservabilityEnabled(blueprint)) enabled.push('observability');
  
  return enabled;
}

function checkPackInstall(repoRoot, pack) {
  const packFile = path.join(repoRoot, '.ai', 'skills', '_meta', 'packs', `${pack}.json`);
  if (fs.existsSync(packFile)) {
    return { pack, installed: true, via: 'pack-file', path: path.relative(repoRoot, packFile) };
  }

  // Back-compat for repos without pack files: infer install by prefix presence
  const prefix = packPrefixMap()[pack];
  if (!prefix) return { pack, installed: false, reason: 'missing pack-file and no prefix mapping' };

  const dir = path.join(repoRoot, '.ai', 'skills', prefix.replace(/\/$/, ''));
  if (!fs.existsSync(dir)) return { pack, installed: false, reason: `missing ${path.relative(repoRoot, dir)}` };
  return { pack, installed: true, via: 'prefix-dir', path: path.relative(repoRoot, dir) };
}

function printResult(result, format) {
  if (format === 'json') {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  // text
  if (result.summary) console.log(result.summary);
  if (result.errors && result.errors.length > 0) {
    console.log('\nErrors:');
    for (const e of result.errors) console.log(`- ${e}`);
  }
  if (result.warnings && result.warnings.length > 0) {
    console.log('\nWarnings:');
    for (const w of result.warnings) console.log(`- ${w}`);
  }
}

function checkDocs(docsRoot) {
  const errors = [];
  const warnings = [];

  // Check if docs directory exists
  if (!fs.existsSync(docsRoot)) {
    return {
      ok: false,
      errors: [
        `Stage A docs directory not found: ${docsRoot}`,
        `Run: node init/skills/initialize-project-from-requirements/scripts/init-pipeline.mjs start --repo-root <repo-root>`
      ],
      warnings: []
    };
  }

  const required = [
    { name: 'requirements.md', mustContain: ['# Requirements', '## Conclusions', '## Goals', '## Non-goals'] },
    { name: 'non-functional-requirements.md', mustContain: ['# Non-functional Requirements', '## Conclusions'] },
    { name: 'domain-glossary.md', mustContain: ['# Domain Glossary', '## Terms'] },
    { name: 'risk-open-questions.md', mustContain: ['# Risks and Open Questions', '## Open questions'] }
  ];

  const placeholderPatterns = [
    { re: /<[^>\n]{1,80}>/g, msg: 'template placeholder "<...>"' },
    { re: /^\s*[-*]\s*\.\.\.\s*$/gm, msg: 'placeholder bullet "- ..."' },
    { re: /:\s*\.\.\.\s*$/gm, msg: 'placeholder value ": ..."' }
  ];

  const missingFiles = [];
  for (const spec of required) {
    const fp = path.join(docsRoot, spec.name);
    if (!fs.existsSync(fp)) {
      missingFiles.push(spec.name);
      errors.push(`Missing required Stage A doc: ${path.relative(process.cwd(), fp)}`);
      continue;
    }
    const content = fs.readFileSync(fp, 'utf8');

    for (const needle of spec.mustContain) {
      if (!content.includes(needle)) {
        errors.push(`${spec.name} is missing required section/heading: "${needle}"`);
      }
    }

    for (const pat of placeholderPatterns) {
      const hits = content.match(pat.re);
      if (hits && hits.length > 0) {
        errors.push(`${spec.name} still contains ${pat.msg}. Replace all template placeholders.`);
      }
    }

    // Soft signals
    if (content.includes('TODO') || content.includes('FIXME')) {
      warnings.push(`${spec.name} contains TODO/FIXME markers. Ensure they are tracked in risk-open-questions.md or removed.`);
    }
    if (/\bTBD\b/i.test(content)) {
      warnings.push(`${spec.name} contains TBD items. Ensure each TBD is linked to an owner/options/decision due.`);
    }
  }

  // Add hint if files are missing
  if (missingFiles.length > 0) {
    errors.push(`Hint: Run "scaffold --blueprint <path> --apply" to create missing template files`);
  }

  return { ok: errors.length === 0, errors, warnings };
}

function ensureDir(dirPath, apply) {
  if (fs.existsSync(dirPath)) return { op: 'skip', path: dirPath, reason: 'exists' };
  if (!apply) return { op: 'mkdir', path: dirPath, mode: 'dry-run' };
  fs.mkdirSync(dirPath, { recursive: true });
  return { op: 'mkdir', path: dirPath, mode: 'applied' };
}

function writeFileIfMissing(filePath, content, apply) {
  if (fs.existsSync(filePath)) return { op: 'skip', path: filePath, reason: 'exists' };
  if (!apply) return { op: 'write', path: filePath, mode: 'dry-run' };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  return { op: 'write', path: filePath, mode: 'applied' };
}

function ensureSkillRetentionTemplate(repoRoot, apply) {
  const srcPath = path.join(TEMPLATES_DIR, 'skill-retention-table.template.md');
  const destPath = path.join(repoRoot, 'init', 'skill-retention-table.template.md');

  if (!fs.existsSync(srcPath)) {
    return { op: 'copy', path: destPath, mode: 'skipped', reason: 'template not found' };
  }
  if (fs.existsSync(destPath)) {
    return { op: 'copy', path: destPath, mode: 'skipped', reason: 'exists' };
  }
  if (!apply) return { op: 'copy', path: destPath, mode: 'dry-run' };
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.copyFileSync(srcPath, destPath);
  return { op: 'copy', path: destPath, mode: 'applied' };
}

/**
 * Generates a project-specific README.md from the blueprint.
 * Replaces the template README with project information.
 */
function generateProjectReadme(repoRoot, blueprint, apply) {
  const readmePath = path.join(repoRoot, 'README.md');
  const templatePath = path.join(__dirname, 'templates', 'README.template.md');
  
  if (!fs.existsSync(templatePath)) {
    return { op: 'skip', path: readmePath, reason: 'template not found' };
  }
  
  let template = fs.readFileSync(templatePath, 'utf8');
  
  const project = blueprint.project || {};
  const repo = blueprint.repo || {};
  const caps = blueprint.capabilities || {};
  
  // Simple mustache-like replacement
  function replace(key, value) {
    template = template.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value || '');
  }
  
  function conditionalBlock(key, value, show) {
    const regex = new RegExp(`\\{\\{#${key}\\}\\}([\\s\\S]*?)\\{\\{/${key}\\}\\}`, 'g');
    if (show && value) {
      template = template.replace(regex, (_, content) => content.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value));
    } else {
      template = template.replace(regex, '');
    }
  }
  
  // Basic replacements
  replace('PROJECT_NAME', project.name || 'my-project');
  replace('PROJECT_DESCRIPTION', project.description || 'Project description');
  replace('LANGUAGE', repo.language || 'typescript');
  replace('PACKAGE_MANAGER', repo.packageManager || 'pnpm');
  replace('REPO_LAYOUT', repo.layout || 'single');
  
  // Conditional blocks
  conditionalBlock('DOMAIN', project.domain, !!project.domain);
  conditionalBlock('FRONTEND_FRAMEWORK', caps.frontend?.framework, caps.frontend?.enabled);
  conditionalBlock('BACKEND_FRAMEWORK', caps.backend?.framework, caps.backend?.enabled);
  conditionalBlock('DATABASE_KIND', caps.database?.kind, caps.database?.enabled);
  conditionalBlock('API_STYLE', caps.api?.style, !!caps.api?.style);

  // Table-friendly values (avoid empty cells in README templates)
  replace('FRONTEND_FRAMEWORK', caps.frontend?.enabled ? (caps.frontend?.framework || 'TBD') : 'none');
  replace('BACKEND_FRAMEWORK', caps.backend?.enabled ? (caps.backend?.framework || 'TBD') : 'none');
  replace('DATABASE_KIND', caps.database?.enabled ? (caps.database?.kind || 'TBD') : 'none');
  replace('API_STYLE', caps.api?.style || 'none');
  
  // Language-specific blocks
  const isNode = ['typescript', 'javascript'].includes(repo.language);
  const isPython = repo.language === 'python';
  const isGo = repo.language === 'go';
  
  conditionalBlock('IS_NODE', 'true', isNode);
  conditionalBlock('IS_PYTHON', 'true', isPython);
  conditionalBlock('IS_GO', 'true', isGo);
  
  // Install and dev commands based on package manager
  const installCommands = {
    pnpm: 'pnpm install',
    npm: 'npm install',
    yarn: 'yarn',
    pip: 'pip install -r requirements.txt',
    poetry: 'poetry install',
    go: 'go mod download'
  };
  
  const devCommands = {
    pnpm: 'pnpm dev',
    npm: 'npm run dev',
    yarn: 'yarn dev',
    pip: 'python main.py',
    poetry: 'poetry run python main.py',
    go: 'go run .'
  };
  
  const testCommands = {
    pnpm: 'pnpm test',
    npm: 'npm test',
    yarn: 'yarn test',
    pip: 'pytest',
    poetry: 'poetry run pytest',
    go: 'go test ./...'
  };
  
  const pm = repo.packageManager || 'pnpm';
  replace('INSTALL_COMMAND', installCommands[pm] || installCommands.pnpm);
  replace('DEV_COMMAND', devCommands[pm] || devCommands.pnpm);
  replace('TEST_COMMAND', testCommands[pm] || testCommands.pnpm);
  
  // Project structure based on layout
  let structure;
  if (repo.layout === 'monorepo') {
    structure = `├── apps/
│   ├── frontend/       # Frontend application
│   └── backend/        # Backend services
├── packages/
│   └── shared/         # Shared libraries
├── .ai/skills/         # AI skills (SSOT)
├── docs/               # Documentation
└── ops/                # DevOps configuration`;
  } else {
    structure = `├── src/
│   ├── frontend/       # Frontend code
│   └── backend/        # Backend code
├── .ai/skills/         # AI skills (SSOT)
├── docs/               # Documentation
└── ops/                # DevOps configuration`;
  }
  replace('PROJECT_STRUCTURE', structure);
  
  // Clean up any remaining empty conditional blocks
  template = template.replace(/\{\{#\w+\}\}[\s\S]*?\{\{\/\w+\}\}/g, '');
  template = template.replace(/\{\{\w+\}\}/g, '');
  
  // Clean up multiple empty lines
  template = template.replace(/\n{3,}/g, '\n\n');
  
  if (!apply) {
    return { op: 'write', path: readmePath, mode: 'dry-run' };
  }
  
  fs.writeFileSync(readmePath, template, 'utf8');
  return { op: 'write', path: readmePath, mode: 'applied' };
}

function copyFileIfMissing(srcPath, destPath, apply) {
  if (fs.existsSync(destPath)) {
    return { op: 'skip', path: destPath, reason: 'exists' };
  }
  if (!fs.existsSync(srcPath)) {
    return { op: 'skip', path: destPath, reason: 'source not found', srcPath };
  }
  if (!apply) {
    return { op: 'copy-template', from: srcPath, path: destPath, mode: 'dry-run' };
  }
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.copyFileSync(srcPath, destPath);
  return { op: 'copy-template', from: srcPath, path: destPath, mode: 'applied' };
}

function listFilesRecursive(dir) {
  const out = [];
  function walk(current) {
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(current, e.name);
      if (e.isDirectory()) {
        walk(full);
      } else if (e.isFile()) {
        out.push(full);
      }
    }
  }
  walk(dir);
  return out;
}

function copyDirIfMissing(srcDir, destDir, apply, force = false) {
  const actions = [];
  if (!fs.existsSync(srcDir)) {
    return { ok: false, actions, error: `source directory not found: ${srcDir}` };
  }

  const files = listFilesRecursive(srcDir);
  for (const srcFile of files) {
    const rel = path.relative(srcDir, srcFile);
    const destFile = path.join(destDir, rel);

    // Ensure parent directory exists
    const parent = path.dirname(destFile);
    if (!fs.existsSync(parent)) {
      if (!apply) {
        actions.push({ op: 'mkdir', path: parent, mode: 'dry-run', note: `parent ${path.relative(destDir, parent)}` });
      } else {
        fs.mkdirSync(parent, { recursive: true });
        actions.push({ op: 'mkdir', path: parent, mode: 'applied', note: `parent ${path.relative(destDir, parent)}` });
      }
    }

    if (fs.existsSync(destFile) && !force) {
      actions.push({ op: 'skip', path: destFile, reason: 'exists' });
      continue;
    }

    if (!apply) {
      actions.push({ op: force ? 'overwrite' : 'copy', from: srcFile, to: destFile, mode: 'dry-run' });
      continue;
    }

    fs.copyFileSync(srcFile, destFile);
    actions.push({ op: force ? 'overwrite' : 'copy', from: srcFile, to: destFile, mode: 'applied' });
  }

  return { ok: true, actions };
}

function findFeatureTemplatesDir(repoRoot, featureId) {
  const id = String(featureId || '');
  const dash = id.replace(/_/g, '-');

  // Some feature IDs may source templates from a different skill location.
  const overrides = new Map([
    ['database', path.join(repoRoot, '.ai', 'skills', 'features', 'database', 'sync-code-schema-from-db', 'templates')],
  ]);
  const override = overrides.get(dash);
  if (override && fs.existsSync(override) && fs.statSync(override).isDirectory()) return override;

  const candidates = [
    // preferred (single-level feature folder)
    path.join(repoRoot, '.ai', 'skills', 'features', dash, 'templates'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) return p;
  }
  return null;
}

function runNodeScript(repoRoot, scriptPath, args, apply) {
  const cmd = 'node';
  const fullArgs = [scriptPath, ...args];
  const printable = `${cmd} ${fullArgs.join(' ')}`;

  if (!apply) return { op: 'run', cmd: printable, mode: 'dry-run' };

  const res = childProcess.spawnSync(cmd, fullArgs, { stdio: 'inherit', cwd: repoRoot });
  if (res.status !== 0) return { op: 'run', cmd: printable, mode: 'failed', exitCode: res.status };
  return { op: 'run', cmd: printable, mode: 'applied' };
}

function runNodeScriptWithRepoRootFallback(repoRoot, scriptPath, args, apply) {
  const first = runNodeScript(repoRoot, scriptPath, args, apply);
  if (!apply) return first;

  if (first && first.mode === 'failed' && args.includes('--repo-root')) {
    // Some scripts may not accept --repo-root; retry without it (cwd is already repoRoot).
    const altArgs = [];
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--repo-root') {
        i++; // skip value
        continue;
      }
      altArgs.push(args[i]);
    }
    const second = runNodeScript(repoRoot, scriptPath, altArgs, apply);
    second.note = 'fallback: retried without --repo-root';
    return second;
  }
  return first;
}


function getContextMode(blueprint) {
  const mode = ((blueprint.context && blueprint.context.mode) || '').toLowerCase();
  if (mode === 'snapshot' || mode === 'contract') return mode;
  return 'contract';
}

function ciProvider(blueprint) {
  const ci = blueprint && blueprint.ci && typeof blueprint.ci === 'object' ? blueprint.ci : {};
  const provider = String(ci.provider || '').trim().toLowerCase();
  if (provider === 'github' || provider === 'gitlab') return provider;

  // Compatibility hint: allow derivation from ci.platform when present.
  const platform = String(ci.platform || '').trim().toLowerCase();
  if (platform === 'github-actions') return 'github';
  if (platform === 'gitlab-ci') return 'gitlab';

  return null;
}



// ============================================================================
// DB SSOT helpers (mutually exclusive schema synchronization modes)
// ============================================================================

function dbSsotMode(blueprint) {
  const db = blueprint && blueprint.db ? blueprint.db : {};
  return String(db.ssot || 'none');
}

function dbSsotExclusionsForMode(mode) {
  const m = String(mode || 'none');
  if (m === 'repo-prisma') return ['sync-code-schema-from-db'];
  if (m === 'database') return ['sync-db-schema-from-code'];
  // 'none' (opt-out) => exclude both DB sync skills
  return ['sync-db-schema-from-code', 'sync-code-schema-from-db'];
}

function writeDbSsotConfig(repoRoot, blueprint, apply) {
  const mode = dbSsotMode(blueprint);
  const outPath = path.join(repoRoot, 'docs', 'project', 'db-ssot.json');

  const cfg = {
    version: 1,
    updatedAt: new Date().toISOString(),
    mode,
    paths: {
      prismaSchema: 'prisma/schema.prisma',
      dbSchemaTables: 'db/schema/tables.json',
      dbContextContract: 'docs/context/db/schema.json'
    }
  };

  if (!apply) {
    return { op: 'write', path: outPath, mode: 'dry-run', note: `db.ssot=${mode}` };
  }

  writeJson(outPath, cfg);
  return { op: 'write', path: outPath, mode: 'applied', note: `db.ssot=${mode}` };
}

function ensureDbSsotConfig(repoRoot, blueprint, apply) {
  // Writes docs/project/db-ssot.json reflecting the selected db.ssot mode.
  return writeDbSsotConfig(repoRoot, blueprint, apply);
}

function renderDbSsotAgentsBlock(mode) {
  const m = String(mode || 'none');

  // Progressive disclosure: minimal routing first, details as nested bullets.
  const header = `## Database SSOT and synchronization

`;

  const common = [
    `- DB context contract (LLM-first): \`docs/context/db/schema.json\``,
    `- SSOT selection file: \`docs/project/db-ssot.json\``
  ];

  if (m === 'repo-prisma') {
    return (
      header +
      `**Mode: repo-prisma** (SSOT = \`prisma/schema.prisma\`)

` +
      common.join('\n') +
      `
- If you need to change persisted fields / tables: use skill \`sync-db-schema-from-code\`.
` +
      `- If you need to mirror an external DB: do NOT; this mode assumes migrations originate in the repo.

` +
      `Rules:
- Business layer MUST NOT import Prisma (repositories return domain entities).
- After schema changes, refresh context via \`node .ai/scripts/dbssotctl.mjs sync-to-context\`.
`
    );
  }

  if (m === 'database') {
    return (
      header +
      `**Mode: database** (SSOT = running database)

` +
      common.join('\n') +
      `
- If the DB schema changed: use skill \`sync-code-schema-from-db\` (DB → Prisma → mirror → context).
` +
      `- Do NOT hand-edit \`prisma/schema.prisma\` or \`db/schema/tables.json\` as desired-state.

` +
      `Rules:
- Human runs \`prisma db pull\` against the correct environment.
- Mirror update: \`node .ai/skills/features/database/sync-code-schema-from-db/scripts/dbctl.mjs import-prisma\`.
- Context refresh: \`node .ai/scripts/dbssotctl.mjs sync-to-context\`.
`
    );
  }

  // none
  return (
    header +
    `**Mode: none** (no managed DB SSOT in this repo)

` +
    common.join('\n') +
    `
- DB sync skills are disabled. Document DB changes in workdocs and ask a human to provide a schema snapshot.
`
  );
}

function patchRootAgentsDbSsot(repoRoot, blueprint, apply) {
  const mode = dbSsotMode(blueprint);
  const agentsPath = path.join(repoRoot, 'AGENTS.md');
  const start = '<!-- DB-SSOT:START -->';
  const end = '<!-- DB-SSOT:END -->';

  const content = renderDbSsotAgentsBlock(mode).trimEnd();

  if (!apply) {
    return { op: 'edit', path: agentsPath, mode: 'dry-run', note: `update DB SSOT block (${mode})` };
  }

  let raw = '';
  if (fs.existsSync(agentsPath)) raw = fs.readFileSync(agentsPath, 'utf8');

  if (!raw.includes(start) || !raw.includes(end)) {
    // If no managed block exists, append one.
    const suffix = `

${start}
${content}
${end}
`;
    fs.writeFileSync(agentsPath, (raw || '').trimEnd() + suffix, 'utf8');
    return { op: 'edit', path: agentsPath, mode: 'applied', note: 'appended DB SSOT managed block' };
  }

  const before = raw.split(start)[0];
  const after = raw.split(end)[1];
  const next = `${before}${start}
${content}
${end}${after}`;
  fs.writeFileSync(agentsPath, next, 'utf8');
  return { op: 'edit', path: agentsPath, mode: 'applied', note: `updated DB SSOT managed block (${mode})` };
}

function patchRootAgentsDbSsotSection(repoRoot, blueprint, apply) {
  return patchRootAgentsDbSsot(repoRoot, blueprint, apply);
}

function applyDbSsotSkillExclusions(repoRoot, blueprint, apply) {
  const mode = dbSsotMode(blueprint);
  const manifestPath = path.join(repoRoot, '.ai', 'skills', '_meta', 'sync-manifest.json');
  if (!fs.existsSync(manifestPath)) {
    return { op: 'edit', path: manifestPath, mode: apply ? 'failed' : 'dry-run', note: 'manifest missing' };
  }

  const manifest = readJson(manifestPath);
  const existing = Array.isArray(manifest.excludeSkills) ? manifest.excludeSkills.map(String) : [];
  const cleaned = existing.filter((s) => s !== 'sync-db-schema-from-code' && s !== 'sync-code-schema-from-db');
  const desired = dbSsotExclusionsForMode(mode);
  manifest.excludeSkills = uniq([...cleaned, ...desired]);

  if (!apply) {
    return { op: 'edit', path: manifestPath, mode: 'dry-run', note: `excludeSkills += ${desired.join(', ')}` };
  }

  writeJson(manifestPath, manifest);
  return { op: 'edit', path: manifestPath, mode: 'applied', note: `excludeSkills += ${desired.join(', ')}` };
}

function refreshDbContextContract(repoRoot, blueprint, apply, verifyFeatures) {
  const outPath = path.join(repoRoot, 'docs', 'context', 'db', 'schema.json');

  // Only meaningful when context-awareness exists (contract directory + registry).
  if (!isContextAwarenessEnabled(blueprint)) {
    return {
      op: 'skip',
      path: outPath,
      mode: apply ? 'skipped' : 'dry-run',
      reason: 'context-awareness feature not enabled'
    };
  }

  const dbSsotCtl = path.join(repoRoot, '.ai', 'scripts', 'dbssotctl.mjs');
  if (!fs.existsSync(dbSsotCtl)) {
    return {
      op: 'skip',
      path: outPath,
      mode: apply ? 'failed' : 'dry-run',
      reason: 'dbssotctl.mjs not found'
    };
  }

  const run1 = runNodeScript(repoRoot, dbSsotCtl, ['sync-to-context', '--repo-root', repoRoot], apply);
  const actions = [run1];

  if (verifyFeatures && apply) {
    const contextCtl = path.join(repoRoot, '.ai', 'skills', 'features', 'context-awareness', 'scripts', 'contextctl.mjs');
    if (fs.existsSync(contextCtl)) {
      actions.push(runNodeScriptWithRepoRootFallback(repoRoot, contextCtl, ['verify', '--repo-root', repoRoot], apply));
    }
  }

  return { op: 'db-context-refresh', path: outPath, mode: apply ? 'applied' : 'dry-run', actions };
}


// ============================================================================
// Feature Detection Functions
// ============================================================================

function isDatabaseEnabled(blueprint) {
  const flags = featureFlags(blueprint);
  // Only feature flags trigger materialization; db.* is configuration only.
  return flags.database === true;
}

function isUiEnabled(blueprint) {
  const flags = featureFlags(blueprint);
  return flags.ui === true;
}

function isEnvironmentEnabled(blueprint) {
  const flags = featureFlags(blueprint);
  return flags.environment === true;
}

function isPackagingEnabled(blueprint) {
  const flags = featureFlags(blueprint);
  // Only feature flags trigger materialization; packaging.* is configuration only
  return flags.packaging === true;
}

function isDeploymentEnabled(blueprint) {
  const flags = featureFlags(blueprint);
  // Only feature flags trigger materialization; deploy.* is configuration only
  return flags.deployment === true;
}

function isReleaseEnabled(blueprint) {
  const flags = featureFlags(blueprint);
  // Only feature flags trigger materialization; release.* is configuration only
  return flags.release === true;
}

function isObservabilityEnabled(blueprint) {
  const flags = featureFlags(blueprint);
  // Only feature flags trigger materialization; observability.* is configuration only
  return flags.observability === true;
}

function isCiEnabled(blueprint) {
  const flags = featureFlags(blueprint);
  // Only feature flags trigger materialization; ci.* is configuration only
  return flags.ci === true;
}

// ============================================================================
// Feature Materialization (templates + ctl scripts)
// ============================================================================

function findFeatureCtlScript(repoRoot, featureId, ctlScriptName) {
  if (!ctlScriptName) return null;

  const dash = String(featureId || '').replace(/_/g, '-');
  const candidates = [
    // preferred: feature-local controller
    path.join(repoRoot, '.ai', 'skills', 'features', dash, 'scripts', ctlScriptName),
    // back-compat: repo-level controller
    path.join(repoRoot, '.ai', 'scripts', ctlScriptName),
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }

  // Default expected path for error messages
  return candidates[0];
}

function ensureFeature(repoRoot, featureId, apply, ctlScriptName, options = {}) {
  const { force = false, verify = false, stateKey } = options;
  const result = { featureId, op: 'ensure', actions: [], warnings: [], errors: [] };

  const templatesDir = findFeatureTemplatesDir(repoRoot, featureId);
  if (!templatesDir) {
    const expectedHint =
      String(featureId) === 'database'
        ? '.ai/skills/features/database/sync-code-schema-from-db/templates/'
        : `.ai/skills/features/${featureId}/templates/`;
    result.errors.push(
      `Feature "${featureId}" is enabled but templates were not found. Expected: ${expectedHint}`
    );
    return result;
  }

  const copyRes = copyDirIfMissing(templatesDir, repoRoot, apply, force);
  if (!copyRes.ok) {
    result.errors.push(copyRes.error || `Failed to copy templates for feature "${featureId}".`);
    return result;
  }
  result.actions.push({
    op: force ? 'reinstall-feature' : 'install-feature',
    featureId,
    from: templatesDir,
    to: repoRoot,
    mode: apply ? 'applied' : 'dry-run'
  });
  result.actions.push(...copyRes.actions);

  // Mark feature enabled in project state (best-effort)
  const projectctl = path.join(repoRoot, '.ai', 'scripts', 'projectctl.mjs');
  if (fs.existsSync(projectctl)) {
    const key = stateKey || featureId;
    result.actions.push(
      runNodeScriptWithRepoRootFallback(repoRoot, projectctl, ['set', `features.${key}`, 'true', '--repo-root', repoRoot], apply)
    );
  } else {
    result.warnings.push('projectctl.mjs not found; skipping .ai/project feature flag update.');
  }

  // Optional: run feature controller init/verify (best-effort)
  if (ctlScriptName) {
    const ctlPath = findFeatureCtlScript(repoRoot, featureId, ctlScriptName);
    if (fs.existsSync(ctlPath)) {
      result.actions.push(runNodeScriptWithRepoRootFallback(repoRoot, ctlPath, ['init', '--repo-root', repoRoot], apply));
      if (verify && apply) {
        const verifyRes = runNodeScriptWithRepoRootFallback(repoRoot, ctlPath, ['verify', '--repo-root', repoRoot], apply);
        result.actions.push(verifyRes);
        if (verifyRes.mode === 'failed') {
          result.verifyFailed = true;
          result.verifyError = `Feature "${featureId}" verify failed`;
        }
      }
    } else if (apply) {
      const expected = path.relative(repoRoot, ctlPath);
      result.errors.push(`Feature "${featureId}" control script not found: ${expected}`);
    }
  }

  return result;
}

function markProjectFeature(repoRoot, featureKey, apply) {
  const projectctl = path.join(repoRoot, '.ai', 'scripts', 'projectctl.mjs');
  if (!fs.existsSync(projectctl)) {
    return { op: 'skip', path: projectctl, mode: apply ? 'skipped' : 'dry-run', reason: 'projectctl.mjs not found' };
  }
  return runNodeScriptWithRepoRootFallback(
    repoRoot,
    projectctl,
    ['set', `features.${featureKey}`, 'true', '--repo-root', repoRoot],
    apply
  );
}

function runPythonScript(repoRoot, scriptPath, args, apply) {
  const fullArgs = ['-B', '-S', scriptPath, ...args];
  const candidates = ['python3', 'python'];

  const printable = `${candidates[0]} ${fullArgs.join(' ')}`;
  if (!apply) return { op: 'run', cmd: printable, mode: 'dry-run', note: 'will try python3 then python' };

  for (const cmd of candidates) {
    const res = childProcess.spawnSync(cmd, fullArgs, { stdio: 'inherit', cwd: repoRoot });
    if (res.error && res.error.code === 'ENOENT') continue; // try next candidate
    if (res.status !== 0) return { op: 'run', cmd: `${cmd} ${fullArgs.join(' ')}`, mode: 'failed', exitCode: res.status };
    return { op: 'run', cmd: `${cmd} ${fullArgs.join(' ')}`, mode: 'applied' };
  }

  return { op: 'run', cmd: printable, mode: 'failed', reason: 'python interpreter not found (tried python3, python)' };
}

function ensureDatabaseFeature(repoRoot, blueprint, apply, options = {}) {
  const { force = false, verify = false } = options;
  const mode = dbSsotMode(blueprint);

  const result = {
    enabled: true,
    featureId: 'database',
    op: 'ensure',
    actions: [],
    warnings: [],
    errors: []
  };

  // Always mark enabled in project state (best-effort)
  result.actions.push(markProjectFeature(repoRoot, 'database', apply));

  if (mode === 'database') {
    // In DB SSOT mode, materialize db/ mirrors and run the DB mirror controller (feature-local).
    const res = ensureFeature(repoRoot, 'database', apply, null, { force, verify, stateKey: 'database' });
    result.actions.push(res);
    if (res.errors && res.errors.length > 0) result.errors.push(...res.errors);
    if (res.warnings && res.warnings.length > 0) result.warnings.push(...res.warnings);

    const dbctlPath = path.join(
      repoRoot,
      '.ai',
      'skills',
      'features',
      'database',
      'sync-code-schema-from-db',
      'scripts',
      'dbctl.mjs'
    );

    if (fs.existsSync(dbctlPath)) {
      result.actions.push(runNodeScriptWithRepoRootFallback(repoRoot, dbctlPath, ['init', '--repo-root', repoRoot], apply));
      if (verify && apply) {
        const verifyRes = runNodeScriptWithRepoRootFallback(repoRoot, dbctlPath, ['verify', '--repo-root', repoRoot], apply);
        result.actions.push(verifyRes);
        if (verifyRes.mode === 'failed') {
          result.verifyFailed = true;
          result.verifyError = 'Database feature verify failed';
        }
      }
    } else if (apply) {
      result.errors.push(`Feature "database" control script not found: ${path.relative(repoRoot, dbctlPath)}`);
    }

    return result;
  }

  if (mode === 'repo-prisma') {
    // In repo-prisma mode, do not install db/ mirrors; ensure prisma/ exists as a convention anchor.
    result.actions.push(ensureDir(path.join(repoRoot, 'prisma'), apply));
    return result;
  }

  // mode === 'none' (should be rejected by validateBlueprint when feature is enabled)
  result.warnings.push('db.ssot=none: database feature has nothing to materialize.');
  return result;
}

function ensureUiFeature(repoRoot, blueprint, apply, options = {}) {
  const { force = false, verify = false } = options;
  const result = { enabled: true, featureId: 'ui', op: 'ensure', actions: [], warnings: [], errors: [] };

  result.actions.push(markProjectFeature(repoRoot, 'ui', apply));

  const script = path.join(repoRoot, '.ai', 'skills', 'features', 'ui', 'ui-system-bootstrap', 'scripts', 'ui_specctl.py');
  if (!fs.existsSync(script)) {
    result.errors.push(`UI feature script not found: ${path.relative(repoRoot, script)}`);
    return result;
  }

  const initArgs = ['init'];
  if (force) initArgs.push('--force');
  result.actions.push(runPythonScript(repoRoot, script, initArgs, apply));

  if (verify && apply) {
    result.actions.push(runPythonScript(repoRoot, script, ['codegen'], apply));
    const v = runPythonScript(repoRoot, script, ['validate'], apply);
    result.actions.push(v);
    if (v.mode === 'failed') {
      result.verifyFailed = true;
      result.verifyError = 'UI feature verify failed';
    }
  }

  return result;
}

function ensureEnvironmentFeature(repoRoot, blueprint, apply, options = {}) {
  const { force = false, verify = false } = options;
  const result = { enabled: true, featureId: 'environment', op: 'ensure', actions: [], warnings: [], errors: [] };

  result.actions.push(markProjectFeature(repoRoot, 'environment', apply));

  const script = path.join(repoRoot, '.ai', 'skills', 'features', 'environment', 'env-contractctl', 'scripts', 'env_contractctl.py');
  if (!fs.existsSync(script)) {
    result.errors.push(`Environment feature script not found: ${path.relative(repoRoot, script)}`);
    return result;
  }

  // init is conservative: it won't overwrite unless --force is passed.
  const initArgs = ['init', '--root', repoRoot];
  if (force) initArgs.push('--force');
  result.actions.push(runPythonScript(repoRoot, script, initArgs, apply));

  if (verify && apply) {
    const validateRes = runPythonScript(repoRoot, script, ['validate', '--root', repoRoot], apply);
    result.actions.push(validateRes);
    if (validateRes.mode === 'failed') {
      result.verifyFailed = true;
      result.verifyError = 'Environment feature validate failed';
      return result;
    }
    const genRes = runPythonScript(repoRoot, script, ['generate', '--root', repoRoot], apply);
    result.actions.push(genRes);
    if (genRes.mode === 'failed') {
      result.verifyFailed = true;
      result.verifyError = 'Environment feature generate failed';
    }
  }

  return result;
}

function ensureCiFeature(repoRoot, blueprint, apply, options = {}) {
  const { verify = false } = options;
  const enabled = isCiEnabled(blueprint);
  const result = { enabled, featureId: 'ci', op: enabled ? 'ensure' : 'skip', actions: [], warnings: [], errors: [] };

  if (!enabled) return result;

  result.actions.push(markProjectFeature(repoRoot, 'ci', apply));

  const provider = ciProvider(blueprint);
  if (!provider) {
    result.errors.push('CI feature is enabled but ci.provider is missing/invalid. Expected: "github" or "gitlab".');
    return result;
  }

  const cictl = path.join(repoRoot, '.ai', 'skills', 'features', 'ci', 'scripts', 'cictl.mjs');
  if (!fs.existsSync(cictl)) {
    result.errors.push(`CI control script not found: ${path.relative(repoRoot, cictl)}`);
    return result;
  }

  result.actions.push(
    runNodeScriptWithRepoRootFallback(repoRoot, cictl, ['init', '--provider', provider, '--repo-root', repoRoot], apply)
  );

  if (verify && apply) {
    const verifyRes = runNodeScriptWithRepoRootFallback(repoRoot, cictl, ['verify', '--repo-root', repoRoot], apply);
    result.actions.push(verifyRes);
    if (verifyRes.mode === 'failed') {
      result.verifyFailed = true;
      result.verifyError = 'CI feature verify failed';
    }
  }

  return result;
}

function ensureContextAwarenessFeature(repoRoot, blueprint, apply, options = {}) {
  const { force = false, verify = false } = options;
  const enabled = isContextAwarenessEnabled(blueprint);
  const result = {
    enabled,
    featureId: 'context-awareness',
    op: enabled ? 'ensure' : 'skip',
    actions: [],
    warnings: [],
    errors: []
  };

  if (!enabled) return result;

  const templatesDir = findFeatureTemplatesDir(repoRoot, 'context-awareness');
  if (!templatesDir) {
    result.errors.push('Context awareness is enabled, but feature templates were not found.');
    return result;
  }

  const copyRes = copyDirIfMissing(templatesDir, repoRoot, apply, force);
  if (!copyRes.ok) {
    result.errors.push(copyRes.error || 'Failed to copy context-awareness templates.');
    return result;
  }

  result.actions.push({
    op: force ? 'reinstall-feature' : 'install-feature',
    featureId: 'context-awareness',
    from: templatesDir,
    to: repoRoot,
    mode: apply ? 'applied' : 'dry-run'
  });
  result.actions.push(...copyRes.actions);

  const contextctl = path.join(repoRoot, '.ai', 'skills', 'features', 'context-awareness', 'scripts', 'contextctl.mjs');
  const projectctl = path.join(repoRoot, '.ai', 'scripts', 'projectctl.mjs');

  if (!fs.existsSync(contextctl)) {
    result.errors.push('contextctl.mjs not found under .ai/skills/features/context-awareness/scripts/.');
    return result;
  }

  // Ensure project state exists and mark flags
  if (fs.existsSync(projectctl)) {
    result.actions.push(runNodeScriptWithRepoRootFallback(repoRoot, projectctl, ['init', '--repo-root', repoRoot], apply));
    result.actions.push(runNodeScriptWithRepoRootFallback(repoRoot, projectctl, ['set', 'features.contextAwareness', 'true', '--repo-root', repoRoot], apply));
    result.actions.push(runNodeScriptWithRepoRootFallback(repoRoot, projectctl, ['set', 'context.enabled', 'true', '--repo-root', repoRoot], apply));
    const mode = getContextMode(blueprint);
    result.actions.push(runNodeScriptWithRepoRootFallback(repoRoot, projectctl, ['set-context-mode', mode, '--repo-root', repoRoot], apply));
  } else {
    result.warnings.push('projectctl.mjs not found; skipping project state initialization.');
  }

  // Initialize docs/context skeleton and registry (idempotent)
  result.actions.push(runNodeScriptWithRepoRootFallback(repoRoot, contextctl, ['init', '--repo-root', repoRoot], apply));

  // Optional verify
  if (verify && apply) {
    const verifyRes = runNodeScriptWithRepoRootFallback(repoRoot, contextctl, ['verify', '--repo-root', repoRoot], apply);
    result.actions.push(verifyRes);
    if (verifyRes.mode === 'failed') {
      result.verifyFailed = true;
      result.verifyError = 'Context awareness verify failed';
    }
  }

  return result;
}


function planScaffold(repoRoot, blueprint, apply) {
  const results = [];
  const repo = blueprint.repo || {};
  const caps = blueprint.capabilities || {};
  const layout = repo.layout;

  // Always ensure docs directory exists (for blueprint and optional archived docs)
  results.push(ensureDir(path.join(repoRoot, 'docs'), apply));
  results.push(ensureDir(path.join(repoRoot, 'docs', 'project'), apply));

  // Create init/stage-a-docs/ and copy Stage A templates
  results.push(ensureDir(path.join(repoRoot, 'init', 'stage-a-docs'), apply));
  const stage_a_templates = [
    { src: 'requirements.template.md', dest: 'requirements.md' },
    { src: 'non-functional-requirements.template.md', dest: 'non-functional-requirements.md' },
    { src: 'domain-glossary.template.md', dest: 'domain-glossary.md' },
    { src: 'risk-open-questions.template.md', dest: 'risk-open-questions.md' }
  ];
  for (const t of stage_a_templates) {
    const srcPath = path.join(TEMPLATES_DIR, t.src);
    const destPath = path.join(repoRoot, 'init', 'stage-a-docs', t.dest);
    results.push(copyFileIfMissing(srcPath, destPath, apply));
  }

  if (layout === 'monorepo') {
    results.push(ensureDir(path.join(repoRoot, 'apps'), apply));
    results.push(ensureDir(path.join(repoRoot, 'packages'), apply));

    if (caps.frontend && caps.frontend.enabled) {
      results.push(ensureDir(path.join(repoRoot, 'apps', 'frontend'), apply));
      results.push(writeFileIfMissing(
        path.join(repoRoot, 'apps', 'frontend', 'README.md'),
        '# Frontend app\n\nThis folder is a scaffold placeholder. Populate it based on your selected frontend stack.\n',
        apply
      ));
    }

    if (caps.backend && caps.backend.enabled) {
      results.push(ensureDir(path.join(repoRoot, 'apps', 'backend'), apply));
      results.push(writeFileIfMissing(
        path.join(repoRoot, 'apps', 'backend', 'README.md'),
        '# Backend app\n\nThis folder is a scaffold placeholder. Populate it based on your selected backend stack.\n',
        apply
      ));
    }

    // Shared packages are optional, but commonly needed
    results.push(ensureDir(path.join(repoRoot, 'packages', 'shared'), apply));
    results.push(writeFileIfMissing(
      path.join(repoRoot, 'packages', 'shared', 'README.md'),
      '# Shared package\n\nThis folder is a scaffold placeholder for shared types/utilities.\n',
      apply
    ));
  } else {
    results.push(ensureDir(path.join(repoRoot, 'src'), apply));

    if (caps.frontend && caps.frontend.enabled) {
      results.push(ensureDir(path.join(repoRoot, 'src', 'frontend'), apply));
      results.push(writeFileIfMissing(
        path.join(repoRoot, 'src', 'frontend', 'README.md'),
        '# Frontend\n\nThis folder is a scaffold placeholder. Populate it based on your selected frontend stack.\n',
        apply
      ));
    }

    if (caps.backend && caps.backend.enabled) {
      results.push(ensureDir(path.join(repoRoot, 'src', 'backend'), apply));
      results.push(writeFileIfMissing(
        path.join(repoRoot, 'src', 'backend', 'README.md'),
        '# Backend\n\nThis folder is a scaffold placeholder. Populate it based on your selected backend stack.\n',
        apply
      ));
    }
  }


  // Optional: Ops scaffolding (packaging/deploy conventions)
  // Notes:
  // - Feature templates can also materialize these paths (non-destructive copy-if-missing).
  // - CI alone should not create `ops/packaging` or `ops/deploy`.
  const q = blueprint.quality || {};
  const devops = blueprint.devops || {};

  const wantsPackaging =
    isPackagingEnabled(blueprint) ||
    (blueprint.packaging && blueprint.packaging.enabled) ||
    devops.enabled === true ||
    (devops.packaging && devops.packaging.enabled) ||
    (q.devops && (q.devops.enabled || q.devops.containerize || q.devops.packaging));

  const wantsDeployment =
    isDeploymentEnabled(blueprint) ||
    (blueprint.deploy && blueprint.deploy.enabled) ||
    devops.enabled === true ||
    (devops.deploy && devops.deploy.enabled) ||
    (q.devops && (q.devops.enabled || q.devops.deployment));

  if (wantsPackaging || wantsDeployment) {
    results.push(ensureDir(path.join(repoRoot, 'ops'), apply));
    results.push(writeFileIfMissing(
      path.join(repoRoot, 'ops', 'README.md'),
      `# Ops

This folder holds DevOps-oriented configuration and workdocs.

High-level split (created only when enabled):
- ops/packaging/  Build artifacts (often container images for services)
- ops/deploy/     Run artifacts in environments (deploy/rollback/runbooks)

Guidelines:
- Keep definitions small and structured.
- Prefer a small number of scripts as execution entry points.
- Record decisions and history under ops/*/workdocs/.
`,
      apply
    ));

    // Packaging (services, jobs, apps)
    if (wantsPackaging) {
      results.push(ensureDir(path.join(repoRoot, 'ops', 'packaging'), apply));
      results.push(ensureDir(path.join(repoRoot, 'ops', 'packaging', 'services'), apply));
      results.push(ensureDir(path.join(repoRoot, 'ops', 'packaging', 'jobs'), apply));
      results.push(ensureDir(path.join(repoRoot, 'ops', 'packaging', 'apps'), apply));
      results.push(ensureDir(path.join(repoRoot, 'ops', 'packaging', 'scripts'), apply));
      results.push(ensureDir(path.join(repoRoot, 'ops', 'packaging', 'workdocs'), apply));
      results.push(writeFileIfMissing(
        path.join(repoRoot, 'ops', 'packaging', 'README.md'),
        `# Packaging

Goal: turn code into runnable artifacts.

Repository layout:
- ops/packaging/services/   Packaging definitions per HTTP service
- ops/packaging/jobs/       Packaging definitions per workload/job
- ops/packaging/apps/       Packaging definitions per client/distribution app
- ops/packaging/scripts/    Shared build scripts (preferred entry points)
- ops/packaging/workdocs/   Plans, checklists, and build records

Guidelines:
- Keep definitions small and structured.
- For services, container images are a common packaging target.
- Treat artifact naming, versioning, and provenance as first-class.
`,
        apply
      ));
      results.push(writeFileIfMissing(
        path.join(repoRoot, 'ops', 'packaging', 'workdocs', 'README.md'),
        `# Packaging workdocs

Use this folder for:
- Packaging plans (inputs, outputs, artifact naming)
- Build checklists
- Build logs (what was built, when, from which revision, by whom)
`,
        apply
      ));
      results.push(writeFileIfMissing(
        path.join(repoRoot, 'ops', 'packaging', 'scripts', 'build.mjs'),
        `#!/usr/bin/env node
/**
 * build.mjs (placeholder)
 *
 * Provider-agnostic packaging entry.
 * Extend it to build artifacts for your services/jobs/apps.
 */

console.log("[todo] Implement packaging build pipeline for this repo.");
process.exit(0);
`,
        apply
      ));
    }

    // Deploy (http services, workloads, clients)
    if (wantsDeployment) {
      results.push(ensureDir(path.join(repoRoot, 'ops', 'deploy'), apply));
      results.push(ensureDir(path.join(repoRoot, 'ops', 'deploy', 'http_services'), apply));
      results.push(ensureDir(path.join(repoRoot, 'ops', 'deploy', 'workloads'), apply));
      results.push(ensureDir(path.join(repoRoot, 'ops', 'deploy', 'clients'), apply));
      results.push(ensureDir(path.join(repoRoot, 'ops', 'deploy', 'scripts'), apply));
      results.push(ensureDir(path.join(repoRoot, 'ops', 'deploy', 'workdocs'), apply));
      results.push(writeFileIfMissing(
        path.join(repoRoot, 'ops', 'deploy', 'README.md'),
        `# Deploy

Goal: take packaged artifacts and run them in target environments.

Repository layout:
- ops/deploy/http_services/  Deployment descriptors for long-running services
- ops/deploy/workloads/      Deployment descriptors for jobs/event-driven workloads
- ops/deploy/clients/        Deployment descriptors for client apps (web/mobile/desktop)
- ops/deploy/scripts/        Shared deploy/rollback scripts (preferred entry points)
- ops/deploy/workdocs/       Runbooks and deployment history

Guidelines:
- Capture environment-specific parameters explicitly.
- Keep rollback paths documented and tested.
`,
        apply
      ));
      results.push(writeFileIfMissing(
        path.join(repoRoot, 'ops', 'deploy', 'workdocs', 'README.md'),
        `# Deploy workdocs

Use this folder for:
- Environment definitions (dev/stage/prod)
- Runbooks (how to deploy, verify, rollback)
- Postmortems and deployment incident notes
`,
        apply
      ));
      results.push(writeFileIfMissing(
        path.join(repoRoot, 'ops', 'deploy', 'scripts', 'deploy.mjs'),
        `#!/usr/bin/env node
/**
 * deploy.mjs (placeholder)
 *
 * Provider-agnostic deployment entry.
 * Extend it to apply your chosen deployment model and platform.
 */

console.log("[todo] Implement deployment automation for this repo.");
process.exit(0);
`,
        apply
      ));
      results.push(writeFileIfMissing(
        path.join(repoRoot, 'ops', 'deploy', 'scripts', 'rollback.mjs'),
        `#!/usr/bin/env node
/**
 * rollback.mjs (placeholder)
 *
 * Provider-agnostic rollback entry.
 */

console.log("[todo] Implement rollback procedure for this repo.");
process.exit(0);
`,
        apply
      ));
    }
  }


  return results;
}

function updateManifest(repoRoot, blueprint, apply) {
  // When skillpacksctl is available, pack switching should go through .ai/skills/_meta/skillpacksctl.mjs (scheme A).
  // When skillpacksctl is not available, fall back to a flat sync-manifest.json update (additive; never removes).
  const manifestPath = path.join(repoRoot, '.ai', 'skills', '_meta', 'sync-manifest.json');
  const skillpacksctlPath = path.join(repoRoot, '.ai', 'skills', '_meta', 'skillpacksctl.mjs');

  const warnings = [];
  const errors = [];

  const packsFromBlueprint = normalizePackList((blueprint.skills && blueprint.skills.packs) || []);
  const packs = new Set(packsFromBlueprint);

  // Note: packs are optional; features and packs are independent toggles.

  const packList = Array.from(packs);

  if (packList.length === 0) {
    return { op: 'skip', path: manifestPath, mode: apply ? 'applied' : 'dry-run', warnings, note: 'no packs requested' };
  }

  // Prefer skillpacksctl if available
  if (fs.existsSync(skillpacksctlPath)) {
    // Preflight: ensure pack files exist (more actionable than letting skillpacksctl fail mid-run).
    for (const p of packList) {
      const packFile = path.join(repoRoot, '.ai', 'skills', '_meta', 'packs', `${p}.json`);
      if (!fs.existsSync(packFile)) {
        errors.push(`Pack "${p}" is requested, but pack file is missing: ${path.relative(repoRoot, packFile)}`);
      }
    }

    if (errors.length > 0) {
      return { op: 'skillpacksctl', path: skillpacksctlPath, mode: 'failed', errors, warnings, packs: packList };
    }

    const actions = [];
    for (const p of packList) {
      const cmd = 'node';
      const args = [skillpacksctlPath, 'enable-pack', p, '--repo-root', repoRoot, '--no-sync'];
      const printable = `${cmd} ${args.join(' ')}`;

      if (!apply) {
        actions.push({ op: 'run', cmd: printable, mode: 'dry-run' });
        continue;
      }

      const res = childProcess.spawnSync(cmd, args, { stdio: 'inherit', cwd: repoRoot });
      if (res.status !== 0) {
        return { op: 'skillpacksctl', path: skillpacksctlPath, mode: 'failed', exitCode: res.status, packs: packList, warnings };
      }
      actions.push({ op: 'run', cmd: printable, mode: 'applied' });
    }

    // Read effective manifest (if present) for reporting
    let effective = null;
    if (fs.existsSync(manifestPath)) {
      try { effective = readJson(manifestPath); } catch {}
    }

    return { op: 'skillpacksctl', path: manifestPath, mode: apply ? 'applied' : 'dry-run', warnings, packs: packList, actions, effectiveManifest: effective };
  }

  // Fallback: update flat manifest directly (additive; safe for basic repos)
  let manifest;
  if (fs.existsSync(manifestPath)) {
    manifest = readJson(manifestPath);
  } else {
    manifest = { version: 1, includePrefixes: [], includeSkills: [], excludeSkills: [] };
  }

  if (!Array.isArray(manifest.includePrefixes)) manifest.includePrefixes = [];
  if (!Array.isArray(manifest.includeSkills)) manifest.includeSkills = [];
  if (!Array.isArray(manifest.excludeSkills)) manifest.excludeSkills = [];

  const prefixMap = packPrefixMap();
  const prefixesToAdd = [];
  for (const p of packList) {
    const prefix = prefixMap[p];
    if (!prefix) {
      warnings.push(`Pack "${p}" has no prefix mapping and skillpacksctl is not available; skipping.`);
      continue;
    }
    prefixesToAdd.push(prefix);
  }

  manifest.includePrefixes = uniq([...manifest.includePrefixes, ...prefixesToAdd]);

  if (!apply) {
    return { op: 'write', path: manifestPath, mode: 'dry-run', warnings, includePrefixes: manifest.includePrefixes, packs: packList };
  }

  writeJson(manifestPath, manifest);
  return { op: 'write', path: manifestPath, mode: 'applied', warnings, includePrefixes: manifest.includePrefixes, packs: packList };
}



function syncWrappers(repoRoot, providers, apply) {
  const scriptPath = path.join(repoRoot, '.ai', 'scripts', 'sync-skills.mjs');
  if (!fs.existsSync(scriptPath)) {
    return { op: 'skip', path: scriptPath, reason: 'sync-skills.mjs not found' };
  }
  const providersArg = providers || 'both';
  const cmd = 'node';
  const args = [scriptPath, '--scope', 'current', '--providers', providersArg, '--mode', 'reset', '--yes'];

  if (!apply) return { op: 'run', cmd: `${cmd} ${args.join(' ')}`, mode: 'dry-run' };

  const res = childProcess.spawnSync(cmd, args, { stdio: 'inherit', cwd: repoRoot });
  if (res.status !== 0) {
    return { op: 'run', cmd: `${cmd} ${args.join(' ')}`, mode: 'failed', exitCode: res.status };
  }
  return { op: 'run', cmd: `${cmd} ${args.join(' ')}`, mode: 'applied' };
}

function cleanupInit(repoRoot, apply) {
  const initDir = path.join(repoRoot, 'init');
  const marker = path.join(initDir, '.init-kit');

  if (!fs.existsSync(initDir)) return { op: 'skip', path: initDir, reason: 'init/ not present' };
  if (!fs.existsSync(marker)) return { op: 'refuse', path: initDir, reason: 'missing init/.init-kit marker' };

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const trashDir = path.join(repoRoot, `.init-trash-${ts}`);

  if (!apply) {
    return { op: 'rm', path: initDir, mode: 'dry-run', note: `will move to ${path.basename(trashDir)} then delete` };
  }

  // Move first (reduces risk if delete fails on Windows due to open file handles)
  fs.renameSync(initDir, trashDir);

  try {
    fs.rmSync(trashDir, { recursive: true, force: true });
    return { op: 'rm', path: initDir, mode: 'applied' };
  } catch (e) {
    return {
      op: 'rm',
      path: initDir,
      mode: 'partial',
      note: `renamed to ${path.basename(trashDir)} but could not delete automatically: ${e.message}`
    };
  }
}


function main() {
  const { command, opts } = parseArgs(process.argv);
  const format = (opts['format'] || 'text').toLowerCase();

  const repoRoot = path.resolve(opts['repo-root'] || process.cwd());
  const blueprintPath = resolvePath(repoRoot, opts['blueprint'] || path.join('init', 'project-blueprint.json'));
  const docsRoot = resolvePath(repoRoot, opts['docs-root'] || path.join('init', 'stage-a-docs'));

  // ========== start ==========
  if (command === 'start') {
    const existingState = loadState(repoRoot);
    if (existingState) {
      console.log('[info] Existing init state detected');
      printStatus(existingState, repoRoot);
      console.log('[info] To restart, delete init/.init-state.json first');
      process.exit(0);
    }

    const state = createInitialState();
    addHistoryEvent(state, 'init_started', 'Initialization started');
    saveState(repoRoot, state);

    // Auto-create Stage A docs templates
    const stage_a_docs_dir = path.join(repoRoot, 'init', 'stage-a-docs');
    fs.mkdirSync(stage_a_docs_dir, { recursive: true });
    const stage_a_templates = [
      { src: 'requirements.template.md', dest: 'requirements.md' },
      { src: 'non-functional-requirements.template.md', dest: 'non-functional-requirements.md' },
      { src: 'domain-glossary.template.md', dest: 'domain-glossary.md' },
      { src: 'risk-open-questions.template.md', dest: 'risk-open-questions.md' }
    ];
    const createdFiles = [];
    for (const t of stage_a_templates) {
      const srcPath = path.join(TEMPLATES_DIR, t.src);
      const destPath = path.join(stage_a_docs_dir, t.dest);
      if (fs.existsSync(srcPath) && !fs.existsSync(destPath)) {
        fs.copyFileSync(srcPath, destPath);
        createdFiles.push(t.dest);
      }
    }

    // Auto-create blueprint template
    const blueprintTemplateSrc = path.join(TEMPLATES_DIR, 'project-blueprint.min.example.json');
    const blueprintDest = path.join(repoRoot, 'init', 'project-blueprint.json');
    let blueprintCreated = false;
    if (fs.existsSync(blueprintTemplateSrc) && !fs.existsSync(blueprintDest)) {
      fs.copyFileSync(blueprintTemplateSrc, blueprintDest);
      blueprintCreated = true;
    }

    console.log('[ok] Init state created: init/.init-state.json');
    if (createdFiles.length > 0) {
      console.log('[ok] Stage A doc templates created: init/stage-a-docs/');
      for (const f of createdFiles) {
        console.log(`     - ${f}`);
      }
    }
    if (blueprintCreated) {
      console.log('[ok] Blueprint template created: init/project-blueprint.json');
    }
    printStatus(state, repoRoot);
    process.exit(0);
  }

  // ========== status ==========
  if (command === 'status') {
    const state = loadState(repoRoot);
    if (!state) {
      console.log('[info] No init state found');
      console.log('[info] Run the \"start\" command to begin initialization');
      process.exit(0);
    }

    if (format === 'json') {
      console.log(JSON.stringify(getStageProgress(state), null, 2));
    } else {
      printStatus(state, repoRoot);
    }
    process.exit(0);
  }

    // ========== advance ==========
	  if (command === 'advance') {
	    const state = loadState(repoRoot);
	    if (!state) {
	      die('[error] No init state found. Run the \"start\" command first.');
	    }

	    const progress = getStageProgress(state);
	    const stage_a = progress['stage-a'] || {};
	    const stage_b = progress['stage-b'] || {};
	    const stage_c = progress['stage-c'] || {};
	    const self = path.relative(repoRoot, __filename);
	    const docsRel = path.relative(repoRoot, docsRoot);
	    const bpRel = blueprintPath ? path.relative(repoRoot, blueprintPath) : 'init/project-blueprint.json';

	    if (progress.stage === 'A') {
	      if (!stage_a.validated) {
	        console.log('[info] Stage A docs have not passed structural validation.');
	        console.log('Run first:');
	        console.log(`  node ${self} check-docs --docs-root ${docsRel} --strict`);
	        process.exit(1);
	      }
      console.log('\n== Stage A → B Checkpoint ==\n');
      console.log('Stage A docs passed validation. Next: the user must review and explicitly approve.');
      console.log('After approval, run:');
      console.log(`  node ${self} approve --stage A --repo-root ${repoRoot}`);
      process.exit(0);
    }

	    if (progress.stage === 'B') {
	      if (!stage_b.validated) {
	        console.log('[info] Stage B blueprint has not been validated.');
	        console.log('Run first:');
	        console.log(`  node ${self} validate --blueprint ${bpRel}`);
	        process.exit(1);
	      }
      console.log('\n== Stage B → C Checkpoint ==\n');
      console.log('Stage B blueprint passed validation. Next: the user must review and explicitly approve.');
      console.log('After approval, run:');
      console.log(`  node ${self} approve --stage B --repo-root ${repoRoot}`);
      process.exit(0);
    }

	    if (progress.stage === 'C') {
	      if (!stage_c.wrappersSynced) {
	        console.log('[info] Stage C is not complete (wrappers not synced).');
	        console.log('Run first:');
	        console.log(`  node ${self} apply --blueprint ${bpRel}`);
	        process.exit(1);
	      }

      console.log('\n== Stage C Completion Checkpoint ==\n');
      console.log('Stage C completed (scaffold + skills written).');
      console.log('Next: user confirmation that scaffold and enabled capabilities match expectations.');
      console.log('After confirmation, run:');
      console.log(`  node ${self} approve --stage C --repo-root ${repoRoot}`);
      console.log('Post-init: fill init/skill-retention-table.template.md and confirm deletions before running sync-skills.mjs --delete-skills (dry-run, then --yes).');
      console.log('Post-init: update root README.md and AGENTS.md if needed.');
      console.log('\nOptional: later run cleanup-init --apply --i-understand to remove the init/ directory');
      process.exit(0);
    }

    console.log('[info] Initialization completed (state.stage = complete)');
    process.exit(0);
  }



    // ========== approve ==========
  if (command === 'approve') {
    const state = loadState(repoRoot);
    if (!state) {
      die('[error] No init state found. Run the \"start\" command first.');
    }

    const current = String(state.stage || '').toUpperCase();
    const desired = String(opts['stage'] || current).toUpperCase();
    const note = opts['note'] ? String(opts['note']) : '';

    if (!['A', 'B', 'C', 'COMPLETE'].includes(desired)) {
      die('[error] --stage must be one of: A | B | C');
    }

    if (desired !== current) {
      die(`[error] Current stage=${state.stage}; cannot approve stage=${desired}. Run status to confirm, or omit --stage.`);
    }

	    if (desired === 'A') {
	      if (!state['stage-a']?.validated) {
	        die('[error] Stage A is not validated. Run check-docs first.');
	      }
	      state['stage-a'].userApproved = true;
	      state.stage = 'B';
	      addHistoryEvent(state, 'stage_a_approved', note || 'Stage A approved by user');
	      saveState(repoRoot, state);
	      printStatus(state, repoRoot);
	      process.exit(0);
	    }

	    if (desired === 'B') {
	      if (!state['stage-b']?.validated) {
	        die('[error] Stage B is not validated. Run validate first.');
	      }
	      state['stage-b'].userApproved = true;
	      state.stage = 'C';
	      addHistoryEvent(state, 'stage_b_approved', note || 'Stage B approved by user');
	      saveState(repoRoot, state);
	      printStatus(state, repoRoot);
	      process.exit(0);
	    }

	    if (desired === 'C') {
	      if (!state['stage-c']?.wrappersSynced) {
	        die('[error] Stage C is not complete. Run apply first.');
	      }
	      state['stage-c'].userApproved = true;
	      state.stage = 'complete';
	      addHistoryEvent(state, 'init_completed', note || 'Initialization completed');
	      saveState(repoRoot, state);
	      printStatus(state, repoRoot);
        process.exit(0);
      }

    console.log('[info] Already complete; no need to approve again');
    process.exit(0);
  }

if (command === 'validate') {
    if (!blueprintPath) die('[error] --blueprint is required for validate');
    const blueprint = readJson(blueprintPath);
    const v = validateBlueprint(blueprint);

    // Auto-update state if validation passes
	    if (v.ok) {
	      const state = loadState(repoRoot);
	      if (state && state.stage === 'B') {
	        state['stage-b'].drafted = true;
	        state['stage-b'].validated = true;
	        addHistoryEvent(state, 'stage_b_validated', 'Stage B blueprint validated');
	        saveState(repoRoot, state);
	        console.log('[auto] State updated: stage-b.validated = true');
	      }
	    }

    const result = {
      ok: v.ok,
      packs: v.packs,
      errors: v.errors,
      warnings: v.warnings,
      summary: v.ok
        ? `[ok] Blueprint is valid: ${path.relative(repoRoot, blueprintPath)}`
        : `[error] Blueprint validation failed: ${path.relative(repoRoot, blueprintPath)}`
    };
    printResult(result, format);
    process.exit(v.ok ? 0 : 1);
  }

  if (command === 'check-docs') {
    const strict = !!opts['strict'];
    const res = checkDocs(docsRoot);

    const ok = res.ok && (!strict || res.warnings.length === 0);
    const summary = ok
      ? `[ok] Stage A docs check passed: ${path.relative(repoRoot, docsRoot)}`
      : `[error] Stage A docs check failed: ${path.relative(repoRoot, docsRoot)}`;

	    // Auto-update state if validation passes
	    if (ok) {
	      const state = loadState(repoRoot);
	      if (state && state.stage === 'A') {
	        state['stage-a'].validated = true;
	        state['stage-a'].docsWritten = {
	          requirements: fs.existsSync(path.join(docsRoot, 'requirements.md')),
	          nfr: fs.existsSync(path.join(docsRoot, 'non-functional-requirements.md')),
	          glossary: fs.existsSync(path.join(docsRoot, 'domain-glossary.md')),
	          riskQuestions: fs.existsSync(path.join(docsRoot, 'risk-open-questions.md'))
	        };
	        addHistoryEvent(state, 'stage_a_validated', 'Stage A docs validated');
	        saveState(repoRoot, state);
	        console.log('[auto] State updated: stage-a.validated = true');
	      }
	    }

    printResult({ ok, errors: res.errors, warnings: res.warnings, summary }, format);
    process.exit(ok ? 0 : 1);
  }

  if (command === 'mark-must-ask') {
    const key = opts['key'];
    const asked = !!opts['asked'];
    const answered = !!opts['answered'];
    const writtenTo = opts['written-to'];

    if (!key) die('[error] --key is required for mark-must-ask');
    if (!asked && !answered && !writtenTo) {
      die('[error] mark-must-ask requires --asked and/or --answered or --written-to');
    }

    const state = loadState(repoRoot);
    if (!state) die('[error] No init state found. Run the \"start\" command first.');

	    const mustAsk = state['stage-a'] && state['stage-a'].mustAsk;
	    if (!mustAsk || !mustAsk[key]) {
	      const available = mustAsk ? Object.keys(mustAsk).join(', ') : '';
	      die(`[error] Unknown must-ask key "${key}". Available keys: ${available}`);
	    }

    if (asked) mustAsk[key].asked = true;
    if (answered) mustAsk[key].answered = true;
    if (writtenTo) mustAsk[key].writtenTo = writtenTo;

    addHistoryEvent(state, 'must_ask_updated', `mustAsk.${key} updated`);
    saveState(repoRoot, state);
    console.log(`[ok] mustAsk.${key} updated`);
    process.exit(0);
  }

	  if (command === 'review-packs') {
    const note = opts['note'];
    const state = loadState(repoRoot);
    if (!state) die('[error] No init state found. Run the \"start\" command first.');

	    if (!state['stage-b']) state['stage-b'] = {};
	    state['stage-b'].packsReviewed = true;
	    addHistoryEvent(state, 'packs_reviewed', note || 'Packs reviewed');
	    saveState(repoRoot, state);
	    console.log('[ok] stage-b.packsReviewed = true');
	    process.exit(0);
	  }

  if (command === 'suggest-packs') {
    if (!blueprintPath) die('[error] --blueprint is required for suggest-packs');
    const blueprint = readJson(blueprintPath);

    const v = validateBlueprint(blueprint);
    const rec = recommendedPacksFromBlueprint(blueprint);
    const current = normalizePackList((blueprint.skills && blueprint.skills.packs) || []);
    const missing = rec.filter((p) => !current.includes(p));
    const extra = current.filter((p) => !rec.includes(p));

    const installChecks = rec.map((p) => checkPackInstall(repoRoot, p)).filter((x) => !x.installed);
    const warnings = [];
    for (const c of installChecks) warnings.push(`Recommended pack "${c.pack}" is not installed (${c.reason}).`);

    const result = {
      ok: v.ok,
      recommended: rec,
      current,
      missing,
      extra,
      warnings,
      errors: v.errors,
      summary: `[info] Packs: current=${current.join(', ') || '(none)'} | recommended=${rec.join(', ')}`
    };

    if (opts['write']) {
      if (!v.ok) die('[error] Cannot write packs: blueprint validation failed.');
      const next = normalizePackList([...current, ...missing]);
      blueprint.skills = blueprint.skills || {};
      blueprint.skills.packs = next;
      writeJson(blueprintPath, blueprint);
      result.wrote = { path: path.relative(repoRoot, blueprintPath), packs: next };
      result.summary += `\n[write] Added missing recommended packs into blueprint.skills.packs`;
    }

    printResult(result, format);
    process.exit(v.ok ? 0 : 1);
  }

  if (command === 'suggest-features') {
    if (!blueprintPath) die('[error] --blueprint is required for suggest-features');
    const blueprint = readJson(blueprintPath);

    const v = validateBlueprint(blueprint);
    const rec = recommendedFeaturesFromBlueprint(blueprint);
    const current = getEnabledFeatures(blueprint);
    const missing = rec.filter((a) => !current.includes(a));
    const extra = current.filter((a) => !rec.includes(a));

    const result = {
      ok: v.ok,
      recommended: rec,
      current,
      missing,
      extra,
      errors: v.errors,
      warnings: v.warnings,
      summary: `[info] Features: current=${current.join(', ') || '(none)'} | recommended=${rec.join(', ') || '(none)'}`
    };

    if (opts['write']) {
      if (!v.ok) die('[error] Cannot write features: blueprint validation failed.');
      blueprint.features = blueprint.features || {};
      for (const featureKey of missing) {
        blueprint.features[featureKey] = true;
      }
      writeJson(blueprintPath, blueprint);
      result.wrote = { path: path.relative(repoRoot, blueprintPath), features: [...current, ...missing] };
      result.summary += `\n[write] Added missing recommended features into blueprint.features`;
    }

    printResult(result, format);
    process.exit(v.ok ? 0 : 1);
  }

  if (command === 'scaffold') {
    if (!blueprintPath) die('[error] --blueprint is required for scaffold');
    const apply = !!opts['apply'];
    const blueprint = readJson(blueprintPath);

    const v = validateBlueprint(blueprint);
    if (!v.ok) die('[error] Blueprint is not valid; refusing to scaffold.');

    const plan = planScaffold(repoRoot, blueprint, apply);
    const summary = apply
      ? `[ok] Scaffold applied under repo root: ${repoRoot}`
      : `[plan] Scaffold dry-run under repo root: ${repoRoot}`;

    if (format === 'json') {
      console.log(JSON.stringify({ ok: true, summary, plan }, null, 2));
    } else {
      console.log(summary);
      for (const item of plan) {
        const mode = item.mode ? ` (${item.mode})` : '';
        const reason = item.reason ? ` [${item.reason}]` : '';
        console.log(`- ${item.op}: ${path.relative(repoRoot, item.path || '')}${mode}${reason}`);
      }
    }
    process.exit(0);
  }

  if (command === 'apply') {
    if (!blueprintPath) die('[error] --blueprint is required for apply');
    const providers = opts['providers'] || 'both';
    const requireStageA = !!opts['require-stage-a'];
    const skipConfigs = !!opts['skip-configs'];
    const cleanup = !!opts['cleanup-init'];
    const forceFeatures = !!opts['force-features'];
    const verifyFeatures = !!opts['verify-features'];
    const nonBlockingFeatures = !!opts['non-blocking-features'];

    if (cleanup && !opts['i-understand']) {
      die('[error] --cleanup-init requires --i-understand');
    }

    const blueprint = readJson(blueprintPath);

    // Validate blueprint
    const v = validateBlueprint(blueprint);
    if (!v.ok) die('[error] Blueprint validation failed. Fix errors and re-run.');

    // Stage A docs check (strict only when explicitly required)
    const stage_a_res = checkDocs(docsRoot);
    if (requireStageA) {
      const strictOk = stage_a_res.ok && stage_a_res.warnings.length === 0;
      if (!strictOk) die('[error] Stage A docs check failed in strict mode. Fix docs and re-run.');
    }

    // Suggest packs (warn-only)
    const rec = recommendedPacksFromBlueprint(blueprint);
    const current = normalizePackList((blueprint.skills && blueprint.skills.packs) || []);
    const missing = rec.filter((p) => !current.includes(p));
    if (missing.length > 0) {
      console.warn(`[warn] Blueprint.skills.packs is missing recommended packs: ${missing.join(', ')}`);
      console.warn(`[warn] Run: suggest-packs --blueprint ${path.relative(repoRoot, blueprintPath)} --write  (or edit blueprint.skills.packs manually)`);
    }

    // Scaffold directories
    const scaffoldPlan = planScaffold(repoRoot, blueprint, true);

    // Generate config files (default: enabled)
    let configResults = [];
    if (!skipConfigs) {
      configResults = generateConfigFiles(repoRoot, blueprint, true);
      console.log('[ok] Config files generated.');
      for (const r of configResults) {
        const mode = r.mode ? ` (${r.mode})` : '';
        const reason = r.reason ? ` [${r.reason}]` : '';
        console.log(`  - ${r.action}: ${r.file}${mode}${reason}`);
      }
    }

    // Generate project-specific README.md
    const readmeResult = generateProjectReadme(repoRoot, blueprint, true);
    if (readmeResult.op === 'write' && readmeResult.mode === 'applied') {
      console.log('[ok] README.md generated from blueprint.');
    } else if (readmeResult.reason) {
      console.log(`[info] README.md: ${readmeResult.reason}`);
    }

    const featureOptions = { force: forceFeatures, verify: verifyFeatures };
    const verifyFailures = [];

    // Ensure project state exists (records enabled features for LLMs and tooling)
    const projectctlPath = path.join(repoRoot, '.ai', 'scripts', 'projectctl.mjs');
    if (fs.existsSync(projectctlPath)) {
      const initRes = runNodeScriptWithRepoRootFallback(repoRoot, projectctlPath, ['init', '--repo-root', repoRoot], true);
      if (initRes.mode === 'failed') {
        console.warn('[warn] projectctl init failed; feature flags may not be recorded.');
      }
    }

    // Optional: Context Awareness feature (recommended when you want LLM-stable contracts)
    const contextFeature = ensureContextAwarenessFeature(repoRoot, blueprint, true, featureOptions);
    if (contextFeature.errors && contextFeature.errors.length > 0) {
      for (const e of contextFeature.errors) console.error(`[error] ${e}`);
      if (!nonBlockingFeatures) {
        die('[error] Context awareness feature setup failed. Use --non-blocking-features to continue despite errors.');
      }
    }
    if (contextFeature.verifyFailed) {
      const msg = contextFeature.verifyError || 'Context awareness verify failed';
      console.error(`[error] ${msg}`);
      verifyFailures.push('context-awareness');
      if (!nonBlockingFeatures) {
        die('[error] Context awareness verify failed. Use --non-blocking-features to continue despite errors.');
      }
    }
    if (contextFeature.warnings && contextFeature.warnings.length > 0) {
      for (const w of contextFeature.warnings) console.warn(`[warn] ${w}`);
    }

    // Optional feature materialization
    const featureResults = [];

    // Helper function to handle feature installation with fail-fast support
    function handleFeatureResult(res, featureId) {
      featureResults.push(res);
      if (res.errors.length > 0) {
        for (const e of res.errors) console.error(`[error] ${e}`);
        if (!nonBlockingFeatures) {
          die(`[error] Feature "${featureId}" installation failed. Use --non-blocking-features to continue despite errors.`);
        }
      }
      if (res.verifyFailed) {
        const msg = res.verifyError || `Feature "${featureId}" verify failed`;
        console.error(`[error] ${msg}`);
        verifyFailures.push(featureId);
        if (!nonBlockingFeatures) {
          die(`[error] Feature "${featureId}" verify failed. Use --non-blocking-features to continue despite errors.`);
        }
      }
      if (res.warnings.length > 0) {
        for (const w of res.warnings) console.warn(`[warn] ${w}`);
      }
    }

    // Database feature (SSOT-aware)
    if (isDatabaseEnabled(blueprint)) {
      console.log('[info] Enabling Database feature...');
      const res = ensureDatabaseFeature(repoRoot, blueprint, true, featureOptions);
      handleFeatureResult(res, 'database');
    }

    // UI feature
    if (isUiEnabled(blueprint)) {
      console.log('[info] Enabling UI feature...');
      const res = ensureUiFeature(repoRoot, blueprint, true, featureOptions);
      handleFeatureResult(res, 'ui');
    }

    // Environment feature
    if (isEnvironmentEnabled(blueprint)) {
      console.log('[info] Enabling Environment feature...');
      const res = ensureEnvironmentFeature(repoRoot, blueprint, true, featureOptions);
      handleFeatureResult(res, 'environment');
    }

    // CI feature
    if (isCiEnabled(blueprint)) {
      console.log('[info] Enabling CI feature...');
      const res = ensureCiFeature(repoRoot, blueprint, true, featureOptions);
      handleFeatureResult(res, 'ci');
    }

    // Packaging feature
    if (isPackagingEnabled(blueprint)) {
      console.log('[info] Enabling Packaging feature...');
      const res = ensureFeature(repoRoot, 'packaging', true, 'packctl.mjs', featureOptions);
      handleFeatureResult(res, 'packaging');
    }

    // Deployment feature
    if (isDeploymentEnabled(blueprint)) {
      console.log('[info] Enabling Deployment feature...');
      const res = ensureFeature(repoRoot, 'deployment', true, 'deployctl.mjs', featureOptions);
      handleFeatureResult(res, 'deployment');
    }

    // Release feature
    if (isReleaseEnabled(blueprint)) {
      console.log('[info] Enabling Release feature...');
      const res = ensureFeature(repoRoot, 'release', true, 'releasectl.mjs', featureOptions);
      handleFeatureResult(res, 'release');
    }

    // Observability feature
    if (isObservabilityEnabled(blueprint)) {
      console.log('[info] Enabling Observability feature...');
      const res = ensureFeature(repoRoot, 'observability', true, 'obsctl.mjs', featureOptions);
      handleFeatureResult(res, 'observability');
    }

    // DB SSOT bootstrap (docs/project + AGENTS + LLM db context)
    const dbSsotConfigResult = ensureDbSsotConfig(repoRoot, blueprint, true);
    if (dbSsotConfigResult.mode === 'applied') {
      console.log(`[ok] DB SSOT config written: ${path.relative(repoRoot, dbSsotConfigResult.path)}`);
    }
    const agentsDbSsotResult = patchRootAgentsDbSsotSection(repoRoot, blueprint, true);
    if (agentsDbSsotResult.mode === 'applied') {
      console.log(`[ok] AGENTS.md updated (DB SSOT section)`);
    }
    const dbContextRefreshResult = refreshDbContextContract(repoRoot, blueprint, true, verifyFeatures);
    if (dbContextRefreshResult.mode === 'applied') {
      console.log(`[ok] DB context refreshed: ${path.relative(repoRoot, dbContextRefreshResult.path)}`);
    } else if (dbContextRefreshResult.reason) {
      console.log(`[info] DB context refresh skipped: ${dbContextRefreshResult.reason}`);
    }

    // Manifest update
    const manifestResult = updateManifest(repoRoot, blueprint, true);
    if (manifestResult.mode === 'failed') {
      if (manifestResult.errors && manifestResult.errors.length > 0) {
        for (const e of manifestResult.errors) console.error(`[error] ${e}`);
      }
      die('[error] Skill pack / manifest update failed.');
    }
    if (manifestResult.warnings && manifestResult.warnings.length > 0) {
      for (const w of manifestResult.warnings) console.warn(`[warn] ${w}`);
    }

    // DB SSOT skill mutual exclusion (sync-manifest excludeSkills)
    const ssotSkillExclusionsResult = applyDbSsotSkillExclusions(repoRoot, blueprint, true);
    if (ssotSkillExclusionsResult.mode === 'applied') {
      console.log('[ok] Skill exclusions updated for DB SSOT');
    }

    // Sync wrappers
    const syncResult = syncWrappers(repoRoot, providers, true);
    if (syncResult.mode === 'failed') die(`[error] sync-skills.mjs failed with exit code ${syncResult.exitCode}`);

    const retentionTemplateResult = ensureSkillRetentionTemplate(repoRoot, true);
    if (retentionTemplateResult.mode === 'applied') {
      console.log('[ok] Skill retention template created: init/skill-retention-table.template.md');
    } else if (retentionTemplateResult.reason) {
      console.log(`[info] Skill retention template: ${retentionTemplateResult.reason}`);
    }

    // Auto-update state
	    const state = loadState(repoRoot);
	    if (state) {
	      state['stage-c'].scaffoldApplied = true;
	      state['stage-c'].configsGenerated = !skipConfigs;
	      state['stage-c'].manifestUpdated = true;
	      state['stage-c'].wrappersSynced = syncResult.mode === 'applied';
	      addHistoryEvent(state, 'stage_c_applied', 'Stage C apply completed');
	      saveState(repoRoot, state);
	      console.log('[auto] State updated: stage-c.* = true');
	    }
    // Optional cleanup
    let cleanupResult = null
    if (cleanup) {
      cleanupResult = cleanupInit(repoRoot, true)
      if (cleanupResult.mode === 'partial') {
        console.warn(`[warn] cleanup-init partially completed: ${cleanupResult.note}`)
      }
    }

    if (format === 'json') {
      console.log(JSON.stringify({
        ok: true,
        blueprint: path.relative(repoRoot, blueprintPath),
        docsRoot: path.relative(repoRoot, docsRoot),
        'stage-a': stage_a_res,
        contextFeature,
        features: featureResults,
        scaffold: scaffoldPlan,
        configs: configResults,
        dbSsotConfig: dbSsotConfigResult,
        agentsDbSsot: agentsDbSsotResult,
        dbContextContract: dbContextRefreshResult,
        dbSsotSkillExclusions: ssotSkillExclusionsResult,
        readme: readmeResult,
        skillRetentionTemplate: retentionTemplateResult,
        manifest: manifestResult,
        sync: syncResult,
        cleanup: cleanupResult
      }, null, 2))
    } else {
      console.log('[ok] Apply completed.')
      console.log(`- Blueprint: ${path.relative(repoRoot, blueprintPath)}`)
      console.log(`- Docs root: ${path.relative(repoRoot, docsRoot)}`)
      console.log(`- DB SSOT: ${blueprint.db && blueprint.db.ssot ? blueprint.db.ssot : 'unknown'}`)

      const installed = []
      if (contextFeature && contextFeature.enabled) installed.push('context-awareness')
      for (const r of featureResults) {
        if (r && r.featureId && r.op === 'ensure') installed.push(r.featureId)
      }
      if (installed.length > 0) {
        console.log(`- Features installed: ${installed.join(', ')}`)
      }

      if (verifyFeatures) {
        if (verifyFailures.length > 0) {
          console.log(`- Features verified: failed (${verifyFailures.join(', ')})`)
        } else {
          console.log(`- Features verified: yes`)
        }
      }

      if (!stage_a_res.ok) console.log('[warn] Stage A docs check had errors; consider re-running with --require-stage-a.')
      if (stage_a_res.warnings.length > 0) console.log('[warn] Stage A docs check has warnings; ensure TBD/TODO items are tracked.')
      if (retentionTemplateResult.path) {
        const status = retentionTemplateResult.mode || retentionTemplateResult.reason || 'unknown'
        console.log(`- Skill retention template: ${path.relative(repoRoot, retentionTemplateResult.path)} (${status})`)
      }
      console.log(`- Manifest updated: ${path.relative(repoRoot, manifestResult.path)}`)
      console.log(`- Wrappers synced via: ${syncResult.cmd || '(skipped)'}`)
      if (cleanupResult) console.log(`- init/ cleanup: ${cleanupResult.mode}`)
    }

    process.exit(0)
  }

  if (command === 'cleanup-init') {
    if (!opts['i-understand']) die('[error] cleanup-init requires --i-understand');
    const apply = !!opts['apply'];
    const archiveAll = !!opts['archive'];
    const archiveDocs = archiveAll || !!opts['archive-docs'];
    const archiveBlueprint = archiveAll || !!opts['archive-blueprint'];

    const results = { init: null, archivedDocs: null, archivedBlueprint: null };
    const destDir = path.join(repoRoot, 'docs', 'project');

    // Archive Stage A docs if requested
    const stage_a_docs_dir = path.join(repoRoot, 'init', 'stage-a-docs');
    if (fs.existsSync(stage_a_docs_dir)) {
      if (archiveDocs) {
        if (!apply) {
          results.archivedDocs = { from: stage_a_docs_dir, to: destDir, mode: 'dry-run' };
        } else {
          fs.mkdirSync(destDir, { recursive: true });
          const files = fs.readdirSync(stage_a_docs_dir);
          for (const file of files) {
            const srcFile = path.join(stage_a_docs_dir, file);
            const destFile = path.join(destDir, file);
            if (fs.statSync(srcFile).isFile()) {
              fs.copyFileSync(srcFile, destFile);
            }
          }
          results.archivedDocs = { from: stage_a_docs_dir, to: destDir, mode: 'applied', files };
        }
      } else if (apply) {
        console.log('[info] Stage A docs will be deleted with init/');
        console.log('[hint] Use --archive or --archive-docs to preserve them in docs/project/');
      }
    }

    // Archive blueprint if requested
    const blueprintSrc = path.join(repoRoot, 'init', 'project-blueprint.json');
    if (fs.existsSync(blueprintSrc)) {
      if (archiveBlueprint) {
        const blueprintDest = path.join(destDir, 'project-blueprint.json');
        if (!apply) {
          results.archivedBlueprint = { from: blueprintSrc, to: blueprintDest, mode: 'dry-run' };
        } else {
          fs.mkdirSync(destDir, { recursive: true });
          fs.copyFileSync(blueprintSrc, blueprintDest);
          results.archivedBlueprint = { from: blueprintSrc, to: blueprintDest, mode: 'applied' };
        }
      } else if (apply) {
        console.log('[info] Blueprint will be deleted with init/');
        console.log('[hint] Use --archive or --archive-blueprint to preserve it in docs/project/');
      }
    }

    // Cleanup init/ directory
    results.init = cleanupInit(repoRoot, apply);

    if (format === 'json') {
      console.log(JSON.stringify({ ok: true, results }, null, 2));
    } else {
      // Print archive results
      if (results.archivedDocs) {
        const arc = results.archivedDocs;
        if (arc.mode === 'dry-run') {
          console.log(`[plan] archive: Stage A docs → ${path.relative(repoRoot, arc.to)} (dry-run)`);
        } else {
          console.log(`[ok] archive: Stage A docs → ${path.relative(repoRoot, arc.to)}`);
          if (arc.files) console.log(`  Files: ${arc.files.join(', ')}`);
        }
      }
      if (results.archivedBlueprint) {
        const arc = results.archivedBlueprint;
        if (arc.mode === 'dry-run') {
          console.log(`[plan] archive: Blueprint → ${path.relative(repoRoot, arc.to)} (dry-run)`);
        } else {
          console.log(`[ok] archive: Blueprint → ${path.relative(repoRoot, arc.to)}`);
        }
      }

      // Print init cleanup result
      if (results.init) {
        const res = results.init;
        if (!apply) {
          console.log(`[plan] ${res.op}: ${path.relative(repoRoot, res.path || '')} (${res.mode})`);
          if (res.note) console.log(`Note: ${res.note}`);
        } else {
          console.log(`[ok] ${res.op}: ${path.relative(repoRoot, res.path || '')} (${res.mode})`);
          if (res.note) console.log(`Note: ${res.note}`);
        }
      }
    }
    process.exit(0);
  }

  usage(1);
}

main();

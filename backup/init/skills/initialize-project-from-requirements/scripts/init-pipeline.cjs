#!/usr/bin/env node
/**
 * init-pipeline.cjs
 *
 * Dependency-free helper for a 3-stage, verifiable init pipeline:
 *
 *   Stage A: requirements docs under `init/stage-a-docs/`
 *   Stage B: blueprint JSON at `init/project-blueprint.json`
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
 *   - suggest-addons Recommend add-ons from blueprint capabilities
 *   - scaffold       Plan or apply a minimal directory scaffold from the blueprint
 *   - apply          validate + (optional) check-docs + scaffold + configs + pack enable + wrapper sync
 *   - cleanup-init   Remove the `init/` bootstrap kit (opt-in, guarded)
 *
 * This script is intentionally framework-agnostic. It avoids generating code.
 */

const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');

function usage(exitCode = 0) {
  const msg = `
Usage:
  node init/skills/initialize-project-from-requirements/scripts/init-pipeline.cjs <command> [options]

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
    --write                      Add missing recommended packs into blueprint (safe-add only)

  suggest-addons
    --blueprint <path>          Blueprint JSON path (default: init/project-blueprint.json)
    --repo-root <path>          Repo root (default: cwd)
    --format <text|json>        Output format (default: text)
    --write                      Add missing recommended add-ons into blueprint (safe-add only)

  scaffold
    --blueprint <path>          Blueprint JSON path (default: init/project-blueprint.json)
    --repo-root <path>          Repo root (default: cwd)
    --apply                      Actually create directories/files (default: dry-run)

  apply
    --blueprint <path>          Blueprint JSON path (default: init/project-blueprint.json)
    --repo-root <path>          Repo root (default: cwd)
    --providers <both|codex|claude|codex,claude>
    --addons-root <path>        Add-ons directory (default: addons)
    --require-stage-a           Refuse apply if Stage A docs invalid
    --skip-configs              Do not generate config files
    --cleanup-init              Run cleanup-init after apply
    --cleanup-addons            Also prune unused add-ons (requires --cleanup-init)
    --force-addons              Force reinstall add-ons (overwrite existing)
    --verify-addons             Run verify after add-on installation
    --non-blocking-addons       Continue on add-on errors (default: fail-fast)
    --format <text|json>        Output format (default: text)

  cleanup-init
    --repo-root <path>          Repo root (default: cwd)
    --apply                      Actually remove init/ (default: dry-run)
    --i-understand              Required acknowledgement (refuses without it)
    --archive                   Archive all (Stage A docs + Blueprint) to docs/project/ before cleanup
    --archive-docs              Archive Stage A docs only to docs/project/
    --archive-blueprint         Archive Blueprint only to docs/project/
    --cleanup-addons            Also remove unused add-on directories from addons/
    --addons-root <path>        Add-ons directory (default: addons)
    --blueprint <path>          Blueprint JSON path (default: init/project-blueprint.json)

  cleanup-addons
    --repo-root <path>          Repo root (default: cwd)
    --apply                      Actually remove addons/ (default: dry-run)
    --i-understand              Required acknowledgement (refuses without it)
    --addons-root <path>        Add-ons directory (default: addons)

Examples:
  node .../init-pipeline.cjs start
  node .../init-pipeline.cjs status
  node .../init-pipeline.cjs check-docs --strict
  node .../init-pipeline.cjs validate
  node .../init-pipeline.cjs apply --providers both
  node .../init-pipeline.cjs approve --stage A
  node .../init-pipeline.cjs cleanup-init --apply --i-understand --archive
  node .../init-pipeline.cjs cleanup-addons --apply --i-understand
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
  if (args.length === 0 || args[0] === '-h' || args[0] === '--help') usage(0);

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

// ============================================================================
// State Management
// ============================================================================

const SCRIPT_DIR = __dirname;
const TEMPLATES_DIR = path.join(SCRIPT_DIR, '..', 'templates');

const STAGE_BLOCK_KEYS = Object.freeze({
  A: 'stage-a',
  B: 'stage-b',
  C: 'stage-c'
});

function blockKeyForStage(stage) {
  const key = STAGE_BLOCK_KEYS[stage];
  if (!key) die(`[error] Unknown stage: ${stage}`);
  return key;
}

function normalizeState(state) {
  if (!state || typeof state !== 'object') return state;

  for (const stage of Object.keys(STAGE_BLOCK_KEYS)) {
    const oldKey = `stage${stage}`;
    const newKey = blockKeyForStage(stage);
    if (state[oldKey] !== undefined && state[newKey] === undefined) {
      state[newKey] = state[oldKey];
    }
    if (state[oldKey] !== undefined) delete state[oldKey];
  }

  return state;
}

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
    return normalizeState(JSON.parse(fs.readFileSync(statePath, 'utf8')));
  } catch (e) {
    console.error(`[warn] Failed to parse state file: ${e.message}`);
    return null;
  }
}

function saveState(repoRoot, state) {
  const statePath = getStatePath(repoRoot);
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(normalizeState(state), null, 2) + '\n', 'utf8');
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
  const requirements = state['stage-a'] || {};
  const blueprint = state['stage-b'] || {};
  const scaffold = state['stage-c'] || {};

  const mustAskKeys = Object.keys(requirements.mustAsk || {});
  const mustAskAnswered = mustAskKeys.filter(k => requirements.mustAsk[k]?.answered).length;

  const docsKeys = ['requirements', 'nfr', 'glossary', 'riskQuestions'];
  const docsWritten = docsKeys.filter(k => requirements.docsWritten?.[k]).length;

  return {
    stage: state.stage,
    'stage-a': {
      mustAskTotal: mustAskKeys.length,
      mustAskAnswered,
      docsTotal: docsKeys.length,
      docsWritten,
      validated: !!requirements.validated,
      userApproved: !!requirements.userApproved
    },
    'stage-b': {
      drafted: !!blueprint.drafted,
      validated: !!blueprint.validated,
      packsReviewed: !!blueprint.packsReviewed,
      userApproved: !!blueprint.userApproved
    },
    'stage-c': {
      scaffoldApplied: !!scaffold.scaffoldApplied,
      configsGenerated: !!scaffold.configsGenerated,
      manifestUpdated: !!scaffold.manifestUpdated,
      wrappersSynced: !!scaffold.wrappersSynced,
      userApproved: !!scaffold.userApproved
    }
  };
}

function printStatus(state, repoRoot) {
  const progress = getStageProgress(state);
  const labelsByStage = { A: 'Requirements', B: 'Blueprint', C: 'Scaffold', complete: 'Complete' };

  console.log('');
  console.log('┌─────────────────────────────────────────────────────────┐');
  console.log('│  Init State                                              │');
  console.log('├─────────────────────────────────────────────────────────┤');
  console.log(`│  Current stage: Stage ${progress.stage} - ${labelsByStage[progress.stage] || progress.stage}`);
  console.log('│');

  if (progress.stage === 'A' || progress.stage === 'B' || progress.stage === 'C') {
    console.log('│  Stage A progress:');
    console.log(`│    Must-ask: ${progress['stage-a'].mustAskAnswered}/${progress['stage-a'].mustAskTotal} completed`);
    console.log(`│    Docs written: ${progress['stage-a'].docsWritten}/${progress['stage-a'].docsTotal} completed`);
    console.log(`│    Validation: ${progress['stage-a'].validated ? '✓ validated' : '✗ not validated'}`);
    console.log(`│    User approval: ${progress['stage-a'].userApproved ? '✓ approved' : '✗ not approved'}`);
  }

  if (progress.stage === 'B' || progress.stage === 'C') {
    console.log('│');
    console.log('│  Stage B progress:');
    console.log(`│    Drafted: ${progress['stage-b'].drafted ? '✓' : '✗'}`);
    console.log(`│    Validated: ${progress['stage-b'].validated ? '✓' : '✗'}`);
    console.log(`│    Packs reviewed: ${progress['stage-b'].packsReviewed ? '✓' : '✗'}`);
    console.log(`│    User approval: ${progress['stage-b'].userApproved ? '✓' : '✗'}`);
  }

  if (progress.stage === 'C' || progress.stage === 'complete') {
    console.log('│');
    console.log('│  Stage C progress:');
    console.log(`│    Scaffold: ${progress['stage-c'].scaffoldApplied ? '✓' : '✗'}`);
    console.log(`│    Configs: ${progress['stage-c'].configsGenerated ? '✓' : '✗'}`);
    console.log(`│    Manifest: ${progress['stage-c'].manifestUpdated ? '✓' : '✗'}`);
    console.log(`│    Wrappers synced: ${progress['stage-c'].wrappersSynced ? '✓' : '✗'}`);
  }

  console.log('│');
  console.log('│  Next steps:');
  if (progress.stage === 'A') {
    if (!progress['stage-a'].validated) {
      console.log('│    1. Complete the requirements interview and write docs (init/stage-a-docs/*.md)');
      console.log('│    2. Run: check-docs --strict');
    } else if (!progress['stage-a'].userApproved) {
      console.log('│    Have the user review and approve Stage A docs');
      console.log('│    After approval, run: approve --stage A');
    }
  } else if (progress.stage === 'B') {
    if (!progress['stage-b'].validated) {
      console.log('│    1. Edit init/project-blueprint.json');
      console.log('│    2. Run: validate');
    } else if (!progress['stage-b'].userApproved) {
      console.log('│    Have the user review and approve the blueprint');
      console.log('│    After approval, run: approve --stage B');
    }
  } else if (progress.stage === 'C') {
    if (!progress['stage-c'].wrappersSynced) {
      console.log('│    Run: apply --providers both');
    } else if (!progress['stage-c'].userApproved) {
      console.log('│    Initialization is nearly complete; have the user confirm');
      console.log('│    After confirmation, run: cleanup-init --apply --i-understand [--archive]');
    }
  } else if (progress.stage === 'complete') {
    console.log('│    Initialization completed!');
  }

  console.log('└─────────────────────────────────────────────────────────┘');
  console.log('');
}

// ============================================================================
// Config File Generation
// ============================================================================

function generateConfigFiles(repoRoot, blueprint, apply) {
  // Delegate to scripts/scaffold-configs.cjs (single source of truth)
  const { generateConfigFiles: gen } = require('./scaffold-configs.cjs');
  return gen(repoRoot, blueprint, apply);
}

function packPrefixMap() {
  // Must match actual .ai/skills/ directory structure
  return {
    workflows: 'workflows/',
    standards: 'standards/',
    backend: 'backend/',
    frontend: 'frontend/',
    scaffold: 'scaffold/',
    'scaffold-core': 'scaffold/',
    'context-core': 'scaffold/context/'
  };
}

function packOrder() {
  // Base packs available in template (matches .ai/skills/_meta/packs/)
  return ['workflows', 'standards', 'backend', 'frontend', 'scaffold', 'scaffold-core', 'context-core'];
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

  // Capabilities sanity checks (warn-only unless obviously inconsistent)
  const caps = blueprint.capabilities || {};
  if (caps.database && caps.database.enabled) {
    if (!caps.database.kind || typeof caps.database.kind !== 'string') warnings.push('capabilities.database.enabled=true but capabilities.database.kind is missing.');
  }
  if (caps.api && caps.api.style && typeof caps.api.style !== 'string') warnings.push('capabilities.api.style should be a string.');
  if (caps.bpmn && typeof caps.bpmn.enabled !== 'boolean') warnings.push('capabilities.bpmn.enabled should be boolean when present.');

  const skills = blueprint.skills || {};
  if (skills.packs && !Array.isArray(skills.packs)) errors.push('skills.packs must be an array of strings when present.');

  const packs = normalizePackList(skills.packs || []);
  if (!packs.includes('workflows')) warnings.push('skills.packs does not include "workflows". This is usually required.');
  if (!packs.includes('standards')) warnings.push('skills.packs does not include "standards". This is usually recommended.');

  const ok = errors.length === 0;
  return { ok, errors, warnings, packs };
}

function isContextAwarenessEnabled(blueprint) {
  // In the module-first template, context is a CORE capability.
  // Treat it as enabled unless explicitly disabled.
  const addons = (blueprint && blueprint.addons) || {};
  const v = addons.contextAwareness;
  if (v === false || v === 'false' || v === 0) return false;
  return true;
}

function recommendedPacksFromBlueprint(blueprint) {
  const rec = new Set(['workflows', 'standards']);
  const caps = blueprint.capabilities || {};

  if (caps.backend && caps.backend.enabled) rec.add('backend');
  if (caps.frontend && caps.frontend.enabled) rec.add('frontend');

  // Module template includes scaffold and context-core by default
  if (isContextAwarenessEnabled(blueprint)) {
    rec.add('scaffold');
    rec.add('context-core');
  }

  // Optional packs can be added explicitly via blueprint.skills.packs.
  // (This function only computes recommendations; it does NOT mutate the blueprint.)

  const ordered = [];
  for (const p of packOrder()) {
    if (rec.has(p)) ordered.push(p);
  }
  return ordered;
}

function recommendedAddonsFromBlueprint(blueprint) {
  const rec = [];
  const caps = blueprint.capabilities || {};
  const q = blueprint.quality || {};
  const devops = blueprint.devops || {};

  // NOTE: context-awareness is a CORE capability in the module-first template.
  // It is NOT an addon and is always enabled by default.
  // See isContextAwarenessEnabled() for how to explicitly disable it.

  // db-mirror: enabled when database is enabled
  if (caps.database && caps.database.enabled) rec.push('db-mirror');

  // packaging: enabled when containerization/packaging is configured
  const packagingEnabled =
    (devops.packaging && devops.packaging.enabled) ||
    (q.devops && q.devops.containerize);
  if (packagingEnabled) rec.push('packaging');

  // deployment: enabled when deployment is configured
  const deploymentEnabled =
    (devops.deploy && devops.deploy.enabled) ||
    (blueprint.deploy && blueprint.deploy.enabled);
  if (deploymentEnabled) rec.push('deployment');

  // release: enabled when release management is configured
  const releaseEnabled =
    (blueprint.release && blueprint.release.enabled);
  if (releaseEnabled) rec.push('release');

  // observability: enabled when observability is configured
  const observabilityEnabled =
    (blueprint.observability && blueprint.observability.enabled);
  if (observabilityEnabled) rec.push('observability');

  return rec;
}

function getEnabledAddons(blueprint) {
  const addons = blueprint.addons || {};
  const enabled = [];
  
  // NOTE: context-awareness is a CORE capability, not an addon.
  // It is not included in this list because it doesn't live in addons/.
  if (isDbMirrorEnabled(blueprint)) enabled.push('db-mirror');
  if (isPackagingEnabled(blueprint)) enabled.push('packaging');
  if (isDeploymentEnabled(blueprint)) enabled.push('deployment');
  if (isReleaseEnabled(blueprint)) enabled.push('release');
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

  for (const spec of required) {
    const fp = path.join(docsRoot, spec.name);
    if (!fs.existsSync(fp)) {
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

function findAddonPayloadDir(repoRoot, addonsRoot, addonId) {
  const candidates = [
    path.join(repoRoot, addonsRoot, addonId, 'payload'),
    // common fallbacks
    path.join(repoRoot, addonsRoot, addonId.replace(/-/g, '_'), 'payload'),
    path.join(repoRoot, addonsRoot, addonId.replace(/_/g, '-'), 'payload'),
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
    // Some add-on scripts may not accept --repo-root; retry without it (cwd is already repoRoot).
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

// ============================================================================
// Add-on Detection Functions
// ============================================================================

function isDbMirrorEnabled(blueprint) {
  if (!blueprint || typeof blueprint !== 'object') return false;
  const addons = blueprint.addons || {};
  // Only addons.* triggers installation; db.* is configuration only
  return addons.dbMirror === true || addons['db-mirror'] === true;
}

function isPackagingEnabled(blueprint) {
  if (!blueprint || typeof blueprint !== 'object') return false;
  const addons = blueprint.addons || {};
  // Only addons.* triggers installation; packaging.* is configuration only
  return addons.packaging === true;
}

function isDeploymentEnabled(blueprint) {
  if (!blueprint || typeof blueprint !== 'object') return false;
  const addons = blueprint.addons || {};
  // Only addons.* triggers installation; deploy.* is configuration only
  return addons.deployment === true;
}

function isReleaseEnabled(blueprint) {
  if (!blueprint || typeof blueprint !== 'object') return false;
  const addons = blueprint.addons || {};
  // Only addons.* triggers installation; release.* is configuration only
  return addons.release === true;
}

function isObservabilityEnabled(blueprint) {
  if (!blueprint || typeof blueprint !== 'object') return false;
  const addons = blueprint.addons || {};
  // Only addons.* triggers installation; observability.* is configuration only
  return addons.observability === true;
}

// ============================================================================
// Generic Add-on Installer
// ============================================================================

function ensureAddon(repoRoot, addonId, addonsRoot, apply, ctlScriptName, options = {}) {
  const { force = false, verify = false } = options;
  const result = { addonId, op: 'ensure', actions: [], warnings: [], errors: [] };

  // Determine the control script name (e.g., dbctl.js, cictl.js)
  const ctlName = ctlScriptName || `${addonId.replace(/-/g, '')}ctl.js`;
  const ctlPath = path.join(repoRoot, '.ai', 'scripts', ctlName);

  // If control script already exists and not force, just re-initialize (idempotent)
  const needsInstall = !fs.existsSync(ctlPath) || force;
  if (needsInstall) {
    const payloadDir = findAddonPayloadDir(repoRoot, addonsRoot, addonId);
    if (!payloadDir) {
      result.warnings.push(`Add-on "${addonId}" is enabled but payload not found. Expected: ${path.join(addonsRoot, addonId, 'payload')}`);
      return result;
    }

    const copyRes = copyDirIfMissing(payloadDir, repoRoot, apply, force);
    if (!copyRes.ok) {
      result.errors.push(copyRes.error || `Failed to copy add-on "${addonId}" payload.`);
      return result;
    }
    result.actions.push({ op: force ? 'reinstall-addon' : 'install-addon', addonId, from: payloadDir, to: repoRoot, mode: apply ? 'applied' : 'dry-run' });
    result.actions.push(...copyRes.actions);
  }

  // Run init command if control script exists
  if (fs.existsSync(ctlPath)) {
    result.actions.push(runNodeScriptWithRepoRootFallback(repoRoot, ctlPath, ['init', '--repo-root', repoRoot], apply));
    
    // Run verify if requested
    if (verify && apply) {
      const verifyRes = runNodeScriptWithRepoRootFallback(repoRoot, ctlPath, ['verify', '--repo-root', repoRoot], apply);
      result.actions.push(verifyRes);
      if (verifyRes.mode === 'failed') {
        result.verifyFailed = true;
        result.verifyError = `Add-on "${addonId}" verify failed`;
      }
    }
  } else if (apply) {
    result.warnings.push(`Add-on "${addonId}" control script not found after install: ${ctlName}`);
  }

  return result;
}

function ensureContextAwarenessAddon(repoRoot, blueprint, addonsRoot, apply, options = {}) {
  const { force = false, verify = false } = options;
  const enabled = isContextAwarenessEnabled(blueprint);
  const result = { enabled, op: enabled ? 'ensure' : 'skip', actions: [], warnings: [], errors: [] };

  if (!enabled) return result;

  // In the module-first template, context awareness is a CORE capability.
  // contextctl.js and projectctl.js are pre-installed core scripts, not add-on payloads.
  const contextctl = path.join(repoRoot, '.ai', 'scripts', 'contextctl.js');
  const projectctl = path.join(repoRoot, '.ai', 'scripts', 'projectctl.js');

  // Verify core scripts exist (they should be pre-installed in the template)
  if (!fs.existsSync(contextctl)) {
    result.errors.push(`Core script .ai/scripts/contextctl.js is missing. This is a required core capability in the module-first template.`);
    return result;
  }

  if (!fs.existsSync(projectctl)) {
    result.warnings.push(`Core script .ai/scripts/projectctl.js is missing. Project state management will be limited.`);
  }

  // Initialize docs/context skeleton (idempotent)
  result.actions.push(runNodeScriptWithRepoRootFallback(repoRoot, contextctl, ['init', '--repo-root', repoRoot].concat(apply ? [] : ['--dry-run']), apply));

  // Initialize project state if projectctl exists
  if (fs.existsSync(projectctl)) {
    result.actions.push(runNodeScriptWithRepoRootFallback(repoRoot, projectctl, ['init', '--repo-root', repoRoot].concat(apply ? [] : ['--dry-run']), apply));
    const mode = getContextMode(blueprint);
    result.actions.push(runNodeScriptWithRepoRootFallback(repoRoot, projectctl, ['set-context-mode', mode, '--repo-root', repoRoot].concat(apply ? [] : ['--dry-run']), apply));
  }

  // Run verify if requested
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

  // Always ensure docs directory exists (Stage A/B will live here)
  results.push(ensureDir(path.join(repoRoot, 'docs'), apply));
  results.push(ensureDir(path.join(repoRoot, 'docs', 'project'), apply));

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

        // Optional: DevOps scaffolding (packaging/deploy conventions)
  // Enabled when either:
  // - blueprint.devops.enabled (or sub-flags) is true
  // - blueprint.quality.ci.enabled is true
  // - blueprint.quality.devops.* indicates containerization/packaging/deploy
  const q = blueprint.quality || {};
  const devops = blueprint.devops || {};
  const devopsEnabled =
    (q.ci && q.ci.enabled) ||
    (q.devops && (q.devops.enabled || q.devops.containerize || q.devops.packaging || q.devops.deployment)) ||
    (devops && (devops.enabled || (devops.packaging && devops.packaging.enabled) || (devops.deploy && devops.deploy.enabled)));

  if (devopsEnabled) {
    results.push(ensureDir(path.join(repoRoot, 'ops'), apply));
    results.push(writeFileIfMissing(
      path.join(repoRoot, 'ops', 'README.md'),
      `# Ops (Packaging & Deploy)

This folder holds DevOps-oriented configuration and workdocs.

High-level split:
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
      path.join(repoRoot, 'ops', 'packaging', 'scripts', 'build.js'),
      `#!/usr/bin/env node
/**
 * build.js (placeholder)
 *
 * Provider-agnostic packaging entry.
 * Extend it to build artifacts for your services/jobs/apps.
 */

console.log("[todo] Implement packaging build pipeline for this repo.");
process.exit(0);
`,
      apply
    ));

    // Deploy (http services, workloads, clients)
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
      path.join(repoRoot, 'ops', 'deploy', 'scripts', 'deploy.js'),
      `#!/usr/bin/env node
/**
 * deploy.js (placeholder)
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
      path.join(repoRoot, 'ops', 'deploy', 'scripts', 'rollback.js'),
      `#!/usr/bin/env node
/**
 * rollback.js (placeholder)
 *
 * Provider-agnostic rollback entry.
 */

console.log("[todo] Implement rollback procedure for this repo.");
process.exit(0);
`,
      apply
    ));
  }


  return results;
}

function updateManifest(repoRoot, blueprint, apply) {
  // In add-on repos, pack switching MUST go through .ai/scripts/skillsctl.js (scheme A).
  // In non-add-on repos, fall back to a flat sync-manifest.json update (additive; never removes).
  const manifestPath = path.join(repoRoot, '.ai', 'skills', '_meta', 'sync-manifest.json');
  const skillsctlPath = path.join(repoRoot, '.ai', 'scripts', 'skillsctl.js');

  const warnings = [];
  const errors = [];

  const packsFromBlueprint = normalizePackList((blueprint.skills && blueprint.skills.packs) || []);
  const packs = new Set(packsFromBlueprint);

  // Add-on: context awareness is an explicit capability switch; it implies enabling the context-core pack.
  if (isContextAwarenessEnabled(blueprint)) {
    packs.add('context-core');
  }

  const packList = Array.from(packs);

  if (packList.length === 0) {
    return { op: 'skip', path: manifestPath, mode: apply ? 'applied' : 'dry-run', warnings, note: 'no packs requested' };
  }

  // Prefer skillsctl if available (add-on mode)
  if (fs.existsSync(skillsctlPath)) {
    // Preflight: ensure pack files exist (more actionable than letting skillsctl fail mid-run).
    for (const p of packList) {
      const packFile = path.join(repoRoot, '.ai', 'skills', '_meta', 'packs', `${p}.json`);
      if (!fs.existsSync(packFile)) {
        errors.push(`Pack "${p}" is requested, but pack file is missing: ${path.relative(repoRoot, packFile)}`);
      }
    }

    if (errors.length > 0) {
      return { op: 'skillsctl', path: skillsctlPath, mode: 'failed', errors, warnings, packs: packList };
    }

    const actions = [];
    for (const p of packList) {
      const cmd = 'node';
      const args = [skillsctlPath, 'enable-pack', p, '--repo-root', repoRoot, '--no-sync'];
      const printable = `${cmd} ${args.join(' ')}`;

      if (!apply) {
        actions.push({ op: 'run', cmd: printable, mode: 'dry-run' });
        continue;
      }

      const res = childProcess.spawnSync(cmd, args, { stdio: 'inherit', cwd: repoRoot });
      if (res.status !== 0) {
        return { op: 'skillsctl', path: skillsctlPath, mode: 'failed', exitCode: res.status, packs: packList, warnings };
      }
      actions.push({ op: 'run', cmd: printable, mode: 'applied' });
    }

    // Read effective manifest (if present) for reporting
    let effective = null;
    if (fs.existsSync(manifestPath)) {
      try { effective = readJson(manifestPath); } catch {}
    }

    return { op: 'skillsctl', path: manifestPath, mode: apply ? 'applied' : 'dry-run', warnings, packs: packList, actions, effectiveManifest: effective };
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
      warnings.push(`Pack "${p}" has no prefix mapping and skillsctl is not installed; skipping (install add-on or add pack mapping).`);
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
  const scriptPath = path.join(repoRoot, '.ai', 'scripts', 'sync-skills.cjs');
  if (!fs.existsSync(scriptPath)) {
    return { op: 'skip', path: scriptPath, reason: 'sync-skills.cjs not found' };
  }
  const providersArg = providers || 'both';
  const cmd = 'node';
  // sync-skills supports destructive modes guarded by --yes. Provider wrappers are
  // generated artifacts in this repo, so we run deterministically in reset mode.
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

function cleanupUnusedAddons(repoRoot, blueprint, addonsRoot, apply) {
  const enabledAddons = getEnabledAddons(blueprint);
  const addonsDir = path.join(repoRoot, addonsRoot);
  
  // NOTE: context-awareness is NOT in this list because it is a CORE capability,
  // not an addon. Its scripts live in .ai/scripts/, not addons/.
  const allAddonIds = [
    'db-mirror',
    'packaging',
    'deployment',
    'release',
    'observability'
  ];

  const removedAddons = [];
  const skippedAddons = [];
  
  if (!fs.existsSync(addonsDir)) {
    return { removed: removedAddons, skipped: skippedAddons, note: 'addons/ not present' };
  }

  for (const addonId of allAddonIds) {
    const addonDir = path.join(addonsDir, addonId);
    if (!fs.existsSync(addonDir)) continue;
    
    if (enabledAddons.includes(addonId)) {
      skippedAddons.push({ addonId, reason: 'enabled' });
      continue;
    }
    
    if (!apply) {
      removedAddons.push({ addonId, mode: 'dry-run' });
      continue;
    }
    
    try {
      fs.rmSync(addonDir, { recursive: true, force: true });
      removedAddons.push({ addonId, mode: 'applied' });
    } catch (e) {
      removedAddons.push({ addonId, mode: 'failed', error: e.message });
    }
  }
  
  // Try to remove the addons/ directory itself if empty
  if (apply && removedAddons.length > 0) {
    try {
      const remaining = fs.readdirSync(addonsDir);
      if (remaining.length === 0) {
        fs.rmdirSync(addonsDir);
      }
    } catch { /* ignore */ }
  }
  
  return { removed: removedAddons, skipped: skippedAddons };
}

function isWithinRepoRoot(repoRoot, candidatePath) {
  const rel = path.relative(repoRoot, candidatePath);
  if (!rel) return false; // same path
  if (rel.startsWith('..') || rel.startsWith(`..${path.sep}`)) return false;
  return !path.isAbsolute(rel);
}

function cleanupAddonsDir(repoRoot, addonsRoot, apply) {
  const addonsDir = path.resolve(repoRoot, addonsRoot || 'addons');
  const marker = path.join(addonsDir, 'CONVENTION.md');

  if (!isWithinRepoRoot(repoRoot, addonsDir)) {
    return { op: 'refuse', path: addonsDir, mode: 'refused', reason: 'addons-root must be within repo-root' };
  }

  if (!fs.existsSync(addonsDir)) {
    return { op: 'skip', path: addonsDir, mode: 'skipped', reason: 'addons/ not present' };
  }

  // Guardrails similar to init/.init-kit: reduce risk of deleting a non-template directory.
  if (!fs.existsSync(marker)) {
    return { op: 'refuse', path: addonsDir, mode: 'refused', reason: 'missing addons/CONVENTION.md marker' };
  }

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const trashDir = path.join(repoRoot, `.addons-trash-${ts}`);

  if (!apply) {
    return { op: 'rm', path: addonsDir, mode: 'dry-run', note: `will move to ${path.basename(trashDir)} then delete` };
  }

  // Move first (reduces risk if delete fails on Windows due to open file handles)
  fs.renameSync(addonsDir, trashDir);

  try {
    fs.rmSync(trashDir, { recursive: true, force: true });
    return { op: 'rm', path: addonsDir, mode: 'applied' };
  } catch (e) {
    return {
      op: 'rm',
      path: addonsDir,
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
      console.log('[info] To restart, delete init/.init-state.json');
      process.exit(0);
    }

    // Create Stage A docs directory and templates
    const requirementsDocsDir = path.join(repoRoot, 'init', 'stage-a-docs');
    const templatesDir = path.join(path.dirname(__filename), '..', 'templates');
    
    if (!fs.existsSync(requirementsDocsDir)) {
      fs.mkdirSync(requirementsDocsDir, { recursive: true });
      console.log('[ok] Created directory: init/stage-a-docs/');
    }

    // Copy Stage A doc templates
    const requirementsDocTemplates = [
      { src: 'requirements.template.md', dst: 'requirements.md' },
      { src: 'non-functional-requirements.template.md', dst: 'non-functional-requirements.md' },
      { src: 'domain-glossary.template.md', dst: 'domain-glossary.md' },
      { src: 'risk-open-questions.template.md', dst: 'risk-open-questions.md' }
    ];

    for (const tpl of requirementsDocTemplates) {
      const srcPath = path.join(templatesDir, tpl.src);
      const dstPath = path.join(requirementsDocsDir, tpl.dst);
      if (!fs.existsSync(dstPath) && fs.existsSync(srcPath)) {
        fs.copyFileSync(srcPath, dstPath);
        console.log(`[ok] Created template: init/stage-a-docs/${tpl.dst}`);
      } else if (fs.existsSync(dstPath)) {
        console.log(`[skip] Already exists: init/stage-a-docs/${tpl.dst}`);
      }
    }

    // Copy Blueprint template
    const blueprintDst = path.join(repoRoot, 'init', 'project-blueprint.json');
    const blueprintSrc = path.join(templatesDir, 'project-blueprint.min.example.json');
    if (!fs.existsSync(blueprintDst) && fs.existsSync(blueprintSrc)) {
      fs.copyFileSync(blueprintSrc, blueprintDst);
      console.log('[ok] Created template: init/project-blueprint.json');
    } else if (fs.existsSync(blueprintDst)) {
      console.log('[skip] Already exists: init/project-blueprint.json');
    }

    const state = createInitialState();
    addHistoryEvent(state, 'init_started', 'Initialization started');
    saveState(repoRoot, state);

    console.log('[ok] Init state created: init/.init-state.json');
    console.log('');
    console.log('Next steps:');
    console.log('  1. Edit init/stage-a-docs/*.md and fill in requirements');
    console.log('  2. Run: check-docs --strict');
    console.log('  3. Run: approve --stage A');
    printStatus(state, repoRoot);
    process.exit(0);
  }

  // ========== status ==========
  if (command === 'status') {
    const state = loadState(repoRoot);
    if (!state) {
      console.log('[info] No init state detected');
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
      die('[error] No init state detected; run the \"start\" command first');
    }

    const progress = getStageProgress(state);
    const self = path.relative(repoRoot, __filename);
    const docsRel = path.relative(repoRoot, docsRoot);
    const bpRel = blueprintPath ? path.relative(repoRoot, blueprintPath) : 'init/project-blueprint.json';

    if (progress.stage === 'A') {
      if (!progress['stage-a'].validated) {
        console.log('[info] Stage A requirements docs have not passed structural validation.');
        console.log('Run first:');
        console.log(`  node ${self} check-docs --docs-root ${docsRel} --strict`);
        process.exit(1);
      }
      console.log('\n== Stage A → B Checkpoint ==\n');
      console.log('Stage A docs passed structural validation. Next: the user must review and explicitly approve.');
      console.log('After approval, run:');
      console.log(`  node ${self} approve --stage A --repo-root ${repoRoot}`);
      process.exit(0);
    }

    if (progress.stage === 'B') {
      if (!progress['stage-b'].validated) {
        console.log('[info] Stage B blueprint has not been validated.');
        console.log('Run first:');
        console.log(`  node ${self} validate --blueprint ${bpRel}`);
        process.exit(1);
      }
      console.log('\n== Stage B → C Checkpoint ==\n');
      console.log('Stage B blueprint validated successfully. Next: the user must review and explicitly approve.');
      console.log('After approval, run:');
      console.log(`  node ${self} approve --stage B --repo-root ${repoRoot}`);
      process.exit(0);
    }

    if (progress.stage === 'C') {
      if (!progress['stage-c'].wrappersSynced) {
        console.log('[info] Stage C is not complete (wrappers not synced).');
        console.log('Run first:');
        console.log(`  node ${self} apply --blueprint ${bpRel}`);
        process.exit(1);
      }

      console.log('\n== Stage C Completion Checkpoint ==\n');
      console.log('Stage C completed (scaffold + skills written).');
      console.log('Next: the user must confirm the generated scaffold and enabled capabilities match expectations.');
      console.log('After confirmation, run:');
      console.log(`  node ${self} approve --stage C --repo-root ${repoRoot}`);
      console.log('\nOptional: after that, run cleanup-init --apply --i-understand to delete the init/ directory');
      process.exit(0);
    }

    console.log('[info] Initialization completed (state.stage = complete)');
    process.exit(0);
  }



    // ========== approve ==========
  if (command === 'approve') {
    const state = loadState(repoRoot);
    if (!state) {
      die('[error] No init state detected; run the \"start\" command first');
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
      if (!state['stage-a'].validated) {
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
      if (!state['stage-b'].validated) {
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
      if (!state['stage-c'].wrappersSynced) {
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
    if (!fs.existsSync(blueprintPath)) die(`[error] Blueprint not found: ${blueprintPath}`);
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
    if (!state) die('[error] No init state detected; run the \"start\" command first');

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
    if (!state) die('[error] No init state detected; run the \"start\" command first');

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

  if (command === 'suggest-addons') {
    if (!blueprintPath) die('[error] --blueprint is required for suggest-addons');
    const blueprint = readJson(blueprintPath);

    const v = validateBlueprint(blueprint);
    const rec = recommendedAddonsFromBlueprint(blueprint);
    const current = getEnabledAddons(blueprint);
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
      summary: `[info] Add-ons: current=${current.join(', ') || '(none)'} | recommended=${rec.join(', ') || '(none)'}`
    };

    if (opts['write']) {
      if (!v.ok) die('[error] Cannot write add-ons: blueprint validation failed.');
      blueprint.addons = blueprint.addons || {};
      for (const addon of missing) {
        // Convert addon-id to camelCase key
        const key = addon.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        blueprint.addons[key] = true;
      }
      writeJson(blueprintPath, blueprint);
      result.wrote = { path: path.relative(repoRoot, blueprintPath), addons: [...current, ...missing] };
      result.summary += `\n[write] Added missing recommended add-ons into blueprint.addons`;
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
    const cleanupAddons = !!opts['cleanup-addons'];
    const forceAddons = !!opts['force-addons'];
    const verifyAddons = !!opts['verify-addons'];
    const nonBlockingAddons = !!opts['non-blocking-addons'];
    const addonsRoot = opts['addons-root'] || 'addons';

    if (cleanup && !opts['i-understand']) {
      die('[error] --cleanup-init requires --i-understand');
    }
    if (cleanupAddons && !cleanup) {
      die('[error] --cleanup-addons requires --cleanup-init');
    }

    const blueprint = readJson(blueprintPath);

    // Validate blueprint
    const v = validateBlueprint(blueprint);
    if (!v.ok) die('[error] Blueprint validation failed. Fix errors and re-run.');

    // Stage A docs check (strict only when explicitly required)
    const requirementsDocsCheck = checkDocs(docsRoot);
    if (requireStageA) {
      const strictOk = requirementsDocsCheck.ok && requirementsDocsCheck.warnings.length === 0;
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

    const addonOptions = { force: forceAddons, verify: verifyAddons };
    const verifyFailures = [];
    
    // Optional: context awareness add-on (on-demand; minimal intrusion)
    const contextAddon = ensureContextAwarenessAddon(repoRoot, blueprint, addonsRoot, true, addonOptions);
    if (contextAddon.errors && contextAddon.errors.length > 0) {
      for (const e of contextAddon.errors) console.error(`[error] ${e}`);
      if (!nonBlockingAddons) {
        die('[error] Context awareness add-on setup failed. Use --non-blocking-addons to continue despite errors.');
      }
    }
    if (contextAddon.verifyFailed) {
      const msg = contextAddon.verifyError || 'Context awareness verify failed';
      console.error(`[error] ${msg}`);
      verifyFailures.push('context-awareness');
      if (!nonBlockingAddons) {
        die('[error] Context awareness verify failed. Use --non-blocking-addons to continue despite errors.');
      }
    }
    if (contextAddon.warnings && contextAddon.warnings.length > 0) {
      for (const w of contextAddon.warnings) console.warn(`[warn] ${w}`);
    }

    // Optional add-ons installation
    const addonResults = [];

    // Helper function to handle addon installation with fail-fast support
    function handleAddonResult(res, addonName) {
      addonResults.push(res);
      if (res.errors.length > 0) {
        for (const e of res.errors) console.error(`[error] ${e}`);
        if (!nonBlockingAddons) {
          die(`[error] Add-on "${addonName}" installation failed. Use --non-blocking-addons to continue despite errors.`);
        }
      }
      if (res.verifyFailed) {
        const msg = res.verifyError || `Add-on "${addonName}" verify failed`;
        console.error(`[error] ${msg}`);
        verifyFailures.push(addonName);
        if (!nonBlockingAddons) {
          die(`[error] Add-on "${addonName}" verify failed. Use --non-blocking-addons to continue despite errors.`);
        }
      }
      if (res.warnings.length > 0) {
        for (const w of res.warnings) console.warn(`[warn] ${w}`);
      }
    }

    // db-mirror add-on
    if (isDbMirrorEnabled(blueprint)) {
      console.log('[info] Installing db-mirror add-on...');
      const res = ensureAddon(repoRoot, 'db-mirror', addonsRoot, true, 'dbctl.js', addonOptions);
      handleAddonResult(res, 'db-mirror');
    }

    // packaging add-on
    if (isPackagingEnabled(blueprint)) {
      console.log('[info] Installing packaging add-on...');
      const res = ensureAddon(repoRoot, 'packaging', addonsRoot, true, 'packctl.js', addonOptions);
      handleAddonResult(res, 'packaging');
    }

    // deployment add-on
    if (isDeploymentEnabled(blueprint)) {
      console.log('[info] Installing deployment add-on...');
      const res = ensureAddon(repoRoot, 'deployment', addonsRoot, true, 'deployctl.js', addonOptions);
      handleAddonResult(res, 'deployment');
    }

    // release add-on
    if (isReleaseEnabled(blueprint)) {
      console.log('[info] Installing release add-on...');
      const res = ensureAddon(repoRoot, 'release', addonsRoot, true, 'releasectl.js', addonOptions);
      handleAddonResult(res, 'release');
    }

    // observability add-on
    if (isObservabilityEnabled(blueprint)) {
      console.log('[info] Installing observability add-on...');
      const res = ensureAddon(repoRoot, 'observability', addonsRoot, true, 'obsctl.js', addonOptions);
      handleAddonResult(res, 'observability');
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

    // Sync wrappers
    const syncResult = syncWrappers(repoRoot, providers, true);
    if (syncResult.mode === 'failed') die(`[error] sync-skills.cjs failed with exit code ${syncResult.exitCode}`);

    // Modular core build (module-first; ensures SSOT + derived artifacts are consistent)
    const modularResults = [];
    console.log('[info] Running modular core build...');
    const flowctl = path.join(repoRoot, '.ai', 'scripts', 'flowctl.mjs');
    const modulectl = path.join(repoRoot, '.ai', 'scripts', 'modulectl.mjs');
    const integrationctl = path.join(repoRoot, '.ai', 'scripts', 'integrationctl.mjs');
    const contextctl = path.join(repoRoot, '.ai', 'scripts', 'contextctl.mjs');

    const modularSteps = [
      { name: 'flowctl init', script: flowctl, args: ['init', '--repo-root', repoRoot] },
      { name: 'integrationctl init', script: integrationctl, args: ['init', '--repo-root', repoRoot] },
      { name: 'modulectl registry-build', script: modulectl, args: ['registry-build', '--repo-root', repoRoot] },
      { name: 'flowctl update-from-manifests', script: flowctl, args: ['update-from-manifests', '--repo-root', repoRoot] },
      { name: 'flowctl lint', script: flowctl, args: ['lint', '--repo-root', repoRoot] },
      { name: 'flowctl graph', script: flowctl, args: ['graph', '--repo-root', repoRoot] },
      { name: 'integrationctl validate', script: integrationctl, args: ['validate', '--repo-root', repoRoot] },
      { name: 'contextctl build', script: contextctl, args: ['build', '--repo-root', repoRoot] },
    ];

    for (const step of modularSteps) {
      if (!fs.existsSync(step.script)) {
        modularResults.push({ op: 'skip', step: step.name, reason: 'missing_script', path: step.script });
        console.warn(`[warn] modular step skipped (missing script): ${step.name}`);
        continue;
      }
      const res = runNodeScriptWithRepoRootFallback(repoRoot, step.script, step.args, true);
      res.step = step.name;
      modularResults.push(res);
      if (res.mode === 'failed') die(`[error] Modular core build failed: ${res.cmd}`);
    }
    console.log('[ok] Modular core build completed.');

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
    let cleanupResult = null;
    let addonsCleanupResult = null;
    if (cleanup) {
      cleanupResult = cleanupInit(repoRoot, true);
      if (cleanupResult.mode === 'partial') {
        console.warn(`[warn] cleanup-init partially completed: ${cleanupResult.note}`);
      }
      
      // Also cleanup unused addons if requested
      if (cleanupAddons) {
        addonsCleanupResult = cleanupUnusedAddons(repoRoot, blueprint, addonsRoot, true);
        if (addonsCleanupResult.removed.length > 0) {
          console.log(`[ok] Unused add-ons pruned: ${addonsCleanupResult.removed.map(r => r.addonId).join(', ')}`);
        }
      }
    }

    if (format === 'json') {
      console.log(JSON.stringify({
	        ok: true,
	        blueprint: path.relative(repoRoot, blueprintPath),
	        docsRoot: path.relative(repoRoot, docsRoot),
	        'stage-a': requirementsDocsCheck,
	        contextAddon: contextAddon,
	        addons: addonResults,
        scaffold: scaffoldPlan,
        configs: configResults,
        readme: readmeResult,
        manifest: manifestResult,
        sync: syncResult,
        modular: modularResults,
        cleanup: cleanupResult,
        addonsCleanup: addonsCleanupResult
      }, null, 2));
    } else {
      console.log('[ok] Apply completed.');
      console.log(`- Blueprint: ${path.relative(repoRoot, blueprintPath)}`);
      console.log(`- Docs root: ${path.relative(repoRoot, docsRoot)}`);
      if (contextAddon && contextAddon.enabled) {
        console.log(`- Context awareness: enabled (addonsRoot=${addonsRoot})`);
      }
      if (addonResults.length > 0) {
        console.log(`- Add-ons installed: ${addonResults.map(r => r.addonId).join(', ')}`);
      }
      if (verifyAddons) {
        if (verifyFailures.length > 0) {
          console.log(`- Add-ons verified: failed (${verifyFailures.join(', ')})`);
        } else {
          console.log(`- Add-ons verified: yes`);
        }
      }
      if (!requirementsDocsCheck.ok) console.log('[warn] Stage A docs check had errors; consider re-running with --require-stage-a.');
      if (requirementsDocsCheck.warnings.length > 0) console.log('[warn] Stage A docs check has warnings; ensure TBD/TODO items are tracked.');
      console.log(`- Manifest updated: ${path.relative(repoRoot, manifestResult.path)}`);
      console.log(`- Wrappers synced via: ${syncResult.cmd || '(skipped)'}`);
      console.log(`- Modular core build: ${modularResults.some(r => r.mode === 'failed') ? 'failed' : 'completed'}`);
      if (cleanupResult) console.log(`- init/ cleanup: ${cleanupResult.mode}`);
      if (addonsCleanupResult) console.log(`- Unused add-ons pruned: ${addonsCleanupResult.removed.length > 0 ? addonsCleanupResult.removed.map(r => r.addonId).join(', ') : 'none'}`);
    }

    process.exit(0);
  }

  if (command === 'cleanup-init') {
    if (!opts['i-understand']) die('[error] cleanup-init requires --i-understand');
    const apply = !!opts['apply'];
    const cleanupAddonsFlag = !!opts['cleanup-addons'];
    const addonsRoot = opts['addons-root'] || 'addons';
    
    // Archive options
    const archiveAll = !!opts['archive'];
    const archiveDocs = archiveAll || !!opts['archive-docs'];
    const archiveBlueprint = archiveAll || !!opts['archive-blueprint'];

    const results = { init: null, addons: null, archived: [] };

    // Archive before cleanup (if requested)
    const archiveTarget = path.join(repoRoot, 'docs', 'project');
    
    if (archiveDocs || archiveBlueprint) {
      if (!fs.existsSync(archiveTarget)) {
        if (apply) {
          fs.mkdirSync(archiveTarget, { recursive: true });
          console.log(`[ok] Created archive directory: docs/project/`);
        } else {
          console.log(`[plan] Create archive directory: docs/project/`);
        }
      }
    }

	    // Archive Stage A docs
	    if (archiveDocs) {
	      const requirementsDocsDir = path.join(repoRoot, 'init', 'stage-a-docs');
	      if (fs.existsSync(requirementsDocsDir)) {
	        const files = fs.readdirSync(requirementsDocsDir);
	        for (const file of files) {
	          const srcFile = path.join(requirementsDocsDir, file);
	          const dstFile = path.join(archiveTarget, file);
	          if (fs.statSync(srcFile).isFile()) {
	            if (apply) {
              fs.copyFileSync(srcFile, dstFile);
              console.log(`[ok] Archived: init/stage-a-docs/${file} → docs/project/${file}`);
            } else {
              console.log(`[plan] Archive: init/stage-a-docs/${file} → docs/project/${file}`);
            }
            results.archived.push({ src: `init/stage-a-docs/${file}`, dst: `docs/project/${file}` });
          }
        }
      }
    }

    // Archive Blueprint
    if (archiveBlueprint) {
      const blueprintSrc = path.join(repoRoot, 'init', 'project-blueprint.json');
      const blueprintDst = path.join(archiveTarget, 'project-blueprint.json');
      if (fs.existsSync(blueprintSrc)) {
        if (apply) {
          fs.copyFileSync(blueprintSrc, blueprintDst);
          console.log(`[ok] Archived: init/project-blueprint.json → docs/project/project-blueprint.json`);
        } else {
          console.log(`[plan] Archive: init/project-blueprint.json → docs/project/project-blueprint.json`);
        }
        results.archived.push({ src: 'init/project-blueprint.json', dst: 'docs/project/project-blueprint.json' });
      }
    }

    // Cleanup init/ directory
    results.init = cleanupInit(repoRoot, apply);

    // Optionally cleanup unused add-on directories
    if (cleanupAddonsFlag) {
      if (!fs.existsSync(blueprintPath)) {
        die('[error] --cleanup-addons requires blueprint file to determine enabled add-ons');
      }
      const blueprint = readJson(blueprintPath);
      results.addons = cleanupUnusedAddons(repoRoot, blueprint, addonsRoot, apply);
    }

    if (format === 'json') {
      console.log(JSON.stringify({ ok: true, results }, null, 2));
    } else {
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
      
      // Print addons cleanup result
      if (results.addons) {
        console.log('');
        console.log('[addons cleanup]');
        for (const r of results.addons.removed) {
          console.log(`  - ${r.mode === 'dry-run' ? '[plan] ' : '[ok] '}remove: ${r.addonId} (${r.mode})${r.error ? ' - ' + r.error : ''}`);
        }
        for (const s of results.addons.skipped) {
          console.log(`  - [skip] ${s.addonId}: ${s.reason}`);
        }
      }
    }
    process.exit(0);
  }

  if (command === 'cleanup-addons') {
    if (!opts['i-understand']) die('[error] cleanup-addons requires --i-understand');
    const apply = !!opts['apply'];
    const addonsRoot = opts['addons-root'] || 'addons';

    const result = cleanupAddonsDir(repoRoot, addonsRoot, apply);

    if (format === 'json') {
      const ok = result.mode !== 'refused';
      console.log(JSON.stringify({ ok, result }, null, 2));
      process.exit(ok ? 0 : 1);
    }

    const rel = path.relative(repoRoot, result.path || '');
    const reason = result.reason ? ` - ${result.reason}` : '';

    if (result.mode === 'refused') {
      console.error(`[error] ${result.op}: ${rel} (${result.mode})${reason}`);
      process.exit(1);
    }

    if (result.mode === 'dry-run') console.log(`[plan] ${result.op}: ${rel} (${result.mode})`);
    else if (result.mode === 'applied') console.log(`[ok] ${result.op}: ${rel} (${result.mode})`);
    else if (result.mode === 'partial') console.log(`[warn] ${result.op}: ${rel} (${result.mode})`);
    else console.log(`[skip] ${result.op}: ${rel} (${result.mode})${reason}`);

    if (result.note) console.log(`Note: ${result.note}`);
    process.exit(0);
  }

  usage(1);
}

main();

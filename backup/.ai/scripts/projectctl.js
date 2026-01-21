#!/usr/bin/env node
/**
 * projectctl.js
 *
 * Manage project-level state under `.ai/project/state.json`.
 *
 * This file is intentionally lightweight and stable, so other scripts can
 * safely infer repo capabilities (e.g., context mode, project stage).
 */

import fs from 'node:fs';
import path from 'node:path';

function usage(exitCode = 0) {
  const msg = `
Usage:
  node .ai/scripts/projectctl.js <command> [options]

Options:
  --repo-root <path>   Repo root (default: auto-detect from cwd)

Commands:
  init
    Ensure .ai/project/state.json exists.

  get-context-mode
    Print the current context mode (contract|snapshot).

  set-context-mode <contract|snapshot>
    Set context mode.

  get-stage
    Print the current project stage.

  set-stage <prototype|mvp|production|maintenance|archived>
    Set project stage.

  verify
    Basic validation for project state.

Notes:
  - This tool is dependency-free and performs minimal validation.
`;
  console.log(msg.trim());
  process.exit(exitCode);
}

function die(msg, code = 1) {
  console.error(msg);
  process.exit(code);
}

function isoNow() {
  return new Date().toISOString();
}

function looksLikeRepoRoot(dir) {
  // Anchor on `.ai/package.json` (module boundary marker for this template).
  return fs.existsSync(path.join(dir, '.ai', 'package.json'));
}

function findRepoRoot(startDir) {
  let cur = path.resolve(startDir);
  // Walk upward until root.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (looksLikeRepoRoot(cur)) return cur;
    const parent = path.dirname(cur);
    if (parent === cur) return null;
    cur = parent;
  }
}

function readText(p) {
  return fs.readFileSync(p, 'utf8');
}

function writeText(p, content) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf8');
}

function readJson(p) {
  return JSON.parse(readText(p));
}

function writeJson(p, data) {
  writeText(p, JSON.stringify(data, null, 2) + '\n');
}

const ALLOWED_CONTEXT_MODES = ['contract', 'snapshot'];
const ALLOWED_STAGES = ['prototype', 'mvp', 'production', 'maintenance', 'archived'];

function defaultState() {
  const now = isoNow();
  return {
    version: 1,
    createdAt: now,
    updatedAt: now,
    project: {
      stage: 'prototype'
    },
    context: {
      enabled: true,
      mode: 'contract'
    },
    modular: {
      enabled: true
    },
    metadata: {}
  };
}

function validateState(s) {
  const warnings = [];
  const errors = [];

  if (!s || typeof s !== 'object') {
    errors.push('state.json must be an object');
    return { warnings, errors };
  }
  if (s.version !== 1) warnings.push('unexpected version (expected 1)');
  if (!s.createdAt) warnings.push('missing createdAt');
  if (!s.updatedAt) warnings.push('missing updatedAt');

  if (!s.project || typeof s.project !== 'object') {
    warnings.push('missing project');
  } else {
    if (s.project.stage && !ALLOWED_STAGES.includes(s.project.stage)) {
      errors.push(`project.stage must be one of: ${ALLOWED_STAGES.join(', ')}`);
    }
  }

  if (!s.context || typeof s.context !== 'object') {
    errors.push('missing context');
  } else {
    if (typeof s.context.enabled !== 'boolean') warnings.push('context.enabled should be boolean');
    if (!ALLOWED_CONTEXT_MODES.includes(s.context.mode)) errors.push('context.mode must be contract|snapshot');
  }

  return { warnings, errors };
}

function ensureStateFile(repoRoot) {
  const statePath = path.join(repoRoot, '.ai', 'project', 'state.json');
  if (!fs.existsSync(statePath)) {
    const s = defaultState();
    writeJson(statePath, s);
    return { created: true, statePath, state: s };
  }
  const s = readJson(statePath);
  const v = validateState(s);
  if (v.errors.length > 0) {
    die(`[error] Invalid state.json:\n- ${v.errors.join('\n- ')}`);
  }
  return { created: false, statePath, state: s };
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
    if (t === '--repo-root') {
      const v = args.shift();
      if (!v) die('[error] --repo-root requires a value');
      opts['repo-root'] = v;
      continue;
    }
    if (t.startsWith('--')) {
      die(`[error] Unknown option: ${t}`);
    }
    positionals.push(t);
  }

  return { command, opts, positionals };
}

function main() {
  const { command, opts, positionals } = parseArgs(process.argv);
  const explicitRoot = opts['repo-root'] ? path.resolve(opts['repo-root']) : null;
  const detectedRoot = explicitRoot || findRepoRoot(process.cwd());
  if (!detectedRoot) {
    die('[error] Failed to detect repo root from cwd. Run from repo root or pass --repo-root <path>.');
  }
  if (!looksLikeRepoRoot(detectedRoot)) {
    die(`[error] Not a valid repo root (missing .ai/package.json): ${detectedRoot}`);
  }
  const repoRoot = detectedRoot;
  const statePath = path.join(repoRoot, '.ai', 'project', 'state.json');

  switch (command) {
    case 'init': {
      const res = ensureStateFile(repoRoot);
      console.log(res.created ? `[ok] created ${path.relative(repoRoot, res.statePath)}` : `[ok] exists ${path.relative(repoRoot, res.statePath)}`);
      break;
    }

    case 'get-context-mode': {
      const { state } = ensureStateFile(repoRoot);
      console.log(state.context.mode);
      break;
    }

    case 'set-context-mode': {
      const mode = positionals[0];
      if (!ALLOWED_CONTEXT_MODES.includes(mode)) die('[error] mode must be contract|snapshot');
      const { state } = ensureStateFile(repoRoot);
      state.context.mode = mode;
      state.updatedAt = isoNow();
      writeJson(statePath, state);
      console.log(`[ok] set context.mode=${mode}`);
      break;
    }

    case 'get-stage': {
      const { state } = ensureStateFile(repoRoot);
      console.log(state.project?.stage || 'prototype');
      break;
    }

    case 'set-stage': {
      const stage = positionals[0];
      if (!ALLOWED_STAGES.includes(stage)) die(`[error] stage must be one of: ${ALLOWED_STAGES.join(', ')}`);
      const { state } = ensureStateFile(repoRoot);
      state.project = state.project || {};
      state.project.stage = stage;
      state.updatedAt = isoNow();
      writeJson(statePath, state);
      console.log(`[ok] set project.stage=${stage}`);
      break;
    }

    case 'verify': {
      const { state } = ensureStateFile(repoRoot);
      const v = validateState(state);

      if (v.warnings.length > 0) {
        console.log(`Warnings (${v.warnings.length}):`);
        for (const w of v.warnings) console.log(`- ${w}`);
      }
      if (v.errors.length > 0) {
        console.log(`\nErrors (${v.errors.length}):`);
        for (const e of v.errors) console.log(`- ${e}`);
        process.exit(1);
      }
      console.log('\n[ok] project state verified.');
      break;
    }

    default:
      die(`[error] Unknown command: ${command}`);
  }
}

main();

#!/usr/bin/env node
/**
 * ci-verify.mjs
 *
 * Shared, deterministic verification entrypoint used by CI templates.
 * This is NOT a Git hook; it lives under .githooks/ to co-locate governance checks
 * with the optional local hook automation.
 *
 * Usage:
 *   node .githooks/ci-verify.mjs
 *
 * Optional env:
 *   GOV_PROJECT=<slug>   Project slug for governance lint (default: main)
 */

import { spawnSync } from 'node:child_process';

function run(cmd, args) {
  const printable = `${cmd} ${args.join(' ')}`;
  const res = spawnSync(cmd, args, { stdio: 'inherit', shell: false });
  if (res.status !== 0) {
    process.stderr.write(`\n[ci-verify] FAILED: ${printable}\n`);
    process.exit(res.status || 1);
  }
}

function main() {
  const project = process.env.GOV_PROJECT || 'main';

  run('node', ['.ai/scripts/lint-skills.mjs', '--strict']);
  run('node', ['.ai/scripts/lint-docs.mjs']);
  run('node', ['.ai/scripts/ctl-project-ctl-project-governance.mjs', 'verify']);
  run('node', ['.ai/scripts/ctl-project-state.mjs', 'lint', '--check', '--project', project]);
}

main();

#!/usr/bin/env node
/**
 * docker-build.js - Docker Build Helper
 *
 * Helper script for building Docker images.
 * Called by packctl.js build command.
 *
 * Note: This script is intentionally CommonJS so it can run from `ops/**`
 * without relying on a `package.json` with `"type": "module"`.
 */

'use strict';

const { spawn } = require('node:child_process');
const { existsSync } = require('node:fs');

function parseArgs(args) {
  const result = { flags: {} };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith('--')) {
        result.flags[key] = nextArg;
        i++;
      } else {
        result.flags[key] = true;
      }
    }
  }
  return result;
}

function dockerBuild({ dockerfile, tag, context = '.', dryRun }) {
  return new Promise((resolve, reject) => {
    const args = ['build', '-f', dockerfile, '-t', tag, context];
    console.log(`Running: docker ${args.join(' ')}`);

    if (dryRun) {
      resolve();
      return;
    }

    const child = spawn('docker', args, {
      stdio: 'inherit',
      cwd: process.cwd()
    });

    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Docker build failed with code ${code}`));
    });

    child.on('error', (err) => reject(err));
  });
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  const { dockerfile, tag, context, 'dry-run': dryRun } = parsed.flags;

  if (parsed.flags.help) {
    console.log(
      `
docker-build.js - Docker Build Helper

Usage:
  node ops/packaging/scripts/docker-build.js --dockerfile <path> --tag <tag> [--context <path>]

Options:
  --dockerfile <path>  Dockerfile path (required)
  --tag <tag>          Image tag (required)
  --context <path>     Build context (default: .)
  --dry-run            Print docker command only
  --help               Show this help
`.trim()
    );
    return 0;
  }

  if (!dockerfile || !tag) {
    console.error('[error] Usage: docker-build.js --dockerfile <path> --tag <tag> [--context <path>]');
    return 1;
  }

  if (!existsSync(dockerfile)) {
    console.error(`[error] Dockerfile not found: ${dockerfile}`);
    return 1;
  }

  try {
    await dockerBuild({ dockerfile, tag, context: context || '.', dryRun: !!dryRun });
    console.log(`\n[ok] Built: ${tag}`);
    return 0;
  } catch (err) {
    console.error(`\n[error] Build failed: ${err.message}`);
    return 1;
  }
}

main().then((code) => process.exit(code));


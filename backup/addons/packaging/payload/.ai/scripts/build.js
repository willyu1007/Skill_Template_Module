#!/usr/bin/env node
/**
 * build.js - Build Execution Script
 *
 * Convenience wrapper around packctl.js build commands.
 *
 * Usage:
 *   node .ai/scripts/build.js <target> [--tag <tag>]
 *   node .ai/scripts/build.js --all [--tag <tag>]
 */

import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function parseArgs(args) {
  const result = { _: [], flags: {} };
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
    } else {
      result._.push(arg);
    }
  }
  return result;
}

function runPackctl(args) {
  const packctlPath = join(__dirname, 'packctl.js');
  return new Promise((resolve) => {
    const child = spawn('node', [packctlPath, ...args], {
      stdio: 'inherit',
      cwd: process.cwd()
    });
    child.on('close', (code) => resolve(code));
  });
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));

  if (parsed.flags.help || parsed._[0] === 'help') {
    console.log(
      `
build.js - Build Execution Script

Usage:
  node .ai/scripts/build.js <target> [--tag <tag>]
  node .ai/scripts/build.js --all [--tag <tag>]

Options:
  --all              Build all registered targets
  --tag <tag>        Image tag (default: latest)
  --context <path>   Docker build context (default: .)
  --dry-run          Print docker command only
  --repo-root <path> Repo root override (optional)
  --help             Show this help

Examples:
  node .ai/scripts/build.js api --tag v1.0.0
  node .ai/scripts/build.js --all --tag latest
`.trim()
    );
    return 0;
  }

  const commonArgs = [];
  if (parsed.flags.tag) commonArgs.push('--tag', parsed.flags.tag);
  if (parsed.flags.context) commonArgs.push('--context', parsed.flags.context);
  if (parsed.flags['dry-run']) commonArgs.push('--dry-run');
  if (parsed.flags['repo-root']) commonArgs.push('--repo-root', parsed.flags['repo-root']);

  if (parsed.flags.all) {
    return runPackctl(['build-all', ...commonArgs]);
  }

  const target = parsed._[0];
  if (!target) {
    console.error('[error] Target required. Use --all to build all targets. Run with --help for usage.');
    return 1;
  }

  return runPackctl(['build', '--target', target, ...commonArgs]);
}

main().then((code) => process.exit(code));


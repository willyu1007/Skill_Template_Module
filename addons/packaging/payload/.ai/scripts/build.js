#!/usr/bin/env node
/**
 * build.js - Build Execution Script
 *
 * Entry point for build operations.
 * Wraps packctl.js build commands for convenience.
 *
 * Usage:
 *   node .ai/scripts/build.js <target> [--tag <tag>]
 *   node .ai/scripts/build.js --all [--tag <tag>]
 */

import { spawn } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
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
  const args = process.argv.slice(2);
  const parsed = parseArgs(args);

  if (parsed.flags.help || parsed._[0] === 'help') {
    console.log(`
build.js - Build Execution Script

Usage:
  node .ai/scripts/build.js <target> [--tag <tag>]
  node .ai/scripts/build.js --all [--tag <tag>]

Options:
  --all         Build all registered targets
  --tag <tag>   Image tag (default: latest)
  --help        Show this help

Examples:
  node .ai/scripts/build.js api --tag v1.0.0
  node .ai/scripts/build.js --all --tag latest
`);
    return 0;
  }

  if (parsed.flags.all) {
    const buildArgs = ['build-all'];
    if (parsed.flags.tag) buildArgs.push('--tag', parsed.flags.tag);
    return runPackctl(buildArgs);
  }

  const target = parsed._[0];
  if (!target) {
    console.error('Error: Target required. Use --all to build all targets.');
    console.error('Run with --help for usage.');
    return 1;
  }

  const buildArgs = ['build', '--target', target];
  if (parsed.flags.tag) buildArgs.push('--tag', parsed.flags.tag);
  return runPackctl(buildArgs);
}

main().then(code => process.exit(code));


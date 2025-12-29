#!/usr/bin/env node
/**
 * deploy.js - Deploy Execution Entry Point
 *
 * Entry point for deployment operations.
 * Wraps deployctl.js for convenience.
 *
 * Usage:
 *   node .ai/scripts/deploy.js <service> --env <env> [--tag <tag>]
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

function runDeployctl(args) {
  const deployctlPath = join(__dirname, 'deployctl.js');
  return new Promise((resolve) => {
    const child = spawn('node', [deployctlPath, ...args], {
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
deploy.js - Deploy Execution Entry Point

Usage:
  node .ai/scripts/deploy.js <service> --env <env> [--tag <tag>]
  node .ai/scripts/deploy.js --list
  node .ai/scripts/deploy.js --status --env <env>

Options:
  --env <env>     Target environment (required for deploy)
  --tag <tag>     Override artifact tag
  --list          List registered services
  --status        Show deployment status
  --help          Show this help

Examples:
  node .ai/scripts/deploy.js api --env staging
  node .ai/scripts/deploy.js api --env prod --tag v1.2.3
  node .ai/scripts/deploy.js --status --env staging
`);
    return 0;
  }

  if (parsed.flags.list) {
    return runDeployctl(['list']);
  }

  if (parsed.flags.status) {
    const statusArgs = ['status'];
    if (parsed.flags.env) statusArgs.push('--env', parsed.flags.env);
    return runDeployctl(statusArgs);
  }

  const service = parsed._[0];
  if (!service) {
    console.error('Error: Service required.');
    console.error('Run with --help for usage.');
    return 1;
  }

  if (!parsed.flags.env) {
    console.error('Error: --env is required.');
    return 1;
  }

  // Run plan (actual deployment would require human execution)
  const planArgs = ['plan', '--service', service, '--env', parsed.flags.env];
  return runDeployctl(planArgs);
}

main().then(code => process.exit(code));


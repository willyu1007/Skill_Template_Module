#!/usr/bin/env node
/**
 * rollback.js - Rollback Guidance
 *
 * Prints human-run rollback commands and references runbooks.
 *
 * Usage:
 *   node .ai/scripts/rollback.js --service <service> --env <env>
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

function resolveRepoRoot(flagValue) {
  if (flagValue) return resolve(flagValue);
  return resolve(__dirname, '..', '..');
}

function loadConfig(repoRoot) {
  const configPath = join(repoRoot, 'ops/deploy/config.json');
  if (!existsSync(configPath)) return null;
  try {
    const raw = JSON.parse(readFileSync(configPath, 'utf8'));
    return raw && typeof raw === 'object' ? raw : null;
  } catch {
    return null;
  }
}

function normalizeConfig(raw) {
  const config = raw && typeof raw === 'object' ? { ...raw } : {};
  if (!Array.isArray(config.services)) config.services = [];
  if (typeof config.model !== 'string' || config.model.trim() === '') config.model = '(unknown)';
  return config;
}

function main() {
  const parsed = parseArgs(process.argv.slice(2));
  const repoRoot = resolveRepoRoot(parsed.flags['repo-root']);

  if (parsed.flags.help) {
    console.log(
      `
rollback.js - Rollback Guidance

Usage:
  node .ai/scripts/rollback.js --service <id> --env <env>

Options:
  --service <id>     Service to rollback (required)
  --env <env>        Target environment (required)
  --repo-root <path> Repo root override (optional)
  --help             Show this help

This script prints rollback guidance only. Humans execute the commands.
`.trim()
    );
    return 0;
  }

  const { service, env } = parsed.flags;
  if (!service || !env) {
    console.error('[error] --service and --env are required. Run with --help for usage.');
    return 1;
  }

  const rawConfig = loadConfig(repoRoot);
  if (!rawConfig) {
    console.error('[error] Deployment config not found or invalid: ops/deploy/config.json');
    console.error('        Run: node .ai/scripts/deployctl.js init');
    return 1;
  }

  const config = normalizeConfig(rawConfig);
  if (config.services.length === 0) {
    console.error('[error] No services are registered for deployment.');
    console.error(`        Run: node .ai/scripts/deployctl.js add-service --id ${service}`);
    return 1;
  }

  const svc = config.services.find((s) => s.id === service);
  if (!svc) {
    console.error(`[error] Service "${service}" not found.`);
    console.error('Available services:');
    for (const s of config.services) console.error(`  - ${s.id}`);
    return 1;
  }

  console.log('\nRollback Plan');
  console.log('----------------------------------------');
  console.log(`Service:     ${service}`);
  console.log(`Environment: ${env}`);
  console.log(`Model:       ${config.model}`);
  if (svc.artifact) console.log(`Artifact:    ${svc.artifact}`);
  console.log('----------------------------------------');

  console.log('\nRollback commands (human-run):');

  if (config.model === 'k8s') {
    console.log(
      `
# Kubernetes rollback
kubectl rollout undo deployment/${service} -n ${env}

# Check rollout status
kubectl rollout status deployment/${service} -n ${env}

# View rollout history
kubectl rollout history deployment/${service} -n ${env}
`.trim()
    );
  } else {
    console.log(
      `
# Refer to your ${config.model} rollback procedure
# See: ops/deploy/workdocs/runbooks/rollback-procedure.md
`.trim()
    );
  }

  console.log('\nSee: ops/deploy/workdocs/runbooks/rollback-procedure.md');
  return 0;
}

process.exit(main());


#!/usr/bin/env node
/**
 * healthcheck.js - Service Health Check
 *
 * Checks the health of deployed services.
 *
 * Note: This script is intentionally CommonJS so it can run from `ops/**`
 * without relying on a `package.json` with `"type": "module"`.
 */

'use strict';

const https = require('node:https');
const http = require('node:http');

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

function checkHealth(url, timeout = 5000) {
  return new Promise((resolve) => {
    const client = url.startsWith('https://') ? https : http;
    let req;
    try {
      req = client.get(url, { timeout }, (res) => {
        res.resume();
        const status = res.statusCode || 0;
        resolve({ ok: status >= 200 && status < 300, status });
      });
    } catch (err) {
      resolve({ ok: false, error: err.message });
      return;
    }

    req.on('error', (err) => {
      resolve({ ok: false, error: err.message });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, error: 'timeout' });
    });
  });
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));

  if (parsed.flags.help) {
    console.log(`
healthcheck.js - Service Health Check

Usage:
  node ops/deploy/scripts/healthcheck.js --url <url>

Options:
  --url <url>       Health check URL (required)
  --timeout <ms>    Timeout in milliseconds (default: 5000)
  --help            Show this help
`.trim());
    return 0;
  }

  const { url, timeout } = parsed.flags;
  if (!url) {
    console.error('[error] --url is required.');
    return 1;
  }

  const timeoutMs = Number.isFinite(Number(timeout)) ? Number(timeout) : 5000;
  console.log(`Checking health: ${url}`);
  const result = await checkHealth(url, timeoutMs);

  if (result.ok) {
    console.log(`[ok] Healthy (status: ${result.status})`);
    return 0;
  }

  console.log(`[error] Unhealthy (${result.error || `status: ${result.status}`})`);
  return 1;
}

main().then((code) => process.exit(code));


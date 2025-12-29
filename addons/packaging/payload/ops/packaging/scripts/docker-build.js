#!/usr/bin/env node
/**
 * docker-build.js - Docker Build Helper
 *
 * Helper script for building Docker images.
 * Called by packctl.js build command.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

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

function dockerBuild(dockerfile, tag, context = '.') {
  return new Promise((resolve, reject) => {
    const args = ['build', '-f', dockerfile, '-t', tag, context];
    console.log(`Running: docker ${args.join(' ')}`);
    
    const child = spawn('docker', args, {
      stdio: 'inherit',
      cwd: process.cwd()
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Docker build failed with code ${code}`));
      }
    });
    
    child.on('error', (err) => {
      reject(err);
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  const parsed = parseArgs(args);
  
  const { dockerfile, tag } = parsed.flags;
  
  if (!dockerfile || !tag) {
    console.error('Usage: docker-build.js --dockerfile <path> --tag <tag>');
    return 1;
  }
  
  if (!existsSync(dockerfile)) {
    console.error(`Error: Dockerfile not found: ${dockerfile}`);
    return 1;
  }
  
  try {
    await dockerBuild(dockerfile, tag);
    console.log(`\nSuccessfully built: ${tag}`);
    return 0;
  } catch (err) {
    console.error(`\nBuild failed: ${err.message}`);
    return 1;
  }
}

main().then(code => process.exit(code));


#!/usr/bin/env node
/**
 * Run all modular system tests
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const tests = [
  'test-id-validation.mjs',
  'test-participates-in.mjs',
];

console.log('========================================');
console.log('  Modular System Tests');
console.log('========================================\n');

let allPassed = true;

for (const testFile of tests) {
  console.log(`\n--- Running: ${testFile} ---\n`);
  
  const result = spawnSync('node', [path.join(__dirname, testFile)], {
    stdio: 'inherit',
    cwd: __dirname
  });
  
  if (result.status !== 0) {
    allPassed = false;
    console.error(`\n[FAIL] ${testFile} exited with code ${result.status}`);
  }
}

console.log('\n========================================');
if (allPassed) {
  console.log('  All tests passed!');
  console.log('========================================');
} else {
  console.error('  Some tests failed!');
  console.log('========================================');
  process.exit(1);
}

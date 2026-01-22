/**
 * Modular system test suite
 *
 * Tests for ID validation, participates_in normalization, and toolchain behavior.
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';

/**
 * Run a test file and return result
 */
function runTestFile(testPath, ctx) {
  const result = spawnSync('node', [testPath], {
    cwd: ctx.repoRoot,
    encoding: 'utf8',
    timeout: 30000,
  });

  const testName = path.basename(testPath, '.mjs');
  const passed = result.status === 0;

  ctx.log(`[${testName}] ${passed ? 'PASS' : 'FAIL'}`);
  if (!passed && result.stderr) {
    ctx.error(`[${testName}] stderr: ${result.stderr.slice(0, 500)}`);
  }

  return {
    name: testName,
    status: passed ? 'PASS' : 'FAIL',
    exitCode: result.status,
    stdout: result.stdout?.slice(0, 2000) || '',
    stderr: result.stderr?.slice(0, 500) || '',
  };
}

/**
 * Run all modular system tests
 */
export function run(ctx) {
  const results = [];
  const testsDir = path.join(ctx.repoRoot, '.ai', 'tests', 'modular-system');

  ctx.log('[modular-system] Starting modular system tests...');

  // Run ID validation tests
  results.push(runTestFile(path.join(testsDir, 'test-id-validation.mjs'), ctx));

  // Run participates_in tests
  results.push(runTestFile(path.join(testsDir, 'test-participates-in.mjs'), ctx));

  // Summary
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  ctx.log(`[modular-system] Tests: ${passed} passed, ${failed} failed`);

  return results;
}

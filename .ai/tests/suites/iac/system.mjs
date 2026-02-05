/**
 * system.mjs
 * IaC feature system test (templates + iacctl)
 */
import fs from 'fs';
import path from 'path';

import { runCommand } from '../../lib/exec.mjs';
import { assertIncludes } from '../../lib/text.mjs';

export const name = 'iac-system';

function readUtf8(p) {
  return fs.readFileSync(p, 'utf8');
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function copyDirRecursive(srcDir, destDir) {
  if (!fs.existsSync(srcDir)) throw new Error(`missing src dir: ${srcDir}`);
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  ensureDir(destDir);
  for (const e of entries) {
    const src = path.join(srcDir, e.name);
    const dest = path.join(destDir, e.name);
    if (e.isDirectory()) copyDirRecursive(src, dest);
    else if (e.isFile()) fs.copyFileSync(src, dest);
  }
}

export function run(ctx) {
  const testDir = path.join(ctx.evidenceDir, name);
  const rootDir = path.join(testDir, 'fixture');
  ensureDir(rootDir);

  const srcContextctl = path.join(
    ctx.repoRoot,
    '.ai',
    'skills',
    'features',
    'context-awareness',
    'scripts',
    'contextctl.mjs'
  );
  const srcIacctl = path.join(ctx.repoRoot, '.ai', 'skills', 'features', 'iac', 'scripts', 'iacctl.mjs');
  const srcTfTemplates = path.join(ctx.repoRoot, '.ai', 'skills', 'features', 'iac', 'templates', 'terraform');
  const srcRosTemplates = path.join(ctx.repoRoot, '.ai', 'skills', 'features', 'iac', 'templates', 'ros');

  // Minimal feature scripts inside the fixture root (simulates a real initialized repo)
  const fixtureContextctl = path.join(rootDir, '.ai', 'skills', 'features', 'context-awareness', 'scripts', 'contextctl.mjs');
  const fixtureIacctl = path.join(rootDir, '.ai', 'skills', 'features', 'iac', 'scripts', 'iacctl.mjs');
  ensureDir(path.dirname(fixtureContextctl));
  ensureDir(path.dirname(fixtureIacctl));
  fs.copyFileSync(srcContextctl, fixtureContextctl);
  fs.copyFileSync(srcIacctl, fixtureIacctl);

  // Materialize terraform templates
  copyDirRecursive(path.join(srcTfTemplates, 'ops'), path.join(rootDir, 'ops'));

  // Init (writes docs/context/iac/overview.json + registry entry)
  const init = runCommand({
    cmd: 'node',
    args: [fixtureIacctl, 'init', '--tool', 'terraform', '--repo-root', rootDir],
    cwd: rootDir,
    evidenceDir: testDir,
    label: `${name}.iacctl.init`,
  });
  if (init.error || init.code !== 0) {
    const detail = init.error ? String(init.error) : init.stderr || init.stdout;
    return { name, status: 'FAIL', error: `iacctl init failed: ${detail}` };
  }

  const overviewPath = path.join(rootDir, 'docs', 'context', 'iac', 'overview.json');
  if (!fs.existsSync(overviewPath)) {
    return { name, status: 'FAIL', error: 'missing docs/context/iac/overview.json' };
  }
  assertIncludes(readUtf8(overviewPath), '"tool": "terraform"', 'Expected tool terraform in overview.json');

  const projectRegistry = path.join(rootDir, 'docs', 'context', 'project.registry.json');
  if (!fs.existsSync(projectRegistry)) {
    return { name, status: 'FAIL', error: 'missing docs/context/project.registry.json' };
  }
  assertIncludes(readUtf8(projectRegistry), '"artifactId": "iac.overview"', 'Expected iac.overview in project.registry.json');

  const derivedRegistry = path.join(rootDir, 'docs', 'context', 'registry.json');
  if (!fs.existsSync(derivedRegistry)) {
    return { name, status: 'FAIL', error: 'missing docs/context/registry.json' };
  }

  // Verify happy path
  const verify = runCommand({
    cmd: 'node',
    args: [fixtureIacctl, 'verify', '--repo-root', rootDir],
    cwd: rootDir,
    evidenceDir: testDir,
    label: `${name}.iacctl.verify`,
  });
  if (verify.error || verify.code !== 0) {
    const detail = verify.error ? String(verify.error) : verify.stderr || verify.stdout;
    return { name, status: 'FAIL', error: `iacctl verify failed: ${detail}` };
  }
  assertIncludes(verify.stdout + verify.stderr, 'PASS', 'Expected PASS from iacctl verify');

  // Dual SSOT must fail
  copyDirRecursive(path.join(srcRosTemplates, 'ops'), path.join(rootDir, 'ops'));
  const verifyDual = runCommand({
    cmd: 'node',
    args: [fixtureIacctl, 'verify', '--repo-root', rootDir],
    cwd: rootDir,
    evidenceDir: testDir,
    label: `${name}.iacctl.verify_dual`,
  });
  if (verifyDual.code === 0) {
    return { name, status: 'FAIL', error: 'expected iacctl verify to fail under dual SSOT, but it passed' };
  }
  assertIncludes(verifyDual.stderr + verifyDual.stdout, 'dual SSOT', 'Expected dual SSOT error');

  return { name, status: 'PASS' };
}


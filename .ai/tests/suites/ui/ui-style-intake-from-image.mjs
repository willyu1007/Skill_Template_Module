/**
 * ui-style-intake-from-image.mjs
 * UI style intake from image test
 */
import fs from 'fs';
import path from 'path';

import { runCommand } from '../../lib/exec.mjs';
import { pickPython, pythonHasModule } from '../../lib/python.mjs';

export const name = 'ui-style-intake-from-image';

export function run(ctx) {
  const python = pickPython();
  if (!python) {
    ctx.log(`[${name}] SKIP (python not available)`);
    return { name, status: 'SKIP', reason: 'python not available' };
  }

  if (!pythonHasModule(python, 'PIL')) {
    ctx.log(`[${name}] SKIP (Pillow/PIL not installed)`);
    return { name, status: 'SKIP', reason: 'Pillow/PIL not installed' };
  }

  const testDir = path.join(ctx.evidenceDir, name);
  fs.mkdirSync(testDir, { recursive: true });

  const samplePath = path.join(testDir, 'sample.png');
  const reportPath = path.join(testDir, 'report.json');

  const createImgCode = [
    'from PIL import Image',
    'import sys',
    'path = sys.argv[1]',
    'img = Image.new("RGB", (200, 100), "white")',
    'for x in range(50, 150):',
    '  for y in range(20, 80):',
    '    img.putpixel((x, y), (37, 99, 235))',
    'img.save(path)',
    'print(path)',
  ].join('\n');

  const mk = runCommand({
    cmd: python.cmd,
    args: [...python.argsPrefix, '-B', '-c', createImgCode, samplePath],
    evidenceDir: testDir,
    label: `${name}.mkimg`,
  });
  if (mk.error || mk.code !== 0) {
    const detail = mk.error ? String(mk.error) : mk.stderr || mk.stdout;
    return { name, status: 'FAIL', error: `failed to create sample image: ${detail}` };
  }

  const probePath = path.join(
    ctx.repoRoot,
    '.ai',
    'skills',
    'features',
    'ui',
    'ui-style-intake-from-image',
    'scripts',
    'image_style_probe.py'
  );

  const probe = runCommand({
    cmd: python.cmd,
    args: [...python.argsPrefix, '-B', probePath, samplePath, '--colors', '6', '--out', reportPath],
    evidenceDir: testDir,
    label: `${name}.probe`,
  });
  if (probe.error || probe.code !== 0) {
    const detail = probe.error ? String(probe.error) : probe.stderr || probe.stdout;
    return { name, status: 'FAIL', error: `probe failed: ${detail}` };
  }

  if (!fs.existsSync(reportPath)) {
    return { name, status: 'FAIL', error: 'missing report.json' };
  }

  const validate = runCommand({
    cmd: python.cmd,
    args: [...python.argsPrefix, '-B', '-m', 'json.tool', reportPath],
    evidenceDir: testDir,
    label: `${name}.json`,
  });
  if (validate.error || validate.code !== 0) {
    const detail = validate.error ? String(validate.error) : validate.stderr || validate.stdout;
    return { name, status: 'FAIL', error: `invalid json output: ${detail}` };
  }

  ctx.log(`[${name}] PASS`);
  return { name, status: 'PASS' };
}

#!/usr/bin/env node
/**
 * ctl-iac.mjs
 *
 * IaC feature management (ROS or Terraform) + Context-Awareness integration.
 *
 * Commands:
 *   init              Generate docs/context/iac/overview.json and register it in project registry
 *   verify            Verify no dual SSOT and context artifacts are consistent
 *   help              Show help
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import childProcess from 'node:child_process';

// ============================================================================
// CLI parsing
// ============================================================================

function usage(exitCode = 0) {
  const msg = `
Usage:
  node .ai/skills/features/iac/scripts/ctl-iac.mjs <command> [options]

Commands:
  help
    Show this help.

  init
    --tool <ros|terraform>      IaC tool (required)
    --repo-root <path>          Repo root (default: cwd)
    --force                     Overwrite generated context artifact and registry entry
    Initialize IaC context artifacts (does NOT run IaC apply).

  verify
    --repo-root <path>          Repo root (default: cwd)
    Verify IaC feature invariants and context artifacts.

Examples:
  node .ai/skills/features/iac/scripts/ctl-iac.mjs init --tool terraform --repo-root .
  node .ai/skills/features/iac/scripts/ctl-iac.mjs verify --repo-root .
`;
  console.log(msg.trim());
  process.exit(exitCode);
}

function die(msg, exitCode = 1) {
  console.error(msg);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  if (args.length === 0 || args[0] === '-h' || args[0] === '--help') usage(0);

  const command = args.shift();
  const opts = {};

  while (args.length > 0) {
    const token = args.shift();
    if (token === '-h' || token === '--help') usage(0);
    if (token.startsWith('--')) {
      const key = token.slice(2);
      if (args.length > 0 && !args[0].startsWith('--')) {
        opts[key] = args.shift();
      } else {
        opts[key] = true;
      }
    }
  }

  return { command, opts };
}

// ============================================================================
// Helpers
// ============================================================================

function nowIso() {
  return new Date().toISOString();
}

function toPosixPath(p) {
  return String(p).replace(/\\/g, '/');
}

function existsDir(p) {
  try {
    return fs.existsSync(p) && fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function readJsonOrNull(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function computeChecksumSha256(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

function normalizeTool(raw) {
  const t = String(raw || '').trim().toLowerCase();
  if (!t) return null;
  if (t === 'ros') return 'ros';
  if (t === 'terraform') return 'terraform';
  return null;
}

function detectSelectedTool(repoRoot) {
  const rosDir = path.join(repoRoot, 'ops', 'iac', 'ros');
  const tfDir = path.join(repoRoot, 'ops', 'iac', 'terraform');
  const hasRos = existsDir(rosDir);
  const hasTf = existsDir(tfDir);

  if (hasRos && hasTf) return { ok: false, error: 'dual SSOT: both ops/iac/ros and ops/iac/terraform exist' };
  if (hasRos) return { ok: true, tool: 'ros' };
  if (hasTf) return { ok: true, tool: 'terraform' };
  return { ok: true, tool: 'none' };
}

function getOverviewPath(repoRoot) {
  return path.join(repoRoot, 'docs', 'context', 'iac', 'overview.json');
}

function getProjectRegistryPath(repoRoot) {
  return path.join(repoRoot, 'docs', 'context', 'project.registry.json');
}

function ensureProjectRegistry(repoRoot) {
  const p = getProjectRegistryPath(repoRoot);
  if (fs.existsSync(p)) return p;
  const reg = { version: 1, moduleId: 'project', updatedAt: nowIso(), artifacts: [] };
  writeJson(p, reg);
  return p;
}

function upsertProjectArtifact({ repoRoot, artifactId, type, relPath, mode, tags = [], force }) {
  const registryPath = ensureProjectRegistry(repoRoot);
  const reg = readJsonOrNull(registryPath) || { version: 1, moduleId: 'project', updatedAt: nowIso(), artifacts: [] };
  reg.artifacts = Array.isArray(reg.artifacts) ? reg.artifacts : [];

  const absArtifact = path.join(repoRoot, relPath);
  const checksum = fs.existsSync(absArtifact) ? computeChecksumSha256(absArtifact) : null;

  const next = {
    artifactId,
    type,
    path: toPosixPath(relPath),
    mode,
    ...(tags.length > 0 ? { tags } : {}),
    ...(checksum ? { checksumSha256: checksum } : {}),
    lastUpdated: nowIso(),
  };

  const idx = reg.artifacts.findIndex((a) => a && a.artifactId === artifactId);
  if (idx === -1) {
    reg.artifacts.push(next);
  } else if (force) {
    reg.artifacts[idx] = next;
  } else {
    // Non-destructive but consistent: refresh checksum/lastUpdated and tags if missing.
    const cur = reg.artifacts[idx] && typeof reg.artifacts[idx] === 'object' ? reg.artifacts[idx] : {};
    reg.artifacts[idx] = {
      ...cur,
      ...next,
      // Preserve optional manual fields if present (format/source)
      ...(cur.format ? { format: cur.format } : {}),
      ...(cur.source ? { source: cur.source } : {}),
    };
  }

  reg.updatedAt = nowIso();
  writeJson(registryPath, reg);
  return registryPath;
}

function runContextBuild(repoRoot) {
  const ctlContext = path.join(repoRoot, '.ai', 'skills', 'features', 'context-awareness', 'scripts', 'ctl-context.mjs');
  if (!fs.existsSync(ctlContext)) return { ok: false, reason: 'ctl-context not found (context-awareness not installed?)' };

  const res = childProcess.spawnSync('node', [ctlContext, 'build', '--no-refresh', '--repo-root', repoRoot], {
    stdio: 'inherit',
    cwd: repoRoot,
  });
  if (res.status !== 0) return { ok: false, reason: `ctl-context build failed (exit=${res.status})` };
  return { ok: true };
}

// ============================================================================
// Commands
// ============================================================================

function cmdInit(repoRoot, opts) {
  const tool = normalizeTool(opts.tool);
  if (!tool) die('[error] init requires --tool <ros|terraform>');

  const rosDir = path.join(repoRoot, 'ops', 'iac', 'ros');
  const tfDir = path.join(repoRoot, 'ops', 'iac', 'terraform');
  const otherDir = tool === 'ros' ? tfDir : rosDir;
  const expectedDir = tool === 'ros' ? rosDir : tfDir;

  if (existsDir(otherDir)) {
    die(`[error] Refusing to init IaC: dual SSOT detected (unexpected directory exists): ${path.relative(repoRoot, otherDir)}`);
  }
  if (!existsDir(expectedDir)) {
    die(`[error] Missing IaC SSOT directory for tool="${tool}": ${path.relative(repoRoot, expectedDir)} (did you materialize templates?)`);
  }

  const overviewPath = getOverviewPath(repoRoot);
  const overview = {
    version: 1,
    updatedAt: nowIso(),
    tool,
    ssot: { rootDir: toPosixPath(path.relative(repoRoot, expectedDir)) },
    boundaries: {
      noSecretsInContext: true,
      noDualSsot: true,
      autoApply: false,
    },
  };

  const force = !!opts.force;

  // Write overview (generated)
  if (fs.existsSync(overviewPath) && !force) {
    // Keep stable content if already correct; otherwise rewrite.
    const current = readJsonOrNull(overviewPath);
    const same = current && current.tool === tool && current.ssot && current.ssot.rootDir === overview.ssot.rootDir;
    if (!same) writeJson(overviewPath, overview);
  } else {
    writeJson(overviewPath, overview);
  }

  // Register artifact (SSOT registry)
  const registryPath = upsertProjectArtifact({
    repoRoot,
    artifactId: 'iac.overview',
    type: 'json',
    relPath: toPosixPath(path.relative(repoRoot, overviewPath)),
    mode: 'generated',
    tags: ['iac', tool],
    force,
  });

  const build = runContextBuild(repoRoot);
  if (!build.ok) {
    console.warn(`[warn] Context build skipped/failed: ${build.reason}`);
  }

  console.log('[ok] IaC context initialized.');
  console.log(`- Tool: ${tool}`);
  console.log(`- Overview: ${path.relative(repoRoot, overviewPath)}`);
  console.log(`- Registry: ${path.relative(repoRoot, registryPath)}`);
}

function cmdVerify(repoRoot) {
  const detected = detectSelectedTool(repoRoot);
  if (!detected.ok) die(`[error] ${detected.error}`);

  if (detected.tool === 'none') {
    console.log('[ok] IaC not enabled (no ops/iac/<tool>/ directory found).');
    return;
  }

  const overviewPath = getOverviewPath(repoRoot);
  if (!fs.existsSync(overviewPath)) die(`[error] missing IaC context artifact: ${path.relative(repoRoot, overviewPath)}`);

  const overview = readJsonOrNull(overviewPath);
  if (!overview || overview.tool !== detected.tool) {
    die(`[error] IaC overview tool mismatch. expected="${detected.tool}" actual="${overview && overview.tool ? overview.tool : 'missing'}"`);
  }

  const expectedRootDir = `ops/iac/${detected.tool}`;
  if (!overview.ssot || overview.ssot.rootDir !== expectedRootDir) {
    die(`[error] IaC overview ssot.rootDir mismatch. expected="${expectedRootDir}" actual="${overview && overview.ssot ? overview.ssot.rootDir : 'missing'}"`);
  }

  const registryPath = getProjectRegistryPath(repoRoot);
  if (!fs.existsSync(registryPath)) die(`[error] missing project registry: ${path.relative(repoRoot, registryPath)} (run ctl-context init)`);

  const reg = readJsonOrNull(registryPath);
  const artifacts = Array.isArray(reg && reg.artifacts) ? reg.artifacts : [];
  const entry = artifacts.find((a) => a && a.artifactId === 'iac.overview');
  if (!entry) die('[error] missing registry entry: artifactId="iac.overview"');

  const expectedRel = toPosixPath(path.relative(repoRoot, overviewPath));
  if (entry.path !== expectedRel) die(`[error] registry path mismatch for iac.overview. expected="${expectedRel}" actual="${entry.path}"`);

  const checksum = computeChecksumSha256(overviewPath);
  if (entry.checksumSha256 && entry.checksumSha256 !== checksum) {
    die('[error] registry checksum mismatch for iac.overview (run: ctl-context touch/build or re-run ctl-iac init --force)');
  }

  console.log('[ok] IaC verify PASS');
  console.log(`- Tool: ${detected.tool}`);
  console.log(`- Overview: ${path.relative(repoRoot, overviewPath)}`);
}

function main() {
  const { command, opts } = parseArgs(process.argv);
  const repoRoot = path.resolve(opts['repo-root'] || process.cwd());

  switch (command) {
    case 'help':
      usage(0);
      return;
    case 'init':
      cmdInit(repoRoot, opts);
      return;
    case 'verify':
      cmdVerify(repoRoot);
      return;
    default:
      usage(1);
  }
}

try {
  main();
} catch (e) {
  die(e && e.stack ? e.stack : String(e));
}


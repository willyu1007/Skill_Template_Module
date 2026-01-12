#!/usr/bin/env node

/**
 * Delete Skill Script
 *
 * Safely deletes skill directories from SSOT and provider stubs.
 * Supports identification by skill name or relative path.
 *
 * Reference: naming-conventions skill for file naming standards.
 */

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const SKILL_MD = 'SKILL.md';

const defaultSkillsRoot = path.join(repoRoot, '.ai', 'skills');
const providerRoots = {
  codex: path.join(repoRoot, '.codex', 'skills'),
  claude: path.join(repoRoot, '.claude', 'skills'),
};

const colors = {
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  gray: (s) => `\x1b[90m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
};

function printHelp() {
  const cmd = 'node .ai/scripts/delete-skill.cjs';
  console.log([
    'Delete skills from SSOT and/or provider stubs.',
    '',
    `Usage: ${cmd} [options]`,
    '',
    'Options:',
    '  --skill <name|path>            Skill to delete (repeatable)',
    '  --skills <csv>                 Comma-separated list of skills to delete',
    '  --scope <all|ssot|providers>   Deletion scope (default: all)',
    '  --clean-empty                  Remove empty parent directories after deletion',
    '  --dry-run                      Preview actions without deleting',
    '  --yes                          Required for destructive operations (unless --dry-run)',
    '  -h, --help                     Show help',
    '',
    'Identification:',
    '  Skills can be identified by:',
    '  - Name: "naming-conventions" (searches for matching skill)',
    '  - Path: "standards/naming-conventions" (relative to skills root)',
    '',
    'Scopes:',
    '  all       - Delete from SSOT and all provider stubs (default)',
    '  ssot      - Delete only from SSOT (.ai/skills/)',
    '  providers - Delete only from provider stubs (.codex/skills/, .claude/skills/)',
    '',
    'Examples:',
    `  ${cmd} --skill naming-conventions --dry-run`,
    `  ${cmd} --skills "naming-conventions,code-review-standards" --yes`,
    `  ${cmd} --skill standards/naming-conventions --scope ssot --yes`,
    '',
  ].join('\n'));
}

function toPosix(p) {
  return p.replace(/\\/g, '/');
}

function parseCsv(value) {
  return String(value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseArgs(argv) {
  const args = {
    skills: [],
    scope: 'all',
    cleanEmpty: false,
    dryRun: false,
    yes: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '-h' || a === '--help') {
      args.help = true;
      continue;
    }
    if (a === '-y' || a === '--yes') {
      args.yes = true;
      continue;
    }
    if (a === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    if (a === '--clean-empty') {
      args.cleanEmpty = true;
      continue;
    }
    if (a === '--scope') {
      args.scope = String(argv[i + 1] || '').toLowerCase();
      i += 1;
      continue;
    }
    if (a === '--skill') {
      const val = String(argv[i + 1] || '').trim();
      if (val) args.skills.push(val);
      i += 1;
      continue;
    }
    if (a === '--skills') {
      args.skills.push(...parseCsv(argv[i + 1]));
      i += 1;
      continue;
    }

    // Unknown argument
    console.error(colors.red(`Unknown argument: ${a}`));
    console.error(colors.gray('Use --help for usage.'));
    process.exit(1);
  }

  return args;
}

function resolveSafeChildDir(rootDir, relPath) {
  const absRoot = path.resolve(rootDir);
  const absTarget = path.resolve(rootDir, String(relPath || ''));
  const rel = path.relative(absRoot, absTarget);
  if (!rel || rel === '.' || rel.startsWith('..') || path.isAbsolute(rel)) {
    return null;
  }
  return absTarget;
}

function findSkillDirs(rootDir) {
  if (!fs.existsSync(rootDir)) {
    return [];
  }

  const ignoreDirNames = new Set([
    '.git',
    '.hg',
    '.svn',
    '__pycache__',
    'node_modules',
    '_meta',
  ]);

  const stack = [rootDir];
  const skillDirs = [];

  while (stack.length > 0) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    const hasSkillMd = entries.some((e) => e.isFile() && e.name === SKILL_MD);
    if (hasSkillMd) {
      skillDirs.push(dir);
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (ignoreDirNames.has(entry.name)) continue;
      stack.push(path.join(dir, entry.name));
    }
  }

  return skillDirs.sort((a, b) => a.localeCompare(b));
}

function readFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!match) return null;
  return match[1];
}

function extractName(frontmatter, fallback) {
  if (!frontmatter) return fallback;
  const match = frontmatter.match(/^name:\s*(.+)$/m);
  return match ? match[1].trim() : fallback;
}

function loadSkills(skillsRoot) {
  const skillDirs = findSkillDirs(skillsRoot);
  const skills = [];

  for (const dir of skillDirs) {
    const skillMdPath = path.join(dir, SKILL_MD);
    let content = '';
    try {
      content = fs.readFileSync(skillMdPath, 'utf8');
    } catch {
      continue;
    }

    const frontmatter = readFrontmatter(content);
    const fallback = path.basename(dir);
    const name = extractName(frontmatter, fallback);

    const relFromSkillsRoot = toPosix(path.relative(skillsRoot, dir));
    const dirName = path.basename(dir);

    skills.push({
      name,
      dir,
      dirName,
      relFromSkillsRoot,
    });
  }

  return skills;
}

function resolveSkillPath(identifier, allSkills) {
  // Normalize identifier (remove leading/trailing slashes, convert to posix)
  const normalized = toPosix(identifier).replace(/^\/+|\/+$/g, '');

  // First, try to match by relative path
  const byPath = allSkills.find((s) => s.relFromSkillsRoot === normalized);
  if (byPath) {
    return byPath.relFromSkillsRoot;
  }

  // Then, try to match by name (may have multiple matches)
  const byName = allSkills.filter((s) => s.name === normalized || s.dirName === normalized);
  if (byName.length === 1) {
    return byName[0].relFromSkillsRoot;
  }
  if (byName.length > 1) {
    console.error(colors.red(`Ambiguous skill name "${normalized}". Multiple matches found:`));
    for (const s of byName) {
      console.error(colors.red(`  - ${s.relFromSkillsRoot}`));
    }
    console.error(colors.gray('Use the full path to specify which one to delete.'));
    return null;
  }

  // Not found
  return normalized; // Return as-is, will be validated later
}

function cleanEmptyParents(dirPath, stopAt) {
  let current = path.dirname(dirPath);
  const stopAtAbs = path.resolve(stopAt);

  while (current !== stopAtAbs && current.startsWith(stopAtAbs)) {
    try {
      const entries = fs.readdirSync(current);
      if (entries.length === 0) {
        fs.rmdirSync(current);
      } else {
        break;
      }
    } catch {
      break;
    }
    current = path.dirname(current);
  }
}

function deleteSkillDir(rootDir, relPath, label, options) {
  const { dryRun, cleanEmpty, stopAt } = options;

  const targetDir = resolveSafeChildDir(rootDir, relPath);
  if (!targetDir) {
    console.log(colors.red(`  [!] ${label}: path traversal blocked (${relPath})`));
    return { deleted: false, reason: 'blocked' };
  }

  if (!fs.existsSync(targetDir)) {
    console.log(colors.gray(`  [-] ${label}: not present`));
    return { deleted: false, reason: 'not_found' };
  }

  if (dryRun) {
    console.log(colors.yellow(`  [~] ${label}: ${toPosix(path.relative(repoRoot, targetDir))}/ (dry-run)`));
    return { deleted: true, reason: 'dry_run' };
  }

  try {
    fs.rmSync(targetDir, { recursive: true, force: true });
    console.log(colors.green(`  [✓] ${label}: ${toPosix(path.relative(repoRoot, targetDir))}/`));

    if (cleanEmpty && stopAt) {
      cleanEmptyParents(targetDir, stopAt);
    }

    return { deleted: true, reason: 'deleted' };
  } catch (err) {
    console.log(colors.red(`  [!] ${label}: failed to delete (${err.message})`));
    return { deleted: false, reason: 'error' };
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    return;
  }

  // Validate scope
  const validScopes = ['all', 'ssot', 'providers'];
  if (!validScopes.includes(args.scope)) {
    console.error(colors.red(`Invalid --scope: ${args.scope}`));
    console.error(colors.gray(`Valid scopes: ${validScopes.join(', ')}`));
    process.exit(1);
  }

  // Validate skills list
  if (args.skills.length === 0) {
    console.error(colors.red('No skills specified.'));
    console.error(colors.gray('Use --skill <name|path> or --skills <csv> to specify skills.'));
    process.exit(1);
  }

  // Check for --yes unless dry-run
  if (!args.dryRun && !args.yes) {
    console.error(colors.red('Refusing to delete without --yes flag.'));
    console.error(colors.gray('Preview safely with --dry-run, then re-run with --yes.'));
    process.exit(1);
  }

  // Load all skills from SSOT
  const allSkills = loadSkills(defaultSkillsRoot);

  // Resolve skill identifiers to paths
  const resolvedPaths = [];
  for (const identifier of args.skills) {
    const resolved = resolveSkillPath(identifier, allSkills);
    if (resolved === null) {
      process.exit(1); // Error already printed
    }
    resolvedPaths.push({ identifier, resolved });
  }

  // Deduplicate
  const uniquePaths = [...new Set(resolvedPaths.map((r) => r.resolved))];

  console.log(colors.cyan('========================================'));
  console.log(colors.cyan('  Deleting skills'));
  console.log(colors.cyan('========================================'));
  console.log(colors.gray(`  scope: ${args.scope}`));
  console.log(colors.gray(`  skills: ${uniquePaths.length}`));
  console.log(colors.gray(`  dry-run: ${args.dryRun}`));
  console.log('');

  let totalDeleted = 0;
  let totalSkipped = 0;

  for (const skillPath of uniquePaths) {
    console.log(colors.cyan(`Skill: ${skillPath}`));

    let deletedAny = false;
    const deleteOptions = {
      dryRun: args.dryRun,
      cleanEmpty: args.cleanEmpty,
    };

    // Delete from SSOT
    if (args.scope === 'all' || args.scope === 'ssot') {
      const result = deleteSkillDir(
        defaultSkillsRoot,
        skillPath,
        'SSOT',
        { ...deleteOptions, stopAt: defaultSkillsRoot }
      );
      if (result.deleted) deletedAny = true;
    }

    // Delete from provider stubs
    if (args.scope === 'all' || args.scope === 'providers') {
      for (const [provider, providerRoot] of Object.entries(providerRoots)) {
        const result = deleteSkillDir(
          providerRoot,
          skillPath,
          provider,
          { ...deleteOptions, stopAt: providerRoot }
        );
        if (result.deleted) deletedAny = true;
      }
    }

    if (deletedAny) {
      totalDeleted += 1;
    } else {
      totalSkipped += 1;
    }

    console.log('');
  }

  console.log(colors.cyan('========================================'));
  console.log(colors.cyan('  Summary'));
  console.log(colors.cyan('========================================'));
  console.log(`  ${colors.green(`Deleted: ${totalDeleted}`)}`);
  console.log(`  ${colors.gray(`Skipped: ${totalSkipped}`)}`);

  if (args.dryRun) {
    console.log('');
    console.log(colors.yellow('Dry-run mode: no files were actually deleted.'));
    console.log(colors.gray('Re-run with --yes to perform the deletion.'));
  }
}

main();

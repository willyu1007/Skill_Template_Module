#!/usr/bin/env node

/**
 * Skill Quality Gate Script
 *
 * Validates skills in .ai/skills/ against quality standards:
 * - Valid YAML frontmatter with name/description
 * - Skill name matches directory name
 * - No forbidden resources/ directory
 * - SKILL.md <= 500 lines
 * - Presence of ## Verification and ## Boundaries sections
 * - No cross-skill references (optional)
 */

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const SKILL_MD = 'SKILL.md';
const MAX_LINES = 500;

const defaultSkillsRoot = path.join(repoRoot, '.ai', 'skills');

const colors = {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  gray: (s) => `\x1b[90m${s}\x1b[0m`,
};

function printHelp() {
  console.log([
    'Lint skills for quality standards.',
    '',
    'Usage: node .ai/scripts/lint-skills.cjs [options]',
    '',
    'Options:',
    '  --fix           Auto-fix issues where possible (not implemented yet)',
    '  --strict        Treat warnings as errors',
    '  --quiet         Only show errors, not warnings',
    '  -h, --help      Show help',
    '',
    'Checks:',
    '  - Valid YAML frontmatter with name and description',
    '  - Skill name matches directory name',
    '  - No resources/ directory',
    '  - SKILL.md <= 500 lines',
    '  - Has ## Verification section',
    '  - Has ## Boundaries section',
    '',
  ].join('\n'));
}

function parseArgs(argv) {
  const args = {
    fix: false,
    strict: false,
    quiet: false,
    help: false,
  };

  for (const a of argv) {
    if (a === '-h' || a === '--help') args.help = true;
    if (a === '--fix') args.fix = true;
    if (a === '--strict') args.strict = true;
    if (a === '--quiet') args.quiet = true;
  }

  return args;
}

function findSkillDirs(rootDir) {
  if (!fs.existsSync(rootDir)) {
    console.error(colors.red(`Missing skills root: ${rootDir}`));
    process.exit(1);
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

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;

  const yaml = match[1];
  const result = {};

  // Simple YAML parsing for name and description
  const nameMatch = yaml.match(/^name:\s*(.+)$/m);
  const descMatch = yaml.match(/^description:\s*(.+)$/m);

  if (nameMatch) result.name = nameMatch[1].trim();
  if (descMatch) result.description = descMatch[1].trim();

  return result;
}

function lintSkill(skillDir, skillsRoot) {
  const errors = [];
  const warnings = [];
  const relPath = path.relative(skillsRoot, skillDir);
  const dirName = path.basename(skillDir);
  const skillMdPath = path.join(skillDir, SKILL_MD);

  // Check SKILL.md exists
  if (!fs.existsSync(skillMdPath)) {
    errors.push('Missing SKILL.md');
    return { relPath, errors, warnings };
  }

  const content = fs.readFileSync(skillMdPath, 'utf8');
  const lines = content.split('\n');

  // Check line count
  if (lines.length > MAX_LINES) {
    errors.push(`SKILL.md exceeds ${MAX_LINES} lines (${lines.length} lines)`);
  }

  // Check frontmatter
  const frontmatter = parseFrontmatter(content);
  if (!frontmatter) {
    errors.push('Missing or invalid YAML frontmatter');
  } else {
    if (!frontmatter.name) {
      errors.push('Frontmatter missing "name" field');
    } else if (frontmatter.name !== dirName) {
      errors.push(`Frontmatter name "${frontmatter.name}" does not match directory name "${dirName}"`);
    }
    if (!frontmatter.description) {
      errors.push('Frontmatter missing "description" field');
    }
  }

  // Check for resources/ directory (forbidden)
  const resourcesDir = path.join(skillDir, 'resources');
  if (fs.existsSync(resourcesDir)) {
    errors.push('Forbidden resources/ directory exists');
  }

  // Check for ## Verification section
  const hasVerification = /^## Verification\s*$/m.test(content);
  if (!hasVerification) {
    warnings.push('Missing ## Verification section');
  }

  // Check for ## Boundaries section
  const hasBoundaries = /^## Boundaries\s*$/m.test(content);
  if (!hasBoundaries) {
    warnings.push('Missing ## Boundaries section');
  }

  // Check for cross-skill references (optional warning)
  const crossRefPattern = /\[.*?\]\(\.\.\/.*?\/SKILL\.md\)/;
  if (crossRefPattern.test(content)) {
    warnings.push('Contains cross-skill reference links (may affect discoverability)');
  }

  return { relPath, errors, warnings };
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    return;
  }

  console.log(colors.cyan('========================================'));
  console.log(colors.cyan('  Skill Quality Lint'));
  console.log(colors.cyan('========================================'));
  console.log('');

  const skillDirs = findSkillDirs(defaultSkillsRoot);
  console.log(colors.gray(`Found ${skillDirs.length} skills to lint\n`));

  let totalErrors = 0;
  let totalWarnings = 0;
  const results = [];

  for (const skillDir of skillDirs) {
    const result = lintSkill(skillDir, defaultSkillsRoot);
    results.push(result);
    totalErrors += result.errors.length;
    totalWarnings += result.warnings.length;
  }

  // Print results
  for (const result of results) {
    const hasIssues = result.errors.length > 0 || result.warnings.length > 0;
    if (!hasIssues) continue;

    console.log(colors.cyan(`${result.relPath}/`));

    for (const error of result.errors) {
      console.log(colors.red(`  ✗ ${error}`));
    }

    if (!args.quiet) {
      for (const warning of result.warnings) {
        console.log(colors.yellow(`  ⚠ ${warning}`));
      }
    }

    console.log('');
  }

  // Summary
  console.log(colors.cyan('========================================'));
  console.log(colors.cyan('  Summary'));
  console.log(colors.cyan('========================================'));
  console.log(`  Skills checked: ${results.length}`);
  console.log(`  ${colors.red(`Errors: ${totalErrors}`)}`);
  console.log(`  ${colors.yellow(`Warnings: ${totalWarnings}`)}`);

  const passCount = results.filter((r) => r.errors.length === 0 && r.warnings.length === 0).length;
  console.log(`  ${colors.green(`Passed: ${passCount}/${results.length}`)}`);
  console.log('');

  // Exit code
  if (totalErrors > 0) {
    console.log(colors.red('Lint failed with errors.'));
    process.exit(1);
  }

  if (args.strict && totalWarnings > 0) {
    console.log(colors.yellow('Lint failed (--strict mode, warnings treated as errors).'));
    process.exit(1);
  }

  console.log(colors.green('Lint passed.'));
}

main();


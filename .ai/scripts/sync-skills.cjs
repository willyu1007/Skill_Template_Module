#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const SKILL_MD = 'SKILL.md';

const defaultSkillsRoot = path.join(repoRoot, '.ai', 'skills');
const defaultManifestPath = path.join(defaultSkillsRoot, '_meta', 'sync-manifest.json');
const providerDefaults = {
  codex: path.join(repoRoot, '.codex', 'skills'),
  claude: path.join(repoRoot, '.claude', 'skills'),
};

const colors = {
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  gray: (s) => `\x1b[90m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
};

function printHelp() {
  const cmd = 'node .ai/scripts/sync-skills.cjs';
  console.log([
    'Sync provider skill stubs from SSOT skills.',
    '',
    `Usage: ${cmd} [options]`,
    '',
    'Options:',
    '  --providers <codex|claude|both|csv>   Providers to write (default: both)',
    '  --scope <all|minimal|current|specific> Skill selection scope (default: all)',
    '  --skills <csv>                        Skill names (for --scope specific)',
    '  --skill <name>                        Repeatable; adds one skill name',
    '  --manifest <path>                     JSON manifest (for --scope current)',
    '  --mode <reset|update>                 reset deletes provider roots; update is incremental (default: reset)',
    '  --prune                               With --mode update: delete wrappers not in selected set',
    '  --delete <csv>                        Delete wrapper(s) only (no SSOT changes)',
    '  --list                                List discovered skills (respects --scope filters)',
    '  --dry-run                             Print actions without writing',
    '  -h, --help                            Show help',
    '',
    'Scopes:',
    '  all      - all skills under the SSOT skills root',
    '  minimal  - default minimal set (workflows only)',
    '  current  - read selection from a manifest JSON',
    '  specific - explicit list via --skills/--skill',
    '',
    'Manifest schema (JSON):',
    '  {',
    '    "version": 1,',
    '    "includePrefixes": ["workflows/", "backend/"],',
    '    "includeSkills": ["apply-backend-service-guidelines"],',
    '    "excludeSkills": ["experimental-skill"]',
    '  }',
    '',
  ].join('\n'));
}

function readFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!match) {
    return null;
  }
  return `---\n${match[1]}\n---\n\n`;
}

function extractName(frontmatter, fallback) {
  if (!frontmatter) return fallback;
  const match = frontmatter.match(/^name:\s*(.+)$/m);
  return match ? match[1].trim() : fallback;
}

function toPosix(p) {
  return p.replace(/\\/g, '/');
}

function resetDir(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
  fs.mkdirSync(dirPath, { recursive: true });
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJson(jsonPath) {
  try {
    const raw = fs.readFileSync(jsonPath, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    console.error(colors.red(`Failed to read JSON: ${jsonPath}`));
    console.error(colors.red(`  ${e.message}`));
    process.exit(1);
  }
}

function parseManifest(manifestPath) {
  if (!fs.existsSync(manifestPath)) {
    console.error(colors.red(`Missing manifest: ${manifestPath}`));
    process.exit(1);
  }
  const manifest = readJson(manifestPath);
  const includePrefixes = manifest.includePrefixes || manifest.prefixes || [];
  const includeSkills = manifest.includeSkills || manifest.skills || [];
  const excludeSkills = manifest.excludeSkills || manifest.exclude || [];

  if (!Array.isArray(includePrefixes) || !Array.isArray(includeSkills) || !Array.isArray(excludeSkills)) {
    console.error(colors.red(`Invalid manifest schema: ${manifestPath}`));
    console.error(colors.red('Expected arrays: includePrefixes/includeSkills/excludeSkills'));
    process.exit(1);
  }

  return {
    includePrefixes: includePrefixes.map((p) => String(p)),
    includeSkills: includeSkills.map((s) => String(s)),
    excludeSkills: excludeSkills.map((s) => String(s)),
  };
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

function loadSkills(skillsRoot) {
  const skillDirs = findSkillDirs(skillsRoot);
  const skills = [];

  for (const dir of skillDirs) {
    const skillMdPath = path.join(dir, SKILL_MD);
    const content = fs.readFileSync(skillMdPath, 'utf8');
    const frontmatter = readFrontmatter(content);
    const fallback = path.basename(dir);
    const name = extractName(frontmatter || '', fallback);

    const relFromSkillsRoot = toPosix(path.relative(skillsRoot, dir));
    const relFromRepoRoot = toPosix(path.relative(repoRoot, dir));
    const dirName = path.basename(dir);

    skills.push({
      name,
      dir,
      dirName,
      relFromSkillsRoot,
      relFromRepoRoot,
      skillMdPath,
      content,
    });
  }

  const byName = new Map();
  const dupes = [];
  for (const s of skills) {
    if (byName.has(s.name)) {
      dupes.push([byName.get(s.name), s]);
    } else {
      byName.set(s.name, s);
    }
  }

  if (dupes.length > 0) {
    console.error(colors.red('Duplicate skill names detected (must be unique):'));
    for (const [a, b] of dupes) {
      console.error(colors.red(`- ${a.name}:`));
      console.error(colors.red(`  - ${a.relFromRepoRoot}/${SKILL_MD}`));
      console.error(colors.red(`  - ${b.relFromRepoRoot}/${SKILL_MD}`));
    }
    process.exit(1);
  }

  for (const s of skills) {
    if (s.dirName !== s.name) {
      console.log(colors.gray(`  [!] name != dir: ${s.name} (dir: ${s.dirName})`));
    }
  }

  return { skills, byName };
}

function buildStub(skillName, sourceRelDirFromRepoRoot, sourceContent) {
  const frontmatter = readFrontmatter(sourceContent)
    || `---\nname: ${skillName}\ndescription: See ${sourceRelDirFromRepoRoot}/SKILL.md\n---\n\n`;
  const frontmatterBlock = frontmatter.trimEnd();
  const displayName = extractName(frontmatterBlock, skillName);
  const canonicalDir = sourceRelDirFromRepoRoot.replace(/\/$/, '');

  return [
    frontmatterBlock,
    '',
    `# ${displayName} (entry)`,
    '',
    `Canonical source: \`${canonicalDir}/\``,
    '',
    `Open \`${canonicalDir}/SKILL.md\` and any supporting files referenced there (for example \`reference.md\`, \`examples.md\`, \`scripts/\`, \`templates/\`).`,
    '',
    '> **Note**: The frontmatter above is identical to the canonical source. After opening the source file, skip re-reading the description to avoid redundant token usage.',
    '',
  ].join('\n');
}

function parseCsv(value) {
  return String(value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseArgs(argv) {
  const args = {
    skillsRoot: defaultSkillsRoot,
    manifestPath: defaultManifestPath,
    providers: ['codex', 'claude'],
    scope: 'all',
    mode: 'reset',
    prune: false,
    list: false,
    dryRun: false,
    specificSkills: [],
    deleteSkills: [],
  };

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '-h' || a === '--help') {
      args.help = true;
      continue;
    }
    if (a === '--providers' || a === '--provider') {
      args.providers = parseCsv(argv[i + 1] || 'both');
      i += 1;
      continue;
    }
    if (a === '--scope') {
      args.scope = String(argv[i + 1] || '');
      i += 1;
      continue;
    }
    if (a === '--mode') {
      args.mode = String(argv[i + 1] || '');
      i += 1;
      continue;
    }
    if (a === '--prune') {
      args.prune = true;
      continue;
    }
    if (a === '--list') {
      args.list = true;
      continue;
    }
    if (a === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    if (a === '--manifest') {
      args.manifestPath = String(argv[i + 1] || '');
      i += 1;
      continue;
    }
    if (a === '--skills') {
      args.specificSkills.push(...parseCsv(argv[i + 1] || ''));
      i += 1;
      continue;
    }
    if (a === '--skill') {
      args.specificSkills.push(String(argv[i + 1] || '').trim());
      i += 1;
      continue;
    }
    if (a === '--delete') {
      args.deleteSkills.push(...parseCsv(argv[i + 1] || ''));
      i += 1;
      continue;
    }

    console.error(colors.red(`Unknown argument: ${a}`));
    console.error(colors.gray('Use --help for usage.'));
    process.exit(1);
  }

  return args;
}

function normalizeProviders(providers) {
  const raw = providers.length === 0 ? ['both'] : providers;
  const expanded = raw.flatMap((p) => {
    const v = String(p).trim().toLowerCase();
    if (!v || v === 'both') return ['codex', 'claude'];
    return [v];
  });

  const dedup = [...new Set(expanded)];
  const invalid = dedup.filter((p) => !Object.prototype.hasOwnProperty.call(providerDefaults, p));
  if (invalid.length > 0) {
    console.error(colors.red(`Invalid provider(s): ${invalid.join(', ')}`));
    process.exit(1);
  }
  return dedup;
}

function selectSkills(args, allSkills) {
  const scope = String(args.scope || '').toLowerCase();
  if (scope === 'all' || scope === '') {
    return allSkills;
  }
  if (scope === 'minimal') {
    return allSkills.filter((s) => s.relFromSkillsRoot.startsWith('workflows/'));
  }
  if (scope === 'current') {
    const manifest = parseManifest(args.manifestPath);
    const selected = new Map();

    for (const prefixRaw of manifest.includePrefixes) {
      const prefix = String(prefixRaw).replace(/\\/g, '/').replace(/^\/+/, '');
      const normalized = prefix.endsWith('/') ? prefix : `${prefix}/`;
      for (const s of allSkills) {
        if (s.relFromSkillsRoot === prefix || s.relFromSkillsRoot.startsWith(normalized)) {
          selected.set(s.name, s);
        }
      }
    }

    for (const name of manifest.includeSkills) {
      const found = allSkills.find((s) => s.name === name);
      if (!found) {
        console.error(colors.red(`Manifest references missing skill: ${name}`));
        process.exit(1);
      }
      selected.set(found.name, found);
    }

    for (const name of manifest.excludeSkills) {
      selected.delete(name);
    }

    return [...selected.values()].sort((a, b) => a.name.localeCompare(b.name));
  }
  if (scope === 'specific') {
    const names = [...new Set(args.specificSkills.map((s) => String(s).trim()).filter(Boolean))];
    if (names.length === 0) {
      console.error(colors.red('No skills provided for --scope specific (use --skills or --skill).'));
      process.exit(1);
    }
    const out = [];
    for (const name of names) {
      const found = allSkills.find((s) => s.name === name);
      if (!found) {
        console.error(colors.red(`Unknown skill: ${name}`));
        process.exit(1);
      }
      out.push(found);
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  console.error(colors.red(`Invalid --scope: ${args.scope}`));
  process.exit(1);
}

function deleteWrappers({ providers, skillNames, dryRun }) {
  console.log(colors.cyan('========================================'));
  console.log(colors.cyan('  Deleting skill stubs'));
  console.log(colors.cyan('========================================'));

  for (const provider of providers) {
    const targetRoot = providerDefaults[provider];
    console.log('');
    console.log(colors.green(`Provider: ${provider}`));

    for (const name of skillNames) {
      const targetDir = path.join(targetRoot, name);
      if (!fs.existsSync(targetDir)) {
        console.log(colors.gray(`  [-] ${name} (not present)`));
        continue;
      }

      if (dryRun) {
        console.log(colors.gray(`  [~] ${name} (dry-run delete)`));
        continue;
      }

      fs.rmSync(targetDir, { recursive: true, force: true });
      console.log(colors.gray(`  [-] ${name}`));
    }
  }
}

function sync() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const providers = normalizeProviders(args.providers);
  const mode = String(args.mode || '').toLowerCase() || 'reset';
  if (!['reset', 'update'].includes(mode)) {
    console.error(colors.red(`Invalid --mode: ${args.mode}`));
    process.exit(1);
  }

  const { skills: allSkills } = loadSkills(args.skillsRoot);
  const selectedSkills = selectSkills(args, allSkills);

  if (args.list) {
    for (const s of selectedSkills) {
      console.log(`${s.name}\t${s.relFromSkillsRoot}`);
    }
    return;
  }

  if (args.deleteSkills.length > 0) {
    deleteWrappers({ providers, skillNames: args.deleteSkills, dryRun: args.dryRun });
    return;
  }

  console.log(colors.cyan('========================================'));
  console.log(colors.cyan('  Syncing skill stubs'));
  console.log(colors.cyan('========================================'));
  console.log(colors.gray(`  skills_root: ${toPosix(path.relative(repoRoot, args.skillsRoot)) || '.'}`));
  console.log(colors.gray(`  providers: ${providers.join(', ')}`));
  console.log(colors.gray(`  scope: ${args.scope}`));
  console.log(colors.gray(`  mode: ${mode}${mode === 'update' && args.prune ? ' + prune' : ''}`));
  console.log(colors.gray(`  selected_skills: ${selectedSkills.length}`));

  const allNames = new Set(allSkills.map((s) => s.name));
  const selectedNames = new Set(selectedSkills.map((s) => s.name));

  for (const provider of providers) {
    const targetRoot = providerDefaults[provider];
    console.log('');
    console.log(colors.green(`Writing ${provider} stubs...`));

    if (mode === 'reset') {
      if (args.dryRun) {
        console.log(colors.gray(`  [~] reset ${toPosix(path.relative(repoRoot, targetRoot))} (dry-run)`));
      } else {
        resetDir(targetRoot);
      }
    } else {
      if (args.dryRun) {
        console.log(colors.gray(`  [~] ensure ${toPosix(path.relative(repoRoot, targetRoot))} (dry-run)`));
      } else {
        ensureDir(targetRoot);
      }
    }

    if (mode === 'update' && args.prune) {
      const entries = fs.existsSync(targetRoot)
        ? fs.readdirSync(targetRoot, { withFileTypes: true })
        : [];
      for (const e of entries) {
        if (!e.isDirectory()) continue;
        if (!allNames.has(e.name)) continue;
        if (selectedNames.has(e.name)) continue;
        const targetDir = path.join(targetRoot, e.name);
        if (args.dryRun) {
          console.log(colors.gray(`  [~] prune ${e.name} (dry-run)`));
        } else {
          fs.rmSync(targetDir, { recursive: true, force: true });
          console.log(colors.gray(`  [-] ${e.name} (pruned)`));
        }
      }
    }

    for (const skill of selectedSkills) {
      const sourceRelDir = toPosix(path.relative(repoRoot, skill.dir));
      const stub = buildStub(skill.name, sourceRelDir, skill.content);
      const targetDir = path.join(targetRoot, skill.name);
      const targetSkillMd = path.join(targetDir, SKILL_MD);

      if (args.dryRun) {
        console.log(colors.gray(`  [~] write ${skill.name} -> ${toPosix(path.relative(repoRoot, targetSkillMd))}`));
        continue;
      }

      ensureDir(targetDir);
      fs.writeFileSync(targetSkillMd, stub, 'utf8');
      console.log(colors.gray(`  [+] ${skill.name}`));
    }
  }

  console.log('');
  console.log(colors.cyan('========================================'));
  console.log(colors.green('  Skill stubs synced'));
  console.log(colors.cyan('========================================'));
}

sync();


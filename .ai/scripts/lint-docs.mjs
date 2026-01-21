#!/usr/bin/env node

/**
 * Document Format Lint Script
 *
 * Validates Markdown files against documentation standards:
 * - UTF-8 encoding validation
 * - Garbled text (mojibake) detection
 * - Heading depth <= 4 levels
 * - Vague reference detection (it/this/above/below/related)
 * - Naming conventions (kebab-case directories, forbidden dirs)
 *
 * Complements lint-skills.mjs which focuses on skill metadata validation.
 */

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// Constants
// ============================================================================

const repoRoot = path.resolve(__dirname, '..', '..');
const DEFAULT_PATH = repoRoot;
const MAX_HEADING_DEPTH = 4;

// Directories to ignore during traversal
const IGNORE_DIRS = new Set([
  '.git',
  '.hg',
  '.svn',
  '__pycache__',
  'node_modules',
  '.next',
  '.nuxt',
  'dist',
  'build',
  'coverage',
  '.cache',
  '.claude',  // Generated stubs, not SSOT
  '.codex',   // Generated stubs, not SSOT
]);

// Forbidden directory names (from naming-conventions)
const FORBIDDEN_DIRS = new Set(['misc', 'temp', 'tmp']);

// Forbidden dirs specifically under .ai/skills/
const FORBIDDEN_SKILL_DIRS = new Set(['resources']);

// Common mojibake patterns (UTF-8 decoded as other encodings)
const MOJIBAKE_PATTERNS = [
  /ï¿½/g,           // Replacement character in Latin-1
  /â€[™"œ]/g,       // Smart quotes mojibake
  /Ã[©¨¢£]/g,       // Accented chars mojibake
  /â€"/g,           // Em dash mojibake
  /â€¦/g,           // Ellipsis mojibake
  /Â[\xa0-\xff]/g,  // Non-breaking space and other Latin-1 mojibake
  /[\x80-\x9f]/g,   // C1 control characters (invalid in UTF-8 text)
];

// Vague reference words to detect
const VAGUE_REFS = ['it', 'this', 'above', 'below', 'related'];
const VAGUE_REF_PATTERN = new RegExp(`\\b(${VAGUE_REFS.join('|')})\\b`, 'gi');

// ============================================================================
// Colors for terminal output
// ============================================================================

const colors = {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  gray: (s) => `\x1b[90m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

// ============================================================================
// Help text
// ============================================================================

function printHelp() {
  console.log([
    'Lint Markdown documents for format and encoding standards.',
    '',
    'Usage: node .ai/scripts/lint-docs.mjs [options]',
    '',
    'Options:',
    '  --path <dir>    Directory to scan (default: repo root)',
    '  --fix           Interactive fix for garbled text',
    '  --fix-eol       Convert CRLF/CR to LF and ensure final newline (non-interactive)',
    '  --strict        Treat warnings as errors',
    '  --quiet         Only show errors, not warnings',
    '  -h, --help      Show help',
    '',
    'Checks:',
    '  - UTF-8 encoding validation',
    '  - EOL style (LF-only; CRLF/CR are errors)',
    '  - Final newline (missing is a warning)',
    '  - Garbled text (mojibake) detection',
    '  - Heading depth <= 4 levels',
    '  - Vague reference detection (it/this/above/below)',
    '  - Directory naming (kebab-case)',
    '  - Forbidden directories (misc/, temp/, resources/)',
    '',
  ].join('\n'));
}

// ============================================================================
// Argument parsing
// ============================================================================

function parseArgs(argv) {
  const args = {
    path: DEFAULT_PATH,
    fix: false,
    fixEol: false,
    strict: false,
    quiet: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') args.help = true;
    else if (a === '--fix') args.fix = true;
    else if (a === '--fix-eol') args.fixEol = true;
    else if (a === '--strict') args.strict = true;
    else if (a === '--quiet') args.quiet = true;
    else if (a === '--path' && argv[i + 1]) {
      args.path = path.resolve(argv[++i]);
    }
  }

  return args;
}

// ============================================================================
// File traversal
// ============================================================================

function findMarkdownFiles(rootDir) {
  if (!fs.existsSync(rootDir)) {
    console.error(colors.red(`Path does not exist: ${rootDir}`));
    process.exit(1);
  }

  const stat = fs.statSync(rootDir);
  if (stat.isFile()) {
    return rootDir.endsWith('.md') ? [rootDir] : [];
  }

  const stack = [rootDir];
  const mdFiles = [];

  while (stack.length > 0) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        // Skip ignored dirs
        if (IGNORE_DIRS.has(entry.name)) continue;
        // Allow .ai directory (SSOT), skip other dot-directories
        if (entry.name.startsWith('.') && entry.name !== '.ai') continue;
        stack.push(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        mdFiles.push(fullPath);
      }
    }
  }

  return mdFiles.sort((a, b) => a.localeCompare(b));
}

function findAllDirectories(rootDir) {
  if (!fs.existsSync(rootDir)) return [];

  const stat = fs.statSync(rootDir);
  if (!stat.isDirectory()) return [];

  const stack = [rootDir];
  const dirs = [];

  while (stack.length > 0) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (IGNORE_DIRS.has(entry.name)) continue;
      if (entry.name.startsWith('.') && entry.name !== '.ai') continue;

      const fullPath = path.join(dir, entry.name);
      dirs.push(fullPath);
      stack.push(fullPath);
    }
  }

  return dirs.sort((a, b) => a.localeCompare(b));
}

// ============================================================================
// Encoding checks
// ============================================================================

function checkUtf8Encoding(filePath) {
  const errors = [];
  const buffer = fs.readFileSync(filePath);

  // Check for UTF-8 BOM (not recommended but not an error)
  const hasBom = buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf;

  // Validate UTF-8 sequences
  let i = hasBom ? 3 : 0;
  let line = 1;
  let lineStart = i;

  while (i < buffer.length) {
    const byte = buffer[i];

    // Track line numbers
    if (byte === 0x0a) {
      line++;
      lineStart = i + 1;
    }

    // ASCII (0x00-0x7F)
    if (byte <= 0x7f) {
      i++;
      continue;
    }

    // Multi-byte UTF-8 sequence validation
    let expectedBytes = 0;
    if ((byte & 0xe0) === 0xc0) expectedBytes = 2;      // 110xxxxx
    else if ((byte & 0xf0) === 0xe0) expectedBytes = 3; // 1110xxxx
    else if ((byte & 0xf8) === 0xf0) expectedBytes = 4; // 11110xxx
    else {
      // Invalid leading byte
      errors.push({
        type: 'error',
        line,
        col: i - lineStart + 1,
        message: `Invalid UTF-8 leading byte 0x${byte.toString(16)}`,
      });
      i++;
      continue;
    }

    // Check continuation bytes
    let valid = true;
    for (let j = 1; j < expectedBytes && i + j < buffer.length; j++) {
      if ((buffer[i + j] & 0xc0) !== 0x80) {
        valid = false;
        break;
      }
    }

    if (!valid || i + expectedBytes > buffer.length) {
      errors.push({
        type: 'error',
        line,
        col: i - lineStart + 1,
        message: `Invalid UTF-8 sequence at byte position ${i}`,
      });
      i++;
    } else {
      i += expectedBytes;
    }
  }

  return { errors, hasBom };
}

function checkEolStyle(filePath) {
  const errors = [];
  const warnings = [];
  const buffer = fs.readFileSync(filePath);

  if (buffer.length === 0) return { errors, warnings };

  let line = 1;
  let firstCrlfLine = null;
  let firstCrOnlyLine = null;

  for (let i = 0; i < buffer.length; i++) {
    const byte = buffer[i];

    if (byte === 0x0d) {
      const next = i + 1 < buffer.length ? buffer[i + 1] : null;
      if (next === 0x0a) {
        if (firstCrlfLine === null) firstCrlfLine = line;
      } else {
        if (firstCrOnlyLine === null) firstCrOnlyLine = line;
      }
    }

    if (byte === 0x0a) {
      line++;
    }
  }

  if (firstCrlfLine !== null) {
    errors.push({
      type: 'error',
      line: firstCrlfLine,
      message: 'File uses CRLF line endings; repo standard is LF. (Hint: run `node .ai/scripts/lint-docs.mjs --fix-eol` or `git add --renormalize .` after adding .gitattributes)',
    });
  }

  if (firstCrOnlyLine !== null) {
    errors.push({
      type: 'error',
      line: firstCrOnlyLine,
      message: 'File uses CR (classic Mac) line endings; repo standard is LF.',
    });
  }

  if (buffer[buffer.length - 1] !== 0x0a) {
    warnings.push({
      type: 'warning',
      line,
      message: 'File is missing a final newline (LF) at end-of-file.',
    });
  }

  return { errors, warnings };
}

function normalizeEolBuffer(buffer) {
  const out = [];
  for (let i = 0; i < buffer.length; i++) {
    const b = buffer[i];
    if (b === 0x0d) {
      const next = i + 1 < buffer.length ? buffer[i + 1] : null;
      if (next === 0x0a) i += 1; // consume LF in CRLF
      out.push(0x0a);
      continue;
    }
    out.push(b);
  }
  if (out.length === 0 || out[out.length - 1] !== 0x0a) out.push(0x0a);
  return Buffer.from(out);
}

function fixEol(filePath) {
  const original = fs.readFileSync(filePath);
  if (original.length === 0) return { changed: false };
  const normalized = normalizeEolBuffer(original);
  if (Buffer.compare(original, normalized) === 0) return { changed: false };
  fs.writeFileSync(filePath, normalized);
  return { changed: true };
}

function detectGarbledText(content) {
  const issues = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    for (const pattern of MOJIBAKE_PATTERNS) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(line)) !== null) {
        issues.push({
          type: 'error',
          line: lineNum,
          col: match.index + 1,
          message: `Possible garbled text: "${match[0]}"`,
          match: match[0],
          fullLine: line,
        });
      }
    }
  }

  return issues;
}

// ============================================================================
// Document format checks
// ============================================================================

function checkHeadingDepth(content) {
  const issues = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Match Markdown headings
    const headingMatch = line.match(/^(#{1,6})\s/);
    if (headingMatch) {
      const depth = headingMatch[1].length;
      if (depth > MAX_HEADING_DEPTH) {
        issues.push({
          type: 'error',
          line: lineNum,
          message: `Heading depth exceeds ${MAX_HEADING_DEPTH} levels (${'#'.repeat(depth)} found)`,
        });
      }
    }
  }

  return issues;
}

function checkVagueReferences(content) {
  const issues = [];
  const lines = content.split('\n');

  // Track occurrences per file
  const counts = {};
  for (const ref of VAGUE_REFS) {
    counts[ref] = 0;
  }

  // Track fenced code block state
  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const trimmed = line.trim();

    // Toggle code block state on fence lines (```)
    if (trimmed.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }

    // Skip lines inside code blocks
    if (inCodeBlock) continue;

    // Skip indented code blocks (4+ spaces or tab)
    if (/^(\s{4,}|\t)/.test(line) && !trimmed.startsWith('-') && !trimmed.startsWith('*')) {
      continue;
    }

    // Remove inline code (`...`) before checking
    const lineWithoutInlineCode = line.replace(/`[^`]+`/g, '');

    // Skip lines that are mostly code/paths (heuristic)
    // - Lines with template variables like {{this}}
    // - Lines that look like JSON keys or code
    if (/\{\{this\}\}/.test(line)) continue;
    if (/["'][^"']*\b(this|it)\b[^"']*["']/.test(line)) continue;

    VAGUE_REF_PATTERN.lastIndex = 0;
    let match;
    while ((match = VAGUE_REF_PATTERN.exec(lineWithoutInlineCode)) !== null) {
      const word = match[1].toLowerCase();
      counts[word]++;

      // Only warn if the word appears frequently (threshold: 3)
      if (counts[word] === 3) {
        issues.push({
          type: 'warning',
          line: lineNum,
          message: `Frequent use of vague reference "${word}" (3+ occurrences)`,
        });
      }
    }
  }

  return issues;
}

// ============================================================================
// Naming convention checks
// ============================================================================

function isKebabCase(name) {
  // Allow: lowercase letters, numbers, hyphens
  // Also allow: leading dot (for .ai), underscores in filenames
  // Special files like SKILL.md, README.md are exempt
  const EXEMPT_FILES = new Set(['SKILL.md', 'README.md', 'AGENTS.md', 'LICENSE', 'CHANGELOG.md']);
  if (EXEMPT_FILES.has(name)) return true;

  // For directories, strict kebab-case
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(name);
}

function checkNamingConventions(rootDir) {
  const issues = [];
  const dirs = findAllDirectories(rootDir);

  for (const dir of dirs) {
    const dirName = path.basename(dir);
    const relPath = path.relative(rootDir, dir);

    // Check for forbidden directory names
    if (FORBIDDEN_DIRS.has(dirName.toLowerCase())) {
      issues.push({
        type: 'error',
        path: relPath,
        message: `Forbidden directory name: ${dirName}/`,
      });
    }

    // Check for resources/ under .ai/skills/
    const isUnderSkills = dir.includes(path.join('.ai', 'skills'));
    if (isUnderSkills && FORBIDDEN_SKILL_DIRS.has(dirName.toLowerCase())) {
      issues.push({
        type: 'error',
        path: relPath,
        message: `Forbidden directory under .ai/skills/: ${dirName}/`,
      });
    }

    // Check kebab-case (skip .ai itself and other dot-prefixed)
    if (!dirName.startsWith('.') && !isKebabCase(dirName)) {
      // Check if it contains spaces or special chars
      if (/\s/.test(dirName)) {
        issues.push({
          type: 'error',
          path: relPath,
          message: `Directory name contains spaces: "${dirName}"`,
        });
      } else if (!/^[a-z0-9_-]+$/i.test(dirName)) {
        issues.push({
          type: 'error',
          path: relPath,
          message: `Directory name contains invalid characters: "${dirName}"`,
        });
      } else if (/[A-Z]/.test(dirName)) {
        issues.push({
          type: 'warning',
          path: relPath,
          message: `Directory name not kebab-case (contains uppercase): "${dirName}"`,
        });
      }
    }
  }

  return issues;
}

// ============================================================================
// Interactive fix
// ============================================================================

async function promptUser(question, options) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    console.log('');
    console.log(question);
    for (let i = 0; i < options.length; i++) {
      console.log(`  [${i + 1}] ${options[i].label}`);
    }

    rl.question('  Choice: ', (answer) => {
      rl.close();
      const idx = parseInt(answer, 10) - 1;
      if (idx >= 0 && idx < options.length) {
        resolve(options[idx].value);
      } else {
        resolve('skip');
      }
    });
  });
}

async function interactiveFix(filePath, issues) {
  if (issues.length === 0) return false;

  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;
  let skipFile = false;

  for (const issue of issues) {
    if (skipFile) break;
    if (issue.type !== 'error' || !issue.match) continue;

    const relPath = path.relative(repoRoot, filePath);
    console.log('');
    console.log(colors.yellow(`Found garbled text at ${relPath}:${issue.line}`));
    console.log(colors.gray(`  Line: "${issue.fullLine.trim()}"`));
    console.log(colors.cyan(`  Match: "${issue.match}"`));

    const choice = await promptUser('  Fix options:', [
      { label: 'Replace with placeholder (�)', value: 'placeholder' },
      { label: 'Remove garbled characters', value: 'remove' },
      { label: 'Skip this occurrence', value: 'skip' },
      { label: 'Skip all in this file', value: 'skip_file' },
    ]);

    if (choice === 'skip_file') {
      skipFile = true;
      continue;
    }

    if (choice === 'skip') {
      continue;
    }

    if (choice === 'placeholder') {
      content = content.replace(issue.match, '�');
      modified = true;
    } else if (choice === 'remove') {
      content = content.replace(issue.match, '');
      modified = true;
    }
  }

  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(colors.green(`  ✓ File updated: ${path.relative(repoRoot, filePath)}`));
  }

  return modified;
}

// ============================================================================
// Lint single file
// ============================================================================

function lintFile(filePath) {
  const errors = [];
  const warnings = [];
  const relPath = path.relative(repoRoot, filePath);

  // 1. UTF-8 encoding check
  const encodingResult = checkUtf8Encoding(filePath);
  errors.push(...encodingResult.errors);

  if (encodingResult.hasBom) {
    warnings.push({
      type: 'warning',
      line: 1,
      message: 'File has UTF-8 BOM (not recommended)',
    });
  }

  // 1.1 EOL style check (LF-only)
  const eolResult = checkEolStyle(filePath);
  errors.push(...eolResult.errors);
  warnings.push(...eolResult.warnings);

  // 2. Read content for further checks
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    errors.push({
      type: 'error',
      message: `Cannot read file: ${e.message}`,
    });
    return { relPath, errors, warnings, garbledIssues: [] };
  }

  // 3. Garbled text detection
  const garbledIssues = detectGarbledText(content);
  errors.push(...garbledIssues);

  // 4. Heading depth check
  const headingIssues = checkHeadingDepth(content);
  errors.push(...headingIssues);

  // 5. Vague reference check
  const vagueIssues = checkVagueReferences(content);
  warnings.push(...vagueIssues);

  return { relPath, errors, warnings, garbledIssues };
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    return;
  }

  console.log(colors.cyan('========================================'));
  console.log(colors.cyan('  Document Format Lint'));
  console.log(colors.cyan('========================================'));
  console.log('');

  // Find all Markdown files
  const mdFiles = findMarkdownFiles(args.path);
  console.log(colors.gray(`Found ${mdFiles.length} Markdown files to check`));
  console.log('');

  // Optional non-interactive EOL normalization (CRLF/CR -> LF) + final newline.
  if (args.fixEol) {
    let changed = 0;
    for (const filePath of mdFiles) {
      const res = fixEol(filePath);
      if (res.changed) changed += 1;
    }
    if (changed > 0) {
      console.log(colors.gray(`[fix-eol] Updated ${changed} file(s)\n`));
    }
  }

  // Check naming conventions (directories)
  const namingIssues = checkNamingConventions(args.path);

  let totalErrors = 0;
  let totalWarnings = 0;
  const results = [];

  // Lint each file
  for (const filePath of mdFiles) {
    const result = lintFile(filePath);
    results.push(result);
    totalErrors += result.errors.length;
    totalWarnings += result.warnings.length;
  }

  // Interactive fix mode
  if (args.fix) {
    for (const result of results) {
      if (result.garbledIssues && result.garbledIssues.length > 0) {
        const filePath = path.join(repoRoot, result.relPath);
        await interactiveFix(filePath, result.garbledIssues);
      }
    }
    console.log('');
  }

  // Print file results
  for (const result of results) {
    const hasErrors = result.errors.length > 0;
    const hasWarnings = result.warnings.length > 0;

    // In quiet mode, only show files with errors
    if (args.quiet && !hasErrors) continue;
    if (!hasErrors && !hasWarnings) continue;

    console.log(colors.cyan(result.relPath));

    for (const error of result.errors) {
      const loc = error.line ? `:${error.line}` : '';
      console.log(colors.red(`  ✗ ${error.message}${loc ? ` (line ${error.line})` : ''}`));
    }

    if (!args.quiet) {
      for (const warning of result.warnings) {
        const loc = warning.line ? `:${warning.line}` : '';
        console.log(colors.yellow(`  ⚠ ${warning.message}${loc ? ` (line ${warning.line})` : ''}`));
      }
    }

    console.log('');
  }

  // Print naming convention issues
  const namingErrors = namingIssues.filter((i) => i.type === 'error');
  const namingWarnings = namingIssues.filter((i) => i.type === 'warning');

  // Count totals
  totalErrors += namingErrors.length;
  totalWarnings += namingWarnings.length;

  // In quiet mode, only show if there are errors
  const showNamingSection = args.quiet ? namingErrors.length > 0 : namingIssues.length > 0;

  if (showNamingSection) {
    console.log(colors.cyan('Naming Convention Issues:'));
    for (const issue of namingErrors) {
      console.log(colors.red(`  ✗ ${issue.path}: ${issue.message}`));
    }
    if (!args.quiet) {
      for (const issue of namingWarnings) {
        console.log(colors.yellow(`  ⚠ ${issue.path}: ${issue.message}`));
      }
    }
    console.log('');
  }

  // Summary
  console.log(colors.cyan('========================================'));
  console.log(colors.cyan('  Summary'));
  console.log(colors.cyan('========================================'));
  console.log(`  Files checked: ${results.length}`);
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

main().catch((err) => {
  console.error(colors.red(`Error: ${err.message}`));
  process.exit(1);
});

/**
 * CLI utilities for ctl scripts
 *
 * Provides common command-line interface helpers:
 * - Argument parsing
 * - Error handling and exit
 * - ISO timestamp generation
 * - Repo root resolution
 *
 * Usage:
 *   import { parseArgs, die, isoNow, repoRootFromOpts } from './lib/cli.mjs';
 */

import path from 'node:path';

/**
 * Parse command-line arguments into a structured object.
 *
 * Supports:
 * - `--key value` pairs
 * - `--flag` boolean flags
 * - Positional arguments
 *
 * @param {string[]} argv - process.argv
 * @param {{ usageFn?: (code: number) => void }} opts - Options
 * @returns {{ command: string, opts: Record<string, string | boolean>, positionals: string[] }}
 */
export function parseArgs(argv, opts = {}) {
  const args = argv.slice(2);
  const usageFn = opts.usageFn || (() => process.exit(0));

  if (args.length === 0 || args[0] === '-h' || args[0] === '--help') {
    usageFn(0);
  }

  const command = args.shift();
  const result = { opts: {}, positionals: [] };

  while (args.length > 0) {
    const token = args.shift();

    if (token === '-h' || token === '--help') {
      usageFn(0);
    }

    if (token.startsWith('--')) {
      const key = token.slice(2);
      if (args.length > 0 && !args[0].startsWith('--')) {
        result.opts[key] = args.shift();
      } else {
        result.opts[key] = true;
      }
    } else {
      result.positionals.push(token);
    }
  }

  return { command, ...result };
}

/**
 * Print an error message and exit.
 *
 * @param {string} msg - Error message
 * @param {number} code - Exit code (default: 1)
 */
export function die(msg, code = 1) {
  console.error(msg);
  process.exit(code);
}

/**
 * Get current timestamp in ISO 8601 format.
 *
 * @returns {string} ISO timestamp (e.g., "2025-01-22T10:30:00.000Z")
 */
export function isoNow() {
  return new Date().toISOString();
}

/**
 * Resolve repo root from CLI options.
 *
 * @param {Record<string, string | boolean>} opts - Parsed CLI options
 * @returns {string} Absolute path to repo root
 */
export function repoRootFromOpts(opts) {
  return path.resolve(opts['repo-root'] || process.cwd());
}

/**
 * Create a standard usage function.
 *
 * @param {string} usageText - Help text to display
 * @returns {(exitCode: number) => void}
 */
export function createUsage(usageText) {
  return function usage(exitCode = 0) {
    console.log(usageText.trim());
    process.exit(exitCode);
  };
}

/**
 * Print warnings and errors in a consistent format.
 *
 * @param {{ warnings: string[], errors: string[] }} report - Report object
 * @param {{ strict?: boolean, label?: string }} opts - Options
 * @returns {{ shouldExit: boolean, exitCode: number }}
 */
export function printDiagnostics(report, opts = {}) {
  const { warnings = [], errors = [] } = report;
  const { strict = false, label = '' } = opts;

  if (warnings.length > 0) {
    console.log(`\nWarnings (${warnings.length}):`);
    for (const w of warnings) console.log(`- ${w}`);
  }

  if (errors.length > 0) {
    console.log(`\nErrors (${errors.length}):`);
    for (const e of errors) console.log(`- ${e}`);
  }

  const shouldExit = errors.length > 0 || (strict && warnings.length > 0);
  return { shouldExit, exitCode: shouldExit ? 1 : 0 };
}

/**
 * Handle standard command result output.
 *
 * @param {{ warnings: string[], errors: string[] }} report - Report with diagnostics
 * @param {{ format?: string, strict?: boolean, successMsg?: string }} opts - Options
 */
export function handleCommandResult(report, opts = {}) {
  const { format = 'text', strict = false, successMsg = '[ok] Done.' } = opts;

  if (format === 'json') {
    console.log(JSON.stringify(report, null, 2));
    if (report.errors?.length > 0) process.exitCode = 1;
    if (strict && report.warnings?.length > 0) process.exitCode = 1;
    return;
  }

  const { shouldExit } = printDiagnostics(report, { strict });
  if (shouldExit) {
    process.exitCode = 1;
  } else if (successMsg) {
    console.log(successMsg);
  }
}

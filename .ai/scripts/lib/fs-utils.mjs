/**
 * File system utilities for ctl scripts
 *
 * Provides common file system helpers:
 * - Directory creation
 * - Path normalization
 * - Text/JSON read/write
 * - File hashing
 *
 * Usage:
 *   import {
 *     ensureDir,
 *     safeRel,
 *     readText,
 *     writeText,
 *     readJson,
 *     writeJson,
 *     sha256File,
 *     cleanJsonFilesInDir
 *   } from './lib/fs-utils.mjs';
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

/**
 * Ensure a directory exists, creating it recursively if needed.
 *
 * @param {string} dirPath - Directory path to ensure
 */
export function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

/**
 * Get a path relative to repo root, with safety check.
 *
 * Returns the original path if it's outside repo root.
 *
 * @param {string} repoRoot - Repository root path
 * @param {string} targetPath - Path to relativize
 * @returns {string} Relative path or original if outside repo
 */
export function safeRel(repoRoot, targetPath) {
  if (!targetPath || typeof targetPath !== 'string') return String(targetPath || '');
  if (!repoRoot || typeof repoRoot !== 'string') return targetPath;

  const abs = path.resolve(targetPath);
  const rr = path.resolve(repoRoot);

  // Use path.relative and check if result goes outside repo
  const rel = path.relative(rr, abs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return targetPath;
  }
  return rel;
}

/**
 * Read a text file.
 *
 * @param {string} filePath - File path to read
 * @returns {string} File contents
 */
export function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

/**
 * Write a text file, creating parent directories if needed.
 *
 * @param {string} filePath - File path to write
 * @param {string} content - Content to write
 */
export function writeText(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf8');
}

/**
 * Read and parse a JSON file.
 *
 * Returns null if file doesn't exist or parsing fails.
 *
 * @param {string} filePath - File path to read
 * @returns {any | null} Parsed JSON or null
 */
export function readJson(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Write a JSON file with pretty formatting, creating parent directories if needed.
 *
 * @param {string} filePath - File path to write
 * @param {any} data - Data to serialize
 */
export function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

/**
 * Compute SHA-256 hash of a file.
 *
 * @param {string} filePath - File path to hash
 * @returns {string} Hex-encoded hash
 */
export function sha256File(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/**
 * Delete all .json files in a directory.
 *
 * @param {string} dirPath - Directory path
 */
export function cleanJsonFilesInDir(dirPath) {
  if (!fs.existsSync(dirPath)) return;
  for (const ent of fs.readdirSync(dirPath, { withFileTypes: true })) {
    if (!ent.isFile()) continue;
    if (!ent.name.endsWith('.json')) continue;
    fs.unlinkSync(path.join(dirPath, ent.name));
  }
}

/**
 * Check if a file exists.
 *
 * @param {string} filePath - File path to check
 * @returns {boolean}
 */
export function fileExists(filePath) {
  return fs.existsSync(filePath);
}

/**
 * Check if a path is a directory.
 *
 * @param {string} dirPath - Path to check
 * @returns {boolean}
 */
export function isDirectory(dirPath) {
  try {
    return fs.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

/**
 * List directory entries.
 *
 * @param {string} dirPath - Directory path
 * @returns {fs.Dirent[]} Directory entries
 */
export function listDir(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  return fs.readdirSync(dirPath, { withFileTypes: true });
}

/**
 * Extract leading comment block from raw text (for preserving YAML headers).
 *
 * @param {string} raw - Raw text content
 * @returns {string} Leading comment block (with trailing newlines)
 */
export function extractLeadingCommentBlock(raw) {
  const lines = raw.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const t = lines[i].trim();
    if (t === '' || t.startsWith('#')) i++;
    else break;
  }
  const header = lines.slice(0, i).join('\n').replace(/\s+$/, '');
  return header.length > 0 ? header + '\n\n' : '';
}

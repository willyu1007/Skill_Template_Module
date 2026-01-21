/**
 * Minimal YAML parser/writer (subset) for SSOT files in `.system/modular/**`.
 *
 * Supported:
 * - Comments (# ...)
 * - Objects (key: value)
 * - Nested objects via indentation (2 spaces recommended)
 * - Arrays via `- ...`
 * - Scalars: string, number, boolean, null
 * - JSON-in-YAML scalars (`[]`, `{}` or JSON arrays/objects on a single line)
 *
 * Not supported:
 * - Multi-line scalars (`|`/`>`)
 * - Anchors/aliases
 * - Complex keys
 */

import fs from 'node:fs';

function isBlank(line) {
  return line.trim().length === 0;
}

function stripComments(line) {
  // Very small: treat any `#` preceded by whitespace as comment start.
  // This avoids breaking URLs like `http://...`.
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    if (ch === '"' && !inSingle) inDouble = !inDouble;
    if (!inSingle && !inDouble && ch === '#') {
      // If `#` is first non-space or preceded by whitespace, treat as comment.
      if (i === 0 || /\s/.test(line[i - 1])) {
        return line.slice(0, i).replace(/\s+$/, '');
      }
    }
  }
  return line;
}

function parseScalar(raw) {
  const v = raw.trim();
  if (v === '') return '';

  // JSON inline objects/arrays
  if ((v.startsWith('{') && v.endsWith('}')) || (v.startsWith('[') && v.endsWith(']'))) {
    try {
      return JSON.parse(v);
    } catch {
      // fallthrough
    }
  }

  // Quoted string
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    const inner = v.slice(1, -1);
    // Minimal unescape for double quotes
    if (v.startsWith('"')) {
      return inner
        .replace(/\\"/g, '"')
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\\\/g, '\\');
    }
    return inner;
  }

  // null
  if (v === 'null' || v === '~') return null;

  // boolean
  if (v === 'true') return true;
  if (v === 'false') return false;

  // number
  if (/^[+-]?[0-9]+$/.test(v)) {
    const n = Number(v);
    if (Number.isSafeInteger(n)) return n;
  }
  if (/^[+-]?[0-9]*\.[0-9]+$/.test(v)) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }

  return v;
}

function parseKeyValue(line) {
  const idx = line.indexOf(':');
  if (idx === -1) return null;
  const key = line.slice(0, idx).trim();
  const rest = line.slice(idx + 1);
  return { key, rest };
}

export function parseYaml(text) {
  const lines = text.split(/\r?\n/);

  let root = undefined;
  const stack = [{ indent: -1, type: 'root', container: undefined, pendingKey: null }];

  function current() {
    return stack[stack.length - 1];
  }

  function ensureRootContainer(nextIsArray) {
    if (root !== undefined) return;
    root = nextIsArray ? [] : {};
    stack[0].container = root;
    stack[0].type = Array.isArray(root) ? 'array' : 'object';
  }

  for (let i = 0; i < lines.length; i++) {
    const original = lines[i];
    const stripped = stripComments(original);
    if (isBlank(stripped)) continue;

    const indent = stripped.match(/^ */)[0].length;
    const trimmed = stripped.trim();

    // YAML document markers are a no-op for this minimal subset.
    if (trimmed === '---' || trimmed === '...') continue;

    // Complex keys are out of scope for this parser.
    if (trimmed.startsWith('?')) {
      throw new Error(`YAML parse error (line ${i + 1}): complex keys ("?") are not supported`);
    }

    // Pop contexts until we find parent indentation
    // For array items (- ...), we need to pop until we find the array container
    // or a context at a lower indent level
    while (stack.length > 1) {
      const ctx = current();
      // If this is an array item, pop until we find an array context or lower indent
      if (trimmed.startsWith('-')) {
        if (ctx.type === 'array' && indent === ctx.indent) break;
        if (indent > ctx.indent) break;
      } else {
        // For object keys, pop until we find a context at lower or equal indent
        if (indent > ctx.indent) break;
      }
      stack.pop();
    }

    const ctx = current();

    // Resolve pending key if needed
    if (ctx.type === 'object' && ctx.pendingKey) {
      const nextIsArray = trimmed.startsWith('-');
      const child = nextIsArray ? [] : {};
      ctx.container[ctx.pendingKey] = child;
      ctx.pendingKey = null;
      stack.push({ indent, type: nextIsArray ? 'array' : 'object', container: child, pendingKey: null });
    }

    // Root creation if needed
    if (root === undefined) {
      ensureRootContainer(trimmed.startsWith('-'));
    }

    const parent = current();

    if (trimmed.startsWith('-')) {
      if (parent.type !== 'array') {
        throw new Error(`YAML parse error (line ${i + 1}): list item where parent is not an array`);
      }

      const rest = trimmed.slice(1).trimStart();
      if (rest.startsWith('|') || rest.startsWith('>')) {
        throw new Error(`YAML parse error (line ${i + 1}): multi-line scalars ("|" or ">") are not supported`);
      }
      if (rest.startsWith('&') || rest.startsWith('*')) {
        throw new Error(
          `YAML parse error (line ${i + 1}): anchors/aliases ("&" / "*") are not supported (quote the value if it is a literal string)`
        );
      }
      if (rest === '') {
        const obj = {};
        parent.container.push(obj);
        stack.push({ indent, type: 'object', container: obj, pendingKey: null });
        continue;
      }

      const kv = parseKeyValue(rest);
      if (kv && kv.key) {
        const restTrim = kv.rest.trim();
        if (restTrim.startsWith('|') || restTrim.startsWith('>')) {
          throw new Error(`YAML parse error (line ${i + 1}): multi-line scalars ("|" or ">") are not supported`);
        }
        if (restTrim.startsWith('&') || restTrim.startsWith('*')) {
          throw new Error(
            `YAML parse error (line ${i + 1}): anchors/aliases ("&" / "*") are not supported (quote the value if it is a literal string)`
          );
        }
        const obj = {};
        parent.container.push(obj);
        // Parse first key/value inline
        if (kv.rest.trim() === '') {
          obj[kv.key] = undefined;
          stack.push({ indent, type: 'object', container: obj, pendingKey: kv.key });
        } else {
          obj[kv.key] = parseScalar(kv.rest);
          stack.push({ indent, type: 'object', container: obj, pendingKey: null });
        }
        continue;
      }

      parent.container.push(parseScalar(rest));
      continue;
    }

    // mapping
    if (parent.type !== 'object') {
      throw new Error(`YAML parse error (line ${i + 1}): mapping where parent is not an object`);
    }

    const kv = parseKeyValue(trimmed);
    if (!kv || !kv.key) {
      throw new Error(`YAML parse error (line ${i + 1}): expected key: value`);
    }

    if (kv.rest.trim() === '') {
      parent.container[kv.key] = undefined;
      parent.pendingKey = kv.key;
      continue;
    }

    const restTrim = kv.rest.trim();
    if (restTrim.startsWith('|') || restTrim.startsWith('>')) {
      throw new Error(`YAML parse error (line ${i + 1}): multi-line scalars ("|" or ">") are not supported`);
    }
    if (restTrim.startsWith('&') || restTrim.startsWith('*')) {
      throw new Error(
        `YAML parse error (line ${i + 1}): anchors/aliases ("&" / "*") are not supported (quote the value if it is a literal string)`
      );
    }

    parent.container[kv.key] = parseScalar(kv.rest);
  }

  // Replace any remaining undefined values with null (empty mappings)
  function normalize(v) {
    if (Array.isArray(v)) {
      for (let i = 0; i < v.length; i++) v[i] = normalize(v[i]);
      return v;
    }
    if (v && typeof v === 'object') {
      for (const k of Object.keys(v)) {
        if (v[k] === undefined) v[k] = null;
        else v[k] = normalize(v[k]);
      }
      return v;
    }
    return v;
  }

  return normalize(root ?? {});
}

function needsQuoting(str) {
  if (str === '') return true;
  if (/^[a-zA-Z0-9._\/-]+$/.test(str)) return false;
  // Avoid accidental bool/null/number parsing
  if (['true', 'false', 'null', '~'].includes(str)) return true;
  if (/^[+-]?[0-9]+(\.[0-9]+)?$/.test(str)) return true;
  return true;
}

function quote(str) {
  const escaped = str
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    .replace(/"/g, '\\"');
  return `"${escaped}"`;
}

function dumpScalar(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'null';
  if (typeof v === 'string') {
    return needsQuoting(v) ? quote(v) : v;
  }
  // Inline JSON for objects/arrays on scalar position
  return quote(JSON.stringify(v));
}

export function dumpYaml(obj, indentSize = 2) {
  const lines = [];

  function write(value, indent) {
    const pad = ' '.repeat(indent);

    if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(pad + '[]');
        return;
      }
      for (const item of value) {
        if (item && typeof item === 'object') {
          lines.push(pad + '-');
          write(item, indent + indentSize);
        } else {
          lines.push(pad + `- ${dumpScalar(item)}`);
        }
      }
      return;
    }

    if (value && typeof value === 'object') {
      const keys = Object.keys(value);
      if (keys.length === 0) {
        lines.push(pad + '{}');
        return;
      }
      for (const key of keys) {
        const v = value[key];
        if (v && typeof v === 'object') {
          if (Array.isArray(v) && v.length === 0) {
            lines.push(pad + `${key}: []`);
          } else if (!Array.isArray(v) && Object.keys(v).length === 0) {
            lines.push(pad + `${key}: {}`);
          } else {
            lines.push(pad + `${key}:`);
            write(v, indent + indentSize);
          }
        } else {
          lines.push(pad + `${key}: ${dumpScalar(v)}`);
        }
      }
      return;
    }

    lines.push(pad + dumpScalar(value));
  }

  write(obj ?? {}, 0);
  return lines.join('\n') + '\n';
}

export function loadYamlFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return parseYaml(raw);
}

export function saveYamlFile(filePath, obj) {
  const yaml = dumpYaml(obj);
  fs.writeFileSync(filePath, yaml, 'utf8');
}

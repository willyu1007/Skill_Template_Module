#!/usr/bin/env node
/**
 * Test: participates_in normalization and validation
 *
 * Verifies that normalizeParticipatesInEntry correctly handles various input formats.
 */

import { normalizeParticipatesInEntry } from '../../scripts/lib/modular.mjs';

const results = { passed: 0, failed: 0, errors: [] };

function test(description, fn) {
  try {
    fn();
    results.passed++;
    console.log(`✓ ${description}`);
  } catch (e) {
    results.failed++;
    results.errors.push({ description, error: e.message });
    console.error(`✗ ${description}`);
    console.error(`  ${e.message}`);
  }
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(`${msg}: expected ${expected}, got ${actual}`);
  }
}

function assertDeepEqual(actual, expected, msg) {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr !== expectedStr) {
    throw new Error(`${msg}: expected ${expectedStr}, got ${actualStr}`);
  }
}

// =============================================================================
// Valid entries
// =============================================================================

console.log('\n--- Valid participates_in entries ---');

test('standard format (flow_id, node_id)', () => {
  const entry = { flow_id: 'user-management', node_id: 'create-user' };
  const result = normalizeParticipatesInEntry(entry);
  assertDeepEqual(result, { flow_id: 'user-management', node_id: 'create-user', role: null }, 'normalizeParticipatesInEntry');
});

test('standard format with role', () => {
  const entry = { flow_id: 'user-management', node_id: 'create-user', role: 'primary' };
  const result = normalizeParticipatesInEntry(entry);
  assertDeepEqual(result, { flow_id: 'user-management', node_id: 'create-user', role: 'primary' }, 'normalizeParticipatesInEntry');
});

test('camelCase format (flowId, nodeId)', () => {
  const entry = { flowId: 'user-management', nodeId: 'create-user' };
  const result = normalizeParticipatesInEntry(entry);
  assertDeepEqual(result, { flow_id: 'user-management', node_id: 'create-user', role: null }, 'normalizeParticipatesInEntry');
});

test('short format (flow, node)', () => {
  const entry = { flow: 'user-management', node: 'create-user' };
  const result = normalizeParticipatesInEntry(entry);
  assertDeepEqual(result, { flow_id: 'user-management', node_id: 'create-user', role: null }, 'normalizeParticipatesInEntry');
});

test('mixed format (flow_id, nodeId)', () => {
  const entry = { flow_id: 'user-management', nodeId: 'create-user' };
  const result = normalizeParticipatesInEntry(entry);
  assertDeepEqual(result, { flow_id: 'user-management', node_id: 'create-user', role: null }, 'normalizeParticipatesInEntry');
});

test('priority: flow_id > flowId > flow', () => {
  const entry = { flow_id: 'a', flowId: 'b', flow: 'c', node_id: 'x' };
  const result = normalizeParticipatesInEntry(entry);
  assertEqual(result.flow_id, 'a', 'flow_id should win');
});

// =============================================================================
// Invalid/edge cases
// =============================================================================

console.log('\n--- Invalid/edge cases ---');

test('null entry', () => {
  const result = normalizeParticipatesInEntry(null);
  assertDeepEqual(result, { flow_id: null, node_id: null, role: null }, 'normalizeParticipatesInEntry(null)');
});

test('undefined entry', () => {
  const result = normalizeParticipatesInEntry(undefined);
  assertDeepEqual(result, { flow_id: null, node_id: null, role: null }, 'normalizeParticipatesInEntry(undefined)');
});

test('empty object', () => {
  const result = normalizeParticipatesInEntry({});
  assertDeepEqual(result, { flow_id: null, node_id: null, role: null }, 'normalizeParticipatesInEntry({})');
});

test('string instead of object', () => {
  const result = normalizeParticipatesInEntry('user-management.create-user');
  assertDeepEqual(result, { flow_id: null, node_id: null, role: null }, 'normalizeParticipatesInEntry(string)');
});

test('array instead of object', () => {
  const result = normalizeParticipatesInEntry(['user-management', 'create-user']);
  assertDeepEqual(result, { flow_id: null, node_id: null, role: null }, 'normalizeParticipatesInEntry(array)');
});

test('missing node_id', () => {
  const entry = { flow_id: 'user-management' };
  const result = normalizeParticipatesInEntry(entry);
  assertDeepEqual(result, { flow_id: 'user-management', node_id: null, role: null }, 'normalizeParticipatesInEntry');
});

test('missing flow_id', () => {
  const entry = { node_id: 'create-user' };
  const result = normalizeParticipatesInEntry(entry);
  assertDeepEqual(result, { flow_id: null, node_id: 'create-user', role: null }, 'normalizeParticipatesInEntry');
});

test('empty string values treated as null', () => {
  const entry = { flow_id: '', node_id: '  ' };
  const result = normalizeParticipatesInEntry(entry);
  assertDeepEqual(result, { flow_id: null, node_id: null, role: null }, 'normalizeParticipatesInEntry');
});

test('whitespace trimming', () => {
  const entry = { flow_id: '  user-management  ', node_id: '  create-user  ' };
  const result = normalizeParticipatesInEntry(entry);
  assertDeepEqual(result, { flow_id: 'user-management', node_id: 'create-user', role: null }, 'normalizeParticipatesInEntry');
});

// =============================================================================
// Summary
// =============================================================================

console.log('\n========================================');
console.log(`  Passed: ${results.passed}`);
console.log(`  Failed: ${results.failed}`);
console.log('========================================');

if (results.failed > 0) {
  console.error('\nFailed tests:');
  for (const { description, error } of results.errors) {
    console.error(`  - ${description}: ${error}`);
  }
  process.exit(1);
}

console.log('\n✓ All participates_in tests passed');

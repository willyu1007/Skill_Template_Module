#!/usr/bin/env node
/**
 * Test: ID Validation
 *
 * Verifies that isValidKebabId correctly validates kebab-case IDs.
 */

import { isValidKebabId, isValidModuleId } from '../../scripts/lib/modular.mjs';

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

// =============================================================================
// Valid IDs
// =============================================================================

console.log('\n--- Valid kebab-case IDs ---');

const validIds = [
  'a',                      // Single character
  'ab',                     // Two characters
  'abc',                    // Short
  'user-api',               // Typical
  'billing-service',        // Typical
  'auth-module',            // Typical
  'my-module-123',          // With numbers
  'api-v2',                 // With version number
  'a1',                     // Letter + number
  '1a',                     // Number + letter
  '123',                    // Pure numbers
  'a-b-c-d-e',              // Multiple segments
  'user-management',        // Two words
  'order-fulfillment',      // Two words
  'create-and-retrieve-user', // Multiple words
];

for (const id of validIds) {
  test(`"${id}" should be valid`, () => {
    assertEqual(isValidKebabId(id), true, `isValidKebabId("${id}")`);
  });
}

// =============================================================================
// Invalid IDs
// =============================================================================

console.log('\n--- Invalid kebab-case IDs ---');

const invalidIds = [
  { id: 'User-Api', reason: 'uppercase' },
  { id: 'USER-API', reason: 'all uppercase' },
  { id: 'user_api', reason: 'underscore' },
  { id: 'user.api', reason: 'dot' },
  { id: 'user-', reason: 'trailing hyphen' },
  { id: '-user', reason: 'leading hyphen' },
  { id: 'user--api', reason: 'double hyphen' },
  { id: '', reason: 'empty string' },
  { id: ' ', reason: 'whitespace only' },
  { id: 'user api', reason: 'space' },
  { id: 'user\tapi', reason: 'tab' },
  { id: 'user\napi', reason: 'newline' },
  { id: 'user@api', reason: 'special character @' },
  { id: 'user#api', reason: 'special character #' },
  { id: 'user/api', reason: 'slash' },
  { id: 'user\\api', reason: 'backslash' },
  { id: 'a'.repeat(65), reason: 'too long (65 chars)' },
  { id: 'a'.repeat(100), reason: 'way too long (100 chars)' },
];

for (const { id, reason } of invalidIds) {
  test(`"${id.slice(0, 20)}${id.length > 20 ? '...' : ''}" should be invalid (${reason})`, () => {
    assertEqual(isValidKebabId(id), false, `isValidKebabId("${id}")`);
  });
}

// =============================================================================
// Type safety
// =============================================================================

console.log('\n--- Type safety ---');

test('null should be invalid', () => {
  assertEqual(isValidKebabId(null), false, 'isValidKebabId(null)');
});

test('undefined should be invalid', () => {
  assertEqual(isValidKebabId(undefined), false, 'isValidKebabId(undefined)');
});

test('number should be invalid', () => {
  assertEqual(isValidKebabId(123), false, 'isValidKebabId(123)');
});

test('array should be invalid', () => {
  assertEqual(isValidKebabId(['user-api']), false, 'isValidKebabId(["user-api"])');
});

test('object should be invalid', () => {
  assertEqual(isValidKebabId({ id: 'user-api' }), false, 'isValidKebabId({...})');
});

// =============================================================================
// isValidModuleId should behave same as isValidKebabId
// =============================================================================

console.log('\n--- isValidModuleId compatibility ---');

test('isValidModuleId should accept valid kebab-case', () => {
  assertEqual(isValidModuleId('user-api'), true, 'isValidModuleId("user-api")');
});

test('isValidModuleId should reject dot notation (old format)', () => {
  assertEqual(isValidModuleId('billing.api'), false, 'isValidModuleId("billing.api")');
});

test('isValidModuleId should reject underscore notation', () => {
  assertEqual(isValidModuleId('user_api'), false, 'isValidModuleId("user_api")');
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

console.log('\n✓ All ID validation tests passed');

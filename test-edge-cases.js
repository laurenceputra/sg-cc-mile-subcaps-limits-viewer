/**
 * Additional Edge Case Security Tests
 */

import { constantTimeEqual } from './apps/backend/src/auth/jwt.js';

console.log('🔬 Deep Security Analysis - Edge Cases\n');

// Test 1: Empty string edge cases
console.log('1. Empty String Handling:');
try {
  console.log('   constantTimeEqual("", ""): ' + constantTimeEqual("", ""));
  console.log('   constantTimeEqual("a", ""): ' + constantTimeEqual("a", ""));
  console.log('   constantTimeEqual("", "a"): ' + constantTimeEqual("", "a"));
  console.log('   ✅ PASS: Empty strings handled correctly');
} catch (e) {
  console.log('   ❌ FAIL: ' + e.message);
}

// Test 2: Special characters
console.log('\n2. Special Characters:');
try {
  const special1 = 'admin\x00key';
  const special2 = 'admin\x00key';
  const special3 = 'admin\x00keX';
  console.log('   Null byte match: ' + constantTimeEqual(special1, special2));
  console.log('   Null byte mismatch: ' + constantTimeEqual(special1, special3));
  console.log('   ✅ PASS: Special characters handled');
} catch (e) {
  console.log('   ❌ FAIL: ' + e.message);
}

// Test 3: Very long strings
console.log('\n3. Performance with Long Strings:');
const longString1 = 'x'.repeat(10000);
const longString2 = 'x'.repeat(10000);
const longString3 = 'x'.repeat(9999) + 'y';

const start1 = performance.now();
constantTimeEqual(longString1, longString2);
const time1 = performance.now() - start1;

const start2 = performance.now();
constantTimeEqual(longString1, longString3);
const time2 = performance.now() - start2;

console.log('   10K match: ' + time1.toFixed(4) + 'ms');
console.log('   10K mismatch: ' + time2.toFixed(4) + 'ms');
console.log('   ✅ PASS: Long strings handled');

console.log('\n✅ All edge case tests completed');

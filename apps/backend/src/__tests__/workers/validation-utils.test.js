import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEmail, isDisposableEmail, validateInput, sanitizeString } from '../../middleware/validation.js';

describe('validation utils', () => {
  it('normalizes emails and blocks disposable domains', () => {
    assert.equal(normalizeEmail(' TEST@Example.COM '), 'test@example.com');
    assert.equal(isDisposableEmail('user@tempmail.com'), true);
    assert.equal(isDisposableEmail('user@domain.com'), false);
  });

  it('validates encrypted data and device ids', () => {
    const encryptedError = validateInput({ iv: 'a', ciphertext: 'b', tag: 123 }, 'encryptedData');
    assert.strictEqual(typeof encryptedError, 'string', 'should return error string for invalid encrypted data');
    assert.match(encryptedError, /tag/, 'error should mention the invalid tag field');

    assert.equal(validateInput('device-123', 'deviceId'), null);
    assert.equal(validateInput('device 123', 'deviceId'), 'Invalid device ID format');
  });

  it('sanitizes control characters and trims', () => {
    const result = sanitizeString('  hello\u0000world  ');
    assert.equal(result, 'helloworld');
  });
});

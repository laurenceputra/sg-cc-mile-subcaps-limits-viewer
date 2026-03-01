import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { constantTimeEqual } from '../../auth/jwt.js';

describe('jwt utils', () => {
  it('compares strings in constant time logic', () => {
    assert.equal(constantTimeEqual('abc', 'abc'), true);
    assert.equal(constantTimeEqual('abc', 'abd'), false);
    assert.equal(constantTimeEqual('short', 'longer'), false);
  });
});

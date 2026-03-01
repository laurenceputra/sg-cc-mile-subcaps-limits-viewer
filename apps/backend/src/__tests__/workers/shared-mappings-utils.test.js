import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMerchant } from '../../lib/merchant-normalization.js';

describe('shared mappings utils', () => {
  it('normalizes merchant names', () => {
    assert.equal(normalizeMerchant('  Cafe--Mocha!!  '), 'cafe--mocha');
    assert.equal(normalizeMerchant('SOME   STORE   NAME'), 'some store name');
  });
});

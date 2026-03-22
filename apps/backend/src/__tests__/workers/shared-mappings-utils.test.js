import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMerchant } from '../../lib/merchant-normalization.js';
import {
  isAllowedSharedMappingCardType,
  normalizeSharedMappingCardType
} from '../../lib/shared-mapping-card-type.js';

describe('shared mappings utils', () => {
  it('normalizes merchant names', () => {
    assert.equal(normalizeMerchant('  Cafe--Mocha!!  '), 'cafe--mocha');
    assert.equal(normalizeMerchant('SOME   STORE   NAME'), 'some store name');
  });

  it('normalizes and validates supported card types', () => {
    assert.equal(normalizeSharedMappingCardType(' one '), 'ONE');
    assert.equal(isAllowedSharedMappingCardType('lady'), true);
    assert.equal(isAllowedSharedMappingCardType('foo'), false);
  });
});

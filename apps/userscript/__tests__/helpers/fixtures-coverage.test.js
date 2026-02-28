import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { makeUobTransactionCellValues, makeMaybankTransactionCellValues, makeParsedTransaction } from './dom-fixtures.js';
import { loadExports, resetExportsCache } from './load-userscript-exports.js';

describe('test helper coverage', () => {
  it('covers dom fixtures defaults and overrides', () => {
    const uobDefault = makeUobTransactionCellValues();
    assert.equal(uobDefault.amountText, '10.00');
    const uobCustom = makeUobTransactionCellValues({ amountDollars: '12', amountCents: '34', refNo: 'REF99' });
    assert.equal(uobCustom.amountText, '12.34');
    assert.equal(uobCustom.refNo, 'REF99');

    const maybankDefault = makeMaybankTransactionCellValues();
    assert.match(maybankDefault.description, /GRAB/, 'default Maybank description should contain GRAB');
    const maybankCustom = makeMaybankTransactionCellValues({ description: 'TEST', amountText: '-SGD 1.00' });
    assert.equal(maybankCustom.description, 'TEST');
    assert.equal(maybankCustom.amountText, '-SGD 1.00');

    const parsed = makeParsedTransaction({ amount_value: 42, ref_no: 'REF42' });
    assert.equal(parsed.amount_value, 42);
    assert.equal(parsed.ref_no, 'REF42');
  });

  it('covers loadExports cache reset', async () => {
    const first = await loadExports();
    assert.strictEqual(typeof first, 'object', 'loadExports should return an object');
    assert.notEqual(first, null, 'loadExports should not return null');
    resetExportsCache();
    const second = await loadExports();
    assert.strictEqual(typeof second, 'object', 'loadExports after reset should return an object');
    assert.notEqual(second, null, 'loadExports after reset should not return null');
  });
});

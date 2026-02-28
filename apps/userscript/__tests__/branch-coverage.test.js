import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadExports } from './helpers/load-userscript-exports.js';

function makeAmountCell({ dollarsText = '12', centsText = '34', useSpan = true, includeTextNode = true } = {}) {
  const textNode = { nodeType: 3, textContent: dollarsText };
  const centsSpan = { textContent: centsText };
  const amountSpan = {
    textContent: `${dollarsText}${centsText}`,
    childNodes: includeTextNode ? [textNode, centsSpan] : [centsSpan],
    querySelector: () => centsSpan
  };
  return {
    textContent: `${dollarsText}${centsText}`,
    querySelector: () => (useSpan ? amountSpan : null)
  };
}

function makeRow(cells) {
  return { querySelectorAll: () => cells };
}

describe('branch coverage helpers', () => {
  it('covers normalization and amount parsing branches', async () => {
    const exports = await loadExports();
    assert.equal(exports.normalizeRefNo('Ref No: 123'), '123');
    assert.equal(exports.normalizeRefNo(''), '');
    assert.equal(exports.parseAmount('SGD 12.34'), 12.34);
    assert.equal(exports.parseAmount(''), null);
    assert.equal(exports.parseAmount('abc'), null);
    assert.deepEqual(exports.extractDollarsAndCents(null), { dollarsText: '', centsText: '', amountText: '' });

    const withSpan = exports.extractDollarsAndCents(makeAmountCell({ useSpan: true, includeTextNode: true }));
    assert.equal(withSpan.amountText, '1234');
    const noSpan = exports.extractDollarsAndCents(makeAmountCell({ useSpan: false }));
    assert.equal(noSpan.amountText, '1234');
    const noTextNode = exports.extractDollarsAndCents(makeAmountCell({ useSpan: true, includeTextNode: false }));
    assert.equal(noTextNode.amountText, '1234');
  });

  it('covers category option branches', async () => {
    const exports = await loadExports();
    const cardSettings = { selectedCategories: ['Dining', ''] };
    assert.deepEqual(exports.getSelectedCategories(cardSettings), ['Dining', '']);
    assert.deepEqual(exports.getDefaultCategoryOptions(cardSettings), ['Dining', 'Others']);
    assert.deepEqual(exports.getMappingOptions(cardSettings, 'Travel'), ['Dining', 'Others', 'Travel']);
  });

  it('covers buildTransactions early exits and fallbacks', async () => {
    const exports = await loadExports();
    const cardSettings = { defaultCategory: 'Others', merchantMap: {} };

    const rowTooShort = makeRow([{ textContent: '' }]);
    const prevBalanceRow = makeRow([
      { textContent: '' },
      { textContent: '' },
      { innerText: 'Previous Balance', textContent: 'Previous Balance' },
      makeAmountCell()
    ]);
    const missingRefRow = makeRow([
      { textContent: '01 Jan 2024' },
      { textContent: '02 Jan 2024' },
      { innerText: 'Merchant Only', textContent: 'Merchant Only' },
      makeAmountCell()
    ]);
    const invalidAmountRow = makeRow([
      { textContent: '01 Jan 2024' },
      { textContent: '02 Jan 2024' },
      { innerText: 'Merchant\nRef No: 123', textContent: 'Merchant\nRef No: 123' },
      { querySelector: () => null, textContent: 'SGD BAD' }
    ]);

    const tbody = {
      querySelectorAll: () => [rowTooShort, prevBalanceRow, missingRefRow, invalidAmountRow]
    };

    const result = exports.buildTransactions(tbody, 'UOB', cardSettings);
    assert.equal(result.transactions.length, 1, 'should produce exactly 1 valid transaction');
    assert.equal(result.diagnostics.skipped_rows, 2, 'should skip 2 rows (too short + Previous Balance)');
    assert.equal(result.diagnostics.missing_ref_no, 1, 'should flag 1 row with missing ref_no');
    assert.equal(result.diagnostics.invalid_amount, 1, 'should flag 1 row with invalid amount');
  });

  it('covers buildMaybankTransactions branches', async () => {
    const exports = await loadExports();
    const cardSettings = { defaultCategory: 'Others', merchantMap: {} };

    const nonDebitRow = makeRow([
      { textContent: '01 Jan 2024' },
      { textContent: 'ignored' },
      { textContent: 'GRAB* TRANSPORT SGP' },
      { textContent: 'SGD 15.00' }
    ]);
    const invalidAmountRow = makeRow([
      { textContent: '01 Jan 2024' },
      { textContent: 'ignored' },
      { textContent: 'GRAB* TRANSPORT SGP' },
      { textContent: '-SGD BAD' }
    ]);
    const invalidDateRow = makeRow([
      { textContent: '99 Foo 2024' },
      { textContent: 'ignored' },
      { textContent: 'GRAB* TRANSPORT SGP' },
      { textContent: '-SGD 10.00' }
    ]);
    const validRow = makeRow([
      { textContent: '01 Jan 2024' },
      { textContent: 'ignored' },
      { textContent: 'GRAB* TRANSPORT SGP' },
      { textContent: '-SGD 15.00' }
    ]);

    const tbody = {
      querySelectorAll: () => [nonDebitRow, invalidAmountRow, invalidDateRow, validRow]
    };

    const result = exports.buildMaybankTransactions(tbody, 'XL Rewards Card', cardSettings);
    assert.equal(result.transactions.length, 1, 'should produce exactly 1 valid Maybank transaction');
    assert.equal(result.diagnostics.non_debit_rows, 1, 'should flag 1 non-debit row');
    assert.equal(result.diagnostics.invalid_amount, 1, 'should flag 1 row with invalid amount');
    assert.equal(result.diagnostics.invalid_posting_date, 1, 'should flag 1 row with invalid posting date');
  });
});

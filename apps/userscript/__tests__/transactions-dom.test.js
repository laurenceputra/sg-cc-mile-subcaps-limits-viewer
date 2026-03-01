// targets: transaction builders and summary wiring to cover parsing branches.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadExports } from './helpers/load-userscript-exports.js';

const exports = await loadExports();

function makeCell(text) {
  return {
    textContent: text,
    innerText: text,
    querySelector: () => null,
    querySelectorAll: () => []
  };
}

function makeRow(cells) {
  return {
    querySelectorAll: () => cells
  };
}

function makeTbody(rows) {
  return {
    querySelectorAll: () => rows
  };
}

describe('transaction DOM builders', () => {
  it('buildTransactions parses UOB rows and records diagnostics', () => {
    const cardSettings = { defaultCategory: 'Others', merchantMap: {}, transactions: {} };
    const rows = [
      makeRow([makeCell('01 Jan 2024'), makeCell('30 Dec 2023'), makeCell('STARBUCKS\nREF001'), makeCell('12.50')]),
      makeRow([makeCell(''), makeCell(''), makeCell('Previous Balance'), makeCell('0.00')]),
      makeRow([makeCell('01 Jan 2024')])
    ];
    const tbody = makeTbody(rows);
    const result = exports.buildTransactions(tbody, "LADY'S SOLITAIRE CARD", cardSettings);
    assert.equal(result.transactions.length, 1);
    assert.equal(result.diagnostics.skipped_rows, 2, 'should skip non-debit and short rows');
    assert.equal(result.diagnostics.missing_ref_no, 0);
  });

  it('buildMaybankTransactions skips non-debit and invalid rows', () => {
    const cardSettings = { defaultCategory: 'Others', merchantMap: {} };
    const rows = [
      makeRow([makeCell('01 Jan 2024'), makeCell('x'), makeCell('GRAB SGP'), makeCell('-SGD 10.00')]),
      makeRow([makeCell('01 Jan 2024'), makeCell('x'), makeCell('GRAB SGP'), makeCell('SGD 10.00')]),
      makeRow([makeCell('bad-date'), makeCell('x'), makeCell('GRAB SGP'), makeCell('-SGD 10.00')])
    ];
    const tbody = makeTbody(rows);
    const result = exports.buildMaybankTransactions(tbody, 'XL Rewards Card', cardSettings);
    assert.equal(result.transactions.length, 1);
    assert.equal(result.diagnostics.non_debit_rows, 1);
    assert.equal(result.diagnostics.invalid_posting_date, 1);
  });

  it('buildData wires summary and selected categories', () => {
    const cardSettings = { defaultCategory: 'Others', selectedCategories: ['Dining', ''], merchantMap: {}, transactions: {} };
    const rows = [
      makeRow([makeCell('01 Jan 2024'), makeCell('30 Dec 2023'), makeCell('STARBUCKS\nREF001'), makeCell('12.50')])
    ];
    const tbody = makeTbody(rows);
    const data = exports.buildData(tbody, "LADY'S SOLITAIRE CARD", cardSettings);
    assert.equal(data.card_name, "LADY'S SOLITAIRE CARD");
    assert.equal(data.summary.total_amount, 12.5);
    assert.deepEqual(data.selected_categories, ['Dining']);
  });
});

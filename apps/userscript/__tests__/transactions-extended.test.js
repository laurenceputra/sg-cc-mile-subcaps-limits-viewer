// targets: parse/extract merchant info and buildTransactions diagnostics.
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { loadExports } from './helpers/load-userscript-exports.js';
import { snapshotGlobals, restoreGlobals } from './helpers/reset-globals.js';

const exports = await loadExports();

function makeCell(text, opts = {}) {
  const nodeList = opts.childNodes || [];
  return {
    textContent: text,
    innerText: text,
    childNodes: nodeList,
    querySelector: (selector) => {
      if (selector === 'span') {
        return opts.span || null;
      }
      return null;
    },
    querySelectorAll: () => []
  };
}

function makeRow(cells) {
  return { querySelectorAll: () => cells };
}

function makeTbody(rows) {
  return { querySelectorAll: () => rows };
}

describe('transaction parsing extended', () => {
  let snapshot;
  beforeEach(() => {
    snapshot = snapshotGlobals();
  });
  afterEach(() => {
    restoreGlobals(snapshot);
  });
  it('extractDollarsAndCents handles nested spans', () => {
    globalThis.Node = { TEXT_NODE: 3 };
    const cents = { textContent: '50' };
    const amountSpan = {
      childNodes: [{ nodeType: Node.TEXT_NODE, textContent: '12.' }],
      querySelector: () => cents,
      textContent: '12.50'
    };
    const cell = makeCell('', { span: amountSpan });
    const result = exports.extractDollarsAndCents(cell);
    assert.equal(result.dollarsText, '12.');
    assert.equal(result.centsText, '50');
    assert.equal(result.amountText, '12.50');
  });

  it('buildTransactions tracks missing ref and invalid values', () => {
    const cardSettings = { defaultCategory: 'Others', merchantMap: {}, transactions: {} };
    const rows = [
      makeRow([makeCell('01 Jan 2024'), makeCell('30 Dec 2023'), makeCell('STARBUCKS\n'), makeCell('SGD 10.00')]),
      makeRow([makeCell('bad-date'), makeCell('30 Dec 2023'), makeCell('STARBUCKS\nREF999'), makeCell('SGD 10.00')]),
      makeRow([makeCell('01 Jan 2024'), makeCell('30 Dec 2023'), makeCell('STARBUCKS\nREF001'), makeCell('SGD XX')])
    ];
    const tbody = makeTbody(rows);
    const result = exports.buildTransactions(tbody, "LADY'S SOLITAIRE CARD", cardSettings);

    assert.equal(result.transactions.length, 2);
    assert.equal(result.diagnostics.missing_ref_no, 1);
    assert.equal(result.diagnostics.invalid_posting_date, 1);
    assert.equal(result.diagnostics.invalid_amount, 1);
  });
});

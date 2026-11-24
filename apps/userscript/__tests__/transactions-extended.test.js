import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadExports } from './helpers/load-userscript-exports.js';
import { uobRow } from './helpers/uob-fixtures.js';

const helpers = await loadExports();
const settings = { defaultCategory: 'Others', merchantMap: {}, transactions: {} };
const parse = (rows) => helpers.buildTransactions({ querySelectorAll: () => rows }, "LADY'S SOLITAIRE CARD", settings);

describe('UOB SPA posted transactions', () => {
  it('uses the posting date, real reference string and inverted purchase sign', () => {
    const { transactions } = parse([uobRow()]);
    assert.equal(transactions.length, 1);
    assert.equal(transactions[0].posting_date_iso, '2026-08-08');
    assert.equal(transactions[0].transaction_date, '05 Aug 2026');
    assert.equal(transactions[0].ref_no, '90000000000000000000001');
    assert.equal(transactions[0].merchant_detail, 'NTUC FairPrice App Pay SINGAPORE SG');
    assert.equal(transactions[0].amount_value, 17.33);
  });

  it('excludes payments and pending/missing posting dates before reference checks', () => {
    const result = parse([
      uobRow({ transactionDate: '23 Jul 2026', postingDate: '23 Jul 2026', merchant: 'PAYMT THRU E-BANK/HOMEB/CYBERB (EP09)', ref: '', amount: '+1,693.52 SGD' }),
      uobRow({ transactionDate: '03 Oct 2026', postingDate: '', merchant: 'NTUC FairPrice App Pay Singapore SGP', status: 'Pending', ref: '', amount: '-23.78 SGD' }),
      uobRow({ postingDate: '', ref: '' })
    ]);
    assert.equal(result.transactions.length, 0);
    assert.equal(result.diagnostics.skipped_rows, 3);
    assert.equal(result.diagnostics.missing_ref_no, 0);
  });

  it('retains generic referenced merchant credits as negative spend', () => {
    const result = parse([uobRow({ merchant: 'MERCHANT CREDIT', amount: '+17.33 SGD' })]);
    assert.equal(result.transactions[0].amount_value, -17.33);
    assert.equal(helpers.calculateSummary(result.transactions, settings).total_amount, -17.33);
  });

  it('diagnoses missing refs and invalid posted values without synthetic IDs', () => {
    const result = parse([uobRow({ ref: '' }), uobRow({ postingDate: 'bad-date' }), uobRow({ amount: 'SGD XX' })]);
    assert.equal(result.transactions.length, 0);
    assert.equal(result.diagnostics.missing_ref_no, 1);
    assert.equal(result.diagnostics.invalid_posting_date, 1);
    assert.equal(result.diagnostics.invalid_amount, 1);
  });
});

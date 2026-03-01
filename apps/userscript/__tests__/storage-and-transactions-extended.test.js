import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadExports } from './helpers/load-userscript-exports.js';

const exports = await loadExports();

describe('storage + transactions (extended)', () => {
  it('updateStoredTransactions keeps only recent transactions', () => {
    const now = new Date();
    const older = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const oldIso = exports.toISODate(older);
    const recentIso = exports.toISODate(now);

    const settings = {
      cards: {
        "LADY'S SOLITAIRE CARD": {
          selectedCategories: [],
          defaultCategory: 'Others',
          merchantMap: {},
          transactions: {
            old: { ref_no: 'old', posting_date_iso: oldIso, amount_text: '10', merchant_detail: 'OLD' },
            recent: { ref_no: 'recent', posting_date_iso: recentIso, amount_text: '20', merchant_detail: 'NEW' }
          }
        }
      }
    };

    const newTx = [{
      ref_no: 'new',
      posting_date_iso: recentIso,
      posting_date: recentIso,
      transaction_date: '',
      merchant_detail: 'LATEST',
      amount_text: '30',
      amount_value: 30,
      category: 'Dining'
    }];

    exports.updateStoredTransactions(
      settings,
      "LADY'S SOLITAIRE CARD",
      exports.CARD_CONFIGS["LADY'S SOLITAIRE CARD"],
      newTx
    );

    const stored = settings.cards["LADY'S SOLITAIRE CARD"].transactions;
    assert.equal(stored.old, undefined, 'old transaction should be pruned beyond cutoff');
    assert.notEqual(stored.recent, undefined, 'recent transaction should be kept');
    assert.notEqual(stored.new, undefined, 'new transaction should be kept');
  });

  it('getStoredTransactions dedupes by ref_no and prefers newest', () => {
    const cardSettings = {
      defaultCategory: 'Others',
      merchantMap: {},
      transactions: {
        ref1: { ref_no: 'ref1', posting_date_iso: '2024-01-01', merchant_detail: 'A', amount_text: '10' },
        ref1b: { ref_no: 'ref1', posting_date_iso: '2024-02-01', merchant_detail: 'A', amount_text: '10' }
      }
    };

    const stored = exports.getStoredTransactions("LADY'S SOLITAIRE CARD", cardSettings);
    assert.equal(stored.length, 1);
    assert.equal(stored[0].posting_date_iso, '2024-02-01');
  });

  it('calculateMonthlyTotals aggregates by month and category', () => {
    const transactions = [
      { posting_month: '2024-01', amount_value: 10, category: 'Dining' },
      { posting_month: '2024-01', amount_value: 5, category: 'Dining' },
      { posting_month: '2024-01', amount_value: 2, category: 'Travel' }
    ];
    const totals = exports.calculateMonthlyTotals(transactions, { defaultCategory: 'Others' });
    assert.equal(totals['2024-01'].totals.Dining, 15);
    assert.equal(totals['2024-01'].totals.Travel, 2);
  });

  it('buildFallbackData returns empty diagnostics for maybank card', () => {
    const data = exports.buildFallbackData('XL Rewards Card', { defaultCategory: 'Others', selectedCategories: [] });
    assert.equal(data.diagnostics.non_debit_rows, 0);
    assert.equal(data.transactions.length, 0);
  });
});

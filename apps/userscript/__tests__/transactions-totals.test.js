import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadExports, normalizeValue } from './helpers/load-userscript-exports.js';
import { makeParsedTransaction } from './helpers/dom-fixtures.js';

describe('transactions and totals helpers', () => {
  // ── hashFNV1a ────────────────────────────────────────────────────────────

  describe('hashFNV1a', () => {
    it('returns 8-character hex string', async () => {
      const { hashFNV1a } = await loadExports();
      const result = hashFNV1a('hello');
      assert.match(result, /^[0-9a-f]{8}$/);
    });

    it('is deterministic for same input', async () => {
      const { hashFNV1a } = await loadExports();
      assert.equal(hashFNV1a('test-input'), hashFNV1a('test-input'));
    });

    it('produces different hashes for different inputs', async () => {
      const { hashFNV1a } = await loadExports();
      assert.notEqual(hashFNV1a('inputA'), hashFNV1a('inputB'));
    });

    it('handles empty string', async () => {
      const { hashFNV1a } = await loadExports();
      const result = hashFNV1a('');
      assert.match(result, /^[0-9a-f]{8}$/);
    });

    it('handles null and undefined', async () => {
      const { hashFNV1a } = await loadExports();
      const r1 = hashFNV1a(null);
      const r2 = hashFNV1a(undefined);
      assert.match(r1, /^[0-9a-f]{8}$/);
      assert.match(r2, /^[0-9a-f]{8}$/);
    });
  });

  // ── buildMaybankSyntheticRefNo ───────────────────────────────────────────

  describe('buildMaybankSyntheticRefNo', () => {
    it('returns deterministic ref for same inputs', async () => {
      const { buildMaybankSyntheticRefNo } = await loadExports();
      const ref1 = buildMaybankSyntheticRefNo('2024-01-01', 'GRAB TRANSPORT SGP', 15.5);
      const ref2 = buildMaybankSyntheticRefNo('2024-01-01', 'GRAB TRANSPORT SGP', 15.5);
      assert.equal(ref1, ref2);
    });

    it('format is MB:<date>:<amount>:<hash>', async () => {
      const { buildMaybankSyntheticRefNo } = await loadExports();
      const ref = buildMaybankSyntheticRefNo('2024-01-01', 'STARBUCKS', 12.0);
      assert.match(ref, /^MB:2024-01-01:12\.00:[0-9a-f]{8}$/);
    });

    it('normalizes description to uppercase', async () => {
      const { buildMaybankSyntheticRefNo } = await loadExports();
      const upper = buildMaybankSyntheticRefNo('2024-01-01', 'GRAB FOOD', 10.0);
      const lower = buildMaybankSyntheticRefNo('2024-01-01', 'grab food', 10.0);
      assert.equal(upper, lower);
    });

    it('different amounts produce different refs', async () => {
      const { buildMaybankSyntheticRefNo } = await loadExports();
      const r1 = buildMaybankSyntheticRefNo('2024-01-01', 'MERCHANT', 10.0);
      const r2 = buildMaybankSyntheticRefNo('2024-01-01', 'MERCHANT', 20.0);
      assert.notEqual(r1, r2);
    });

    it('handles undefined amount gracefully', async () => {
      const { buildMaybankSyntheticRefNo } = await loadExports();
      const ref = buildMaybankSyntheticRefNo('2024-01-01', 'MERCHANT', undefined);
      assert.match(ref, /^MB:2024-01-01::[0-9a-f]{8}$/);
    });
  });

  // ── calculateSummary ─────────────────────────────────────────────────────

  describe('calculateSummary', () => {
    it('sums amounts by category', async () => {
      const { calculateSummary } = await loadExports();
      const transactions = [
        makeParsedTransaction({ amount_value: 12.5, category: 'Dining' }),
        makeParsedTransaction({ amount_value: 5.0, category: 'Dining' }),
        makeParsedTransaction({ amount_value: 30.0, category: 'Travel' })
      ];
      const result = calculateSummary(transactions, { defaultCategory: 'Others' });
      assert.equal(result.totals.Dining, 17.5);
      assert.equal(result.totals.Travel, 30.0);
      assert.equal(result.total_amount, 47.5);
      assert.equal(result.transaction_count, 3);
    });

    it('uses cardSettings.defaultCategory for uncategorized transactions', async () => {
      const { calculateSummary } = await loadExports();
      // Use a raw object so category is truly absent (not defaulted by fixture helper)
      const transactions = [{ amount_value: 10.0, posting_date_iso: '2024-01-01' }];
      const result = calculateSummary(transactions, { defaultCategory: 'Others' });
      assert.equal(result.totals.Others, 10.0);
    });

    it('skips transactions with non-numeric amount_value', async () => {
      const { calculateSummary } = await loadExports();
      const transactions = [
        makeParsedTransaction({ amount_value: 'bad', category: 'Dining' }),
        makeParsedTransaction({ amount_value: 10.0, category: 'Dining' })
      ];
      const result = calculateSummary(transactions, {});
      assert.equal(result.totals.Dining, 10.0);
      assert.equal(result.total_amount, 10.0);
      assert.equal(result.transaction_count, 2);
    });

    it('returns empty totals for empty transactions', async () => {
      const { calculateSummary } = await loadExports();
      const result = calculateSummary([], { defaultCategory: 'Others' });
      assert.deepEqual(result.totals, {});
      assert.equal(result.total_amount, 0);
      assert.equal(result.transaction_count, 0);
    });
  });

  // ── calculateMonthlyTotalsForSync ────────────────────────────────────────

  describe('calculateMonthlyTotalsForSync', () => {
    it('groups transactions by posting_month', async () => {
      const { calculateMonthlyTotalsForSync } = await loadExports();
      const transactions = [
        { posting_month: '2024-01', amount_value: 10.0, category: 'Dining' },
        { posting_month: '2024-01', amount_value: 5.0, category: 'Travel' },
        { posting_month: '2024-02', amount_value: 20.0, category: 'Dining' }
      ];
      const totals = calculateMonthlyTotalsForSync(transactions, { defaultCategory: 'Others' });
      assert.equal(totals['2024-01'].totals.Dining, 10.0);
      assert.equal(totals['2024-01'].totals.Travel, 5.0);
      assert.equal(totals['2024-01'].total_amount, 15.0);
      assert.equal(totals['2024-02'].totals.Dining, 20.0);
    });

    it('falls back to posting_date_iso for month derivation', async () => {
      const { calculateMonthlyTotalsForSync } = await loadExports();
      const transactions = [
        { posting_date_iso: '2024-03-15', amount_value: 8.0, category: 'Fashion' }
      ];
      const totals = calculateMonthlyTotalsForSync(transactions, { defaultCategory: 'Others' });
      assert.ok(totals['2024-03']);
      assert.equal(totals['2024-03'].totals.Fashion, 8.0);
    });

    it('uses defaultCategory for transactions without a category', async () => {
      const { calculateMonthlyTotalsForSync } = await loadExports();
      const transactions = [
        { posting_month: '2024-01', amount_value: 7.0 }
      ];
      const totals = calculateMonthlyTotalsForSync(transactions, { defaultCategory: 'Others' });
      assert.equal(totals['2024-01'].totals.Others, 7.0);
    });
  });

  // ── buildSyncCardSnapshot ────────────────────────────────────────────────

  describe('buildSyncCardSnapshot', () => {
    it('returns snapshot with correct defaults', async () => {
      const { buildSyncCardSnapshot } = await loadExports();
      const snapshot = buildSyncCardSnapshot('UOB', { defaultCategory: 'Travel' }, []);
      assert.equal(snapshot.defaultCategory, 'Travel');
      assert.deepEqual(normalizeValue(snapshot.selectedCategories), []);
      assert.deepEqual(normalizeValue(snapshot.monthlyTotals), {});
    });

    it('includes selectedCategories from cardSettings', async () => {
      const { buildSyncCardSnapshot } = await loadExports();
      const snapshot = buildSyncCardSnapshot(
        'UOB',
        { selectedCategories: ['Dining', 'Travel'], defaultCategory: 'Others' },
        []
      );
      assert.deepEqual(normalizeValue(snapshot.selectedCategories), ['Dining', 'Travel']);
    });

    it('computes monthly totals from provided transactions', async () => {
      const { buildSyncCardSnapshot } = await loadExports();
      const transactions = [
        { posting_month: '2024-01', amount_value: 12.5, category: 'Dining' }
      ];
      const snapshot = buildSyncCardSnapshot('UOB', { defaultCategory: 'Others' }, transactions);
      assert.equal(normalizeValue(snapshot.monthlyTotals)['2024-01'].totals.Dining, 12.5);
    });
  });

  // ── moveOthersToEnd ──────────────────────────────────────────────────────

  describe('moveOthersToEnd', () => {
    it('moves Others to last position', async () => {
      const { moveOthersToEnd } = await loadExports();
      const result = moveOthersToEnd(['Others', 'Dining', 'Travel']);
      assert.equal(result[result.length - 1], 'Others');
      assert.ok(result.indexOf('Dining') < result.indexOf('Others'));
    });

    it('does not add Others if not in input', async () => {
      const { moveOthersToEnd } = await loadExports();
      const result = moveOthersToEnd(['Dining', 'Travel']);
      assert.ok(!result.includes('Others'));
    });

    it('deduplicates categories', async () => {
      const { moveOthersToEnd } = await loadExports();
      const result = moveOthersToEnd(['Dining', 'Dining', 'Others']);
      assert.equal(result.filter((c) => c === 'Dining').length, 1);
    });

    it('filters out non-string and empty entries', async () => {
      const { moveOthersToEnd } = await loadExports();
      const result = moveOthersToEnd([null, '', 'Dining', undefined]);
      assert.deepEqual(result, ['Dining']);
    });
  });
});

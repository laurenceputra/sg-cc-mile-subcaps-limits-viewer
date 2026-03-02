import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadExports, normalizeValue } from './helpers/load-userscript-exports.js';

describe('userscript sync core', () => {
  it('derives sync totals and snapshot defaults', async () => {
    const { calculateMonthlyTotalsForSync, buildSyncCardSnapshot } = await loadExports();
    const transactions = [
      { posting_month: '2024-01', amount_value: 12.5, category: 'Dining' },
      { posting_date_iso: '2024-01-03', amount_value: 5.5 }
    ];
    const totals = calculateMonthlyTotalsForSync(transactions, { defaultCategory: 'Others' });
    assert.deepEqual(normalizeValue(totals), {
      '2024-01': {
        totals: { Dining: 12.5, Others: 5.5 },
        total_amount: 18
      }
    });

    const snapshot = buildSyncCardSnapshot('UOB', { defaultCategory: 'Travel' }, transactions);
    assert.deepEqual(normalizeValue(snapshot.monthlyTotals), {
      '2024-01': {
        totals: { Dining: 12.5, Travel: 5.5 },
        total_amount: 18
      }
    });
    assert.equal(snapshot.defaultCategory, 'Travel');
    assert.deepEqual(normalizeValue(snapshot.selectedCategories), []);
  });

  it('parses canonical and legacy payloads', async () => {
    const { parseSyncPayload } = await loadExports();
    const canonical = parseSyncPayload({
      version: 1,
      deviceId: 'device-1',
      timestamp: Date.now(),
      data: { cards: { UOB: { selectedCategories: [] } } }
    });
    assert.equal(canonical.ok, true);
    assert.equal(canonical.format, 'canonical');
    assert.deepEqual(normalizeValue(canonical.normalizedData), { cards: { UOB: { selectedCategories: [] } } });

    const legacyRoot = parseSyncPayload({ cards: { MAYBANK: { selectedCategories: ['Dining'] } } });
    assert.equal(legacyRoot.ok, true);
    assert.equal(legacyRoot.format, 'legacy-cards-root');
    assert.deepEqual(normalizeValue(legacyRoot.normalizedData), { cards: { MAYBANK: { selectedCategories: ['Dining'] } } });

    const invalid = parseSyncPayload({ version: 1, deviceId: 'device-1', data: 'nope' });
    assert.equal(invalid.ok, false);
    assert.equal(invalid.format, 'invalid');
  });
});

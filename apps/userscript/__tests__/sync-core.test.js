import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadExports, normalizeValue } from './helpers/load-userscript-exports.js';

describe('userscript sync core', () => {
  it('derives sync totals and snapshot defaults', async () => {
    const { calculateMonthlyTotalsForSync, buildSyncCardSnapshot, buildSyncCardFingerprint } = await loadExports();
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

    const fingerprintA = buildSyncCardFingerprint('UOB', { defaultCategory: 'Travel' }, transactions);
    const fingerprintB = buildSyncCardFingerprint(
      'UOB',
      { defaultCategory: 'Travel', merchantMap: {}, selectedCategories: [] },
      [
        { posting_date_iso: '2024-01-03', amount_value: 5.5 },
        { posting_month: '2024-01', amount_value: 12.5, category: 'Dining' }
      ]
    );
    assert.equal(fingerprintA, fingerprintB);
  });

  it('buildSyncCardFingerprint is stable for object key order', async () => {
    const { buildSyncCardFingerprint } = await loadExports();

    const cardSettingsA = {
      selectedCategories: ['Dining', 'Travel'],
      defaultCategory: 'Others',
      merchantMap: {
        Grab: 'Travel',
        Starbucks: 'Dining'
      }
    };
    const cardSettingsB = {
      merchantMap: {
        Starbucks: 'Dining',
        Grab: 'Travel'
      },
      defaultCategory: 'Others',
      selectedCategories: ['Dining', 'Travel']
    };

    const transactionsA = [
      { posting_month: '2024-03', amount_value: 10, category: 'Dining' },
      { posting_month: '2024-02', amount_value: 20, category: 'Travel' }
    ];
    const transactionsB = [
      { posting_month: '2024-02', amount_value: 20, category: 'Travel' },
      { posting_month: '2024-03', amount_value: 10, category: 'Dining' }
    ];

    const fingerprintA = buildSyncCardFingerprint('XL Rewards Card', cardSettingsA, transactionsA);
    const fingerprintB = buildSyncCardFingerprint('XL Rewards Card', cardSettingsB, transactionsB);
    assert.equal(fingerprintA, fingerprintB);
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

  it('syncActiveCardInBackground skips when sync is disabled or locked', async () => {
    const { syncActiveCardInBackground } = await loadExports();

    const disabledResult = await syncActiveCardInBackground(
      { isEnabled: () => false },
      'XL Rewards Card',
      {},
      []
    );
    assert.equal(disabledResult.attempted, false);
    assert.equal(disabledResult.reason, 'sync_disabled');

    const lockedResult = await syncActiveCardInBackground(
      {
        isEnabled: () => true,
        isUnlocked: () => false,
        tryUnlockFromRememberedCache: async () => false,
        sync: async () => ({ success: true })
      },
      'XL Rewards Card',
      {},
      []
    );
    assert.equal(lockedResult.attempted, false);
    assert.equal(lockedResult.reason, 'sync_locked');
  });

  it('syncActiveCardInBackground syncs active card payload after unlock', async () => {
    const { syncActiveCardInBackground } = await loadExports();
    let syncedPayload = null;
    let unlocked = false;

    const result = await syncActiveCardInBackground(
      {
        isEnabled: () => true,
        isUnlocked: () => unlocked,
        tryUnlockFromRememberedCache: async () => {
          unlocked = true;
          return true;
        },
        sync: async (payload) => {
          syncedPayload = payload;
          return { success: true };
        }
      },
      'XL Rewards Card',
      { defaultCategory: 'Others', selectedCategories: ['Local'], merchantMap: { GRAB: 'Local' } },
      [{ posting_month: '2024-02', amount_value: 12.5, category: 'Local' }]
    );

    assert.equal(result.attempted, true);
    assert.equal(result.success, true);
    assert.equal(normalizeValue(syncedPayload).cards['XL Rewards Card'].defaultCategory, 'Others');
    assert.equal(normalizeValue(syncedPayload).cards['XL Rewards Card'].monthlyTotals['2024-02'].total_amount, 12.5);
  });
});

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { loadExports } from './helpers/load-userscript-exports.js';
import { snapshotGlobals, restoreGlobals } from './helpers/reset-globals.js';

const exports = await loadExports();
const globalsSnapshot = snapshotGlobals();

afterEach(() => {
  restoreGlobals(globalsSnapshot);
});

describe('coverage helpers extended', () => {
  it('parseSyncPayload covers invalid + legacy shapes', () => {
    assert.equal(exports.parseSyncPayload(null).reason, 'payload_not_object');

    const badVersion = exports.parseSyncPayload({ version: '1', deviceId: 'dev', timestamp: Date.now(), data: { cards: {} } });
    assert.equal(badVersion.reason, 'invalid_version');

    const badDevice = exports.parseSyncPayload({ version: 1, deviceId: '', timestamp: Date.now(), data: { cards: {} } });
    assert.equal(badDevice.reason, 'invalid_device_id');

    const badTimestamp = exports.parseSyncPayload({ version: 1, deviceId: 'dev', timestamp: 0, data: { cards: {} } });
    assert.equal(badTimestamp.reason, 'invalid_timestamp');

    const badData = exports.parseSyncPayload({ version: 1, deviceId: 'dev', timestamp: Date.now(), data: [] });
    assert.equal(badData.reason, 'invalid_data_object');

    const emptyData = exports.parseSyncPayload({ version: 1, deviceId: 'dev', timestamp: Date.now(), data: {} });
    assert.equal(emptyData.format, 'legacy-empty-data-root');
    assert.deepEqual(emptyData.normalizedData, { cards: {} });

    const badCards = exports.parseSyncPayload({ version: 1, deviceId: 'dev', timestamp: Date.now(), data: { cards: [] } });
    assert.equal(badCards.reason, 'invalid_cards_object');

    const legacyCards = exports.parseSyncPayload({ cards: { UOB: { selectedCategories: [] } } });
    assert.equal(legacyCards.format, 'legacy-cards-root');

    const legacyData = exports.parseSyncPayload({ data: { cards: { UOB: { selectedCategories: [] } } } });
    assert.equal(legacyData.format, 'legacy-data-root');

    const legacyMap = exports.parseSyncPayload({
      UOB: { selectedCategories: [], defaultCategory: 'Others' },
      MAYBANK: { merchantMap: {} }
    });
    assert.equal(legacyMap.format, 'legacy-card-map-root');

    const partial = exports.parseSyncPayload({ version: 1 });
    assert.equal(partial.reason, 'partial_canonical_envelope');

    const empty = exports.parseSyncPayload({});
    assert.equal(empty.reason, 'empty_payload');

    const unrecognized = exports.parseSyncPayload({ foo: 'bar' });
    assert.equal(unrecognized.reason, 'unrecognized_payload_shape');
  });

  it('toSyncErrorMessage handles payload, crypto, and fallback paths', () => {
    const payloadError = new Error('Invalid sync payload structure');
    payloadError.name = 'SyncPayloadError';
    assert.match(exports.toSyncErrorMessage(payloadError), /Remote sync data format/, 'SyncPayloadError should mention remote data format');

    const cryptoError = new Error('Operation failed');
    cryptoError.name = 'OperationError';
    assert.match(exports.toSyncErrorMessage(cryptoError), /Unable to decrypt/, 'OperationError should mention decryption failure');

    const plainError = new Error('custom');
    assert.equal(exports.toSyncErrorMessage(plainError, 'fallback'), 'custom');
    assert.equal(exports.toSyncErrorMessage({}, 'fallback'), 'fallback');
  });

  it('validateServerUrl rejects invalid inputs and protocols', () => {
    assert.throws(() => exports.validateServerUrl(''), /required/);
    assert.throws(() => exports.validateServerUrl('not-a-url'), /Invalid URL/);
    assert.throws(() => exports.validateServerUrl('ftp://example.com'), /HTTP or HTTPS/);
    assert.doesNotThrow(() => exports.validateServerUrl('https://example.com'));
  });


  it('moveOthersToEnd and option helpers cover ordering branches', () => {
    const moved = exports.moveOthersToEnd(['Dining', 'Others', 'Dining', '', 'Travel']);
    assert.deepEqual(moved, ['Dining', 'Travel', 'Others']);

    const cardSettings = { selectedCategories: ['Dining'], defaultCategory: 'Others' };
    assert.deepEqual(exports.getDefaultCategoryOptions(cardSettings), ['Dining', 'Others']);
    assert.deepEqual(exports.getMappingOptions(cardSettings, 'Fashion'), ['Dining', 'Others', 'Fashion']);
  });

  it('buildMaybankSyntheticRefNo produces stable prefix', () => {
    const ref = exports.buildMaybankSyntheticRefNo('2024-01-01', 'Grab SGP', 12.34);
    assert.match(ref, /^MB:2024-01-01:12\.34:/, 'synthetic ref should start with MB:date:amount: prefix');
  });

  it('getActiveCardName resolves timeout path', async () => {
    globalThis.window = {
      setTimeout: (fn) => fn(),
      clearTimeout: () => {},
      getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' })
    };
    globalThis.MutationObserver = class { observe() {} disconnect() {} };
    globalThis.document.evaluate = () => ({ singleNodeValue: null });
    const result = await exports.getActiveCardName({ cardNameXPaths: ['//missing'] }, { waitTimeoutMs: 1 });
    assert.equal(result.name, '');
  });
});

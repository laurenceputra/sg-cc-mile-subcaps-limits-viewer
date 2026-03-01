import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadExports, normalizeValue } from './helpers/load-userscript-exports.js';
import { makeMemoryStorage } from './helpers/test-doubles.js';

// ── helpers ──────────────────────────────────────────────────────────────────

function makeApiClient(overrides = {}) {
  return {
    token: null,
    setToken(t) { this.token = t; },
    async getSyncData() { return overrides.getSyncData ? overrides.getSyncData() : null; },
    async putSyncData(data, version) {
      return overrides.putSyncData ? overrides.putSyncData(data, version) : { version };
    }
  };
}

function makeCrypto(overrides = {}) {
  return {
    async decrypt(ciphertext, iv, salt) {
      if (overrides.decrypt) return overrides.decrypt(ciphertext, iv, salt);
      // Passthrough: ciphertext is a JSON-stringified object encoded as base64 → return parsed object
      return JSON.parse(Buffer.from(ciphertext, 'base64').toString('utf8'));
    },
    async encrypt(payload) {
      if (overrides.encrypt) return overrides.encrypt(payload);
      const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
      return { ciphertext: encoded, iv: 'test-iv', salt: 'test-salt' };
    }
  };
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('SyncEngine', () => {
  // ── pull ─────────────────────────────────────────────────────────────────

  describe('pull', () => {
    it('covers empty, canonical, legacy, and failure paths', async () => {
      const { SyncEngine } = await loadExports();
      const cases = [
        {
          name: 'empty-response',
          api: makeApiClient({ getSyncData: async () => null }),
          crypto: makeCrypto(),
          assert: (result) => {
            assert.equal(result.success, true);
            assert.equal(result.data, null);
            assert.equal(result.version, 0);
          }
        },
        {
          name: 'missing-encrypted-data',
          api: makeApiClient({ getSyncData: async () => ({ version: 1 }) }),
          crypto: makeCrypto(),
          assert: (result) => {
            assert.equal(result.success, true);
            assert.equal(result.data, null);
          }
        },
        {
          name: 'canonical-payload',
          api: makeApiClient({
            getSyncData: async () => ({
              version: 1,
              encryptedData: {
                ciphertext: Buffer.from(JSON.stringify({
                  version: 1,
                  deviceId: 'dev-1',
                  timestamp: Date.now(),
                  data: { cards: { UOB: { selectedCategories: ['Dining'] } } }
                }), 'utf8').toString('base64'),
                iv: 'iv',
                salt: 'salt'
              }
            })
          }),
          crypto: makeCrypto(),
          assert: (result) => {
            assert.equal(result.success, true);
            assert.deepEqual(
              normalizeValue(result.data),
              { cards: { UOB: { selectedCategories: ['Dining'] } } }
            );
          }
        },
        {
          name: 'decrypt-fails',
          api: makeApiClient({
            getSyncData: async () => ({
              version: 1,
              encryptedData: { ciphertext: 'bad', iv: 'iv', salt: 'salt' }
            })
          }),
          crypto: makeCrypto({
            decrypt: async () => {
              const err = new Error('Operation failed');
              err.name = 'OperationError';
              throw err;
            }
          }),
          assert: (result) => {
            assert.equal(result.success, false);
            assert.strictEqual(typeof result.error, 'string', 'decrypt failure should return error string');
          }
        },
        {
          name: 'invalid-json',
          api: makeApiClient({
            getSyncData: async () => ({
              version: 1,
              encryptedData: {
                ciphertext: Buffer.from('not-json', 'utf8').toString('base64'),
                iv: 'iv',
                salt: 'salt'
              }
            })
          }),
          crypto: makeCrypto(),
          assert: (result) => {
            assert.equal(result.success, false);
          }
        },
        {
          name: 'legacy-cards-root',
          api: makeApiClient({
            getSyncData: async () => ({
              version: 2,
              encryptedData: {
                ciphertext: Buffer.from(JSON.stringify({
                  cards: { MAYBANK: { selectedCategories: ['Dining'] } }
                }), 'utf8').toString('base64'),
                iv: 'iv',
                salt: 'salt'
              }
            })
          }),
          crypto: makeCrypto(),
          assert: (result) => {
            assert.equal(result.success, true);
            assert.deepEqual(
              normalizeValue(result.data),
              { cards: { MAYBANK: { selectedCategories: ['Dining'] } } }
            );
          }
        }
      ];

      for (const testCase of cases) {
        const engine = new SyncEngine(testCase.api, testCase.crypto, makeMemoryStorage());
        const result = await engine.pull();
        testCase.assert(result);
      }
    });
  });

  // ── push ─────────────────────────────────────────────────────────────────

  describe('push', () => {
    it('covers success and failure paths', async () => {
      const { SyncEngine } = await loadExports();
      const cases = [
        {
          name: 'success',
          api: makeApiClient({ putSyncData: async (_data, version) => ({ version }) }),
          crypto: makeCrypto(),
          assert: (result) => {
            assert.equal(result.success, true);
            assert.equal(result.version, 4);
          }
        },
        {
          name: 'encrypt-fails',
          api: makeApiClient(),
          crypto: makeCrypto({ encrypt: async () => { throw new Error('Encrypt failed'); } }),
          assert: (result) => {
            assert.equal(result.success, false);
            assert.strictEqual(typeof result.error, 'string', 'encrypt failure should return error string');
          }
        },
        {
          name: 'putSyncData-fails',
          api: makeApiClient({ putSyncData: async () => { throw new Error('Network error'); } }),
          crypto: makeCrypto(),
          assert: (result) => {
            assert.equal(result.success, false);
          }
        }
      ];

      for (const testCase of cases) {
        const engine = new SyncEngine(testCase.api, testCase.crypto, makeMemoryStorage());
        const result = await engine.push({ cards: {} }, 3, 'dev-1');
        testCase.assert(result);
      }
    });
  });

  // ── sanitizeCardSettings ─────────────────────────────────────────────────

  describe('sanitizeCardSettings', () => {
    it('normalizes inputs and defaults', async () => {
      const { SyncEngine } = await loadExports();
      const engine = new SyncEngine(makeApiClient(), makeCrypto(), makeMemoryStorage());
      const invalidCases = [null, 'string', 42];
      invalidCases.forEach((value) => {
        assert.equal(engine.sanitizeCardSettings(value), null);
      });

      const normalized = engine.sanitizeCardSettings({
        selectedCategories: ['Dining', 42, null, 'Travel'],
        merchantMap: { GRAB: 'Transport', BAD: 42, COFFEE: 'Dining' }
      });
      assert.deepEqual(normalized.selectedCategories, ['Dining', '', '', 'Travel']);
      assert.equal(normalized.defaultCategory, 'Others');
      assert.deepEqual(normalized.merchantMap, { GRAB: 'Transport', COFFEE: 'Dining' });
    });
  });

  // ── mergeCardSettings ────────────────────────────────────────────────────

  describe('mergeCardSettings', () => {
    it('merges incoming values and merchant maps', async () => {
      const { SyncEngine } = await loadExports();
      const engine = new SyncEngine(makeApiClient(), makeCrypto(), makeMemoryStorage());

      const incoming = { selectedCategories: ['Dining'], defaultCategory: 'Dining' };
      const base = { selectedCategories: ['Travel'], defaultCategory: 'Others', merchantMap: {}, monthlyTotals: {} };
      const merged = engine.mergeCardSettings(base, incoming);
      assert.deepEqual(merged.selectedCategories, ['Dining']);
      assert.equal(merged.defaultCategory, 'Dining');

      const baseMap = { merchantMap: { GRAB: 'Transport', STARBUCKS: 'Coffee' }, selectedCategories: [], defaultCategory: 'Others', monthlyTotals: {} };
      const incomingMap = { merchantMap: { GRAB: 'Dining' }, selectedCategories: [], defaultCategory: 'Others', monthlyTotals: {} };
      const mergedMap = engine.mergeCardSettings(baseMap, incomingMap);
      assert.equal(mergedMap.merchantMap.GRAB, 'Dining');
      assert.equal(mergedMap.merchantMap.STARBUCKS, 'Coffee');
    });
  });

  // ── sync (full flow) ──────────────────────────────────────────────────────

  describe('sync', () => {
    it('covers pull failure and merge/push success', async () => {
      const { SyncEngine } = await loadExports();
      const failureEngine = new SyncEngine(
        makeApiClient({ getSyncData: async () => { throw new Error('Network down'); } }),
        makeCrypto(),
        makeMemoryStorage()
      );
      const failureResult = await failureEngine.sync({ cards: {} }, 0, 'dev-1');
      assert.equal(failureResult.success, false);

      const remotePayload = {
        version: 1,
        deviceId: 'dev-remote',
        timestamp: Date.now(),
        data: { cards: { UOB: { selectedCategories: ['Travel'], defaultCategory: 'Others', merchantMap: {}, monthlyTotals: {} } } }
      };
      const ciphertext = Buffer.from(JSON.stringify(remotePayload), 'utf8').toString('base64');

      const engine = new SyncEngine(
        makeApiClient({
          getSyncData: async () => ({ version: 1, encryptedData: { ciphertext, iv: 'iv', salt: 'salt' } }),
          putSyncData: async (data, version) => ({ version, data })
        }),
        makeCrypto(),
        makeMemoryStorage()
      );

      const localData = { cards: { UOB: { selectedCategories: ['Dining'], defaultCategory: 'Dining', merchantMap: { GRAB: 'Transport' }, monthlyTotals: {} } } };
      const result = await engine.sync(localData, 1, 'dev-local');
      assert.equal(result.success, true);
      const uob = result.data.cards.UOB;
      assert.deepEqual(uob.selectedCategories, ['Dining']);
      assert.equal(uob.merchantMap.GRAB, 'Transport');
    });
  });
});

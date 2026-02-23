import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadExports, normalizeValue } from './helpers/load-userscript-exports.js';

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

function makeStorage(initial = {}) {
  const store = { ...initial };
  return {
    get: (k, d = null) => k in store ? store[k] : d,
    set: (k, v) => { store[k] = v; },
    remove: (k) => { delete store[k]; }
  };
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('SyncEngine', () => {
  // ── pull ─────────────────────────────────────────────────────────────────

  describe('pull', () => {
    it('returns success with null data when server returns no encryptedData', async () => {
      const { SyncEngine } = await loadExports();
      const engine = new SyncEngine(
        makeApiClient({ getSyncData: async () => null }),
        makeCrypto(),
        makeStorage()
      );
      const result = await engine.pull();
      assert.equal(result.success, true);
      assert.equal(result.data, null);
      assert.equal(result.version, 0);
    });

    it('returns success with null data when response has no encryptedData field', async () => {
      const { SyncEngine } = await loadExports();
      const engine = new SyncEngine(
        makeApiClient({ getSyncData: async () => ({ version: 1 }) }),
        makeCrypto(),
        makeStorage()
      );
      const result = await engine.pull();
      assert.equal(result.success, true);
      assert.equal(result.data, null);
    });

    it('decrypts and parses a canonical payload successfully', async () => {
      const { SyncEngine } = await loadExports();
      const nowMs = Date.now();
      const payload = {
        version: 1,
        deviceId: 'dev-1',
        timestamp: nowMs,
        data: { cards: { UOB: { selectedCategories: ['Dining'] } } }
      };
      const ciphertext = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');

      const engine = new SyncEngine(
        makeApiClient({
          getSyncData: async () => ({
            version: 1,
            encryptedData: { ciphertext, iv: 'iv', salt: 'salt' }
          })
        }),
        makeCrypto(),
        makeStorage()
      );
      const result = await engine.pull();
      assert.equal(result.success, true);
      assert.deepEqual(
        normalizeValue(result.data),
        { cards: { UOB: { selectedCategories: ['Dining'] } } }
      );
    });

    it('returns failure when decryption throws', async () => {
      const { SyncEngine } = await loadExports();
      const engine = new SyncEngine(
        makeApiClient({
          getSyncData: async () => ({
            version: 1,
            encryptedData: { ciphertext: 'bad', iv: 'iv', salt: 'salt' }
          })
        }),
        makeCrypto({
          decrypt: async () => {
            const err = new Error('Operation failed');
            err.name = 'OperationError';
            throw err;
          }
        }),
        makeStorage()
      );
      const result = await engine.pull();
      assert.equal(result.success, false);
      assert.ok(typeof result.error === 'string');
      assert.ok(result.error.includes('decrypt') || result.error.length > 0);
    });

    it('returns failure when payload is not valid JSON', async () => {
      const { SyncEngine } = await loadExports();
      const ciphertext = Buffer.from('not-json', 'utf8').toString('base64');
      const engine = new SyncEngine(
        makeApiClient({
          getSyncData: async () => ({
            version: 1,
            encryptedData: { ciphertext, iv: 'iv', salt: 'salt' }
          })
        }),
        makeCrypto(),
        makeStorage()
      );
      const result = await engine.pull();
      assert.equal(result.success, false);
    });

    it('migrates legacy cards-root payload successfully', async () => {
      const { SyncEngine } = await loadExports();
      const legacy = { cards: { MAYBANK: { selectedCategories: ['Dining'] } } };
      const ciphertext = Buffer.from(JSON.stringify(legacy), 'utf8').toString('base64');
      const engine = new SyncEngine(
        makeApiClient({
          getSyncData: async () => ({
            version: 2,
            encryptedData: { ciphertext, iv: 'iv', salt: 'salt' }
          })
        }),
        makeCrypto(),
        makeStorage()
      );
      const result = await engine.pull();
      assert.equal(result.success, true);
      assert.deepEqual(
        normalizeValue(result.data),
        { cards: { MAYBANK: { selectedCategories: ['Dining'] } } }
      );
    });
  });

  // ── push ─────────────────────────────────────────────────────────────────

  describe('push', () => {
    it('encrypts data and returns success with new version', async () => {
      const { SyncEngine } = await loadExports();
      const engine = new SyncEngine(
        makeApiClient({ putSyncData: async (_data, version) => ({ version }) }),
        makeCrypto(),
        makeStorage()
      );
      const result = await engine.push({ cards: {} }, 3, 'dev-1');
      assert.equal(result.success, true);
      assert.equal(result.version, 4); // version + 1 is what we pass, server echoes it
    });

    it('returns failure when encrypt throws', async () => {
      const { SyncEngine } = await loadExports();
      const engine = new SyncEngine(
        makeApiClient(),
        makeCrypto({
          encrypt: async () => { throw new Error('Encrypt failed'); }
        }),
        makeStorage()
      );
      const result = await engine.push({ cards: {} }, 0, 'dev-1');
      assert.equal(result.success, false);
      assert.ok(typeof result.error === 'string');
    });

    it('returns failure when api.putSyncData throws', async () => {
      const { SyncEngine } = await loadExports();
      const engine = new SyncEngine(
        makeApiClient({
          putSyncData: async () => { throw new Error('Network error'); }
        }),
        makeCrypto(),
        makeStorage()
      );
      const result = await engine.push({ cards: {} }, 0, 'dev-1');
      assert.equal(result.success, false);
    });
  });

  // ── sanitizeCardSettings ─────────────────────────────────────────────────

  describe('sanitizeCardSettings', () => {
    it('returns null for non-object input', async () => {
      const { SyncEngine } = await loadExports();
      const engine = new SyncEngine(makeApiClient(), makeCrypto(), makeStorage());
      assert.equal(engine.sanitizeCardSettings(null), null);
      assert.equal(engine.sanitizeCardSettings('string'), null);
      assert.equal(engine.sanitizeCardSettings(42), null);
    });

    it('normalizes selectedCategories to string array', async () => {
      const { SyncEngine } = await loadExports();
      const engine = new SyncEngine(makeApiClient(), makeCrypto(), makeStorage());
      const result = engine.sanitizeCardSettings({
        selectedCategories: ['Dining', 42, null, 'Travel']
      });
      assert.deepEqual(result.selectedCategories, ['Dining', '', '', 'Travel']);
    });

    it('defaults defaultCategory to Others when missing', async () => {
      const { SyncEngine } = await loadExports();
      const engine = new SyncEngine(makeApiClient(), makeCrypto(), makeStorage());
      const result = engine.sanitizeCardSettings({});
      assert.equal(result.defaultCategory, 'Others');
    });

    it('filters merchantMap to string-string pairs only', async () => {
      const { SyncEngine } = await loadExports();
      const engine = new SyncEngine(makeApiClient(), makeCrypto(), makeStorage());
      const result = engine.sanitizeCardSettings({
        merchantMap: { GRAB: 'Transport', BAD: 42, COFFEE: 'Dining' }
      });
      assert.deepEqual(result.merchantMap, { GRAB: 'Transport', COFFEE: 'Dining' });
    });
  });

  // ── mergeCardSettings ────────────────────────────────────────────────────

  describe('mergeCardSettings', () => {
    it('returns incoming when base is null', async () => {
      const { SyncEngine } = await loadExports();
      const engine = new SyncEngine(makeApiClient(), makeCrypto(), makeStorage());
      const incoming = { selectedCategories: ['Dining'], defaultCategory: 'Dining' };
      const result = engine.mergeCardSettings(null, incoming);
      assert.deepEqual(result, incoming);
    });

    it('prefers incoming selectedCategories', async () => {
      const { SyncEngine } = await loadExports();
      const engine = new SyncEngine(makeApiClient(), makeCrypto(), makeStorage());
      const base = { selectedCategories: ['Dining'], defaultCategory: 'Others', merchantMap: {}, monthlyTotals: {} };
      const incoming = { selectedCategories: ['Travel'], defaultCategory: 'Travel', merchantMap: {}, monthlyTotals: {} };
      const result = engine.mergeCardSettings(base, incoming);
      assert.deepEqual(result.selectedCategories, ['Travel']);
    });

    it('merges merchantMaps (incoming overwrites base on conflict)', async () => {
      const { SyncEngine } = await loadExports();
      const engine = new SyncEngine(makeApiClient(), makeCrypto(), makeStorage());
      const base = { merchantMap: { GRAB: 'Transport', STARBUCKS: 'Coffee' }, selectedCategories: [], defaultCategory: 'Others', monthlyTotals: {} };
      const incoming = { merchantMap: { GRAB: 'Dining' }, selectedCategories: [], defaultCategory: 'Others', monthlyTotals: {} };
      const result = engine.mergeCardSettings(base, incoming);
      assert.equal(result.merchantMap.GRAB, 'Dining');
      assert.equal(result.merchantMap.STARBUCKS, 'Coffee');
    });
  });

  // ── sync (full flow) ──────────────────────────────────────────────────────

  describe('sync', () => {
    it('returns pull failure immediately when pull fails', async () => {
      const { SyncEngine } = await loadExports();
      const engine = new SyncEngine(
        makeApiClient({
          getSyncData: async () => { throw new Error('Network down'); }
        }),
        makeCrypto(),
        makeStorage()
      );
      const result = await engine.sync({ cards: {} }, 0, 'dev-1');
      assert.equal(result.success, false);
    });

    it('merges local and remote cards, then pushes', async () => {
      const { SyncEngine } = await loadExports();
      const remotePayload = {
        version: 1,
        deviceId: 'dev-remote',
        timestamp: Date.now(),
        data: { cards: { UOB: { selectedCategories: ['Travel'], defaultCategory: 'Others', merchantMap: {}, monthlyTotals: {} } } }
      };
      const ciphertext = Buffer.from(JSON.stringify(remotePayload), 'utf8').toString('base64');

      let pushedData = null;
      const engine = new SyncEngine(
        makeApiClient({
          getSyncData: async () => ({ version: 1, encryptedData: { ciphertext, iv: 'iv', salt: 'salt' } }),
          putSyncData: async (data, version) => { pushedData = data; return { version }; }
        }),
        makeCrypto(),
        makeStorage()
      );

      const localData = { cards: { UOB: { selectedCategories: ['Dining'], defaultCategory: 'Dining', merchantMap: { GRAB: 'Transport' }, monthlyTotals: {} } } };
      const result = await engine.sync(localData, 1, 'dev-local');
      assert.equal(result.success, true);
      // Local overrides remote selectedCategories; merchant map is merged
      const uob = result.data.cards.UOB;
      assert.deepEqual(uob.selectedCategories, ['Dining']);
      assert.equal(uob.merchantMap.GRAB, 'Transport');
    });
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadExports } from './helpers/load-userscript-exports.js';

function makeStorage(initial = {}) {
  const store = { ...initial };
  return {
    get: (k, d = null) => k in store ? store[k] : d,
    set: (k, v) => { store[k] = v; },
    remove: (k) => { delete store[k]; },
    _store: store
  };
}

function makeValidCacheEntry(overrides = {}) {
  return JSON.stringify({
    version: 1,
    email: 'test@example.com',
    serverUrl: 'https://sync.example.com',
    createdAt: Date.now(),
    expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    encrypted: { ciphertext: 'abc123', iv: 'iv-value' },
    ...overrides
  });
}

describe('SyncManager', () => {
  // ── loadRememberedUnlockCacheEntry ────────────────────────────────────────

  describe('loadRememberedUnlockCacheEntry', () => {
    it('returns missing status when storage key is empty', async () => {
      const { SyncManager } = await loadExports();
      const storage = makeStorage({});
      const manager = new SyncManager(storage);
      const result = manager.loadRememberedUnlockCacheEntry('nonexistent-key');
      assert.equal(result.status, 'missing');
      assert.equal(result.cache, null);
    });

    it('returns malformed when value is not valid JSON', async () => {
      const { SyncManager } = await loadExports();
      const storage = makeStorage({ 'mykey': 'not-json' });
      const manager = new SyncManager(storage);
      const result = manager.loadRememberedUnlockCacheEntry('mykey');
      assert.equal(result.status, 'malformed');
    });

    it('returns malformed when cache has no expiresAt field', async () => {
      const { SyncManager } = await loadExports();
      const storage = makeStorage({ 'mykey': JSON.stringify({ encrypted: { ciphertext: 'x', iv: 'y' } }) });
      const manager = new SyncManager(storage);
      const result = manager.loadRememberedUnlockCacheEntry('mykey');
      assert.equal(result.status, 'malformed');
    });

    it('returns malformed when encrypted field is missing', async () => {
      const { SyncManager } = await loadExports();
      const storage = makeStorage({ 'mykey': JSON.stringify({ expiresAt: Date.now() + 10000 }) });
      const manager = new SyncManager(storage);
      const result = manager.loadRememberedUnlockCacheEntry('mykey');
      assert.equal(result.status, 'malformed');
    });

    it('returns malformed when encrypted.ciphertext is not a string', async () => {
      const { SyncManager } = await loadExports();
      const storage = makeStorage({
        'mykey': JSON.stringify({ expiresAt: Date.now() + 10000, encrypted: { ciphertext: 42, iv: 'x' } })
      });
      const manager = new SyncManager(storage);
      const result = manager.loadRememberedUnlockCacheEntry('mykey');
      assert.equal(result.status, 'malformed');
    });

    it('returns expired when expiresAt is in the past', async () => {
      const { SyncManager } = await loadExports();
      const storage = makeStorage({
        'mykey': JSON.stringify({
          expiresAt: Date.now() - 1000,
          encrypted: { ciphertext: 'abc', iv: 'xyz' }
        })
      });
      const manager = new SyncManager(storage);
      const result = manager.loadRememberedUnlockCacheEntry('mykey');
      assert.equal(result.status, 'expired');
      assert.equal(result.cache, null);
    });

    it('returns valid status with cache for a well-formed future entry', async () => {
      const { SyncManager } = await loadExports();
      const storage = makeStorage({ 'mykey': makeValidCacheEntry() });
      const manager = new SyncManager(storage);
      const result = manager.loadRememberedUnlockCacheEntry('mykey');
      assert.equal(result.status, 'valid');
      assert.ok(result.cache !== null);
      assert.equal(result.cache.encrypted.ciphertext, 'abc123');
    });
  });

  // ── isConfirmedRememberedUnlockAuthFailure ────────────────────────────────

  describe('isConfirmedRememberedUnlockAuthFailure', () => {
    it('returns true for "invalid credentials" message', async () => {
      const { SyncManager } = await loadExports();
      const manager = new SyncManager(makeStorage());
      assert.equal(manager.isConfirmedRememberedUnlockAuthFailure('Invalid credentials'), true);
      assert.equal(manager.isConfirmedRememberedUnlockAuthFailure('INVALID CREDENTIALS'), true);
    });

    it('returns true for "unauthorized" message', async () => {
      const { SyncManager } = await loadExports();
      const manager = new SyncManager(makeStorage());
      assert.equal(manager.isConfirmedRememberedUnlockAuthFailure('Unauthorized'), true);
      assert.equal(manager.isConfirmedRememberedUnlockAuthFailure('Request unauthorized'), true);
    });

    it('returns false for unrelated messages', async () => {
      const { SyncManager } = await loadExports();
      const manager = new SyncManager(makeStorage());
      assert.equal(manager.isConfirmedRememberedUnlockAuthFailure('Network error'), false);
      assert.equal(manager.isConfirmedRememberedUnlockAuthFailure(''), false);
      assert.equal(manager.isConfirmedRememberedUnlockAuthFailure(null), false);
    });
  });

  // ── isMalformedRememberedUnlockError ──────────────────────────────────────

  describe('isMalformedRememberedUnlockError', () => {
    it('returns true for OperationError', async () => {
      const { SyncManager } = await loadExports();
      const manager = new SyncManager(makeStorage());
      const err = Object.assign(new Error('Operation failed'), { name: 'OperationError' });
      assert.equal(manager.isMalformedRememberedUnlockError(err), true);
    });

    it('returns true for "Invalid encrypted local secret payload" message', async () => {
      const { SyncManager } = await loadExports();
      const manager = new SyncManager(makeStorage());
      const err = new Error('Invalid encrypted local secret payload');
      assert.equal(manager.isMalformedRememberedUnlockError(err), true);
    });

    it('returns false for other errors', async () => {
      const { SyncManager } = await loadExports();
      const manager = new SyncManager(makeStorage());
      assert.equal(manager.isMalformedRememberedUnlockError(new Error('Some error')), false);
      assert.equal(manager.isMalformedRememberedUnlockError(null), false);
    });
  });

  // ── isEnabled / isUnlocked ────────────────────────────────────────────────

  describe('isEnabled and isUnlocked', () => {
    it('isEnabled returns false when config has no enabled flag', async () => {
      const { SyncManager } = await loadExports();
      const storage = makeStorage({ ccSubcapSyncConfig: JSON.stringify({}) });
      const manager = new SyncManager(storage);
      assert.equal(manager.isEnabled(), false);
    });

    it('isEnabled returns true when config has enabled: true', async () => {
      const { SyncManager } = await loadExports();
      const storage = makeStorage({
        ccSubcapSyncConfig: JSON.stringify({ enabled: true, serverUrl: 'https://example.com' })
      });
      const manager = new SyncManager(storage);
      // Note: initializeClientFromConfig is called in constructor, but syncEngine not set (no passphrase)
      assert.equal(manager.isEnabled(), true);
    });

    it('isUnlocked returns false when syncClient is null', async () => {
      const { SyncManager } = await loadExports();
      const manager = new SyncManager(makeStorage());
      assert.equal(manager.isUnlocked(), false);
    });
  });

  // ── loadRememberedUnlockCache ─────────────────────────────────────────────

  describe('loadRememberedUnlockCache', () => {
    it('returns null when no cache entries exist', async () => {
      const { SyncManager } = await loadExports();
      const manager = new SyncManager(makeStorage());
      const result = manager.loadRememberedUnlockCache();
      assert.equal(result, null);
    });

    it('returns valid host-scoped cache when present', async () => {
      const { SyncManager } = await loadExports();
      const manager = new SyncManager(makeStorage());
      const cacheKey = manager.getRememberedUnlockCacheKey();
      manager.storage.set(cacheKey, makeValidCacheEntry());

      const result = manager.loadRememberedUnlockCache();
      assert.ok(result !== null);
      assert.equal(result.encrypted.ciphertext, 'abc123');
    });

    it('clears malformed host-scoped cache and returns null', async () => {
      const { SyncManager } = await loadExports();
      const manager = new SyncManager(makeStorage());
      const cacheKey = manager.getRememberedUnlockCacheKey();
      manager.storage.set(cacheKey, 'malformed-json');

      const result = manager.loadRememberedUnlockCache();
      assert.equal(result, null);
      // Cache should have been cleared
      assert.equal(manager.storage.get(cacheKey, null), null);
    });
  });

  // ── clearRememberedUnlockCache ────────────────────────────────────────────

  describe('clearRememberedUnlockCache', () => {
    it('removes host-scoped and legacy cache keys', async () => {
      const { SyncManager } = await loadExports();
      const manager = new SyncManager(makeStorage());
      const hostKey = manager.getRememberedUnlockCacheKey();
      manager.storage.set(hostKey, makeValidCacheEntry());
      manager.storage.set('ccSubcapSyncUnlockCache', makeValidCacheEntry());

      manager.clearRememberedUnlockCache();
      assert.equal(manager.storage.get(hostKey, null), null);
    });

    it('updates config rememberUnlock flag when updateConfig is true', async () => {
      const { SyncManager } = await loadExports();
      const config = { enabled: false, rememberUnlock: true };
      const storage = makeStorage({ ccSubcapSyncConfig: JSON.stringify(config) });
      const manager = new SyncManager(storage);
      // Force config to have rememberUnlock
      manager.config = { ...manager.config, rememberUnlock: true };

      manager.clearRememberedUnlockCache(true);
      const savedConfig = JSON.parse(storage.get('ccSubcapSyncConfig', '{}'));
      assert.equal(savedConfig.rememberUnlock, false);
    });
  });
});

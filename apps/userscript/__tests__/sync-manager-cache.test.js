import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { loadExports } from './helpers/load-userscript-exports.js';
import { snapshotGlobals, restoreGlobals } from './helpers/reset-globals.js';
import { makeMemoryStorage } from './helpers/test-doubles.js';

const exports = await loadExports();

describe('SyncManager cache handling', () => {
  let snapshot;
  beforeEach(() => {
    snapshot = snapshotGlobals();
  });
  afterEach(() => {
    restoreGlobals(snapshot);
  });
  it('loadRememberedUnlockCacheEntry handles missing and malformed data', () => {
    const storage = makeMemoryStorage();
    const manager = new exports.SyncManager(storage);

    const missing = manager.loadRememberedUnlockCacheEntry('missing-key');
    assert.equal(missing.status, 'missing');

    storage.set('bad-json', '{not-json');
    const malformed = manager.loadRememberedUnlockCacheEntry('bad-json');
    assert.equal(malformed.status, 'malformed');

    storage.set('bad-shape', JSON.stringify({ expiresAt: 'nope', encrypted: {} }));
    const badShape = manager.loadRememberedUnlockCacheEntry('bad-shape');
    assert.equal(badShape.status, 'malformed');
  });

  it('loadRememberedUnlockCacheEntry treats expired cache as expired', () => {
    const storage = makeMemoryStorage();
    const manager = new exports.SyncManager(storage);
    storage.set('expired', JSON.stringify({
      expiresAt: Date.now() - 1000,
      encrypted: { ciphertext: 'c', iv: 'i' }
    }));
    const result = manager.loadRememberedUnlockCacheEntry('expired');
    assert.equal(result.status, 'expired');
  });

  it('loadRememberedUnlockCache returns host-scoped cache and clears legacy', () => {
    globalThis.window = { location: { hostname: 'example.com' } };
    const storage = makeMemoryStorage();
    const manager = new exports.SyncManager(storage);
    const legacyKey = 'ccSubcapSyncUnlockCache';
    storage.set(legacyKey, JSON.stringify({
      expiresAt: Date.now() + 10000,
      encrypted: { ciphertext: 'c', iv: 'i' }
    }));

    const cache = manager.loadRememberedUnlockCache();
    assert.notEqual(cache, null, 'should return cache from legacy key');

    const hostKey = manager.getRememberedUnlockCacheKey();
    assert.notEqual(storage._store[hostKey], undefined, 'should migrate legacy cache to host-scoped key');
  });

  it('clearRememberedUnlockCache updates config when requested', () => {
    const storage = makeMemoryStorage({
      ccSubcapSyncConfig: JSON.stringify({ enabled: true, rememberUnlock: true })
    });
    const manager = new exports.SyncManager(storage);
    manager.clearRememberedUnlockCache(true);
    const config = JSON.parse(storage._store.ccSubcapSyncConfig);
    assert.equal(config.rememberUnlock, false);
  });
});

// targets: SyncManager unlock/setup/sync flows and error branches.
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { loadExports } from './helpers/load-userscript-exports.js';
import { snapshotGlobals, restoreGlobals } from './helpers/reset-globals.js';
import { makeMemoryStorage } from './helpers/test-doubles.js';

const exports = await loadExports();

describe('SyncManager flows', () => {
  let snapshot;
  beforeEach(() => {
    snapshot = snapshotGlobals();
  });
  afterEach(() => {
    restoreGlobals(snapshot);
  });
  it('unlockSync returns error when disabled or missing passphrase', async () => {
    const manager = new exports.SyncManager(makeMemoryStorage());
    const disabled = await manager.unlockSync('pass');
    assert.equal(disabled.success, false);

    manager.config = { enabled: true, serverUrl: 'https://example.com' };
    manager.enabled = true;
    const missing = await manager.unlockSync('');
    assert.equal(missing.success, false);
  });

  it('unlockSync returns warning when remember cache fails', async () => {
    const storage = makeMemoryStorage({
      ccSubcapSyncConfig: JSON.stringify({ enabled: true, email: 'test@example.com', serverUrl: 'https://example.com' })
    });
    const manager = new exports.SyncManager(storage);
    manager.secretVault.encryptText = async () => { throw new Error('no vault'); };
    manager.syncClient = {
      init: async () => {},
      login: async () => ({ token: 'tkn', tier: 'free' }),
      api: { setToken: () => {} }
    };

    const result = await manager.unlockSync('passphrase', { remember: true });
    assert.equal(result.success, true);
    assert.match(result.warning, /failed to remember/, 'warning should mention remember failure');
  });

  it('tryUnlockFromRememberedCache returns false on email mismatch', async () => {
    const storage = makeMemoryStorage({
      ccSubcapSyncConfig: JSON.stringify({ enabled: true, email: 'a@example.com', serverUrl: 'https://example.com' })
    });
    const manager = new exports.SyncManager(storage);
    const cacheKey = manager.getRememberedUnlockCacheKey();
    storage.set(cacheKey, JSON.stringify({
      expiresAt: Date.now() + 10000,
      encrypted: { ciphertext: 'x', iv: 'y' },
      email: 'b@example.com'
    }));

    const result = await manager.tryUnlockFromRememberedCache();
    assert.equal(result, false);
  });

  it('setupSync validates server URL and handles login/register flow', async () => {
    const manager = new exports.SyncManager(makeMemoryStorage());
    manager.syncClient = null;
    manager.config = { enabled: false };
    globalThis.fetch = async (url) => {
      if (String(url).endsWith('/auth/login')) {
        return {
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
          text: async () => JSON.stringify({ message: 'invalid credentials' })
        };
      }
      if (String(url).endsWith('/auth/register')) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          text: async () => JSON.stringify({ token: 'tkn', tier: 'free' })
        };
      }
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => JSON.stringify({})
      };
    };

    const result = await manager.setupSync('test@example.com', 'pass', 'https://example.com', false);
    assert.equal(result.success, true);
  });

  it('sync returns locked error when unlock fails', async () => {
    const storage = makeMemoryStorage({
      ccSubcapSyncConfig: JSON.stringify({ enabled: true, serverUrl: 'https://example.com', deviceId: 'dev-1' })
    });
    const manager = new exports.SyncManager(storage);
    manager.syncClient = null;
    manager.tryUnlockFromRememberedCache = async () => false;
    const result = await manager.sync({ cards: {} });
    assert.equal(result.success, false);
  });

  it('sync returns invalid config error when client init fails', async () => {
    const storage = makeMemoryStorage({
      ccSubcapSyncConfig: JSON.stringify({ enabled: true, serverUrl: 'not-a-url', deviceId: 'dev-1' })
    });
    const manager = new exports.SyncManager(storage);
    manager.syncClient = null;
    const result = await manager.sync({ cards: {} });
    assert.equal(result.success, false);
    assert.match(result.error, /Invalid sync configuration/, 'should return invalid config error');
  });

  it('sync returns success and updates config when client sync succeeds', async () => {
    const storage = makeMemoryStorage({
      ccSubcapSyncConfig: JSON.stringify({ enabled: true, serverUrl: 'https://example.com', deviceId: 'dev-1' })
    });
    const manager = new exports.SyncManager(storage);
    manager.syncClient = {
      sync: async () => ({ success: true, version: 2 })
    };
    manager.unlockInProgress = null;
    manager.isUnlocked = () => true;
    manager.initializeClientFromConfig = () => true;

    const result = await manager.sync({ cards: {} });
    assert.equal(result.success, true);
    assert.equal(manager.config.version, 2);
    assert.equal(typeof manager.config.lastSync, 'number', 'lastSync should be a number');
    assert.ok(manager.config.lastSync > 0, 'lastSync should be a positive timestamp');
  });

  it('getSharedMappings returns empty when disabled', async () => {
    const manager = new exports.SyncManager(makeMemoryStorage());
    const result = await manager.getSharedMappings('UOB');
    assert.equal(result.success, false);
    assert.deepEqual(result.mappings, []);
  });

  it('contributeMappings respects shareMappings and errors', async () => {
    const storage = makeMemoryStorage({
      ccSubcapSyncConfig: JSON.stringify({ enabled: true, shareMappings: false, serverUrl: 'https://example.com' })
    });
    const manager = new exports.SyncManager(storage);
    manager.syncClient = { contributeMappings: async () => { throw new Error('bad'); } };

    const blocked = await manager.contributeMappings([{ merchant: 'A', category: 'Dining' }]);
    assert.equal(blocked.success, true);
    assert.equal(blocked.message, 'Sharing disabled');

    manager.config.shareMappings = true;
    const result = await manager.contributeMappings([{ merchant: 'A', category: 'Dining' }]);
    assert.equal(result.success, false);
  });
});

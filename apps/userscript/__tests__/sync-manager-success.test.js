import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadExports } from './helpers/load-userscript-exports.js';
import { makeMemoryStorage } from './helpers/test-doubles.js';

const exports = await loadExports();

describe('SyncManager success paths', () => {
  it('setupSync uses login and saves config', async () => {
    const storage = makeMemoryStorage();
    const manager = new exports.SyncManager(storage);
    manager.secretVault.isAvailable = () => true;
    manager.secretVault.encryptText = async () => ({ ciphertext: 'cipher', iv: 'iv' });
    manager.hashPassphrase = async () => 'hashed-pass';

    const originalInit = exports.SyncClient.prototype.init;
    const originalLogin = exports.SyncClient.prototype.login;
    const originalRegister = exports.SyncClient.prototype.register;
    let loginCalls = 0;
    let registerCalls = 0;
    try {
      exports.SyncClient.prototype.init = async function () {
        this.cryptoManager = {};
        this.syncEngine = {};
      };
      exports.SyncClient.prototype.login = async () => {
        loginCalls += 1;
        return { token: 'tok-login', tier: 'free' };
      };
      exports.SyncClient.prototype.register = async () => {
        registerCalls += 1;
        return { token: 'tok-register', tier: 'free' };
      };

      const result = await manager.setupSync('user@example.com', 'pass', 'https://example.com', false);
      assert.equal(result.success, true);
      assert.equal(loginCalls, 1);
      assert.equal(registerCalls, 0);

      const config = JSON.parse(storage._store.ccSubcapSyncConfig);
      assert.equal(config.enabled, true);
      assert.equal(config.email, 'user@example.com');
      assert.equal(config.serverUrl, 'https://example.com');
      assert.equal(config.token, 'tok-login');
    } finally {
      exports.SyncClient.prototype.init = originalInit;
      exports.SyncClient.prototype.login = originalLogin;
      exports.SyncClient.prototype.register = originalRegister;
    }
  });

  it('setupSync falls back to register and remembers unlock', async () => {
    const storage = makeMemoryStorage();
    const manager = new exports.SyncManager(storage);
    manager.secretVault.isAvailable = () => true;
    manager.secretVault.encryptText = async () => ({ ciphertext: 'cipher', iv: 'iv' });
    manager.hashPassphrase = async () => 'hashed-pass';

    const originalInit = exports.SyncClient.prototype.init;
    const originalLogin = exports.SyncClient.prototype.login;
    const originalRegister = exports.SyncClient.prototype.register;
    let registerCalls = 0;
    try {
      exports.SyncClient.prototype.init = async function () {
        this.cryptoManager = {};
        this.syncEngine = {};
      };
      exports.SyncClient.prototype.login = async () => { throw new Error('bad login'); };
      exports.SyncClient.prototype.register = async () => {
        registerCalls += 1;
        return { token: 'tok-register', tier: 'free' };
      };

      const result = await manager.setupSync('user@example.com', 'pass', 'https://example.com', true);
      assert.equal(result.success, true);
      assert.equal(registerCalls, 1);
      const config = JSON.parse(storage._store.ccSubcapSyncConfig);
      assert.equal(config.rememberUnlock, true);
    } finally {
      exports.SyncClient.prototype.init = originalInit;
      exports.SyncClient.prototype.login = originalLogin;
      exports.SyncClient.prototype.register = originalRegister;
    }
  });

  it('unlockSync returns warning when remember fails', async () => {
    const storage = makeMemoryStorage({
      ccSubcapSyncConfig: JSON.stringify({ enabled: true, serverUrl: 'https://example.com', email: 'user@example.com' })
    });
    const manager = new exports.SyncManager(storage);
    manager.rememberUnlockPassphrase = async () => { throw new Error('vault error'); };
    manager.hashPassphrase = async () => 'hashed-pass';

    const originalInit = exports.SyncClient.prototype.init;
    const originalLogin = exports.SyncClient.prototype.login;
    try {
      exports.SyncClient.prototype.init = async function () {
        this.cryptoManager = {};
        this.syncEngine = {};
      };
      exports.SyncClient.prototype.login = async () => ({ token: 'tok-login', tier: 'pro' });

      const result = await manager.unlockSync('pass', { remember: true });
      assert.equal(result.success, true);
      assert.strictEqual(typeof result.warning, 'string', 'should return a warning string when remember fails');
      assert.match(result.warning, /vault|remember|failed/i, 'warning should describe the remember failure');
    } finally {
      exports.SyncClient.prototype.init = originalInit;
      exports.SyncClient.prototype.login = originalLogin;
    }
  });

  it('unlockSync rejects when disabled or missing passphrase', async () => {
    const storage = makeMemoryStorage({ ccSubcapSyncConfig: JSON.stringify({ enabled: false }) });
    const manager = new exports.SyncManager(storage);
    let result = await manager.unlockSync('pass');
    assert.equal(result.success, false);

    manager.saveSyncConfig({ enabled: true, serverUrl: 'https://example.com', email: 'user@example.com' });
    result = await manager.unlockSync('');
    assert.equal(result.success, false);
  });

  it('tryUnlockFromRememberedCache uses cached passphrase', async () => {
    globalThis.window = { location: { hostname: 'pib.uob.com.sg' } };
    const storage = makeMemoryStorage({
      ccSubcapSyncConfig: JSON.stringify({ enabled: true, serverUrl: 'https://example.com', email: 'user@example.com' })
    });
    const manager = new exports.SyncManager(storage);
    const cacheKey = manager.getRememberedUnlockCacheKey();
    storage.set(cacheKey, JSON.stringify({
      version: 1,
      email: 'user@example.com',
      serverUrl: 'https://example.com',
      createdAt: Date.now(),
      expiresAt: Date.now() + 10000,
      encrypted: { ciphertext: 'cipher', iv: 'iv' }
    }));

    let unlockCalls = 0;
    manager.secretVault.decryptText = async () => 'pass';
    manager.unlockSync = async () => { unlockCalls += 1; return { success: true }; };

    const result = await manager.tryUnlockFromRememberedCache();
    assert.equal(result, true);
    assert.equal(unlockCalls, 1);
  });

  it('getSharedMappings and contributeMappings honor config', async () => {
    const storage = makeMemoryStorage({
      ccSubcapSyncConfig: JSON.stringify({ enabled: true, shareMappings: false })
    });
    const manager = new exports.SyncManager(storage);
    manager.syncClient = {
      getSharedMappings: async () => ({ mappings: ['A', 'B'] }),
      contributeMappings: async () => {}
    };

    const shared = await manager.getSharedMappings('UOB');
    assert.equal(shared.success, true);
    assert.deepEqual(shared.mappings, ['A', 'B']);

    const contributed = await manager.contributeMappings([{ merchant: 'X', category: 'Dining' }]);
    assert.equal(contributed.success, true);
    assert.equal(contributed.message, 'Sharing disabled');
  });

  it('hashPassphrase derives a deterministic hex hash', async () => {
    const storage = makeMemoryStorage({
      ccSubcapSyncConfig: JSON.stringify({ enabled: true, email: 'user@example.com' })
    });
    const manager = new exports.SyncManager(storage);
    const hash = await manager.hashPassphrase('passphrase');
    assert.equal(hash.length, 64, 'hash should be 64 hex characters');
    assert.match(hash, /^[0-9a-f]{64}$/, 'hash should be lowercase hex');
  });
});

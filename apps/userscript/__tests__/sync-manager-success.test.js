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

  it('tracks bootstrap restore metadata and status messaging', async () => {
    const storage = makeMemoryStorage({
      ccSubcapSyncConfig: JSON.stringify({ enabled: true, serverUrl: 'https://example.com' })
    });
    const manager = new exports.SyncManager(storage);

    assert.equal(manager.shouldRunBootstrapRestore(), true);
    manager.saveBootstrapRestoreOutcome('restored', { sourceVersion: 7, markDone: true });
    assert.equal(manager.config.bootstrapRestoreDone, true);
    assert.equal(manager.config.bootstrapRestoreSourceVersion, 7);
    assert.match(manager.getBootstrapRestoreStatusMessage(), /restored from server/i);
  });

  it('resolvePendingConflict merges selected values and clears conflict state', async () => {
    const pendingConflict = {
      cardName: 'XL Rewards Card',
      latestVersion: 5,
      local: {
        selectedCategories: ['Travel'],
        defaultCategory: 'Travel',
        merchantMap: { GRAB: 'Travel' },
        monthlyTotals: {}
      },
      remote: {
        selectedCategories: ['Dining'],
        defaultCategory: 'Dining',
        merchantMap: { GRAB: 'Dining' },
        monthlyTotals: {}
      },
      autoMerged: {
        selectedCategories: ['Travel'],
        defaultCategory: 'Travel',
        merchantMap: {},
        monthlyTotals: {}
      },
      conflicts: [
        { type: 'merchant', merchantKey: 'GRAB', localValue: 'Travel', remoteValue: 'Dining' }
      ]
    };

    const storage = makeMemoryStorage({
      ccSubcapSyncConfig: JSON.stringify({
        enabled: true,
        deviceId: 'dev-1',
        serverUrl: 'https://example.com',
        pendingConflict
      })
    });
    const manager = new exports.SyncManager(storage);
    manager.syncClient = {
      syncEngine: {
        sanitizeCardForMerge: (value) => ({
          selectedCategories: Array.isArray(value?.selectedCategories) ? value.selectedCategories.slice() : [],
          defaultCategory: value?.defaultCategory || 'Others',
          merchantMap: { ...(value?.merchantMap || {}) },
          monthlyTotals: { ...(value?.monthlyTotals || {}) }
        }),
        mergeActiveCardConflict: (_base, local) => ({
          merged: local,
          conflicts: [],
          hasConflicts: false
        }),
        sanitizeDataForSync: (value) => value,
        pull: async () => ({ success: true, version: 5, data: { cards: { 'XL Rewards Card': pendingConflict.remote } } }),
        push: async () => ({ success: true, version: 6 })
      }
    };

    const result = await manager.resolvePendingConflict('merge_selected', {
      'merchant:GRAB': 'remote'
    });

    assert.equal(result.success, true);
    assert.equal(result.resolvedCard.merchantMap.GRAB, 'Dining');
    assert.equal(manager.config.pendingConflict, null);
    assert.equal(manager.config.version, 6);
  });

  it('resolvePendingConflict reopens conflict when remote changed again', async () => {
    const pendingConflict = {
      cardName: 'XL Rewards Card',
      latestVersion: 5,
      local: {
        selectedCategories: ['Travel'],
        defaultCategory: 'Travel',
        merchantMap: {},
        monthlyTotals: {}
      },
      remote: {
        selectedCategories: ['Dining'],
        defaultCategory: 'Dining',
        merchantMap: {},
        monthlyTotals: {}
      },
      autoMerged: {
        selectedCategories: ['Travel'],
        defaultCategory: 'Travel',
        merchantMap: {},
        monthlyTotals: {}
      },
      conflicts: []
    };

    const storage = makeMemoryStorage({
      ccSubcapSyncConfig: JSON.stringify({
        enabled: true,
        deviceId: 'dev-1',
        serverUrl: 'https://example.com',
        pendingConflict
      })
    });
    const manager = new exports.SyncManager(storage);
    manager.syncClient = {
      syncEngine: {
        sanitizeCardForMerge: (value) => ({
          selectedCategories: Array.isArray(value?.selectedCategories) ? value.selectedCategories.slice() : [],
          defaultCategory: value?.defaultCategory || 'Others',
          merchantMap: { ...(value?.merchantMap || {}) },
          monthlyTotals: { ...(value?.monthlyTotals || {}) }
        }),
        sanitizeDataForSync: (value) => value,
        mergeActiveCardConflict: (_base, local, remote) => ({
          merged: local,
          conflicts: [
            {
              type: 'field',
              field: 'selectedCategories',
              localValue: local.selectedCategories,
              remoteValue: remote.selectedCategories
            }
          ],
          hasConflicts: true
        }),
        pull: async () => ({
          success: true,
          version: 6,
          data: {
            cards: {
              'XL Rewards Card': {
                selectedCategories: ['Local'],
                defaultCategory: 'Local',
                merchantMap: {},
                monthlyTotals: {}
              }
            }
          }
        }),
        push: async () => ({ success: true, version: 7 })
      }
    };

    const result = await manager.resolvePendingConflict('keep_local');
    assert.equal(result.success, false);
    assert.equal(result.conflict, true);
    assert.ok(manager.config.pendingConflict);
  });

  it('resolvePendingConflict rebuilds pending conflict when push conflicts again', async () => {
    const pendingConflict = {
      cardName: 'XL Rewards Card',
      latestVersion: 5,
      local: {
        selectedCategories: ['Travel'],
        defaultCategory: 'Travel',
        merchantMap: { GRAB: 'Travel' },
        monthlyTotals: {}
      },
      remote: {
        selectedCategories: ['Dining'],
        defaultCategory: 'Dining',
        merchantMap: { GRAB: 'Dining' },
        monthlyTotals: {}
      },
      autoMerged: {
        selectedCategories: ['Travel'],
        defaultCategory: 'Travel',
        merchantMap: { GRAB: 'Travel' },
        monthlyTotals: {}
      },
      conflicts: []
    };

    const storage = makeMemoryStorage({
      ccSubcapSyncConfig: JSON.stringify({
        enabled: true,
        deviceId: 'dev-1',
        serverUrl: 'https://example.com',
        pendingConflict
      })
    });
    const manager = new exports.SyncManager(storage);
    let pullCount = 0;
    let mergeCount = 0;
    manager.syncClient = {
      syncEngine: {
        sanitizeCardForMerge: (value) => ({
          selectedCategories: Array.isArray(value?.selectedCategories) ? value.selectedCategories.slice() : [],
          defaultCategory: value?.defaultCategory || 'Others',
          merchantMap: { ...(value?.merchantMap || {}) },
          monthlyTotals: { ...(value?.monthlyTotals || {}) }
        }),
        sanitizeDataForSync: (value) => value,
        mergeActiveCardConflict: (_base, local, remote) => {
          mergeCount += 1;
          if (mergeCount === 1) {
            return {
              merged: local,
              conflicts: [],
              hasConflicts: false
            };
          }
          return {
            merged: local,
            conflicts: [
              {
                type: 'merchant',
                merchantKey: 'GRAB',
                localValue: local.merchantMap?.GRAB || null,
                remoteValue: remote.merchantMap?.GRAB || null
              }
            ],
            hasConflicts: true
          };
        },
        pull: async () => {
          pullCount += 1;
          if (pullCount === 1) {
            return {
              success: true,
              version: 6,
              data: {
                cards: {
                  'XL Rewards Card': {
                    selectedCategories: ['Dining'],
                    defaultCategory: 'Dining',
                    merchantMap: { GRAB: 'Dining' },
                    monthlyTotals: {}
                  }
                }
              }
            };
          }
          return {
            success: true,
            version: 7,
            data: {
              cards: {
                'XL Rewards Card': {
                  selectedCategories: ['Dining'],
                  defaultCategory: 'Dining',
                  merchantMap: { GRAB: 'Transport' },
                  monthlyTotals: {}
                }
              }
            }
          };
        },
        push: async () => ({ success: false, conflict: true, error: 'Version conflict' })
      }
    };

    const result = await manager.resolvePendingConflict('keep_local');
    assert.equal(result.success, false);
    assert.equal(result.conflict, true);
    assert.ok(result.conflictData);
    assert.equal(result.conflictData.latestVersion, 7);
    assert.ok(Array.isArray(result.conflictData.conflicts));
    assert.ok(manager.config.pendingConflict);
    assert.equal(manager.config.pendingConflict.latestVersion, 7);
  });
});

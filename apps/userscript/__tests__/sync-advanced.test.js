import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { loadExports } from './helpers/load-userscript-exports.js';
import { snapshotGlobals, restoreGlobals } from './helpers/reset-globals.js';
import { makeMemoryStorage } from './helpers/test-doubles.js';

const exports = await loadExports();

describe('sync helpers (advanced)', () => {
  let snapshot;
  beforeEach(() => {
    snapshot = snapshotGlobals();
  });
  afterEach(() => {
    restoreGlobals(snapshot);
  });
  it('SyncClient throws when sync is called before init', async () => {
    const client = new exports.SyncClient({ serverUrl: 'https://example.com' });
    await assert.rejects(() => client.sync({ cards: {} }, 0, 'dev-1'), /init/);
  });

  it('SyncSecretVault throws when device key is missing', async () => {
    globalThis.CryptoKey = class {};
    const vault = new exports.SyncSecretVault();
    vault.getDeviceKey = async () => null;

    await assert.rejects(
      () => vault.decryptText({ ciphertext: 'aa', iv: 'bb' }),
      /unlock key is missing/
    );
  });

  it('SyncSecretVault throws when vault is unavailable', async () => {
    const vault = new exports.SyncSecretVault();
    vault.isAvailable = () => false;
    await assert.rejects(() => vault.openDb(), /Secure local vault is not available/);
  });

  it('SyncManager disableSync clears config and client', async () => {
    const storage = makeMemoryStorage({
      ccSubcapSyncConfig: JSON.stringify({ enabled: true, serverUrl: 'https://example.com' })
    });
    const manager = new exports.SyncManager(storage);
    manager.syncClient = { api: { setToken: () => {} } };
    manager.enabled = true;
    manager.disableSync();
    assert.equal(manager.enabled, false);
    assert.equal(manager.syncClient, null);
    assert.deepEqual(manager.config, {});
  });
});

// targets: SyncSecretVault encryption/lookup branches.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadExports } from './helpers/load-userscript-exports.js';

const exports = await loadExports();

function makeIndexedDb() {
  const storeNames = new Set();
  const store = new Map();
  return {
    open: () => {
      const request = {
        result: {
          objectStoreNames: { contains: (name) => storeNames.has(name) },
          createObjectStore: (name) => { storeNames.add(name); },
          transaction: () => {
            const tx = { oncomplete: null, onerror: null };
            return {
              objectStore: () => ({
                get: (id) => {
                  const req = {};
                  setTimeout(() => { req.result = store.get(id); if (req.onsuccess) req.onsuccess(); }, 0);
                  return req;
                },
                put: (value, id) => {
                  store.set(id, value);
                  setTimeout(() => { if (tx.oncomplete) tx.oncomplete(); }, 0);
                },
                delete: (id) => {
                  store.delete(id);
                  setTimeout(() => { if (tx.oncomplete) tx.oncomplete(); }, 0);
                }
              }),
              get oncomplete() { return tx.oncomplete; },
              set oncomplete(handler) { tx.oncomplete = handler; },
              get onerror() { return tx.onerror; },
              set onerror(handler) { tx.onerror = handler; }
            };
          }
        },
        onupgradeneeded: null,
        onsuccess: null,
        onerror: null,
        error: null
      };
      setTimeout(() => {
        if (request.onupgradeneeded) request.onupgradeneeded();
        if (request.onsuccess) request.onsuccess();
      }, 0);
      return request;
    }
  };
}

describe('SyncSecretVault', () => {
  it('decryptText rejects invalid payload', async () => {
    const vault = new exports.SyncSecretVault();
    await assert.rejects(() => vault.decryptText(null), /Invalid encrypted local secret payload/);
  });

  it('encrypt/decrypt roundtrip uses device key', async () => {
    const originalIndexedDb = globalThis.indexedDB;
    const originalCrypto = globalThis.crypto;
    const originalCryptoKey = globalThis.CryptoKey;

    globalThis.CryptoKey = class {};
    Object.defineProperty(globalThis, 'indexedDB', {
      configurable: true,
      value: makeIndexedDb()
    });
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: {
        getRandomValues: (arr) => { for (let i = 0; i < arr.length; i += 1) { arr[i] = i + 1; } return arr; },
        subtle: {
          generateKey: async () => new globalThis.CryptoKey(),
          encrypt: async (_algo, _key, data) => data,
          decrypt: async (_algo, _key, data) => data
        }
      }
    });

    const vault = new exports.SyncSecretVault();
    const encrypted = await vault.encryptText('hello');
    assert.strictEqual(typeof encrypted.ciphertext, 'string', 'encrypted result should have ciphertext string');
    assert.strictEqual(typeof encrypted.iv, 'string', 'encrypted result should have iv string');

    const decrypted = await vault.decryptText(encrypted);
    assert.equal(decrypted, 'hello');

    Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: originalIndexedDb });
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: originalCrypto });
    globalThis.CryptoKey = originalCryptoKey;
  });
});

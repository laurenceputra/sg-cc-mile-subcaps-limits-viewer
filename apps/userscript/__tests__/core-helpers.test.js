// targets: core helpers (device id, base64, date parsing) to lift function coverage quickly.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadExports, normalizeValue } from './helpers/load-userscript-exports.js';

const exports = await loadExports();

function withFastCrypto(fn) {
  const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  const originalCrypto = globalThis.crypto;
  const fastCrypto = {
    getRandomValues: (arr) => {
      for (let i = 0; i < arr.length; i += 1) {
        arr[i] = i + 1;
      }
      return arr;
    },
    subtle: {
      importKey: async () => ({}),
      deriveKey: async () => ({}),
      encrypt: async (_algo, _key, data) => data,
      decrypt: async (_algo, _key, data) => data
    }
  };
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: fastCrypto
  });
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      if (originalDescriptor) {
        Object.defineProperty(globalThis, 'crypto', originalDescriptor);
      } else {
        Object.defineProperty(globalThis, 'crypto', {
          configurable: true,
          value: originalCrypto
        });
      }
    });
}

describe('core helpers', () => {
  it('generateDeviceId returns prefixed unique ids', () => {
    const id1 = exports.generateDeviceId();
    const id2 = exports.generateDeviceId();
    assert.match(id1, /^device-/, 'device id should start with device- prefix');
    assert.match(id2, /^device-/, 'device id should start with device- prefix');
    assert.notEqual(id1, id2);
  });

  it('arrayBufferToBase64 and base64ToArrayBuffer round-trip', () => {
    const buffer = new Uint8Array([1, 2, 3, 255]).buffer;
    const encoded = exports.arrayBufferToBase64(buffer);
    const decoded = exports.base64ToArrayBuffer(encoded);
    assert.deepEqual(Array.from(new Uint8Array(decoded)), [1, 2, 3, 255]);
  });

  it('getPayloadTopLevelKeys limits key count and preserves order', () => {
    const payload = { a: 1, b: 2, c: 3, d: 4 };
    assert.deepEqual(exports.getPayloadTopLevelKeys(payload, 2), ['a', 'b']);
    assert.deepEqual(exports.getPayloadTopLevelKeys(payload, 10), ['a', 'b', 'c', 'd']);
  });

  it('hasValidTimestamp validates finite positive numbers', () => {
    assert.equal(exports.hasValidTimestamp(123), true);
    assert.equal(exports.hasValidTimestamp(0), false);
    assert.equal(exports.hasValidTimestamp(-5), false);
    assert.equal(exports.hasValidTimestamp(Number.NaN), false);
  });

  it('isObjectRecord and looksLikeCardSettings detect shapes', () => {
    assert.equal(exports.isObjectRecord({ a: 1 }), true);
    assert.equal(exports.isObjectRecord(null), false);
    assert.equal(exports.isObjectRecord([]), false);

    assert.equal(exports.looksLikeCardSettings({ selectedCategories: [] }), true);
    assert.equal(exports.looksLikeCardSettings({ defaultCategory: 'Others' }), true);
    assert.equal(exports.looksLikeCardSettings({ merchantMap: {} }), true);
    assert.equal(exports.looksLikeCardSettings({ transactions: {} }), true);
    assert.equal(exports.looksLikeCardSettings({ monthlyTotals: {} }), true);
    assert.equal(exports.looksLikeCardSettings({}), false);
  });

  it('deriveKey + encrypt + decrypt round-trip payload', async () => {
    await withFastCrypto(async () => {
      const salt = new Uint8Array(16);
      const key = await exports.deriveKey('passphrase', salt);
      const encrypted = await exports.encrypt(key, { ok: true, count: 2 });
      const decrypted = await exports.decrypt(key, encrypted.ciphertext, encrypted.iv);
      assert.deepEqual(normalizeValue(decrypted), { ok: true, count: 2 });
    });
  });

  it('CryptoManager encrypt/decrypt handles salt changes', async () => {
    await withFastCrypto(async () => {
      const cryptoManager = new exports.CryptoManager('passphrase');
      const payload = { hello: 'world' };
      const encrypted = await cryptoManager.encrypt(payload);
      const decrypted = await cryptoManager.decrypt(encrypted.ciphertext, encrypted.iv, encrypted.salt);
      assert.deepEqual(normalizeValue(decrypted), payload);

      const cryptoManager2 = new exports.CryptoManager('passphrase');
      const decrypted2 = await cryptoManager2.decrypt(encrypted.ciphertext, encrypted.iv, encrypted.salt);
      assert.deepEqual(normalizeValue(decrypted2), payload);
    });
  });
});

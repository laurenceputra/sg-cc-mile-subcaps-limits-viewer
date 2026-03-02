/**
 * Test doubles (mocks/stubs) for userscript unit tests.
 */

/**
 * Creates an in-memory StorageAdapter substitute.
 * Supports get/set/remove with an optional initial state.
 */
export function makeMemoryStorage(initial = {}) {
  const store = { ...initial };
  return {
    get(key, fallback = null) {
      return key in store ? store[key] : fallback;
    },
    set(key, value) {
      store[key] = value;
    },
    remove(key) {
      delete store[key];
    },
    _store: store
  };
}

/**
 * Creates a mock ApiClient that returns configurable responses.
 * @param {Object} responses - map of `method:path` -> response value or Error
 */
export function makeApiClient(responses = {}) {
  return {
    token: null,
    setToken(token) {
      this.token = token;
    },
    async request(path, options = {}) {
      const method = (options.method || 'GET').toUpperCase();
      const key = `${method}:${path}`;
      const handler = responses[key] ?? responses['*'];
      if (typeof handler === 'function') {
        return handler({ path, options, token: this.token });
      }
      if (handler instanceof Error) {
        throw handler;
      }
      if (handler !== undefined) {
        return handler;
      }
      return { ok: true, status: 200, data: null };
    }
  };
}

/**
 * Creates a mock CryptoManager that does passthrough encryption/decryption.
 * ciphertext = btoa(plaintext), so decrypt undoes encrypt and vice versa.
 */
export function makeCryptoManager() {
  return {
    async deriveKey(passphrase) {
      return `derived:${passphrase}`;
    },
    async encrypt(key, plaintext) {
      const encoded = Buffer.from(plaintext, 'utf8').toString('base64');
      return { ciphertext: encoded, iv: 'test-iv' };
    },
    async decrypt(key, encrypted) {
      if (!encrypted || typeof encrypted.ciphertext !== 'string') {
        throw Object.assign(new Error('Invalid encrypted local secret payload'), { name: 'OperationError' });
      }
      return Buffer.from(encrypted.ciphertext, 'base64').toString('utf8');
    }
  };
}

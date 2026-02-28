/**
 * Shared loader for userscript test exports.
 * Sets up required globals and imports the userscript in test mode.
 * Caches the exports so the module is only loaded once per process.
 */

const USERSCRIPT_PATH = new URL('../../bank-cc-limits-subcap-calculator.user.js', import.meta.url);
let cachedExports = null;

export async function loadExports() {
  if (cachedExports) {
    return cachedExports;
  }

  if (globalThis.__CC_SUBCAP_TEST_EXPORTS__) {
    cachedExports = globalThis.__CC_SUBCAP_TEST_EXPORTS__;
    return cachedExports;
  }

  globalThis.window = {
    localStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {}
    },
    location: {
      origin: 'https://pib.uob.com.sg',
      hostname: 'pib.uob.com.sg',
      href: 'https://pib.uob.com.sg/PIBCust/2FA/processSubmit.do',
      pathname: '/PIBCust/2FA/processSubmit.do'
    },
    setTimeout: (...args) => setTimeout(...args),
    clearTimeout: (...args) => clearTimeout(...args),
    setInterval: (...args) => setInterval(...args),
    clearInterval: (...args) => clearInterval(...args),
    getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' })
  };
  globalThis.document = {
    head: { appendChild: () => {} },
    body: { appendChild: () => {} },
    documentElement: {},
    createElement: () => ({
      setAttribute: () => {},
      classList: { add: () => {}, remove: () => {}, contains: () => false, toggle: () => {} },
      addEventListener: () => {},
      remove: () => {},
      replaceWith: () => {},
      appendChild: () => {},
      querySelector: () => null,
      querySelectorAll: () => [],
      style: {}
    }),
    getElementById: () => null,
    evaluate: () => ({ singleNodeValue: null })
  };
  globalThis.XPathResult = { FIRST_ORDERED_NODE_TYPE: 9 };
  globalThis.Element = class {};
  globalThis.MutationObserver = class {
    constructor() {}
    observe() {}
    disconnect() {}
  };
  globalThis.Node = { TEXT_NODE: 3 };
  globalThis.btoa = (value) => Buffer.from(value, 'binary').toString('base64');
  globalThis.atob = (value) => Buffer.from(value, 'base64').toString('binary');
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    text: async () => ''
  });
  globalThis.GM_getValue = undefined;
  globalThis.GM_setValue = undefined;
  globalThis.GM_addStyle = undefined;
  globalThis.GM_xmlhttpRequest = undefined;
  globalThis.__CC_SUBCAP_TEST__ = true;
  if (!globalThis.crypto || typeof globalThis.crypto.getRandomValues !== 'function' || !globalThis.crypto.subtle) {
    try {
      Object.defineProperty(globalThis, 'crypto', {
        configurable: true,
        value: {
          getRandomValues: (arr) => {
            for (let i = 0; i < arr.length; i += 1) {
              arr[i] = (i * 17 + 3) % 256;
            }
            return arr;
          },
          subtle: {
            importKey: async () => ({}),
            deriveKey: async () => ({}),
            encrypt: async () => new ArrayBuffer(8),
            decrypt: async () => new ArrayBuffer(8),
            generateKey: async () => ({}),
            digest: async () => new ArrayBuffer(32),
            deriveBits: async () => new ArrayBuffer(32)
          }
        }
      });
    } catch (error) {
      // ignore
    }
  }
  globalThis.indexedDB = {
    open: () => {
      const request = {
        result: {
          objectStoreNames: { contains: () => true },
          createObjectStore: () => {},
          transaction: () => ({
            objectStore: () => ({
              get: () => {
                const req = {};
                setTimeout(() => { if (req.onsuccess) req.onsuccess(); }, 0);
                return req;
              },
              put: () => {},
              delete: () => {}
            }),
            oncomplete: null,
            onerror: null
          })
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

  await import(USERSCRIPT_PATH.href);

  const exports = globalThis.__CC_SUBCAP_TEST_EXPORTS__;
  if (!exports) {
    throw new Error('Expected __CC_SUBCAP_TEST_EXPORTS__ to be registered');
  }
  cachedExports = exports;
  return cachedExports;
}

export function normalizeValue(value) {
  return JSON.parse(JSON.stringify(value));
}

export function resetExportsCache() {
  cachedExports = null;
  delete globalThis.__CC_SUBCAP_TEST_EXPORTS__;
}

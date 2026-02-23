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

  globalThis.window = {
    localStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {}
    },
    location: { origin: 'https://pib.uob.com.sg', hostname: 'pib.uob.com.sg' }
  };
  globalThis.document = {
    head: { appendChild: () => {} },
    createElement: () => ({
      setAttribute: () => {},
      classList: { add: () => {}, remove: () => {} }
    })
  };
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

  await import(`${USERSCRIPT_PATH.href}?test=${Date.now()}`);

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

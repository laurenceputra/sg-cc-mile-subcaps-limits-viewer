function setOrDeleteGlobal(key, value) {
  if (typeof value === 'undefined') {
    delete globalThis[key];
    return;
  }
  globalThis[key] = value;
}

export function snapshotGlobals() {
  const window = globalThis.window;
  const document = globalThis.document;
  return {
    window,
    windowProps: window
      ? {
          location: window.location,
          localStorage: window.localStorage,
          setTimeout: window.setTimeout,
          clearTimeout: window.clearTimeout,
          setInterval: window.setInterval,
          clearInterval: window.clearInterval,
          getComputedStyle: window.getComputedStyle
        }
      : null,
    document,
    documentProps: document
      ? {
          head: document.head,
          body: document.body,
          documentElement: document.documentElement,
          createElement: document.createElement,
          getElementById: document.getElementById,
          evaluate: document.evaluate
        }
      : null,
    MutationObserver: globalThis.MutationObserver,
    GM_addStyle: globalThis.GM_addStyle,
    GM_getValue: globalThis.GM_getValue,
    GM_setValue: globalThis.GM_setValue,
    GM_deleteValue: globalThis.GM_deleteValue,
    GM_xmlhttpRequest: globalThis.GM_xmlhttpRequest,
    fetch: globalThis.fetch,
    btoa: globalThis.btoa,
    atob: globalThis.atob,
    indexedDB: globalThis.indexedDB,
    crypto: globalThis.crypto,
    CryptoKey: globalThis.CryptoKey,
    confirm: globalThis.confirm,
    Element: globalThis.Element,
    Node: globalThis.Node,
    XPathResult: globalThis.XPathResult,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    setInterval: globalThis.setInterval,
    clearInterval: globalThis.clearInterval,
    DateNow: Date.now,
    __CC_SUBCAP_TEST__: globalThis.__CC_SUBCAP_TEST__,
    __CC_SUBCAP_TEST_EXPORTS__: globalThis.__CC_SUBCAP_TEST_EXPORTS__
  };
}

export function restoreGlobals(snapshot) {
  if (!snapshot) {
    return;
  }
  if (snapshot.window && snapshot.windowProps) {
    Object.assign(snapshot.window, snapshot.windowProps);
  }
  if (snapshot.document && snapshot.documentProps) {
    Object.assign(snapshot.document, snapshot.documentProps);
  }
  globalThis.window = snapshot.window;
  globalThis.document = snapshot.document;
  globalThis.MutationObserver = snapshot.MutationObserver;
  globalThis.GM_addStyle = snapshot.GM_addStyle;
  globalThis.GM_getValue = snapshot.GM_getValue;
  globalThis.GM_setValue = snapshot.GM_setValue;
  globalThis.GM_deleteValue = snapshot.GM_deleteValue;
  globalThis.GM_xmlhttpRequest = snapshot.GM_xmlhttpRequest;
  globalThis.fetch = snapshot.fetch;
  globalThis.btoa = snapshot.btoa;
  globalThis.atob = snapshot.atob;
  globalThis.indexedDB = snapshot.indexedDB;
  try {
    globalThis.crypto = snapshot.crypto;
  } catch {
    try {
      Object.defineProperty(globalThis, 'crypto', {
        configurable: true,
        value: snapshot.crypto
      });
    } catch {
      // ignore
    }
  }
  globalThis.CryptoKey = snapshot.CryptoKey;
  globalThis.confirm = snapshot.confirm;
  globalThis.Element = snapshot.Element;
  globalThis.Node = snapshot.Node;
  globalThis.XPathResult = snapshot.XPathResult;
  globalThis.setTimeout = snapshot.setTimeout;
  globalThis.clearTimeout = snapshot.clearTimeout;
  globalThis.setInterval = snapshot.setInterval;
  globalThis.clearInterval = snapshot.clearInterval;
  Date.now = snapshot.DateNow;
  setOrDeleteGlobal('__CC_SUBCAP_TEST__', snapshot.__CC_SUBCAP_TEST__);
  setOrDeleteGlobal('__CC_SUBCAP_TEST_EXPORTS__', snapshot.__CC_SUBCAP_TEST_EXPORTS__);
}

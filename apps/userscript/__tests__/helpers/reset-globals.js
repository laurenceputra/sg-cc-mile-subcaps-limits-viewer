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
    CryptoKey: globalThis.CryptoKey,
    confirm: globalThis.confirm,
    Element: globalThis.Element,
    Node: globalThis.Node,
    XPathResult: globalThis.XPathResult
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
  globalThis.CryptoKey = snapshot.CryptoKey;
  globalThis.confirm = snapshot.confirm;
  globalThis.Element = snapshot.Element;
  globalThis.Node = snapshot.Node;
  globalThis.XPathResult = snapshot.XPathResult;
}

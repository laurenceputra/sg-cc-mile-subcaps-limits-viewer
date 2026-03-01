// targets: main orchestration branches (profile/card lookup, overlay without rows).
import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { loadExports } from './helpers/load-userscript-exports.js';
import { createFakeTimers } from './helpers/fake-timers.js';
import { snapshotGlobals, restoreGlobals } from './helpers/reset-globals.js';

const exports = await loadExports();
const globalsSnapshot = snapshotGlobals();

afterEach(() => {
  restoreGlobals(globalsSnapshot);
});

function buildDocument() {
  return {
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
}

async function waitForAsyncTimers(timers) {
  await timers.runAllAsync();
}

describe('main flow', () => {
  it('covers early exit and missing card name', async () => {
    const cases = [
      {
        location: {
          origin: 'https://example.com',
          hostname: 'example.com',
          href: 'https://example.com/path',
          pathname: '/path'
        }
      },
      {
        location: {
          origin: 'https://pib.uob.com.sg',
          hostname: 'pib.uob.com.sg',
          href: 'https://pib.uob.com.sg/PIBCust/2FA/processSubmit.do',
          pathname: '/PIBCust/2FA/processSubmit.do'
        }
      }
    ];

    for (const testCase of cases) {
      globalThis.window = {
        location: testCase.location,
        localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
        setTimeout: () => 0,
        clearTimeout: () => {},
        setInterval: () => {},
        clearInterval: () => {},
        getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' })
      };
      const timers = createFakeTimers();
      timers.bindToWindow(globalThis.window);
      globalThis.document = buildDocument();
      globalThis.localStorage = globalThis.window.localStorage;

      let buttonRemoved = false;
      let overlayRemoved = false;
      globalThis.document.getElementById = (id) => {
        if (id === 'cc-subcap-btn') {
          return { remove: () => { buttonRemoved = true; } };
        }
        if (id === 'cc-subcap-overlay') {
          return { remove: () => { overlayRemoved = true; } };
        }
        return null;
      };

      const mainPromise = exports.main();
      await waitForAsyncTimers(timers);
      await mainPromise;
      assert.equal(buttonRemoved, true);
      assert.equal(overlayRemoved, true);
      timers.unbindFromWindow();
    }
  });

  it('creates overlay when allowOverlayWithoutRows is true', async () => {
    globalThis.window = {
      location: {
        origin: 'https://cib.maybank2u.com.sg',
        hostname: 'cib.maybank2u.com.sg',
        href: 'https://cib.maybank2u.com.sg/m2u/accounts/cards',
        pathname: '/m2u/accounts/cards'
      },
      localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
      setTimeout: () => 0,
      clearTimeout: () => {},
      setInterval: () => {},
      clearInterval: () => {},
      getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' })
    };
    const timers = createFakeTimers();
    timers.bindToWindow(globalThis.window);

    const overlayNodes = [];
    const doc = buildDocument();
    doc.body.appendChild = (node) => { overlayNodes.push(node); return node; };
    doc.evaluate = (xpath) => {
      if (xpath.includes('xl rewards card')) {
        const node = new globalThis.Element();
        node.textContent = 'XL Rewards Card';
        node.innerText = 'XL Rewards Card';
        node.isConnected = true;
        node.getBoundingClientRect = () => ({ width: 10, height: 10 });
        return { singleNodeValue: node };
      }
      return { singleNodeValue: null };
    };
    globalThis.document = doc;
    globalThis.localStorage = globalThis.window.localStorage;
    globalThis.Element = class {};
    globalThis.MutationObserver = class { observe() {} disconnect() {} };
    globalThis.getComputedStyle = globalThis.window.getComputedStyle;

    const mainPromise = exports.main();
    await waitForAsyncTimers(timers);
    await mainPromise;
    assert.equal(overlayNodes.length, 1, 'should append exactly 1 overlay node to body');
    timers.unbindFromWindow();
  });
});

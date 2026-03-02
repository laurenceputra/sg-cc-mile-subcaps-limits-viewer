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

globalThis.XPathResult = { FIRST_ORDERED_NODE_TYPE: 9 };

function makeClassList() {
  const set = new Set();
  return {
    add: (...names) => names.forEach((name) => set.add(name)),
    remove: (...names) => names.forEach((name) => set.delete(name)),
    contains: (name) => set.has(name),
    toggle: (name, force) => {
      if (typeof force === 'boolean') {
        if (force) set.add(name);
        else set.delete(name);
        return force;
      }
      if (set.has(name)) {
        set.delete(name);
        return false;
      }
      set.add(name);
      return true;
    }
  };
}

function makeElement(doc) {
  const node = {
    _id: '',
    children: [],
    classList: makeClassList(),
    style: {},
    textContent: '',
    innerHTML: '',
    _events: {},
    _queryMap: new Map(),
    appendChild(child) {
      this.children.push(child);
      if (doc) doc._register(child);
      return child;
    },
    addEventListener(event, handler) {
      this._events[event] = handler;
    },
    remove() {
      this._removed = true;
    },
    replaceWith(node) {
      this._replaced = true;
      if (doc) doc._register(node);
    },
    setAttribute(name, value) {
      if (name === 'id') {
        this.id = value;
      }
    },
    removeAttribute() {},
    querySelector(selector) {
      if (!this._queryMap.has(selector)) {
        const element = makeElement(doc);
        element.addEventListener = () => {};
        this._queryMap.set(selector, element);
      }
      return this._queryMap.get(selector);
    },
    querySelectorAll() {
      return [];
    }
  };
  Object.defineProperty(node, 'id', {
    get() { return this._id; },
    set(value) {
      this._id = value;
      if (doc) doc._register(this);
    }
  });
  return node;
}

function makeDocument() {
  const byId = new Map();
  const doc = {
    _register(node) {
      if (node && node.id) {
        byId.set(node.id, node);
      }
    },
    createElement: () => makeElement(doc),
    getElementById: (id) => byId.get(id) || null,
    documentElement: null,
    head: null,
    body: null,
    evaluate: () => ({ singleNodeValue: null })
  };
  doc.documentElement = makeElement(doc);
  doc.head = makeElement(doc);
  doc.body = makeElement(doc);
  return doc;
}

function makeRow(cellCount) {
  return {
    querySelectorAll: () => new Array(cellCount).fill({
      textContent: '',
      innerText: '',
      querySelector: () => null,
      querySelectorAll: () => []
    })
  };
}

function makeTbody(rowCount, cellCount) {
  return {
    querySelectorAll: () => new Array(rowCount).fill(0).map(() => makeRow(cellCount))
  };
}

async function waitForAsyncTimers(timers) {
  await timers.runAllAsync();
}

describe('main flow extended', () => {
  it('runs main on UOB profile and builds overlay', async () => {
    const doc = makeDocument();
    globalThis.document = doc;
    globalThis.Element = class {};
    globalThis.MutationObserver = class { observe() {} disconnect() {} };
    globalThis.window = {
      location: {
        origin: 'https://pib.uob.com.sg',
        hostname: 'pib.uob.com.sg',
        href: 'https://pib.uob.com.sg/PIBCust/2FA/processSubmit.do',
        pathname: '/PIBCust/2FA/processSubmit.do'
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
    globalThis.localStorage = globalThis.window.localStorage;
    globalThis.getComputedStyle = globalThis.window.getComputedStyle;

    const cardNode = new globalThis.Element();
    cardNode.textContent = "LADY'S SOLITAIRE CARD";
    cardNode.innerText = "LADY'S SOLITAIRE CARD";
    cardNode.isConnected = true;
    cardNode.getBoundingClientRect = () => ({ width: 10, height: 10 });
    const tbody = makeTbody(2, 4);
    const tbodyNode = new globalThis.Element();
    tbodyNode.querySelectorAll = () => new Array(2).fill(0).map(() => makeRow(4));
    doc.evaluate = (xpath) => {
      if (String(xpath).includes('h3')) {
        return { singleNodeValue: cardNode };
      }
      if (String(xpath).includes('table/tbody')) {
        return { singleNodeValue: tbodyNode };
      }
      return { singleNodeValue: null };
    };

    const mainPromise = exports.main();
    await waitForAsyncTimers(timers);
    await mainPromise;
    const button = doc.getElementById('cc-subcap-btn');
    assert.notEqual(button, null, 'cc-subcap-btn should be created after UOB main flow');
    timers.unbindFromWindow();
  });

  it('runs main on Maybank profile with allowOverlayWithoutRows', async () => {
    const doc = makeDocument();
    globalThis.document = doc;
    globalThis.Element = class {};
    globalThis.MutationObserver = class { observe() {} disconnect() {} };
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
    globalThis.localStorage = globalThis.window.localStorage;
    globalThis.getComputedStyle = globalThis.window.getComputedStyle;

    const cardNode = new globalThis.Element();
    cardNode.textContent = 'XL Rewards Card';
    cardNode.innerText = 'XL Rewards Card';
    cardNode.isConnected = true;
    cardNode.getBoundingClientRect = () => ({ width: 10, height: 10 });
    const tbodyNode = new globalThis.Element();
    tbodyNode.querySelectorAll = () => new Array(1).fill(0).map(() => makeRow(3));
    doc.evaluate = (xpath) => {
      const lower = String(xpath).toLowerCase();
      if (lower.includes('xl rewards card')) {
        return { singleNodeValue: cardNode };
      }
      if (lower.includes('tbody')) {
        return { singleNodeValue: tbodyNode };
      }
      return { singleNodeValue: null };
    };

    const mainPromise = exports.main();
    await waitForAsyncTimers(timers);
    await mainPromise;
    const button = doc.getElementById('cc-subcap-btn');
    assert.notEqual(button, null, 'cc-subcap-btn should be created after Maybank main flow');
    timers.unbindFromWindow();
  });
});

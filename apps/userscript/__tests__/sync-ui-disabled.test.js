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

function makeClassList() {
  const set = new Set();
  return {
    add: (...names) => names.forEach((name) => set.add(name)),
    contains: (name) => set.has(name)
  };
}

function makeElement(tag = 'div') {
  return {
    tagName: tag,
    id: '',
    innerHTML: '',
    textContent: '',
    _events: {},
    classList: makeClassList(),
    appendChild: () => {},
    addEventListener: function (event, handler) { this._events[event] = handler; },
    querySelector: () => null,
    querySelectorAll: () => [],
    style: {}
  };
}

describe('sync UI disabled state', () => {
  it('createSyncTab renders disabled UI and opens setup dialog', () => {
    const created = [];
    const overlayNodes = [];
    const doc = {
      body: { appendChild: (node) => { overlayNodes.push(node); return node; } },
      createElement: (tag) => {
        const el = makeElement(tag);
        created.push(el);
        return el;
      },
      getElementById: () => null,
      head: { appendChild: () => {} }
    };
    globalThis.document = doc;
    globalThis.window = { setTimeout: () => 0, clearTimeout: () => {} };
    const timers = createFakeTimers();
    timers.bindToWindow(globalThis.window);

    const syncManager = {
      isEnabled: () => false,
      config: {}
    };

    let setupCalled = false;
    const originalCreateElement = globalThis.document.createElement;
    const setupButton = makeElement('button');
    setupButton.addEventListener = (event, handler) => {
      setupButton._events = setupButton._events || {};
      setupButton._events[event] = handler;
    };
    const dialogElements = {
      '#setup-sync-btn': setupButton,
      '#sync-setup-status': makeElement('div'),
      '#sync-server-url': makeElement('input'),
      '#sync-email': makeElement('input'),
      '#sync-passphrase': makeElement('input'),
      '#sync-remember-unlock-setup': { checked: false },
      '#sync-setup-cancel': makeElement('button'),
      '#sync-setup-save': makeElement('button')
    };
    globalThis.document.createElement = (tag) => {
      const element = originalCreateElement(tag);
      if (tag === 'div') {
        element.querySelector = (selector) => dialogElements[selector] || null;
      }
      return element;
    };

    const onSyncStateChanged = () => {};
    const container = exports.createSyncTab(syncManager, 'Card', {}, [], { border: '#000' }, onSyncStateChanged);
    assert.match(container.innerHTML, /Setup Sync/, 'disabled sync tab should show Setup Sync');

    if (setupButton._events?.click) {
      setupButton._events.click();
    }
    assert.equal(overlayNodes.length, 1);
    assert.equal(overlayNodes[0].classList?.contains?.('cc-subcap-dialog-backdrop'), true);
    globalThis.document.createElement = originalCreateElement;
    timers.unbindFromWindow();
  });
});

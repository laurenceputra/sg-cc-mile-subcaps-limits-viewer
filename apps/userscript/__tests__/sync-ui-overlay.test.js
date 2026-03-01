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

function makeElement(tag, doc) {
  const element = {
    tagName: String(tag || 'div').toUpperCase(),
    id: '',
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
    setAttribute(name, value) {
      if (name === 'id') {
        this.id = value;
        if (doc) doc._register(this);
      }
    },
    removeAttribute() {},
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
    querySelector(selector) {
      if (!this._queryMap.has(selector)) {
        this._queryMap.set(selector, createQueryElement(selector, doc));
      }
      return this._queryMap.get(selector);
    },
    querySelectorAll() {
      return [];
    }
  };
  return element;
}

function makeInput(doc) {
  const element = makeElement('input', doc);
  element.value = '';
  element.checked = false;
  return element;
}

function makeButton(doc) {
  const element = makeElement('button', doc);
  element.type = 'button';
  element.click = async () => {
    if (element._events.click) {
      return element._events.click();
    }
    return undefined;
  };
  return element;
}

function createQueryElement(selector, doc) {
  const inputSelectors = new Set([
    '#sync-unlock-passphrase',
    '#sync-server-url',
    '#sync-email',
    '#sync-passphrase'
  ]);
  const checkboxSelectors = new Set([
    '#sync-remember-unlock',
    '#sync-remember-unlock-setup'
  ]);
  const buttonSelectors = new Set([
    '#setup-sync-btn',
    '#unlock-sync-btn',
    '#forget-sync-unlock-btn',
    '#sync-now-btn',
    '#disable-sync-btn',
    '#sync-setup-save',
    '#sync-setup-cancel'
  ]);

  if (inputSelectors.has(selector)) {
    return makeInput(doc);
  }
  if (checkboxSelectors.has(selector)) {
    const input = makeInput(doc);
    input.type = 'checkbox';
    return input;
  }
  if (buttonSelectors.has(selector)) {
    return makeButton(doc);
  }
  return makeElement('div', doc);
}

function makeDocument() {
  const byId = new Map();
  const doc = {
    _register(node) {
      if (node && node.id) {
        byId.set(node.id, node);
      }
    },
    createElement: (tag) => makeElement(tag, doc),
    getElementById: (id) => byId.get(id) || null,
    documentElement: {},
    head: null,
    body: null,
    evaluate: () => ({ singleNodeValue: null })
  };
  doc.head = makeElement('head', doc);
  doc.body = makeElement('body', doc);
  return doc;
}

function makeTheme() {
  return {
    border: '#ccc',
    surface: '#fff',
    accent: '#000',
    accentSoft: '#eee',
    accentText: '#000',
    accentShadow: 'none',
    warning: '#f90',
    warningSoft: '#fff7e6',
    errorBorder: '#f00',
    errorSoft: '#fee',
    errorText: '#f00',
    successBorder: '#0f0',
    successSoft: '#efe',
    success: '#0f0',
    panel: '#f8f8f8',
    text: '#111',
    muted: '#666',
    overlay: 'rgba(0,0,0,0.1)',
    shadow: 'none'
  };
}

describe('sync ui + overlay', () => {
  it('showSyncSetupDialog validates fields and completes setup', async () => {
    const doc = makeDocument();
    globalThis.document = doc;
    globalThis.window = { setTimeout: () => 0, clearTimeout: () => {} };
    const timers = createFakeTimers();
    timers.bindToWindow(globalThis.window);

    let setupCalls = 0;
    let syncStateChanged = false;
    const manager = {
      setupSync: async () => {
        setupCalls += 1;
        return { success: true };
      }
    };

    exports.showSyncSetupDialog(manager, makeTheme(), () => { syncStateChanged = true; });
    const overlay = doc.body.children[0];
    const status = overlay.querySelector('#sync-setup-status');
    const saveButton = overlay.querySelector('#sync-setup-save');
    const serverInput = overlay.querySelector('#sync-server-url');
    const emailInput = overlay.querySelector('#sync-email');
    const passInput = overlay.querySelector('#sync-passphrase');

    await saveButton.click();
    assert.equal(status.textContent, 'All fields are required.');

    serverInput.value = 'ftp://example.com';
    emailInput.value = 'user@example.com';
    passInput.value = 'secret';
    await saveButton.click();
    assert.match(status.textContent, /HTTP or HTTPS/, 'should show protocol validation error');

    serverInput.value = 'https://example.com';
    await saveButton.click();
    assert.equal(setupCalls, 1);
    assert.equal(syncStateChanged, false, 'dialog close callback should be delayed');
    assert.equal(overlay._removed, undefined, 'dialog should remain open before timeout advances');

    timers.advanceBy(500);
    await Promise.resolve();
    assert.equal(syncStateChanged, true);
    assert.equal(overlay._removed, true);
    timers.unbindFromWindow();
  });

  it('createSyncTab handles unlock, sync, forget, and disable', async () => {
    const doc = makeDocument();
    globalThis.document = doc;
    globalThis.window = { setTimeout: () => 0, clearTimeout: () => {} };
    const timers = createFakeTimers();
    timers.bindToWindow(globalThis.window);
    globalThis.confirm = () => true;

    let disabled = false;
    let forgot = false;
    let syncCalls = 0;
    const manager = {
      config: { email: 'user@example.com', lastSync: 0, tier: 'free', rememberUnlock: false },
      isEnabled: () => true,
      isUnlocked: () => false,
      hasRememberedUnlockCache: () => true,
      unlockSync: async () => ({ success: true, warning: 'cached' }),
      tryUnlockFromRememberedCache: async () => false,
      sync: async () => { syncCalls += 1; return { success: true }; },
      forgetRememberedUnlock: async () => { forgot = true; return { success: true }; },
      disableSync: () => { disabled = true; }
    };

    const container = exports.createSyncTab(manager, 'XL Rewards Card', {}, [], makeTheme(), () => {});
    const status = container.querySelector('#sync-status');
    const unlockButton = container.querySelector('#unlock-sync-btn');
    const passphraseInput = container.querySelector('#sync-unlock-passphrase');
    const syncNowButton = container.querySelector('#sync-now-btn');
    const forgetButton = container.querySelector('#forget-sync-unlock-btn');
    const disableButton = container.querySelector('#disable-sync-btn');

    passphraseInput.value = '';
    await unlockButton.click();
    assert.match(status.textContent, /Password is required/, 'should show password required error');

    passphraseInput.value = 'secret';
    await unlockButton.click();
    assert.match(status.textContent, /Sync unlocked/, 'should confirm sync unlocked');

    await syncNowButton.click();
    assert.equal(syncCalls, 1);
    assert.equal(status.textContent, 'Synced successfully.', 'status should not clear before timeout');

    timers.advanceBy(2999);
    assert.equal(status.textContent, 'Synced successfully.');
    timers.advanceBy(1);
    assert.equal(status.textContent, '');

    await forgetButton.click();
    assert.equal(forgot, true);
    assert.equal(status.textContent, 'Saved unlock removed for this device.');

    await disableButton.click();
    assert.equal(disabled, true);
    timers.unbindFromWindow();
  });

  it('createOverlay builds UI and switchTab toggles content', () => {
    const doc = makeDocument();
    globalThis.document = doc;
    globalThis.window = {
      location: { href: 'https://pib.uob.com.sg/PIBCust/2FA/processSubmit.do' },
      setTimeout: () => 0,
      clearTimeout: () => {},
      getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' })
    };
    const timers = createFakeTimers();
    timers.bindToWindow(globalThis.window);
    globalThis.GM_addStyle = () => {};

    const cardName = "LADY'S SOLITAIRE CARD";
    const cardConfig = exports.CARD_CONFIGS[cardName];
    const cardSettings = { selectedCategories: ['Dining', 'Travel'], defaultCategory: 'Others', merchantMap: {}, transactions: {} };
    const data = exports.buildFallbackData(cardName, cardSettings);

    exports.createOverlay(
      data,
      { cards: { [cardName]: cardSettings } },
      [],
      cardName,
      cardConfig,
      cardSettings,
      () => {},
      true,
      exports.EMBEDDED_CAP_POLICY
    );

    const overlay = doc.getElementById('cc-subcap-overlay');
    assert.notEqual(overlay, null, 'overlay should be created in DOM');

    exports.switchTab('sync');
    const syncContent = doc.getElementById('cc-subcap-sync');
    assert.equal(syncContent.classList.contains('cc-subcap-hidden'), false);
    timers.unbindFromWindow();
  });

});

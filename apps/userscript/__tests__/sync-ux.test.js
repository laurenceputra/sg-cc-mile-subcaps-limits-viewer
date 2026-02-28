// targets: sync UI flows + status message coverage.
import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { loadExports } from './helpers/load-userscript-exports.js';
import { snapshotGlobals, restoreGlobals } from './helpers/reset-globals.js';

const exports = await loadExports();
const globalsSnapshot = snapshotGlobals();

afterEach(() => {
  restoreGlobals(globalsSnapshot);
});

function makeElement(tag = 'div') {
  const children = [];
  return {
    tagName: tag,
    children,
    id: '',
    value: '',
    textContent: '',
    innerHTML: '',
    style: {},
    disabled: false,
    type: '',
    classList: {
      _set: new Set(),
      add: function (...values) { values.forEach((val) => this._set.add(val)); },
      remove: function (...values) { values.forEach((val) => this._set.delete(val)); },
      contains: function (val) { return this._set.has(val); },
      toggle: function (val, force) {
        if (force === undefined) {
          if (this._set.has(val)) { this._set.delete(val); return false; }
          this._set.add(val); return true;
        }
        if (force) { this._set.add(val); } else { this._set.delete(val); }
        return force;
      }
    },
    attributes: {},
    appendChild: function (node) { children.push(node); return node; },
    replaceWith: () => {},
    remove: () => {},
    setAttribute: function (key, value) { this.attributes[key] = String(value); },
    removeAttribute: function (key) { delete this.attributes[key]; },
    addEventListener: function (_event, handler) { this._handler = handler; },
    querySelector: function (selector) { return this._queryMap?.[selector] || null; },
    querySelectorAll: function () { return []; }
  };
}

function stubDocument() {
  const elementsById = new Map();
  const overlayNodes = [];
  const body = makeElement('body');
  body.appendChild = (node) => { overlayNodes.push(node); return node; };

  const documentStub = {
    head: { appendChild: () => {} },
    body,
    documentElement: {},
    createElement: (tag) => makeElement(tag),
    getElementById: (id) => elementsById.get(id) || null,
    evaluate: () => ({ singleNodeValue: null })
  };

  return { documentStub, elementsById, overlayNodes };
}

describe('sync UI flows', () => {
  it('setStatusMessage clears and sets variants', () => {
    const status = makeElement('div');
    status.classList.add('cc-subcap-hidden');
    exports.setStatusMessage(status, 'Hello', 'warning');
    assert.equal(status.textContent, 'Hello');
    assert.equal(status.attributes['data-variant'], 'warning');
    assert.equal(status.classList.contains('cc-subcap-hidden'), false);

    exports.setStatusMessage(status, '');
    assert.equal(status.textContent, '');
    assert.equal(status.attributes['data-variant'], undefined);
    assert.equal(status.classList.contains('cc-subcap-hidden'), true);
  });

  it('createSyncTab shows setup UI when disabled', () => {
    const { documentStub } = stubDocument();
    globalThis.document = documentStub;

    const container = makeElement('div');
    container._queryMap = {
      '#setup-sync-btn': makeElement('button')
    };
    documentStub.createElement = () => container;

    const syncManager = {
      isEnabled: () => false
    };

    const created = exports.createSyncTab(syncManager, 'Card', {}, [], {}, () => {});
    assert.equal(created.id, 'cc-subcap-sync');
    const setupButton = created.querySelector('#setup-sync-btn');
    assert.notEqual(setupButton, null, 'disabled sync tab should have a setup button');
  });

  it('createSyncTab unlock flow and sync now', async () => {
    const { documentStub } = stubDocument();
    globalThis.document = documentStub;
    globalThis.window = { setTimeout: (fn) => fn() };

    const statusDiv = makeElement('div');
    const passphraseInput = makeElement('input');
    passphraseInput.value = 'secret';
    const rememberInput = { checked: true };
    const unlockButton = makeElement('button');
    const syncNowButton = makeElement('button');
    const forgetButton = makeElement('button');
    const disableButton = makeElement('button');

    const container = makeElement('div');
    container._queryMap = {
      '#sync-status': statusDiv,
      '#sync-unlock-passphrase': passphraseInput,
      '#sync-remember-unlock': rememberInput,
      '#unlock-sync-btn': unlockButton,
      '#sync-now-btn': syncNowButton,
      '#forget-sync-unlock-btn': forgetButton,
      '#disable-sync-btn': disableButton
    };
    documentStub.createElement = () => container;

    let unlocked = false;
    let synced = false;
    let forgetCalled = false;
    let disabled = false;

    const syncManager = {
      isEnabled: () => true,
      isUnlocked: () => unlocked,
      hasRememberedUnlockCache: () => true,
      unlockSync: async () => { unlocked = true; return { success: true }; },
      tryUnlockFromRememberedCache: async () => false,
      forgetRememberedUnlock: async () => { forgetCalled = true; return { success: true }; },
      sync: async () => { synced = true; return { success: true }; },
      disableSync: () => { disabled = true; },
      config: { email: 'a@example.com', lastSync: 0, tier: 'free' }
    };

    const created = exports.createSyncTab(syncManager, 'Card', {}, [], {}, () => {});
    await unlockButton._handler();
    await syncNowButton._handler();
    await forgetButton._handler();
    globalThis.confirm = () => true;
    disableButton._handler();

    assert.equal(created.id, 'cc-subcap-sync');
    assert.equal(unlocked, true);
    assert.equal(synced, true);
    assert.equal(forgetCalled, true);
    assert.equal(disabled, true);
  });

  it('showSyncSetupDialog validates inputs and closes on success', async () => {
    const { documentStub, overlayNodes } = stubDocument();
    globalThis.document = documentStub;
    globalThis.window = { setTimeout: (fn) => fn() };

    const overlay = makeElement('div');
    const statusDiv = makeElement('div');
    const serverUrl = makeElement('input');
    const email = makeElement('input');
    const passphrase = makeElement('input');
    const remember = { checked: true };
    const cancelButton = makeElement('button');
    const saveButton = makeElement('button');

    overlay._queryMap = {
      '#sync-setup-status': statusDiv,
      '#sync-server-url': serverUrl,
      '#sync-email': email,
      '#sync-passphrase': passphrase,
      '#sync-remember-unlock-setup': remember,
      '#sync-setup-cancel': cancelButton,
      '#sync-setup-save': saveButton
    };
    documentStub.createElement = () => overlay;

    let setupCalled = false;
    const syncManager = {
      setupSync: async () => { setupCalled = true; return { success: true }; }
    };

    exports.showSyncSetupDialog(syncManager, { border: '#000' }, () => {});

    serverUrl.value = '';
    email.value = '';
    passphrase.value = '';
    await saveButton._handler();
    assert.equal(statusDiv.textContent, 'All fields are required.');

    serverUrl.value = 'https://example.com';
    email.value = 'a@example.com';
    passphrase.value = 'secret';
    await saveButton._handler();

    assert.equal(setupCalled, true);
    assert.equal(overlayNodes.length, 1, 'should append exactly 1 overlay node');
  });
});
